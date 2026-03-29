/* ============================================================
   BSA Ops Hub — Work Items Module
   ============================================================ */

(function () {
  'use strict';

  let _allItems     = [];
  let _selectedItem = null;
  let _displayItems = []; // current ordered display items
  let _draggedId    = null; // task ID of the card being dragged

  const PRIORITY_ORDER_KEY = 'bsa-priority-order-v1';

  function loadPriorityOrder() {
    try { return JSON.parse(localStorage.getItem(PRIORITY_ORDER_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function savePriorityOrder(ids) {
    try { localStorage.setItem(PRIORITY_ORDER_KEY, JSON.stringify(ids)); }
    catch (e) { /* silent */ }
  }

  function applyPriorityOrder(items) {
    const order = loadPriorityOrder();
    if (!order || !order.length) return items.slice();
    const orderMap = new Map(order.map((id, idx) => [id, idx]));
    const known   = items.filter(i =>  orderMap.has(i.id)).sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
    const unknown = items.filter(i => !orderMap.has(i.id));
    return [...known, ...unknown];
  }

  // ============================================================
  // Helpers
  // ============================================================

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getStateBadge(state) {
    if (!state) return '<span class="badge badge-removed">Unknown</span>';
    const s = state.toLowerCase();
    if (s === 'active' || s === 'in progress' || s === 'committed') return `<span class="badge badge-active">${escapeHtml(state)}</span>`;
    if (s === 'new' || s === 'proposed') return `<span class="badge badge-new">${escapeHtml(state)}</span>`;
    if (s === 'resolved') return `<span class="badge badge-done">${escapeHtml(state)}</span>`;
    if (s === 'closed' || s === 'done') return `<span class="badge badge-done">${escapeHtml(state)}</span>`;
    if (s === 'testing' || s === 'in testing') return `<span class="badge badge-testing">${escapeHtml(state)}</span>`;
    if (s === 'removed') return `<span class="badge badge-removed">${escapeHtml(state)}</span>`;
    return `<span class="badge badge-pending">${escapeHtml(state)}</span>`;
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

  // ============================================================
  // Weekly Goal Helpers
  // ============================================================

  const WEEKLY_GOAL = 4;

  /** Returns Mon 00:00:00 … Sun 23:59:59 for the week containing `date`. */
  function getWeekBounds(date) {
    const d   = new Date(date);
    const day = d.getDay();                         // 0=Sun … 6=Sat
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { start: mon, end: sun };
  }

  function countInWeek(items, bounds) {
    return items.filter(item => {
      const c = new Date(item.fields['System.CreatedDate'] || 0);
      return c >= bounds.start && c <= bounds.end;
    }).length;
  }

  function renderWeeklyGoal(items) {
    const container = document.getElementById('wi-goal-container');
    if (!container) return;

    const thisWeek = getWeekBounds(new Date());
    const lastWeek = getWeekBounds(new Date(Date.now() - 7 * 86400000));

    const thisCount = countInWeek(items, thisWeek);
    const lastCount = countInWeek(items, lastWeek);

    const pct   = Math.min(thisCount / WEEKLY_GOAL * 100, 100);
    const done  = thisCount >= WEEKLY_GOAL;
    const delta = thisCount - lastCount;

    let deltaHtml = '';
    if (delta > 0) {
      deltaHtml = `<span class="wi-goal-delta positive">+${delta} from last week</span>`;
    } else if (delta < 0) {
      deltaHtml = `<span class="wi-goal-delta negative">${delta} from last week</span>`;
    } else {
      deltaHtml = `<span class="wi-goal-delta neutral">= last week</span>`;
    }

    // Mon dd – Sun dd label for this week
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekLabel = `${fmt(thisWeek.start)} – ${fmt(thisWeek.end)}`;

    container.innerHTML = `
      <div class="wi-goal-card">
        <div class="wi-goal-left">
          <div class="wi-goal-label">Weekly Goal</div>
          <div class="wi-goal-week-range">${weekLabel}</div>
        </div>
        <div class="wi-goal-center">
          <div class="wi-goal-counts">
            <span class="wi-goal-this ${done ? 'done' : ''}">${thisCount}/${WEEKLY_GOAL}</span>
            <span class="wi-goal-sep">✦</span>
            <span class="wi-goal-last">Last week: ${lastCount}</span>
          </div>
          <div class="wi-goal-bar-wrap">
            <div class="wi-goal-bar-fill ${done ? 'green' : 'amber'}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="wi-goal-right">
          ${deltaHtml}
          ${done ? '<span class="wi-goal-complete-badge">🎯 Goal hit!</span>' : ''}
        </div>
      </div>
    `;
  }

  function safeHtml(html) {
    if (!html) return '(No description)';
    // Strip potentially dangerous tags, keep text
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
               .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
               .replace(/on\w+="[^"]*"/gi, '')
               .replace(/on\w+='[^']*'/gi, '');
  }

  // ============================================================
  // Empower Hints
  // ============================================================

  const WI_EMPOWER_TIPS = {
    'exchange title':    { icon:'🏠', title:'Exchange Title',          tips:['Event sequence: 100 → 130 → 150 → 385 → 180','Event 130 not firing? Check title commitment received flag and vendor setup','Verify title vendor credentials in Empower › Settings › Vendors','Event 385 (Doc Draw) will not fire if PTD conditions are still open'] },
    'exchange appraisal':{ icon:'🏡', title:'Exchange Appraisal',      tips:['Appraisal order requires event 200 (Appraisal Ordered) to have fired','SoCal Direct uses a specific AMC panel — confirm panel assignment first','Verify UCDP submission settings for GSE delivery','Appraisal not returning? Check AMC vendor API credentials in Empower'] },
    'heloc':             { icon:'💳', title:'HELOC Loan Conditions',   tips:['HELOC milestone map differs from standard mortgage — verify event triggers','Use PTD conditions for pre-draw requirements; AWC for at-closing items','Credit line amount vs draw amount: confirm correct field mapping','Subordination agreement: track as a condition with a custom category'] },
    'conditions':        { icon:'📋', title:'Loan Conditions',         tips:['PTD = Prior to Documents · PTC = Prior to Closing · AWC = At and With Closing','Use condition set templates for repeatable groups across loan types','Automated condition triggers can be set on milestone events (e.g. 385)','Some conditions require a specific user role to clear — check clearing rules'] },
    'ptd':               { icon:'📑', title:'PTD (Prior to Docs)',     tips:['PTD conditions must be cleared before event 385 (Doc Draw) fires','Common PTD blockers: missing flood cert, title exam, or insurance binder','Link PTD conditions to the correct milestone in Empower condition management'] },
    'awc':               { icon:'✍️', title:'AWC (At & With Closing)', tips:['AWC conditions are collected at the closing table — ensure closing package is complete','Common AWC: hazard insurance dec page, HOA docs, final inspection cert','Verify the AWC list is transmitted to the settlement agent'] },
    'validation':        { icon:'✅', title:'Empower Validation',      tips:["Field-level validation rules live in the Business Rules Engine (BRE)",'Validation errors block milestone advancement — check the Validation Report tab',"Use Empower's field inspector to identify required fields per loan type"] },
    'docmagic':          { icon:'📝', title:'DocMagic',                tips:['DocMagic integration fires on event 385 (Doc Draw) — ensure the event is configured','Check DocMagic loan type mapping in Empower › Settings › Document Providers','Closing package discrepancies: verify fee tolerance settings in DocMagic portal'] },
    'docutech':          { icon:'🖊️', title:'DocuTech',               tips:['DocuTech uses a direct API; verify credentials in Empower › Document Providers','Check loan type and state-specific document package configuration','eSign package not generating? Confirm borrower email fields are populated'] },
    'xml':               { icon:'🔌', title:'XML / Data Exchange',     tips:['Validate XML structure against the Empower field mapping schema','Check export queue in Empower Admin for stuck or failed transmissions','Use the Data Audit Log to trace field-level changes during the XML export'] },
  };

  function getEmpowerHints(title, description) {
    const hay = ((title || '') + ' ' + (description || '')).toLowerCase();
    for (const [kw, data] of Object.entries(WI_EMPOWER_TIPS)) {
      if (hay.includes(kw)) return data;
    }
    return null;
  }

  async function renderSuggestedApproach(container, title, description) {
    // ── Step Inheritance: check knowledge base first ──
    const kbPatterns = window.KnowledgeEngine
      ? window.KnowledgeEngine.getPatternsForTopics(window.KnowledgeEngine.getTopics(title, description))
      : [];
    const inheritedSteps = kbPatterns.flatMap(p => p.steps || []).slice(0, 6);
    const informedBadge  = inheritedSteps.length
      ? `<div class="kb-informed-badge">✦ Informed by ${kbPatterns.length} past task${kbPatterns.length !== 1 ? 's' : ''}</div>`
      : '';

    container.innerHTML = `
      <div class="wi-hints-card wi-hints-claude">
        <div class="wi-hints-header">
          <span class="wi-hints-icon">💡</span>
          <span class="wi-hints-title">Suggested Approach</span>
        </div>
        ${informedBadge}
        <div class="wi-hints-body" style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:12px;">
          <span class="spinner"></span> Generating guidance…
        </div>
      </div>`;

    try {
      if (!window.api || !window.api.ai) throw new Error('AI unavailable');
      const priorContext = inheritedSteps.length
        ? `Previous similar tasks in this area had these successful steps: ${inheritedSteps.join('; ')}. Use these as a starting point and adapt for this specific task. `
        : '';
      const prompt = `${priorContext}This is a BSA work item at a mortgage company: "${title}" — ${(description || '').replace(/<[^>]+>/g, '').slice(0, 300)}. In exactly 3 short bullet points, suggest what steps a BSA should take to complete this task. Be practical and specific. Respond ONLY with the 3 bullets, one per line, each starting with "•".`;
      const resp = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      });
      const text = (resp && resp.content && resp.content[0] && resp.content[0].text) || '';
      const bullets = text.split('\n').filter(l => l.trim().startsWith('•')).map(l => escapeHtml(l.replace(/^•\s*/, '').trim()));
      if (bullets.length === 0) throw new Error('No bullets returned');
      container.querySelector('.wi-hints-body').innerHTML = bullets.map(b => `<div class="wi-hint-item claude-hint">• ${b}</div>`).join('');
    } catch (e) {
      container.querySelector('.wi-hints-body').innerHTML = `<div style="color:var(--text-muted);font-size:12px;">Could not generate guidance. Check your AI settings.</div>`;
    }
  }

  // ============================================================
  // Render
  // ============================================================

  function render(container) {
    _allItems = [];
    _selectedItem = null;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">Work Items</div>
        <div class="module-subtitle">TLE.Empower — Your assigned work items</div>
      </div>

      <div class="search-bar">
        <input type="search" id="wi-search-input" placeholder="Search work items by title…" />
        <button class="btn btn-primary" id="btn-wi-search">Search</button>
        <button class="btn btn-secondary active-filter-btn" id="btn-wi-mine" style="border-color:var(--accent);color:var(--accent);">My Items</button>
        <button class="btn btn-secondary" id="btn-wi-refresh">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 7 A5 5 0 1 0 5 2.5" stroke-linecap="round"/>
            <polyline points="2,4 2,7 5,7"/>
          </svg>
          Refresh
        </button>
        <button class="btn btn-secondary" id="btn-wi-reset-order" style="color:var(--text-muted);font-size:11px;" title="Clear manual drag order, restore AI ranking">↺ Reset Order</button>
        <button class="btn btn-secondary" id="btn-email-import" style="margin-left:auto;border-color:var(--green);color:var(--green);">
          📧 Import from Email
        </button>
      </div>

      <div id="wi-main-area" class="two-col" style="gap:16px;align-items:flex-start;">
        <div class="two-col-left" id="wi-list-col">
          <div id="wi-goal-container"></div>
          <div id="wi-list-area">
            <div class="loading-state"><span class="spinner"></span> Loading work items…</div>
          </div>
        </div>
        <div class="two-col-right" id="wi-detail-col" style="display:none;">
          <div id="wi-detail-panel" class="detail-panel"></div>
        </div>
      </div>
    `;

    // Event handlers
    document.getElementById('btn-wi-search').addEventListener('click', doSearch);
    document.getElementById('btn-wi-mine').addEventListener('click', loadMyItems);
    document.getElementById('btn-wi-refresh').addEventListener('click', loadMyItems);
    document.getElementById('wi-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
    document.getElementById('btn-email-import').addEventListener('click', showEmailImportModal);
    document.getElementById('btn-wi-reset-order').addEventListener('click', () => {
      localStorage.removeItem(PRIORITY_ORDER_KEY);
      loadMyItems();
    });

    loadMyItems();
  }

  // ============================================================
  // Load My Items
  // ============================================================

  async function loadMyItems() {
    const listArea = document.getElementById('wi-list-area');
    if (!listArea) return;
    listArea.innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading your work items…</div>';

    const settings = window.appSettings;
    if (!settings || !settings.adoPat) {
      listArea.innerHTML = `
        <div class="no-pat-banner">
          ⚠️ Configure your ADO PAT in Settings to connect.
          <button class="btn btn-secondary" style="margin-left:auto;" onclick="window.navigateTo('settings')">Open Settings</button>
        </div>
      `;
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

      if (!wiqlResult || !wiqlResult.workItems) throw new Error('No results from WIQL query.');

      const ids = wiqlResult.workItems.map(w => w.id);
      if (ids.length === 0) {
        listArea.innerHTML = '<div class="empty-state">No active work items assigned to you.</div>';
        _allItems = [];
        return;
      }

      const batchIds = ids.slice(0, 200);
      const batchResult = await window.adoFetch(
        `${project}/_apis/wit/workitems?ids=${batchIds.join(',')}&fields=System.Id,System.Title,System.State,System.WorkItemType,Microsoft.VSTS.Common.Priority,System.ChangedDate,System.AssignedTo,System.CreatedDate,System.Description,System.IterationPath,Microsoft.VSTS.Common.ResolvedBy&api-version=7.1`,
        'GET'
      );

      _allItems = (batchResult && batchResult.value) ? batchResult.value : [];
      renderItemList(_allItems, listArea);

    } catch (err) {
      listArea.innerHTML = `<div class="no-pat-banner">⚠️ ${escapeHtml(err.message)}</div>`;
    }
  }

  // ============================================================
  // Search
  // ============================================================

  async function doSearch() {
    const query = (document.getElementById('wi-search-input') || {}).value || '';
    const listArea = document.getElementById('wi-list-area');
    if (!listArea) return;

    if (!query.trim()) {
      loadMyItems();
      return;
    }

    listArea.innerHTML = '<div class="loading-state"><span class="spinner"></span> Searching…</div>';

    const settings = window.appSettings;
    if (!settings || !settings.adoPat) {
      listArea.innerHTML = '<div class="no-pat-banner">⚠️ ADO PAT required.</div>';
      return;
    }

    try {
      const project = settings.adoProject || 'TLE.Empower';
      const safeQuery = query.replace(/'/g, "''");
      const wiqlBody = {
        query: `SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType]
                FROM WorkItems
                WHERE [System.TeamProject]='${project}'
                AND [System.Title] CONTAINS '${safeQuery}'
                AND [System.State] NOT IN ('Removed')
                ORDER BY [System.ChangedDate] DESC`
      };

      const wiqlResult = await window.adoFetch(
        `${project}/_apis/wit/wiql?api-version=7.1`,
        'POST',
        wiqlBody
      );

      if (!wiqlResult || !wiqlResult.workItems) throw new Error('Search returned no results.');

      const ids = wiqlResult.workItems.slice(0, 100).map(w => w.id);
      if (ids.length === 0) {
        listArea.innerHTML = `<div class="empty-state">No work items found matching "${escapeHtml(query)}".</div>`;
        return;
      }

      const batchResult = await window.adoFetch(
        `${project}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Id,System.Title,System.State,System.WorkItemType,Microsoft.VSTS.Common.Priority,System.ChangedDate,System.AssignedTo,System.CreatedDate,System.Description,System.IterationPath&api-version=7.1`,
        'GET'
      );

      const items = (batchResult && batchResult.value) ? batchResult.value : [];
      renderItemList(items, listArea);

    } catch (err) {
      listArea.innerHTML = `<div class="no-pat-banner">⚠️ Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ============================================================
  // Render Item List
  // ============================================================

  function renderItemList(items, listArea) {
    if (!items || items.length === 0) {
      listArea.innerHTML = '<div class="empty-state">No work items found.</div>';
      return;
    }

    _displayItems = applyPriorityOrder(items);

    const html = _displayItems.map((item, idx) => {
      const id = item.id;
      const title = item.fields['System.Title'] || '(No Title)';
      const state = item.fields['System.State'] || '';
      const type = item.fields['System.WorkItemType'] || '';
      const stateClass = getStateBarClass(state);
      return `
        <div class="wi-item" data-id="${id}" data-idx="${idx}" draggable="false">
          <div class="wi-drag-handle" title="Drag to reorder">⠿</div>
          <div class="wi-state-bar ${stateClass}"></div>
          <span class="wi-item-id">#${id}</span>
          <span class="wi-item-title">${escapeHtml(title)}</span>
          <span class="wi-item-type">${escapeHtml(type)}</span>
          ${getStateBadge(state)}
        </div>
      `;
    }).join('');

    listArea.innerHTML = `<div class="wi-list">${html}</div>`;

    renderWeeklyGoal(_displayItems);
    setupDragAndDrop(listArea);

    // Attach click handlers
    listArea.querySelectorAll('.wi-item').forEach((el, idx) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.wi-drag-handle')) return;
        listArea.querySelectorAll('.wi-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        showDetail(_displayItems[idx]);
      });
    });
  }

  function setupDragAndDrop(listArea) {
    listArea.querySelectorAll('.wi-item').forEach((el) => {
      const taskId = el.dataset.id;
      const handle = el.querySelector('.wi-drag-handle');

      console.log(`Drag initialized on ${taskId}`);

      // ── Handle mousedown / mouseup ──────────────────────────────
      // Only enable draggable when the user grabs the handle,
      // so normal card clicks are never treated as drag attempts.
      if (handle) {
        handle.addEventListener('mousedown', () => {
          el.setAttribute('draggable', 'true');
        });
        handle.addEventListener('mouseup', () => {
          el.setAttribute('draggable', 'false');
        });
      }

      // ── dragstart ───────────────────────────────────────────────
      el.addEventListener('dragstart', (e) => {
        _draggedId = taskId;
        // setData is required for Chromium/Electron — drag silently fails without it
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
        el.classList.add('wi-dragging');
      });

      // ── dragend ─────────────────────────────────────────────────
      el.addEventListener('dragend', () => {
        el.setAttribute('draggable', 'false');
        el.classList.remove('wi-dragging');
        _draggedId = null;
        listArea.querySelectorAll('.wi-item').forEach(i => i.classList.remove('wi-drag-over'));
      });

      // ── dragover ────────────────────────────────────────────────
      el.addEventListener('dragover', (e) => {
        if (!_draggedId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        listArea.querySelectorAll('.wi-item').forEach(i => i.classList.remove('wi-drag-over'));
        el.classList.add('wi-drag-over');
      });

      // ── dragleave ───────────────────────────────────────────────
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('wi-drag-over');
      });

      // ── drop ────────────────────────────────────────────────────
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const srcId    = _draggedId || e.dataTransfer.getData('text/plain');
        const targetId = el.dataset.id;
        if (!srcId || srcId === targetId) return;

        const srcIdx    = _displayItems.findIndex(i => String(i.id) === String(srcId));
        const targetIdx = _displayItems.findIndex(i => String(i.id) === String(targetId));
        if (srcIdx === -1 || targetIdx === -1) return;

        const moved     = _displayItems.splice(srcIdx, 1)[0];
        // After the splice the array is one shorter; when moving forward the
        // original targetIdx is now one position past the desired slot.
        const insertIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
        _displayItems.splice(insertIdx, 0, moved);

        savePriorityOrder(_displayItems.map(i => i.id));
        console.log(`Priority reordered: ${srcId} moved to position ${insertIdx}`);
        renderItemList(_displayItems, listArea);
      });
    });
  }

  // ============================================================
  // Show Detail Panel
  // ============================================================

  function showDetail(item) {
    _selectedItem = item;
    const detailCol = document.getElementById('wi-detail-col');
    const detailPanel = document.getElementById('wi-detail-panel');
    const listCol = document.getElementById('wi-list-col');

    if (!detailCol || !detailPanel) return;

    // Show the two-column layout
    detailCol.style.display = '';
    if (listCol) {
      listCol.style.maxWidth = '50%';
    }

    const fields = item.fields || {};
    const id = item.id;
    const title = fields['System.Title'] || '(No Title)';
    const state = fields['System.State'] || '';
    const type = fields['System.WorkItemType'] || '';
    const assignee = fields['System.AssignedTo'] || {};
    const assigneeName = (typeof assignee === 'object' ? assignee.displayName : assignee) || '—';
    const created = formatDate(fields['System.CreatedDate']);
    const changed = formatDate(fields['System.ChangedDate']);
    const iteration = fields['System.IterationPath'] || '—';
    const description = fields['System.Description'] || '';
    const priority = fields['Microsoft.VSTS.Common.Priority'] || '—';

    detailPanel.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:8px;">
        <div>
          <div style="font-size:11px;color:var(--text-muted);font-family:monospace;margin-bottom:4px;">#${id}</div>
          <div style="font-size:16px;font-weight:600;color:var(--text-primary);line-height:1.3;">${escapeHtml(title)}</div>
        </div>
        <button class="btn btn-icon btn-secondary" title="Close" id="wi-detail-close" style="flex-shrink:0;">
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        ${getStateBadge(state)}
        <span class="badge badge-removed">${escapeHtml(type)}</span>
      </div>

      <div class="detail-field">
        <div class="detail-field-label">Assignee</div>
        <div class="detail-field-value">${escapeHtml(assigneeName)}</div>
      </div>

      <div class="detail-field">
        <div class="detail-field-label">Priority</div>
        <div class="detail-field-value">${escapeHtml(String(priority))}</div>
      </div>

      <div class="detail-field">
        <div class="detail-field-label">Iteration Path</div>
        <div class="detail-field-value">${escapeHtml(iteration)}</div>
      </div>

      <div class="detail-field">
        <div class="detail-field-label">Created</div>
        <div class="detail-field-value">${created}</div>
      </div>

      <div class="detail-field">
        <div class="detail-field-label">Last Changed</div>
        <div class="detail-field-value">${changed}</div>
      </div>

      <div class="detail-field">
        <div class="detail-field-label">Description</div>
        <div class="detail-field-value description" style="max-height:200px;overflow-y:auto;">
          ${description ? safeHtml(description) : '<span style="color:var(--text-muted);">(No description)</span>'}
        </div>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;">
        <button class="btn btn-secondary" id="wi-open-ado" style="font-size:12px;">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7"/><polyline points="8,1 11,1 11,4"/><line x1="5" y1="7" x2="11" y2="1"/></svg>
          Open in ADO
        </button>
        <button class="btn btn-secondary" id="wi-copy-ac" style="font-size:12px;">📋 Copy AC</button>
      </div>
    `;

    // Wire up close button
    document.getElementById('wi-detail-close').addEventListener('click', () => {
      detailCol.style.display = 'none';
      if (listCol) listCol.style.maxWidth = '';
      document.querySelectorAll('.wi-item').forEach(i => i.classList.remove('selected'));
    });

    // Open in ADO
    document.getElementById('wi-open-ado').addEventListener('click', () => {
      const org = (window.appSettings || {}).adoOrg || 'TheLoanExchange';
      const proj = (window.appSettings || {}).adoProject || 'TLE.Empower';
      window.api.shell.openExternal(`https://dev.azure.com/${org}/${proj}/_workitems/edit/${id}`);
    });

    // Copy AC to clipboard (with AC Library modal)
    document.getElementById('wi-copy-ac').addEventListener('click', () => {
      const ac     = (item.fields?.['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '').trim();
      const topics = window.KnowledgeEngine?.getTopics(title, description) || [];
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

    // Empower hints OR Claude suggested approach
    const hintsContainer = document.createElement('div');
    hintsContainer.style.marginTop = '16px';
    detailPanel.appendChild(hintsContainer);

    const empowerHints = getEmpowerHints(title, description);
    if (empowerHints) {
      hintsContainer.innerHTML = `
        <div class="wi-hints-card wi-hints-empower">
          <div class="wi-hints-header">
            <span class="wi-hints-icon">${empowerHints.icon}</span>
            <span class="wi-hints-title">${escapeHtml(empowerHints.title)} — Co-Pilot Tips</span>
          </div>
          <div class="wi-hints-body">
            ${empowerHints.tips.map(t => `<div class="wi-hint-item">${escapeHtml(t)}</div>`).join('')}
          </div>
        </div>`;
    } else {
      renderSuggestedApproach(hintsContainer, title, description);
    }

    // ── Knowledge Engine: related tasks + blocker warnings ──
    if (window.KnowledgeEngine) {
      const kbContainer = document.createElement('div');
      kbContainer.style.marginTop = '10px';
      detailPanel.appendChild(kbContainer);
      window.KnowledgeEngine.renderRelatedTasksCard(kbContainer, id, title, description);
    }

    // ── Empower Screen Mapper (Feature 4) ──
    if (window.EmpowerScreens) {
      const screensEl = document.createElement('div');
      screensEl.style.marginTop = '12px';
      detailPanel.appendChild(screensEl);
      window.EmpowerScreens.renderSection(screensEl, item);
    }
  }

  // ============================================================
  // Email Context Storage
  // ============================================================

  const EMAIL_CONTEXT_KEY = 'bsa-email-context';

  function saveEmailContext(workItemId, data) {
    try {
      const store = JSON.parse(localStorage.getItem(EMAIL_CONTEXT_KEY) || '{}');
      store[workItemId] = data;
      localStorage.setItem(EMAIL_CONTEXT_KEY, JSON.stringify(store));
    } catch (e) { /* silent */ }
  }

  // ============================================================
  // Email Import Modal — Step 1: Paste
  // ============================================================

  function showEmailImportModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'email-import-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:680px;width:92%;">
        <div class="modal-header">
          <div class="modal-title">📧 Import from Outlook</div>
          <button class="btn btn-icon btn-secondary" id="email-modal-close" style="font-size:18px;line-height:1;">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Paste the full email (Subject, From, and body)</label>
            <textarea id="email-paste-area" rows="13" style="font-family:monospace;font-size:12px;resize:vertical;" placeholder="Subject: Exchange Title – New Condition Request&#10;From: neil.pham@theloanexchange.com&#10;&#10;Hi Meher,&#10;&#10;We need to add a new condition for…"></textarea>
          </div>
          <div id="email-parse-status" style="font-size:12px;color:var(--text-muted);min-height:18px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="email-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-parse-email">Parse with AI ✨</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEmailImportModal(); });
    document.getElementById('email-modal-close').addEventListener('click', closeEmailImportModal);
    document.getElementById('email-modal-cancel').addEventListener('click', closeEmailImportModal);
    document.getElementById('btn-parse-email').addEventListener('click', () => {
      const text = (document.getElementById('email-paste-area') || {}).value || '';
      if (!text.trim()) { window.showToast('Paste the email content first.', 'error'); return; }
      parseEmailWithAI(text);
    });
  }

  function closeEmailImportModal() {
    const el = document.getElementById('email-import-overlay');
    if (el) el.remove();
  }

  // ============================================================
  // AI Email Parser
  // ============================================================

  async function parseEmailWithAI(emailText) {
    const statusEl = document.getElementById('email-parse-status');
    const btn      = document.getElementById('btn-parse-email');

    if (statusEl) statusEl.textContent = 'Parsing with AI…';
    if (btn)      btn.disabled = true;

    const system = `You are a BSA analyst at The Loan Exchange extracting ADO work item details from an email.

Empower LOS context:
- Exchange Title: title processing (events 100=Order,130=Endorse,150=Search,180=Prelim,385=Policy)
- Exchange Appraisal SoCal Direct: appraisal order workflow
- HELOC Loan Conditions: home equity loan condition processing
- Screens: EX02 (exchange setup), DM02 (doc management), MU01/MU02/MU03 (multi-user)

Return ONLY valid JSON — no markdown, no explanation:
{
  "title": "concise ADO task title under 80 chars",
  "description": "full description for the work item as HTML using <p> and <ul> tags",
  "type": "User Story",
  "priority": 2,
  "requester": "full name",
  "requesterEmail": "email or empty string",
  "isChangeRequest": false,
  "changeRequestSearchTerm": "keyword to find existing item if change request, else empty string",
  "empowerContext": "brief note on which Empower module this touches, or empty string",
  "summary": "one sentence summary"
}
Priority: 1=Critical/blocking, 2=High/this sprint, 3=Medium/backlog, 4=Low
Type choices: User Story, Bug, Task, Feature`;

    try {
      const response = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        system,
        messages: [{ role: 'user', content: `Parse this email into an ADO work item:\n\n${emailText}` }]
      });

      const text = (response.content?.[0]?.text || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

      const parsed = JSON.parse(jsonMatch[0]);
      parsed._rawEmail = emailText;

      closeEmailImportModal();

      // For change requests: search ADO for matching items
      if (parsed.isChangeRequest && parsed.changeRequestSearchTerm) {
        if (statusEl) statusEl.textContent = 'Searching ADO for matching items…';
        parsed._matchingItems = await findMatchingWorkItems(parsed.changeRequestSearchTerm);
      }

      showReviewForm(parsed);

    } catch (err) {
      if (statusEl) {
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = '✗ ' + err.message;
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  }

  // ============================================================
  // ADO Search for Change Request Matching
  // ============================================================

  async function findMatchingWorkItems(searchTerm) {
    try {
      const settings = window.appSettings;
      if (!settings || !settings.adoPat) return [];
      const project = settings.adoProject || 'TLE.Empower';
      const safe = searchTerm.replace(/'/g, "''");
      const wiqlResult = await window.adoFetch(
        `${project}/_apis/wit/wiql?api-version=7.1`,
        'POST',
        { query: `SELECT [System.Id],[System.Title],[System.State] FROM WorkItems WHERE [System.TeamProject]='${project}' AND [System.Title] CONTAINS '${safe}' AND [System.State] NOT IN ('Removed','Closed') ORDER BY [System.ChangedDate] DESC` }
      );
      if (!wiqlResult || !wiqlResult.workItems || wiqlResult.workItems.length === 0) return [];
      const ids = wiqlResult.workItems.slice(0, 5).map(w => w.id);
      const batch = await window.adoFetch(
        `${project}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Id,System.Title,System.State&api-version=7.1`,
        'GET'
      );
      return (batch && batch.value) ? batch.value : [];
    } catch (e) { return []; }
  }

  // ============================================================
  // Review Form — Step 2: Edit & Confirm
  // ============================================================

  function showReviewForm(parsed) {
    const isChange = !!parsed.isChangeRequest;
    const matches  = parsed._matchingItems || [];

    const changeRequestBanner = isChange ? `
      <div style="background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.35);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;">
        <div style="font-weight:600;color:#ffaa00;margin-bottom:6px;">⚠️ Change Request Detected</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:${matches.length ? '10px' : '0'};">
          AI identified this as a change to an existing requirement.
        </div>
        ${matches.length ? `
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Possible matching work items</div>
          ${matches.map(m => `
            <div class="wi-item" style="cursor:pointer;padding:6px 10px;margin-bottom:4px;border-radius:4px;"
              onclick="window.api.shell.openExternal('https://dev.azure.com/TheLoanExchange/TLE.Empower/_workitems/edit/${m.id}')">
              <span class="wi-item-id">#${m.id}</span>
              <span class="wi-item-title">${escapeHtml((m.fields || {})['System.Title'] || '')}</span>
              ${getStateBadge((m.fields || {})['System.State'] || '')}
            </div>
          `).join('')}
        ` : '<div style="font-size:12px;color:var(--text-muted);">No closely matching items found — may be a new related item.</div>'}
      </div>` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'email-review-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:720px;width:94%;max-height:92vh;overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title">📋 Review Extracted Task</div>
          <button class="btn btn-icon btn-secondary" id="review-modal-close" style="font-size:18px;line-height:1;">×</button>
        </div>
        <div class="modal-body">
          ${changeRequestBanner}

          ${parsed.empowerContext ? `
            <div style="font-size:12px;color:var(--accent);background:rgba(88,166,255,0.07);border:1px solid rgba(88,166,255,0.2);border-radius:var(--radius);padding:8px 12px;margin-bottom:14px;">
              🔧 Empower: ${escapeHtml(parsed.empowerContext)}
            </div>` : ''}

          ${parsed.summary ? `
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;font-style:italic;">
              "${escapeHtml(parsed.summary)}"
            </div>` : ''}

          <div class="form-group">
            <label>Title</label>
            <input type="text" id="review-title" value="${escapeHtml(parsed.title || '')}" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>Work Item Type</label>
              <select id="review-type">
                <option value="User Story"${parsed.type === 'User Story' ? ' selected' : ''}>User Story</option>
                <option value="Bug"${parsed.type === 'Bug' ? ' selected' : ''}>Bug</option>
                <option value="Task"${parsed.type === 'Task' ? ' selected' : ''}>Task</option>
                <option value="Feature"${parsed.type === 'Feature' ? ' selected' : ''}>Feature</option>
              </select>
            </div>
            <div class="form-group">
              <label>Priority</label>
              <select id="review-priority">
                <option value="1"${parsed.priority === 1 ? ' selected' : ''}>1 — Critical</option>
                <option value="2"${parsed.priority === 2 ? ' selected' : ''}>2 — High</option>
                <option value="3"${parsed.priority === 3 ? ' selected' : ''}>3 — Medium</option>
                <option value="4"${parsed.priority === 4 ? ' selected' : ''}>4 — Low</option>
              </select>
            </div>
            <div class="form-group">
              <label>Requester Name</label>
              <input type="text" id="review-requester" value="${escapeHtml(parsed.requester || '')}" />
            </div>
          </div>

          <div class="form-group">
            <label>Requester Email</label>
            <input type="email" id="review-requester-email" value="${escapeHtml(parsed.requesterEmail || '')}" placeholder="email@theloanexchange.com" />
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea id="review-description" rows="8" style="font-size:12px;resize:vertical;">${escapeHtml(parsed.description || '')}</textarea>
          </div>

          <div id="review-status" style="font-size:12px;min-height:18px;margin-top:2px;"></div>
        </div>

        <div class="modal-footer" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-secondary" id="review-cancel">Cancel</button>
          ${isChange ? `<button class="btn btn-secondary" id="btn-draft-impact">📄 Draft Impact Email</button>` : ''}
          <button class="btn btn-secondary" id="btn-create-only">Create in ADO</button>
          <button class="btn btn-primary" id="btn-create-tbd">Create + Draft TBD Email</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReviewModal(); });
    document.getElementById('review-modal-close').addEventListener('click', closeReviewModal);
    document.getElementById('review-cancel').addEventListener('click', closeReviewModal);
    document.getElementById('btn-create-only').addEventListener('click', () => submitNewWorkItem(parsed, false));
    document.getElementById('btn-create-tbd').addEventListener('click', () => submitNewWorkItem(parsed, true));
    if (isChange) {
      document.getElementById('btn-draft-impact').addEventListener('click', () => draftImpactAssessment(parsed));
    }
  }

  function closeReviewModal() {
    const el = document.getElementById('email-review-overlay');
    if (el) el.remove();
  }

  // ============================================================
  // Create Work Item in ADO
  // ============================================================

  async function submitNewWorkItem(parsed, sendTbd) {
    const statusEl = document.getElementById('review-status');
    const btnTbd   = document.getElementById('btn-create-tbd');
    const btnOnly  = document.getElementById('btn-create-only');

    const title          = ((document.getElementById('review-title') || {}).value || parsed.title || '').trim();
    const type           = (document.getElementById('review-type') || {}).value || 'User Story';
    const priority       = parseInt((document.getElementById('review-priority') || {}).value || '2', 10);
    const description    = (document.getElementById('review-description') || {}).value || parsed.description || '';
    const requester      = (document.getElementById('review-requester') || {}).value || parsed.requester || '';
    const requesterEmail = (document.getElementById('review-requester-email') || {}).value || parsed.requesterEmail || '';

    if (!title) { window.showToast('Title is required.', 'error'); return; }

    if (statusEl) { statusEl.style.color = 'var(--text-muted)'; statusEl.textContent = 'Creating work item in ADO…'; }
    if (btnTbd)  btnTbd.disabled = true;
    if (btnOnly) btnOnly.disabled = true;

    try {
      const settings = window.appSettings;
      const project = (settings || {}).adoProject || 'TLE.Empower';

      const patchBody = [
        { op: 'add', path: '/fields/System.Title',                      value: title },
        { op: 'add', path: '/fields/System.Description',                value: description },
        { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority',    value: priority },
        { op: 'add', path: '/fields/System.Tags',                       value: 'Email Import' }
      ];

      const url = `https://dev.azure.com/TheLoanExchange/${project}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`;
      const result = await window.api.ado.request('POST', url, settings.adoPat, patchBody, 'application/json-patch+json');

      if (result && result.error) throw new Error(result.error);

      const newId = result && result.id;

      if (newId) {
        saveEmailContext(newId, {
          rawEmail:       parsed._rawEmail,
          requester,
          requesterEmail,
          summary:        parsed.summary,
          importedAt:     new Date().toISOString(),
          isChangeRequest: parsed.isChangeRequest
        });
        seedFollowUpTimeline(newId, title, requester, requesterEmail, parsed._rawEmail, parsed.summary);
      }

      closeReviewModal();
      window.showToast(`✓ Work item #${newId} created!`, 'success');
      window.awardXP('task_created', 'Work item imported from email');
      try { window.Sounds && window.Sounds.complete(); } catch (e) {}

      if (sendTbd) {
        if (requesterEmail) {
          setTimeout(() => draftTbdEmail(requester, requesterEmail, title, priority), 300);
        } else {
          window.showToast('No requester email found — TBD draft skipped.', 'info');
        }
      }

      loadMyItems();

    } catch (err) {
      if (statusEl) { statusEl.style.color = 'var(--red)'; statusEl.textContent = '✗ ' + err.message; }
      if (btnTbd)  btnTbd.disabled = false;
      if (btnOnly) btnOnly.disabled = false;
    }
  }

  // ============================================================
  // Seed Follow-Up Timeline from Original Email
  // ============================================================

  function seedFollowUpTimeline(workItemId, title, requester, requesterEmail, rawEmail, summary) {
    try {
      const FOLLOWUP_KEY = 'bsa-followup-items';
      const items = JSON.parse(localStorage.getItem(FOLLOWUP_KEY) || '[]');
      if (items.some(i => i.workItemId === String(workItemId))) return;

      items.push({
        id:             'fu-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        workItemId:     String(workItemId),
        workItemTitle:  title,
        waitingOn:      requester,
        waitingOnEmail: requesterEmail,
        status:         'waiting',
        addedAt:        new Date().toISOString(),
        lastContactAt:  null,
        notes:          summary || '',
        timeline: [{
          type:    'email_received',
          date:    new Date().toISOString(),
          label:   'Original email request',
          preview: rawEmail.slice(0, 400) + (rawEmail.length > 400 ? '…' : '')
        }]
      });

      localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(items));
    } catch (e) { /* silent */ }
  }

  // ============================================================
  // TBD Acknowledgment Email
  // ============================================================

  function draftTbdEmail(requester, requesterEmail, title, priority) {
    const timelines = { 1: '24 hours', 2: '2–3 business days', 3: '5 business days', 4: '2 weeks' };
    const eta = timelines[priority] || '5 business days';
    const firstName = requester.split(' ')[0] || requester;
    const userName = (window.appSettings || {}).userName || 'Meher Viguturi';

    const subject = encodeURIComponent(`RE: ${title} — Request Received (Requirements TBD)`);
    const body = encodeURIComponent(
`Hi ${firstName},

Thank you for reaching out. I wanted to confirm that I have received your request regarding:

"${title}"

I am currently reviewing the requirements and will follow up with a detailed analysis and timeline within ${eta}.

If you have any additional context or supporting documentation in the meantime, please feel free to send it my way.

Best regards,
${userName}
Business Systems Analyst — The Loan Exchange`
    );

    window.api.shell.openExternal(`mailto:${requesterEmail}?subject=${subject}&body=${body}`);
  }

  // ============================================================
  // Impact Assessment Draft (Change Requests)
  // ============================================================

  async function draftImpactAssessment(parsed) {
    const btn = document.getElementById('btn-draft-impact');
    if (btn) { btn.disabled = true; btn.textContent = 'Drafting…'; }

    const title          = ((document.getElementById('review-title') || {}).value || parsed.title || '').trim();
    const requester      = (document.getElementById('review-requester') || {}).value || parsed.requester || '';
    const requesterEmail = (document.getElementById('review-requester-email') || {}).value || parsed.requesterEmail || '';
    const matches        = parsed._matchingItems || [];

    const system = `You are a BSA at The Loan Exchange writing a professional impact assessment email for a change request in TLE.Empower.
Write a concise email that: acknowledges the change request, summarizes what will change, notes downstream Empower impacts (title processing, document management, conditions, screen flows), provides a realistic timeline estimate, and lists open questions.
Under 300 words. Professional BSA tone. Plain text, no markdown.`;

    const prompt = `Write an impact assessment email for this change request.
Title: ${title}
Requester: ${requester}
Matching existing items: ${matches.map(m => `#${m.id} – ${(m.fields || {})['System.Title'] || ''}`).join(', ') || 'none found'}

Original request:
${parsed._rawEmail}`;

    try {
      const response = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        system,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content?.[0]?.text || '';
      const subject = encodeURIComponent(`RE: ${title} — Impact Assessment`);
      const body    = encodeURIComponent(text);

      window.api.shell.openExternal(`mailto:${requesterEmail}?subject=${subject}&body=${body}`);
      window.showToast('Impact assessment draft opened in Outlook.', 'success');
    } catch (err) {
      window.showToast('Draft failed: ' + err.message, 'error');
    }

    if (btn) { btn.disabled = false; btn.textContent = '📄 Draft Impact Email'; }
  }

  // ============================================================
  // Self-register
  // ============================================================

  window.Modules = window.Modules || {};
  window.Modules.workitems = {
    render,
    cleanup() {
      _allItems = [];
      _selectedItem = null;
    },
    getContext() {
      if (!_selectedItem) {
        return {
          'Screen': 'Work Items list',
          'Items loaded': _displayItems.length,
        };
      }
      const f = _selectedItem.fields || {};
      const assignee = f['System.AssignedTo'];
      const assigneeName = (typeof assignee === 'object' ? assignee?.displayName : assignee) || 'Unassigned';
      const desc = (f['System.Description'] || '').replace(/<[^>]+>/g, '').trim().slice(0, 400);
      return {
        'Selected task ID':    `#${_selectedItem.id}`,
        'Title':               f['System.Title'] || '',
        'State':               f['System.State'] || '',
        'Type':                f['System.WorkItemType'] || '',
        'Assigned to':         assigneeName,
        'Iteration':           f['System.IterationPath'] || '',
        'Description (first 400 chars)': desc || '(none)',
      };
    }
  };

})();
