/* =========================================================
   Clubs & Notes — Alpha / Omega club register, club detail drawer,
   district-wide notes feed, add/edit/bulk-add clubs
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, typeBadge, chip, tagChip, seg, emptyState, formData } = App.ui;

  const vs = { type: 'all', q: '', mode: 'cards', noteTag: 'all', noteOpenOnly: false };

  /* ---------- page ---------- */
  function render() {
    const s = App.state;
    const nAlpha = s.clubs.filter((c) => c.type === 'alpha').length;
    const nOmega = s.clubs.length - nAlpha;
    const openTasks = s.notes.filter((n) => App.isTask(n) && !n.done).length;

    const head = `
      <div class="page-head">
        <div>
          <div class="eyebrow">District club register</div>
          <h1 class="page-title">Clubs &amp; Notes</h1>
          <p class="lede">Omega and Alpha Leo clubs of the district. Open a club to see its full profile, reports, payments, notices and reminders.</p>
        </div>
        <div class="head-actions">
          ${vs.mode === 'notices'
            ? '<button class="btn btn-primary" data-action="new-notice" data-perm="notes">+ New notice</button>'
            : `<button class="btn" data-action="bulk-clubs" data-perm="clubs">Paste a club list</button>
               <button class="btn btn-primary" data-action="add-club" data-perm="clubs">+ Add club</button>`}
        </div>
      </div>`;

    if (!s.clubs.length) {
      return `<section class="view">${head}${emptyState({
        title: 'No clubs yet',
        text: 'Add the Alpha and Omega Leo clubs of the district to start tracking notes, treasurer reports and payments.',
        actions: `<button class="btn btn-primary" data-action="add-club" data-perm="clubs">+ Add a club</button><button class="btn" data-action="bulk-clubs" data-perm="clubs">Paste a club list</button><button class="btn btn-gold" data-action="load-demo" data-perm="danger">Load sample data</button>`,
      })}</section>`;
    }

    return `<section class="view">${head}
      <div class="subtabs" role="tablist">
        <button type="button" role="tab" class="${vs.mode === 'cards' ? 'on' : ''}" data-action="clubs-mode" data-mode="cards">Clubs (${s.clubs.length})</button>
        <button type="button" role="tab" class="${vs.mode === 'notes' ? 'on' : ''}" data-action="clubs-mode" data-mode="notes">Notes &amp; reminders${openTasks ? ` · ${openTasks} open` : ` (${s.notes.length})`}</button>
        <button type="button" role="tab" class="${vs.mode === 'notices' ? 'on' : ''}" data-action="clubs-mode" data-mode="notices">Notices (${s.notices.length})</button>
      </div>
      <div class="toolbar">
        ${seg('clubType', vs.type, [{ value: 'all', label: 'All', count: s.clubs.length }, { value: 'omega', label: 'Ω Omega', count: nOmega }, { value: 'alpha', label: 'α Alpha', count: nAlpha }])}
        ${vs.mode === 'notes' ? `
          <select class="input" id="noteTagFilter" style="width:auto;min-height:38px" aria-label="Filter notes by tag">
            <option value="all">All tags</option>
            ${Object.entries(App.NOTE_TAGS).map(([k, v]) => `<option value="${k}" ${vs.noteTag === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <label class="switch"><input type="checkbox" id="noteOpenOnly" ${vs.noteOpenOnly ? 'checked' : ''}> Open only</label>` : ''}
        <span class="spacer"></span>
        <label class="search"><span class="sr-only">Search</span><input type="search" id="clubSearch" placeholder="${vs.mode === 'cards' ? 'Search clubs, zones, officers…' : vs.mode === 'notices' ? 'Search notices…' : 'Search notes or clubs…'}" value="${esc(vs.q)}"></label>
      </div>
      <div id="clubsBody">${bodyHtml()}</div>
    </section>`;
  }
  const bodyHtml = () => (vs.mode === 'notes' ? renderNotesFeed() : vs.mode === 'notices' ? renderNotices() : renderCards());

  function matchClub(c, q) {
    if (!q) return true;
    return [c.name, c.zone, c.president, c.treasurer, c.asstTreasurer, c.email, c.phone].some((v) => (v || '').toLowerCase().includes(q));
  }

  /* ---------- district notices ---------- */
  function renderNotices() {
    const q = vs.q.toLowerCase();
    const list = App.state.notices.filter((n) => {
      if (vs.type !== 'all') {
        const c = App.clubById(n.audience);
        const t = c ? c.type : n.audience;
        if (t !== 'all' && t !== vs.type) return false;
      }
      return !q || [n.title, n.body].some((v) => (v || '').toLowerCase().includes(q));
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
    if (!list.length) return `<div class="empty-sm">${App.state.notices.length ? 'No notices match.' : 'No notices yet. Post a notice to all clubs, to Omega or Alpha clubs, or to one club.'}</div>`;
    return `<ul class="notice-list">${list.map((n) => noticeItem(n, true)).join('')}</ul>`;
  }

  function noticeItem(n, showAudience) {
    const canEdit = App.auth.canEditNote(n);
    return `<li class="notice">
      <div class="notice-top">
        <span class="notice-ico" aria-hidden="true">📣</span>
        <div class="notice-head"><b>${esc(n.title)}</b>
          <span class="hint">${App.fmtDate(n.date)}${showAudience ? ` · To: ${esc(App.noticeAudienceLabel(n))}` : ''}${n.byName ? ` · by ${esc(n.byName)}` : ''}</span></div>
        <span class="note-actions">
          <button class="btn btn-ghost btn-sm btn-icon" data-action="share-notice" data-id="${n.id}" title="Share or copy" aria-label="Share notice">⤴</button>
          ${canEdit ? `<button class="btn btn-ghost btn-sm btn-icon" data-action="edit-notice" data-id="${n.id}" title="Edit notice" aria-label="Edit notice">✎</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-action="delete-notice" data-id="${n.id}" title="Delete notice" aria-label="Delete notice">🗑</button>` : ''}
        </span>
      </div>
      ${n.body ? `<p class="notice-body">${esc(n.body)}</p>` : ''}
    </li>`;
  }

  function noticeForm(id, presetAudience) {
    const n = id ? App.state.notices.find((x) => x.id === id) : null;
    const v = n || { audience: presetAudience || 'all', date: App.todayISO() };
    const ctrl = App.ui.open({
      title: n ? 'Edit notice' : 'New district notice',
      sub: 'Shown on the profile of every club it is sent to',
      render: () => `
        <form id="noticeForm" class="stack" style="gap:14px">
          <label class="field"><span>Send to</span><select name="audience">
            ${Object.entries(App.NOTICE_AUDIENCE).map(([k, l]) => `<option value="${k}" ${v.audience === k ? 'selected' : ''}>${l}</option>`).join('')}
            <optgroup label="One club">${App.clubsSorted('all').map((c) => `<option value="${c.id}" ${v.audience === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>
          </select></label>
          <label class="field"><span>Title *</span><input name="title" required maxlength="120" value="${esc(v.title || '')}" placeholder="e.g. DCM fee due by 15 October" autofocus></label>
          <label class="field"><span>Message</span><textarea name="body" rows="5" placeholder="Details for the clubs">${esc(v.body || '')}</textarea></label>
          <label class="field"><span>Date</span><input name="date" type="date" value="${esc(v.date || App.todayISO())}"></label>
        </form>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="noticeForm">${n ? 'Save notice' : 'Post notice'}</button>`,
      onMount: (el) => el.querySelector('#noticeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!App.can('notes')) return;
        const d = formData(e.target);
        if (!d.title) return;
        const audience = App.NOTICE_AUDIENCE[d.audience] || App.clubById(d.audience) ? d.audience : 'all';
        const data = { title: d.title, body: d.body, audience, date: d.date || App.todayISO() };
        App.commit((s) => {
          if (n) Object.assign(s.notices.find((x) => x.id === id), data);
          else s.notices.push({ id: App.uid('ntc'), createdAt: Date.now(), ...data, ...App.auth.stamp() });
        });
        ctrl.close();
        App.ui.toast(n ? 'Notice updated' : 'Notice posted');
      }),
    });
  }

  function renderCards() {
    const q = vs.q.toLowerCase();
    const cur = App.currentReportMonth();
    const groups = vs.type === 'all' ? ['omega', 'alpha'] : [vs.type];
    const html = groups.map((t) => {
      const list = App.clubsSorted(t).filter((c) => matchClub(c, q));
      const titles = { omega: ['Ω', 'Omega Leo Clubs', 'Young adults'], alpha: ['α', 'Alpha Leo Clubs', 'Youth / school clubs'] };
      const [sym, title, sub] = titles[t];
      return `<div class="club-section">
        <div class="section-title"><span class="section-mark ${t}" aria-hidden="true">${sym}</span><h3>${title}</h3><span class="muted">${list.length} club${list.length === 1 ? '' : 's'} · ${sub}</span><span class="rule"></span></div>
        ${list.length ? `<div class="club-grid">${list.map((c) => clubCard(c, cur)).join('')}</div>` : `<div class="empty-sm">${q ? 'No matching clubs.' : 'No ' + App.typeLabel(t) + ' clubs yet.'}</div>`}
      </div>`;
    }).join('');
    return html;
  }

  function clubCard(c, cur) {
    const rs = App.reportStatus(c.id, cur.key);
    const ps = App.clubPaymentSummary(c);
    const notes = App.notesFor(c.id);
    const last = notes[0];
    const openF = notes.filter((n) => App.isTask(n) && !n.done).length;
    const payChip = !App.state.paymentHeads.length ? ''
      : ps.balance > 0
        ? chip(ps.overdue ? 'overdue' : 'partial', ps.overdue ? '!' : '◐', 'Owes ' + App.money(ps.balance, false))
        : chip('paid', '✓', 'Payments settled');
    return `<article class="club-card ${c.type}">
      <button class="stretched" data-action="open-club" data-id="${c.id}" aria-label="Open ${esc(c.name)}"></button>
      <div class="club-card-top">${App.ui.clubLogo(c)}
        <div class="cct-text"><h4>${esc(c.name)}</h4>
        <div class="club-meta">${typeBadge(c.type)}<span class="zone">${esc(c.zone || '')}${c.members ? ` · ${c.members} members` : ''}</span></div></div>
      </div>
      ${c.president || c.treasurer ? `<div class="club-people">${c.president ? 'President: ' + esc(c.president) : ''}${c.president && c.treasurer ? '<br>' : ''}${c.treasurer ? 'Treasurer: ' + esc(c.treasurer) : ''}</div>` : ''}
      <div class="club-stats">
        ${chip(rs.code, rs.icon, cur.short + ' report: ' + rs.label)}
        ${payChip}
        ${openF ? chip('overdue', '✎', openF + ' open task' + (openF > 1 ? 's' : '')) : ''}
      </div>
      ${last ? `<div class="club-note"><span class="clamp"><b>${esc(App.NOTE_TAGS[last.tag] || 'Note')}:</b> ${esc(last.text)}</span></div>` : ''}
      <div class="club-foot"><span>${notes.length} note${notes.length === 1 ? '' : 's'}</span><span>${ps.applicable ? `${ps.settled}/${ps.applicable} payments settled` : ''}</span></div>
    </article>`;
  }

  function renderNotesFeed() {
    const q = vs.q.toLowerCase();
    const notes = App.state.notes
      .filter((n) => {
        const c = App.clubById(n.clubId);
        if (!c) return false;
        if (vs.type !== 'all' && c.type !== vs.type) return false;
        if (vs.noteTag !== 'all' && n.tag !== vs.noteTag) return false;
        if (vs.noteOpenOnly && !(App.isTask(n) && !n.done)) return false;
        return !q || n.text.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    if (!notes.length) return `<div class="empty-sm">No notes match. Open a club to add a note.</div>`;
    return `<ul class="note-list">${notes.map((n) => noteItem(n, true)).join('')}</ul>`;
  }

  function noteItem(n, withClub) {
    const c = App.clubById(n.clubId);
    const isF = App.isTask(n);
    const canEdit = App.auth.canEditNote(n);
    const canToggle = canEdit || App.can('payments');
    const today = App.todayISO();
    const remindChip = n.tag === 'reminder' && n.remindOn && !n.done
      ? (n.remindOn < today ? chip('overdue', '⏰', 'Since ' + App.fmtDate(n.remindOn, { day: 'numeric', month: 'short' }))
        : n.remindOn === today ? chip('late', '⏰', 'Today') : chip('future', '⏰', App.fmtDate(n.remindOn, { day: 'numeric', month: 'short' })))
      : '';
    return `<li class="note ${isF ? 'is-followup' : ''} ${n.tag === 'reminder' ? 'is-reminder' : ''} ${n.done ? 'is-done' : ''}">
      <div class="note-top">
        ${withClub && c ? `<button class="club-link" data-action="open-club" data-id="${c.id}">${esc(c.name)}</button> ${typeBadge(c.type)}` : ''}
        ${tagChip(n.tag)} ${remindChip} ${isF && n.done ? chip('done', '✓', 'Done') : ''}
        <span title="${esc(App.fmtDateTime(n.createdAt))}">${App.relTime(n.createdAt)}${n.byName ? ` · by ${esc(n.byName)}` : ''}</span>
        <span class="note-actions">
          ${isF && canToggle ? `<button class="btn btn-ghost btn-sm" data-action="toggle-note" data-id="${n.id}">${n.done ? 'Reopen' : '✓ Mark done'}</button>` : ''}
          ${canEdit ? `<button class="btn btn-ghost btn-sm btn-icon" data-action="edit-note" data-id="${n.id}" title="Edit note" aria-label="Edit note">✎</button>
          <button class="btn btn-ghost btn-sm btn-icon" data-action="delete-note" data-id="${n.id}" title="Delete note" aria-label="Delete note">🗑</button>` : ''}
        </span>
      </div>
      <p class="note-text">${esc(n.text)}</p>
    </li>`;
  }

  function mount(root) {
    const search = root.querySelector('#clubSearch');
    if (search) search.addEventListener('input', () => { vs.q = search.value; renderBody(root); });
    root.querySelectorAll('[data-seg="clubType"] button').forEach((b) => b.addEventListener('click', () => { vs.type = b.dataset.value; App.refresh(); }));
    const tagSel = root.querySelector('#noteTagFilter');
    if (tagSel) tagSel.addEventListener('change', () => { vs.noteTag = tagSel.value; renderBody(root); });
    const openOnly = root.querySelector('#noteOpenOnly');
    if (openOnly) openOnly.addEventListener('change', () => { vs.noteOpenOnly = openOnly.checked; renderBody(root); });
  }
  function renderBody(root) {
    const body = root.querySelector('#clubsBody');
    if (body) { body.innerHTML = bodyHtml(); App.ui.applyPerms(body); }
  }

  /* ---------- club profile is its own page (views-club.js) ---------- */
  function openClub(id) { if (App.clubById(id)) location.hash = '#/club/' + id; }

  function reportCellBtn(clubId, m, st) {
    const tip = `${m.label}: ${st.label}${st.date ? ' on ' + App.fmtDate(st.date) + (st.time ? ' at ' + App.fmtTime(st.time) : '') : ''}${st.remark ? ' — ' + st.remark : ''}`;
    return `<button type="button" class="rcell s-${st.code}" data-action="report-cell" data-club="${clubId}" data-month="${m.key}" title="${esc(tip)}" aria-label="${esc(tip)}">${esc(st.icon)}${st.remark ? '<span class="dot-remark" aria-hidden="true"></span>' : ''}</button>`;
  }

  /* ---------- club form ---------- */
  const OFFICERS = [['president', 'Club president'], ['treasurer', 'Club treasurer'], ['asstTreasurer', 'Assistant treasurer']];

  function clubForm(id) {
    const c = id ? App.clubById(id) : null;
    const v = c || { type: 'omega' };
    let logo = v.logo || '';
    const ctrl = App.ui.open({
      title: c ? 'Edit club profile' : 'Add a club',
      sub: c ? esc(c.name) : 'Omega or Alpha Leo club of the district',
      size: 'lg',
      render: () => `
        <form id="clubForm" class="form-grid">
          <div class="field full logo-field">
            <span class="field-label">Club logo</span>
            <div class="logo-pick">
              <span id="logoPreview">${App.ui.clubLogo({ ...v, logo }, 'lg')}</span>
              <div class="logo-btns">
                <label class="btn btn-sm file-btn">⤒ ${logo ? 'Change logo' : 'Upload logo'}<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp"></label>
                ${logo ? '<button type="button" class="btn btn-sm btn-ghost" id="logoRemove">Remove</button>' : ''}
                <small class="hint">PNG, JPG or WebP. It is resized to a small image automatically.</small>
              </div>
            </div>
          </div>
          <label class="field full"><span>Club name *</span><input name="name" required value="${esc(v.name || '')}" placeholder="Leo Club of …" autofocus></label>
          <div class="field full"><span class="field-label">Club type *</span>
            <div class="radio-cards">
              <label><input type="radio" name="type" value="omega" ${v.type !== 'alpha' ? 'checked' : ''}><span>Ω Omega<small>Young adult club</small></span></label>
              <label><input type="radio" name="type" value="alpha" ${v.type === 'alpha' ? 'checked' : ''}><span>α Alpha<small>Youth / school club</small></span></label>
            </div>
          </div>
          <label class="field"><span>Zone / region</span><input name="zone" value="${esc(v.zone || '')}" placeholder="e.g. Zone 2"></label>
          <label class="field"><span>Members</span><input name="members" type="number" min="0" step="1" inputmode="numeric" value="${esc(v.members || '')}" placeholder="Used for per-member dues"></label>
          <label class="field"><span>Club email</span><input name="email" type="email" inputmode="email" autocomplete="off" value="${esc(v.email || '')}" placeholder="club@example.com"></label>
          <label class="field"><span>Club phone</span><input name="phone" type="tel" inputmode="tel" value="${esc(v.phone || '')}" placeholder="Optional"></label>
          <div class="full form-section">Club officers</div>
          ${OFFICERS.map(([k, label]) => `
            <label class="field"><span>${label}</span><input name="${k}" value="${esc(v[k] || '')}" placeholder="Name"></label>
            <label class="field"><span>${label.replace('Club ', '').replace(/^./, (x) => x.toUpperCase())} phone / WhatsApp</span><input name="${k}Phone" type="tel" inputmode="tel" value="${esc(v[k + 'Phone'] || '')}" placeholder="07X XXX XXXX"></label>`).join('')}
        </form>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="clubForm" type="submit">${c ? 'Save changes' : 'Add club'}</button>`,
      onMount: (el, me) => {
        const f = el.querySelector('#clubForm');
        // typed values survive the re-render when the logo changes
        const remember = () => { me._keep = {}; new FormData(f).forEach((val, k) => { if (typeof val === 'string') me._keep[k] = val; }); };
        if (me._keep) Object.entries(me._keep).forEach(([k, val]) => { const inp = f.elements[k]; if (inp) inp.value = val; });
        const file = el.querySelector('#logoFile');
        file && file.addEventListener('change', async () => {
          try {
            remember();
            logo = await App.ui.resizeImage(file.files[0]);
            me.update();
          } catch (err) { App.ui.toast(err.message, 'error'); }
        });
        const rm = el.querySelector('#logoRemove');
        rm && rm.addEventListener('click', () => { remember(); logo = ''; me.update(); });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const d = formData(e.target);
          if (!d.name) return;
          const dupe = App.state.clubs.find((x) => x.name.toLowerCase() === d.name.toLowerCase() && x.id !== id);
          if (dupe) { App.ui.toast('A club with this name already exists.', 'error'); return; }
          const data = {
            name: d.name, type: d.type === 'alpha' ? 'alpha' : 'omega', zone: d.zone, members: Math.max(0, parseInt(d.members, 10) || 0),
            email: d.email, phone: d.phone, logo,
            president: d.president, presidentPhone: d.presidentPhone, treasurer: d.treasurer, treasurerPhone: d.treasurerPhone,
            asstTreasurer: d.asstTreasurer, asstTreasurerPhone: d.asstTreasurerPhone,
          };
          App.commit((s) => {
            if (c) Object.assign(s.clubs.find((x) => x.id === id), data);
            else s.clubs.push({ id: App.uid('club'), createdAt: Date.now(), ...data });
          });
          ctrl.close();
          App.ui.toast(c ? 'Club profile saved' : 'Club added');
        });
      },
    });
  }

  /* ---------- bulk add ---------- */
  function bulkForm() {
    const ctrl = App.ui.open({
      title: 'Paste a club list', size: 'lg',
      sub: 'Add many clubs at once — one club per line',
      render: () => `
        <form id="bulkForm" class="stack" style="gap:14px">
          <div class="field"><span class="field-label">These clubs are</span>
            <div class="radio-cards">
              <label><input type="radio" name="type" value="omega" checked><span>Ω Omega</span></label>
              <label><input type="radio" name="type" value="alpha"><span>α Alpha</span></label>
            </div>
          </div>
          <label class="field"><span>Club list</span>
            <textarea name="list" rows="9" placeholder="Leo Club of …&#10;Leo Club of … | Zone 2 | 25&#10;Leo Club of … | alpha | Zone 3"></textarea>
            <small>Optional columns separated by <b>|</b> or a tab (paste from Excel works): name | alpha/omega | zone | members. Clubs already in the list are skipped.</small>
          </label>
        </form>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" form="bulkForm" type="submit">Add clubs</button>`,
      onMount: (el) => {
        el.querySelector('#bulkForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const d = formData(e.target);
          const existing = new Set(App.state.clubs.map((c) => c.name.toLowerCase()));
          const add = [];
          (d.list || '').split(/\r?\n/).forEach((line) => {
            const parts = line.split(/\t|\|/).map((x) => x.trim()).filter((x, i) => i === 0 || x !== '');
            const name = parts[0];
            if (!name || existing.has(name.toLowerCase())) return;
            let type = d.type === 'alpha' ? 'alpha' : 'omega', zone = '', members = 0;
            parts.slice(1).forEach((p) => {
              const low = p.toLowerCase();
              if (low === 'alpha' || low === 'omega') type = low;
              else if (/^\d+$/.test(p)) members = parseInt(p, 10);
              else if (!zone) zone = p;
            });
            existing.add(name.toLowerCase());
            add.push({ id: App.uid('club'), name, type, zone, members, president: '', treasurer: '', phone: '', email: '', createdAt: Date.now() });
          });
          if (!add.length) { App.ui.toast('No new clubs found in the list.', 'error'); return; }
          App.commit((s) => s.clubs.push(...add));
          ctrl.close();
          App.ui.toast(`${add.length} club${add.length > 1 ? 's' : ''} added`);
        });
      },
    });
  }

  /* ---------- note edit ---------- */
  function editNote(noteId) {
    const n = App.state.notes.find((x) => x.id === noteId);
    if (!n) return;
    const ctrl = App.ui.open({
      title: n.tag === 'reminder' ? 'Edit reminder' : 'Edit note', size: 'sm',
      render: () => `<form id="noteEdit" class="stack" style="gap:12px">
        <label class="field"><span>Tag</span><select name="tag">${Object.entries(App.NOTE_TAGS).map(([k, v]) => `<option value="${k}" ${k === n.tag ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field" id="remindField"><span>Remind on</span><input type="date" name="remindOn" value="${esc(n.remindOn || App.todayISO())}"></label>
        <label class="field"><span>Note</span><textarea name="text" rows="5" required>${esc(n.text)}</textarea></label></form>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="noteEdit">Save</button>`,
      onMount: (el) => {
        const f = el.querySelector('#noteEdit');
        const sync = () => { el.querySelector('#remindField').hidden = f.tag.value !== 'reminder'; };
        f.tag.addEventListener('change', sync);
        sync();
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const d = formData(e.target);
          if (!d.text) return;
          App.commit((s) => Object.assign(s.notes.find((x) => x.id === noteId), { text: d.text, tag: d.tag, remindOn: d.tag === 'reminder' ? d.remindOn || App.todayISO() : '' }));
          ctrl.close();
          App.ui.toast('Saved');
        });
      },
    });
  }

  /* ---------- actions ---------- */
  Object.assign(App.actions, {
    'open-club': (el) => openClub(el.dataset.id),
    'add-club': () => clubForm(),
    'edit-club': (el) => clubForm(el.dataset.id),
    'bulk-clubs': () => bulkForm(),
    'clubs-mode': (el) => { vs.mode = el.dataset.mode; vs.q = ''; App.refresh(); },
    'delete-club': async (el) => {
      const c = App.clubById(el.dataset.id);
      if (!c) return;
      const nPay = App.state.payments.filter((p) => p.clubId === c.id).length;
      const nNotes = App.state.notes.filter((n) => n.clubId === c.id).length;
      const ok = await App.ui.confirm({
        title: 'Delete club?', danger: true, confirmText: 'Delete club',
        message: `<strong>${esc(c.name)}</strong> will be removed together with its ${nNotes} note${nNotes === 1 ? '' : 's'}, ${nPay} payment record${nPay === 1 ? '' : 's'} and report history. This can't be undone (export a backup first if unsure).`,
      });
      if (!ok) return;
      App.commit((s) => {
        s.clubs = s.clubs.filter((x) => x.id !== c.id);
        s.notes = s.notes.filter((x) => x.clubId !== c.id);
        s.notices = s.notices.filter((x) => x.audience !== c.id);
        App.cancelReceipts(s, s.payments.filter((x) => x.clubId === c.id).map((x) => x.id), 'Club deleted', App.auth.stamp());
        s.payments = s.payments.filter((x) => x.clubId !== c.id);
        delete s.reports[c.id];
        Object.keys(s.exemptions).forEach((k) => { if (k.startsWith(c.id + '|')) delete s.exemptions[k]; });
      });
      if (location.hash.startsWith('#/club/')) location.hash = '#/clubs';
      App.ui.toast('Club deleted');
    },
    'new-notice': (el) => noticeForm(null, el.dataset.audience),
    'edit-notice': (el) => {
      const n = App.state.notices.find((x) => x.id === el.dataset.id);
      if (n && App.auth.canEditNote(n)) noticeForm(n.id);
    },
    'delete-notice': async (el) => {
      const n = App.state.notices.find((x) => x.id === el.dataset.id);
      if (!n || !App.auth.canEditNote(n)) return;
      App.commit((s) => { s.notices = s.notices.filter((x) => x.id !== n.id); });
      App.ui.toast('Notice deleted', 'ok', { label: 'Undo', run: () => App.commit((s) => s.notices.push(n)) });
    },
    'share-notice': (el) => {
      const n = App.state.notices.find((x) => x.id === el.dataset.id);
      if (!n) return;
      const text = `📣 ${n.title}\n\n${n.body ? n.body + '\n\n' : ''}— District Treasurer, ${App.state.settings.districtName || 'Leo District 306 D1'} (${App.fmtDate(n.date)})`;
      App.shareText({ title: n.title, text });
    },
    'toggle-note': (el) => {
      const n = App.state.notes.find((x) => x.id === el.dataset.id);
      if (!n || !(App.auth.canEditNote(n) || App.can('payments'))) return;
      App.commit((s) => { const x = s.notes.find((y) => y.id === n.id); if (x) x.done = !x.done; });
    },
    'edit-note': (el) => {
      const n = App.state.notes.find((x) => x.id === el.dataset.id);
      if (n && App.auth.canEditNote(n)) editNote(n.id);
    },
    'delete-note': (el) => {
      const n = App.state.notes.find((x) => x.id === el.dataset.id);
      if (!n || !App.auth.canEditNote(n)) return;
      App.commit((s) => { s.notes = s.notes.filter((x) => x.id !== n.id); });
      App.ui.toast('Note deleted', 'ok', { label: 'Undo', run: () => App.commit((s) => s.notes.push(n)) });
    },
  });

  App.views.clubs = { render, mount, title: 'Clubs & Notes' };
  App.openClub = openClub;
  App.reportCellBtn = reportCellBtn;
  App.noteItem = noteItem;
  App.noticeItem = noticeItem;
})();
