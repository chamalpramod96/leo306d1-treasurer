/* =========================================================
   Users & Access — Super Admin manages officer logins;
   "My account" panel for every signed-in officer
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { esc, chip, formData } = App.ui;

  const SLOT_ORDER = ['president', 'vicepresident', 'treasurer', 'asst_treasurer', 'superadmin'];

  function tempPassword() {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789';
    const all = letters + digits;
    const r = crypto.getRandomValues(new Uint8Array(10));
    let pw = [...r].map((b) => all[b % all.length]).join('');
    pw = letters[r[0] % letters.length] + digits[r[1] % digits.length] + pw.slice(2);
    return pw;
  }

  function render() {
    if (!App.can('users')) {
      return `<section class="view"><div class="empty"><h3>No access</h3><p>Only the Super Admin can manage officer logins.</p></div></section>`;
    }
    const users = App.auth.users();
    const me = App.auth.current();

    const slots = SLOT_ORDER.map((role) => {
      const R = App.ROLES[role];
      const list = users.filter((u) => u.role === role);
      const cards = list.map((u) => userCard(u, me)).join('');
      const empty = Array.from({ length: Math.max(0, R.max - list.length) }, (_, i) => `
        <div class="user-card is-empty">
          <div class="user-role">${esc(R.label)}${R.max > 1 ? ` <small>· login ${list.length + i + 1} of ${R.max}</small>` : ''}</div>
          <p class="hint" style="margin:6px 0 12px">No login created yet.</p>
          <button class="btn btn-primary btn-sm" data-action="user-create" data-role="${role}">+ Create login</button>
        </div>`).join('');
      return cards + empty;
    }).join('');

    const roles = SLOT_ORDER;
    const permRows = Object.entries(App.PERM_INFO).map(([p, label]) => `<tr><th scope="row">${esc(label)}</th>${roles.map((r) => `<td style="text-align:center">${App.PERMS[r].includes(p) ? '<span class="perm-yes" aria-label="Yes">✓</span>' : '<span class="perm-no" aria-label="No">—</span>'}</td>`).join('')}</tr>`).join('');

    return `<section class="view">
      <div class="page-head"><div>
        <div class="eyebrow">Super Admin</div>
        <h1 class="page-title">Users &amp; Access</h1>
        <p class="lede">Create logins for the District President, Vice President, Treasurer and the two Assistant Treasurers.</p>
      </div></div>

      <div class="callout" style="margin-bottom:18px">
        <b>How logins work:</b> new officers get a temporary password and must set their own at first sign-in.
        Logins are kept in this browser together with the data and are included in full backups (passwords only as secure hashes).
        Officers sign in on the device where the portal data is kept.
      </div>

      <div class="user-grid">${slots}</div>

      <div class="stack" style="margin-top:18px">
        <div class="card">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">✓</span>What each role can do</h2></div>
          <div class="table-wrap" style="box-shadow:none">
            <table class="table perm-table">
              <thead><tr><th>Permission</th>${roles.map((r) => `<th style="text-align:center">${esc(App.ROLES[r].short)}</th>`).join('')}</tr></thead>
              <tbody>${permRows}<tr><th scope="row">View dashboard, clubs, reports &amp; payments</th>${roles.map(() => '<td style="text-align:center"><span class="perm-yes" aria-label="Yes">✓</span></td>').join('')}</tr></tbody>
            </table>
          </div>
          <p class="hint" style="margin:10px 0 0">Officers can always edit or delete their own notes.</p>
        </div>
        <div class="card">
          <div class="card-head"><h2 class="card-title"><span class="ttl-ico">⚿</span>Super Admin recovery key</h2></div>
          <p class="hint" style="margin-top:0">The recovery key resets the Super Admin password if it is forgotten. Generating a new key makes the old one stop working.</p>
          <button class="btn" data-action="recovery-regen">Generate a new recovery key</button>
        </div>
      </div>
    </section>`;
  }

  function userCard(u, me) {
    const R = App.ROLES[u.role];
    const self = me && me.id === u.id;
    const status = !u.active ? chip('na', '⏸', 'Disabled') : u.mustChange ? chip('pending', '…', 'Must set password') : chip('ok', '✓', 'Active');
    return `<div class="user-card ${u.active ? '' : 'is-off'}">
      <div class="user-role">${esc(R.label)}${self ? ' <small>· you</small>' : ''}</div>
      <div class="user-name">${esc(u.name)}</div>
      <div class="user-meta">@${esc(u.username)} · ${status}</div>
      <div class="user-meta">Last sign-in: ${u.lastLogin ? esc(App.fmtDateTime(u.lastLogin)) : 'never'}</div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-sm" data-action="user-edit" data-id="${u.id}">✎ Edit</button>
        <button class="btn btn-sm" data-action="user-reset" data-id="${u.id}">Reset password</button>
        ${self ? '' : `<button class="btn btn-sm" data-action="user-toggle" data-id="${u.id}">${u.active ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-sm btn-danger" data-action="user-delete" data-id="${u.id}">Delete</button>`}
      </div>
    </div>`;
  }

  /* ---------- dialogs ---------- */
  function showPassword(title, name, username, pw) {
    App.ui.open({
      title, size: 'sm',
      render: () => `<p style="margin-top:0">Give these details to <b>${esc(name)}</b>. They will be asked to choose their own password when they first sign in.</p>
        <dl class="kv" style="font-size:15px"><dt>Username</dt><dd>${esc(username)}</dd><dt>Temporary password</dt><dd><code class="temp-pw">${esc(pw)}</code></dd></dl>
        <p class="hint">This password is not shown again.</p>`,
      footer: () => `<button class="btn" id="copyPw">Copy</button><button class="btn btn-primary" data-close>Done</button>`,
      onMount: (el) => el.querySelector('#copyPw').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(`Username: ${username}\nTemporary password: ${pw}`); App.ui.toast('Copied'); } catch (e) { App.ui.toast('Copy failed', 'error'); }
      }),
    });
  }

  function createDialog(role) {
    const R = App.ROLES[role];
    const pw = tempPassword();
    const ctrl = App.ui.open({
      title: 'Create login', sub: esc(R.label),
      render: () => `<form id="userForm" class="form-grid">
          <label class="field full"><span>Full name *</span><input name="name" required placeholder="e.g. Leo Lion …" autofocus></label>
          <label class="field"><span>Username *</span><input name="username" required autocapitalize="none" spellcheck="false" placeholder="e.g. treasurer"><small>Letters, numbers, dot, dash, underscore</small></label>
          <label class="field"><span>Temporary password *</span><input name="password" required value="${esc(pw)}" spellcheck="false"><small>They change it at first sign-in</small></label>
        </form><div class="auth-error" role="alert" hidden style="margin-top:12px"></div>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="userForm">Create login</button>`,
      onMount: (el) => el.querySelector('#userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = formData(e.target); d.password = e.target.password.value;
        try {
          const u = await App.auth.createUser({ ...d, role });
          ctrl.close();
          App.refresh();
          showPassword('Login created', u.name, u.username, d.password);
        } catch (err) { const b = el.querySelector('.auth-error'); b.textContent = err.message; b.hidden = false; }
      }),
    });
  }

  function editDialog(id) {
    const u = App.auth.users().find((x) => x.id === id);
    if (!u) return;
    const ctrl = App.ui.open({
      title: 'Edit login', sub: esc(App.auth.roleLabel(u.role)), size: 'sm',
      render: () => `<form id="userEdit" class="stack" style="gap:12px">
          <label class="field"><span>Full name</span><input name="name" required value="${esc(u.name)}"></label>
          <label class="field"><span>Username</span><input name="username" required value="${esc(u.username)}" autocapitalize="none" spellcheck="false"></label>
        </form><div class="auth-error" role="alert" hidden style="margin-top:12px"></div>`,
      footer: () => `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="userEdit">Save</button>`,
      onMount: (el) => el.querySelector('#userEdit').addEventListener('submit', (e) => {
        e.preventDefault();
        try { App.auth.updateUser(id, formData(e.target)); ctrl.close(); App.refresh(); App.ui.toast('Login updated'); }
        catch (err) { const b = el.querySelector('.auth-error'); b.textContent = err.message; b.hidden = false; }
      }),
    });
  }

  function myAccount() {
    const u = App.auth.current();
    if (!u) return;
    const ctrl = App.ui.open({
      title: esc(u.name), sub: `${esc(App.auth.roleLabel(u.role))} · @${esc(u.username)}`,
      render: () => `
        <div class="card" style="box-shadow:none;margin-bottom:14px">
          <div class="card-head"><h3 class="card-title">What you can do</h3></div>
          <ul class="perm-list">${Object.entries(App.PERM_INFO).filter(([p]) => App.can(p)).map(([, l]) => `<li>✓ ${esc(l)}</li>`).join('') || '<li>View only</li>'}
            <li>✓ View dashboard, clubs, reports &amp; payments</li></ul>
        </div>
        <form id="pwForm" class="stack" style="gap:12px">
          <h3 class="card-title" style="margin:0">Change password</h3>
          <label class="field"><span>Current password</span><input type="password" name="old" required autocomplete="current-password"></label>
          <label class="field"><span>New password</span><input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
          <label class="field"><span>Confirm new password</span><input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label>
          <div class="auth-error" role="alert" hidden></div>
          <div><button class="btn btn-primary" type="submit">Change password</button></div>
        </form>`,
      footer: () => `<button class="btn btn-danger left" data-action="logout">⎋ Sign out</button><button class="btn" data-close>Close</button>`,
      onMount: (el) => el.querySelector('#pwForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target, err = el.querySelector('.auth-error');
        try {
          if (f.password.value !== f.confirm.value) throw new Error('The two passwords do not match.');
          await App.auth.changeOwnPassword(f.old.value, f.password.value);
          ctrl.close();
          App.ui.toast('Password changed');
        } catch (x) { err.textContent = x.message; err.hidden = false; }
      }),
    });
  }

  Object.assign(App.actions, {
    'user-create': (el) => createDialog(el.dataset.role),
    'user-edit': (el) => editDialog(el.dataset.id),
    'user-reset': async (el) => {
      const u = App.auth.users().find((x) => x.id === el.dataset.id);
      if (!u) return;
      const ok = await App.ui.confirm({ title: 'Reset password?', confirmText: 'Reset password', message: `A new temporary password will be created for <b>${esc(u.name)}</b> (${esc(App.auth.roleLabel(u.role))}). Their old password stops working.` });
      if (!ok) return;
      const pw = tempPassword();
      try { await App.auth.resetPassword(u.id, pw); App.refresh(); showPassword('Password reset', u.name, u.username, pw); }
      catch (e) { App.ui.toast(e.message, 'error'); }
    },
    'user-toggle': (el) => {
      const u = App.auth.users().find((x) => x.id === el.dataset.id);
      if (!u) return;
      try { App.auth.setActive(u.id, !u.active); App.refresh(); App.ui.toast(u.active ? `${u.name} can no longer sign in` : `${u.name} can sign in again`); }
      catch (e) { App.ui.toast(e.message, 'error'); }
    },
    'user-delete': async (el) => {
      const u = App.auth.users().find((x) => x.id === el.dataset.id);
      if (!u) return;
      const ok = await App.ui.confirm({ title: 'Delete login?', danger: true, confirmText: 'Delete login', message: `<b>${esc(u.name)}</b> (${esc(App.auth.roleLabel(u.role))}) will no longer be able to sign in. Notes and payments they recorded are kept.` });
      if (!ok) return;
      try { App.auth.deleteUser(u.id); App.refresh(); App.ui.toast('Login deleted'); } catch (e) { App.ui.toast(e.message, 'error'); }
    },
    'recovery-regen': async () => {
      const ok = await App.ui.confirm({ title: 'Generate a new recovery key?', confirmText: 'Generate', message: 'The current recovery key will stop working. Make sure you save the new one.' });
      if (!ok) return;
      const key = await App.auth.regenerateRecoveryKey();
      App.ui.open({
        title: 'New recovery key', size: 'sm',
        render: () => `<p style="margin-top:0">Save this key somewhere safe. It is shown only once.</p><div class="recovery-key">${esc(key)}</div>`,
        footer: () => `<button class="btn" id="dlKey2">Download</button><button class="btn btn-primary" data-close>I've saved it</button>`,
        onMount: (el) => el.querySelector('#dlKey2').addEventListener('click', () => App.download('leo-306d1-treasury-RECOVERY-KEY.txt', `Leo District 306 D1 — Treasury Portal\nSuper Admin recovery key\n\n${key}\n`, 'text/plain')),
      });
    },
    'my-account': () => myAccount(),
    'logout': () => { App.ui.closeAll(); App.auth.logout('You have signed out.'); },
  });

  App.views.users = { render, title: 'Users & Access' };
})();
