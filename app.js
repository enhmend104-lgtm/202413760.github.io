/* ============================================================
   Aurora — app.js
   Features: Clock · Pomodoro · To-Do · Quotes · Quick Links
             Theme · Ambient Canvas
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────
   UTILITY HELPERS
────────────────────────────────────────────────────────── */

/** Safe localStorage wrapper — gracefully handles disabled storage */
const Store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
  }
};

/** Show a brief toast notification */
function showToast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

/** Pad a number to two digits */
const pad = n => String(n).padStart(2, '0');

/** Generate a random integer in [0, max) */
const randInt = max => Math.floor(Math.random() * max);

/** Validate a URL string */
function isValidURL(str) {
  try { new URL(str); return true; } catch { return false; }
}

/** Attempt to get a favicon URL for a given href */
function faviconURL(href) {
  try {
    const { origin } = new URL(href);
    return `https://www.google.com/s2/favicons?domain=${origin}&sz=64`;
  } catch { return null; }
}

/* ──────────────────────────────────────────────────────────
   AMBIENT CANVAS — subtle animated gradient blobs
────────────────────────────────────────────────────────── */

(function initAmbient() {
  const canvas = document.getElementById('ambient-canvas');
  const ctx    = canvas.getContext('2d');

  // Three slowly-drifting blobs
  const blobs = [
    { x: 0.25, y: 0.20, r: 0.38, vx: 0.00014, vy: 0.00009, color: [124, 106, 247] },
    { x: 0.75, y: 0.65, r: 0.30, vx: -0.0001,  vy: 0.00012, color: [168, 156, 248] },
    { x: 0.55, y: 0.85, r: 0.25, vx: 0.00008,  vy: -0.00015, color: [91, 76, 224]  },
  ];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    blobs.forEach(b => {
      // Drift & wrap
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -0.2) b.x = 1.2;
      if (b.x >  1.2) b.x = -0.2;
      if (b.y < -0.2) b.y = 1.2;
      if (b.y >  1.2) b.y = -0.2;

      const cx = b.x * W;
      const cy = b.y * H;
      const radius = b.r * Math.min(W, H);
      const [r, g, bl] = b.color;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0,   `rgba(${r},${g},${bl},0.28)`);
      grad.addColorStop(1,   `rgba(${r},${g},${bl},0)`);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(draw);
})();

/* ──────────────────────────────────────────────────────────
   THEME — light / dark toggle, persisted + OS preference
────────────────────────────────────────────────────────── */

(function initTheme() {
  const html    = document.documentElement;
  const btn     = document.getElementById('theme-toggle');
  const icon    = document.getElementById('theme-icon');

  // Determine initial theme: stored > OS preference > light
  const stored  = Store.get('aurora-theme');
  const osDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored ?? (osDark ? 'dark' : 'light');

  function applyTheme(theme) {
    html.dataset.theme = theme;
    icon.className = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    Store.set('aurora-theme', theme);
  }

  btn.addEventListener('click', () => {
    applyTheme(html.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  applyTheme(initial);
})();

/* ──────────────────────────────────────────────────────────
   CLOCK — live time + greeting + date
────────────────────────────────────────────────────────── */

(function initClock() {
  const clockEl    = document.getElementById('clock');
  const greetingEl = document.getElementById('greeting');
  const dateEl     = document.getElementById('date-display');

  const greetings = ['Good evening', 'Good morning', 'Good afternoon', 'Good evening'];

  function update() {
    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();
    const s    = now.getSeconds();

    // Clock
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    clockEl.textContent = `${pad(h12)}:${pad(m)}:${pad(s)} ${ampm}`;

    // Greeting
    const slot = h < 5 ? 0 : h < 12 ? 1 : h < 17 ? 2 : 3;
    greetingEl.textContent = greetings[slot];

    // Date
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  update();
  setInterval(update, 1000);
})();

/* ──────────────────────────────────────────────────────────
   POMODORO TIMER
────────────────────────────────────────────────────────── */

(function initPomodoro() {
  /* --- DOM refs --- */
  const timeEl       = document.getElementById('pomo-time');
  const labelEl      = document.getElementById('pomo-label');
  const ringEl       = document.getElementById('pomo-ring');
  const startBtn     = document.getElementById('pomo-start');
  const resetBtn     = document.getElementById('pomo-reset');
  const settingsBtn  = document.getElementById('pomo-settings-btn');
  const settingsInfo = document.getElementById('pomo-settings-info');
  const modalEl      = document.getElementById('pomo-settings-modal');
  const focusInput   = document.getElementById('focus-duration-input');
  const breakInput   = document.getElementById('break-duration-input');
  const cancelBtn    = document.getElementById('pomo-modal-cancel');
  const saveBtn      = document.getElementById('pomo-modal-save');
  const banner       = document.getElementById('session-banner');
  const pomoCard     = document.getElementById('pomodoro-card');

  const CIRCUMFERENCE = 2 * Math.PI * 76; // r = 76 → ~477.52

  /* --- State --- */
  let focusMins  = Store.get('aurora-pomo-focus', 25);
  let breakMins  = Store.get('aurora-pomo-break', 5);
  let isFocus    = true;
  let running    = false;
  let remaining  = focusMins * 60; // seconds
  let totalSecs  = focusMins * 60;
  let interval   = null;

  /* --- Audio beep (Web Audio API, no external file needed) --- */
  function playBeep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const seq  = [880, 660, 880]; // three-tone chime
      let offset = 0;
      seq.forEach(freq => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.5);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.5);
        offset += 0.55;
      });
    } catch { /* Audio unsupported — silent fail */ }
  }

  /* --- Render --- */
  function render() {
    // Timer text
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timeEl.textContent = `${pad(m)}:${pad(s)}`;

    // Session label
    labelEl.textContent = isFocus ? 'Focus' : 'Break';

    // Ring progress — fill as time elapses
    const elapsed  = totalSecs - remaining;
    const fraction = totalSecs > 0 ? elapsed / totalSecs : 0;
    const offset   = CIRCUMFERENCE * (1 - fraction);
    ringEl.style.strokeDasharray  = CIRCUMFERENCE;
    ringEl.style.strokeDashoffset = offset;

    // Settings info text
    settingsInfo.textContent = `${focusMins} min focus · ${breakMins} min break`;

    // Start button label
    startBtn.innerHTML = running
      ? '<i class="ph ph-pause"></i> Pause'
      : '<i class="ph ph-play"></i> Start';
    startBtn.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
  }

  /* --- Session end --- */
  function onSessionEnd() {
    clearInterval(interval);
    running = false;

    playBeep();

    // Visual cue
    pomoCard.classList.add('session-done');
    setTimeout(() => pomoCard.classList.remove('session-done'), 2500);

    // Banner
    const msg = isFocus
      ? '🎉 Focus session done! Time for a break.'
      : '⚡ Break over! Ready to focus?';
    banner.textContent = msg;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 4000);

    // Switch session
    isFocus   = !isFocus;
    totalSecs = (isFocus ? focusMins : breakMins) * 60;
    remaining = totalSecs;

    render();

    // Auto-start next session
    interval = setInterval(tick, 1000);
    running  = true;
    render();
  }

  /* --- Tick --- */
  function tick() {
    if (remaining <= 0) { onSessionEnd(); return; }
    remaining--;
    render();
  }

  /* --- Controls --- */
  startBtn.addEventListener('click', () => {
    if (running) {
      clearInterval(interval);
      running = false;
    } else {
      interval = setInterval(tick, 1000);
      running  = true;
    }
    render();
  });

  resetBtn.addEventListener('click', () => {
    clearInterval(interval);
    running   = false;
    isFocus   = true;
    totalSecs = focusMins * 60;
    remaining = totalSecs;
    render();
  });

  /* --- Settings modal --- */
  function openModal() {
    focusInput.value = focusMins;
    breakInput.value = breakMins;
    modalEl.classList.add('open');
    focusInput.focus();
  }
  function closeModal() { modalEl.classList.remove('open'); }

  settingsBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);

  saveBtn.addEventListener('click', () => {
    const newFocus = parseInt(focusInput.value, 10);
    const newBreak = parseInt(breakInput.value, 10);

    if (!newFocus || newFocus < 1 || newFocus > 120) {
      showToast('Focus duration must be 1–120 minutes.'); return;
    }
    if (!newBreak || newBreak < 1 || newBreak > 60) {
      showToast('Break duration must be 1–60 minutes.'); return;
    }

    focusMins = newFocus;
    breakMins = newBreak;
    Store.set('aurora-pomo-focus', focusMins);
    Store.set('aurora-pomo-break', breakMins);

    // Reset timer with new durations
    clearInterval(interval);
    running   = false;
    isFocus   = true;
    totalSecs = focusMins * 60;
    remaining = totalSecs;

    closeModal();
    render();
    showToast('Timer settings saved!');
  });

  // Close modal on overlay click
  modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) closeModal();
  });

  // Initial render
  render();
})();

/* ──────────────────────────────────────────────────────────
   TO-DO LIST
────────────────────────────────────────────────────────── */

(function initTodo() {
  /* --- DOM refs --- */
  const inputEl   = document.getElementById('todo-input');
  const addBtn    = document.getElementById('todo-add-btn');
  const listEl    = document.getElementById('todo-list');
  const countEl   = document.getElementById('todo-count');
  const filterBtns= document.querySelectorAll('.filter-btn');

  /* --- State --- */
  let tasks  = Store.get('aurora-tasks', []);
  // tasks: [{ id, text, done }]
  let filter = 'all'; // 'all' | 'active' | 'completed'

  /* --- Persist --- */
  function save() { Store.set('aurora-tasks', tasks); }

  /* --- Render --- */
  function render() {
    const visible = tasks.filter(t => {
      if (filter === 'active')    return !t.done;
      if (filter === 'completed') return  t.done;
      return true;
    });

    listEl.innerHTML = '';

    if (visible.length === 0) {
      const emptyMsg = filter === 'completed'
        ? 'No completed tasks yet.'
        : filter === 'active'
          ? 'All tasks done! 🎉'
          : 'Add your first task above.';
      listEl.innerHTML = `<li class="todo-empty"><i class="ph ph-check-circle"></i>${emptyMsg}</li>`;
    } else {
      visible.forEach(task => listEl.appendChild(buildItem(task)));
    }

    // Count active tasks
    const active = tasks.filter(t => !t.done).length;
    countEl.textContent = `${active} task${active !== 1 ? 's' : ''} remaining`;
  }

  /* --- Build a single task list-item --- */
  function buildItem(task) {
    const li = document.createElement('li');
    li.className = `todo-item ${task.done ? 'done' : ''}`;
    li.dataset.id = task.id;

    // Checkbox
    const cb = document.createElement('button');
    cb.className = 'todo-checkbox';
    cb.setAttribute('aria-label', task.done ? 'Mark incomplete' : 'Mark complete');
    cb.addEventListener('click', () => toggleDone(task.id));

    // Text span (double-click to edit)
    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = task.text;
    span.setAttribute('title', 'Double-click to edit');
    span.addEventListener('dblclick', () => startEdit(task.id, li));

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'todo-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'todo-act-btn';
    editBtn.setAttribute('aria-label', 'Edit task');
    editBtn.innerHTML = '<i class="ph ph-pencil-simple"></i>';
    editBtn.addEventListener('click', () => startEdit(task.id, li));

    const delBtn = document.createElement('button');
    delBtn.className = 'todo-act-btn del';
    delBtn.setAttribute('aria-label', 'Delete task');
    delBtn.innerHTML = '<i class="ph ph-trash"></i>';
    delBtn.addEventListener('click', () => deleteTask(task.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(actions);
    return li;
  }

  /* --- Inline edit --- */
  function startEdit(id, li) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const span   = li.querySelector('.todo-text');
    const input  = document.createElement('input');
    input.type   = 'text';
    input.className = 'todo-edit-input';
    input.value  = task.text;
    input.maxLength = 200;

    span.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
      const val = input.value.trim();
      if (val) {
        task.text = val;
        save();
      }
      render();
    }

    input.addEventListener('blur',   commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { input.value = task.text; input.blur(); }
    });
  }

  /* --- Actions --- */
  function addTask(text) {
    if (!text) return;
    tasks.push({ id: Date.now().toString(36), text, done: false });
    save();
    render();
  }

  function toggleDone(id) {
    const t = tasks.find(t => t.id === id);
    if (t) { t.done = !t.done; save(); render(); }
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    save();
    render();
  }

  /* --- Event listeners --- */
  addBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) { showToast('Please enter a task first.'); return; }
    addTask(text);
    inputEl.value = '';
    inputEl.focus();
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') addBtn.click();
  });

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      filterBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      render();
    });
  });

  render();
})();

/* ──────────────────────────────────────────────────────────
   DAILY QUOTES
────────────────────────────────────────────────────────── */

(function initQuotes() {
  const quotes = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "Thomas Edison" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "Whether you think you can or think you can't, you're right.", author: "Henry Ford" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "You are never too old to set another goal or dream a new dream.", author: "C.S. Lewis" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
    { text: "The mind is everything. What you think you become.", author: "Buddha" },
    { text: "Act as if what you do makes a difference. It does.", author: "William James" },
    { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  ];

  const textEl   = document.getElementById('quote-text');
  const authorEl = document.getElementById('quote-author');
  const newBtn   = document.getElementById('new-quote-btn');

  let lastIndex = -1;

  function showQuote(animate = true) {
    let idx;
    do { idx = randInt(quotes.length); } while (idx === lastIndex && quotes.length > 1);
    lastIndex = idx;

    const q = quotes[idx];

    if (animate) {
      textEl.classList.remove('quote-animate');
      authorEl.classList.remove('quote-animate');
      // Trigger reflow for re-animation
      void textEl.offsetWidth;
    }

    textEl.textContent  = q.text;
    authorEl.textContent = `— ${q.author}`;

    if (animate) {
      textEl.classList.add('quote-animate');
      authorEl.classList.add('quote-animate');
    }
  }

  newBtn.addEventListener('click', () => showQuote(true));
  showQuote(false);
})();

/* ──────────────────────────────────────────────────────────
   QUICK LINKS
────────────────────────────────────────────────────────── */

(function initLinks() {
  /* --- DOM refs --- */
  const gridEl     = document.getElementById('links-grid');
  const addBtn     = document.getElementById('add-link-btn');
  const modalEl    = document.getElementById('link-modal');
  const nameInput  = document.getElementById('link-name-input');
  const urlInput   = document.getElementById('link-url-input');
  const cancelBtn  = document.getElementById('link-modal-cancel');
  const saveBtn    = document.getElementById('link-modal-save');

  /* --- Defaults --- */
  const DEFAULTS = [
    { id: 'default-1', name: 'GitHub',    url: 'https://github.com' },
    { id: 'default-2', name: 'Google',    url: 'https://google.com' },
    { id: 'default-3', name: 'YouTube',   url: 'https://youtube.com' },
    { id: 'default-4', name: 'Wikipedia', url: 'https://wikipedia.org' },
  ];

  /* --- State --- */
  let links = Store.get('aurora-links', null);
  if (links === null) {
    links = DEFAULTS;
    Store.set('aurora-links', links);
  }

  /* --- Persist --- */
  function save() { Store.set('aurora-links', links); }

  /* --- Render --- */
  function render() {
    gridEl.innerHTML = '';
    links.forEach(link => {
      const tile = buildTile(link);
      gridEl.appendChild(tile);
    });
  }

  /* --- Build a single tile --- */
  function buildTile(link) {
    const tile = document.createElement('div');
    tile.className = 'link-tile';
    tile.setAttribute('role', 'group');
    tile.setAttribute('aria-label', link.name);

    // Favicon wrapper
    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    const furl = faviconURL(link.url);
    if (furl) {
      const img = document.createElement('img');
      img.src   = furl;
      img.alt   = `${link.name} icon`;
      img.onerror = () => {
        favicon.innerHTML = `<i class="ph ph-link-simple"></i>`;
      };
      favicon.appendChild(img);
    } else {
      favicon.innerHTML = `<i class="ph ph-link-simple"></i>`;
    }

    // Name label
    const name = document.createElement('span');
    name.className   = 'link-name';
    name.textContent = link.name;

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'link-remove';
    removeBtn.setAttribute('aria-label', `Remove ${link.name}`);
    removeBtn.innerHTML = '<i class="ph ph-x"></i>';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation(); // don't navigate
      removeLink(link.id);
    });

    // Navigate on tile click (not on remove btn)
    tile.addEventListener('click', e => {
      if (e.target === removeBtn || removeBtn.contains(e.target)) return;
      window.open(link.url, '_blank', 'noopener,noreferrer');
    });

    // Keyboard: Enter/Space opens link
    tile.setAttribute('tabindex', '0');
    tile.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.open(link.url, '_blank', 'noopener,noreferrer');
      }
    });

    tile.appendChild(favicon);
    tile.appendChild(name);
    tile.appendChild(removeBtn);
    return tile;
  }

  /* --- Actions --- */
  function removeLink(id) {
    links = links.filter(l => l.id !== id);
    save();
    render();
  }

  /* --- Modal --- */
  function openModal() {
    nameInput.value = '';
    urlInput.value  = '';
    modalEl.classList.add('open');
    nameInput.focus();
  }
  function closeModal() { modalEl.classList.remove('open'); }

  addBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) closeModal();
  });

  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    let   url  = urlInput.value.trim();

    if (!name) { showToast('Please enter a name for the link.'); nameInput.focus(); return; }
    if (!url)  { showToast('Please enter a URL.'); urlInput.focus(); return; }

    // Auto-prepend https:// if missing scheme
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    if (!isValidURL(url)) {
      showToast('That doesn\'t look like a valid URL. Try again.'); urlInput.focus(); return;
    }

    links.push({ id: Date.now().toString(36), name, url });
    save();
    render();
    closeModal();
    showToast(`"${name}" added to Quick Links!`);
  });

  // Allow Enter key in modal inputs
  [nameInput, urlInput].forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
  });

  render();
})();
