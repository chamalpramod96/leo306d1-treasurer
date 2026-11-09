/* =========================================================
   core.js — state, persistence, dates, money and calculations
   All data lives in localStorage under STORAGE_KEY.
   ========================================================= */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const STORAGE_KEY = 'leo306d1.treasury.v1';
  /** js/firebase-config.js filled in → data is shared online (js/cloud.js) instead of kept in this browser. */
  const FB = window.LEO_FIREBASE || {};
  const CLOUD = !!(FB.apiKey && FB.projectId);

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const METHODS = ['Bank transfer', 'Cash', 'Cheque', 'Online / card', 'Other'];
  const NOTE_TAGS = {
    general: 'General',
    followup: 'Follow-up',
    payment: 'Payment',
    report: 'Report',
    reminder: 'Reminder',
  };
  /** Follow-ups and reminders can be ticked off; reminders also carry a date. */
  const isTask = (n) => n.tag === 'followup' || n.tag === 'reminder';
  const NOTICE_AUDIENCE = { all: 'All clubs', omega: 'Omega clubs', alpha: 'Alpha clubs' };

  /* ---------- state ---------- */
  function defaultState() {
    return {
      version: 1,
      settings: {
        districtName: 'Leo District 306 D1',
        startYear: 2026,
        treasurerName: '',
        reportDueDay: 10,
        demo: false,
        receiptPrefix: 'LD306D1',                              // receipt numbers look like LD306D1/26-27/0001
        receiptSubtitle: 'Office of the District Treasurer',   // second heading line on the e-receipt
      },
      clubs: [],          // { id, name, type, zone, members, email, phone, logo (small image data URL),
                          //   president, presidentPhone, treasurer, treasurerPhone, asstTreasurer, asstTreasurerPhone }
      notes: [],          // { id, clubId, text, tag, done, remindOn?, createdAt, byId, byName }
      notices: [],        // district notices: { id, title, body, audience:'all'|'omega'|'alpha'|clubId, date, createdAt, byId, byName }
      reports: {},        // { [clubId]: { 'YYYY-MM': { status:'submitted'|'na', date, time, remark } } }
      paymentHeads: [],   // payment types the district collects
      payments: [],       // individual payment records (instalments). Receipt details entered with a payment:
                          //   payer, payerPhone, onAccountOf, collectedBy:'DT'|'DAT', collectorName, receiptId
      exemptions: {},     // { 'clubId|headId': true }
      receipts: [],       // e-receipt register — see issueReceipt(). Numbers are never reused; deleted payments
                          //   leave their receipt in the register marked "cancelled".
      receiptSeq: {},     // { [leoStartYear]: last receipt number issued in that Leo year }
    };
  }

  function migrate(s) {
    const d = defaultState();
    if (!s || typeof s !== 'object') return d;
    return {
      ...d,
      ...s,
      settings: { ...d.settings, ...(s.settings || {}) },
      clubs: Array.isArray(s.clubs) ? s.clubs : [],
      notes: Array.isArray(s.notes) ? s.notes : [],
      notices: Array.isArray(s.notices) ? s.notices : [],
      reports: s.reports && typeof s.reports === 'object' ? s.reports : {},
      paymentHeads: Array.isArray(s.paymentHeads) ? s.paymentHeads : [],
      payments: Array.isArray(s.payments) ? s.payments : [],
      exemptions: s.exemptions && typeof s.exemptions === 'object' ? s.exemptions : {},
      receipts: Array.isArray(s.receipts) ? s.receipts : [],
      receiptSeq: s.receiptSeq && typeof s.receiptSeq === 'object' ? s.receiptSeq : {},
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? migrate(JSON.parse(raw)) : defaultState();
    } catch (e) {
      console.error('Could not read saved data', e);
      return defaultState();
    }
  }

  // Shared mode starts empty: the data arrives from Firestore after sign-in
  let state = CLOUD ? defaultState() : load();

  /** Data saved in this browser before Firebase was connected (offered for upload), or null. */
  function savedOnDevice() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  function persist() {
    if (CLOUD) return !!(App.cloud && App.cloud.push && App.cloud.push(state));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error(e);
      App.ui && App.ui.toast('Could not save — browser storage may be full or disabled.', 'error');
      return false;
    }
  }

  /** Apply a mutation, save, and re-render everything. */
  function commit(mutator) {
    mutator(state);
    persist();
    App.refresh && App.refresh();
  }

  function replaceState(next, { save = true } = {}) {
    state = migrate(next);
    if (save) persist();
    App.refresh && App.refresh();
  }

  /* ---------- small utils ---------- */
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISO(new Date());
  const daysIn = (y, m1) => new Date(y, m1, 0).getDate(); // m1 = 1..12

  function parseISO(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function fmtDate(iso, opts) {
    const d = parseISO(iso);
    if (!d || isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  /** '14:05' → '2:05 pm' */
  function fmtTime(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return '';
    let [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  }
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function relTime(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' d ago';
    return fmtDate(toISO(new Date(ts)));
  }

  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function money(n, decimals = true) {
    const v = Number(n) || 0;
    return 'Rs. ' + (decimals ? nf2.format(v) : nf0.format(Math.round(v)));
  }
  function moneyShort(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e6) return 'Rs. ' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (Math.abs(v) >= 1e5) return 'Rs. ' + (v / 1e3).toFixed(0) + 'K';
    return money(v, false);
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  /* ---------- Leo year & report months ---------- */
  function leoYearLabel(y = state.settings.startYear) { return `${y}/${y + 1}`; }

  function leoMonths(y = state.settings.startYear) {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const idx = (6 + i) % 12;          // July = 6
      const yr = y + (6 + i >= 12 ? 1 : 0);
      out.push({ key: `${yr}-${pad(idx + 1)}`, y: yr, m: idx, short: MONTHS[idx].slice(0, 3), label: `${MONTHS[idx]} ${yr}` });
    }
    return out;
  }
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  function nextMonth(key) {
    let [y, m] = key.split('-').map(Number);
    m += 1; if (m > 12) { m = 1; y += 1; }
    return [y, m];
  }
  /** Report for month `key` is due on the configured day of the following month. */
  function reportDueDate(key) {
    const [y, m] = nextMonth(key);
    const day = Math.min(Math.max(1, Number(state.settings.reportDueDay) || 10), daysIn(y, m));
    return `${y}-${pad(m)}-${pad(day)}`;
  }
  function monthEnded(key) {
    const [y, m] = nextMonth(key);
    return todayISO() >= `${y}-${pad(m)}-01`;
  }
  /** Latest month that has ended, clamped to the Leo year. */
  function currentReportMonth() {
    const months = leoMonths();
    const ended = months.filter((m) => monthEnded(m.key));
    return ended.length ? ended[ended.length - 1] : months[0];
  }

  function getReport(clubId, key) {
    return (state.reports[clubId] && state.reports[clubId][key]) || null;
  }

  function reportStatus(clubId, key) {
    const r = getReport(clubId, key);
    const remark = r && r.remark ? r.remark : '';
    const due = reportDueDate(key);
    if (r && r.status === 'na') return { code: 'na', label: 'Not required', icon: 'N/A', remark, due };
    if (r && r.status === 'submitted') {
      const late = !!r.date && r.date > due;
      return { code: late ? 'late' : 'ok', label: late ? 'Submitted late' : 'Submitted', icon: '✓', date: r.date, time: r.time || '', remark, due };
    }
    if (!monthEnded(key)) return { code: 'future', label: 'Month in progress', icon: '·', remark, due };
    if (todayISO() > due) return { code: 'overdue', label: 'Overdue', icon: '!', remark, due };
    return { code: 'pending', label: 'Awaiting (due ' + fmtDate(due, { day: 'numeric', month: 'short' }) + ')', icon: '…', remark, due };
  }

  /* ---------- clubs ---------- */
  const typeLabel = (t) => (t === 'alpha' ? 'Alpha' : 'Omega');
  const clubById = (id) => state.clubs.find((c) => c.id === id);
  function clubsSorted(filterType) {
    return state.clubs
      .filter((c) => !filterType || filterType === 'all' || c.type === filterType)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function notesFor(clubId) {
    return state.notes.filter((n) => n.clubId === clubId).sort((a, b) => b.createdAt - a.createdAt);
  }
  /** District notices that reach this club (all clubs, its type, or the club itself), newest first. */
  function noticesFor(club) {
    return state.notices
      .filter((n) => n.audience === 'all' || n.audience === club.type || n.audience === club.id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  }
  function noticeAudienceLabel(n) {
    if (NOTICE_AUDIENCE[n.audience]) return NOTICE_AUDIENCE[n.audience];
    const c = clubById(n.audience);
    return c ? c.name : 'Removed club';
  }
  /** Open reminders whose date has arrived (or open follow-ups), oldest first. */
  function dueReminders(clubId) {
    const today = todayISO();
    return state.notes
      .filter((n) => n.tag === 'reminder' && !n.done && (!clubId || n.clubId === clubId) && (!n.remindOn || n.remindOn <= today))
      .sort((a, b) => (a.remindOn || '').localeCompare(b.remindOn || ''));
  }
  /** Reports overdue and payments still owed by a club — used for reminders. */
  function clubOutstanding(club) {
    const reports = leoMonths().map((m) => ({ m, st: reportStatus(club.id, m.key) })).filter((x) => x.st.code === 'overdue' || x.st.code === 'pending');
    const payments = state.paymentHeads.map((h) => ({ h, st: paymentStatus(club, h) })).filter((x) => x.st.balance > 0);
    return { reports, payments, balance: payments.reduce((s, x) => s + x.st.balance, 0) };
  }

  /* ---------- payments ---------- */
  const headById = (id) => state.paymentHeads.find((h) => h.id === id);
  const headApplies = (head, club) => head.appliesTo === 'all' || head.appliesTo === club.type;
  function expectedAmount(head, club) {
    const amt = Number(head.amount) || 0;
    return head.amountMode === 'perMember' ? amt * (Number(club.members) || 0) : amt;
  }
  function paymentsFor(clubId, headId) {
    return state.payments
      .filter((p) => p.clubId === clubId && (!headId || p.headId === headId))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  }
  function paidAmount(clubId, headId) {
    return state.payments.reduce((s, p) => (p.clubId === clubId && p.headId === headId ? s + (Number(p.amount) || 0) : s), 0);
  }
  const isExempt = (clubId, headId) => !!state.exemptions[clubId + '|' + headId];

  function paymentStatus(club, head) {
    const paid = paidAmount(club.id, head.id);
    if (!headApplies(head, club)) return { code: 'na', label: 'Not applicable', icon: '—', expected: 0, paid, balance: 0 };
    if (isExempt(club.id, head.id)) return { code: 'exempt', label: 'Exempt', icon: '○', expected: 0, paid, balance: 0 };
    const expected = expectedAmount(head, club);
    const balance = Math.max(0, expected - paid);
    const overdue = !!head.dueDate && todayISO() > head.dueDate;
    if (expected <= 0) {
      if (paid > 0) return { code: 'paid', label: 'Paid', icon: '✓', expected, paid, balance: 0 };
      return { code: 'unset', label: head.amountMode === 'perMember' ? 'Set members' : 'No amount set', icon: '?', expected, paid, balance: 0 };
    }
    if (paid >= expected) return { code: 'paid', label: paid > expected ? 'Paid (extra)' : 'Paid', icon: '✓', expected, paid, balance: 0 };
    if (paid > 0) return { code: 'partial', label: overdue ? 'Partial · overdue' : 'Partial', icon: '◐', expected, paid, balance, overdue };
    if (overdue) return { code: 'overdue', label: 'Overdue', icon: '!', expected, paid, balance, overdue };
    return { code: 'unpaid', label: 'Unpaid', icon: '○', expected, paid, balance };
  }

  function headTotals(head) {
    let expected = 0, collected = 0, settled = 0, applicable = 0, outstanding = 0;
    state.clubs.forEach((c) => {
      const st = paymentStatus(c, head);
      if (st.code === 'na') return;
      applicable++;
      expected += st.expected;
      outstanding += st.balance;
      if (st.code === 'paid' || st.code === 'exempt') settled++;
    });
    collected = state.payments.reduce((s, p) => (p.headId === head.id ? s + (Number(p.amount) || 0) : s), 0);
    return { expected, collected, settled, applicable, outstanding };
  }

  function clubPaymentSummary(club) {
    let expected = 0, paid = 0, balance = 0, settled = 0, applicable = 0, overdue = 0;
    state.paymentHeads.forEach((h) => {
      const st = paymentStatus(club, h);
      if (st.code === 'na') return;
      applicable++;
      expected += st.expected;
      paid += st.paid;
      balance += st.balance;
      if (st.code === 'paid' || st.code === 'exempt') settled++;
      if (st.code === 'overdue' || (st.code === 'partial' && st.overdue)) overdue++;
    });
    return { expected, paid, balance, settled, applicable, overdue };
  }

  function overallTotals() {
    let expected = 0, outstanding = 0, clubsOwing = 0;
    state.paymentHeads.forEach((h) => { const t = headTotals(h); expected += t.expected; outstanding += t.outstanding; });
    state.clubs.forEach((c) => { if (clubPaymentSummary(c).balance > 0) clubsOwing++; });
    const collected = state.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { expected, collected, outstanding, clubsOwing };
  }

  /* ---------- CSV ---------- */
  function toCSV(rows) {
    return rows.map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
  }
  function download(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  /* ---------- e-receipts ---------- */
  const RECEIPT_BY = { DT: 'District Treasurer', DAT: 'District Assistant Treasurer' };

  const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function intWords(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + intWords(n % 100) : '');
    for (const [v, w] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]) {
      if (n >= v) return intWords(Math.floor(n / v)) + ' ' + w + (n % v ? ' ' + intWords(n % v) : '');
    }
    return String(n);
  }
  /** 4850.5 → "Rupees Four Thousand Eight Hundred Fifty and Cents Fifty Only" */
  function amountInWords(amount) {
    const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
    const rs = Math.floor(cents / 100), c = cents % 100;
    return 'Rupees ' + intWords(rs) + (c ? ' and Cents ' + intWords(c) : '') + ' Only';
  }

  /** Leo year (July–June) a date falls in, as its starting year. */
  function leoYearOf(iso) {
    const d = parseISO(iso) || new Date();
    return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  }
  /** LD306D1 · 2026 · 7 → "LD306D1/26-27/0007" */
  function receiptNo(prefix, year, seq) {
    return `${prefix ? prefix + '/' : ''}${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${String(seq).padStart(4, '0')}`;
  }
  /** Highest number used in a Leo year: the saved counter, or the register if it is higher. */
  function lastReceiptSeq(s, year) {
    return s.receipts.reduce((m, r) => (r.year === year ? Math.max(m, r.seq || 0) : m), Number(s.receiptSeq[year]) || 0);
  }
  /** What is printed on the receipt, copied from the payment so later edits to clubs or types don't change it. */
  function receiptFields(s, p) {
    const c = s.clubs.find((x) => x.id === p.clubId), h = s.paymentHeads.find((x) => x.id === p.headId);
    const amount = Math.round((Number(p.amount) || 0) * 100) / 100;
    return {
      paymentId: p.id, date: p.date, clubId: p.clubId, clubName: c ? c.name : '', clubType: c ? c.type : '',
      headId: p.headId, headName: h ? h.name : '',
      recipient: p.payer || (c ? c.name : ''), contact: p.payerPhone || '',
      onAccountOf: p.onAccountOf || (h ? h.name : ''),
      amount, amountWords: amountInWords(amount),
      method: p.method || '', reference: p.reference || '',
      collectedBy: p.collectedBy === 'DAT' ? 'DAT' : 'DT', collectorName: p.collectorName || '',
    };
  }
  /** Issue the next numbered receipt for a payment (call inside commit).
      `seq` is a number reserved with reserveReceiptSeq(); without it the next local number is used. */
  function issueReceipt(s, p, by = {}, issuedAt = Date.now(), seq = 0) {
    const year = leoYearOf(p.date);
    seq = seq > 0 ? seq : lastReceiptSeq(s, year) + 1;
    s.receiptSeq[year] = Math.max(Number(s.receiptSeq[year]) || 0, seq);
    const r = {
      id: uid('rcpt'), no: receiptNo(s.settings.receiptPrefix, year, seq), seq, year, status: 'issued',
      issuedAt, issuedById: by.byId || '', issuedByName: by.byName || '', ...receiptFields(s, p),
    };
    s.receipts.push(r);
    p.receiptId = r.id;
    return r;
  }
  /** Payment edited → same receipt number, updated details, marked as revised. */
  function reviseReceipt(s, p, by = {}) {
    const r = s.receipts.find((x) => x.id === p.receiptId);
    if (!r) return null;
    Object.assign(r, receiptFields(s, p), { revisedAt: Date.now(), revisedByName: by.byName || '' });
    return r;
  }
  /** Payments removed → their receipts stay in the register as cancelled, so no number disappears. */
  function cancelReceipts(s, paymentIds, reason, by = {}) {
    const ids = new Set(paymentIds);
    s.receipts.forEach((r) => {
      if (ids.has(r.paymentId) && r.status !== 'cancelled') {
        Object.assign(r, { status: 'cancelled', cancelledAt: Date.now(), cancelledByName: by.byName || '', cancelReason: reason });
      }
    });
  }
  /** Undo of a delete: the payment is back, so its receipt is valid again. */
  function reinstateReceipts(s, paymentIds) {
    const ids = new Set(paymentIds);
    s.receipts.forEach((r) => {
      if (ids.has(r.paymentId) && r.status === 'cancelled') {
        r.status = 'issued';
        delete r.cancelledAt; delete r.cancelledByName; delete r.cancelReason;
      }
    });
  }
  /** Numbers for `count` new receipts in a Leo year, before they are issued.
      Shared database: reserved on the server, so two officers' devices never get the same number.
      Resolves to the first number, null (this device only: number locally, inside commit),
      or false (shared, but the server can't be reached — save the payment without a receipt). */
  async function reserveReceiptSeq(year, count = 1) {
    if (!CLOUD) return null;
    if (!App.cloud || !App.cloud.reserveReceipts) return false;
    return App.cloud.reserveReceipts(year, count, lastReceiptSeq(state, year));
  }
  const receiptById = (id) => state.receipts.find((r) => r.id === id);
  const collectorLabel = (r) => [r.collectorName, RECEIPT_BY[r.collectedBy] ? `${RECEIPT_BY[r.collectedBy]} (${r.collectedBy})` : ''].filter(Boolean).join(' — ');

  /* ---------- sample data (clearly marked as demo) ---------- */
  function demoState() {
    const s = defaultState();
    s.settings.demo = true;
    s.settings.startYear = 2026;
    s.settings.treasurerName = '';
    // Sample contacts use the reserved example.com domain and 0700-000-xxx numbers
    let tel = 100;
    const ph = () => `070 000 0${tel++}`;
    const mk = (name, type, zone, members, president, treasurer, asstTreasurer) => ({
      id: uid('club'), name, type, zone, members,
      president, presidentPhone: ph(), treasurer, treasurerPhone: ph(), asstTreasurer, asstTreasurerPhone: asstTreasurer ? ph() : '',
      phone: '', email: name.replace(/^Leo Club of /, '').toLowerCase().replace(/[^a-z]+/g, '') + '.leos@example.com', logo: '', createdAt: Date.now(),
    });
    s.clubs = [
      mk('Leo Club of Riverside', 'omega', 'Zone 1', 32, 'Leo A. Perera', 'Leo N. Silva', 'Leo O. Mendis'),
      mk('Leo Club of Hillcrest', 'omega', 'Zone 1', 27, 'Leo K. Fernando', 'Leo D. Jayasinghe', 'Leo U. Cooray'),
      mk('Leo Club of Lakeview', 'omega', 'Zone 2', 41, 'Leo S. Wickramasinghe', 'Leo P. Gunawardena', 'Leo W. Peiris'),
      mk('Leo Club of Seaside', 'omega', 'Zone 2', 22, 'Leo R. de Alwis', 'Leo M. Rajapaksha', ''),
      mk('Leo Club of Greenfield', 'omega', 'Zone 3', 35, 'Leo T. Herath', 'Leo I. Bandara', 'Leo A. Kumara'),
      mk('Leo Club of Kingswood', 'omega', 'Zone 3', 19, 'Leo H. Senanayake', 'Leo V. Karunaratne', ''),
      mk('Leo Club of Sunrise College', 'alpha', 'Zone 1', 24, 'Leo Y. Dissanayake', 'Leo L. Ekanayake', 'Leo S. Nanayakkara'),
      mk('Leo Club of Meadow Vale School', 'alpha', 'Zone 2', 18, 'Leo E. Ranasinghe', 'Leo G. Abeysekara', ''),
      mk('Leo Club of Northgate Academy', 'alpha', 'Zone 3', 21, 'Leo B. Samarasinghe', 'Leo C. Weerasinghe', 'Leo D. Wijesinghe'),
      mk('Leo Club of Oakridge School', 'alpha', 'Zone 3', 16, 'Leo F. Pathirana', 'Leo J. Liyanage', ''),
    ];
    const y = s.settings.startYear;
    const head = (name, appliesTo, amountMode, amount, dueDate, description) => ({ id: uid('head'), name, appliesTo, amountMode, amount, dueDate, description, createdAt: Date.now() });
    s.paymentHeads = [
      head('District Dues (per member)', 'all', 'perMember', 150, `${y}-09-30`, 'Annual district per-capita dues for the Leo year.'),
      head('District Council Meeting Fee', 'all', 'fixed', 2500, `${y}-10-15`, 'First District Council Meeting participation fee.'),
      head('District Convention Registration', 'omega', 'fixed', 10000, `${y + 1}-03-31`, 'Club registration for the District Convention.'),
      head('District Service Project Fund', 'all', 'fixed', 5000, `${y}-12-31`, 'Contribution to the district signature service project.'),
    ];

    // Seeded pseudo-random so the demo is stable
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const months = leoMonthsFor(y);
    s.clubs.forEach((c, ci) => {
      s.reports[c.id] = {};
      months.forEach((m, mi) => {
        const ended = monthEndedFor(m.key);
        if (!ended) return;
        const r = rnd();
        if (r < 0.12 && mi < 3) return; // missing
        const dueStr = dueFor(m.key, 10);
        const due = parseISO(dueStr);
        const lateDays = r > 0.82 ? Math.ceil(rnd() * 9) : -Math.ceil(rnd() * 8);
        const sub = new Date(due); sub.setDate(sub.getDate() + lateDays);
        if (toISO(sub) > todayISO()) return; // not yet received
        const time = `${pad(9 + Math.floor(rnd() * 10))}:${pad(Math.floor(rnd() * 12) * 5)}`;
        s.reports[c.id][m.key] = { status: 'submitted', date: toISO(sub), time, remark: '' };
      });
      if (ci === 3) s.reports[c.id][months[1].key] = { status: 'submitted', date: dueFor(months[1].key, 10), time: '16:40', remark: 'Bank statement attached separately.' };
    });

    // Sample collectors for the e-receipts (DT = District Treasurer, DAT = District Assistant Treasurer)
    const collectors = { DT: 'Leo S. Gamage', DAT: 'Leo R. Hettiarachchi' };
    let payN = 0;
    const pay = (club, head, amount, date, method, reference, note) => {
      const by = method === 'Cash' && payN++ % 2 ? 'DAT' : 'DT';
      s.payments.push({
        id: uid('pay'), clubId: club.id, headId: head.id, amount, date, method, reference, note: note || '', createdAt: Date.now(),
        payer: club.name, payerPhone: club.treasurerPhone, onAccountOf: head.name + (note ? ' — ' + note.toLowerCase() : ''),
        collectedBy: by, collectorName: collectors[by],
      });
    };
    const [dues, dcm, conv, proj] = s.paymentHeads;
    s.clubs.forEach((c, i) => {
      if (i !== 5) pay(c, dues, c.members * 150 * (i === 2 ? 0.5 : 1), `${y}-0${8 + (i % 2)}-${pad(5 + i)}`, i % 3 ? 'Bank transfer' : 'Cash', `DUE-${1001 + i}`);
      if (i % 4 !== 1) pay(c, dcm, 2500, `${y}-10-${pad(2 + i)}`, 'Bank transfer', `DCM-${2001 + i}`);
      if (c.type === 'omega' && i % 2 === 0) pay(c, conv, i === 0 ? 10000 : 5000, `${y}-10-${pad(20 + i)}`, 'Bank transfer', `CONV-${3001 + i}`, i === 0 ? '' : 'First instalment');
      if (i < 3) pay(c, proj, 5000, `${y}-11-0${1 + i}`, 'Cheque', `CHQ-${48810 + i}`);
    });
    s.exemptions[s.clubs[9].id + '|' + proj.id] = true;
    // Number the sample receipts in date order, as if each was issued on the day the money came in
    s.payments.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => {
      const at = parseISO(p.date); at.setHours(10 + Math.floor(rnd() * 7), Math.floor(rnd() * 60));
      issueReceipt(s, p, { byName: p.collectorName }, at.getTime());
    });

    const note = (club, text, tag, daysAgo, done) =>
      s.notes.push({ id: uid('note'), clubId: club.id, text, tag, done: !!done, createdAt: Date.now() - daysAgo * 86400000 });
    note(s.clubs[2], 'Paid half of the district dues. Treasurer promised balance after the November fundraiser.', 'payment', 6);
    note(s.clubs[5], 'Dues not received yet — call club treasurer and confirm member count.', 'followup', 3);
    note(s.clubs[0], 'Very consistent with monthly reports. Use as an example for the treasurer workshop.', 'general', 12);
    note(s.clubs[7], 'New treasurer appointed in September; shared the report template again.', 'report', 20, true);
    note(s.clubs[3], 'Convention registration second instalment expected in December.', 'followup', 1);
    note(s.clubs[9], 'Exempted from the service project fund by the District Council (school club).', 'payment', 9);
    const remind = (club, text, inDays) => {
      const d = new Date(); d.setDate(d.getDate() + inDays);
      s.notes.push({ id: uid('note'), clubId: club.id, text, tag: 'reminder', remindOn: toISO(d), done: false, createdAt: Date.now() - 2 * 86400000 });
    };
    remind(s.clubs[5], 'Call the club treasurer about district dues and the DCM fee.', -1);
    remind(s.clubs[2], 'Collect the balance of district dues after the November fundraiser.', 7);
    remind(s.clubs[1], 'Check the DCM fee payment slip.', 0);

    const notice = (title, body, audience, daysAgo) => {
      const d = new Date(); d.setDate(d.getDate() - daysAgo);
      s.notices.push({ id: uid('ntc'), title, body, audience, date: toISO(d), createdAt: Date.now() - daysAgo * 86400000 });
    };
    notice('Monthly treasurer reports — due on the 10th', 'Club treasurers, please send the monthly treasurer report with the bank statement by the 10th of the following month.', 'all', 25);
    notice('District Convention registration open', 'Omega clubs can register for the District Convention. The fee is Rs. 10,000 per club and can be paid in two instalments.', 'omega', 12);
    notice('Service project fund for school clubs', 'Alpha clubs may request an exemption from the service project fund through their zone chairperson.', 'alpha', 8);
    notice('Dues balance', 'Your club has a balance on the district dues. Please settle it before the next District Council Meeting.', s.clubs[2].id, 4);
    return s;
  }
  // helpers used by demo (independent of current settings)
  function leoMonthsFor(y) { return leoMonths(y); }
  function monthEndedFor(key) { return monthEnded(key); }
  function dueFor(key, day) { const [y, m] = nextMonth(key); return `${y}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}`; }

  /* ---------- tiny event hub ---------- */
  const listeners = {};
  App.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn));
  App.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

  // Live getter (Object.assign would copy a one-time snapshot and break replaceState)
  Object.defineProperty(App, 'state', { get: () => state, enumerable: true });

  Object.assign(App, {
    STORAGE_KEY, CLOUD, MONTHS, METHODS, NOTE_TAGS, NOTICE_AUDIENCE, isTask,
    commit, replaceState, persist, defaultState, demoState, migrate, savedOnDevice,
    uid, pad, toISO, todayISO, parseISO, fmtDate, fmtDateTime, fmtTime, nowTime, relTime, money, moneyShort, pct,
    leoYearLabel, leoMonths, monthLabel, reportDueDate, monthEnded, currentReportMonth, getReport, reportStatus,
    typeLabel, clubById, clubsSorted, notesFor, noticesFor, noticeAudienceLabel, dueReminders, clubOutstanding,
    headById, headApplies, expectedAmount, paymentsFor, paidAmount, isExempt, paymentStatus, headTotals, clubPaymentSummary, overallTotals,
    toCSV, download,
    RECEIPT_BY, amountInWords, leoYearOf, receiptNo, lastReceiptSeq, issueReceipt, reserveReceiptSeq, reviseReceipt, cancelReceipts, reinstateReceipts,
    receiptById, collectorLabel,
  });
})();
