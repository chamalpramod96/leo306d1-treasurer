/* =========================================================
   Club profile — logo, officers & contacts, monthly treasurer
   reports (date & time received), district payments, pending
   balances, notices, reminders & notes, and "send reminder"
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, typeBadge, chip, meter, formData } = App.ui;

  const vs = { clubId: null, tab: 'overview', draftText: '', draftTag: 'general', draftRemind: '' };
  const TABS = [['overview', 'Overview'], ['reports', 'Reports'], ['payments', 'Payments'], ['notes', 'Notices & notes']];
  const OFFICERS = [['treasurer', 'Treasurer'], ['asstTreasurer', 'Assistant Treasurer'], ['president', 'President']];

  /* ---------- contact helpers ---------- */
  /** Sri Lankan numbers (07X…) become 947X… for WhatsApp; other numbers are used as typed (digits only). */
  function waNumber(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('0')) d = '94' + d.slice(1);
    else if (d.length === 9 && d.startsWith('7')) d = '94' + d;
    return d.length >= 10 ? d : '';
  }
  const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  const waHref = (p, text) => `https://wa.me/${waNumber(p)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  const mailHref = (to, subject, body) => `mailto:${encodeURIComponent(to || '').replace(/%40/g, '@')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- page ---------- */
  function render(id) {
    const c = App.clubById(id);
    if (!c) {
      return `<section class="view"><a class="back-link" href="#/clubs">‹ All clubs</a>${App.ui.emptyState({ title: 'Club not found', text: 'This club may have been deleted.', actions: '<a class="btn btn-primary" href="#/clubs">Back to clubs</a>' })}</section>`;
    }
    if (vs.clubId !== id) { vs.clubId = id; vs.tab = 'overview'; vs.draftText = ''; vs.draftTag = 'general'; vs.draftRemind = ''; }

    const months = App.leoMonths();
    let got = 0, req = 0, overdueReps = 0;
    months.forEach((m) => {
      const st = App.reportStatus(c.id, m.key);
      if (st.code === 'ok' || st.code === 'late') got++;
      if (st.code !== 'na' && st.code !== 'future') req++;
      if (st.code === 'overdue') overdueReps++;
    });
    const ps = App.clubPaymentSummary(c);
    const notes = App.notesFor(c.id);
    const openTasks = notes.filter((n) => App.isTask(n) && !n.done).length;
    const dueRem = App.dueReminders(c.id).length;
    const notices = App.noticesFor(c);

    const hero = `
      <a class="back-link" href="#/clubs">‹ All clubs</a>
      <div class="club-hero ${c.type}">
        <div class="ch-logo">${App.ui.clubLogo(c, 'xl')}</div>
        <div class="ch-text">
          <div class="ch-kicker">${App.typeLabel(c.type)} Leo Club${c.zone ? ' · ' + esc(c.zone) : ''}</div>
          <h1 class="ch-name">${esc(c.name)}</h1>
          <div class="ch-meta">${typeBadge(c.type)}${c.members ? `<span>${c.members} members</span>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}</div>
        </div>
        <div class="ch-actions">
          <button class="btn btn-gold" data-action="send-reminder" data-id="${c.id}" data-perm="notes">⏰ Send reminder</button>
          <button class="btn btn-hero" data-action="edit-club" data-id="${c.id}" data-perm="clubs">✎ Edit profile</button>
        </div>
      </div>
      <div class="profile-stats">
        <div class="pstat"><div class="lbl">Reports on file</div><div class="val">${got}<small> / ${req}</small></div>
          <div class="foot">${overdueReps ? chip('overdue', '!', overdueReps + ' overdue') : chip('ok', '✓', 'Up to date')}</div></div>
        <div class="pstat"><div class="lbl">Paid this year</div><div class="val">${App.moneyShort(ps.paid)}</div>${meter(ps.paid, ps.expected, 'thin')}
          <div class="foot hint">of ${App.money(ps.expected, false)}</div></div>
        <div class="pstat ${ps.balance > 0 ? 'is-owing' : ''}"><div class="lbl">Pending payments</div><div class="val">${App.moneyShort(ps.balance)}</div>
          <div class="foot">${ps.overdue ? chip('overdue', '!', ps.overdue + ' overdue') : ps.balance > 0 ? chip('unpaid', '○', 'Not yet due') : chip('paid', '✓', 'Settled')}</div></div>
        <div class="pstat"><div class="lbl">Reminders</div><div class="val">${openTasks}<small> open</small></div>
          <div class="foot">${dueRem ? chip('late', '⏰', dueRem + ' due now') : '<span class="hint">None due</span>'}</div></div>
      </div>
      <nav class="subtabs" aria-label="Club profile sections">${TABS.map(([k, l]) => {
        const count = k === 'notes' ? ` (${notices.length + notes.length})` : '';
        return `<button type="button" class="${vs.tab === k ? 'on' : ''}" data-action="club-tab" data-tab="${k}" ${vs.tab === k ? 'aria-current="page"' : ''}>${l}${count}</button>`;
      }).join('')}</nav>`;

    let body;
    if (vs.tab === 'reports') body = reportsTab(c, months, got, req);
    else if (vs.tab === 'payments') body = paymentsTab(c, ps);
    else if (vs.tab === 'notes') body = notesTab(c, notices, notes);
    else body = overviewTab(c, notices);
    return `<section class="view club-profile">${hero}<div id="clubTab">${body}</div></section>`;
  }

  /* ----- overview ----- */
  function overviewTab(c, notices) {
    const officers = OFFICERS.map(([k, label]) => {
      const name = c[k], phone = c[k + 'Phone'];
      if (!name && !phone) return `<li class="officer is-empty"><span class="off-ico" aria-hidden="true">◌</span><div class="off-body"><div class="off-role">${label}</div><div class="hint">Not added yet</div></div></li>`;
      return `<li class="officer"><span class="off-ico" aria-hidden="true">${esc((name || '?').replace(/^leo\s+/i, '')[0] || '?')}</span>
        <div class="off-body"><div class="off-role">${label}</div><div class="off-name">${esc(name || '—')}</div>${phone ? `<div class="hint">${esc(phone)}</div>` : ''}</div>
        ${phone ? `<div class="off-actions"><a class="btn btn-sm btn-icon" href="${telHref(phone)}" aria-label="Call ${esc(name || label)}" title="Call">☎</a>${waNumber(phone) ? `<a class="btn btn-sm btn-icon btn-wa" href="${waHref(phone)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(name || label)}" title="WhatsApp">✆</a>` : ''}</div>` : ''}</li>`;
    }).join('');

    const out = App.clubOutstanding(c);
    const rem = App.dueReminders(c.id);
    const items = [
      ...out.reports.map((x) => `<li><span class="li-ico ${x.st.code === 'overdue' ? 'warn' : 'rep'}" aria-hidden="true">✓</span><div class="li-body"><div class="t">${x.m.label} treasurer report</div><div class="s">${x.st.code === 'overdue' ? 'Overdue — was due ' : 'Due '}${App.fmtDate(x.st.due)}</div></div>
        <button class="btn btn-sm" data-action="report-cell" data-club="${c.id}" data-month="${x.m.key}">${App.can('reports') ? 'Mark' : 'View'}</button></li>`),
      ...out.payments.map((x) => `<li><span class="li-ico ${x.st.overdue ? 'warn' : 'pay'}" aria-hidden="true">₨</span><div class="li-body"><div class="t">${esc(x.h.name)} · ${App.money(x.st.balance, false)}</div><div class="s">${x.st.overdue ? 'Overdue — was due ' + App.fmtDate(x.h.dueDate) : x.h.dueDate ? 'Due ' + App.fmtDate(x.h.dueDate) : 'Pending'}</div></div>
        <button class="btn btn-sm" data-action="pay-cell" data-club="${c.id}" data-head="${x.h.id}">${App.can('payments') ? 'Record' : 'View'}</button></li>`),
      ...rem.map((n) => `<li><span class="li-ico note" aria-hidden="true">⏰</span><div class="li-body"><div class="t">Reminder${n.remindOn ? ' · ' + App.fmtDate(n.remindOn) : ''}</div><div class="s">${esc(n.text)}</div></div>
        <button class="btn btn-sm" data-action="toggle-note" data-id="${n.id}">✓ Done</button></li>`),
    ];

    return `<div class="profile-grid">
      <div class="card">
        <div class="card-head"><h2 class="card-title"><span class="ttl-ico">♜</span>Club officers</h2><button class="btn btn-sm btn-ghost" data-action="edit-club" data-id="${c.id}" data-perm="clubs">✎ Edit</button></div>
        <ul class="officer-list">${officers}</ul>
        <dl class="kv contact-kv">
          <dt>Club email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
          <dt>Club phone</dt><dd>${c.phone ? `<a href="${telHref(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
          <dt>Zone</dt><dd>${esc(c.zone || '—')}</dd>
          <dt>Members</dt><dd>${c.members || '—'}</dd>
        </dl>
      </div>
      <div class="stack">
        <div class="card framed">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">!</span>Pending &amp; reminders</h2><span class="card-sub">${items.length} item${items.length === 1 ? '' : 's'}</span></div>
          ${items.length ? `<ul class="list">${items.join('')}</ul>` : '<div class="empty-sm">✓ All reports and payments are up to date.</div>'}
        </div>
        <div class="card">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">📣</span>Latest notices</h2>${notices.length > 2 ? `<button class="card-link link-btn" data-action="club-tab" data-tab="notes">All ${notices.length} →</button>` : ''}</div>
          ${notices.length ? `<ul class="notice-list">${notices.slice(0, 2).map((n) => App.noticeItem(n, true)).join('')}</ul>` : '<div class="empty-sm">No notices for this club yet.</div>'}
        </div>
      </div>
    </div>`;
  }

  /* ----- reports: every month with the date & time it was received ----- */
  function reportsTab(c, months, got, req) {
    const cur = App.currentReportMonth();
    const rows = months.map((m) => {
      const st = App.reportStatus(c.id, m.key);
      const r = App.getReport(c.id, m.key) || {};
      const received = st.date ? `${App.fmtDate(st.date)}${st.time ? ' · ' + App.fmtTime(st.time) : ''}` : '';
      return `<li class="${st.code === 'future' ? 'is-future' : ''} ${m.key === cur.key ? 'is-current' : ''}">
        <button type="button" class="rh-row" data-action="report-cell" data-club="${c.id}" data-month="${m.key}">
          <span class="rh-month"><b>${m.label}</b><small>Due ${App.fmtDate(st.due, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span>
          <span class="rh-status">${chip(st.code, st.icon, st.code === 'pending' ? 'Awaiting' : st.code === 'future' && App.todayISO() < m.key + '-01' ? 'Upcoming' : st.label)}</span>
          <span class="rh-when">${received ? `<span class="rh-k">Received</span>${received}` : '<span class="hint">—</span>'}</span>
          <span class="rh-by">${r.byName ? `<span class="rh-k">Marked by</span>${esc(r.byName)}` : ''}</span>
          ${st.remark ? `<span class="rh-remark">“${esc(st.remark)}”</span>` : ''}
          <span class="rh-go" aria-hidden="true">›</span>
        </button></li>`;
    }).join('');
    return `<div class="card">
      <div class="card-head"><h2 class="card-title"><span class="ttl-ico">✓</span>Monthly treasurer reports · ${App.leoYearLabel()}</h2><span class="card-sub">${got} of ${req} on file · due day ${App.state.settings.reportDueDay} of the next month</span></div>
      <ul class="rep-hist">${rows}</ul>
      <p class="hint" style="margin:10px 0 0">${App.can('reports') ? 'Tap a month to mark the report as received, with the date and time.' : 'Tap a month for details.'}</p>
    </div>`;
  }

  /* ----- payments: pending first, then every payment type with its instalments ----- */
  function paymentsTab(c, ps) {
    const heads = App.state.paymentHeads.filter((h) => App.headApplies(h, c));
    if (!heads.length) return `<div class="empty-sm">No district payment types apply to this club yet.${App.can('heads') ? ' <a href="#/payments/types">Set up payment types</a>.' : ''}</div>`;
    const pending = heads.map((h) => ({ h, st: App.paymentStatus(c, h) })).filter((x) => x.st.balance > 0);
    return `<div class="pay-summary">
        <div><div class="lbl">Expected</div><div class="val">${App.money(ps.expected, false)}</div></div>
        <div><div class="lbl">Paid</div><div class="val" style="color:var(--good-ink)">${App.money(ps.paid, false)}</div></div>
        <div><div class="lbl">Pending</div><div class="val" style="color:${ps.balance > 0 ? 'var(--crit-ink)' : 'var(--good-ink)'}">${App.money(ps.balance, false)}</div></div>
      </div>
      ${pending.length ? `<div class="card framed" style="margin-bottom:16px">
        <div class="card-head"><h2 class="card-title"><span class="ttl-ico">!</span>Pending payments</h2><span class="card-sub">${pending.length} of ${heads.length}</span></div>
        <ul class="list">${pending.map((x) => `<li><span class="li-ico ${x.st.overdue ? 'warn' : 'pay'}" aria-hidden="true">₨</span>
          <div class="li-body"><div class="t">${esc(x.h.name)}</div><div class="s">${App.money(x.st.paid, false)} paid of ${App.money(x.st.expected, false)}${x.h.dueDate ? ' · due ' + App.fmtDate(x.h.dueDate) : ''}</div></div>
          <span class="li-side">${App.money(x.st.balance, false)}<br>${chip(x.st.overdue ? 'overdue' : x.st.code, x.st.overdue ? '!' : x.st.icon, x.st.overdue ? 'Overdue' : x.st.label)}</span></li>`).join('')}</ul>
      </div>` : ''}
      <div class="head-list">${heads.map((h) => {
        const st = App.paymentStatus(c, h);
        const hist = App.paymentsFor(c.id, h.id);
        return `<div class="card pay-type-card">
          <div class="card-head" style="align-items:flex-start"><div><h3 class="pt-name">${esc(h.name)}</h3><div class="hint">${h.amountMode === 'perMember' ? `${App.money(h.amount, false)} × ${c.members || 0} members` : 'Fixed per club'}${h.dueDate ? ' · due ' + App.fmtDate(h.dueDate) : ''}</div></div>
            ${chip(st.code === 'partial' && st.overdue ? 'overdue' : st.code, st.icon, st.label)}</div>
          <div class="pt-amounts"><span><b>${App.money(st.paid, false)}</b> paid</span><span>of ${st.code === 'exempt' ? 'exempt' : App.money(st.expected, false)}</span></div>
          ${meter(st.paid, st.expected, 'thin')}
          ${hist.length ? `<ul class="inst-list">${hist.map((p) => `<li><span>${App.fmtDate(p.date)}</span><b>${App.money(p.amount, false)}</b><span class="hint">${esc([p.method, p.reference].filter(Boolean).join(' · '))}${p.byName ? ' · by ' + esc(p.byName) : ''}</span>${App.receipts ? App.receipts.button(p) : ''}</li>`).join('')}</ul>` : '<div class="hint" style="margin-top:8px">No payments recorded yet.</div>'}
          <button class="btn btn-sm ${st.balance > 0 && App.can('payments') ? 'btn-primary' : ''}" style="margin-top:10px" data-action="pay-cell" data-club="${c.id}" data-head="${h.id}">${App.can('payments') ? (st.balance > 0 ? '+ Record payment' : 'Update') : 'View details'}</button>
        </div>`;
      }).join('')}</div>`;
  }

  /* ----- notices, reminders & notes ----- */
  function notesTab(c, notices, notes) {
    const isRem = vs.draftTag === 'reminder';
    return `<div class="profile-grid">
      <div class="card">
        <div class="card-head"><h2 class="card-title"><span class="ttl-ico">✎</span>Reminders &amp; notes</h2><span class="card-sub">${notes.length}</span></div>
        <form class="note-form" id="noteForm" data-perm="notes">
          <textarea name="text" class="input" placeholder="Add a note or reminder — calls, promises, issues…" required aria-label="Note text">${esc(vs.draftText)}</textarea>
          <div class="note-form-row">
            <select name="tag" class="input" aria-label="Note type">${Object.entries(App.NOTE_TAGS).map(([k, v]) => `<option value="${k}" ${k === vs.draftTag ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <label class="remind-on" ${isRem ? '' : 'hidden'}><span class="sr-only">Remind on</span><input type="date" name="remindOn" class="input" value="${esc(vs.draftRemind || App.todayISO())}"></label>
            <span style="flex:1"></span>
            <button class="btn btn-primary btn-sm" type="submit">${isRem ? 'Add reminder' : 'Add note'}</button>
          </div>
        </form>
        ${notes.length ? `<ul class="note-list" style="margin-top:12px">${notes.map((n) => App.noteItem(n, false)).join('')}</ul>` : '<div class="empty-sm">No notes or reminders yet.</div>'}
      </div>
      <div class="card">
        <div class="card-head"><h2 class="card-title"><span class="ttl-ico">📣</span>District notices</h2><button class="btn btn-sm" data-action="new-notice" data-audience="${c.id}" data-perm="notes">+ Notice to this club</button></div>
        ${notices.length ? `<ul class="notice-list">${notices.map((n) => App.noticeItem(n, true)).join('')}</ul>` : '<div class="empty-sm">No notices for this club yet.</div>'}
      </div>
    </div>`;
  }

  function mount(root, id) {
    const f = root.querySelector('#noteForm');
    if (!f) return;
    f.text.addEventListener('input', () => { vs.draftText = f.text.value; });
    f.remindOn.addEventListener('change', () => { vs.draftRemind = f.remindOn.value; });
    f.tag.addEventListener('change', () => {
      vs.draftTag = f.tag.value;
      f.querySelector('.remind-on').hidden = vs.draftTag !== 'reminder';
      f.querySelector('[type=submit]').textContent = vs.draftTag === 'reminder' ? 'Add reminder' : 'Add note';
    });
    f.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!App.can('notes')) return;
      const d = formData(f);
      if (!d.text) return;
      const isRem = d.tag === 'reminder';
      vs.draftText = '';
      App.commit((s) => s.notes.push({ id: App.uid('note'), clubId: id, text: d.text, tag: d.tag || 'general', remindOn: isRem ? d.remindOn || App.todayISO() : '', done: false, createdAt: Date.now(), ...App.auth.stamp() }));
      App.ui.toast(isRem ? `Reminder set for ${App.fmtDate(d.remindOn || App.todayISO())}` : 'Note added');
    });
  }

  /* ---------- share sheet (WhatsApp / email / copy / phone share) ---------- */
  function shareText({ title, text, phone, email, subject, onSent }) {
    App.ui.open({
      title: esc(title || 'Share'), size: 'sm',
      render: () => `
        <label class="field"><span>Message</span><textarea id="shareMsg" rows="9">${esc(text)}</textarea></label>
        <div class="share-btns">
          <a class="btn btn-wa" id="shWa" target="_blank" rel="noopener">✆ WhatsApp</a>
          <a class="btn" id="shMail">✉ Email</a>
          ${navigator.share ? '<button type="button" class="btn" id="shNative">⤴ Share…</button>' : ''}
          <button type="button" class="btn" id="shCopy">⧉ Copy</button>
        </div>`,
      onMount: (el, me) => {
        const ta = el.querySelector('#shareMsg');
        const wa = el.querySelector('#shWa'), mail = el.querySelector('#shMail');
        const sync = () => {
          wa.href = phone && waNumber(phone) ? waHref(phone, ta.value) : 'https://wa.me/?text=' + encodeURIComponent(ta.value);
          mail.href = mailHref(email || '', subject || title || '', ta.value);
        };
        ta.addEventListener('input', sync);
        sync();
        const done = (via) => { onSent && onSent(via, ta.value); };
        wa.addEventListener('click', () => { done('WhatsApp'); setTimeout(() => me.close(), 300); });
        mail.addEventListener('click', () => { done('email'); setTimeout(() => me.close(), 300); });
        const nat = el.querySelector('#shNative');
        nat && nat.addEventListener('click', async () => {
          try { await navigator.share({ title: title || '', text: ta.value }); done('share'); me.close(); } catch (e) { /* cancelled */ }
        });
        el.querySelector('#shCopy').addEventListener('click', async () => {
          if (await copyText(ta.value)) { done('copy'); App.ui.toast('Message copied — paste it in any app'); } else App.ui.toast('Could not copy. Select the text and copy it.', 'error');
        });
      },
    });
  }

  /* ---------- reminder to a club ---------- */
  function reminderMessage(c, to) {
    const out = App.clubOutstanding(c);
    const me = App.auth.current();
    const district = App.state.settings.districtName || 'Leo District 306 D1';
    const lines = [`Dear ${to && to.name ? to.name : 'Club Treasurer'},`, '', `A reminder from the District Treasurer's office, ${district}, for ${c.name}.`];
    if (out.reports.length) {
      lines.push('', 'Treasurer reports:');
      out.reports.forEach((x) => lines.push(`• ${x.m.label} — ${x.st.code === 'overdue' ? 'overdue (was due ' + App.fmtDate(x.st.due) + ')' : 'due ' + App.fmtDate(x.st.due)}`));
    }
    if (out.payments.length) {
      lines.push('', 'District payments pending:');
      out.payments.forEach((x) => lines.push(`• ${x.h.name} — ${App.money(x.st.balance, false)}${x.h.dueDate ? (x.st.overdue ? ' (overdue, was due ' : ' (due ') + App.fmtDate(x.h.dueDate) + ')' : ''}`));
      lines.push(`Total pending: ${App.money(out.balance, false)}`);
    }
    const ask = [out.reports.length ? 'send the report' + (out.reports.length > 1 ? 's' : '') : '', out.payments.length ? 'settle the payment' + (out.payments.length > 1 ? 's' : '') : ''].filter(Boolean).join(' and ');
    lines.push('', ask ? `Please ${ask} at your earliest convenience. Thank you!` : 'All reports and payments are up to date — thank you!');
    lines.push('', me ? me.name : '', `${me ? App.auth.roleLabel(me.role) + ', ' : ''}${district}`);
    return lines.join('\n');
  }

  function sendReminder(id) {
    const c = App.clubById(id);
    if (!c) return;
    const people = OFFICERS.map(([k, label]) => ({ key: k, label, name: c[k] || '', phone: c[k + 'Phone'] || '' })).filter((p) => p.name || p.phone);
    let pick = people.find((p) => p.phone) || people[0] || null;
    App.ui.open({
      title: 'Send a reminder', sub: esc(c.name), size: 'sm',
      render: () => `
        ${people.length ? `<div class="field"><span class="field-label">Send to</span><div class="radio-cards">${people.map((p) => `
          <label><input type="radio" name="to" value="${p.key}" ${pick && pick.key === p.key ? 'checked' : ''}><span>${esc(p.name || p.label)}<small>${p.label}${p.phone ? ' · ' + esc(p.phone) : ' · no phone'}</small></span></label>`).join('')}</div></div>`
          : '<p class="callout" style="margin-top:0">No officer names or phone numbers yet. Add them with <b>Edit profile</b> to send WhatsApp messages directly.</p>'}
        <p class="hint" style="margin:12px 0 0">The message lists overdue reports and pending payments. You can edit it before sending.</p>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="remNext">Write message ›</button>`,
      onMount: (el, me) => {
        el.querySelectorAll('input[name=to]').forEach((r) => r.addEventListener('change', () => { pick = people.find((p) => p.key === r.value); }));
        el.querySelector('#remNext').addEventListener('click', () => {
          me.close();
          shareText({
            title: 'Reminder message', text: reminderMessage(c, pick), phone: pick && pick.phone, email: c.email,
            subject: `Reminder — ${c.name} · ${App.state.settings.districtName || 'Leo District 306 D1'}`,
            onSent: (via) => {
              if (!App.can('notes')) return;
              const out = App.clubOutstanding(c);
              const what = [out.reports.length ? `${out.reports.length} report${out.reports.length > 1 ? 's' : ''}` : '', out.payments.length ? `${App.money(out.balance, false)} pending` : ''].filter(Boolean).join(', ') || 'general reminder';
              App.commit((s) => s.notes.push({ id: App.uid('note'), clubId: c.id, tag: 'reminder', done: true, remindOn: App.todayISO(), text: `Reminder sent by ${via}${pick && pick.name ? ' to ' + pick.name : ''} — ${what}.`, createdAt: Date.now(), ...App.auth.stamp() }));
            },
          });
        });
      },
    });
  }

  Object.assign(App.actions, {
    'club-tab': (el) => { vs.tab = el.dataset.tab; App.refresh(); },
    'send-reminder': (el) => sendReminder(el.dataset.id),
  });

  App.shareText = shareText;
  App.views.club = {
    render, mount,
    get title() { const c = App.clubById(vs.clubId); return c ? c.name : 'Club profile'; },
  };
})();
