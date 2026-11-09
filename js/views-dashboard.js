/* =========================================================
   Dashboard — headline numbers, report & collection progress,
   items needing attention, recent activity
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, typeBadge, chip, meter, emptyState } = App.ui;

  function render() {
    const s = App.state;
    const today = App.todayISO();
    const cur = App.currentReportMonth();
    const clubs = s.clubs;
    const alpha = clubs.filter((c) => c.type === 'alpha').length;
    const omega = clubs.length - alpha;

    const head = `
      <div class="page-head">
        <div>
          <div class="eyebrow">Leo Year ${App.leoYearLabel()} · ${App.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h1 class="page-title">Treasury overview</h1>
          <p class="lede">${App.auth.current() ? 'Welcome, ' + esc(App.auth.current().name) + '. ' : ''}Club treasurer reports, district payments and notes for every club, in one place.</p>
        </div>
        <div class="head-actions">
          <a class="btn" href="#/reports">✓ Mark reports</a>
          <button class="btn btn-primary" data-action="new-payment" data-perm="payments">+ Record payment</button>
        </div>
      </div>`;

    if (!clubs.length) {
      return `<section class="view">${head}${emptyState({
        title: 'Welcome to the treasury portal',
        text: 'Start by adding the clubs of the district — Alpha and Omega. You can add them one by one, paste a list, or load sample data to explore first.',
        actions: `<button class="btn btn-primary" data-action="add-club" data-perm="clubs">+ Add a club</button>
                  <button class="btn" data-action="bulk-clubs" data-perm="clubs">Paste a club list</button>
                  <button class="btn btn-gold" data-action="load-demo" data-perm="danger">Load sample data</button>`,
      })}</section>`;
    }

    // --- KPIs
    const curSubmitted = clubs.filter((c) => ['ok', 'late'].includes(App.reportStatus(c.id, cur.key).code)).length;
    const curRequired = clubs.filter((c) => App.reportStatus(c.id, cur.key).code !== 'na').length;
    const curOverdue = clubs.filter((c) => App.reportStatus(c.id, cur.key).code === 'overdue').length;
    const tot = App.overallTotals();

    const kpis = `
      <div class="kpi-row">
        <div class="kpi kpi-maroon">
          <div class="kpi-label">Clubs in the district</div>
          <div class="kpi-value">${clubs.length}</div>
          <div class="kpi-foot">${typeBadge('omega')} ${omega} &nbsp; ${typeBadge('alpha')} ${alpha}</div>
        </div>
        <div class="kpi kpi-maroon">
          <div class="kpi-label">${esc(cur.label)} reports</div>
          <div class="kpi-value">${curSubmitted} <small>/ ${curRequired}</small></div>
          ${meter(curSubmitted, curRequired, 'maroon thin')}
          <div class="kpi-foot">Due ${App.fmtDate(App.reportDueDate(cur.key))}${curOverdue ? ` · ${chip('overdue', '!', curOverdue + ' overdue')}` : ''}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Collected this year</div>
          <div class="kpi-value">${App.moneyShort(tot.collected)}</div>
          ${meter(tot.collected, tot.expected, 'thin')}
          <div class="kpi-foot">${App.pct(tot.collected, tot.expected)}% of ${App.money(tot.expected, false)} expected</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Outstanding from clubs</div>
          <div class="kpi-value">${App.moneyShort(tot.outstanding)}</div>
          <div class="kpi-foot"><span>${tot.clubsOwing} club${tot.clubsOwing === 1 ? '' : 's'} with a balance</span><a class="card-link" href="#/payments">View matrix →</a></div>
        </div>
      </div>`;

    // --- Reports by month
    const months = App.leoMonths();
    const reportList = months.map((m) => {
      const req = clubs.filter((c) => App.reportStatus(c.id, m.key).code !== 'na').length;
      const done = clubs.filter((c) => ['ok', 'late'].includes(App.reportStatus(c.id, m.key).code)).length;
      const ended = App.monthEnded(m.key);
      const cls = m.key === cur.key ? 'is-current' : !ended ? 'is-future' : '';
      return `<li class="${cls}"><span class="ml-name">${m.label}</span><span class="ml-val">${ended ? `${done} / ${req} · ${App.pct(done, req)}%` : 'Not yet due'}</span>${meter(done, req, 'maroon thin')}</li>`;
    }).join('');

    // --- Collections by payment type
    const heads = s.paymentHeads;
    const headList = heads.length ? `<ul class="meter-list">${heads.map((h) => {
      const t = App.headTotals(h);
      return `<li><span class="ml-name">${esc(h.name)} <small>· ${t.settled}/${t.applicable} clubs settled</small></span>
        <span class="ml-val">${App.money(t.collected, false)} / ${App.money(t.expected, false)}</span>${meter(t.collected, t.expected, 'thin')}</li>`;
    }).join('')}</ul>` : `<div class="empty-sm">No payment types yet. <a href="#/payments/types">Create the district payments</a> you collect from clubs.</div>`;

    // --- Needs attention
    const attention = [];
    clubs.forEach((c) => {
      const overdueMonths = months.filter((m) => App.reportStatus(c.id, m.key).code === 'overdue');
      if (overdueMonths.length) attention.push({ c, ico: '!', kind: 'warn', t: `${overdueMonths.length} report${overdueMonths.length > 1 ? 's' : ''} overdue`, s: overdueMonths.map((m) => m.short).join(', '), w: 2 + overdueMonths.length });
      const ps = App.clubPaymentSummary(c);
      if (ps.overdue) attention.push({ c, ico: '₨', kind: 'warn', t: `${ps.overdue} payment${ps.overdue > 1 ? 's' : ''} overdue`, s: 'Balance ' + App.money(ps.balance, false), w: 2 + ps.overdue });
    });
    s.notes.filter((n) => n.tag === 'followup' && !n.done).forEach((n) => {
      const c = App.clubById(n.clubId);
      if (c) attention.push({ c, ico: '✎', kind: 'note', t: 'Open follow-up', s: n.text.length > 70 ? n.text.slice(0, 70) + '…' : n.text, w: 1 });
    });
    App.dueReminders().forEach((n) => {
      const c = App.clubById(n.clubId);
      if (c) attention.push({ c, ico: '⏰', kind: 'note', t: 'Reminder' + (n.remindOn ? ' · ' + App.fmtDate(n.remindOn, { day: 'numeric', month: 'short' }) : ''), s: n.text.length > 70 ? n.text.slice(0, 70) + '…' : n.text, w: 1.5 });
    });
    attention.sort((a, b) => b.w - a.w);
    const attHtml = attention.length ? `<ul class="list">${attention.slice(0, 8).map((a) => `
      <li><span class="li-ico ${a.kind}" aria-hidden="true">${a.ico}</span>
        <div class="li-body"><div class="t"><button class="club-name-btn link-btn" data-action="open-club" data-id="${a.c.id}">${esc(a.c.name)}</button> ${typeBadge(a.c.type)}</div>
        <div class="s">${esc(a.t)} — ${esc(a.s)}</div></div></li>`).join('')}</ul>
      ${attention.length > 8 ? `<p class="hint" style="margin:8px 0 0">+ ${attention.length - 8} more</p>` : ''}`
      : `<div class="empty-sm">✓ Nothing overdue. All clubs are up to date.</div>`;

    // --- Recent activity
    const acts = [];
    s.payments.forEach((p) => acts.push({ ts: p.createdAt, kind: 'pay', p }));
    s.notes.forEach((n) => acts.push({ ts: n.createdAt, kind: 'note', n }));
    acts.sort((a, b) => b.ts - a.ts);
    const actHtml = acts.length ? `<ul class="list">${acts.slice(0, 7).map((a) => {
      if (a.kind === 'pay') {
        const c = App.clubById(a.p.clubId), h = App.headById(a.p.headId);
        return `<li><span class="li-ico pay" aria-hidden="true">₨</span><div class="li-body"><div class="t">${esc(c ? c.name : 'Unknown club')}</div>
          <div class="s">${esc(h ? h.name : 'Payment')} · ${esc(a.p.method || '')} · ${App.fmtDate(a.p.date)}${a.p.byName ? ' · by ' + esc(a.p.byName) : ''}</div></div><span class="li-side">${App.money(a.p.amount, false)}</span></li>`;
      }
      const c = App.clubById(a.n.clubId);
      return `<li><span class="li-ico note" aria-hidden="true">✎</span><div class="li-body"><div class="t">${esc(c ? c.name : 'Unknown club')} <span class="hint">· ${App.relTime(a.n.createdAt)}${a.n.byName ? ' · by ' + esc(a.n.byName) : ''}</span></div>
        <div class="s">${esc(a.n.text.length > 90 ? a.n.text.slice(0, 90) + '…' : a.n.text)}</div></div></li>`;
    }).join('')}</ul>` : `<div class="empty-sm">Payments and notes you record will show up here.</div>`;

    return `<section class="view">${head}${App.pwa ? App.pwa.installCard() : ''}${kpis}
      <div class="grid-2">
        <div class="card framed">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">✓</span>Treasurer reports by month</h2><a class="card-link" href="#/reports">Open register →</a></div>
          <ul class="meter-list">${reportList}</ul>
        </div>
        <div class="stack">
          <div class="card framed">
            <div class="card-head"><h2 class="card-title"><span class="ttl-ico">₨</span>Collections by payment</h2><a class="card-link" href="#/payments">Payments →</a></div>
            ${headList}
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title"><span class="ttl-ico">!</span>Needs attention</h2><span class="card-sub">${attention.length} item${attention.length === 1 ? '' : 's'}</span></div>
            ${attHtml}
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">◷</span>Recent activity</h2><a class="card-link" href="#/payments/log">Payment log →</a></div>
          ${actHtml}
        </div>
        <div class="card">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">📣</span>District notices</h2><button class="btn btn-sm" data-action="new-notice" data-perm="notes">+ New notice</button></div>
          ${s.notices.length ? `<ul class="notice-list">${s.notices.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt).slice(0, 3).map((n) => App.noticeItem(n, true)).join('')}</ul>` : '<div class="empty-sm">No notices yet. Post one to all clubs, Omega or Alpha clubs, or a single club.</div>'}
        </div>
      </div>
    </section>`;
  }

  App.views = App.views || {};
  App.views.dashboard = { render, title: 'Dashboard' };
})();
