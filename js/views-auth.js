/* =========================================================
   views-auth.js — sign-in, first-time Super Admin setup,
   recovery-key reset and forced password change screens
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const esc = App.esc;

  let mode = 'login';          // login | setup | setupKey | recover | mustChange — and with Firebase: reset | connecting | cloudError
  let flash = '';              // message shown above the form (e.g. after idle sign-out)
  let pendingKey = '';         // recovery key shown once after setup

  const el = () => document.getElementById('authScreen');
  const cloud = () => App.cloud.enabled;

  function roleChips() {
    return ['president', 'vicepresident', 'treasurer', 'asst_treasurer', 'superadmin']
      .map((r) => `<li><span aria-hidden="true">★</span>${esc(App.ROLES[r].label)}${App.ROLES[r].max > 1 ? ` <small>(${App.ROLES[r].max})</small>` : ''}</li>`).join('');
  }

  function shell(inner) {
    const st = App.state.settings;
    return `
      <section class="auth-hero" aria-hidden="false">
        <div class="auth-hero-mark" aria-hidden="true"></div>
        <div class="auth-hero-inner">
          <img class="auth-emblem" src="assets/logo.webp" alt="Leo District 306 D1 emblem" width="640" height="556">
          <div class="auth-kicker">Office of the District Treasurer</div>
          <h1 class="auth-title">${esc(st.districtName || 'Leo District 306 D1')}</h1>
          <div class="auth-motto"><span aria-hidden="true">★</span> Values Lead Purpose <span aria-hidden="true">★</span></div>
          <div class="auth-year">Leo Year ${App.leoYearLabel()}</div>
          <div class="auth-access">
            <div class="auth-access-title">Restricted access for district officers</div>
            <ul>${roleChips()}</ul>
          </div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="auth-panel-mark" aria-hidden="true"></div>
        <div class="auth-card">
          <img class="auth-card-logo" src="assets/logo-sm.webp" alt="" width="200" height="174">
          ${inner}
        </div>
        <p class="auth-foot">Treasury Portal · ${esc(st.districtName || 'Leo District 306 D1')} · Authorised officers only</p>
      </section>`;
  }

  function pwField(name, label, extra = '') {
    return `<label class="field"><span>${label}</span>
      <div class="pw-wrap"><input type="password" name="${name}" required ${extra}>
      <button type="button" class="pw-toggle" data-pwtoggle aria-label="Show password" title="Show password">👁</button></div></label>`;
  }

  function errBox() { return `<div class="auth-error" role="alert" hidden></div>`; }
  function flashBox() { return flash ? `<div class="auth-flash" role="status">${esc(flash)}</div>` : ''; }

  function render() {
    if (!cloud() && !App.auth.cryptoOK()) {
      return shell(`<h2 class="auth-h">Secure connection needed</h2>
        <p class="auth-p">Sign-in needs the browser's secure crypto features. Open the portal from <b>https://</b>, <b>http://localhost</b>, or by double-clicking <b>index.html</b>.</p>`);
    }
    if (mode === 'connecting') {
      const first = App.cloud.phase() === 'loading';
      return shell(`<div class="auth-connecting" role="status">
          <span class="spin" aria-hidden="true"></span>
          <h2 class="auth-h">${first ? 'Connecting…' : 'Loading district data…'}</h2>
          <p class="auth-p">${first ? 'Connecting to the district’s shared database.' : 'Fetching the latest clubs, reports and payments.'}</p>
        </div>`);
    }
    if (mode === 'cloudError') {
      return shell(`<h2 class="auth-h">Can’t connect</h2>
        <div class="auth-error" role="alert">${esc(App.cloud.error())}</div>
        <button type="button" class="btn btn-primary auth-submit" data-action-auth="retry">Try again</button>`);
    }
    if (mode === 'reset') {
      return shell(`
        <h2 class="auth-h">Reset your password</h2>
        <p class="auth-p">Enter the email of your login. Firebase sends you a link to choose a new password.</p>
        ${errBox()}
        <form id="authForm" class="auth-form">
          <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" autocapitalize="none" spellcheck="false" autofocus></label>
          <button class="btn btn-primary auth-submit" type="submit">Send reset link</button>
        </form>
        <button type="button" class="auth-link" data-mode="login">← Back to sign in</button>`);
    }
    if (mode === 'setup') {
      return shell(`
        <h2 class="auth-h">First-time setup</h2>
        <p class="auth-p">Create the <b>Super Admin</b> login. The Super Admin then creates logins for the District President, Vice President, Treasurer and the two Assistant Treasurers.${cloud() ? ' Logins and data are kept in the district’s Firebase project, so they work on any device.' : ''}</p>
        ${errBox()}
        <form id="authForm" class="auth-form" autocomplete="off">
          <label class="field"><span>Full name</span><input name="name" required placeholder="e.g. Leo A. Perera" autofocus></label>
          ${cloud()
            ? '<label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com"><small>You sign in with this email. Password-reset links are sent here.</small></label>'
            : '<label class="field"><span>Username</span><input name="username" required placeholder="e.g. superadmin" autocapitalize="none" spellcheck="false"><small>3–32 characters: letters, numbers, dot, dash, underscore</small></label>'}
          ${pwField('password', 'Password', 'autocomplete="new-password" minlength="8"')}
          ${pwField('confirm', 'Confirm password', 'autocomplete="new-password" minlength="8"')}
          <small class="hint">At least 8 characters, with letters and numbers.</small>
          <button class="btn btn-primary auth-submit" type="submit">Create Super Admin</button>
        </form>`);
    }
    if (mode === 'setupKey') {
      return shell(`
        <h2 class="auth-h">Save your recovery key</h2>
        <p class="auth-p">If the Super Admin password is ever forgotten, this key is the <b>only way</b> to reset it. It is shown once — write it down or store it somewhere safe.</p>
        <div class="recovery-key" id="recKey">${esc(pendingKey)}</div>
        <div class="btn-row" style="justify-content:center;margin-bottom:14px">
          <button type="button" class="btn btn-sm" id="copyKey">Copy key</button>
          <button type="button" class="btn btn-sm" id="dlKey">Download as text file</button>
        </div>
        <label class="switch" style="margin-bottom:14px"><input type="checkbox" id="savedKey"> I have saved the recovery key</label>
        <button class="btn btn-primary auth-submit" id="continueBtn" disabled>Continue to the portal</button>`);
    }
    if (mode === 'recover') {
      return shell(`
        <h2 class="auth-h">Reset Super Admin password</h2>
        <p class="auth-p">Enter the recovery key that was shown when the portal was first set up.</p>
        ${errBox()}
        <form id="authForm" class="auth-form" autocomplete="off">
          <label class="field"><span>Recovery key</span><input name="key" required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" autofocus></label>
          ${pwField('password', 'New password', 'autocomplete="new-password" minlength="8"')}
          ${pwField('confirm', 'Confirm new password', 'autocomplete="new-password" minlength="8"')}
          <button class="btn btn-primary auth-submit" type="submit">Reset password</button>
        </form>
        <button type="button" class="auth-link" data-mode="login">← Back to sign in</button>`);
    }
    if (mode === 'mustChange') {
      const u = App.auth.current();
      return shell(`
        <h2 class="auth-h">Set your own password</h2>
        <p class="auth-p">Welcome, <b>${esc(u ? u.name : '')}</b>. Your login was created by the Super Admin — choose a new password only you know.</p>
        ${errBox()}
        <form id="authForm" class="auth-form">
          ${pwField('old', 'Temporary password', 'autocomplete="current-password" autofocus')}
          ${pwField('password', 'New password', 'autocomplete="new-password" minlength="8"')}
          ${pwField('confirm', 'Confirm new password', 'autocomplete="new-password" minlength="8"')}
          <small class="hint">At least 8 characters, with letters and numbers.</small>
          <button class="btn btn-primary auth-submit" type="submit">Save password &amp; continue</button>
        </form>
        <button type="button" class="auth-link" data-action-auth="logout">Sign out</button>`);
    }
    // login
    return shell(`
      <h2 class="auth-h">Sign in</h2>
      <p class="auth-p">${cloud() ? 'Use the email and password of your officer login.' : 'Use the login given to you by the Super Admin.'}</p>
      ${flashBox()}${errBox()}
      <form id="authForm" class="auth-form">
        ${cloud()
          ? '<label class="field"><span>Email</span><input name="email" type="email" required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label>'
          : '<label class="field"><span>Username</span><input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label>'}
        ${pwField('password', 'Password', 'autocomplete="current-password"')}
        <button class="btn btn-primary auth-submit" type="submit">Sign in</button>
      </form>
      <details class="auth-help">
        <summary>Forgot your password?</summary>
        ${cloud()
          ? '<p>Any officer, the Super Admin included, can get a reset link by email.</p><button type="button" class="auth-link" data-mode="reset">Email me a reset link →</button>'
          : '<p>Officers: ask the <b>Super Admin</b> to reset it from <i>Users &amp; Access</i>.</p>'}
        ${App.auth.hasRecovery() ? '<button type="button" class="auth-link" data-mode="recover">Super Admin: reset with recovery key →</button>' : ''}
      </details>`);
  }

  function pickMode() {
    const cur = App.auth.current();
    if (cloud()) {
      const ph = App.cloud.phase();
      if (ph === 'error') mode = 'cloudError';
      else if (cur && cur.mustChange) mode = 'mustChange';
      else if (ph !== 'signedOut') mode = 'connecting';
      else if (!App.auth.hasUsers()) mode = 'setup';
      else if (mode !== 'reset') mode = 'login';
      return;
    }
    if (!App.auth.hasUsers()) mode = mode === 'setupKey' ? 'setupKey' : 'setup';
    else if (cur && cur.mustChange) mode = 'mustChange';
    else if (!['recover', 'setupKey'].includes(mode)) mode = 'login';
  }

  function show(msg) {
    if (msg !== undefined) flash = msg || '';
    pickMode();
    document.body.classList.add('locked');
    const box = el();
    // A background refresh must not wipe what the officer is typing
    if (msg === undefined && !box.hidden && box.dataset.mode === mode && box.querySelector('#authForm')) return;
    box.hidden = false;
    box.dataset.mode = mode;
    box.innerHTML = render();
    mount(box);
  }

  function hide() {
    document.body.classList.remove('locked');
    const box = el();
    box.hidden = true;
    box.dataset.mode = '';
    box.innerHTML = '';
    flash = '';
    mode = 'login';
  }

  function setBusy(form, busy, label) {
    const b = form.querySelector('.auth-submit');
    if (!b) return;
    if (busy) { b.dataset.label = b.textContent; b.textContent = label || 'Please wait…'; b.disabled = true; }
    else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
  }
  function showErr(box, msg) {
    const e = box.querySelector('.auth-error');
    if (e) { e.textContent = msg; e.hidden = !msg; }
    const fl = box.querySelector('.auth-flash');
    if (fl && msg) { fl.remove(); flash = ''; }
  }

  function enterApp() {
    hide();
    App.refresh();
    const u = App.auth.current();
    if (u) App.ui.toast(`Welcome, ${u.name} · ${App.auth.roleLabel(u.role)}`);
  }

  function mount(box) {
    box.querySelectorAll('[data-pwtoggle]').forEach((b) => b.addEventListener('click', () => {
      const i = b.parentElement.querySelector('input');
      const showIt = i.type === 'password';
      i.type = showIt ? 'text' : 'password';
      b.setAttribute('aria-label', showIt ? 'Hide password' : 'Show password');
      b.classList.toggle('on', showIt);
    }));
    box.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; box.dataset.mode = mode; flash = ''; box.innerHTML = render(); mount(box); }));
    const lo = box.querySelector('[data-action-auth="logout"]');
    lo && lo.addEventListener('click', () => App.auth.logout(''));
    const retry = box.querySelector('[data-action-auth="retry"]');
    retry && retry.addEventListener('click', () => location.reload());

    const f = box.querySelector('#authForm');
    setTimeout(() => { const a = box.querySelector('[autofocus]'); a && a.focus(); }, 50);

    if (mode === 'setupKey') {
      const saved = box.querySelector('#savedKey'), cont = box.querySelector('#continueBtn');
      saved.addEventListener('change', () => { cont.disabled = !saved.checked; });
      box.querySelector('#copyKey').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(pendingKey); App.ui.toast('Recovery key copied'); } catch (e) { App.ui.toast('Copy failed — please write the key down.', 'error'); }
      });
      box.querySelector('#dlKey').addEventListener('click', () => App.download('leo-306d1-treasury-RECOVERY-KEY.txt',
        `Leo District 306 D1 — Treasury Portal\nSuper Admin recovery key\n\n${pendingKey}\n\nKeep this file private. Anyone with this key can reset the Super Admin password.\n`, 'text/plain'));
      cont.addEventListener('click', () => { pendingKey = ''; mode = 'login'; enterApp(); });
      return;
    }
    if (!f) return;

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      showErr(box, '');
      const d = App.ui.formData(f);
      // keep passwords untrimmed
      ['password', 'confirm', 'old'].forEach((k) => { if (f[k]) d[k] = f[k].value; });
      try {
        if (mode === 'login') {
          setBusy(f, true, 'Signing in…');
          const u = await App.auth.login(cloud() ? d.email : d.username, d.password);
          if (u && u.mustChange) { mode = 'mustChange'; show(''); return; }
          enterApp();
        } else if (mode === 'reset') {
          setBusy(f, true, 'Sending…');
          await App.auth.sendReset(d.email);
          mode = 'login';
          show(`If ${d.email} has a login, a password-reset link is on its way. Check the spam folder too.`);
        } else if (mode === 'setup') {
          if (d.password !== d.confirm) throw new Error('The two passwords do not match.');
          setBusy(f, true, 'Creating…');
          const { recoveryKey } = await App.auth.setupSuperAdmin(d);
          if (!recoveryKey) { mode = 'login'; enterApp(); return; }   // Firebase: passwords are reset by email instead
          pendingKey = recoveryKey;
          mode = 'setupKey';
          box.dataset.mode = mode;
          box.innerHTML = render(); mount(box);
        } else if (mode === 'recover') {
          if (d.password !== d.confirm) throw new Error('The two passwords do not match.');
          setBusy(f, true, 'Checking…');
          const username = await App.auth.recoverSuperAdmin(d.key, d.password);
          mode = 'login';
          show(`Password reset. Sign in as “${username}” with your new password.`);
        } else if (mode === 'mustChange') {
          if (d.password !== d.confirm) throw new Error('The two passwords do not match.');
          setBusy(f, true, 'Saving…');
          await App.auth.changeOwnPassword(d.old, d.password);
          mode = 'login';
          enterApp();
        }
      } catch (err) {
        setBusy(f, false);
        showErr(box, err.message || String(err));
        const pw = f.querySelector('input[type=password]');
        if (mode === 'login' && pw) { pw.value = ''; pw.focus(); }
      }
    });
  }

  App.authScreen = { show, hide };
})();
