/* =========================================================
   Settings & Backup — district/year settings, JSON backup & restore,
   CSV exports, sample data and reset
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, formData } = App.ui;

  function render() {
    const st = App.state.settings;
    const years = [];
    for (let y = 2023; y <= 2032; y++) years.push(y);
    const s = App.state;
    const lastSeq = App.lastReceiptSeq(s, Number(st.startYear));
    const cloud = App.cloud.enabled;
    return `<section class="view">
      <div class="page-head"><div>
        <div class="eyebrow">Portal configuration</div>
        <h1 class="page-title">Settings &amp; Backup</h1>
        <p class="lede">${cloud
          ? 'Data is kept in the district’s shared Firebase database, so every officer sees the same records on any device. You can still download a backup file.'
          : 'All data is stored privately in this browser on this device. Export a backup file regularly and keep it safe.'}</p>
      </div></div>

      <div class="settings-grid">
        <div class="card framed">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">⚙</span>District &amp; Leo year</h2></div>
          <form id="settingsForm"><fieldset class="form-grid" style="border:0;padding:0;margin:0;min-width:0" ${App.can('settings') ? '' : 'disabled'}>
            <label class="field full"><span>District name</span><input name="districtName" value="${esc(st.districtName)}" required></label>
            <label class="field"><span>Leo year</span><select name="startYear">${years.map((y) => `<option value="${y}" ${y === Number(st.startYear) ? 'selected' : ''}>${y}/${y + 1}</option>`).join('')}</select><small>July ${st.startYear} – June ${Number(st.startYear) + 1}</small></label>
            <label class="field"><span>Report due day</span><input name="reportDueDay" type="number" min="1" max="28" value="${esc(st.reportDueDay)}"><small>Day of the following month</small></label>
            <label class="field full"><span>District Treasurer name</span><input name="treasurerName" value="${esc(st.treasurerName)}" placeholder="Shown in the header"></label>
            <div class="full">${App.can('settings') ? '<button class="btn btn-primary" type="submit">Save settings</button>' : '<span class="readonly-note">Only the District Treasurer or Super Admin can change these settings.</span>'}</div></fieldset>
          </form>

          <div class="card-head" style="margin-top:22px"><h2 class="card-title"><span class="ttl-ico">🧾</span>Payment e-receipts</h2><a class="card-link" href="#/payments/receipts">Receipt register →</a></div>
          <form id="receiptForm"><fieldset class="form-grid" style="border:0;padding:0;margin:0;min-width:0" ${App.can('settings') ? '' : 'disabled'}>
            <label class="field"><span>Receipt number prefix</span><input name="receiptPrefix" value="${esc(st.receiptPrefix || '')}" maxlength="20" pattern="[A-Za-z0-9\\-]*" placeholder="LD306D1"><small>Letters, numbers and dashes</small></label>
            <label class="field"><span>Next number for ${App.leoYearLabel()}</span><input name="nextSeq" type="number" min="${lastSeq + 1}" step="1" value="${lastSeq + 1}"><small>Next receipt: <b id="rcPreview">${esc(App.receiptNo(st.receiptPrefix, Number(st.startYear), lastSeq + 1))}</b></small></label>
            <label class="field full"><span>Second heading on the receipt</span><input name="receiptSubtitle" value="${esc(st.receiptSubtitle || '')}" maxlength="70" placeholder="Office of the District Treasurer"></label>
            <p class="hint full" style="margin:0">Numbers start again at 0001 each Leo year and are never reused — a deleted payment leaves its receipt in the register marked cancelled. If paper receipts were already written this year, set the next number to continue after them. ${cloud
              ? 'Numbers are handed out by the shared database, so receipts issued by the DT and the DAT on different phones never get the same number.'
              : 'Each device numbers its own receipts, so if the DT and DAT issue receipts on different phones, give each phone its own prefix (for example LD306D1-DT and LD306D1-DAT).'}</p>
            <div class="full">${App.can('settings') ? '<button class="btn btn-primary" type="submit">Save receipt settings</button>' : ''}</div></fieldset>
          </form>
        </div>

        <div class="stack">
          ${cloudCard()}
          <div class="card">
            <div class="card-head"><h2 class="card-title"><span class="ttl-ico">⤓</span>Backup &amp; restore</h2></div>
            <p class="hint" style="margin-top:0">${cloud
              ? 'A backup file holds every club, note, report mark, payment and receipt. Restoring one replaces the shared data for every officer.'
              : 'A backup file holds every club, note, report mark and payment. Restore it on another computer to continue there.'}</p>
            <div class="btn-row">
              <button class="btn btn-gold" data-action="export-json" data-perm="restore">⤓ Download backup (.json)</button>
              <label class="btn file-btn" data-perm="restore">⤒ Restore from backup<input type="file" id="importFile" accept="application/json,.json"></label>
            </div>
            <p class="hint" style="margin:14px 0 6px">Spreadsheet exports (CSV, opens in Excel):</p>
            <div class="btn-row">
              <button class="btn btn-sm" data-action="export-clubs" data-perm="export">Clubs</button>
              <button class="btn btn-sm" data-action="export-reports" data-perm="export">Treasurer reports</button>
              <button class="btn btn-sm" data-action="export-matrix" data-perm="export">Payment status</button>
              <button class="btn btn-sm" data-action="export-all-payments" data-perm="export">All payments</button>
              <button class="btn btn-sm" data-action="export-notes" data-perm="export">Notes</button>
            </div>
            <p class="hint" style="margin:14px 0 6px">Receipt register, every receipt:</p>
            <div class="btn-row">
              <button class="btn btn-sm" data-action="export-receipts-xlsx" data-scope="all" data-perm="export" ${s.receipts.length ? '' : 'disabled'}>🧾 Excel (.xlsx)</button>
              <button class="btn btn-sm" data-action="export-receipts-pdf" data-scope="all" data-perm="export" ${s.receipts.length ? '' : 'disabled'}>🧾 PDF</button>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2 class="card-title"><span class="ttl-ico">◇</span>${cloud ? 'Shared data' : 'Data on this device'}</h2></div>
            <dl class="kv" style="margin-bottom:14px">
              <dt>Clubs</dt><dd>${s.clubs.length} (${s.clubs.filter((c) => c.type === 'omega').length} Omega · ${s.clubs.filter((c) => c.type === 'alpha').length} Alpha)</dd>
              <dt>Notes</dt><dd>${s.notes.length}</dd>
              <dt>Payment types</dt><dd>${s.paymentHeads.length}</dd>
              <dt>Payment records</dt><dd>${s.payments.length}</dd>
              <dt>E-receipts</dt><dd>${s.receipts.length}${s.receipts.some((r) => r.status === 'cancelled') ? ` (${s.receipts.filter((r) => r.status === 'cancelled').length} cancelled)` : ''}</dd>
              <dt>Sample data</dt><dd>${st.demo ? 'Yes — clear before real use' : 'No'}</dd>
            </dl>
            <div class="btn-row">
              <button class="btn" data-action="load-demo" data-perm="danger">Load sample data</button>
              <button class="btn btn-danger" data-action="clear-all" data-perm="danger">Clear all data…</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  /** Online database status: Firebase project, sync state, and upload of data saved before it was connected. */
  function cloudCard() {
    if (!App.cloud.enabled) {
      return `<div class="card">
        <div class="card-head"><h2 class="card-title"><span class="ttl-ico">☁</span>Online database</h2>${App.ui.chip('na', '○', 'Not connected')}</div>
        <p class="hint" style="margin:0">This portal keeps its data in this browser only. To let every officer work on the same data from their own phone,
          connect it to a Firebase project: see <b>FIREBASE-SETUP.md</b> in the portal's files.</p>
      </div>`;
    }
    const st = App.cloud.status() || { code: 'busy', label: 'Connecting…' };
    const chipCode = { ok: 'ok', busy: 'pending', off: 'na', err: 'overdue' }[st.code] || 'pending';
    const local = App.can('restore') && App.cloud.localHasData();
    return `<div class="card">
      <div class="card-head"><h2 class="card-title"><span class="ttl-ico">☁</span>Online database</h2>${App.ui.chip(chipCode, st.code === 'ok' ? '✓' : '•', st.label)}</div>
      <dl class="kv" style="margin-bottom:12px">
        <dt>Firebase project</dt><dd>${esc(App.cloud.projectId)}${App.cloud.emulator ? ' <small>(local test emulator)</small>' : ''}</dd>
        <dt>Signed in as</dt><dd>${esc(App.cloud.email())}</dd>
      </dl>
      <p class="hint" style="margin:0">Changes are shared with every officer straight away. Offline, they are kept on this device and upload by themselves when the connection is back.</p>
      ${local ? `<p class="hint" style="margin:12px 0 6px">This browser still holds data saved before Firebase was connected.</p>
        <button class="btn btn-sm" data-action="cloud-upload" data-perm="restore">⤒ Upload this browser's data…</button>` : ''}
    </div>`;
  }

  function mount(root) {
    const f = root.querySelector('#settingsForm');
    f.addEventListener('submit', (e) => {
      if (!App.can('settings')) { e.preventDefault(); return; }
      e.preventDefault();
      const d = formData(f);
      App.commit((s) => Object.assign(s.settings, {
        districtName: d.districtName || 'Leo District 306 D1',
        startYear: parseInt(d.startYear, 10) || 2026,
        reportDueDay: Math.min(28, Math.max(1, parseInt(d.reportDueDay, 10) || 10)),
        treasurerName: d.treasurerName,
      }));
      App.ui.toast('Settings saved');
    });
    const rf = root.querySelector('#receiptForm');
    const preview = () => {
      const year = Number(App.state.settings.startYear);
      const n = Math.max(App.lastReceiptSeq(App.state, year) + 1, parseInt(rf.nextSeq.value, 10) || 0);
      root.querySelector('#rcPreview').textContent = App.receiptNo(rf.receiptPrefix.value.trim(), year, n);
    };
    rf.receiptPrefix.addEventListener('input', preview);
    rf.nextSeq.addEventListener('input', preview);
    rf.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!App.can('settings')) return;
      const d = formData(rf);
      const year = Number(App.state.settings.startYear);
      const last = App.lastReceiptSeq(App.state, year);
      const next = parseInt(d.nextSeq, 10);
      if (!(next > last)) { App.ui.toast(`The next number must be ${last + 1} or more — ${last} ${last === 1 ? 'is' : 'are'} already used this Leo year.`, 'error'); return; }
      App.commit((s) => {
        s.settings.receiptPrefix = d.receiptPrefix.replace(/[^A-Za-z0-9-]/g, '');
        s.settings.receiptSubtitle = d.receiptSubtitle;
        s.receiptSeq[year] = next - 1;
      });
      App.ui.toast('Receipt settings saved');
    });
    root.querySelector('#importFile').addEventListener('change', async (e) => {
      if (!App.can('restore')) { e.target.value = ''; return; }
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch (err) { App.ui.toast('That file is not a valid backup.', 'error'); return; }
      const payload = data && data.app === 'leo306d1-treasury' ? data.data : data;
      if (!payload || !Array.isArray(payload.clubs)) { App.ui.toast('That file is not a treasury backup.', 'error'); return; }
      const ok = await App.ui.confirm({
        title: 'Restore this backup?', danger: true, confirmText: 'Replace my data',
        message: `The backup has <strong>${payload.clubs.length} clubs</strong> and <strong>${(payload.payments || []).length} payments</strong>${data.exportedAt ? `, saved ${esc(App.fmtDateTime(data.exportedAt))}` : ''}. It will <strong>replace</strong> all data ${App.cloud.enabled ? 'in the shared database, for every officer' : 'currently in this browser'}.`,
      });
      if (!ok) return;
      App.replaceState(payload);
      const added = App.auth.mergeFromBackup(data && data.auth);
      if (added) App.ui.toast(`${added} officer login${added > 1 ? 's' : ''} added from the backup`);
      App.ui.toast('Backup restored');
    });
  }

  const stamp = () => App.todayISO();

  Object.assign(App.actions, {
    'export-json': () => {
      const out = { app: 'leo306d1-treasury', version: 1, exportedAt: Date.now(), data: App.state, auth: App.auth.exportForBackup() };
      App.download(`leo-306d1-treasury-backup-${stamp()}.json`, JSON.stringify(out, null, 2), 'application/json');
      App.ui.toast('Backup downloaded');
    },
    'export-clubs': () => {
      const rows = [['Club', 'Type', 'Zone', 'Members', 'Club email', 'Club phone', 'President', 'President phone', 'Treasurer', 'Treasurer phone', 'Assistant treasurer', 'Assistant treasurer phone', 'Paid (Rs.)', 'Pending (Rs.)', 'Notes']];
      App.clubsSorted('all').forEach((c) => { const ps = App.clubPaymentSummary(c); rows.push([c.name, App.typeLabel(c.type), c.zone, c.members, c.email, c.phone, c.president, c.presidentPhone, c.treasurer, c.treasurerPhone, c.asstTreasurer, c.asstTreasurerPhone, ps.paid, ps.balance, App.notesFor(c.id).length]); });
      App.download(`clubs-${stamp()}.csv`, App.toCSV(rows), 'text/csv');
    },
    'export-all-payments': () => {
      const rows = [['Date', 'Club', 'Type', 'Payment', 'Amount (Rs.)', 'Method', 'Reference', 'Note', 'Recorded by']];
      App.state.payments.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((p) => {
        const c = App.clubById(p.clubId), h = App.headById(p.headId);
        rows.push([p.date, c ? c.name : '', c ? App.typeLabel(c.type) : '', h ? h.name : '', Number(p.amount).toFixed(2), p.method, p.reference, p.note, p.byName || '']);
      });
      App.download(`payments-${stamp()}.csv`, App.toCSV(rows), 'text/csv');
    },
    'export-notes': () => {
      const rows = [['Date', 'Club', 'Type', 'Tag', 'Remind on', 'Done', 'Note', 'By']];
      App.state.notes.slice().sort((a, b) => a.createdAt - b.createdAt).forEach((n) => {
        const c = App.clubById(n.clubId);
        rows.push([App.fmtDateTime(n.createdAt), c ? c.name : '', c ? App.typeLabel(c.type) : '', App.NOTE_TAGS[n.tag] || n.tag, n.remindOn || '', App.isTask(n) ? (n.done ? 'Yes' : 'No') : '', n.text, n.byName || '']);
      });
      App.download(`club-notes-${stamp()}.csv`, App.toCSV(rows), 'text/csv');
    },
    'load-demo': async () => {
      if (App.state.clubs.length) {
        const ok = await App.ui.confirm({ title: 'Load sample data?', danger: true, confirmText: 'Replace with sample data', message: `Sample data will <strong>replace</strong> the clubs, notes, reports and payments ${App.cloud.enabled ? 'in the shared database, for every officer' : 'currently saved in this browser'}. Download a backup first if you need them.` });
        if (!ok) return;
      }
      App.replaceState(App.demoState());
      App.ui.toast('Sample data loaded');
      location.hash = '#/dashboard';
    },
    'clear-all': async () => {
      const ok = await App.ui.confirm({ title: 'Clear all data?', danger: true, confirmText: 'Erase everything', message: `Every club, note, report mark, payment type and payment ${App.cloud.enabled ? 'in the shared database will be <strong>permanently erased for every officer</strong>' : 'saved in this browser will be <strong>permanently erased</strong>'}. Download a backup first if you may need it.` });
      if (!ok) return;
      const keep = App.state.settings;
      const fresh = App.defaultState();
      fresh.settings = { ...keep, demo: false };
      App.replaceState(fresh);
      App.ui.toast('All data cleared');
    },
  });

  App.views.settings = { render, mount, title: 'Settings & Backup' };
})();
