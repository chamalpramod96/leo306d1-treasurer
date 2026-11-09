/* =========================================================
   Treasurer Reports — monthly submission register (Jul → Jun)
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, typeBadge, chip, seg, emptyState, formData } = App.ui;

  const vs = { type: 'all', q: '', quick: false, month: null };

  const LEGEND = [
    ['ok', '✓', 'Submitted'], ['late', '✓', 'Submitted late'], ['pending', '…', 'Awaiting (before due date)'],
    ['overdue', '!', 'Overdue'], ['na', 'N/A', 'Not required'], ['future', '·', 'Month in progress'],
  ];

  function render() {
    const s = App.state;
    const months = App.leoMonths();
    const cur = App.currentReportMonth();
    if (!vs.month || !months.some((m) => m.key === vs.month)) vs.month = cur.key;
    if (!App.can('reports')) vs.quick = false;
    const focus = months.find((m) => m.key === vs.month);

    const head = `
      <div class="page-head">
        <div>
          <div class="eyebrow">Monthly club treasurer reports · Leo Year ${App.leoYearLabel()}</div>
          <h1 class="page-title">Treasurer Report Register</h1>
          <p class="lede">Reports are due on day ${s.settings.reportDueDay} of the following month. ${App.can('reports') ? 'Click a month cell to mark a report as received.' : 'Click a month cell to see details. Your role can view reports.'}</p>
          <p class="lede lede-m">Due day ${s.settings.reportDueDay} of the next month. ${App.can('reports') ? 'Pick a month, then tap a club’s status to mark it.' : 'Pick a month, then tap a club to see details.'}</p>
        </div>
        <div class="head-actions">
          <button class="btn" data-action="export-reports" data-perm="export">⤓ Export CSV</button>
          <button class="btn no-phone" onclick="window.print()">⎙ Print</button>
        </div>
      </div>`;

    if (!s.clubs.length) {
      return `<section class="view">${head}${emptyState({ title: 'No clubs yet', text: 'Add clubs first, then mark their monthly treasurer reports here.', actions: '<button class="btn btn-primary" data-action="add-club" data-perm="clubs">+ Add a club</button>' })}</section>`;
    }

    // summary for focus month
    const counts = { ok: 0, late: 0, pending: 0, overdue: 0, na: 0, future: 0 };
    s.clubs.filter((c) => vs.type === 'all' || c.type === vs.type).forEach((c) => counts[App.reportStatus(c.id, focus.key).code]++);
    const required = counts.ok + counts.late + counts.pending + counts.overdue + counts.future;

    const nAlpha = s.clubs.filter((c) => c.type === 'alpha').length;
    const toolbar = `
      <div class="toolbar">
        ${seg('repType', vs.type, [{ value: 'all', label: 'All', count: s.clubs.length }, { value: 'omega', label: 'Ω Omega', count: s.clubs.length - nAlpha }, { value: 'alpha', label: 'α Alpha', count: nAlpha }])}
        <label class="switch" data-perm="reports" title="When on, one tap marks a report as submitted today (tap again to clear)"><input type="checkbox" id="quickMark" ${vs.quick ? 'checked' : ''}> Quick mark</label>
        <span class="spacer"></span>
        <label class="search"><span class="sr-only">Search clubs</span><input type="search" id="repSearch" placeholder="Search clubs…" value="${esc(vs.q)}"></label>
      </div>`;

    // Phone: month chips + one status button per club for the chosen month
    if (App.isMobile && App.isMobile()) {
      return `<section class="view ${vs.quick ? 'quickmark-on' : ''}">${head}
        <div class="month-chips" role="group" aria-label="Report month">${months.map((m) => {
          const ended = App.monthEnded(m.key);
          const list = s.clubs.filter((c) => vs.type === 'all' || c.type === vs.type);
          const req = list.filter((c) => App.reportStatus(c.id, m.key).code !== 'na').length;
          const done = list.filter((c) => ['ok', 'late'].includes(App.reportStatus(c.id, m.key).code)).length;
          return `<button type="button" class="mchip ${m.key === focus.key ? 'on' : ''} ${m.key === cur.key ? 'is-current' : ''} ${ended || m.key === cur.key ? '' : 'is-future'}" data-month="${m.key}" aria-pressed="${m.key === focus.key}"><b>${m.short}</b><small>${ended || done ? `${done}/${req}` : m.y}</small></button>`;
        }).join('')}</div>
        <div class="rep-month">
          <div><b>${focus.label}</b>${focus.key === cur.key ? ' <span class="chip future">Current</span>' : ''}<div class="hint">Due ${App.fmtDate(App.reportDueDate(focus.key))}</div></div>
          <div class="rm-count"><b>${counts.ok + counts.late}</b> / ${required}<small>received</small></div>
          ${App.ui.meter(counts.ok + counts.late, required, 'maroon thin')}
          <div class="rm-chips">${chip('ok', '✓', counts.ok + ' on time')}${chip('late', '✓', counts.late + ' late')}${chip('pending', '…', (counts.pending + counts.future) + ' awaiting')}${chip('overdue', '!', counts.overdue + ' overdue')}</div>
        </div>
        ${toolbar}
        <div id="repTable">${renderTable(months, cur)}</div>
      </section>`;
    }

    return `<section class="view ${vs.quick ? 'quickmark-on' : ''}">${head}${toolbar}

      <div class="card framed" style="margin-bottom:16px">
        <div class="card-head">
          <h2 class="card-title"><span class="ttl-ico">✓</span>
            <label for="focusMonth" class="sr-only">Summary month</label>
            <select id="focusMonth" class="input" style="width:auto;min-height:34px;padding:4px 10px;font-weight:700;color:var(--maroon-700)">
              ${months.map((m) => `<option value="${m.key}" ${m.key === focus.key ? 'selected' : ''}>${m.label}${m.key === cur.key ? ' (current)' : ''}</option>`).join('')}
            </select>
          </h2>
          <span class="card-sub">Due ${App.fmtDate(App.reportDueDate(focus.key))}</span>
        </div>
        <div class="summary-strip" style="margin:0">
          <div class="mini-stat"><div class="lbl">Received</div><div class="val">${counts.ok + counts.late} <small class="hint">/ ${required}</small></div>${App.ui.meter(counts.ok + counts.late, required, 'maroon thin')}</div>
          <div class="mini-stat"><div class="lbl">${chip('ok', '✓', 'On time')}</div><div class="val">${counts.ok}</div></div>
          <div class="mini-stat"><div class="lbl">${chip('late', '✓', 'Late')}</div><div class="val">${counts.late}</div></div>
          <div class="mini-stat"><div class="lbl">${chip('pending', '…', 'Awaiting')}</div><div class="val">${counts.pending + counts.future}</div></div>
          <div class="mini-stat"><div class="lbl">${chip('overdue', '!', 'Overdue')}</div><div class="val">${counts.overdue}</div></div>
        </div>
      </div>

      <div class="legend" style="margin-bottom:10px">${LEGEND.map(([c, i, l]) => `<span class="rcell s-${c}" style="width:30px;height:24px;font-size:12px;cursor:default" aria-hidden="true">${i}</span><span>${l}</span>`).join('')}
        <span class="rcell" style="width:30px;height:24px;cursor:default;border:1px solid var(--line-strong)" aria-hidden="true"><span class="dot-remark"></span></span><span>Has a remark</span></div>
      <div id="repTable">${renderTable(months, cur)}</div>
    </section>`;
  }

  const SHORT = { ok: 'Submitted', late: 'Late', pending: 'Awaiting', overdue: 'Overdue', na: 'N/A', future: 'In progress' };

  /** Phone list: each club with a dot strip for the year and a big status button for the chosen month. */
  function renderList(months) {
    const q = vs.q.toLowerCase();
    const groups = vs.type === 'all' ? ['omega', 'alpha'] : [vs.type];
    const focus = months.find((m) => m.key === vs.month) || months[0];
    let html = '';
    groups.forEach((t) => {
      const list = App.clubsSorted(t).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.zone || '').toLowerCase().includes(q));
      if (!list.length) return;
      html += `<div class="section-title"><span class="section-mark ${t}">${t === 'omega' ? 'Ω' : 'α'}</span><h3>${t === 'omega' ? 'Omega' : 'Alpha'} clubs</h3><span class="rule"></span><span class="muted">${list.length}</span></div>
        <ul class="rep-list">${list.map((c) => {
          let got = 0, req = 0;
          const dots = months.map((m) => {
            const st = App.reportStatus(c.id, m.key);
            if (st.code === 'ok' || st.code === 'late') got++;
            if (st.code !== 'na' && st.code !== 'future') req++;
            return `<i class="s-${st.code} ${m.key === focus.key ? 'is-focus' : ''}"></i>`;
          }).join('');
          const st = App.reportStatus(c.id, focus.key);
          const tip = `${focus.label}: ${st.label}${st.date ? ' on ' + App.fmtDate(st.date) : ''}${st.remark ? ' — ' + st.remark : ''}`;
          return `<li>
            <div class="rl-main">
              <button class="club-name-btn" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button>
              <div class="rl-sub">${typeBadge(c.type)}<span>${got}/${req} on file</span></div>
              <div class="rl-dots" aria-hidden="true">${dots}</div>
            </div>
            <button type="button" class="rcell rstat s-${st.code}" data-action="report-cell" data-club="${c.id}" data-month="${focus.key}" aria-label="${esc(c.name)} — ${esc(tip)}"><span aria-hidden="true">${esc(st.icon)}</span>${SHORT[st.code]}${st.remark ? '<span class="dot-remark" aria-hidden="true"></span>' : ''}</button>
          </li>`;
        }).join('')}</ul>`;
    });
    return html || `<div class="empty-sm">No clubs match your search.</div>`;
  }

  function renderTable(months, cur) {
    if (App.isMobile && App.isMobile()) return renderList(months);
    const q = vs.q.toLowerCase();
    const groups = vs.type === 'all' ? ['omega', 'alpha'] : [vs.type];
    let rows = '';
    groups.forEach((t) => {
      const list = App.clubsSorted(t).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.zone || '').toLowerCase().includes(q));
      if (!list.length) return;
      if (groups.length > 1) rows += `<tr><th colspan="${months.length + 2}" class="sticky-col" style="background:var(--gold-50);color:var(--gold-800);font-size:12px;letter-spacing:.08em;text-transform:uppercase">${t === 'omega' ? 'Ω Omega clubs' : 'α Alpha clubs'} · ${list.length}</th></tr>`;
      rows += list.map((c) => {
        let got = 0, req = 0;
        const cells = months.map((m) => {
          const st = App.reportStatus(c.id, m.key);
          if (st.code === 'ok' || st.code === 'late') got++;
          if (st.code !== 'na' && st.code !== 'future') req++;
          return `<td class="mcell ${m.key === cur.key ? 'is-current' : ''}">${App.reportCellBtn(c.id, m, st)}</td>`;
        }).join('');
        return `<tr><th scope="row" class="sticky-col"><div class="club-cell"><button class="club-name-btn" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button>${typeBadge(c.type)}</div></th>${cells}<td class="num"><strong>${got}</strong><span class="muted"> / ${req}</span></td></tr>`;
      }).join('');
    });
    if (!rows) return `<div class="empty-sm">No clubs match your search.</div>`;

    const visible = App.state.clubs.filter((c) => (vs.type === 'all' || c.type === vs.type) && (!q || c.name.toLowerCase().includes(q) || (c.zone || '').toLowerCase().includes(q)));
    const foot = months.map((m) => {
      const done = visible.filter((c) => ['ok', 'late'].includes(App.reportStatus(c.id, m.key).code)).length;
      return `<td class="num" style="text-align:center">${App.monthEnded(m.key) || done ? done : '<span class="muted">–</span>'}</td>`;
    }).join('');

    return `<div class="table-wrap"><table class="table report-grid">
      <thead><tr><th class="sticky-col">Club</th>${months.map((m) => `<th class="mcol ${m.key === cur.key ? 'is-current' : ''}" title="Due ${App.fmtDate(App.reportDueDate(m.key))}">${m.short}<small>${m.y}</small></th>`).join('')}<th class="num">On file</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th class="sticky-col">Received</th>${foot}<td></td></tr></tfoot>
    </table></div>`;
  }

  function mount(root) {
    const s = root.querySelector('#repSearch');
    s && s.addEventListener('input', () => { vs.q = s.value; root.querySelector('#repTable').innerHTML = renderTable(App.leoMonths(), App.currentReportMonth()); });
    root.querySelectorAll('[data-seg="repType"] button').forEach((b) => b.addEventListener('click', () => { vs.type = b.dataset.value; App.refresh(); }));
    const qm = root.querySelector('#quickMark');
    qm && qm.addEventListener('change', () => {
      vs.quick = qm.checked;
      App.ui.toast(vs.quick ? 'Quick mark on — one click marks a report received today' : 'Quick mark off');
      App.refresh();
    });
    const fm = root.querySelector('#focusMonth');
    fm && fm.addEventListener('change', () => { vs.month = fm.value; App.refresh(); });
    root.querySelectorAll('.mchip').forEach((b) => b.addEventListener('click', () => { vs.month = b.dataset.month; App.refresh(); }));
    const on = root.querySelector('.mchip.on');
    if (on) { const strip = on.parentElement; strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2; }
  }

  /* ---------- single report modal ---------- */
  function reportModal(clubId, key) {
    const c = App.clubById(clubId);
    if (!c) return;
    const r = App.getReport(clubId, key) || {};
    const st = App.reportStatus(clubId, key);
    const ctrl = App.ui.open({
      title: `${App.monthLabel(key)} report`,
      sub: `${esc(c.name)} · due ${App.fmtDate(st.due)}`,
      render: () => `
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px">
          <div>Current status: ${chip(st.code, st.icon, st.label)}${st.date ? ` <span class="hint">received ${App.fmtDate(st.date)}${st.time ? ' at ' + App.fmtTime(st.time) : ''}</span>` : ''}${r.byName ? `<div class="by">Marked by ${esc(r.byName)}${r.at ? ' · ' + esc(App.fmtDateTime(r.at)) : ''}</div>` : ''}</div>
          <button type="button" class="btn btn-gold btn-sm" id="markToday">✓ Received today</button>
        </div>
        <form id="repForm" class="stack" style="gap:14px">
          <div class="field"><span class="field-label">Status</span>
            <div class="radio-cards">
              <label><input type="radio" name="status" value="submitted" ${r.status === 'submitted' ? 'checked' : ''}><span>✓ Submitted<small>Report received</small></span></label>
              <label><input type="radio" name="status" value="none" ${!r.status ? 'checked' : ''}><span>Not received<small>Still outstanding</small></span></label>
              <label><input type="radio" name="status" value="na" ${r.status === 'na' ? 'checked' : ''}><span>N/A<small>Not required</small></span></label>
            </div>
          </div>
          <div class="form-grid" id="dateField">
            <label class="field"><span>Date received</span><input type="date" name="date" value="${esc(r.date || App.todayISO())}"></label>
            <label class="field"><span>Time received</span><input type="time" name="time" value="${esc(r.time || (r.date ? '' : App.nowTime()))}"></label>
            <small class="hint full" style="margin-top:-6px">Received after ${App.fmtDate(st.due)} is shown as late.</small>
          </div>
          <label class="field"><span>Remark</span><textarea name="remark" rows="3" placeholder="Optional — e.g. bank statement pending, corrections requested">${esc(r.remark || '')}</textarea></label>
        </form>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="repForm">Save</button>`,
      onMount: (el) => {
        const f = el.querySelector('#repForm');
        const sync = () => { el.querySelector('#dateField').hidden = f.status.value !== 'submitted'; };
        f.querySelectorAll('input[name=status]').forEach((i) => i.addEventListener('change', sync));
        sync();
        el.querySelector('#markToday').addEventListener('click', () => {
          saveReport(clubId, key, { status: 'submitted', date: App.todayISO(), time: App.nowTime(), remark: f.remark.value.trim() });
          ctrl.close();
          App.ui.toast(`${App.monthLabel(key)} report marked received`);
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const d = formData(f);
          saveReport(clubId, key, d.status === 'none' ? (d.remark ? { status: '', remark: d.remark } : null) : { status: d.status, date: d.status === 'submitted' ? d.date || App.todayISO() : '', time: d.status === 'submitted' ? d.time || '' : '', remark: d.remark });
          ctrl.close();
          App.ui.toast('Report status saved');
        });
      },
    });
  }

  /** Read-only view for roles that can't change reports (President / Vice President). */
  function reportInfo(clubId, key) {
    const c = App.clubById(clubId);
    if (!c) return;
    const r = App.getReport(clubId, key) || {};
    const st = App.reportStatus(clubId, key);
    App.ui.open({
      title: `${App.monthLabel(key)} report`, size: 'sm',
      sub: `${esc(c.name)} · due ${App.fmtDate(st.due)}`,
      render: () => `<dl class="kv" style="font-size:14px">
          <dt>Status</dt><dd>${chip(st.code, st.icon, st.label)}</dd>
          <dt>Received</dt><dd>${st.date ? App.fmtDate(st.date) + (st.time ? ' at ' + App.fmtTime(st.time) : '') : '—'}</dd>
          <dt>Remark</dt><dd>${r.remark ? esc(r.remark) : '—'}</dd>
          <dt>Marked by</dt><dd>${r.byName ? esc(r.byName) + (r.at ? ` <span class="by">· ${esc(App.fmtDateTime(r.at))}</span>` : '') : '—'}</dd>
        </dl>
        <p class="readonly-note" style="margin:14px 0 0">View only — the Treasurer and Assistant Treasurers update reports.</p>`,
      footer: () => '<button class="btn btn-primary" data-close>Close</button>',
    });
  }

  function saveReport(clubId, key, rec) {
    if (!App.can('reports')) return;
    App.commit((s) => {
      s.reports[clubId] = s.reports[clubId] || {};
      if (rec) s.reports[clubId][key] = { ...rec, ...(rec.status ? App.auth.stamp() : {}), at: Date.now() }; else delete s.reports[clubId][key];
    });
  }

  function quickToggle(clubId, key) {
    const st = App.reportStatus(clubId, key);
    const prev = App.getReport(clubId, key);
    if (st.code === 'future') { App.ui.toast('This month has not ended yet — open the cell with Quick mark off to record it anyway.', 'error'); return; }
    if (st.code === 'na') { reportModal(clubId, key); return; }
    if (st.code === 'ok' || st.code === 'late') {
      saveReport(clubId, key, prev && prev.remark ? { status: '', remark: prev.remark } : null);
      App.ui.toast('Marked not received', 'ok', { label: 'Undo', run: () => saveReport(clubId, key, prev) });
    } else {
      saveReport(clubId, key, { status: 'submitted', date: App.todayISO(), time: App.nowTime(), remark: prev ? prev.remark || '' : '' });
      const c = App.clubById(clubId);
      App.ui.toast(`${c ? c.name : 'Club'} · ${App.monthLabel(key)} received`, 'ok', { label: 'Undo', run: () => saveReport(clubId, key, prev) });
    }
  }

  Object.assign(App.actions, {
    'report-cell': (el) => {
      const inGrid = !!el.closest('.report-grid, .rep-list');
      if (!App.can('reports')) reportInfo(el.dataset.club, el.dataset.month);
      else if (vs.quick && inGrid) quickToggle(el.dataset.club, el.dataset.month);
      else reportModal(el.dataset.club, el.dataset.month);
    },
    'export-reports': () => {
      const months = App.leoMonths();
      const rows = [['Club', 'Type', 'Zone', ...months.map((m) => m.label)]];
      App.clubsSorted('all').forEach((c) => rows.push([c.name, App.typeLabel(c.type), c.zone || '', ...months.map((m) => {
        const st = App.reportStatus(c.id, m.key);
        return st.label + (st.date ? ' ' + st.date + (st.time ? ' ' + st.time : '') : '') + (st.remark ? ' — ' + st.remark : '');
      })]));
      App.download(`treasurer-reports-${App.leoYearLabel().replace('/', '-')}.csv`, App.toCSV(rows), 'text/csv');
    },
  });

  App.views.reports = { render, mount, title: 'Treasurer Reports' };
})();
