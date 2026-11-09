/* =========================================================
   cloud.js — the shared online database (Firebase)
   ---------------------------------------------------------
   Used only when js/firebase-config.js holds a Firebase project:
   • officers sign in with Firebase Authentication (email + password);
   • every club, note, notice, payment type, payment, receipt and each club's
     report sheet is its own Cloud Firestore document, so every officer sees
     the same data, live, on any device;
   • Firestore keeps a copy on the device, so the portal opens and records
     changes offline and uploads them when the connection is back;
   • receipt numbers are reserved on the server, so the DT and DAT never clash.
   firestore.rules enforces the same roles on the server.
   Without a project this file does nothing: data stays in the browser (core.js).
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  if (!App.CLOUD) { App.cloud = { enabled: false }; return; }

  const { useEmulators, ...config } = window.LEO_FIREBASE || {};
  const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
  const EMU = !!useEmulators && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // local testing only
  const EMU_AUTH = 'http://127.0.0.1:9099';
  const SESSION_KEY = 'leo306d1.session.v1';
  const UPLOAD_ASKED = 'leo306d1.uploadAsked';
  const IDLE_MS = 30 * 60 * 1000;
  const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
  const ARRAYS = ['clubs', 'notes', 'notices', 'paymentHeads', 'payments', 'receipts'];
  const COLLS = [...ARRAYS, 'reports', 'meta'];   // meta: settings, exemptions, receiptSeq

  let fa, au, fs;              // Firebase modules: app, auth, firestore
  let auth, db;
  let phase = 'loading';       // loading | error | signedOut | profile | ready
  let errorMsg = '';
  let setupDone = null;        // has the Super Admin been created? null = not known yet
  let fbUser = null, profile = null;
  let freshSignIn = false, settingUp = false;
  let unsubs = [];
  const users = new Map();     // uid → officer profile
  const docs = {};             // collection → Map(id → data): Firestore's view, plus our own pending writes
  COLLS.forEach((c) => (docs[c] = new Map()));
  let base = null;             // the state as documents, as last loaded or saved — commits are compared with it
  let dataReady = false;
  let saving = 0, lastError = '', online = navigator.onLine;
  let waiters = [];

  /* ---------- helpers ---------- */
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  /** JSON with sorted keys, so equal data always gives the same text. */
  function stable(v) {
    if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  const normEmail = (e) => (e || '').trim().toLowerCase();
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validId = (id) => typeof id === 'string' && id && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
  function withTimeout(p, ms, code = 'timeout') {
    let t;
    return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('Firebase did not answer in time.'), { code })), ms); })])
      .finally(() => clearTimeout(t));
  }
  function errText(e) {
    const code = String((e && e.code) || '');
    if (code.includes('permission-denied')) return 'permission denied by the Firestore rules';
    if (code.includes('unavailable')) return 'no connection to Firebase';
    if (code === 'timeout') return 'Firebase did not answer in time';
    return (e && e.message) || String(e);
  }
  function authMessage(e) {
    const code = String((e && e.code) || '');
    const map = {
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/invalid-login-credentials': 'Incorrect email or password.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/user-not-found': 'Incorrect email or password.',
      'auth/invalid-email': 'That email address is not valid.',
      'auth/user-disabled': 'This login has been disabled in Firebase.',
      'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or use “Forgot your password?”.',
      'auth/network-request-failed': 'No internet connection — signing in needs the internet.',
      'auth/email-already-in-use': 'That email already has a login.',
      'auth/weak-password': 'Choose a stronger password: at least 8 characters, with letters and numbers.',
      'auth/operation-not-allowed': 'Email/password sign-in is not switched on in Firebase (Authentication → Sign-in method).',
      'auth/requires-recent-login': 'For safety, sign out and sign in again, then retry.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The apiKey in js/firebase-config.js is not valid.',
      'auth/invalid-api-key': 'The apiKey in js/firebase-config.js is not valid.',
      'auth/unauthorized-domain': 'This web address is not allowed in Firebase (Authentication → Settings → Authorized domains).',
    };
    return map[code] || (e && e.message ? e.message.replace(/^Firebase:\s*/, '') : String(e));
  }

  /* ---------- session limits (same as the device-only logins) ---------- */
  function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function writeSession(s) { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
  function sessionValid(uid) {
    const s = readSession(), now = Date.now();
    return !!s && s.userId === uid && now - s.last <= IDLE_MS && now - s.issued <= MAX_SESSION_MS;
  }
  let lastTouch = 0;
  function touch() {
    if (!fbUser) return;
    const now = Date.now();
    if (now - lastTouch < 15000) return;
    lastTouch = now;
    const s = readSession();
    if (s && s.userId === fbUser.uid) { s.last = now; writeSession(s); }
  }
  ['click', 'keydown', 'pointerdown', 'scroll'].forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
  setInterval(() => {
    if (fbUser && !settingUp && !freshSignIn && !sessionValid(fbUser.uid)) logout('You were signed out after 30 minutes without activity.');
  }, 20000);

  /* ---------- status (header pill) ---------- */
  function status() {
    if (phase !== 'ready') return null;
    if (!online) return { code: 'off', label: 'Offline', title: 'You are offline. Changes are kept on this device and upload automatically when the connection is back.' };
    if (saving) return { code: 'busy', label: 'Saving…', title: 'Uploading changes to the shared database' };
    if (lastError) return { code: 'err', label: 'Not saved', title: 'The last change was not saved online: ' + lastError };
    return { code: 'ok', label: 'Synced', title: 'Everything is saved in the shared database' };
  }
  function paint() {
    const el = document.getElementById('syncPill');
    if (!el) return;
    const s = status();
    el.hidden = !s;
    if (s) { el.className = 'sync-pill is-' + s.code; el.textContent = s.label; el.title = s.title; }
  }
  window.addEventListener('online', () => {
    online = true; paint();
    if (setupDone === null && auth && !fbUser) readSetup();
    if (phase === 'ready') App.ui.toast(saving ? 'Back online — uploading the changes made offline…' : 'Back online');
  });
  window.addEventListener('offline', () => {
    online = false; paint();
    if (phase === 'ready') App.ui.toast('You are offline. Changes are kept on this device and upload by themselves when the connection is back.');
  });

  function refresh() { if (App.refresh) App.refresh(); else paint(); }
  function setPhase(p) { phase = p; paint(); refresh(); }
  function setError(msg) { errorMsg = msg; phase = 'error'; rejectWaiters(msg); paint(); refresh(); }

  /* ---------- waiting for sign-in to finish ---------- */
  function currentPub() {
    if (!profile) return null;
    return profile.mustChange || dataReady ? pub(profile) : null;
  }
  function settled() { return !!profile && (dataReady || profile.mustChange); }
  function whenSignedIn(ms = 20000) {
    if (settled()) return Promise.resolve(currentPub());
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      waiters.push(w);
      setTimeout(() => { if (waiters.includes(w)) { waiters = waiters.filter((x) => x !== w); resolve(currentPub()); } }, ms);
    });
  }
  function resolveWaiters() { const w = waiters; waiters = []; w.forEach((x) => x.resolve(currentPub())); }
  function rejectWaiters(msg) { const w = waiters; waiters = []; w.forEach((x) => x.reject(new Error(msg))); }

  /* ---------- start-up ---------- */
  async function start() {
    try {
      [fa, au, fs] = await withTimeout(Promise.all(['app', 'auth', 'firestore'].map((m) => import(`${SDK}firebase-${m}.js`))), 30000);
    } catch (e) {
      console.error('Firebase SDK not loaded', e);
      setError(navigator.onLine
        ? 'The Firebase library could not be loaded. Check the internet connection, then try again.'
        : 'You are offline. Connect to the internet once so the portal can load — after that it also opens offline.');
      return;
    }
    try {
      const app = fa.initializeApp(config);
      auth = au.initializeAuth(app, { persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence] });
      db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
        ignoreUndefinedProperties: true,
      });
      if (EMU) {
        au.connectAuthEmulator(auth, EMU_AUTH, { disableWarnings: true });
        fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      }
    } catch (e) {
      console.error(e);
      setError('Firebase could not start (' + (e.message || e) + '). Check the values in js/firebase-config.js.');
      return;
    }
    readSetup();
    au.onAuthStateChanged(auth, onUser);
  }

  async function readSetup() {
    try {
      const snap = await withTimeout(fs.getDoc(fs.doc(db, 'system', 'setup')), 10000);
      setupDone = snap.exists();
    } catch (e) {
      setupDone = null;   // offline: assume it is set up and show the sign-in form
    }
    if (!fbUser && phase === 'signedOut') refresh();
  }

  let giveUp = 0, dataUnsubs = [], dataRetried = false, dataGen = 0;
  const unsubscribe = (list) => list.forEach((u) => { try { u(); } catch (e) { /* already stopped */ } });
  function stopAll() {
    clearTimeout(giveUp);
    clearTimeout(rebuildTimer); rebuildTimer = 0;
    unsubscribe(unsubs); unsubs = [];
    unsubscribe(dataUnsubs); dataUnsubs = [];
    dataRetried = false;
    dataGen++;
  }

  /* ---------- signed in / out ---------- */
  function onUser(u) {
    stopAll();
    fbUser = u; profile = null; dataReady = false; base = null; users.clear();
    if (!u) {
      if (phase !== 'error') setPhase('signedOut');
      return;
    }
    let markLogin = false;
    if (freshSignIn) {
      freshSignIn = false; markLogin = true;
      const now = Date.now();
      writeSession({ userId: u.uid, issued: now, last: now });
    } else if (!sessionValid(u.uid)) {
      logout(readSession() ? 'You were signed out after 30 minutes without activity.' : '');
      return;
    }
    setPhase('profile');
    unsubs.push(fs.onSnapshot(fs.doc(db, 'users', u.uid), { includeMetadataChanges: true }, (snap) => {
      if (!snap.exists()) {
        if (settingUp || snap.metadata.fromCache) return;   // being created by first-time setup / not checked online yet
        logout('This email has no access to the portal. Ask the Super Admin to create a login for you.');
        return;
      }
      // Just written by first-time setup: the server rules can't see it until it is saved there
      if (!profile && snap.metadata.hasPendingWrites) return;
      const p = { id: u.uid, email: u.email || '', ...snap.data() };
      if (p.removed || p.active === false || !App.ROLES[p.role]) { logout('This login has been disabled. Contact the Super Admin.'); return; }
      const first = !profile;
      if (!first && stable(p) === stable(profile)) return;   // only the sync state changed
      profile = p;
      if (first) {
        startData();
        if (markLogin) fs.updateDoc(fs.doc(db, 'users', u.uid), { lastLogin: Date.now() }).catch(() => {});
        if (p.mustChange) resolveWaiters();
      }
      refresh();
    }, (e) => setError('Your officer profile could not be loaded: ' + errText(e) + '.')));
  }

  function startUsers(gen) {
    dataUnsubs.push(fs.onSnapshot(fs.collection(db, 'users'), (snap) => {
      if (gen !== dataGen) return;
      users.clear();
      snap.forEach((d) => users.set(d.id, { id: d.id, ...d.data() }));
      if (dataReady && /^#\/users/.test(location.hash)) refresh();
    }, (e) => console.warn('Officer list not loaded', e)));
  }

  /* ---------- live data ---------- */
  function startData() {
    unsubscribe(dataUnsubs); dataUnsubs = [];
    clearTimeout(giveUp);
    const gen = ++dataGen;   // callbacks from listeners that were replaced are ignored
    startUsers(gen);
    COLLS.forEach((c) => docs[c].clear());
    const waiting = new Set(COLLS);
    giveUp = setTimeout(() => { waiting.clear(); markReady(); }, 12000);   // slow connection: show what the device has
    COLLS.forEach((c) => {
      dataUnsubs.push(fs.onSnapshot(fs.collection(db, c), { includeMetadataChanges: true }, (snap) => {
        if (gen !== dataGen) return;
        const m = docs[c];
        let changed = false;
        snap.docChanges().forEach((ch) => {
          const id = ch.doc.id;
          if (ch.type === 'removed') { if (m.delete(id)) changed = true; return; }
          const data = ch.doc.data();
          if (!m.has(id) || stable(m.get(id)) !== stable(data)) { m.set(id, data); changed = true; }
        });
        // Wait for the server's answer, unless the device copy already has data or we are offline
        if (waiting.has(c) && (!snap.metadata.fromCache || snap.size > 0 || !navigator.onLine)) {
          waiting.delete(c);
          if (!waiting.size) { clearTimeout(giveUp); markReady(); return; }
        }
        if (changed && dataReady) scheduleRebuild();
      }, (e) => {
        if (gen !== dataGen) return;
        console.error('Firestore listener (' + c + ')', e);
        if (!dataReady && !dataRetried && profile) {
          // A profile saved moments ago may not have reached the server's rules yet: try once more
          dataRetried = true;
          unsubscribe(dataUnsubs); dataUnsubs = [];
          clearTimeout(giveUp);
          setTimeout(() => { if (profile && !dataReady) startData(); }, 2000);
          return;
        }
        if (!dataReady) setError('Firebase refused to send the data (' + errText(e) + '). Check that the rules from firestore.rules are published in Firestore Database → Rules.');
        else App.ui.toast('Live updates stopped: ' + errText(e), 'error');
      }));
    });
  }

  function markReady() {
    if (dataReady || !profile) return;
    dataReady = true;
    rebuild(true);
    setPhase('ready');
    resolveWaiters();
    setTimeout(offerUpload, 700);
  }

  /** Someone is typing in a form on the page or in a dialog (not a search box): wait, so a re-render doesn't interrupt it. */
  function editingPage() {
    const a = document.activeElement;
    return !!(a && !a.id && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('form') && (a.closest('#app') || a.closest('.overlay')));
  }
  let rebuildTimer = 0;
  function scheduleRebuild(delay = 40) {
    if (rebuildTimer) return;
    rebuildTimer = setTimeout(() => {
      rebuildTimer = 0;
      if (editingPage()) { scheduleRebuild(1500); return; }
      rebuild(false);
    }, delay);
  }

  /** Turn Firestore's documents back into the portal's state and re-render if anything changed. */
  function rebuild(force) {
    if (!dataReady) return;
    const cur = App.state;
    const s = App.defaultState();
    const item = (id, d) => ({ ...clone(d), id: (d && d.id) || id });
    ARRAYS.forEach((c) => {
      const m = docs[c], seen = new Set(), out = [];
      (cur[c] || []).forEach((x) => { if (x && m.has(x.id) && !seen.has(x.id)) { seen.add(x.id); out.push(item(x.id, m.get(x.id))); } });
      const fresh = [...m.entries()].filter(([id]) => !seen.has(id)).map(([id, d]) => item(id, d));
      fresh.sort((a, b) => (a.createdAt || a.issuedAt || 0) - (b.createdAt || b.issuedAt || 0) || (a.seq || 0) - (b.seq || 0));
      s[c] = out.concat(fresh);
    });
    docs.reports.forEach((d, id) => { s.reports[id] = clone(d); });
    s.settings = { ...s.settings, ...clone(docs.meta.get('settings') || {}) };
    s.exemptions = clone(docs.meta.get('exemptions') || {});
    s.receiptSeq = clone(docs.meta.get('receiptSeq') || {});
    if (force || stable(App.migrate(s)) !== stable(cur)) App.replaceState(s, { save: false });
    base = docsOf(App.state);
  }

  /** The state as Firestore documents: collection → Map(id → { data, fields: Map(field → stable JSON) }). */
  function docsOf(s) {
    const out = {};
    const add = (c, id, data) => {
      if (!validId(String(id))) { console.warn('Skipped a record with an unusable id', c, id); return; }
      const d = clone(data) || {};
      out[c].set(String(id), { data: d, fields: new Map(Object.keys(d).map((k) => [k, stable(d[k])])) });
    };
    ARRAYS.forEach((c) => { out[c] = new Map(); (s[c] || []).forEach((x) => { if (x && x.id) add(c, x.id, x); }); });
    out.reports = new Map();
    Object.entries(s.reports || {}).forEach(([id, m]) => { if (m && typeof m === 'object') add('reports', id, m); });
    out.meta = new Map();
    add('meta', 'settings', s.settings || {});
    add('meta', 'exemptions', s.exemptions || {});
    return out;
  }

  /** Called by App.commit / replaceState: send only what changed since the last load or save. */
  function push(s) {
    if (!dataReady || !profile || !base) return false;
    const next = docsOf(s);
    const ops = [];
    Object.keys(next).forEach((c) => {
      const was = base[c], now = next[c];
      now.forEach((d, id) => {
        const old = was.get(id);
        if (!old) { ops.push({ c, id, kind: 'set', data: d.data }); return; }
        const changed = [];
        d.fields.forEach((v, k) => { if (old.fields.get(k) !== v) changed.push(k); });
        old.fields.forEach((_, k) => { if (!d.fields.has(k)) changed.push(k); });
        if (changed.length) ops.push({ c, id, kind: 'merge', fields: changed, data: Object.fromEntries(changed.map((k) => [k, k in d.data ? d.data[k] : fs.deleteField()])) });
      });
      if (c !== 'meta') was.forEach((_, id) => { if (!now.has(id)) ops.push({ c, id, kind: 'delete' }); });
    });
    base = next;
    // Our copy of the server data includes these changes straight away (Firestore does the same locally)
    ops.forEach((o) => { if (o.kind === 'delete') docs[o.c].delete(o.id); else docs[o.c].set(o.id, clone(next[o.c].get(o.id).data)); });
    if (ops.length) write(ops);
    bumpReceiptSeq(s.receiptSeq);
    return true;
  }

  function write(ops) {
    const batches = [];
    for (let i = 0; i < ops.length; i += 400) {
      const b = fs.writeBatch(db);
      ops.slice(i, i + 400).forEach((o) => {
        const ref = fs.doc(db, o.c, o.id);
        if (o.kind === 'delete') b.delete(ref);
        else if (o.kind === 'set') b.set(ref, o.data);
        else b.set(ref, o.data, { mergeFields: o.fields.map((k) => new fs.FieldPath(k)) });   // replace just these fields
      });
      batches.push(b);
    }
    saving += batches.length;
    paint();
    // All batches are queued at once: offline, Firestore keeps them on the device and sends them later
    batches.forEach((b) => b.commit().then(() => { lastError = ''; }, (e) => {
      lastError = errText(e);
      console.error('Firestore write failed', e);
      App.ui.toast('Not saved online — ' + lastError + '. The change was undone.', 'error');
    }).finally(() => { saving = Math.max(0, saving - 1); paint(); }));
  }

  /* ---------- receipt numbers ---------- */
  /** Reserve `count` receipt numbers for a Leo year on the server. Returns the first one, or false when offline. */
  async function reserveReceipts(year, count, localMax) {
    if (!dataReady || !navigator.onLine) return false;
    const ref = fs.doc(db, 'meta', 'receiptSeq');
    const key = String(year);
    try {
      const first = await withTimeout(fs.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const cur = Number((snap.exists() && snap.data()[key]) || 0);
        const start = Math.max(cur, Number(localMax) || 0) + 1;
        tx.set(ref, { [key]: start + count - 1 }, { merge: true });
        return start;
      }), 15000);
      const rs = { ...(docs.meta.get('receiptSeq') || {}) };
      rs[key] = Math.max(Number(rs[key]) || 0, first + count - 1);
      docs.meta.set('receiptSeq', rs);
      scheduleRebuild();
      return first;
    } catch (e) {
      console.warn('Receipt numbers not reserved', e);
      return false;
    }
  }

  /** Raise the server's receipt counters to at least the numbers used here (settings, restore, sample data). */
  function bumpReceiptSeq(local) {
    const server = docs.meta.get('receiptSeq') || {};
    const up = Object.entries(local || {}).filter(([y, n]) => Number(n) > (Number(server[y]) || 0));
    if (!up.length) return Promise.resolve(true);
    docs.meta.set('receiptSeq', { ...server, ...Object.fromEntries(up.map(([y, n]) => [y, Number(n)])) });
    scheduleRebuild();
    const ref = fs.doc(db, 'meta', 'receiptSeq');
    return fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists() ? snap.data() : {};
      const upd = {};
      up.forEach(([y, n]) => { if (Number(n) > (Number(cur[y]) || 0)) upd[y] = Number(n); });
      if (Object.keys(upd).length) tx.set(ref, upd, { merge: true });
    }).then(() => true, (e) => {
      console.error('Receipt counter not updated', e);
      App.ui.toast('Receipt numbering was not updated online (' + errText(e) + '). Save the receipt settings again when online.', 'error');
      return false;
    });
  }

  /* ---------- officer accounts ---------- */
  function pub(p) {
    return p ? {
      id: p.id, username: p.email || '', email: p.email || '', name: p.name || p.email || 'Officer', role: p.role,
      active: p.active !== false, mustChange: !!p.mustChange, lastLogin: p.lastLogin || null, createdAt: p.createdAt || null,
    } : null;
  }
  function can(perm) { const u = currentPub(); return !!u && (App.PERMS[u.role] || []).includes(perm); }
  const activeUsers = () => [...users.values()].filter((u) => !u.removed && App.ROLES[u.role]);
  function requireAdmin() { if (!can('users')) throw new Error('Only the Super Admin can manage logins.'); }
  function ready() {
    if (phase === 'loading') throw new Error('Still connecting to Firebase — try again in a moment.');
    if (phase === 'error') throw new Error(errorMsg);
  }

  async function login(email, password) {
    ready();
    email = normEmail(email);
    if (!validEmail(email)) throw new Error('Sign in with the email address of your login.');
    freshSignIn = true;
    try { await au.signInWithEmailAndPassword(auth, email, password); }
    catch (e) { freshSignIn = false; throw new Error(authMessage(e)); }
    const u = await whenSignedIn();
    return u || pub(profile);
  }

  function logout(message) {
    writeSession(null);
    rejectWaiters(message || 'Signed out.');
    stopAll();
    profile = null; dataReady = false; base = null; users.clear();
    COLLS.forEach((c) => docs[c].clear());
    phase = 'signedOut';
    paint();
    App.replaceState(App.defaultState(), { save: false });
    if (auth && auth.currentUser) au.signOut(auth).catch(() => {});
    App.emit('auth', { type: 'logout', message });
  }

  async function setupSuperAdmin({ name, email, password }) {
    ready();
    email = normEmail(email);
    if (!validEmail(email)) throw new Error('Enter a valid email address.');
    const problem = App.auth.passwordProblem(password);
    if (problem) throw new Error(problem);
    settingUp = true; freshSignIn = true;
    try {
      let cred;
      try { cred = await au.createUserWithEmailAndPassword(auth, email, password); }
      catch (e) {
        if (e.code !== 'auth/email-already-in-use') throw new Error(authMessage(e));
        try { cred = await au.signInWithEmailAndPassword(auth, email, password); }
        catch (e2) { throw new Error('This email already has a Firebase login with a different password. Use that password, or another email.'); }
      }
      const uid = cred.user.uid, now = Date.now();
      const b = fs.writeBatch(db);
      b.set(fs.doc(db, 'users', uid), { email, name: name || 'Super Admin', role: 'superadmin', active: true, mustChange: false, createdAt: now, lastLogin: now });
      b.set(fs.doc(db, 'system', 'setup'), { superadmin: uid, at: now });
      try { await withTimeout(b.commit(), 20000); }
      catch (e) {
        await au.signOut(auth).catch(() => {});
        if (String(e.code).includes('permission-denied')) {
          await readSetup();
          throw new Error(setupDone ? 'First-time setup was already done. Sign in instead.'
            : 'Firebase refused the setup. Publish the rules from firestore.rules (Firestore Database → Rules), then try again.');
        }
        throw new Error('Setup was not saved: ' + errText(e) + '.');
      }
      setupDone = true;
    } catch (e) {
      freshSignIn = false;
      throw e;
    } finally {
      settingUp = false;
    }
    return { user: await whenSignedIn(), recoveryKey: null };
  }

  async function createUser({ name, email, role, password }) {
    requireAdmin();
    const R = App.ROLES[role];
    if (!R || role === 'superadmin') throw new Error('Choose a role.');
    if (activeUsers().filter((u) => u.role === role).length >= R.max) throw new Error(`${R.label}: all ${R.max} login${R.max > 1 ? 's are' : ' is'} already created.`);
    email = normEmail(email);
    if (!validEmail(email)) throw new Error('Enter the officer’s email address.');
    if (activeUsers().some((u) => normEmail(u.email) === email)) throw new Error('That email already has a login.');
    const problem = App.auth.passwordProblem(password);
    if (problem) throw new Error(problem);
    name = name || R.label;

    // A second Firebase app creates the account, so the Super Admin stays signed in
    const app2 = fa.initializeApp(config, 'officer-' + Date.now());
    let uid = null, exists = false;
    try {
      const a2 = au.initializeAuth(app2, { persistence: au.inMemoryPersistence });
      if (EMU) au.connectAuthEmulator(a2, EMU_AUTH, { disableWarnings: true });
      const cred = await au.createUserWithEmailAndPassword(a2, email, password);
      uid = cred.user.uid;
      await au.signOut(a2).catch(() => {});
    } catch (e) {
      if (e.code !== 'auth/email-already-in-use') throw new Error(authMessage(e));
      exists = true;
    } finally {
      fa.deleteApp(app2).catch(() => {});
    }
    if (exists) {
      // A login that was deleted earlier: bring it back with the new role; the officer sets a password by email
      const old = [...users.values()].find((u) => u.removed && normEmail(u.email) === email);
      if (!old) throw new Error('This email already has a Firebase login. Use another email, or delete that login in the Firebase console (Authentication → Users) and try again.');
      await withTimeout(fs.updateDoc(fs.doc(db, 'users', old.id), { name, role, active: true, removed: false, mustChange: false }), 20000);
      await sendReset(email).catch(() => {});
      return { ...pub({ ...old, name, role, active: true, mustChange: false }), restored: true };
    }
    const data = { email, name, role, active: true, mustChange: true, createdAt: Date.now(), createdBy: profile.id, lastLogin: null };
    await withTimeout(fs.setDoc(fs.doc(db, 'users', uid), data), 20000);
    users.set(uid, { id: uid, ...data });
    return pub({ id: uid, ...data });
  }

  async function updateUser(id, { name }) {
    requireAdmin();
    if (!users.has(id)) throw new Error('Login not found.');
    if (!name) throw new Error('Enter a name.');
    await withTimeout(fs.updateDoc(fs.doc(db, 'users', id), { name }), 20000);
  }

  /** Firebase can't set another person's password from the browser: send them a reset email instead. */
  async function resetPassword(id) {
    requireAdmin();
    const u = users.get(id);
    if (!u) throw new Error('Login not found.');
    await sendReset(u.email);
    return u.email;
  }

  async function sendReset(email) {
    ready();
    email = normEmail(email);
    if (!validEmail(email)) throw new Error('Enter the email address of your login.');
    const url = location.href.split('#')[0];
    try { await au.sendPasswordResetEmail(auth, email, { url }); }
    catch (e) {
      const code = String(e.code || '');
      if (/continue-uri|unauthorized-domain/.test(code)) { await au.sendPasswordResetEmail(auth, email).catch((e2) => { throw new Error(authMessage(e2)); }); return; }
      if (code === 'auth/user-not-found') return;   // never reveal which emails have logins
      throw new Error(authMessage(e));
    }
  }

  async function setActive(id, active) {
    requireAdmin();
    if (id === profile.id) throw new Error("You can't disable your own account.");
    await withTimeout(fs.updateDoc(fs.doc(db, 'users', id), { active: !!active }), 20000);
  }

  /** The Firebase account stays (only the console can delete it); the portal access is removed. */
  async function deleteUser(id) {
    requireAdmin();
    if (id === profile.id) throw new Error("You can't delete your own account.");
    await withTimeout(fs.updateDoc(fs.doc(db, 'users', id), { active: false, removed: true }), 20000);
  }

  async function changeOwnPassword(oldPw, newPw) {
    const user = auth && auth.currentUser;
    if (!user || !profile) throw new Error('Not signed in.');
    const problem = App.auth.passwordProblem(newPw);
    if (problem) throw new Error(problem);
    if (oldPw === newPw) throw new Error('Choose a password different from the current one.');
    try { await au.reauthenticateWithCredential(user, au.EmailAuthProvider.credential(user.email, oldPw)); }
    catch (e) { throw new Error(/invalid-credential|wrong-password|invalid-login/.test(e.code || '') ? 'Your current password is not correct.' : authMessage(e)); }
    try { await au.updatePassword(user, newPw); }
    catch (e) { throw new Error(authMessage(e)); }
    if (profile.mustChange) {
      profile = { ...profile, mustChange: false };
      fs.updateDoc(fs.doc(db, 'users', user.uid), { mustChange: false, lastLogin: Date.now() }).catch((e) => console.error(e));
      writeSession({ userId: user.uid, issued: Date.now(), last: Date.now() });
      await whenSignedIn();
    }
  }

  /* ---------- moving this browser's earlier data into the shared database ---------- */
  function localHasData(local) { return !!local && (local.clubs.length > 0 || local.payments.length > 0 || local.paymentHeads.length > 0); }

  function offerUpload() {
    if (!can('restore') || localStorage.getItem(UPLOAD_ASKED)) return;
    const local = App.savedOnDevice();
    const s = App.state;
    if (!localHasData(local) || s.clubs.length || s.payments.length || s.paymentHeads.length) return;
    uploadDialog();
  }

  function uploadDialog() {
    const local = App.savedOnDevice();
    if (!localHasData(local)) { App.ui.toast('This browser has no saved data to upload.', 'error'); return; }
    const n = (k) => (local[k] || []).length;
    const sharedHasData = App.state.clubs.length || App.state.payments.length || App.state.paymentHeads.length;
    const ctrl = App.ui.open({
      title: 'Upload this browser’s data?', size: 'sm',
      render: () => `<p style="margin-top:0">This browser still has the data saved before the portal was connected to Firebase:</p>
        <dl class="kv"><dt>Clubs</dt><dd>${n('clubs')}</dd><dt>Payment types</dt><dd>${n('paymentHeads')}</dd>
          <dt>Payments</dt><dd>${n('payments')}</dd><dt>E-receipts</dt><dd>${n('receipts')}</dd><dt>Notes &amp; notices</dt><dd>${n('notes') + n('notices')}</dd></dl>
        <p>${sharedHasData ? '<b>Uploading replaces everything now in the shared database</b>, for every officer.' : 'The shared database is still empty.'}
          Upload it so every officer sees it?</p>
        <p class="hint" style="margin-bottom:0">Officer logins are not uploaded: create them again under Users &amp; Access with each officer’s email.</p>`,
      footer: () => `<button class="btn" id="upLater">Not now</button><button class="btn btn-primary" id="upGo">Upload to Firebase</button>`,
      onMount: (el) => {
        el.querySelector('#upLater').addEventListener('click', () => { localStorage.setItem(UPLOAD_ASKED, '1'); ctrl.close(); App.ui.toast('You can upload it later from Settings & Backup'); });
        el.querySelector('#upGo').addEventListener('click', () => {
          localStorage.setItem(UPLOAD_ASKED, '1');
          ctrl.close();
          App.replaceState(local);
          App.ui.toast(`Uploading ${n('clubs')} clubs and ${n('payments')} payments to the shared database…`);
        });
      },
    });
  }

  /* ---------- plug into the portal ---------- */
  App.can = can;
  Object.assign(App.auth, {
    cryptoOK: () => true,
    hasUsers: () => setupDone !== false,
    hasRecovery: () => false,
    users: () => activeUsers().map(pub).sort((a, b) => App.ROLES[a.role].order - App.ROLES[b.role].order || a.name.localeCompare(b.name)),
    current: currentPub,
    login, logout, setupSuperAdmin, createUser, updateUser, resetPassword, setActive, deleteUser, changeOwnPassword, sendReset,
    recoverSuperAdmin: async () => { throw new Error('Use “Forgot your password?” to get a reset email.'); },
    regenerateRecoveryKey: async () => { throw new Error('Not used with the shared database.'); },
    exportForBackup: () => null,
    mergeFromBackup: () => 0,
    canEditNote: (n) => { const u = currentPub(); return !!u && (can('clubs') || (!!n.byId && n.byId === u.id)); },
    stamp: () => { const u = currentPub(); return u ? { byId: u.id, byName: u.name } : {}; },
    lockedFor: () => 0,
  });

  App.cloud = {
    enabled: true,
    projectId: config.projectId,
    emulator: EMU,
    phase: () => phase,
    error: () => errorMsg,
    setupDone: () => setupDone,
    active: () => dataReady && !!profile,
    email: () => (profile ? profile.email : ''),
    status, paint, push, reserveReceipts, bumpReceiptSeq,
    localHasData: () => localHasData(App.savedOnDevice()),
    uploadDialog,
    retry: () => location.reload(),
  };
  App.actions = App.actions || {};
  App.actions['cloud-upload'] = () => uploadDialog();
  App.actions['cloud-retry'] = () => location.reload();

  start();
})();
