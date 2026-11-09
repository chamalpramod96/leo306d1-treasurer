/* =========================================================
   pwa.js — install as an app (Android / desktop / iPhone),
   offline service worker, and the phone "More" menu
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const esc = App.esc;
  const DISMISS_KEY = 'leo306d1.installDismissed';

  let deferredPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canServiceWorker = () => 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);

  // Offline support (needs https:// or localhost — not available when opened as a file)
  if (canServiceWorker()) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    App.refresh && App.auth.current() && App.refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    App.ui.toast('Installed — open “Leo 306 D1” from your home screen');
    App.refresh && App.auth.current() && App.refresh();
  });

  /** 'prompt' (Android/Chrome/Edge), 'ios' (Safari: Add to Home Screen), or '' (installed / not possible). */
  function installMode() {
    if (isStandalone()) return '';
    if (deferredPrompt) return 'prompt';
    if (isIOS() && canServiceWorker()) return 'ios';
    return '';
  }

  async function install() {
    const mode = installMode();
    if (mode === 'prompt') {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (choice && choice.outcome === 'accepted') localStorage.setItem(DISMISS_KEY, '1');
      App.refresh();
    } else if (mode === 'ios') {
      App.ui.open({
        title: 'Install on iPhone / iPad', size: 'sm',
        render: () => `<ol class="ios-steps">
            <li>Tap the <b>Share</b> button <span class="ios-share" aria-hidden="true">⬆︎</span> in Safari's toolbar.</li>
            <li>Scroll and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>. The portal opens full-screen like an app.</li>
          </ol>
          <p class="hint" style="margin:0">Use Safari — other iPhone browsers may not offer this.</p>`,
        footer: () => '<button class="btn btn-primary" data-close>Got it</button>',
      });
    }
  }

  /** Small card shown on the phone dashboard until installed or dismissed. */
  function installCard() {
    const mode = installMode();
    if (!mode || localStorage.getItem(DISMISS_KEY)) return '';
    return `<div class="install-card">
      <img src="assets/logo-sm.webp" alt="" width="55" height="48">
      <div class="ic-text"><b>Install the portal as an app</b><span>Opens full-screen from your home screen, even offline.</span></div>
      <div class="ic-actions"><button class="btn btn-gold btn-sm" data-action="install-app">Install</button>
      <button class="btn btn-ghost btn-sm" data-action="install-dismiss" aria-label="Not now">✕</button></div>
    </div>`;
  }

  function moreMenu() {
    const u = App.auth.current();
    if (!u) return;
    const mode = installMode();
    const item = (href, ico, label, sub, extra = '') => `<a class="more-item" href="${href}" data-close ${extra}><span class="mi-ico" aria-hidden="true">${ico}</span><span class="mi-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="mi-go" aria-hidden="true">›</span></a>`;
    const btn = (action, ico, label, sub, cls = '') => `<button type="button" class="more-item ${cls}" data-action="${action}" data-close><span class="mi-ico" aria-hidden="true">${ico}</span><span class="mi-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="mi-go" aria-hidden="true">›</span></button>`;
    App.ui.open({
      title: esc(u.name), sub: esc(App.auth.roleLabel(u.role)), size: 'sm',
      render: () => `<div class="more-list">
          ${item('#/settings', '⚙', 'Settings &amp; Backup', 'Leo year, backups, CSV exports')}
          ${App.can('users') ? item('#/users', '⚿', 'Users &amp; Access', 'Officer logins') : ''}
          ${btn('my-account', '◉', 'My account', 'Change password')}
          ${mode ? btn('install-app', '⤓', 'Install as app', mode === 'ios' ? 'Add to your iPhone home screen' : 'Add to your home screen') : ''}
          ${btn('logout', '⎋', 'Sign out', '', 'is-danger')}
        </div>
        <p class="more-foot">Leo Year ${App.leoYearLabel()} · ${esc(App.state.settings.districtName || 'Leo District 306 D1')}</p>`,
    });
  }

  Object.assign(App.actions, {
    'more-menu': () => moreMenu(),
    'install-app': () => { App.ui.closeAll(); install(); },
    'install-dismiss': () => { localStorage.setItem(DISMISS_KEY, '1'); App.refresh(); },
  });

  App.pwa = { installMode, install, installCard, isStandalone };
})();
