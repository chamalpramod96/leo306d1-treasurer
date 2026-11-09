/* =========================================================
   Payments — district payment types, club × payment status matrix,
   payment log (multiple instalments per club & payment)
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, typeBadge, chip, seg, meter, emptyState, formData } = App.ui;

  const vs = { tab: 'matrix', type: 'all', q: '', log: { head: 'all', type: 'all', method: 'all', from: '', to: '', q: '' } };

  function render(sub) {
    vs.tab = ['matrix', 'log', 'types', 'receipts'].includes(sub) ? sub : 'matrix';
    const s = App.state;
    const tot = App.overallTotals();
    const head = `
      <div class="page-head">
        <div>
          <div class="eyebrow">District payments from clubs · Leo Year ${App.leoYearLabel()}</div>
          <h1 class="page-title">Payments</h1>
          <p class="lede">Track every district payment — dues, fees and contributions — including part-payments and instalments.</p>
        </div>
        <div class="head-actions">
          <button class="btn" data-action="new-head" data-perm="heads">+ Payment type</button>
          <button class="btn btn-primary" data-action="new-payment" data-perm="payments" ${!s.clubs.length || !s.paymentHeads.length ? 'disabled' : ''}>+ Record payment</button>
        </div>
      </div>
      <div class="kpi-row" style="margin-bottom:18px">
        <div class="kpi"><div class="kpi-label">Expected</div><div class="kpi-value">${App.moneyShort(tot.expected)}</div><div class="kpi-foot">${s.paymentHeads.length} payment type${s.paymentHeads.length === 1 ? '' : 's'}</div></div>
        <div class="kpi"><div class="kpi-label">Collected</div><div class="kpi-value">${App.moneyShort(tot.collected)}</div>${meter(tot.collected, tot.expected, 'thin')}<div class="kpi-foot">${App.pct(tot.collected, tot.expected)}% of expected</div></div>
        <div class="kpi kpi-maroon"><div class="kpi-label">Outstanding</div><div class="kpi-value">${App.moneyShort(tot.outstanding)}</div><div class="kpi-foot">${tot.clubsOwing} club${tot.clubsOwing === 1 ? '' : 's'} with a balance</div></div>
        <div class="kpi kpi-maroon"><div class="kpi-label">Payment records</div><div class="kpi-value">${s.payments.length}</div><div class="kpi-foot">Last: ${s.payments.length ? App.fmtDate(s.payments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0].date) : '—'}</div></div>
      </div>
      <nav class="subtabs" aria-label="Payments sections">
        <a href="#/payments" class="${vs.tab === 'matrix' ? 'on' : ''}" ${vs.tab === 'matrix' ? 'aria-current="page"' : ''}>Club status matrix</a>
        <a href="#/payments/log" class="${vs.tab === 'log' ? 'on' : ''}" ${vs.tab === 'log' ? 'aria-current="page"' : ''}>Payment log (${s.payments.length})</a>
        <a href="#/payments/receipts" class="${vs.tab === 'receipts' ? 'on' : ''}" ${vs.tab === 'receipts' ? 'aria-current="page"' : ''}>🧾 Receipts (${s.receipts.length})</a>
        <a href="#/payments/types" class="${vs.tab === 'types' ? 'on' : ''}" ${vs.tab === 'types' ? 'aria-current="page"' : ''}>Payment types (${s.paymentHeads.length})</a>
      </nav>`;

    let body;
    if (vs.tab === 'types') body = renderTypes();
    else if (vs.tab === 'receipts') body = App.receipts.renderRegister();
    else if (!s.clubs.length) body = emptyState({ title: 'No clubs yet', text: 'Add the district clubs first, then track their payments here.', actions: '<button class="btn btn-primary" data-action="add-club" data-perm="clubs">+ Add a club</button>' });
    else if (!s.paymentHeads.length) body = emptyState({ title: 'Set up district payments', text: 'Create the payment types the district collects from clubs — e.g. district dues per member, council meeting fees, convention registration, project funds.', actions: '<button class="btn btn-primary" data-action="new-head" data-perm="heads">+ Create payment type</button>' });
    else if (vs.tab === 'log') body = renderLogShell();
    else body = renderMatrixShell();
    return `<section class="view">${head}${body}</section>`;
  }

  /* ---------- matrix ---------- */
  function renderMatrixShell() {
    const s = App.state;
    const nAlpha = s.clubs.filter((c) => c.type === 'alpha').length;
    return `<div class="toolbar">
        ${seg('payType', vs.type, [{ value: 'all', label: 'All', count: s.clubs.length }, { value: 'omega', label: 'Ω Omega', count: s.clubs.length - nAlpha }, { value: 'alpha', label: 'α Alpha', count: nAlpha }])}
        ${mobile() ? '' : `<span class="legend">${chip('paid', '✓', 'Paid')} ${chip('partial', '◐', 'Partial')} ${chip('unpaid', '○', 'Unpaid')} ${chip('overdue', '!', 'Overdue')} ${chip('exempt', '○', 'Exempt')}</span>`}
        <span class="spacer"></span>
        <button class="btn btn-sm" data-action="export-matrix" data-perm="export">⤓ Export CSV</button>
        <label class="search"><span class="sr-only">Search clubs</span><input type="search" id="paySearch" placeholder="Search clubs…" value="${esc(vs.q)}"></label>
      </div>
      <div id="payMatrix">${renderMatrix()}</div>`;
  }

  const mobile = () => !!(App.isMobile && App.isMobile());

  /** Phone: one card per club, a tappable row per payment type. */
  function renderCards() {
    const heads = App.state.paymentHeads;
    const q = vs.q.toLowerCase();
    const groups = vs.type === 'all' ? ['omega', 'alpha'] : [vs.type];
    let html = '';
    groups.forEach((t) => {
      const list = App.clubsSorted(t).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.zone || '').toLowerCase().includes(q));
      if (!list.length) return;
      html += `<div class="section-title"><span class="section-mark ${t}">${t === 'omega' ? 'Ω' : 'α'}</span><h3>${t === 'omega' ? 'Omega' : 'Alpha'} clubs</h3><span class="rule"></span><span class="muted">${list.length}</span></div>
        <div class="pay-cards">${list.map((c) => {
          const ps = App.clubPaymentSummary(c);
          return `<article class="pay-card ${c.type}">
            <div class="pc-head">
              <div class="pc-title"><button class="club-name-btn" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button>${typeBadge(c.type)}</div>
              <div class="pc-bal">${ps.balance > 0 ? `<small>Balance</small><b>${App.money(ps.balance, false)}</b>` : '<small>Balance</small><b class="is-clear">✓ Clear</b>'}</div>
            </div>
            <ul class="pc-rows">${heads.map((h) => {
              const st = App.paymentStatus(c, h);
              if (st.code === 'na') return `<li><div class="pc-row is-na"><span class="pc-name">${esc(h.name)}</span><span class="hint">Not for ${App.typeLabel(c.type)}</span></div></li>`;
              const amt = st.code === 'exempt' ? 'Exempted' : st.code === 'unset' ? 'Add member count' : `${App.money(st.paid, false)} of ${App.money(st.expected, false)}`;
              return `<li><button type="button" class="pc-row" data-action="pay-cell" data-club="${c.id}" data-head="${h.id}" aria-label="${esc(c.name)} — ${esc(h.name)}: ${esc(st.label)}">
                <span class="pc-name">${esc(h.name)}<small>${amt}</small></span>${chip(st.code === 'partial' && st.overdue ? 'overdue' : st.code, st.icon, st.label)}<span class="pc-go" aria-hidden="true">›</span></button></li>`;
            }).join('')}</ul>
          </article>`;
        }).join('')}</div>`;
    });
    return html || `<div class="empty-sm">No clubs match your search.</div>`;
  }

  function renderMatrix() {
    if (mobile()) return renderCards();
    const heads = App.state.paymentHeads;
    const q = vs.q.toLowerCase();
    const groups = vs.type === 'all' ? ['omega', 'alpha'] : [vs.type];
    let rows = '';
    const visible = [];
    groups.forEach((t) => {
      const list = App.clubsSorted(t).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.zone || '').toLowerCase().includes(q));
      if (!list.length) return;
      visible.push(...list);
      if (groups.length > 1) rows += `<tr><th colspan="${heads.length + 2}" class="sticky-col" style="background:var(--gold-50);color:var(--gold-800);font-size:12px;letter-spacing:.08em;text-transform:uppercase">${t === 'omega' ? 'Ω Omega clubs' : 'α Alpha clubs'} · ${list.length}</th></tr>`;
      rows += list.map((c) => {
        const ps = App.clubPaymentSummary(c);
        return `<tr><th scope="row" class="sticky-col"><div class="club-cell"><button class="club-name-btn" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button>${typeBadge(c.type)}</div></th>
          ${heads.map((h) => {
            const st = App.paymentStatus(c, h);
            if (st.code === 'na') return `<td><div class="pcell is-na" title="Not applicable to ${App.typeLabel(c.type)} clubs">Not applicable</div></td>`;
            const amt = st.code === 'exempt' ? 'Exempted' : st.code === 'unset' ? 'Add member count' : `${App.money(st.paid, false)} / ${App.money(st.expected, false)}`;
            return `<td><button class="pcell" data-action="pay-cell" data-club="${c.id}" data-head="${h.id}" aria-label="${esc(c.name)} — ${esc(h.name)}: ${esc(st.label)}">${chip(st.code === 'partial' && st.overdue ? 'overdue' : st.code, st.icon, st.label)}<span class="amt">${amt}</span></button></td>`;
          }).join('')}
          <td class="num">${ps.balance > 0 ? `<strong>${App.money(ps.balance, false)}</strong>` : '<span class="muted">—</span>'}</td></tr>`;
      }).join('');
    });
    if (!rows) return `<div class="empty-sm">No clubs match your search.</div>`;
    const foot = heads.map((h) => {
      let exp = 0, col = 0;
      visible.forEach((c) => { const st = App.paymentStatus(c, h); exp += st.expected; col += st.code === 'na' ? 0 : st.paid; });
      return `<td class="num" style="text-align:left">${App.money(col, false)}<div class="hint" style="font-weight:500">of ${App.money(exp, false)}</div></td>`;
    }).join('');
    const totBal = visible.reduce((sum, c) => sum + App.clubPaymentSummary(c).balance, 0);
    return `<div class="table-wrap"><table class="table pay-grid">
      <thead><tr><th class="sticky-col">Club</th>${heads.map((h) => `<th class="hcol">${esc(h.name)}<small>${h.amountMode === 'perMember' ? App.money(h.amount, false) + ' per member' : App.money(h.amount, false)}${h.dueDate ? ' · due ' + App.fmtDate(h.dueDate, { day: 'numeric', month: 'short' }) : ''}${h.appliesTo !== 'all' ? ' · ' + App.typeLabel(h.appliesTo) + ' only' : ''}</small></th>`).join('')}<th class="num">Balance</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th class="sticky-col">Collected</th>${foot}<td class="num">${App.money(totBal, false)}</td></tr></tfoot>
    </table></div>`;
  }

  /* ---------- log ---------- */
  function renderLogShell() {
    const L = vs.log;
    return `<div class="toolbar log-filters">
        <select class="input" id="logHead" style="width:auto;min-height:38px" aria-label="Payment type"><option value="all">All payment types</option>${App.state.paymentHeads.map((h) => `<option value="${h.id}" ${L.head === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
        <select class="input" id="logType" style="width:auto;min-height:38px" aria-label="Club type"><option value="all">Alpha &amp; Omega</option><option value="omega" ${L.type === 'omega' ? 'selected' : ''}>Ω Omega only</option><option value="alpha" ${L.type === 'alpha' ? 'selected' : ''}>α Alpha only</option></select>
        <select class="input" id="logMethod" style="width:auto;min-height:38px" aria-label="Method"><option value="all">Any method</option>${App.METHODS.map((m) => `<option ${L.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <label class="hint">From <input type="date" class="input" id="logFrom" value="${esc(L.from)}" style="width:auto;min-height:38px"></label>
        <label class="hint">To <input type="date" class="input" id="logTo" value="${esc(L.to)}" style="width:auto;min-height:38px"></label>
        <span class="spacer"></span>
        <label class="search"><span class="sr-only">Search</span><input type="search" id="logSearch" placeholder="Club, reference, note…" value="${esc(L.q)}"></label>
      </div>
      <div id="payLog">${renderLog()}</div>`;
  }

  function filteredPayments() {
    const L = vs.log, q = L.q.toLowerCase();
    return App.state.payments.filter((p) => {
      const c = App.clubById(p.clubId), h = App.headById(p.headId);
      if (!c || !h) return false;
      if (L.head !== 'all' && p.headId !== L.head) return false;
      if (L.type !== 'all' && c.type !== L.type) return false;
      if (L.method !== 'all' && p.method !== L.method) return false;
      if (L.from && (p.date || '') < L.from) return false;
      if (L.to && (p.date || '') > L.to) return false;
      return !q || [c.name, p.reference, p.note, h.name].some((v) => (v || '').toLowerCase().includes(q));
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  }

  function renderLog() {
    const list = filteredPayments();
    if (!list.length) return `<div class="empty-sm">No payments match these filters.</div>`;
    const total = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (mobile()) {
      return `<div class="log-total"><span>${list.length} payment${list.length === 1 ? '' : 's'} · <b>${App.money(total)}</b></span><button class="btn btn-sm" data-action="export-log" data-perm="export">⤓ CSV</button></div>
        <ul class="log-cards">${list.map((p) => {
          const c = App.clubById(p.clubId), h = App.headById(p.headId);
          return `<li class="log-card">
            <div class="lc-top"><b class="lc-amt">${App.money(p.amount)}</b><span class="hint">${App.fmtDate(p.date)}</span></div>
            <div class="lc-club"><button class="club-name-btn" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button>${typeBadge(c.type)}</div>
            <div class="lc-sub">${esc([h.name, p.method, p.reference].filter(Boolean).join(' · '))}</div>
            ${p.note ? `<div class="lc-note">${esc(p.note)}</div>` : ''}
            <div class="lc-foot"><span class="by">${p.byName ? 'Recorded by ' + esc(p.byName) : ''}</span>
              <span class="lc-acts">${App.receipts.button(p)}<button class="btn btn-ghost btn-sm btn-icon" data-action="edit-payment" data-perm="payments" data-id="${p.id}" aria-label="Edit payment">✎</button><button class="btn btn-ghost btn-sm btn-icon" data-action="delete-payment" data-perm="payments" data-id="${p.id}" aria-label="Delete payment">🗑</button></span></div>
          </li>`;
        }).join('')}</ul>`;
    }
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Club</th><th>Payment</th><th class="num">Amount</th><th>Method</th><th>Reference</th><th>Receipt</th><th>Note</th><th>Recorded by</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${list.map((p) => {
        const c = App.clubById(p.clubId), h = App.headById(p.headId);
        return `<tr><td class="nowrap">${App.fmtDate(p.date)}</td>
          <td><div class="club-cell" style="min-width:200px"><button class="club-name-btn" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button>${typeBadge(c.type)}</div></td>
          <td style="min-width:180px">${esc(h.name)}</td><td class="num"><strong>${App.money(p.amount)}</strong></td>
          <td class="nowrap">${esc(p.method || '')}</td><td class="nowrap">${esc(p.reference || '')}</td><td class="nowrap">${App.receipts.button(p, 'full')}</td><td class="muted" style="max-width:240px">${esc(p.note || '')}</td><td class="muted nowrap">${esc(p.byName || '')}</td>
          <td class="nowrap"><button class="btn btn-ghost btn-sm btn-icon" data-action="edit-payment" data-perm="payments" data-id="${p.id}" title="Edit" aria-label="Edit payment">✎</button><button class="btn btn-ghost btn-sm btn-icon" data-action="delete-payment" data-perm="payments" data-id="${p.id}" title="Delete" aria-label="Delete payment">🗑</button></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="3">${list.length} payment${list.length === 1 ? '' : 's'}</td><td class="num">${App.money(total)}</td><td colspan="6" style="text-align:right"><button class="btn btn-sm" data-action="export-log" data-perm="export">⤓ Export these as CSV</button></td></tr></tfoot>
    </table></div>`;
  }

  /* ---------- types ---------- */
  function renderTypes() {
    const heads = App.state.paymentHeads;
    if (!heads.length) return emptyState({ title: 'No payment types yet', text: 'Create each payment the district collects from clubs. Amounts can be a fixed sum per club or a rate per member.', actions: '<button class="btn btn-primary" data-action="new-head" data-perm="heads">+ Create payment type</button>' });
    return `<div class="head-list">${heads.map((h) => {
      const t = App.headTotals(h);
      return `<div class="card head-card">
        <div class="card-head" style="align-items:flex-start"><div><h4>${esc(h.name)}</h4>${h.description ? `<p class="desc">${esc(h.description)}</p>` : ''}</div>
          <div class="btn-row" style="flex-wrap:nowrap"><button class="btn btn-ghost btn-sm btn-icon" data-action="edit-head" data-perm="heads" data-id="${h.id}" aria-label="Edit ${esc(h.name)}" title="Edit">✎</button><button class="btn btn-ghost btn-sm btn-icon" data-action="delete-head" data-perm="heads" data-id="${h.id}" aria-label="Delete ${esc(h.name)}" title="Delete">🗑</button></div></div>
        <dl class="kv">
          <dt>Amount</dt><dd>${App.money(h.amount)}${h.amountMode === 'perMember' ? ' per member' : ' per club'}</dd>
          <dt>Applies to</dt><dd>${h.appliesTo === 'all' ? 'All clubs (Alpha &amp; Omega)' : App.typeLabel(h.appliesTo) + ' clubs only'}</dd>
          <dt>Due date</dt><dd>${h.dueDate ? App.fmtDate(h.dueDate) : '—'}</dd>
          <dt>Settled</dt><dd>${t.settled} of ${t.applicable} clubs</dd>
          <dt>Collected</dt><dd>${App.money(t.collected, false)} of ${App.money(t.expected, false)}</dd>
        </dl>
        ${meter(t.collected, t.expected)}
      </div>`;
    }).join('')}</div>`;
  }

  function mount(root) {
    if (vs.tab === 'receipts') { App.receipts.mountRegister(root); return; }
    const ps = root.querySelector('#paySearch');
    ps && ps.addEventListener('input', () => { vs.q = ps.value; root.querySelector('#payMatrix').innerHTML = renderMatrix(); });
    root.querySelectorAll('[data-seg="payType"] button').forEach((b) => b.addEventListener('click', () => { vs.type = b.dataset.value; App.refresh(); }));
    const bind = (sel, key, ev = 'change') => {
      const el = root.querySelector(sel);
      el && el.addEventListener(ev, () => {
        vs.log[key] = el.value;
        const box = root.querySelector('#payLog');
        box.innerHTML = renderLog();
        App.ui.applyPerms(box);
      });
    };
    bind('#logHead', 'head'); bind('#logType', 'type'); bind('#logMethod', 'method'); bind('#logFrom', 'from'); bind('#logTo', 'to'); bind('#logSearch', 'q', 'input');
  }

  /** Name to put on a receipt for DT / DAT: you, if you hold that role; else that officer's login; else the treasurer name in Settings. */
  function defaultCollector(by) {
    const role = by === 'DAT' ? 'asst_treasurer' : 'treasurer';
    const me = App.auth.current();
    if (me && me.role === role) return me.name;
    const u = App.auth.users().find((x) => x.active && x.role === role);
    if (u) return u.name;
    return by === 'DT' ? App.state.settings.treasurerName || '' : '';
  }

  /* ---------- payment modal (new / edit / per club-payment history) ---------- */
  function paymentModal({ clubId, headId, paymentId } = {}) {
    const s = App.state;
    const editing = paymentId ? s.payments.find((p) => p.id === paymentId) : null;
    if (paymentId && !editing) return;
    if (!s.clubs.length || !s.paymentHeads.length) { App.ui.toast('Add clubs and payment types first.', 'error'); return; }
    const sel = {
      clubId: editing ? editing.clubId : clubId || '',
      headId: editing ? editing.headId : headId || '',
    };
    const me = App.auth.current();
    const myBy = me && me.role === 'asst_treasurer' ? 'DAT' : 'DT';
    const draft = editing
      ? { payer: '', payerPhone: '', onAccountOf: '', collectedBy: 'DT', collectorName: '', ...editing }
      : { amount: '', date: App.todayISO(), method: 'Bank transfer', reference: '', note: '', payer: '', payerPhone: '', onAccountOf: '', collectedBy: myBy, collectorName: defaultCollector(myBy), issueReceipt: true };
    if (!('issueReceipt' in draft)) draft.issueReceipt = !editing;
    let amountTouched = !!editing;
    // receipt fields follow the chosen club / payment type until the user types their own
    const touched = { payer: !!(editing && editing.payer), payerPhone: !!(editing && editing.payerPhone), onAccountOf: !!(editing && editing.onAccountOf) };
    const receiptOf = editing && editing.receiptId ? App.receiptById(editing.receiptId) : null;

    function fillReceiptDefaults() {
      const c = App.clubById(sel.clubId), h = App.headById(sel.headId);
      if (!touched.payer) draft.payer = c ? c.name : '';
      if (!touched.payerPhone) draft.payerPhone = c ? c.treasurerPhone || c.phone || c.presidentPhone || '' : '';
      if (!touched.onAccountOf) draft.onAccountOf = h ? h.name : '';
    }
    const nextNo = (date) => { const y = App.leoYearOf(date || App.todayISO()); return App.receiptNo(s.settings.receiptPrefix, y, App.lastReceiptSeq(s, y) + 1); };

    function fixHead() {
      const c = App.clubById(sel.clubId);
      if (!c) return;
      const h = App.headById(sel.headId);
      if (!h || !App.headApplies(h, c)) {
        const first = s.paymentHeads.find((x) => App.headApplies(x, c));
        sel.headId = first ? first.id : '';
      }
    }
    fixHead();

    function pairInfo() {
      const c = App.clubById(sel.clubId), h = App.headById(sel.headId);
      if (!c || !h) return '<div class="hint">Choose a club and payment type to see its balance and history.</div>';
      const st = App.paymentStatus(c, h);
      const hist = App.paymentsFor(c.id, h.id);
      return `
        <div class="pay-summary">
          <div><div class="lbl">Expected</div><div class="val">${st.code === 'exempt' ? 'Exempt' : App.money(st.expected)}</div></div>
          <div><div class="lbl">Paid so far</div><div class="val">${App.money(st.paid)}</div></div>
          <div><div class="lbl">Balance</div><div class="val" style="color:${st.balance > 0 ? 'var(--crit-ink)' : 'var(--good-ink)'}">${App.money(st.balance)}</div></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between">
          <div>${chip(st.code === 'partial' && st.overdue ? 'overdue' : st.code, st.icon, st.label)} ${h.amountMode === 'perMember' ? `<span class="hint">${App.money(h.amount, false)} × ${c.members || 0} members</span>` : ''}</div>
          ${editing || !App.can('payments') ? '' : `<label class="switch"><input type="checkbox" id="exemptToggle" ${App.isExempt(c.id, h.id) ? 'checked' : ''}> Exempt this club</label>`}
        </div>
        ${st.code === 'unset' ? `<div class="callout" style="margin-top:10px">This is a per-member payment and ${esc(c.name)} has no member count. <button type="button" class="btn btn-sm" data-action="edit-club" data-perm="clubs" data-id="${c.id}">Set members</button></div>` : ''}
        ${!editing ? `<div class="history"><h4>Payment history (${hist.length})</h4>${hist.length ? `<ul class="list">${hist.map((p) => `
          <li><span class="li-ico pay" aria-hidden="true">₨</span><div class="li-body"><div class="t">${App.money(p.amount)} <span class="hint">· ${App.fmtDate(p.date)}</span></div>
          <div class="s">${esc([p.method, p.reference, p.note].filter(Boolean).join(' · '))}${p.byName ? `<span class="by"> · recorded by ${esc(p.byName)}</span>` : ''}</div></div>
          ${App.receipts.button(p, true)}
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-action="edit-payment" data-perm="payments" data-id="${p.id}" aria-label="Edit payment" title="Edit">✎</button>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-action="delete-payment" data-perm="payments" data-id="${p.id}" aria-label="Delete payment" title="Delete">🗑</button></li>`).join('')}</ul>` : '<div class="empty-sm" style="padding:8px">No payments recorded yet.</div>'}</div>` : ''}`;
    }

    function suggestedAmount() {
      const c = App.clubById(sel.clubId), h = App.headById(sel.headId);
      if (!c || !h) return '';
      const st = App.paymentStatus(c, h);
      return st.balance > 0 ? st.balance : '';
    }

    const readOnly = !App.can('payments');
    if (readOnly && (!sel.clubId || !sel.headId || editing)) return;
    let busy = false;   // waiting for a receipt number (outside onMount: the form is redrawn on every data change)

    const ctrl = App.ui.open({
      size: 'lg',
      live: true,
      title: readOnly ? 'Payment details' : editing ? 'Edit payment' : 'Record a payment',
      sub: () => { const c = App.clubById(sel.clubId), h = App.headById(sel.headId); return c && h ? `${esc(c.name)} · ${esc(h.name)}` : 'District payment from a club'; },
      render: () => {
        if (readOnly) return `${pairInfo()}<p class="readonly-note" style="margin:14px 0 0">View only — the Treasurer and Assistant Treasurers record payments.</p>`;
        const c = App.clubById(sel.clubId);
        if (!amountTouched) draft.amount = suggestedAmount();
        fillReceiptDefaults();
        const officers = App.auth.users().filter((u) => u.active && (u.role === 'treasurer' || u.role === 'asst_treasurer'));
        const receiptLine = receiptOf
          ? `<p class="hint rcpt-hint">🧾 Receipt <b>${esc(receiptOf.no)}</b> will be updated with these details (same number).</p>`
          : `<label class="switch"><input type="checkbox" name="issueReceipt" ${draft.issueReceipt ? 'checked' : ''}> Issue a numbered e-receipt</label>
             <p class="hint rcpt-hint" id="nextRcpt">${draft.issueReceipt ? `Receipt no. <b>${esc(nextNo(draft.date))}</b> will be issued and shown when you save.` : 'No receipt will be issued (for example, a paper receipt was already given).'}</p>`;
        return `
        <form id="payForm" class="form-grid">
          <label class="field"><span>Club *</span><select name="clubId" required><option value="">Choose a club…</option>${App.ui.clubOptions(sel.clubId)}</select></label>
          <label class="field"><span>Payment type *</span><select name="headId" required>${s.paymentHeads.map((h) => {
            const ok = !c || App.headApplies(h, c);
            return `<option value="${h.id}" ${h.id === sel.headId ? 'selected' : ''} ${ok ? '' : 'disabled'}>${esc(h.name)}${ok ? '' : ' (not for ' + App.typeLabel(c.type) + ')'}</option>`;
          }).join('')}</select></label>
          <div class="full" id="pairInfo">${pairInfo()}</div>
          <label class="field"><span>Amount (Rs.) *</span><input name="amount" type="number" min="0.01" step="0.01" required value="${esc(draft.amount)}" placeholder="0.00"></label>
          <label class="field"><span>Date received *</span><input name="date" type="date" required value="${esc(draft.date)}"></label>
          <label class="field"><span>Method</span><select name="method">${App.METHODS.map((m) => `<option ${m === draft.method ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <label class="field"><span>Reference</span><input name="reference" value="${esc(draft.reference)}" placeholder="Bank slip or cheque number"></label>
          <label class="field full"><span>Note</span><input name="note" value="${esc(draft.note)}" placeholder="Optional — e.g. first instalment"></label>

          <div class="full form-section">E-receipt details</div>
          <label class="field"><span>Recipient (name on receipt) *</span><input name="payer" required value="${esc(draft.payer)}" placeholder="Club or person who paid" autocomplete="off"></label>
          <label class="field"><span>Contact no.</span><input name="payerPhone" type="tel" value="${esc(draft.payerPhone)}" placeholder="07X XXX XXXX"></label>
          <label class="field full"><span>On account of (reason)</span><input name="onAccountOf" value="${esc(draft.onAccountOf)}" placeholder="What the payment is for"><small>Filled from the payment type — add details if needed, e.g. “District Dues — 32 members”.</small></label>
          <div class="field"><span class="field-label">Collected by *</span>
            <div class="radio-cards rc-2">
              <label><input type="radio" name="collectedBy" value="DT" ${draft.collectedBy !== 'DAT' ? 'checked' : ''}><span>DT<small>District Treasurer</small></span></label>
              <label><input type="radio" name="collectedBy" value="DAT" ${draft.collectedBy === 'DAT' ? 'checked' : ''}><span>DAT<small>District Asst. Treasurer</small></span></label>
            </div>
          </div>
          <label class="field"><span>Collector's name</span><input name="collectorName" list="collectorNames" value="${esc(draft.collectorName)}" placeholder="Officer who received the money" autocomplete="off">
            <datalist id="collectorNames">${officers.map((u) => `<option value="${esc(u.name)}">${u.role === 'treasurer' ? 'DT' : 'DAT'}</option>`).join('')}</datalist></label>
          <div class="full rcpt-issue">${receiptLine}</div>
        </form>`;
      },
      footer: () => readOnly ? '<button class="btn btn-primary" data-close>Close</button>'
        : `<button class="btn" data-close>${editing ? 'Cancel' : 'Close'}</button><button class="btn btn-primary" type="submit" form="payForm">${editing ? 'Save changes' : 'Save payment'}</button>`,
      onMount: (el) => {
        const f = el.querySelector('#payForm');
        if (!f) return;
        const TEXT = ['amount', 'date', 'method', 'reference', 'note', 'payer', 'payerPhone', 'onAccountOf', 'collectorName'];
        const keepDraft = () => {
          TEXT.forEach((k) => { draft[k] = f[k].value; });
          draft.collectedBy = f.querySelector('[name=collectedBy]:checked').value;
          if (f.issueReceipt) draft.issueReceipt = f.issueReceipt.checked;
        };
        f.amount.addEventListener('input', () => { amountTouched = true; });
        ['payer', 'payerPhone', 'onAccountOf'].forEach((k) => f[k].addEventListener('input', () => { touched[k] = true; }));
        TEXT.forEach((k) => f[k].addEventListener('input', keepDraft));
        // DT ↔ DAT: swap in that officer's name unless a different name was typed
        f.querySelectorAll('[name=collectedBy]').forEach((r) => r.addEventListener('change', () => {
          const was = draft.collectedBy;
          keepDraft();
          if (!f.collectorName.value || f.collectorName.value === defaultCollector(was)) f.collectorName.value = draft.collectorName = defaultCollector(draft.collectedBy);
        }));
        const hint = el.querySelector('#nextRcpt');
        const syncHint = () => {
          if (!hint) return;
          hint.innerHTML = f.issueReceipt.checked ? `Receipt no. <b>${esc(nextNo(f.date.value))}</b> will be issued and shown when you save.` : 'No receipt will be issued (for example, a paper receipt was already given).';
        };
        f.date.addEventListener('change', syncHint);
        f.issueReceipt && f.issueReceipt.addEventListener('change', () => { keepDraft(); syncHint(); });
        f.clubId.addEventListener('change', () => { keepDraft(); sel.clubId = f.clubId.value; fixHead(); ctrl.update(); });
        f.headId.addEventListener('change', () => { keepDraft(); sel.headId = f.headId.value; ctrl.update(); });
        const ex = el.querySelector('#exemptToggle');
        ex && ex.addEventListener('change', () => {
          keepDraft();
          const k = sel.clubId + '|' + sel.headId;
          App.commit((st) => { if (ex.checked) st.exemptions[k] = true; else delete st.exemptions[k]; });
          App.ui.toast(ex.checked ? 'Club exempted from this payment' : 'Exemption removed');
        });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (busy) return;
          const d = formData(f);
          const amount = Math.round(parseFloat(d.amount) * 100) / 100;
          if (!d.clubId || !d.headId || !(amount > 0)) { App.ui.toast('Choose a club, a payment type and an amount.', 'error'); return; }
          const rec = {
            clubId: d.clubId, headId: d.headId, amount, date: d.date || App.todayISO(), method: d.method, reference: d.reference, note: d.note,
            payer: d.payer, payerPhone: d.payerPhone, onAccountOf: d.onAccountOf, collectedBy: d.collectedBy === 'DAT' ? 'DAT' : 'DT', collectorName: d.collectorName,
          };
          let wantReceipt = !!(f.issueReceipt && f.issueReceipt.checked);
          const by = App.auth.stamp();
          let rid = null;
          // A new receipt needs a number first. Shared database: reserved on the server so DT and DAT never clash.
          const hasReceipt = editing && editing.receiptId && App.receiptById(editing.receiptId);
          let seq = null, noNumber = false;
          if (wantReceipt && !hasReceipt) {
            busy = true;
            const btn = el.querySelector('button[type=submit]'), label = btn && btn.textContent;
            if (btn) { btn.disabled = true; btn.textContent = 'Getting receipt number…'; }
            seq = await App.reserveReceiptSeq(App.leoYearOf(rec.date));
            busy = false;
            if (btn) { btn.disabled = false; btn.textContent = label; }
            if (seq === false) { wantReceipt = false; noNumber = true; }
          }
          const offlineNote = noNumber ? ' · offline, so no receipt yet — issue it from the payment log when back online' : '';
          if (editing) {
            let revised = false;
            App.commit((st) => {
              const p = st.payments.find((x) => x.id === editing.id);
              Object.assign(p, rec, { editedByName: by.byName || '', editedAt: Date.now() });
              if (p.receiptId && st.receipts.some((r) => r.id === p.receiptId)) { App.reviseReceipt(st, p, by); rid = p.receiptId; revised = true; }
              else if (wantReceipt) rid = App.issueReceipt(st, p, by, Date.now(), seq || 0).id;
            });
            ctrl.close();
            const r = rid && App.receiptById(rid);
            App.ui.toast((revised ? `Payment updated · receipt ${r.no} updated` : r ? `Payment updated · receipt ${r.no} issued` : 'Payment updated') + offlineNote, noNumber ? 'error' : 'ok',
              revised ? { label: 'View receipt', run: () => App.receipts.show(rid) } : undefined);
            if (r && !revised) App.receipts.show(rid);
          } else {
            const id = App.uid('pay');
            App.commit((st) => {
              const p = { id, createdAt: Date.now(), ...rec, ...by };
              st.payments.push(p);
              if (wantReceipt) rid = App.issueReceipt(st, p, by, Date.now(), seq || 0).id;
            });
            ctrl.close();
            const c = App.clubById(d.clubId), r = rid && App.receiptById(rid);
            // Undo keeps the receipt number used: the receipt stays in the register marked cancelled
            App.ui.toast(`${App.money(amount, false)} recorded for ${c ? c.name : 'club'}${r ? ' · receipt ' + r.no : ''}${offlineNote}`, noNumber ? 'error' : 'ok', {
              label: 'Undo',
              run: () => {
                App.commit((st) => { App.cancelReceipts(st, [id], 'Payment undone', App.auth.stamp()); st.payments = st.payments.filter((p) => p.id !== id); });
                App.ui.closeAll();
              },
            });
            if (r) App.receipts.show(rid);
          }
        });
      },
    });
  }

  /* ---------- payment type form ---------- */
  function headForm(id) {
    const h = id ? App.headById(id) : null;
    const v = h || { appliesTo: 'all', amountMode: 'fixed' };
    const ctrl = App.ui.open({
      title: h ? 'Edit payment type' : 'New payment type',
      sub: 'A payment the district collects from clubs',
      render: () => `
        <form id="headForm" class="form-grid">
          <label class="field full"><span>Name *</span><input name="name" required value="${esc(v.name || '')}" placeholder="e.g. District Dues, DCM Fee, Convention Registration" autofocus></label>
          <div class="field full"><span class="field-label">How is the amount set?</span>
            <div class="radio-cards">
              <label><input type="radio" name="amountMode" value="fixed" ${v.amountMode !== 'perMember' ? 'checked' : ''}><span>Fixed per club<small>Same amount for each club</small></span></label>
              <label><input type="radio" name="amountMode" value="perMember" ${v.amountMode === 'perMember' ? 'checked' : ''}><span>Per member<small>Rate × club members</small></span></label>
            </div>
          </div>
          <label class="field"><span>Amount (Rs.) *</span><input name="amount" type="number" min="0" step="0.01" required value="${esc(v.amount != null ? v.amount : '')}"></label>
          <label class="field"><span>Due date</span><input name="dueDate" type="date" value="${esc(v.dueDate || '')}"><small>Unpaid balances turn “Overdue” after this date.</small></label>
          <label class="field full"><span>Applies to</span><select name="appliesTo">
            <option value="all" ${v.appliesTo === 'all' ? 'selected' : ''}>All clubs (Alpha &amp; Omega)</option>
            <option value="omega" ${v.appliesTo === 'omega' ? 'selected' : ''}>Ω Omega clubs only</option>
            <option value="alpha" ${v.appliesTo === 'alpha' ? 'selected' : ''}>α Alpha clubs only</option></select></label>
          <label class="field full"><span>Description</span><textarea name="description" rows="2" placeholder="Optional">${esc(v.description || '')}</textarea></label>
        </form>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="headForm">${h ? 'Save changes' : 'Create'}</button>`,
      onMount: (el) => el.querySelector('#headForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = formData(e.target);
        if (!d.name) return;
        const data = { name: d.name, amountMode: d.amountMode === 'perMember' ? 'perMember' : 'fixed', amount: Math.max(0, parseFloat(d.amount) || 0), dueDate: d.dueDate, appliesTo: ['all', 'alpha', 'omega'].includes(d.appliesTo) ? d.appliesTo : 'all', description: d.description };
        App.commit((s) => {
          if (h) Object.assign(s.paymentHeads.find((x) => x.id === id), data);
          else s.paymentHeads.push({ id: App.uid('head'), createdAt: Date.now(), ...data });
        });
        ctrl.close();
        App.ui.toast(h ? 'Payment type updated' : 'Payment type created');
      }),
    });
  }

  Object.assign(App.actions, {
    'new-payment': (el) => paymentModal({ clubId: el && el.dataset.club }),
    'pay-cell': (el) => paymentModal({ clubId: el.dataset.club, headId: el.dataset.head }),
    'edit-payment': (el) => paymentModal({ paymentId: el.dataset.id }),
    'delete-payment': async (el) => {
      const p = App.state.payments.find((x) => x.id === el.dataset.id);
      if (!p) return;
      const c = App.clubById(p.clubId);
      const r = p.receiptId && App.receiptById(p.receiptId);
      const ok = await App.ui.confirm({ title: 'Delete payment?', danger: true, confirmText: 'Delete', message: `Remove the payment of <strong>${App.money(p.amount)}</strong> from ${esc(c ? c.name : 'this club')} on ${App.fmtDate(p.date)}?${r && r.status !== 'cancelled' ? ` Its receipt <strong>${esc(r.no)}</strong> stays in the receipt register, marked <strong>cancelled</strong>.` : ''}` });
      if (!ok) return;
      App.commit((s) => {
        App.cancelReceipts(s, [p.id], 'Payment deleted', App.auth.stamp());
        s.payments = s.payments.filter((x) => x.id !== p.id);
      });
      App.ui.toast('Payment deleted', 'ok', { label: 'Undo', run: () => App.commit((s) => { s.payments.push(p); App.reinstateReceipts(s, [p.id]); }) });
    },
    'new-head': () => headForm(),
    'edit-head': (el) => headForm(el.dataset.id),
    'delete-head': async (el) => {
      const h = App.headById(el.dataset.id);
      if (!h) return;
      const n = App.state.payments.filter((p) => p.headId === h.id).length;
      const ok = await App.ui.confirm({ title: 'Delete payment type?', danger: true, confirmText: 'Delete', message: `<strong>${esc(h.name)}</strong>${n ? ` and its <strong>${n} payment record${n > 1 ? 's' : ''}</strong>` : ''} will be removed. This can't be undone.` });
      if (!ok) return;
      App.commit((s) => {
        s.paymentHeads = s.paymentHeads.filter((x) => x.id !== h.id);
        App.cancelReceipts(s, s.payments.filter((p) => p.headId === h.id).map((p) => p.id), 'Payment type deleted', App.auth.stamp());
        s.payments = s.payments.filter((p) => p.headId !== h.id);
        Object.keys(s.exemptions).forEach((k) => { if (k.endsWith('|' + h.id)) delete s.exemptions[k]; });
      });
      App.ui.toast('Payment type deleted');
    },
    'export-log': () => {
      const rows = [['Date', 'Club', 'Type', 'Payment', 'Amount (Rs.)', 'Method', 'Reference', 'Receipt no.', 'Collected by', 'Note', 'Recorded by']];
      filteredPayments().forEach((p) => {
        const c = App.clubById(p.clubId), h = App.headById(p.headId), r = p.receiptId && App.receiptById(p.receiptId);
        rows.push([p.date, c.name, App.typeLabel(c.type), h.name, Number(p.amount).toFixed(2), p.method, p.reference, r ? r.no : '', [p.collectedBy, p.collectorName].filter(Boolean).join(' — '), p.note, p.byName || '']);
      });
      App.download(`payment-log-${App.todayISO()}.csv`, App.toCSV(rows), 'text/csv');
    },
    'export-matrix': () => {
      const heads = App.state.paymentHeads;
      const rows = [['Club', 'Type', 'Zone', ...heads.flatMap((h) => [h.name + ' – status', h.name + ' – paid', h.name + ' – expected']), 'Total balance']];
      App.clubsSorted('all').forEach((c) => rows.push([c.name, App.typeLabel(c.type), c.zone || '',
        ...heads.flatMap((h) => { const st = App.paymentStatus(c, h); return [st.label, st.paid, st.expected]; }), App.clubPaymentSummary(c).balance]));
      App.download(`payment-status-${App.todayISO()}.csv`, App.toCSV(rows), 'text/csv');
    },
  });

  App.views.payments = { render, mount, title: 'Payments' };
  App.paymentModal = paymentModal;
})();
