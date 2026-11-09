/* =========================================================
   main.js — router, sign-in gate, header sync, permission-checked
   action delegation, loading screen
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const root = document.getElementById('app');
  let lastRoute = '';

  /** Permission needed for each data-action (checked before the handler runs). */
  const ACTION_PERMS = {
    'add-club': 'clubs', 'edit-club': 'clubs', 'bulk-clubs': 'clubs', 'delete-club': 'clubs',
    'new-payment': 'payments', 'edit-payment': 'payments', 'delete-payment': 'payments',
    'new-head': 'heads', 'edit-head': 'heads', 'delete-head': 'heads',
    'export-reports': 'export', 'export-log': 'export', 'export-matrix': 'export',
    'export-clubs': 'export', 'export-all-payments': 'export', 'export-notes': 'export',
    'export-json': 'restore', 'load-demo': 'danger', 'clear-all': 'danger',
    'user-create': 'users', 'user-edit': 'users', 'user-reset': 'users', 'user-toggle': 'users', 'user-delete': 'users', 'recovery-regen': 'users',
    'new-notice': 'notes', 'send-reminder': 'notes',
    'issue-receipt': 'payments', 'issue-missing-receipts': 'payments',
    'export-receipts-xlsx': 'export', 'export-receipts-pdf': 'export',
  };
  /** Pages that belong under another menu item (a club profile lives under Clubs). */
  const NAV_PARENT = { club: 'clubs' };
  const ROUTE_PERMS = { users: 'users' };

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    let name = App.views[parts[0]] ? parts[0] : 'dashboard';
    if (ROUTE_PERMS[name] && !App.can(ROUTE_PERMS[name])) {
      name = 'dashboard';
      history.replaceState(null, '', '#/dashboard');
      return { name, sub: '' };
    }
    return { name, sub: parts[1] || '' };
  }

  function initials(name) {
    const parts = (name || '').replace(/^(leo|lion)\s+/i, '').split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function syncChrome() {
    const st = App.state.settings;
    const yr = App.leoYearLabel();
    const u = App.auth.current();
    document.getElementById('brandTitle').textContent = st.districtName || 'Leo District 306 D1';
    document.getElementById('footDistrict').textContent = st.districtName || 'Leo District 306 D1';
    document.getElementById('yearPill').textContent = 'Leo Year ' + yr;
    document.getElementById('footYear').textContent = yr;
    document.getElementById('hdrTreasurer').textContent = u ? `Signed in · ${App.auth.roleLabel(u.role)}` : '';
    document.getElementById('navUserName').textContent = u ? u.name : '';
    document.getElementById('navUserRole').textContent = u ? App.ROLES[u.role].short : '';
    document.getElementById('navAvatar').textContent = u ? initials(u.name) : '';
    document.getElementById('hdrAvatar').textContent = u ? initials(u.name) : '';
    document.getElementById('demoBanner').hidden = !st.demo || !u;
    App.ui.applyPerms(document.getElementById('mainNav'));
    // phone: bottom tab bar + floating "record payment" button
    const { name, sub } = u ? parseRoute() : { name: '', sub: '' };
    const navName = NAV_PARENT[name] || name;
    const onMore = ['settings', 'users'].includes(name);
    document.querySelectorAll('#tabbar [data-route]').forEach((a) => {
      const on = a.dataset.route === navName || (a.dataset.route === 'more' && onMore);
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const fab = document.getElementById('fab');
    const onClub = name === 'club' && App.clubById(sub);
    fab.hidden = !u || !App.can('payments') || !(['dashboard', 'payments'].includes(name) || onClub) || !App.state.paymentHeads.length || !App.state.clubs.length;
    if (onClub) fab.dataset.club = sub; else delete fab.dataset.club;
  }

  /** Re-render the current page and any open "live" panels. */
  function refresh() {
    const u = App.auth.current();
    if (!u || u.mustChange) {
      App.ui.closeAll();
      root.innerHTML = '';
      lastRoute = '';
      syncChrome();
      App.authScreen.show();
      return;
    }
    if (document.body.classList.contains('locked')) App.authScreen.hide();

    const { name, sub } = parseRoute();
    const view = App.views[name];
    const key = name + '/' + sub;
    const keepScroll = key === lastRoute ? window.scrollY : 0;
    // remember focused search box so typing isn't interrupted by a re-render
    const active = document.activeElement && root.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : null;

    root.innerHTML = view.render(sub);
    if (key === lastRoute) root.querySelectorAll('.view').forEach((v) => (v.style.animation = 'none'));
    App.ui.applyPerms(root);
    view.mount && view.mount(root, sub);

    document.querySelectorAll('#mainNav a').forEach((a) => {
      const on = a.dataset.route === (NAV_PARENT[name] || name);
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${view.title} · District Treasurer · ${App.state.settings.districtName || 'Leo District 306 D1'}`;
    syncChrome();
    App.ui.refreshOpen();

    if (key !== lastRoute) {
      window.scrollTo(0, 0);
      lastRoute = key;
    } else {
      window.scrollTo(0, keepScroll);
      if (active) { const el = document.getElementById(active); el && el.focus && el.focus(); }
    }
  }
  App.refresh = refresh;

  // Signed out (button, idle timeout, account disabled…) → back to the sign-in screen
  App.on('auth', (ev) => {
    if (ev.type !== 'logout') return;
    App.ui.closeAll();
    root.innerHTML = '';
    lastRoute = '';
    syncChrome();
    App.authScreen.show(ev.message || '');
  });

  // Hash navigation: close panels and render
  window.addEventListener('hashchange', () => { App.ui.closeAll(); refresh(); });

  // Phone vs. desktop layouts render some pages differently (lists instead of wide tables)
  const mq = window.matchMedia('(max-width: 760px), (max-height: 500px) and (max-width: 1000px) and (orientation: landscape)');
  App.isMobile = () => mq.matches;
  const onLayoutChange = () => { if (App.auth.current()) refresh(); };
  if (mq.addEventListener) mq.addEventListener('change', onLayoutChange); else mq.addListener(onLayoutChange);

  // One delegated handler for every [data-action] button in the page or in dialogs
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const name = el.dataset.action;
    const fn = App.actions[name];
    if (!fn) return;
    e.preventDefault();
    if (name !== 'logout' && !App.auth.current()) return;
    const need = ACTION_PERMS[name];
    if (need && !App.can(need)) {
      App.ui.toast(`Your role (${App.auth.roleLabel(App.auth.current().role)}) can't do this.`, 'error');
      return;
    }
    fn(el, e);
  });

  // Data changed in another tab → stay in sync
  window.addEventListener('storage', (e) => {
    if (e.key === App.STORAGE_KEY && e.newValue) {
      try { App.replaceState(JSON.parse(e.newValue), { save: false }); } catch (err) { /* ignore */ }
    }
  });

  /* ---------- loading screen ---------- */
  const loader = document.getElementById('loader');
  const started = performance.now();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN_SHOW = reduced ? 300 : 1900;
  document.body.classList.add('is-loading');

  refresh();

  function hideLoader() {
    const wait = Math.max(0, MIN_SHOW - (performance.now() - started));
    setTimeout(() => {
      loader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      setTimeout(() => loader.remove(), 700);
      const a = document.querySelector('#authScreen:not([hidden]) [autofocus]');
      a && a.focus();
    }, wait);
  }
  if (document.readyState === 'complete') hideLoader();
  else window.addEventListener('load', hideLoader);
})();
