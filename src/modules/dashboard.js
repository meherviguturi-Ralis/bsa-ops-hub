/* ============================================================
   BSA Ops Hub — Dashboard Module (Command-Center Redesign)
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // Constants
  // ============================================================

  const STAKEHOLDERS = {
    'Neil Pham':       'neil.pham@theloanexchange.com',
    'Steve Navarette': 'steve.navarette@theloanexchange.com',
    'Paul Yap':        'paul.yap@ralisservices.com',
    'Jason Goliver':   'jason.goliver@ralisservices.com'
  };

  // Empower domain knowledge — keyed by lowercase keyword
  const EMPOWER_TIPS = {
    'exchange title': {
      icon: '🏠', title: 'Exchange Title',
      tips: [
        'Event sequence: 100 → 130 → 150 → 385 → 180',
        'Event 130 not firing? Check title commitment received flag and vendor setup',
        'Verify title vendor credentials in Empower › Settings › Vendors',
        'Event 385 (Doc Draw) will not fire if PTD conditions are still open'
      ]
    },
    'exchange appraisal': {
      icon: '🏡', title: 'Exchange Appraisal (SoCal Direct)',
      tips: [
        'Appraisal order requires event 200 (Appraisal Ordered) to have fired',
        'SoCal Direct uses a specific AMC panel — confirm panel assignment first',
        'Verify UCDP submission settings for GSE delivery',
        'Appraisal not returning? Check AMC vendor API credentials in Empower'
      ]
    },
    'heloc': {
      icon: '💳', title: 'HELOC Loan Conditions',
      tips: [
        'HELOC milestone map differs from standard mortgage — verify event triggers',
        'Use PTD conditions for pre-draw requirements; AWC for at-closing items',
        'Credit line amount vs draw amount: confirm correct field mapping',
        'Subordination agreement: track as a condition with a custom category'
      ]
    },
    'conditions': {
      icon: '📋', title: 'Loan Conditions',
      tips: [
        'PTD = Prior to Documents · PTC = Prior to Closing · AWC = At and With Closing',
        'Use condition set templates for repeatable groups across loan types',
        'Automated condition triggers can be set on milestone events (e.g. 385)',
        'Some conditions require a specific user role to clear — check clearing rules'
      ]
    },
    'ptd': {
      icon: '📑', title: 'PTD (Prior to Documents)',
      tips: [
        'PTD conditions must be cleared before event 385 (Doc Draw) fires',
        'Common PTD blockers: missing flood cert, title exam, or insurance binder',
        'Link PTD conditions to the correct milestone in Empower condition management',
        'Check automated condition triggers on milestone advancement'
      ]
    },
    'awc': {
      icon: '✍️', title: 'AWC (At and With Closing)',
      tips: [
        'AWC conditions are collected at the closing table — ensure closing package is complete',
        'Common AWC: hazard insurance dec page, HOA docs, final inspection cert',
        'Link AWC conditions to the Closing milestone in Empower',
        'Verify the AWC list is transmitted to the settlement agent'
      ]
    },
    'validation': {
      icon: '✅', title: 'Empower Validation',
      tips: [
        'Field-level validation rules live in the Business Rules Engine (BRE)',
        'Validation errors block milestone advancement — check the Validation Report tab',
        "Use Empower's field inspector to identify required fields per loan type",
        'Custom fields not validating? Check field mapping in Empower settings'
      ]
    },
    'expression': {
      icon: '⚡', title: 'Empower Expressions',
      tips: [
        'Expressions use Encompass Expression Language (EEL) syntax',
        'Test in the Expression Editor before deploying to production',
        'Common fields: Fields["2"], Fields["1109"], LoanAmount, InterestRate',
        'Expressions fire on save events — verify the trigger configuration'
      ]
    },
    'xml': {
      icon: '📄', title: 'XML / Data Exchange',
      tips: [
        'Empower uses MISMO 3.4 schema for standard integrations',
        'Validate XML against the XSD before submitting to vendor',
        'Date fields must be YYYY-MM-DD in MISMO XML',
        'Common issue: namespace declaration missing from the root element'
      ]
    },
    'docmagic': {
      icon: '📝', title: 'DocMagic Integration',
      tips: [
        'Verify DocMagic API credentials in Empower › Vendors › DocMagic',
        'SmartClose / CDISC settings control e-signature and e-close workflow',
        'Check Empower field → DocMagic tag mapping for accuracy',
        'State-specific disclosure timing violations are a common TRID issue'
      ]
    },
    'docutech': {
      icon: '📃', title: 'DocuTech / SureDocs',
      tips: [
        'DocuTech uses the SureDocs platform — verify API token in Empower service settings',
        'Confirm doc package type (purchase / refi / HELOC) matches the loan purpose field',
        'Review Closing Disclosure generation settings for accuracy',
        'Fee mapping differences between Empower and SureDocs are a common issue'
      ]
    }
  };

  // Stores AI-ranked results keyed by item id
  let _aiRankedItems = [];
  let _selectedItemId = null;
  let _dashQueueView = 'priority'; // priority | iteration
  // Tracks which item IDs have already had their explosion played this session
  let _explodedIds = new Set();

  // ============================================================
  // Helpers
  // ============================================================

  function getStateBadge(state) {
    if (!state) return '<span class="badge badge-removed">Unknown</span>';
    const s = state.toLowerCase();
    if (s === 'active' || s === 'in progress' || s === 'committed') return `<span class="badge badge-active">${state}</span>`;
    if (s === 'new' || s === 'proposed') return `<span class="badge badge-new">${state}</span>`;
    if (s === 'resolved') return `<span class="badge badge-done">${state}</span>`;
    if (s === 'closed' || s === 'done') return `<span class="badge badge-done">${state}</span>`;
    if (s === 'testing' || s === 'in testing') return `<span class="badge badge-testing">${state}</span>`;
    if (s === 'removed') return `<span class="badge badge-removed">${state}</span>`;
    return `<span class="badge badge-pending">${state}</span>`;
  }

  function getStateBarClass(state) {
    if (!state) return 'state-closed';
    const s = state.toLowerCase();
    if (s === 'active' || s === 'in progress' || s === 'committed') return 'state-active';
    if (s === 'new' || s === 'proposed') return 'state-new';
    if (s === 'resolved' || s === 'closed' || s === 'done') return 'state-resolved';
    if (s === 'testing' || s === 'in testing') return 'state-testing';
    return 'state-new';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return dateStr; }
  }

  function getTodayFormatted() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function daysSince(dateStr) {
    if (!dateStr) return 999;
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    } catch (e) { return 999; }
  }

  function isOverdue(item) {
    if (isBlocked(item)) return false;  // BLOCKED takes priority, never show both
    const state = (item.fields['System.State'] || '').toLowerCase();
    if (state === 'testing' || state === 'resolved' || state === 'closed' || state === 'done') return false;
    const isPendingOrWaiting = state.includes('pending') || state.includes('waiting');
    return isPendingOrWaiting && daysSince(item.fields['System.ChangedDate']) > 2;
  }

  function isDone(item) {
    const state = (item.fields['System.State'] || '').toLowerCase();
    return state === 'testing' || state === 'resolved';
  }

  function stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
  }

  const BLOCKED_SIGNALS = [
    /\bblocked\b/i,
    /waiting on\b/i,
    /\bon hold\b/i,
    /dependency on\b/i,
    /pending approval/i,
  ];

  /**
   * isBlocked() — 3-LINE RULE:
   * - Title: scanned in full.
   * - Description: HTML stripped, split by newline and ". ", ONLY the first 3
   *   segments are scanned. Content beyond line 3 does NOT trigger blocked.
   * - System.State containing "on hold" or "waiting" also triggers blocked.
   */
  function isBlocked(item) {
    const state = (item.fields['System.State'] || '').toLowerCase();
    if (state.includes('on hold') || state.includes('waiting')) return true;

    // Full title scan
    const title = item.fields['System.Title'] || '';
    if (BLOCKED_SIGNALS.some(rx => rx.test(title))) return true;

    // First-3-lines description scan only
    const plain = stripHtml(item.fields['System.Description'] || '');
    const segments = plain
      .split(/\n|(?<=\. )/)   // split on newlines and sentence boundaries
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .slice(0, 3);            // only first 3 lines/sentences
    return BLOCKED_SIGNALS.some(rx => segments.some(seg => rx.test(seg)));
  }

  function extractBlockerText(item) {
    const plain = stripHtml(item.fields['System.Description'] || '');
    if (!plain) return 'Blocker mentioned — no description available.';
    // Return up to 3 sentences that mention "blocker"
    const sentences = plain.split(/(?<=[.!?])\s+/);
    const hits = sentences.filter(s => /\bblocker\b/i.test(s));
    return hits.length ? hits.slice(0, 3).join(' ') : plain.slice(0, 400);
  }

  function getEmpowerTips(title, description) {
    const haystack = (stripHtml(title) + ' ' + stripHtml(description)).toLowerCase();
    const matched = [];
    for (const [keyword, data] of Object.entries(EMPOWER_TIPS)) {
      if (haystack.includes(keyword)) matched.push(data);
    }
    return matched;
  }

  // ============================================================
  // Email Match Modal — paste email to locate task by BSA-HUB:#ID
  // ============================================================

  function showEmailMatchModal() {
    if (document.getElementById('email-match-overlay')) return; // prevent duplicates
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'email-match-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="width:500px;max-width:94vw;">
        <div class="modal-header">
          <div class="modal-title">📋 Match Email Reply to Task</div>
          <button class="btn btn-icon" id="eml-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;">
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">
            Paste the full email reply below. The app reads the
            <strong style="color:var(--accent);">BSA-HUB:#XXXX</strong> subject line
            and jumps to the matching task.
          </p>
          <textarea id="eml-textarea"
            style="width:100%;min-height:160px;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:var(--radius);color:var(--text-primary);font-size:13px;padding:10px;resize:vertical;font-family:inherit;"
            placeholder="Paste email content here (including subject line)…"></textarea>
          <div id="eml-result" style="font-size:12px;min-height:18px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="eml-cancel">Cancel</button>
          <button class="btn btn-primary" id="eml-go">Match &amp; Navigate →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('eml-close').addEventListener('click', close);
    document.getElementById('eml-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const textarea  = document.getElementById('eml-textarea');
    const resultEl  = document.getElementById('eml-result');

    function tryExtractId(text) {
      const m = text.match(/BSA-HUB[:\s#]+(\d+)/i);
      return m ? parseInt(m[1]) : null;
    }

    function showResult(text) {
      const id = tryExtractId(text);
      if (!id) {
        resultEl.innerHTML = '<span style="color:var(--text-muted);">No BSA-HUB:#XXXX pattern found yet.</span>';
        return;
      }
      const item = (window._dashItems || []).find(i => i.id === id);
      if (item) {
        resultEl.innerHTML = `<span style="color:var(--green);">✓ Found task #${id}: ${escapeHtml((item.fields['System.Title'] || '').slice(0, 60))}</span>`;
      } else {
        resultEl.innerHTML = `<span style="color:var(--yellow);">⚠ ID #${id} found but not in current queue — try Refresh Items first.</span>`;
      }
    }

    textarea.addEventListener('input', () => showResult(textarea.value));

    document.getElementById('eml-go').addEventListener('click', () => {
      const id = tryExtractId(textarea.value);
      if (!id) {
        resultEl.innerHTML = '<span style="color:var(--red);">No task ID found in pasted text.</span>';
        return;
      }
      const item = (window._dashItems || []).find(i => i.id === id);
      if (!item) {
        resultEl.innerHTML = `<span style="color:var(--red);">Task #${id} not found. Try refreshing items.</span>`;
        return;
      }
      const aiMap = {};
      if (_aiRankedItems && _aiRankedItems.items) {
        _aiRankedItems.items.forEach(r => { aiMap[r.id] = r; });
      }
      selectTask(item, aiMap[id] || null);
      document.querySelectorAll('.priority-card').forEach(c => {
        c.classList.toggle('selected', parseInt(c.dataset.itemId) === id);
      });
      close();
    });
  }

  // ============================================================
  // Render
  // ============================================================

  function render(container) {
    _aiRankedItems = [];
    _selectedItemId = null;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">Daily Dashboard</div>
        <div class="module-subtitle">${getTodayFormatted()}</div>
      </div>

      <div id="teams-banner-container"></div>

      <div class="cc-layout">
        <div class="cc-left" id="cc-left">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
            <div class="cc-section-title">Priority Queue</div>
            <div id="dash-view-toggle" style="display:none;border:1px solid var(--border-default);border-radius:var(--radius);overflow:hidden;">
              <button class="trk-view-btn trk-view-btn-on" id="dash-view-priority" style="border-radius:0;border:none;font-size:10px;padding:3px 8px;">🔢 Priority View</button>
              <button class="trk-view-btn" id="dash-view-iteration" style="border-radius:0;border:none;border-left:1px solid var(--border-default);font-size:10px;padding:3px 8px;">🔄 Iteration View</button>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:-6px;margin-bottom:4px;flex-shrink:0;">AI-ranked · Updated now</div>
          <div id="priority-queue-list">
            <div class="loading-state"><span class="spinner"></span> Loading…</div>
          </div>
        </div>

        <div class="cc-center" id="cc-center">
          <div id="cc-center-inner" style="display:flex;flex-direction:column;gap:12px;">
            <div class="task-detail-card" style="display:flex;align-items:center;justify-content:center;min-height:200px;color:var(--text-muted);font-size:14px;">
              ← Select a work item from the queue
            </div>
          </div>
        </div>

        <div class="cc-right" id="cc-right">
          <div class="cc-section-title">Today's Stats</div>
          <div class="mini-stats-grid" id="mini-stats-grid">
            <div class="mini-stat"><div class="mini-stat-value" id="mstat-total"><span class="spinner"></span></div><div class="mini-stat-label">Total</div></div>
            <div class="mini-stat"><div class="mini-stat-value" id="mstat-inprogress"><span class="spinner"></span></div><div class="mini-stat-label">In Progress</div></div>
            <div class="mini-stat"><div class="mini-stat-value" id="mstat-pending"><span class="spinner"></span></div><div class="mini-stat-label">Pending</div></div>
            <div class="mini-stat"><div class="mini-stat-value" id="mstat-today"><span class="spinner"></span></div><div class="mini-stat-label">Changed Today</div></div>
          </div>

          <div id="cc-streak-section" style="display:none;">
            <div class="cc-section-title" style="margin-top:8px;">Streak</div>
            <div id="cc-streak-display" style="font-size:13px;color:var(--text-secondary);"></div>
          </div>

          <div id="cc-xp-section" style="display:none;">
            <div class="cc-section-title" style="margin-top:8px;">XP</div>
            <div id="cc-xp-display" style="font-size:13px;color:var(--text-secondary);"></div>
          </div>

          <div style="margin-top:8px;">
            <div class="cc-section-title">Quick Actions</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button class="quick-action-btn" id="btn-refresh-items">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M13 7A6 6 0 0 1 2.4 11.3M1 7a6 6 0 0 1 10.6-4.3" stroke-linecap="round"/>
                  <polyline points="1,3 1,7 5,7" stroke-linecap="round" stroke-linejoin="round"/>
                  <polyline points="13,11 13,7 9,7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Refresh Items
              </button>
              <button class="quick-action-btn" id="btn-goto-quests">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="1" y="3" width="12" height="9" rx="1"/>
                  <path d="M4 3V2a1 1 0 0 1 2 0v1M8 3V2a1 1 0 0 1 2 0v1" stroke-linecap="round"/>
                  <path d="M3.5 7h7M3.5 9.5h5" stroke-linecap="round"/>
                </svg>
                Go to Quest Board
              </button>
              <button class="quick-action-btn" id="btn-goto-followup">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M2 2h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4l-3 2V3a1 1 0 0 1 1-1z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                View Follow-Ups
              </button>
              <button class="quick-action-btn" id="btn-match-email">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="1" y="3" width="12" height="9" rx="1"/>
                  <polyline points="1,4 7,8 13,4"/>
                  <line x1="9" y1="9" x2="13" y2="9" stroke-linecap="round"/>
                  <line x1="11" y1="7" x2="13" y2="9" stroke-linecap="round"/>
                </svg>
                Match Email Reply
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire quick actions
    document.getElementById('btn-refresh-items').addEventListener('click', () => {
      _aiRankedItems = [];
      _selectedItemId = null;
      loadDashboardData(container);
    });
    document.getElementById('btn-goto-quests').addEventListener('click', () => {
      if (window.navigateTo) window.navigateTo('quests');
    });
    document.getElementById('btn-goto-followup').addEventListener('click', () => {
      if (window.navigateTo) window.navigateTo('followup');
    });
    document.getElementById('btn-match-email').addEventListener('click', () => {
      showEmailMatchModal();
    });

    // Priority / Iteration view toggle (buttons exist but hidden until items load)
    document.getElementById('dash-view-priority')?.addEventListener('click', () => {
      _dashQueueView = 'priority';
      document.getElementById('dash-view-priority').classList.add('trk-view-btn-on');
      document.getElementById('dash-view-iteration').classList.remove('trk-view-btn-on');
      renderPriorityQueue(window._dashItems || [], _aiRankedItems);
    });
    document.getElementById('dash-view-iteration')?.addEventListener('click', () => {
      _dashQueueView = 'iteration';
      document.getElementById('dash-view-iteration').classList.add('trk-view-btn-on');
      document.getElementById('dash-view-priority').classList.remove('trk-view-btn-on');
      renderIterationView(window._dashItems || [], _aiRankedItems);
    });

    // Mount character banner
    if (window.CharacterBanner) {
      window.CharacterBanner.mount(document.getElementById('cb-banner-mount'));
    }

    // Load XP/streak if gamification available
    renderXpStreak();

    // Load data
    loadDashboardData(container);
  }

  function renderXpStreak() {
    try {
      if (window.XP && typeof window.XP.getState === 'function') {
        const xpState = window.XP.getState();
        if (xpState) {
          const streakSection = document.getElementById('cc-streak-section');
          const xpSection = document.getElementById('cc-xp-section');
          const streakDisplay = document.getElementById('cc-streak-display');
          const xpDisplay = document.getElementById('cc-xp-display');

          if (xpState.streak !== undefined && streakSection) {
            streakSection.style.display = '';
            streakDisplay.innerHTML = `🔥 <strong style="color:var(--text-primary);">${xpState.streak}</strong> day${xpState.streak !== 1 ? 's' : ''} streak`;
          }

          if (xpSection && xpDisplay) {
            xpSection.style.display = '';
            const levelName = xpState.levelName || xpState.level || 'Analyst';
            const xpPct = xpState.progressPercent !== undefined ? xpState.progressPercent : (xpState.xp || 0);
            xpDisplay.innerHTML = `
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${escapeHtml(String(levelName))}</div>
              <div style="background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:999px;height:6px;overflow:hidden;">
                <div style="background:var(--accent);height:100%;width:${Math.min(100, Math.max(0, xpPct))}%;border-radius:999px;transition:width 600ms ease;"></div>
              </div>
            `;
          }
        }
      }
    } catch (e) { /* XP not loaded, silent */ }
  }

  // ============================================================
  // Load Dashboard Data
  // ============================================================

  async function loadDashboardData(container) {
    _explodedIds = new Set(); // Reset so done items explode fresh on each data load
    const settings = window.appSettings;

    if (!settings || !settings.adoPat) {
      const centerInner = document.getElementById('cc-center-inner');
      if (centerInner) {
        centerInner.innerHTML = `
          <div class="no-pat-banner">
            ⚠️ Configure your ADO PAT in Settings to connect and view your work items.
            <button class="btn btn-secondary" style="margin-left:auto;" onclick="window.navigateTo('settings')">Open Settings</button>
          </div>
        `;
      }
      ['mstat-total','mstat-inprogress','mstat-pending','mstat-today'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
      return;
    }

    try {
      const project = settings.adoProject || 'TLE.Empower';
      const wiqlBody = {
        query: `SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType],[Microsoft.VSTS.Common.Priority],[System.ChangedDate]
                FROM WorkItems
                WHERE [System.TeamProject]='${project}'
                AND [System.AssignedTo]=@Me
                AND [System.State] NOT IN ('Removed','Closed')
                ORDER BY [System.ChangedDate] DESC`
      };

      const wiqlResult = await window.adoFetch(
        `${project}/_apis/wit/wiql?api-version=7.1`,
        'POST',
        wiqlBody
      );

      if (!wiqlResult || !wiqlResult.workItems) {
        throw new Error('No work items returned from WIQL query.');
      }

      const ids = wiqlResult.workItems.map(w => w.id);

      if (ids.length === 0) {
        const queueEl = document.getElementById('priority-queue-list');
        if (queueEl) queueEl.innerHTML = '<div class="empty-state">No active work items assigned to you.</div>';
        ['mstat-total','mstat-inprogress','mstat-pending','mstat-today'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '0';
        });
        return;
      }

      // Batch fetch with all needed fields
      const batchIds = ids.slice(0, 200);
      const fields = [
        'System.Id','System.Title','System.State','System.WorkItemType',
        'Microsoft.VSTS.Common.Priority','System.ChangedDate','System.AssignedTo',
        'Custom.PMorBSA','Custom.Dev','Custom.QA','Custom.Requester',
        'System.IterationPath','System.Description'
      ].join(',');

      const batchResult = await window.adoFetch(
        `${project}/_apis/wit/workitems?ids=${batchIds.join(',')}&fields=${fields}&api-version=7.1`,
        'GET'
      );

      const items = (batchResult && batchResult.value) ? batchResult.value : [];

      // Store globally
      window._dashItems = items;

      // Update right panel stats
      updateRightPanel(items);

      // Render priority queue (initial, unranked order)
      renderPriorityQueue(items, null);

      // Select first item (show placeholder until AI runs)
      if (items.length > 0) {
        _selectedItemId = items[0].id;
      }

      // Check teams banner
      checkTeamsBanner(items);

      // Run AI priority engine (async — updates queue when done)
      runPriorityEngine(items);

      try { Sounds.newItem(); } catch (e) { /* silent */ }

    } catch (err) {
      const centerInner = document.getElementById('cc-center-inner');
      if (centerInner) {
        centerInner.innerHTML = `
          <div class="no-pat-banner">
            ⚠️ Failed to load work items: ${escapeHtml(err.message)}
          </div>
        `;
      }
      ['mstat-total','mstat-inprogress','mstat-pending','mstat-today'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'ERR';
      });
    }
  }

  // ============================================================
  // Right Panel Stats
  // ============================================================

  function updateRightPanel(items) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let inProgress = 0, pending = 0, changedToday = 0;
    items.forEach(item => {
      const state = (item.fields['System.State'] || '').toLowerCase();
      if (state === 'active' || state === 'in progress' || state === 'committed') inProgress++;
      if (state.includes('pending') || state === 'new' || state === 'proposed') pending++;
      const changed = new Date(item.fields['System.ChangedDate']);
      if (changed >= today) changedToday++;
    });

    const setMStat = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (window.Animations && typeof window.Animations.countUp === 'function') {
        window.Animations.countUp(el, val, 800);
      } else {
        el.textContent = String(val);
      }
    };
    setMStat('mstat-total', items.length);
    setMStat('mstat-inprogress', inProgress);
    setMStat('mstat-pending', pending);
    setMStat('mstat-today', changedToday);

    renderXpStreak();

    // ── Knowledge stats card ──
    const rightPanel = document.getElementById('cc-right');
    if (rightPanel && window.KnowledgeEngine) {
      window.KnowledgeEngine.renderStatsCard(rightPanel);
    }
  }

  // ============================================================
  // Teams Banner
  // ============================================================

  function checkTeamsBanner(items) {
    const bannerContainer = document.getElementById('teams-banner-container');
    if (!bannerContainer) return;

    const pendingItems = items.filter(item => {
      const state = (item.fields['System.State'] || '').toLowerCase();
      return state.includes('pending');
    });

    if (pendingItems.length === 0) {
      bannerContainer.innerHTML = '';
      return;
    }

    // Match stakeholders
    const matched = [];
    for (const item of pendingItems) {
      const requester = item.fields['Custom.Requester'] || '';
      const title = item.fields['System.Title'] || '';
      const combined = (requester + ' ' + title).toLowerCase();

      for (const [name, email] of Object.entries(STAKEHOLDERS)) {
        const nameLower = name.toLowerCase();
        if (combined.includes(nameLower) || requester.toLowerCase().includes(nameLower.split(' ')[0])) {
          matched.push({ item, name, email });
          break;
        }
      }
    }

    if (matched.length === 0) {
      bannerContainer.innerHTML = '';
      return;
    }

    if (matched.length === 1) {
      const { item, name, email } = matched[0];
      const id = item.id;
      const title = item.fields['System.Title'] || '(No Title)';
      const days = daysSince(item.fields['System.ChangedDate']);
      const daysStr = days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;

      bannerContainer.innerHTML = `
        <div class="teams-banner" id="teams-banner">
          <div class="teams-banner-icon">💬</div>
          <div class="teams-banner-text">
            <strong>#${id} — ${escapeHtml(title)}</strong> is waiting on <strong>${escapeHtml(name)}</strong> · ${daysStr}
          </div>
          <button class="btn btn-primary teams-banner-btn" id="btn-teams-ping">
            Open Teams Chat →
          </button>
          <button class="teams-banner-dismiss" id="btn-teams-dismiss">✕</button>
        </div>
      `;

      document.getElementById('btn-teams-ping').addEventListener('click', () => {
        const url = `msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
        if (window.api && window.api.shell && window.api.shell.openExternal) {
          window.api.shell.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
      });

      document.getElementById('btn-teams-dismiss').addEventListener('click', () => {
        const banner = document.getElementById('teams-banner');
        if (banner) banner.style.display = 'none';
      });

    } else {
      bannerContainer.innerHTML = `
        <div class="teams-banner" id="teams-banner">
          <div class="teams-banner-icon">💬</div>
          <div class="teams-banner-text">
            You have <strong>${matched.length} items</strong> waiting on stakeholders
          </div>
          <button class="btn btn-primary teams-banner-btn" id="btn-view-followups">
            View Follow-Ups →
          </button>
          <button class="teams-banner-dismiss" id="btn-teams-dismiss">✕</button>
        </div>
      `;
      document.getElementById('btn-view-followups').addEventListener('click', () => {
        if (window.navigateTo) window.navigateTo('followup');
      });
      document.getElementById('btn-teams-dismiss').addEventListener('click', () => {
        const banner = document.getElementById('teams-banner');
        if (banner) banner.style.display = 'none';
      });
    }
  }

  // ============================================================
  // Priority Queue Render
  // ============================================================

  function renderPriorityQueue(items, aiResults) {
    const queueEl = document.getElementById('priority-queue-list');
    if (!queueEl) return;

    if (!items || items.length === 0) {
      queueEl.innerHTML = '<div class="empty-state">No active work items.</div>';
      return;
    }

    // Build a map of id -> aiResult for quick lookup
    const aiMap = {};
    if (aiResults && aiResults.items) {
      aiResults.items.forEach(r => { aiMap[r.id] = r; });
    }

    // Determine display order
    let displayItems;
    if (aiResults && aiResults.items && aiResults.items.length > 0) {
      // Use AI ranking order; items not in AI list go at the end
      const aiIds = aiResults.items.map(r => r.id);
      const itemMap = {};
      items.forEach(i => { itemMap[i.id] = i; });

      displayItems = aiIds
        .filter(id => itemMap[id])
        .map(id => itemMap[id]);

      // Append remaining items
      items.forEach(item => {
        if (!aiIds.includes(item.id)) displayItems.push(item);
      });
    } else {
      // Fallback: sort by state priority
      displayItems = fallbackSort(items);
    }

    // Blocked items always surface to the top of the queue
    const blockedItems  = displayItems.filter(item => isBlocked(item));
    const restItems     = displayItems.filter(item => !isBlocked(item));
    displayItems = [...blockedItems, ...restItems];

    const html = displayItems.map((item, idx) => {
      const id = item.id;
      const title = item.fields['System.Title'] || '(No Title)';
      const state = item.fields['System.State'] || '';
      const aiResult = aiMap[id];
      const rank = aiResult ? aiResult.rank : (idx + 1);
      const urgency = aiResult ? (aiResult.urgency || 'MEDIUM') : 'MEDIUM';
      const estimatedTime = aiResult ? (aiResult.estimatedTime || '') : '';

      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
      const urgencyClass = urgency === 'HIGH' ? 'urgency-high' : urgency === 'LOW' ? 'urgency-low' : 'urgency-medium';
      const urgencyLabel = urgency.charAt(0) + urgency.slice(1).toLowerCase();

      const blockedItem = isBlocked(item);
      const overdueItem = isOverdue(item);
      const doneItem    = isDone(item);

      let cardClass = 'priority-card';
      if (blockedItem) cardClass += ' priority-card-blocked';
      else if (doneItem) cardClass += ' priority-card-done';
      else if (overdueItem) cardClass += ' priority-card-overdue';
      if (rank === 1 && !overdueItem && !doneItem && !blockedItem) cardClass += ' priority-card-rank-1';
      if (id === _selectedItemId) cardClass += ' selected';

      // Build combined animation string:
      // 1. Slide-in with staggered delay (always)
      // 2. Persistent state animation starts after slide-in
      const slideDelay = idx * 100;
      const persistDelay = slideDelay + 450;
      let animParts = [`card-slide-in 400ms ${slideDelay}ms ease-out both`];
      if (blockedItem) {
        animParts.push(`blocked-card-pulse 1.2s ${persistDelay}ms ease-in-out infinite`);
      } else if (overdueItem) {
        animParts.push(`overdue-heartbeat 1.5s ${persistDelay}ms ease-in-out infinite`);
      }
      const cardAnimStyle = `animation: ${animParts.join(', ')};`;

      const shortTitle = title.length > 52 ? title.slice(0, 49) + '…' : title;
      // Blocked items show a flame icon instead of rank number
      const rankDisplay = blockedItem ? '🔥' : rank;

      return `
        <div class="${cardClass}" data-item-id="${id}" style="${cardAnimStyle}">
          <div style="display:flex;align-items:flex-start;gap:0;margin-bottom:6px;">
            <span class="priority-rank ${blockedItem ? 'rank-blocked' : rankClass}">${rankDisplay}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:500;color:var(--text-primary);line-height:1.35;margin-bottom:4px;">${escapeHtml(shortTitle)}</div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${blockedItem
                  ? '<span class="badge-blocked">🔥 BLOCKED</span>'
                  : overdueItem
                    ? `${getStateBadge(state)}<span class="badge-overdue">OVERDUE</span>`
                    : getStateBadge(state)
                }
                <span class="urgency-badge ${urgencyClass}">${urgencyLabel}</span>
                ${estimatedTime ? `<span style="font-size:10px;color:var(--text-muted);">~${escapeHtml(estimatedTime)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    queueEl.innerHTML = html;

    // Show view toggle now that items are loaded
    const dvToggle = document.getElementById('dash-view-toggle');
    if (dvToggle) dvToggle.style.display = '';

    // Wire click handlers
    queueEl.querySelectorAll('.priority-card').forEach(card => {
      card.addEventListener('click', () => {
        const itemId = parseInt(card.dataset.itemId);
        const item = (window._dashItems || []).find(i => i.id === itemId);
        if (item) selectTask(item, aiMap[itemId]);
      });
    });

    // Auto-select first if nothing selected yet
    if (displayItems.length > 0 && !document.querySelector('.priority-card.selected')) {
      const firstItem = displayItems[0];
      _selectedItemId = firstItem.id;
      selectTask(firstItem, aiMap[firstItem.id]);
    }

    // Trigger card explosion for newly-done items
    displayItems.forEach((item, idx) => {
      if (isDone(item) && !_explodedIds.has(item.id)) {
        _explodedIds.add(item.id);
        const card = queueEl.querySelector(`[data-item-id="${item.id}"]`);
        if (card && window.Celebration && typeof window.Celebration.cardExplosion === 'function') {
          // Wait for slide-in to finish before exploding
          setTimeout(() => window.Celebration.cardExplosion(card), idx * 100 + 600);
        }
      }
    });
  }

  // ============================================================
  // Iteration View (Feature 3)
  // ============================================================

  function renderIterationView(items, aiResults) {
    const queueEl = document.getElementById('priority-queue-list');
    if (!queueEl || !items.length) return;

    // Show toggle
    const dvToggle = document.getElementById('dash-view-toggle');
    if (dvToggle) dvToggle.style.display = '';

    const aiMap = {};
    if (aiResults && aiResults.items) aiResults.items.forEach(r => { aiMap[r.id] = r; });

    // Group by iteration
    const groups = {};
    items.forEach(item => {
      const iter = item.fields['System.IterationPath'] || 'No Iteration';
      if (!groups[iter]) groups[iter] = [];
      groups[iter].push(item);
    });

    const iterKeys = Object.keys(groups).sort((a,b) => b.localeCompare(a));
    const currentIter = iterKeys[0];

    const pillsHtml = [
      `<button class="trk-view-btn trk-view-btn-on" data-iter-filter="all" style="font-size:10px;padding:3px 8px;">All</button>`,
      ...iterKeys.map(k => {
        const label = k.split('\\').pop() || k;
        const isCurrent = k === currentIter;
        return `<button class="trk-view-btn${isCurrent?' trk-view-btn-on':''}" data-iter-filter="${escapeHtml(k)}" style="font-size:10px;padding:3px 8px;">${escapeHtml(label)}</button>`;
      })
    ].join('');

    const groupsHtml = iterKeys.map(iter => {
      const iterItems = groups[iter].slice().sort((a,b) => ((aiMap[a.id]?.rank||99)-(aiMap[b.id]?.rank||99)));
      const label = iter.split('\\').pop() || iter;
      const isCurrent = iter === currentIter;
      const cardsHtml = iterItems.map(item => {
        const f = item.fields;
        const id = item.id;
        const title = f['System.Title'] || '(No Title)';
        const state = f['System.State'] || '';
        const ai = aiMap[id];
        const isSelected = id === _selectedItemId;
        return `<div class="priority-card${isSelected?' selected':''}" data-item-id="${id}" style="animation:card-slide-in 300ms ease both;">
          <div style="display:flex;align-items:flex-start;gap:6px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:500;color:var(--text-primary);line-height:1.35;margin-bottom:4px;">${escapeHtml(title.length>52?title.slice(0,49)+'…':title)}</div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                ${getStateBadge(state)}
                ${ai?`<span class="urgency-badge ${ai.urgency==='HIGH'?'urgency-high':ai.urgency==='LOW'?'urgency-low':'urgency-medium'}">${ai.urgency}</span>`:''}
              </div>
            </div>
          </div>
        </div>`;
      }).join('');
      return `<details class="iter-group" data-iter="${escapeHtml(iter)}" ${isCurrent?'open':''}>
        <summary class="iter-group-header">
          <span class="iter-group-label">${escapeHtml(label)}</span>
          <span class="iter-group-count">${iterItems.length}</span>
          ${isCurrent?'<span style="font-size:9px;color:var(--accent);margin-left:4px;font-weight:600;">CURRENT</span>':''}
        </summary>
        <div class="iter-group-cards">${cardsHtml}</div>
      </details>`;
    }).join('');

    queueEl.innerHTML = `
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-default);">${pillsHtml}</div>
      ${groupsHtml}`;

    // Wire card clicks
    queueEl.querySelectorAll('.priority-card').forEach(card => {
      card.addEventListener('click', () => {
        const itemId = parseInt(card.dataset.itemId);
        const item = (window._dashItems||[]).find(i => i.id === itemId);
        if (item) selectTask(item, aiMap[itemId]);
      });
    });

    // Wire filter pills
    queueEl.querySelectorAll('[data-iter-filter]').forEach(pill => {
      pill.addEventListener('click', () => {
        queueEl.querySelectorAll('[data-iter-filter]').forEach(p => p.classList.remove('trk-view-btn-on'));
        pill.classList.add('trk-view-btn-on');
        const filter = pill.dataset.iterFilter;
        queueEl.querySelectorAll('.iter-group').forEach(g => {
          g.style.display = (filter === 'all' || g.dataset.iter === filter) ? '' : 'none';
        });
      });
    });
  }

  // ============================================================
  // Fallback Sort (no AI)
  // ============================================================

  function fallbackSort(items) {
    const stateOrder = { 'testing': 0, 'in testing': 0, 'pm/bsa in progress': 1, 'active': 2, 'in progress': 2, 'committed': 2, 'pending requirement': 3, 'new': 4, 'proposed': 4 };
    return [...items].sort((a, b) => {
      const sa = (a.fields['System.State'] || '').toLowerCase();
      const sb = (b.fields['System.State'] || '').toLowerCase();
      const oa = stateOrder[sa] !== undefined ? stateOrder[sa] : 5;
      const ob = stateOrder[sb] !== undefined ? stateOrder[sb] : 5;
      if (oa !== ob) return oa - ob;
      // Secondary: most recently changed first
      return new Date(b.fields['System.ChangedDate']) - new Date(a.fields['System.ChangedDate']);
    });
  }

  // ============================================================
  // Select Task — Update Center Panel
  // ============================================================

  function selectTask(item, aiResult) {
    _selectedItemId = item.id;

    // Update selected card styling
    document.querySelectorAll('.priority-card').forEach(card => {
      card.classList.toggle('selected', parseInt(card.dataset.itemId) === item.id);
    });

    const centerInner = document.getElementById('cc-center-inner');
    if (!centerInner) return;

    const id = item.id;
    const fields = item.fields;
    const title = fields['System.Title'] || '(No Title)';
    const state = fields['System.State'] || '';
    const type = fields['System.WorkItemType'] || '';
    const priority = fields['Microsoft.VSTS.Common.Priority'] || '—';
    const assignedTo = fields['System.AssignedTo'] || '';
    const assignedToName = typeof assignedTo === 'object' ? (assignedTo.displayName || '—') : (assignedTo || '—');
    const iteration = fields['System.IterationPath'] || '—';
    const pmBsa = fields['Custom.PMorBSA'] || '—';
    const dev = fields['Custom.Dev'] || '—';
    const qa = fields['Custom.QA'] || '—';
    const requester = fields['Custom.Requester'] || '—';
    const changedDate = formatDate(fields['System.ChangedDate']);

    const adoUrl = `https://dev.azure.com/TheLoanExchange/TLE.Empower/_workitems/edit/${id}`;

    // Determine stakeholder for Teams button
    const requesterStr = String(requester).toLowerCase();
    let teamsEmail = null;
    for (const [name, email] of Object.entries(STAKEHOLDERS)) {
      if (requesterStr.includes(name.toLowerCase().split(' ')[0])) {
        teamsEmail = email;
        break;
      }
    }

    // AI reason card
    let aiReasonHtml = '';
    if (aiResult && aiResult.reason) {
      aiReasonHtml = `
        <div class="ai-reason-card">
          <div class="ai-reason-label">🤖 AI Priority Reason</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">${escapeHtml(aiResult.reason)}</div>
        </div>
      `;
    }

    // Blocker details section
    const blocked = isBlocked(item);
    let blockerHtml = '';
    if (blocked) {
      const blockerText = extractBlockerText(item);
      blockerHtml = `
        <details class="blocker-details-section" open>
          <summary class="blocker-details-summary">🔥 Blocker Details — click to collapse</summary>
          <div class="blocker-details-body">${escapeHtml(blockerText)}</div>
        </details>
      `;
    }

    // Empower Smart Tips
    const tips = getEmpowerTips(title, fields['System.Description'] || '');
    let empowerHtml = '';
    if (tips.length > 0) {
      const groupsHtml = tips.map(g => `
        <div class="empower-tip-group">
          <div class="empower-tip-group-title">${g.icon} ${escapeHtml(g.title)}</div>
          ${g.tips.map(t => `<div class="empower-tip-item">${escapeHtml(t)}</div>`).join('')}
        </div>
      `).join('');
      empowerHtml = `
        <div class="empower-tips-card">
          <div class="empower-tips-header">
            <span class="empower-tips-label">⚡ Empower Co-Pilot Tips</span>
          </div>
          ${groupsHtml}
        </div>
      `;
    }

    // mailto URL for Outlook email thread
    const mailSubject = encodeURIComponent(`BSA-HUB:#${id}`);
    const mailBody    = encodeURIComponent(`Hi,\n\nRe: Work Item #${id} — ${title}\n\n`);
    const mailtoUrl   = `mailto:?subject=${mailSubject}&body=${mailBody}`;

    centerInner.innerHTML = `
      <div class="task-detail-card">
        <div class="task-detail-id">#${id}</div>
        <div class="task-detail-title">${escapeHtml(title)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          ${getStateBadge(state)}
          ${blocked ? '<span class="badge-blocked">🔥 BLOCKED</span>' : ''}
          <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(type)}</span>
          <span style="font-size:11px;color:var(--text-muted);">Changed ${changedDate}</span>
        </div>
        <div class="task-fields-grid">
          <div class="task-field"><div class="task-field-label">State</div><div class="task-field-value">${escapeHtml(state)}</div></div>
          <div class="task-field"><div class="task-field-label">Type</div><div class="task-field-value">${escapeHtml(type)}</div></div>
          <div class="task-field"><div class="task-field-label">Assigned To</div><div class="task-field-value">${escapeHtml(assignedToName)}</div></div>
          <div class="task-field"><div class="task-field-label">Priority</div><div class="task-field-value">${escapeHtml(String(priority))}</div></div>
          <div class="task-field" style="grid-column:1/-1;"><div class="task-field-label">Iteration</div><div class="task-field-value">${escapeHtml(String(iteration))}</div></div>
          <div class="task-field"><div class="task-field-label">PM / BSA</div><div class="task-field-value">${escapeHtml(String(pmBsa))}</div></div>
          <div class="task-field"><div class="task-field-label">Dev</div><div class="task-field-value">${escapeHtml(String(dev))}</div></div>
          <div class="task-field"><div class="task-field-label">QA</div><div class="task-field-value">${escapeHtml(String(qa))}</div></div>
          <div class="task-field"><div class="task-field-label">Requester</div><div class="task-field-value">${escapeHtml(String(requester))}</div></div>
        </div>
        <div id="task-guide-${id}" style="margin:12px 0 4px;"></div>
        <div class="task-actions">
          <button class="btn btn-primary" id="btn-open-ado">Open in ADO ↗</button>
          <button class="btn btn-secondary" id="btn-copy-ac">📋 Copy AC</button>
          <button class="btn btn-secondary" id="btn-msg-stakeholder">${teamsEmail ? '💬 Message Stakeholder' : '📨 Messages'}</button>
          <button class="btn btn-secondary" id="btn-email-thread" title="Open Outlook with BSA-HUB:#${id} subject">📧 Email Thread</button>
        </div>
      </div>
      ${aiReasonHtml}
      ${blockerHtml}
      ${empowerHtml}
    `;

    // Wire action buttons
    document.getElementById('btn-open-ado').addEventListener('click', () => {
      if (window.api && window.api.shell && window.api.shell.openExternal) {
        window.api.shell.openExternal(adoUrl);
      } else {
        window.open(adoUrl, '_blank');
      }
    });

    document.getElementById('btn-copy-ac').addEventListener('click', () => {
      const ac     = (item.fields?.['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '').trim();
      const desc   = fields['System.Description'] || '';
      const topics = window.KnowledgeEngine?.getTopics(title, desc) || [];
      const doACopy = (content) => {
        const text = content || ac || `${title}\n\nNo AC defined.`;
        navigator.clipboard.writeText(text).then(() => {
          window.showToast?.('AC copied to clipboard', 'success');
          if (text && text.trim() && text !== `${title}\n\nNo AC defined.`) {
            window.KnowledgeEngine?.addToACLibrary(id, title, topics, text);
          }
        });
      };
      if (window.KnowledgeEngine) {
        window.KnowledgeEngine.showACLibraryModal(id, title, topics, (selected) => doACopy(selected || ac));
      } else {
        doACopy(ac);
      }
    });

    document.getElementById('btn-msg-stakeholder').addEventListener('click', () => {
      if (teamsEmail) {
        const url = `msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(teamsEmail)}`;
        if (window.api && window.api.shell && window.api.shell.openExternal) {
          window.api.shell.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
      } else {
        if (window.navigateTo) window.navigateTo('mail');
      }
    });

    document.getElementById('btn-email-thread').addEventListener('click', () => {
      if (window.api && window.api.shell && window.api.shell.openExternal) {
        window.api.shell.openExternal(mailtoUrl);
      } else {
        window.open(mailtoUrl, '_blank');
      }
    });

    // Step checklist — always rendered, inside card above action buttons
    if (window.EmpowerGuide) {
      window.EmpowerGuide.renderForTask(item, document.getElementById(`task-guide-${id}`));
    }

    // ── Knowledge Engine: inject related tasks + blocker warnings ──
    if (window.KnowledgeEngine) {
      const kbEl = document.createElement('div');
      kbEl.style.marginTop = '10px';
      centerInner.appendChild(kbEl);
      window.KnowledgeEngine.renderRelatedTasksCard(kbEl, id, title, fields['System.Description'] || '');
    }

    // ── Empower Screen Mapper (Feature 4) ──
    if (window.EmpowerScreens) {
      const screensEl = document.createElement('div');
      screensEl.style.marginTop = '10px';
      centerInner.appendChild(screensEl);
      window.EmpowerScreens.renderSection(screensEl, item);
    }
  }

  // ============================================================
  // Smart Priority Engine (AI)
  // ============================================================

  async function runPriorityEngine(items) {
    const centerInner = document.getElementById('cc-center-inner');
    if (centerInner) {
      centerInner.innerHTML = `
        <div class="task-detail-card" style="display:flex;align-items:center;justify-content:center;min-height:200px;flex-direction:column;gap:12px;color:var(--text-muted);">
          <span class="spinner"></span>
          <span style="font-size:14px;">🤖 Analyzing your priorities…</span>
        </div>
      `;
    }

    const systemPrompt = `You are a personal AI coach for Meher Viguturi, a Business Systems Analyst at The Loan Exchange working on the TLE.Empower project (Empower LOS). Your job is to give direct, actionable daily coaching. Be concise, confident, and specific — like a great manager who knows the work.`;

    const itemsJson = items.slice(0, 20).map(item => ({
      id: item.id,
      title: item.fields['System.Title'] || '',
      state: item.fields['System.State'] || '',
      workItemType: item.fields['System.WorkItemType'] || '',
      priority: item.fields['Microsoft.VSTS.Common.Priority'] || null,
      changedDate: item.fields['System.ChangedDate'] || null
    }));

    const userPrompt = `Here are my current work items. Please rank the top 5 by urgency, considering blocked items, staleness (not changed in >7 days), and current state (Testing = urgent, Pending = needs follow-up, Active = in flight).

Work items:
${JSON.stringify(itemsJson, null, 2)}

Return ONLY raw JSON (no markdown, no code fences) in this exact format:
{
  "dailyFocus": "One sentence of what Meher should focus on today.",
  "items": [
    {
      "rank": 1,
      "id": 1234,
      "title": "...",
      "urgency": "HIGH",
      "estimatedTime": "2 hrs",
      "reason": "Specific reason why this is ranked here."
    }
  ]
}

urgency must be HIGH, MEDIUM, or LOW. Include exactly 5 items (or fewer if there are fewer than 5 work items).`;

    try {
      const response = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });

      if (!response || !response.content || !response.content[0]) {
        throw new Error('No AI response');
      }

      let rawText = response.content[0].text || '';

      // Strip markdown code fences if present
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

      let aiResults;
      try {
        aiResults = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error('AI returned invalid JSON: ' + parseErr.message);
      }

      _aiRankedItems = aiResults;

      // Render priority queue with AI order
      renderPriorityQueue(items, aiResults);

      // Show daily focus + selected task in center
      const firstAiItem = aiResults.items && aiResults.items[0];
      const firstItem = firstAiItem
        ? (window._dashItems || []).find(i => i.id === firstAiItem.id) || items[0]
        : items[0];

      // Build center with daily focus banner + task detail
      if (aiResults.dailyFocus && centerInner) {
        const dailyFocusHtml = `
          <div class="daily-focus-card">
            <div class="focus-label">🎯 Daily Focus</div>
            <div style="font-size:13px;color:var(--text-primary);line-height:1.5;">${escapeHtml(aiResults.dailyFocus)}</div>
          </div>
        `;
        centerInner.innerHTML = dailyFocusHtml;
      }

      if (firstItem) {
        selectTask(firstItem, firstAiItem);
        // Prepend daily focus banner without replacing innerHTML (would destroy event listeners)
        if (aiResults.dailyFocus && centerInner) {
          const dailyFocusHtml = `
            <div class="daily-focus-card">
              <div class="focus-label">🎯 Daily Focus</div>
              <div style="font-size:13px;color:var(--text-primary);line-height:1.5;">${escapeHtml(aiResults.dailyFocus)}</div>
            </div>
          `;
          centerInner.insertAdjacentHTML('afterbegin', dailyFocusHtml);
        }
      }

    } catch (err) {
      // Graceful fallback: sort by state, show first item
      console.warn('[Dashboard] AI priority engine failed, using fallback sort:', err.message);
      renderPriorityQueue(items, null);
      if (items.length > 0) {
        const sorted = fallbackSort(items);
        selectTask(sorted[0], null);
      }
    }
  }

  // ============================================================
  // Self-register
  // ============================================================

  window.Modules = window.Modules || {};
  window.Modules.dashboard = {
    render,
    cleanup() {
      _aiRankedItems = [];
      _selectedItemId = null;
      _explodedIds = new Set();
      if (window.CharacterBanner) window.CharacterBanner.destroy();
    },
    getContext() {
      const total   = _aiRankedItems.length;
      const blocked = _aiRankedItems.filter(i => typeof isBlocked === 'function' ? isBlocked(i) : false).length;
      const selected = _aiRankedItems.find(i => i.id === _selectedItemId);
      const ctx = {
        'Total open items': total,
        'Blocked items':    blocked,
      };
      if (selected) {
        ctx['Currently viewing'] = `#${selected.id}: ${selected.fields['System.Title'] || ''}`;
        ctx['State'] = selected.fields['System.State'] || '';
      }
      return ctx;
    }
  };

})();
