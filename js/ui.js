/* =========================================================
   ui.js — escaping, modals/drawer, toasts, confirm, shared bits
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /* ---------- modal stack ---------- */
  const stack = [];
  let lastFocus = null;

  /**
   * Open a modal or drawer.
   * opts: { title, sub, size:'sm'|'lg', drawer:bool, render:()=>html, footer:()=>html, onMount(el, ctrl), onClose() }
   * `render` is re-run by ctrl.update() and after every data commit, so panels stay in sync.
   */
  function open(opts) {
    if (!stack.length) lastFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'overlay' + (opts.drawer ? ' drawer-overlay' : '');
    const box = document.createElement('div');
    box.className = opts.drawer ? 'drawer' : 'modal' + (opts.size ? ' ' + opts.size : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const ctrl = {
      el: box,
      opts,
      close,
      update() {
        const head = typeof opts.title === 'function' ? opts.title() : opts.title;
        const sub = typeof opts.sub === 'function' ? opts.sub() : opts.sub;
        const scrollEl = box.querySelector('.modal-body');
        const scroll = scrollEl ? scrollEl.scrollTop : 0;
        box.innerHTML = `
          <div class="modal-head">
            <div><h2>${head || ''}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
            <button type="button" class="modal-close" data-close aria-label="Close">×</button>
          </div>
          <div class="modal-body">${opts.render ? opts.render(ctrl) : ''}</div>
          ${opts.footer ? `<div class="modal-foot">${opts.footer(ctrl)}</div>` : ''}`;
        const nb = box.querySelector('.modal-body');
        if (nb) nb.scrollTop = scroll;
        applyPerms(box);
        opts.onMount && opts.onMount(box, ctrl);
      },
    };
    stack.push(ctrl);
    ctrl.update();

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay._downOnBackdrop = true; });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && overlay._downOnBackdrop) close();
      overlay._downOnBackdrop = false;
      if (e.target.closest('[data-close]')) close();
    });

    const focusable = box.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button:not(.modal-close)');
    setTimeout(() => (focusable || box.querySelector('.modal-close')).focus(), 30);

    function close() {
      const i = stack.indexOf(ctrl);
      if (i === -1) return;
      stack.splice(i, 1);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 180);
      opts.onClose && opts.onClose();
      if (!stack.length && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }
    return ctrl;
  }

  function refreshOpen() { stack.forEach((c) => c.opts.live && c.update()); }
  function closeAll() { stack.slice().forEach((c) => c.close()); }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) { e.preventDefault(); stack[stack.length - 1].close(); }
    if (e.key === 'Tab' && stack.length) { // keep focus inside the top dialog
      const box = stack[stack.length - 1].el;
      const f = [...box.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- confirm ---------- */
  function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      let result = false;
      const c = open({
        title: esc(title), size: 'sm',
        render: () => `<p style="margin:0">${message}</p>`,
        footer: () => `<button class="btn" data-close>Cancel</button>
          <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-ok>${esc(confirmText)}</button>`,
        onMount: (el) => {
          el.querySelector('[data-ok]').addEventListener('click', () => { result = true; c.close(); });
          setTimeout(() => el.querySelector('[data-ok]').focus(), 40);
        },
        onClose: () => resolve(result),
      });
    });
  }

  /* ---------- toasts ---------- */
  function toast(msg, type = 'ok', action) {
    const wrap = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.innerHTML = `<span class="t-ico">${type === 'error' ? '!' : '✓'}</span><span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    wrap.appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
    if (action) t.querySelector('button').addEventListener('click', () => { action.run(); kill(); });
    setTimeout(kill, action ? 6000 : 3200);
  }

  /* ---------- shared fragments ---------- */
  function typeBadge(type) {
    return type === 'alpha'
      ? '<span class="badge alpha"><span class="sym">α</span>Alpha</span>'
      : '<span class="badge omega"><span class="sym">Ω</span>Omega</span>';
  }
  function chip(code, icon, label, title) {
    return `<span class="chip ${esc(code)}"${title ? ` title="${esc(title)}"` : ''}><span class="ci" aria-hidden="true">${esc(icon)}</span>${esc(label)}</span>`;
  }
  function tagChip(tag) {
    return `<span class="chip tag-${esc(tag)}">${esc(App.NOTE_TAGS[tag] || 'General')}</span>`;
  }
  function meter(value, max, variant = '') {
    const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return `<div class="meter ${variant}" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span style="width:${p.toFixed(1)}%"></span></div>`;
  }
  function seg(name, current, options) {
    return `<div class="seg" role="group" data-seg="${esc(name)}">${options.map((o) =>
      `<button type="button" class="${o.value === current ? 'on' : ''}" data-value="${esc(o.value)}" aria-pressed="${o.value === current}">${o.label}${o.count != null ? ` <span class="count">${o.count}</span>` : ''}</button>`).join('')}</div>`;
  }
  function clubOptions(selectedId, filterFn) {
    const groups = [['omega', 'Omega clubs'], ['alpha', 'Alpha clubs']];
    return groups.map(([t, label]) => {
      const list = App.clubsSorted(t).filter((c) => !filterFn || filterFn(c));
      if (!list.length) return '';
      return `<optgroup label="${label}">${list.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`;
    }).join('');
  }
  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  }
  function emptyState({ title, text, actions = '' }) {
    return `<div class="empty"><img src="assets/logo-sm.webp" alt=""><h3>${title}</h3><p>${text}</p><div class="head-actions">${actions}</div></div>`;
  }

  /** Club logo, or a monogram in the club-type colours when there is no logo. */
  function clubLogo(c, size = 'md') {
    if (c && /^data:image\/(webp|jpeg|png);base64,/.test(c.logo || '')) return `<img class="club-logo ${size}" src="${esc(c.logo)}" alt="" loading="lazy">`;
    const words = ((c && c.name) || '?').replace(/^leo\s+club\s+of\s+/i, '').split(/\s+/).filter(Boolean);
    const mono = ((words[0] || '?')[0] + (words.length > 1 ? words[1][0] : '')).toUpperCase();
    return `<span class="club-logo mono ${size} ${c && c.type === 'alpha' ? 'alpha' : 'omega'}" aria-hidden="true">${esc(mono)}</span>`;
  }

  /** Read an image file and shrink it to a small square-ish logo (keeps browser storage small). */
  function resizeImage(file, max = 240) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose an image file (PNG, JPG or WebP).')); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let out = cv.toDataURL('image/webp', 0.86);            // keeps transparency where supported
        if (!out.startsWith('data:image/webp')) {               // older Safari: white background JPEG
          const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
          const b = bg.getContext('2d'); b.fillStyle = '#fff'; b.fillRect(0, 0, w, h); b.drawImage(cv, 0, 0);
          out = bg.toDataURL('image/jpeg', 0.85);
        }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read.')); };
      img.src = url;
    });
  }

  /** Hide anything marked data-perm="x" that the signed-in role may not use. */
  function applyPerms(scope) {
    if (!scope || !App.can) return;
    scope.querySelectorAll('[data-perm]').forEach((el) => { el.hidden = !App.can(el.dataset.perm); });
  }

  App.actions = App.actions || {}; // data-action="name" → handler(el, event); wired in main.js
  App.ui = { applyPerms, esc, open, refreshOpen, closeAll, confirm: confirmDialog, toast, typeBadge, chip, tagChip, meter, seg, clubOptions, formData, emptyState, clubLogo, resizeImage };
  App.esc = esc;
})();
