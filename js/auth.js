/* =========================================================
   auth.js — officer accounts, roles, permissions and sessions
   ---------------------------------------------------------
   Accounts are kept in this browser (separate from treasury data),
   passwords are stored only as PBKDF2-SHA256 hashes.
   NOTE: this protects the portal on the device where the data lives.
   It is not server-side security — see README "Logins & roles".
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;

  const AUTH_KEY = 'leo306d1.auth.v1';
  const SESSION_KEY = 'leo306d1.session.v1';
  const FAIL_KEY = 'leo306d1.loginfail.v1';
  const ITERATIONS = 150000;
  const IDLE_MS = 30 * 60 * 1000;        // sign out after 30 min without activity
  const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

  /* ---------- roles & permissions ---------- */
  const ROLES = {
    superadmin:     { label: 'Super Admin', short: 'Super Admin', max: 1, order: 0 },
    president:      { label: 'District President', short: 'President', max: 1, order: 1 },
    vicepresident:  { label: 'District Vice President', short: 'Vice President', max: 1, order: 2 },
    treasurer:      { label: 'District Treasurer', short: 'Treasurer', max: 1, order: 3 },
    asst_treasurer: { label: 'Assistant District Treasurer', short: 'Asst. Treasurer', max: 2, order: 4 },
  };

  const PERM_INFO = {
    notes:    'Add notes to clubs',
    reports:  'Mark treasurer reports',
    payments: 'Record, edit & delete payments',
    clubs:    'Add, edit & delete clubs',
    heads:    'Manage payment types',
    settings: 'Change district settings',
    export:   'Export CSV / Excel files',
    restore:  'Download & restore full backups',
    danger:   'Load sample data / clear all data',
    users:    'Manage officer logins',
  };

  const PERMS = {
    superadmin:     ['notes', 'reports', 'payments', 'clubs', 'heads', 'settings', 'export', 'restore', 'danger', 'users'],
    treasurer:      ['notes', 'reports', 'payments', 'clubs', 'heads', 'settings', 'export', 'restore', 'danger'],
    asst_treasurer: ['notes', 'reports', 'payments', 'export'],
    president:      ['notes', 'export'],
    vicepresident:  ['notes', 'export'],
  };

  /* ---------- storage ---------- */
  function loadAuth() {
    try {
      const a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (a && Array.isArray(a.users)) return { version: 1, recovery: null, ...a };
    } catch (e) { console.error(e); }
    return { version: 1, users: [], recovery: null };
  }
  let auth = loadAuth();
  const saveAuth = () => localStorage.setItem(AUTH_KEY, JSON.stringify(auth));

  /* ---------- crypto helpers ---------- */
  const cryptoOK = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const randomB64 = (n = 16) => b64(crypto.getRandomValues(new Uint8Array(n)));

  async function pbkdf2(secret, saltB64, iterations = ITERATIONS) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations }, key, 256);
    return b64(new Uint8Array(bits));
  }
  async function makeSecret(secret) {
    const salt = randomB64();
    return { salt, iterations: ITERATIONS, hash: await pbkdf2(secret, salt) };
  }
  async function checkSecret(secret, rec) {
    if (!rec || !rec.salt) return false;
    const h = await pbkdf2(secret, rec.salt, rec.iterations || ITERATIONS);
    // constant-time-ish compare
    let diff = h.length ^ rec.hash.length;
    for (let i = 0; i < Math.min(h.length, rec.hash.length); i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
    return diff === 0;
  }
  function newRecoveryKey() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    return chars.match(/.{4}/g).join('-');
  }
  const normRecovery = (k) => (k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') || '';

  /* ---------- validation ---------- */
  const normUser = (u) => (u || '').trim().toLowerCase();
  function validUsername(u) { return /^[a-z0-9._-]{3,32}$/.test(u); }
  function passwordProblem(pw) {
    if (!pw || pw.length < 8) return 'Use at least 8 characters.';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use both letters and numbers.';
    return '';
  }

  /* ---------- session ---------- */
  let current = null;
  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeSession(s) { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
  function resumeSession() {
    const s = readSession();
    if (!s) return null;
    const now = Date.now();
    const u = auth.users.find((x) => x.id === s.userId);
    if (!u || !u.active || now - s.last > IDLE_MS || now - s.issued > MAX_SESSION_MS) { writeSession(null); return null; }
    s.last = now; writeSession(s);
    return u;
  }
  // With the shared database (cloud.js) Firebase owns the sign-in and the session record
  current = App.CLOUD ? null : resumeSession();

  let lastTouch = 0;
  function touch() {
    if (!current) return;
    const now = Date.now();
    if (now - lastTouch < 15000) return;
    lastTouch = now;
    const s = readSession();
    if (s && s.userId === current.id) { s.last = now; writeSession(s); }
  }
  ['click', 'keydown', 'pointerdown', 'scroll'].forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
  setInterval(() => {
    if (!current) return;
    const s = readSession();
    const now = Date.now();
    if (!s || s.userId !== current.id || now - s.last > IDLE_MS || now - s.issued > MAX_SESSION_MS) {
      logout('You were signed out after 30 minutes without activity.');
    }
  }, 20000);

  /* ---------- login throttling ---------- */
  function failState() { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{"count":0,"until":0}'); } catch (e) { return { count: 0, until: 0 }; } }
  function lockedFor() { return Math.max(0, failState().until - Date.now()); }
  function noteFail() {
    const f = failState();
    f.count += 1;
    if (f.count >= 5) { f.until = Date.now() + Math.min(5 * 60000, 30000 * Math.pow(2, f.count - 5)); }
    localStorage.setItem(FAIL_KEY, JSON.stringify(f));
  }
  const clearFails = () => localStorage.removeItem(FAIL_KEY);

  /* ---------- public API ---------- */
  function publicUser(u) { return u ? { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, mustChange: !!u.mustChange, lastLogin: u.lastLogin, createdAt: u.createdAt } : null; }

  async function login(username, password) {
    const wait = lockedFor();
    if (wait) throw new Error(`Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    const u = auth.users.find((x) => x.username === normUser(username));
    const ok = u ? await checkSecret(password, u.secret) : await checkSecret(password, { salt: randomB64(), hash: 'x' }).then(() => false);
    if (!u || !ok) { noteFail(); throw new Error('Incorrect username or password.'); }
    if (!u.active) throw new Error('This account is disabled. Contact the Super Admin.');
    clearFails();
    u.lastLogin = Date.now();
    saveAuth();
    const now = Date.now();
    writeSession({ userId: u.id, issued: now, last: now });
    current = u;
    return publicUser(u);
  }

  function logout(message) {
    current = null;
    writeSession(null);
    App.emit('auth', { type: 'logout', message });
  }

  async function setupSuperAdmin({ name, username, password }) {
    if (auth.users.length) throw new Error('Setup has already been completed.');
    const un = normUser(username);
    if (!validUsername(un)) throw new Error('Username: 3–32 letters, numbers, dot, dash or underscore.');
    const p = passwordProblem(password); if (p) throw new Error(p);
    const recoveryKey = newRecoveryKey();
    const user = { id: App.uid('user'), username: un, name: name || 'Super Admin', role: 'superadmin', active: true, mustChange: false, createdAt: Date.now(), lastLogin: Date.now(), secret: await makeSecret(password) };
    auth.users.push(user);
    auth.recovery = await makeSecret(normRecovery(recoveryKey));
    saveAuth();
    const now = Date.now();
    writeSession({ userId: user.id, issued: now, last: now });
    current = user;
    return { user: publicUser(user), recoveryKey };
  }

  function requireUsers() { if (!can('users')) throw new Error('Only the Super Admin can manage logins.'); }
  function roleCount(role, exceptId) { return auth.users.filter((u) => u.role === role && u.id !== exceptId).length; }

  async function createUser({ name, username, role, password }) {
    requireUsers();
    if (!ROLES[role]) throw new Error('Choose a role.');
    if (roleCount(role) >= ROLES[role].max) throw new Error(`${ROLES[role].label}: all ${ROLES[role].max} login${ROLES[role].max > 1 ? 's are' : ' is'} already created.`);
    const un = normUser(username);
    if (!validUsername(un)) throw new Error('Username: 3–32 letters, numbers, dot, dash or underscore.');
    if (auth.users.some((u) => u.username === un)) throw new Error('That username is already taken.');
    const p = passwordProblem(password); if (p) throw new Error(p);
    const user = { id: App.uid('user'), username: un, name: name || ROLES[role].label, role, active: true, mustChange: true, createdAt: Date.now(), lastLogin: null, secret: await makeSecret(password) };
    auth.users.push(user);
    saveAuth();
    return publicUser(user);
  }

  function updateUser(id, { name, username }) {
    requireUsers();
    const u = auth.users.find((x) => x.id === id);
    if (!u) throw new Error('Account not found.');
    const un = normUser(username);
    if (!validUsername(un)) throw new Error('Username: 3–32 letters, numbers, dot, dash or underscore.');
    if (auth.users.some((x) => x.username === un && x.id !== id)) throw new Error('That username is already taken.');
    u.name = name || u.name;
    u.username = un;
    saveAuth();
  }

  async function resetPassword(id, password) {
    requireUsers();
    const u = auth.users.find((x) => x.id === id);
    if (!u) throw new Error('Account not found.');
    const p = passwordProblem(password); if (p) throw new Error(p);
    u.secret = await makeSecret(password);
    u.mustChange = u.id !== current.id;
    saveAuth();
  }

  function setActive(id, active) {
    requireUsers();
    const u = auth.users.find((x) => x.id === id);
    if (!u) return;
    if (u.id === current.id) throw new Error("You can't disable your own account.");
    u.active = !!active;
    saveAuth();
  }

  function deleteUser(id) {
    requireUsers();
    if (id === current.id) throw new Error("You can't delete your own account.");
    auth.users = auth.users.filter((u) => u.id !== id);
    saveAuth();
  }

  async function changeOwnPassword(oldPw, newPw) {
    if (!current) throw new Error('Not signed in.');
    const u = auth.users.find((x) => x.id === current.id);
    if (!(await checkSecret(oldPw, u.secret))) throw new Error('Your current password is not correct.');
    const p = passwordProblem(newPw); if (p) throw new Error(p);
    if (oldPw === newPw) throw new Error('Choose a password different from the current one.');
    u.secret = await makeSecret(newPw);
    u.mustChange = false;
    saveAuth();
    current = u;
  }

  async function recoverSuperAdmin(key, newPw) {
    const wait = lockedFor();
    if (wait) throw new Error(`Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    if (!auth.recovery || !(await checkSecret(normRecovery(key), auth.recovery))) { noteFail(); throw new Error('That recovery key is not correct.'); }
    const p = passwordProblem(newPw); if (p) throw new Error(p);
    const admin = auth.users.find((u) => u.role === 'superadmin');
    if (!admin) throw new Error('No Super Admin account found.');
    admin.secret = await makeSecret(newPw);
    admin.active = true;
    admin.mustChange = false;
    clearFails();
    saveAuth();
    return admin.username;
  }

  async function regenerateRecoveryKey() {
    requireUsers();
    const key = newRecoveryKey();
    auth.recovery = await makeSecret(normRecovery(key));
    saveAuth();
    return key;
  }

  /** Accounts carried inside a full backup (password hashes only). */
  function exportForBackup() { return { users: auth.users, recovery: auth.recovery }; }
  /** Restore: add accounts from a backup whose usernames don't exist here yet. Returns number added. */
  function mergeFromBackup(a) {
    if (!a || !Array.isArray(a.users)) return 0;
    let added = 0;
    a.users.forEach((u) => {
      if (!u || !u.username || !u.secret || !ROLES[u.role]) return;
      if (auth.users.some((x) => x.username === u.username || x.id === u.id)) return;
      if (roleCount(u.role) >= ROLES[u.role].max) return;
      auth.users.push({ ...u });
      added++;
    });
    if (!auth.recovery && a.recovery) auth.recovery = a.recovery;
    if (added) saveAuth();
    return added;
  }

  function can(perm) { return !!current && (PERMS[current.role] || []).includes(perm); }
  function canEditNote(n) { return !!current && (can('clubs') || (n.byId && n.byId === current.id)); }
  function stamp() { return current ? { byId: current.id, byName: current.name } : {}; }

  // Accounts changed in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === AUTH_KEY) {
      auth = loadAuth();
      if (current) {
        const u = auth.users.find((x) => x.id === current.id);
        if (!u || !u.active) logout('Your account was changed by the Super Admin. Please sign in again.');
        else { current = u; App.refresh && App.refresh(); }
      }
    }
    if (e.key === SESSION_KEY && current && !readSession()) logout('You signed out in another tab.');
  });

  App.ROLES = ROLES;
  App.PERMS = PERMS;
  App.PERM_INFO = PERM_INFO;
  App.can = can;
  App.auth = {
    cryptoOK, hasUsers: () => auth.users.length > 0, hasRecovery: () => !!auth.recovery,
    users: () => auth.users.map(publicUser).sort((a, b) => ROLES[a.role].order - ROLES[b.role].order || a.name.localeCompare(b.name)),
    current: () => publicUser(current),
    roleLabel: (r) => (ROLES[r] ? ROLES[r].label : r),
    login, logout, setupSuperAdmin, createUser, updateUser, resetPassword, setActive, deleteUser,
    changeOwnPassword, recoverSuperAdmin, regenerateRecoveryKey, exportForBackup, mergeFromBackup,
    canEditNote, stamp, passwordProblem, lockedFor,
  };
})();
