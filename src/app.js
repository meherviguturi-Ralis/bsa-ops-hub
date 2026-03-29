/* ============================================================
   BSA Ops Hub — Main Renderer / App Orchestration
   ============================================================ */

// Module registry — modules self-register here
window.Modules = window.Modules || {};

// Global app settings store
window.appSettings = {};

// ============================================================
// Toast Notification System
// ============================================================

(function initToastSystem() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  window._toastContainer = container;
})();

window.showToast = function (message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  window._toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 300ms ease, transform 300ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 350);
  }, 3000);
};

// ============================================================
// ADO Fetch Helper
// ============================================================

window.adoFetch = async function (path, method = 'GET', body = null, contentType = null) {
  const settings = window.appSettings;
  if (!settings || !settings.adoPat) {
    throw new Error('ADO PAT not configured. Please set it in Settings.');
  }
  const url = `https://dev.azure.com/TheLoanExchange/${path}`;
  const result = await window.api.ado.request(method, url, settings.adoPat, body, contentType);
  if (result && result.error) {
    throw new Error(result.error);
  }
  return result;
};

// ============================================================
// Navigation
// ============================================================

window.navigateTo = function (moduleName) {
  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === moduleName);
  });

  // Play click sound
  try { Sounds.click(); } catch (e) { /* silent */ }

  // Render the module
  const container = document.getElementById('module-container');
  if (!container) return;

  container.innerHTML = '';

  // Re-trigger CSS animation
  container.style.animation = 'none';
  container.offsetHeight; // reflow
  container.style.animation = '';

  // Notify Copilot of screen change
  try { window.Copilot?.onNavigate(moduleName); } catch (e) { /* silent */ }

  const mod = window.Modules[moduleName];
  if (mod && typeof mod.render === 'function') {
    try {
      mod.render(container);
    } catch (err) {
      container.innerHTML = `
        <div class="module-stub">
          <div class="module-stub-icon">⚠️</div>
          <div class="module-stub-title">Module Error</div>
          <div class="module-stub-desc">${err.message}</div>
        </div>
      `;
    }
  } else {
    container.innerHTML = `
      <div class="module-stub">
        <div class="module-stub-icon">🔧</div>
        <div class="module-stub-title">Module Not Found</div>
        <div class="module-stub-desc">The module "${moduleName}" is not registered.</div>
      </div>
    `;
  }
};

// ============================================================
// Clock
// ============================================================

function startClock() {
  const el = document.getElementById('status-time');
  if (!el) return;

  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }

  tick();
  setInterval(tick, 1000);
}

// ============================================================
// Status Bar
// ============================================================

function setConnectionStatus(connected, message) {
  const dot = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');

  if (dot) {
    dot.classList.toggle('error', !connected);
    dot.classList.toggle('warning', false);
    if (connected) {
      dot.style.background = '';
    }
  }

  if (text) {
    text.textContent = message || (connected ? 'Connected to ADO' : 'ADO PAT not configured');
  }
}

// ============================================================
// XP Bar — Sidebar Display
// ============================================================

function injectXPBar() {
  const brand = document.querySelector('.sidebar-brand');
  if (!brand) return;

  // Remove existing if re-injecting
  const existing = document.getElementById('xp-sidebar-bar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.className = 'xp-bar-container';
  bar.id = 'xp-sidebar-bar';
  bar.innerHTML = `
    <div class="xp-level-name" id="xp-level-name">Trainee Analyst</div>
    <div class="xp-bar-track">
      <div class="xp-bar-fill" id="xp-bar-fill" style="width: 0%"></div>
    </div>
    <div class="xp-bar-label" id="xp-bar-label">0 / 250 XP</div>
  `;

  brand.insertAdjacentElement('afterend', bar);
}

function updateXPBar() {
  try {
    if (!window.XP) return;
    const state = window.XP.getState();
    const info  = window.XP.getLevelInfo(state.totalXp);

    const nameEl  = document.getElementById('xp-level-name');
    const fillEl  = document.getElementById('xp-bar-fill');
    const labelEl = document.getElementById('xp-bar-label');

    if (nameEl)  nameEl.textContent  = `Lv.${info.level} ${info.name}`;
    if (fillEl)  fillEl.style.width  = `${Math.round((info.progress || 0) * 100)}%`;
    if (labelEl) {
      if (info.xpToNext > 0) {
        labelEl.textContent = `${info.currentXp} / ${info.xpForLevel} XP`;
      } else {
        labelEl.textContent = `${state.totalXp} XP — MAX`;
      }
    }
  } catch (e) {
    // XP system may not be loaded
  }
}

// ============================================================
// Global XP Award Helper
// ============================================================

window.awardXP = function (action, reason) {
  try {
    if (window.XP) {
      return window.XP.award(action, reason);
    }
  } catch (e) {
    // Fail silently
  }
  return null;
};

// ============================================================
// XP Event Listener
// ============================================================

window.addEventListener('xp-awarded', (e) => {
  const { amount, reason, leveledUp, newLevelName } = e.detail || {};

  // Update the sidebar XP bar
  updateXPBar();

  if (leveledUp) {
    // Big celebration
    try { window.Celebration && window.Celebration.levelUp(newLevelName); } catch (err) {}
    try { window.Sounds && window.Sounds.levelUp(); } catch (err) {}
    window.showToast(`LEVEL UP! You are now: ${newLevelName}`, 'success');
  } else if (amount >= 100) {
    // Significant XP award
    try { window.Sounds && window.Sounds.complete(); } catch (err) {}
    window.showToast(`+${amount} XP — ${reason || 'Great work!'}`, 'success');
  } else if (amount > 0) {
    window.showToast(`+${amount} XP`, 'info');
  }
});

// ============================================================
// DOMContentLoaded — App Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load settings
  try {
    const settings = await window.api.settings.get();
    window.appSettings = settings;
  } catch (err) {
    window.appSettings = {
      adoOrg: 'TheLoanExchange',
      adoProject: 'TLE.Empower',
      userName: 'Meher Viguturi',
      adoPat: '',
      anthropicKey: ''
    };
  }

  // 2. Set user display
  const userEl = document.getElementById('status-user');
  if (userEl) {
    userEl.textContent = window.appSettings.userName || 'Meher Viguturi';
  }

  // 3. Start clock
  startClock();

  // 4. Set connection status
  const hasPat = !!(window.appSettings.adoPat && window.appSettings.adoPat.trim());
  setConnectionStatus(hasPat, hasPat ? 'Connected to ADO' : 'ADO PAT not configured');

  // 5. Init navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const moduleName = item.dataset.module;
      if (moduleName) {
        window.navigateTo(moduleName);
      }
    });
  });

  // 6. Window controls
  const btnMin   = document.getElementById('btn-minimize');
  const btnMax   = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  if (btnMin)   btnMin.addEventListener('click', () => window.api.minimize());
  if (btnMax)   btnMax.addEventListener('click', () => window.api.maximize());
  if (btnClose) btnClose.addEventListener('click', () => window.api.close());

  // 7. Inject and populate XP bar
  injectXPBar();
  updateXPBar();

  // 8. Load default module
  window.navigateTo('dashboard');

  // 9. Time-of-day theme
  applyTimeTheme();
  setInterval(applyTimeTheme, 60000);
});

/* ============================================================
   Time-of-Day Theme Engine
   ============================================================ */

function applyTimeTheme() {
  const hour = new Date().getHours();
  const root = document.documentElement;
  const body = document.body;
  const nav  = document.getElementById('sidebar');

  let accent, themeClass, label, emoji;

  if (hour >= 6 && hour < 11) {
    accent = '#4A9EFF'; themeClass = 'theme-morning';   label = 'Morning';   emoji = '🌅';
  } else if (hour >= 11 && hour < 16) {
    accent = '#58a6ff'; themeClass = 'theme-day';        label = 'Working';   emoji = '☀️';
  } else if (hour >= 16 && hour < 19) {
    accent = '#F0883E'; themeClass = 'theme-afternoon';  label = 'Afternoon'; emoji = '🌇';
  } else {
    accent = '#A78BFA'; themeClass = 'theme-evening';    label = 'Evening';   emoji = '🌙';
  }

  // Apply CSS variable and body class
  root.style.setProperty('--accent', accent);
  ['theme-morning','theme-day','theme-afternoon','theme-evening'].forEach(c => body.classList.remove(c));
  body.classList.add(themeClass);

  // Tint sidebar navbar at 8% opacity with accent color
  if (nav) {
    const r = parseInt(accent.slice(1,3),16);
    const g = parseInt(accent.slice(3,5),16);
    const b = parseInt(accent.slice(5,7),16);
    nav.style.background = `linear-gradient(180deg, rgba(${r},${g},${b},0.08) 0%, var(--bg-secondary) 100%)`;
  }

  // Update or create theme pill in titlebar
  let pill = document.getElementById('theme-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.id = 'theme-pill';
    pill.className = 'theme-pill';
    const titlebarControls = document.querySelector('.titlebar-controls');
    if (titlebarControls) titlebarControls.insertAdjacentElement('beforebegin', pill);
  }
  pill.textContent = `${emoji} ${label}`;
  pill.style.color = accent;
}
