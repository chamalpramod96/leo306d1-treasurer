/* =========================================================
   receipts.js — payment e-receipts: the receipt on screen, as a PDF
   and as an image, sharing, and the receipt register with Excel and
   PDF downloads.
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, chip, seg } = App.ui;

  const LOGOS = ['assets/lions-intl.png', 'assets/leo-logo.png', 'assets/logo.webp'];
  const DISPLAY = 'Montserrat, "Segoe UI", Arial, sans-serif';
  const BODY = 'Inter, "Segoe UI", Arial, sans-serif';
  const INK = '#2b1716', MAROON = '#5a0a12', GOLD = '#bb9146', MUTED = '#8b7873', RED = '#c62828';
  const NOTE = 'I hereby confirm that I have received the above mentioned Payment';

  const district = () => App.state.settings.districtName || 'Leo District 306 D1';
  const fileBase = (r) => 'e-receipt-' + r.no.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const methodText = (r) => [r.method, r.reference ? 'Ref. ' + r.reference : ''].filter(Boolean).join(' · ');
  const dateText = (iso) => App.fmtDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });
  const mobile = () => !!(App.isMobile && App.isMobile());
  const showClub = (r) => r.clubName && !(r.recipient || '').toLowerCase().includes(r.clubName.toLowerCase());
  const issuedLine = (r) => `Issued ${App.fmtDateTime(r.issuedAt)}${r.issuedByName ? ' by ' + r.issuedByName : ''}${r.revisedAt ? ' · revised ' + App.fmtDateTime(r.revisedAt) : ''}`;

  /** The label : value lines of the receipt (template order, plus mode and collector). */
  function rows(r) {
    const out = [['Recipient', r.recipient || r.clubName || '—']];
    if (showClub(r)) out.push(['Club', r.clubName]);
    out.push(
      ['On Account of', r.onAccountOf || r.headName || '—'],
      ['Amount', App.money(r.amount)],
      ['Amount in words', r.amountWords || App.amountInWords(r.amount)],
      ['Payment mode', methodText(r) || '—'],
      ['Collected by', App.collectorLabel(r) || '—'],
      ['Contact No', r.contact || '—'],
    );
    return out;
  }

  function statusChip(r) {
    if (r.status === 'cancelled') return chip('overdue', '✕', 'Cancelled', r.cancelReason || '');
    if (r.revisedAt) return chip('partial', '✎', 'Revised', 'Details updated ' + App.fmtDateTime(r.revisedAt));
    return chip('paid', '✓', 'Issued');
  }

  /* ---------- the receipt on screen (also what Print uses) ---------- */
  function receiptHtml(r) {
    const st = App.state.settings;
    const cancelled = r.status === 'cancelled';
    return `<article class="rcpt${cancelled ? ' is-cancelled' : ''}" aria-label="Payment e-receipt ${esc(r.no)}">
      <div class="rcpt-paper">
        <img class="rcpt-wm" src="assets/logo.webp" alt="">
        <div class="rcpt-logos"><img src="assets/lions-intl.png" alt="Lions International"><img src="assets/leo-logo.png" alt="Leo"><img src="assets/logo.webp" alt="${esc(district())} emblem"></div>
        <h3 class="rcpt-district">${esc(district().toUpperCase())}</h3>
        ${st.receiptSubtitle ? `<div class="rcpt-office">${esc(st.receiptSubtitle)}</div>` : ''}
        <div class="rcpt-meta">
          <div><b>DATE :</b> <span>${esc(dateText(r.date))}</span></div>
          <div><b>RECEIPT NO :</b> <span class="rcpt-no">${esc(r.no)}</span></div>
        </div>
        <div class="rcpt-title">PAYMENT E - RECEIPT</div>
        <dl class="rcpt-rows">${rows(r).map(([k, v]) => `<div class="${k === 'Amount' ? 'is-amount' : ''}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <p class="rcpt-note"><b>Note :</b> ${NOTE}</p>
        <p class="rcpt-foot">This is a computer-generated e-receipt. No signature is required.<br>${esc(issuedLine(r))}</p>
        <div class="rcpt-stamp" aria-hidden="true">${cancelled ? 'CANCELLED' : 'PAID'}</div>
      </div>
    </article>`;
  }

  /* ---------- the receipt drawn on a canvas (for the PDF and image files) ---------- */
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  let logosP = null;
  // Opened straight from a file (file://), drawn images would block saving the canvas, so leave the logos out there
  const logos = () => (location.protocol === 'file:' ? Promise.resolve([]) : (logosP = logosP || Promise.all(LOGOS.map(loadImg))));
  let fontsP = null;
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return (fontsP = fontsP || Promise.all(['800 40px Montserrat', '700 40px Montserrat', '400 40px Inter', '500 40px Inter', '600 40px Inter', '700 40px Inter']
      .map((f) => document.fonts.load(f).catch(() => null))));
  }

  function wrap(x, text, maxW) {
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (!line || x.measureText(t).width <= maxW) line = t; else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function fit(x, text, maxW) {
    let t = String(text == null ? '' : text);
    if (x.measureText(t).width <= maxW) return t;
    while (t.length > 1 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function dotted(x, x0, y, x1) {
    x.save();
    x.strokeStyle = '#a8968f'; x.lineWidth = 3; x.lineCap = 'round'; x.setLineDash([0.1, 9]);
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x1, y); x.stroke();
    x.restore();
  }
  function roundRect(x, X, Y, w, h, rad) {
    x.beginPath();
    x.moveTo(X + rad, Y);
    x.arcTo(X + w, Y, X + w, Y + h, rad); x.arcTo(X + w, Y + h, X, Y + h, rad);
    x.arcTo(X, Y + h, X, Y, rad); x.arcTo(X, Y, X + w, Y, rad);
    x.closePath();
  }
  function stamp(x, r, cx, cy, W, H) {
    x.save();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (r.status === 'cancelled') {
      x.translate(W / 2, H / 2); x.rotate(-0.3);
      x.globalAlpha = 0.75; x.strokeStyle = RED; x.fillStyle = RED; x.lineWidth = 9;
      x.font = `800 150px ${DISPLAY}`;
      const tw = x.measureText('CANCELLED').width + 90;
      roundRect(x, -tw / 2, -110, tw, 220, 26); x.stroke();
      x.fillText('CANCELLED', 0, 8);
    } else {
      x.translate(cx, cy); x.rotate(-0.2);
      x.globalAlpha = 0.72; x.strokeStyle = MAROON; x.fillStyle = MAROON;
      x.lineWidth = 6; roundRect(x, -150, -58, 300, 116, 18); x.stroke();
      x.lineWidth = 2; roundRect(x, -137, -45, 274, 90, 11); x.stroke();
      x.font = `800 66px ${DISPLAY}`; x.fillText('PAID', 0, 5);
    }
    x.restore();
  }

  /** Draws the receipt and returns the y where the content ends (used to size the page). */
  function paintReceipt(x, r, imgs, W, H) {
    const st = App.state.settings;
    const PAD = 150, LABEL_W = 400, VALUE_X = PAD + LABEL_W + 50, VALUE_R = W - PAD;
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    // frame: maroon outer line, gold inner line, gold corner diamonds
    x.strokeStyle = MAROON; x.lineWidth = 8; x.strokeRect(34, 34, W - 68, H - 68);
    x.strokeStyle = GOLD; x.lineWidth = 2.5; x.strokeRect(52, 52, W - 104, H - 104);
    x.fillStyle = GOLD;
    [[52, 52], [W - 52, 52], [52, H - 52], [W - 52, H - 52]].forEach(([cx, cy]) => { x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillRect(-9, -9, 18, 18); x.restore(); });
    // faint district emblem behind the details
    const emblem = imgs[2];
    if (emblem) {
      const wh = Math.min(H * 0.5, 600), ww = wh * emblem.naturalWidth / emblem.naturalHeight;
      x.globalAlpha = 0.05; x.drawImage(emblem, (W - ww) / 2, H * 0.6 - wh / 2, ww, wh); x.globalAlpha = 1;
    }
    // Lions · Leo · district logos
    let y = 92;
    const shown = imgs.filter(Boolean);
    if (shown.length) {
      const LH = 168, GAP = 30;
      const ws = shown.map((im) => LH * im.naturalWidth / im.naturalHeight);
      let lx = (W - ws.reduce((a, b) => a + b, 0) - GAP * (shown.length - 1)) / 2;
      shown.forEach((im, i) => { x.drawImage(im, lx, y, ws[i], LH); lx += ws[i] + GAP; });
      y += LH + 86;
    } else y += 60;
    // headings
    x.textBaseline = 'alphabetic'; x.textAlign = 'center';
    x.fillStyle = INK; x.font = `800 66px ${DISPLAY}`; x.fillText(district().toUpperCase(), W / 2, y);
    if (st.receiptSubtitle) { y += 48; x.fillStyle = MAROON; x.font = `700 30px ${DISPLAY}`; x.fillText(st.receiptSubtitle.toUpperCase(), W / 2, y); }
    // date (left) · receipt number (right)
    y += 76;
    const L = PAD - 50, R = W - PAD + 50;
    x.textAlign = 'left'; x.fillStyle = INK; x.font = `700 31px ${DISPLAY}`; x.fillText('DATE :', L, y);
    let w = x.measureText('DATE : ').width;
    x.font = `600 31px ${BODY}`; x.fillText(dateText(r.date), L + w, y);
    x.textAlign = 'right'; x.font = `700 31px ${BODY}`; x.fillStyle = MAROON; x.fillText(r.no, R, y);
    w = x.measureText(r.no).width;
    x.font = `700 31px ${DISPLAY}`; x.fillStyle = INK; x.fillText('RECEIPT NO : ', R - w, y);
    // title
    y += 92;
    x.textAlign = 'center'; x.font = `800 50px ${DISPLAY}`; x.fillText('PAYMENT  E - RECEIPT', W / 2, y);
    x.fillStyle = GOLD; x.fillRect(W / 2 - 130, y + 22, 260, 5);
    // label : value rows on dotted lines
    y += 118;
    let amountY = y;
    rows(r).forEach(([k, v]) => {
      x.textAlign = 'left'; x.fillStyle = INK; x.font = `400 37px ${BODY}`;
      x.fillText(k, PAD, y);
      x.fillText(':', PAD + LABEL_W, y);
      x.font = k === 'Amount' ? `700 38px ${BODY}` : `600 34px ${BODY}`;
      if (k === 'Amount') amountY = y;
      const lines = wrap(x, v, VALUE_R - VALUE_X);
      lines.forEach((ln, i) => { const ly = y + i * 48; x.fillStyle = INK; x.fillText(ln, VALUE_X, ly); dotted(x, VALUE_X, ly + 13, VALUE_R); });
      y += 80 + (lines.length - 1) * 48;
    });
    // confirmation note and footer
    y += 26;
    x.textAlign = 'left'; x.fillStyle = INK; x.font = `700 31px ${DISPLAY}`;
    wrap(x, 'Note : ' + NOTE, W - PAD * 2).forEach((ln) => { x.fillText(ln, PAD, y); y += 44; });
    y += 30;
    x.textAlign = 'center'; x.fillStyle = MUTED; x.font = `400 24px ${BODY}`;
    x.fillText('This is a computer-generated e-receipt. No signature is required.', W / 2, y);
    y += 34;
    x.fillText(issuedLine(r), W / 2, y);
    stamp(x, r, W - PAD - 190, amountY - 14, W, H);
    return y;
  }

  async function receiptCanvas(r) {
    await fontsReady();
    const imgs = await logos();
    const W = 1754;
    const probe = document.createElement('canvas');
    probe.width = W; probe.height = 8;
    const end = paintReceipt(probe.getContext('2d'), r, imgs, W, 1240);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Math.max(1240, Math.ceil(end + 96)); // at least A5 landscape proportions
    paintReceipt(cv.getContext('2d'), r, imgs, W, cv.height);
    return cv;
  }

  // Files are made once per receipt version, so Share can open straight away
  const cache = new Map();
  const keyOf = (r) => JSON.stringify([r.id, r.no, r.status, r.revisedAt || 0, App.state.settings.districtName, App.state.settings.receiptSubtitle]);
  function filesFor(r) {
    const k = keyOf(r);
    if (!cache.has(k)) {
      cache.set(k, (async () => {
        const cv = await receiptCanvas(r);
        const png = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the receipt'))), 'image/png'));
        const pdf = await App.files.pdf([cv], { pageWidthPt: 595.28, title: `Payment e-receipt ${r.no} - ${district()}` });
        return { png, pdf };
      })().catch((e) => { cache.delete(k); throw e; }));
    }
    return cache.get(k);
  }

  function shareMessage(r) {
    return [
      `Payment e-receipt — ${district()}`,
      `Receipt no: ${r.no}`,
      `Date: ${dateText(r.date)}`,
      `Recipient: ${r.recipient}`,
      showClub(r) ? `Club: ${r.clubName}` : null,
      `On account of: ${r.onAccountOf}`,
      `Amount: ${App.money(r.amount)} (${r.amountWords})`,
      `Payment mode: ${methodText(r)}`,
      `Collected by: ${App.collectorLabel(r)}`,
      r.status === 'cancelled' ? 'THIS RECEIPT HAS BEEN CANCELLED.' : null,
      '',
      `${NOTE}.`,
      'Computer-generated e-receipt — no signature required.',
    ].filter((l) => l !== null).join('\n');
  }

  /* ---------- receipt dialog ---------- */
  function show(id) {
    if (!App.receiptById(id)) { App.ui.toast('That receipt is not in the register.', 'error'); return; }
    App.ui.open({
      size: 'lg',
      live: true,
      title: 'Payment e-receipt',
      sub: () => { const r = App.receiptById(id); return r ? `${esc(r.no)} · ${esc(r.clubName || r.recipient)}` : ''; },
      render: () => {
        const r = App.receiptById(id);
        if (!r) return '<p style="margin:0">This receipt is no longer in the register.</p>';
        return `${r.status === 'cancelled' ? `<div class="callout danger" style="margin-bottom:12px">✕ Cancelled${r.cancelledAt ? ' on ' + esc(App.fmtDateTime(r.cancelledAt)) : ''}${r.cancelReason ? ' — ' + esc(r.cancelReason) : ''}${r.cancelledByName ? ' (' + esc(r.cancelledByName) + ')' : ''}. The number stays used, so the series has no gaps.</div>` : ''}
          <div class="rcpt-wrap">${receiptHtml(r)}</div>`;
      },
      footer: () => (App.receiptById(id)
        ? `<button class="btn no-phone" data-rc="print">🖨 Print</button>
           <button class="btn" data-rc="png">⤓ Image</button>
           <button class="btn" data-rc="pdf">⤓ PDF</button>
           <button class="btn btn-primary" data-rc="share">↗ Share</button>`
        : '<button class="btn btn-primary" data-close>Close</button>'),
      onMount: (el) => {
        const r = App.receiptById(id);
        if (!r) return;
        el.querySelectorAll('[data-rc]').forEach((b) => b.addEventListener('click', () => act(b.dataset.rc, App.receiptById(id), b)));
        filesFor(r).catch(() => {}); // get the files ready in the background
      },
    });
  }

  async function act(kind, r, btn) {
    if (!r) return;
    if (kind === 'print') { printReceipt(btn); return; }
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Preparing…';
    try {
      const f = await filesFor(r);
      if (kind === 'pdf') { App.files.save(fileBase(r) + '.pdf', f.pdf); App.ui.toast('Receipt saved as PDF'); }
      else if (kind === 'png') { App.files.save(fileBase(r) + '.png', f.png); App.ui.toast('Receipt saved as an image'); }
      else if (kind === 'share') {
        const shared = await App.files.share(f.pdf, fileBase(r) + '.pdf', { title: 'Payment receipt ' + r.no, text: shareMessage(r) });
        if (!shared) {
          const c = App.clubById(r.clubId);
          App.shareText({ title: 'Share receipt ' + r.no, text: shareMessage(r), phone: r.contact, email: c ? c.email : '', subject: `Payment receipt ${r.no} — ${district()}` });
        }
      }
    } catch (e) {
      console.error(e);
      App.ui.toast('Could not make the receipt file in this browser.', 'error');
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  function printReceipt(btn) {
    const ov = btn.closest('.overlay');
    if (!ov) return;
    ov.classList.add('print-me');
    document.body.classList.add('printing-receipt');
    const done = () => {
      document.body.classList.remove('printing-receipt');
      ov.classList.remove('print-me');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  /** Receipt button for a payment row: opens its receipt, or offers to issue one. mode: 'full' | 'short' | true (icon only). */
  function button(p, mode = 'short') {
    const r = p.receiptId && App.receiptById(p.receiptId);
    if (r) {
      const text = mode === true ? '' : ' ' + esc(mode === 'full' ? r.no : r.no.split('/').pop());
      return `<button type="button" class="btn btn-ghost btn-sm rcpt-btn${r.status === 'cancelled' ? ' is-cancelled' : ''}" data-action="view-receipt" data-id="${r.id}" title="Receipt ${esc(r.no)}" aria-label="View receipt ${esc(r.no)}">🧾${text}</button>`;
    }
    return App.can('payments') ? `<button type="button" class="btn btn-ghost btn-sm rcpt-btn" data-action="issue-receipt" data-id="${p.id}" title="Issue a numbered e-receipt for this payment">🧾${mode === true ? '' : ' Issue'}</button>` : '';
  }

  /* ---------- receipt register ---------- */
  const rv = { year: null, by: 'all', method: 'all', q: '' };

  function years() {
    const ys = new Set(App.state.receipts.map((r) => r.year));
    ys.add(Number(App.state.settings.startYear));
    return [...ys].filter((y) => !isNaN(y)).sort((a, b) => b - a);
  }
  function filtered(all) {
    const q = all ? '' : rv.q.toLowerCase();
    return App.state.receipts.filter((r) => {
      if (all) return true;
      if (rv.year !== 'all' && r.year !== rv.year) return false;
      if (rv.by !== 'all' && r.collectedBy !== rv.by) return false;
      if (rv.method !== 'all' && r.method !== rv.method) return false;
      return !q || [r.no, r.recipient, r.clubName, r.onAccountOf, r.reference, r.collectorName, r.contact, r.method].some((v) => (v || '').toLowerCase().includes(q));
    }).sort((a, b) => b.year - a.year || b.seq - a.seq);
  }
  function totals(list) {
    const live = list.filter((r) => r.status !== 'cancelled');
    const sum = (f) => Math.round(live.filter(f).reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
    return {
      count: list.length, cancelled: list.length - live.length,
      total: sum(() => true), cash: sum((r) => r.method === 'Cash'), bank: sum((r) => r.method !== 'Cash'),
      dt: sum((r) => r.collectedBy === 'DT'), dat: sum((r) => r.collectedBy === 'DAT'),
    };
  }
  const missingPayments = () => App.state.payments.filter((p) => !p.receiptId || !App.receiptById(p.receiptId));

  function renderRegister() {
    if (rv.year == null) rv.year = Number(App.state.settings.startYear);
    const miss = missingPayments();
    return `<div class="toolbar rcpt-filters">
        <select class="input" id="rcYear" aria-label="Leo year"><option value="all">All years</option>${years().map((y) => `<option value="${y}" ${rv.year === y ? 'selected' : ''}>${App.leoYearLabel(y)}</option>`).join('')}</select>
        ${seg('rcBy', rv.by, [{ value: 'all', label: 'All' }, { value: 'DT', label: 'DT' }, { value: 'DAT', label: 'DAT' }])}
        <select class="input" id="rcMethod" aria-label="Payment mode"><option value="all">Any mode</option>${App.METHODS.map((m) => `<option ${rv.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <span class="spacer"></span>
        <label class="search"><span class="sr-only">Search receipts</span><input type="search" id="rcSearch" placeholder="Receipt no., club, name…" value="${esc(rv.q)}"></label>
      </div>
      ${miss.length && App.can('payments') ? `<div class="callout rcpt-missing"><span>🧾 <b>${miss.length} payment${miss.length === 1 ? ' has' : 's have'} no e-receipt</b> — recorded before receipts were turned on, or saved without one.</span>
        <button class="btn btn-sm" data-action="issue-missing-receipts">Issue ${miss.length === 1 ? 'it' : 'them'} now</button></div>` : ''}
      <div id="rcList">${renderList()}</div>`;
  }

  function renderList() {
    const list = filtered();
    const t = totals(list);
    const live = t.count - t.cancelled;
    const head = `<div class="rcpt-sum">
        <div class="rs-item rs-main"><span>Total received</span><b>${App.money(t.total)}</b><small>${live} receipt${live === 1 ? '' : 's'}${t.cancelled ? ` · ${t.cancelled} cancelled` : ''}</small></div>
        <div class="rs-item"><span>Cash</span><b>${App.money(t.cash)}</b></div>
        <div class="rs-item"><span>Bank &amp; other</span><b>${App.money(t.bank)}</b></div>
        <div class="rs-item"><span>Collected by DT</span><b>${App.money(t.dt)}</b></div>
        <div class="rs-item"><span>Collected by DAT</span><b>${App.money(t.dat)}</b></div>
      </div>
      <div class="rcpt-export"><span class="hint">Download the receipts shown:</span>
        <button class="btn btn-sm" data-action="export-receipts-xlsx" data-perm="export" ${list.length ? '' : 'disabled'}>⤓ Excel (.xlsx)</button>
        <button class="btn btn-sm" data-action="export-receipts-pdf" data-perm="export" ${list.length ? '' : 'disabled'}>⤓ PDF</button></div>`;
    if (!list.length) {
      return head + `<div class="empty-sm">${App.state.receipts.length ? 'No receipts match these filters.' : 'No receipts yet. A numbered e-receipt is issued each time a payment is recorded.'}</div>`;
    }
    if (mobile()) {
      return head + `<ul class="log-cards">${list.map((r) => `<li class="log-card rcpt-card${r.status === 'cancelled' ? ' is-cancelled' : ''}">
          <div class="lc-top"><button class="rcpt-no-btn" data-action="view-receipt" data-id="${r.id}">🧾 ${esc(r.no)}</button><span class="hint">${App.fmtDate(r.date)}</span></div>
          <div class="lc-club"><b>${esc(r.recipient)}</b></div>
          ${showClub(r) ? `<div class="lc-sub">${esc(r.clubName)}</div>` : ''}
          <div class="lc-sub">${esc([r.onAccountOf, methodText(r)].filter(Boolean).join(' · '))}</div>
          <div class="lc-foot"><span class="by">${esc(r.collectedBy)}${r.collectorName ? ' · ' + esc(r.collectorName) : ''}</span><span class="rc-right"><b class="lc-amt">${App.money(r.amount)}</b>${statusChip(r)}</span></div>
        </li>`).join('')}</ul>`;
    }
    return head + `<div class="table-wrap"><table class="table rcpt-table">
      <thead><tr><th>Receipt no.</th><th>Date</th><th>Recipient</th><th>On account of</th><th class="num">Amount</th><th>Mode</th><th>Collected by</th><th>Status</th></tr></thead>
      <tbody>${list.map((r) => `<tr class="${r.status === 'cancelled' ? 'is-cancelled' : ''}">
        <td class="nowrap"><button class="rcpt-no-btn" data-action="view-receipt" data-id="${r.id}">🧾 ${esc(r.no)}</button></td>
        <td class="nowrap">${App.fmtDate(r.date)}</td>
        <td style="min-width:170px">${esc(r.recipient)}${showClub(r) ? `<div class="hint">${esc(r.clubName)}</div>` : r.contact ? `<div class="hint">${esc(r.contact)}</div>` : ''}</td>
        <td style="min-width:160px">${esc(r.onAccountOf)}</td>
        <td class="num"><strong class="rc-amt">${App.money(r.amount)}</strong></td>
        <td class="nowrap">${esc(r.method)}${r.reference ? `<div class="hint">${esc(r.reference)}</div>` : ''}</td>
        <td class="nowrap"><b>${esc(r.collectedBy)}</b>${r.collectorName ? `<div class="hint">${esc(r.collectorName)}</div>` : ''}</td>
        <td class="nowrap">${statusChip(r)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total received${t.cancelled ? ' (cancelled receipts not counted)' : ''}</td><td class="num">${App.money(t.total)}</td><td colspan="3"></td></tr></tfoot>
    </table></div>`;
  }

  function mountRegister(root) {
    const box = root.querySelector('#rcList');
    if (!box) return;
    const redraw = () => { box.innerHTML = renderList(); App.ui.applyPerms(box); };
    const yr = root.querySelector('#rcYear');
    yr.addEventListener('change', () => { rv.year = yr.value === 'all' ? 'all' : Number(yr.value); redraw(); });
    const md = root.querySelector('#rcMethod');
    md.addEventListener('change', () => { rv.method = md.value; redraw(); });
    const q = root.querySelector('#rcSearch');
    q.addEventListener('input', () => { rv.q = q.value; redraw(); });
    const segBtns = root.querySelectorAll('[data-seg="rcBy"] button');
    segBtns.forEach((b) => b.addEventListener('click', () => {
      rv.by = b.dataset.value;
      segBtns.forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      redraw();
    }));
  }

  /* ---------- register downloads ---------- */
  function exportInfo(all) {
    const me = App.auth.current();
    const parts = [];
    if (all) parts.push('All receipts');
    else {
      parts.push(rv.year === 'all' ? 'All Leo years' : 'Leo year ' + App.leoYearLabel(rv.year));
      if (rv.by !== 'all') parts.push('Collected by ' + rv.by);
      if (rv.method !== 'all') parts.push(rv.method);
      if (rv.q) parts.push(`Search "${rv.q}"`);
    }
    const tag = all || rv.year === 'all' ? 'all-years' : App.leoYearLabel(rv.year).replace('/', '-');
    return {
      filter: parts.join(' · '),
      generated: `Generated ${App.fmtDateTime(Date.now())}${me ? ' by ' + me.name : ''}`,
      name: (ext) => `receipt-register-${tag}-${App.todayISO()}.${ext}`,
    };
  }
  const registerOrder = (list) => list.slice().sort((a, b) => a.year - b.year || a.seq - b.seq);

  function exportXlsx(all) {
    const list = registerOrder(filtered(all));
    if (!list.length) { App.ui.toast('There are no receipts to download.', 'error'); return; }
    const info = exportInfo(all);
    const t = totals(list);
    const columns = [
      { header: 'Receipt no.', width: 22 }, { header: 'Date', width: 13, type: 'date' }, { header: 'Recipient', width: 28, type: 'wrap' },
      { header: 'Club', width: 28, type: 'wrap' }, { header: 'Club type', width: 9 }, { header: 'On account of', width: 32, type: 'wrap' },
      { header: 'Amount (Rs.)', width: 14, type: 'money' }, { header: 'Amount in words', width: 46, type: 'wrap' },
      { header: 'Payment mode', width: 15 }, { header: 'Reference', width: 14 }, { header: 'Collected by', width: 11 },
      { header: 'Collector name', width: 24 }, { header: 'Contact no.', width: 15 }, { header: 'Status', width: 11 },
      { header: 'Issued at', width: 18 }, { header: 'Issued by', width: 22 }, { header: 'Remarks', width: 34, type: 'wrap' },
    ];
    const rowsOut = list.map((r) => [
      r.no, r.date, r.recipient, r.clubName, r.clubType ? App.typeLabel(r.clubType) : '', r.onAccountOf,
      r.amount, r.amountWords, r.method, r.reference, r.collectedBy, r.collectorName, r.contact,
      r.status === 'cancelled' ? 'Cancelled' : r.revisedAt ? 'Revised' : 'Issued',
      App.fmtDateTime(r.issuedAt), r.issuedByName,
      r.status === 'cancelled' ? `Cancelled ${App.fmtDateTime(r.cancelledAt)}${r.cancelReason ? ' — ' + r.cancelReason : ''}${r.cancelledByName ? ' (' + r.cancelledByName + ')' : ''}`
        : r.revisedAt ? `Revised ${App.fmtDateTime(r.revisedAt)}${r.revisedByName ? ' by ' + r.revisedByName : ''}` : '',
    ]);
    const blank = () => columns.map(() => '');
    const line = (label, value) => { const row = blank(); row[0] = label; row[6] = value; return row; };
    const blob = App.files.xlsx({
      sheetName: 'Receipts',
      title: `${district()} — Receipt register`,
      subtitle: `${info.filter} · ${t.count} receipt${t.count === 1 ? '' : 's'}${t.cancelled ? ` (${t.cancelled} cancelled, not counted in totals)` : ''} · ${info.generated}`,
      columns, rows: rowsOut,
      totals: [
        line('Total received', t.total), line('Cash', t.cash), line('Bank & other', t.bank),
        line('Collected by DT', t.dt), line('Collected by DAT', t.dat),
      ],
    });
    App.files.save(info.name('xlsx'), blob);
    App.ui.toast('Receipt register downloaded (Excel)');
  }

  async function registerCanvases(list, info) {
    await fontsReady();
    const imgs = await logos();
    const st = App.state.settings;
    const W = 1754, H = 1240, M = 70;
    const cols = [
      { label: 'Receipt no.', w: 285 }, { label: 'Date', w: 165 }, { label: 'Recipient', w: 305 },
      { label: 'On account of', w: 295 }, { label: 'Mode', w: 190 }, { label: 'Collected by', w: 190 },
      { label: 'Amount (Rs.)', w: 184, right: true },
    ];
    const TOP = 230, HEAD = 50, ROW = 58, BOTTOM = 96, SUMMARY = 200;
    const per = Math.floor((H - TOP - HEAD - BOTTOM) / ROW);
    const t = totals(list);
    const pages = [];
    for (let i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
    if (!pages.length) pages.push([]);
    if (TOP + HEAD + pages[pages.length - 1].length * ROW + SUMMARY > H - BOTTOM + 40) pages.push([]);
    const n = pages.length;
    return pages.map((pageRows, pi) => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
      x.fillStyle = MAROON; x.fillRect(0, 0, W, 12);
      x.fillStyle = GOLD; x.fillRect(0, 12, W, 4);
      // heading: logos, title, filter, date
      let lx = M;
      imgs.filter(Boolean).forEach((im) => { const w = 96 * im.naturalWidth / im.naturalHeight; x.drawImage(im, lx, 50, w, 96); lx += w + 14; });
      const tx = lx === M ? M : lx + 18;
      x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      x.fillStyle = INK; x.font = `800 40px ${DISPLAY}`; x.fillText('RECEIPT REGISTER', tx, 88);
      x.fillStyle = MAROON; x.font = `700 23px ${DISPLAY}`; x.fillText(district().toUpperCase() + (st.receiptSubtitle ? ' · ' + st.receiptSubtitle.toUpperCase() : ''), tx, 122);
      x.fillStyle = MUTED; x.font = `400 21px ${BODY}`; x.fillText(info.filter, tx, 154);
      x.textAlign = 'right'; x.fillText(info.generated, W - M, 88); x.fillText(`Page ${pi + 1} of ${n}`, W - M, 122);
      // table
      let y = TOP;
      x.fillStyle = MAROON; x.fillRect(M, y, W - 2 * M, HEAD);
      x.fillStyle = '#fff'; x.font = `700 19px ${DISPLAY}`;
      let cx = M;
      cols.forEach((c) => { x.textAlign = c.right ? 'right' : 'left'; x.fillText(c.label.toUpperCase(), c.right ? cx + c.w - 14 : cx + 14, y + 32); cx += c.w; });
      y += HEAD;
      pageRows.forEach((r, ri) => {
        const cancelled = r.status === 'cancelled';
        if (ri % 2) { x.fillStyle = '#fcf7ea'; x.fillRect(M, y, W - 2 * M, ROW); }
        x.fillStyle = '#ece2d6'; x.fillRect(M, y + ROW - 1, W - 2 * M, 1);
        const cells = [
          [r.no, cancelled ? 'CANCELLED' : r.revisedAt ? 'Revised' : ''],
          [dateText(r.date), ''],
          [r.recipient, showClub(r) ? r.clubName : r.contact],
          [r.onAccountOf, ''],
          [r.method, r.reference],
          [r.collectedBy, r.collectorName],
          [App.money(r.amount).replace('Rs. ', ''), ''],
        ];
        cx = M;
        cells.forEach(([main, sub], ci) => {
          const c = cols[ci], pad = 14, maxW = c.w - pad * 2;
          const ax = c.right ? cx + c.w - pad : cx + pad;
          x.textAlign = c.right ? 'right' : 'left';
          x.fillStyle = cancelled ? MUTED : INK;
          x.font = `${ci === 0 || ci === 6 ? 700 : 500} 21px ${BODY}`;
          const my = sub ? y + 26 : y + 36;
          const txt = fit(x, main, maxW);
          x.fillText(txt, ax, my);
          if (cancelled && ci === 6) { const tw = x.measureText(txt).width; x.fillRect(ax - tw, my - 7, tw, 2); }
          if (sub) {
            x.font = `${cancelled && ci === 0 ? 700 : 400} 17px ${BODY}`;
            x.fillStyle = cancelled && ci === 0 ? RED : MUTED;
            x.fillText(fit(x, sub, maxW), ax, y + 48);
          }
          cx += c.w;
        });
        y += ROW;
      });
      if (pi === n - 1) {
        y += 30;
        x.fillStyle = '#f8eed7'; x.fillRect(M, y, W - 2 * M, 150);
        x.fillStyle = GOLD; x.fillRect(M, y, 6, 150);
        const items = [['Total received', t.total], ['Cash', t.cash], ['Bank & other', t.bank], ['Collected by DT', t.dt], ['Collected by DAT', t.dat]];
        const colW = (W - 2 * M - 40) / items.length;
        items.forEach(([k, v], i) => {
          const ix = M + 30 + i * colW;
          x.textAlign = 'left';
          x.fillStyle = MUTED; x.font = `600 18px ${BODY}`; x.fillText(k.toUpperCase(), ix, y + 48);
          x.fillStyle = i ? INK : MAROON; x.font = `800 ${i ? 25 : 29}px ${DISPLAY}`; x.fillText(fit(x, App.money(v), colW - 16), ix, y + 90);
        });
        x.fillStyle = MUTED; x.font = `400 18px ${BODY}`;
        x.fillText(`${t.count} receipt${t.count === 1 ? '' : 's'} listed${t.cancelled ? ` · ${t.cancelled} cancelled (not counted in the totals)` : ''}.`, M + 30, y + 130);
      }
      x.textAlign = 'left'; x.fillStyle = MUTED; x.font = `400 18px ${BODY}`;
      x.fillText(`${district()} · Receipt register · computer-generated`, M, H - 46);
      x.textAlign = 'right'; x.fillText(`Page ${pi + 1} of ${n}`, W - M, H - 46);
      return cv;
    });
  }

  async function exportPdf(all, btn) {
    const list = registerOrder(filtered(all));
    if (!list.length) { App.ui.toast('There are no receipts to download.', 'error'); return; }
    if (btn && !btn.isConnected) btn = null;
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Preparing…'; }
    try {
      const info = exportInfo(all);
      const pages = await registerCanvases(list, info);
      const blob = await App.files.pdf(pages, { pageWidthPt: 841.89, title: `${district()} - Receipt register` });
      App.files.save(info.name('pdf'), blob);
      App.ui.toast(`Receipt register downloaded (PDF, ${pages.length} page${pages.length === 1 ? '' : 's'})`);
    } catch (e) {
      console.error(e);
      App.ui.toast('Could not make the PDF in this browser.', 'error');
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  /* ---------- issuing receipts for payments that have none ---------- */
  /** Older payments have no receipt details: fill them from the club and from who recorded the payment. */
  function fillReceiptDetails(s, p) {
    const c = s.clubs.find((x) => x.id === p.clubId);
    if (!p.payer) p.payer = c ? c.name : '';
    if (!p.payerPhone) p.payerPhone = c ? c.treasurerPhone || c.phone || '' : '';
    if (!p.collectedBy) {
      const u = p.byId && App.auth.users().find((x) => x.id === p.byId);
      p.collectedBy = u && u.role === 'asst_treasurer' ? 'DAT' : 'DT';
      if (!p.collectorName) p.collectorName = u && (u.role === 'asst_treasurer' || u.role === 'treasurer') ? u.name : p.collectedBy === 'DT' ? s.settings.treasurerName || '' : '';
    }
  }

  Object.assign(App.actions, {
    'view-receipt': (el) => show(el.dataset.id),
    'issue-receipt': (el) => {
      if (!App.state.payments.some((x) => x.id === el.dataset.id)) return;
      let rid = null;
      App.commit((s) => {
        const p = s.payments.find((x) => x.id === el.dataset.id);
        if (p.receiptId && s.receipts.some((r) => r.id === p.receiptId)) { rid = p.receiptId; return; }
        fillReceiptDetails(s, p);
        rid = App.issueReceipt(s, p, App.auth.stamp()).id;
      });
      show(rid);
    },
    'issue-missing-receipts': async () => {
      const miss = missingPayments();
      if (!miss.length) return;
      const ok = await App.ui.confirm({
        title: `Issue ${miss.length} receipt${miss.length === 1 ? '' : 's'}?`, confirmText: 'Issue receipts',
        message: `Each payment without a receipt gets the next number, in order of payment date. Recipient and contact are taken from the club, and “collected by” from who recorded the payment — you can correct any of them by editing the payment.`,
      });
      if (!ok) return;
      const by = App.auth.stamp();
      App.commit((s) => {
        s.payments.filter((p) => !p.receiptId || !s.receipts.some((r) => r.id === p.receiptId))
          .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt)
          .forEach((p) => { fillReceiptDetails(s, p); App.issueReceipt(s, p, by); });
      });
      App.ui.toast(`${miss.length} receipt${miss.length === 1 ? '' : 's'} issued`);
    },
    'export-receipts-xlsx': (el) => exportXlsx(!!(el && el.dataset.scope === 'all')),
    'export-receipts-pdf': (el) => exportPdf(!!(el && el.dataset.scope === 'all'), el),
  });

  App.receipts = { show, button, receiptHtml, renderRegister, mountRegister, filesFor, totals };
})();
