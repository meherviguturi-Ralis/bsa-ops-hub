/* ============================================================
   BSA Ops Hub — My Tracking Module
   Tracks every work item Meher has touched through full lifecycle
   ============================================================ */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────
  let _allItems      = [];
  let _selectedItem  = null;
  let _searchQuery   = '';
  let _activeFilter  = 'all';   // all | inprogress | handedoff | done
  let _sortBy        = 'recent'; // recent | created | priority
  let _loading       = false;
  let _refreshTimer  = null;
  let _prevStateMap  = {};       // id → state, for change detection
  let _trackingView  = localStorage.getItem('bsa-tracking-view') || 'standard'; // standard | business

  // ── Business View Lane Classification ───────────────────────────
  const BIZ_LANES = [
    { key:'business', icon:'🏢', label:'BUSINESS', badge:'With Business', color:'#4A9EFF' },
    { key:'bsa',      icon:'📋', label:'BSA',      badge:'With BSA',      color:'#A78BFA' },
    { key:'dev',      icon:'🧑‍💻', label:'DEV',      badge:'With Dev',      color:'#d29922' },
    { key:'tester',   icon:'🧪', label:'TESTER',   badge:'With Tester',   color:'#2dd4bf' },
    { key:'closed',   icon:'✅', label:'CLOSED',    badge:'Closed',        color:'#3fb950' },
  ];

  function classifyBizLane(item) {
    const s = (item.fields?.['System.State'] || '').toLowerCase();
    const assignedTo = item.fields?.['System.AssignedTo'];
    const assignedName = ((typeof assignedTo === 'object' ? assignedTo?.displayName : assignedTo) || '').toLowerCase();
    if (['closed','resolved','done','completed'].some(k => s === k || s.includes(k))) return 'closed';
    if (['testing','uat','with tester','qa'].some(k => s.includes(k))) return 'tester';
    if (['in review','with dev','development'].some(k => s.includes(k)) || assignedName.includes('paul')) return 'dev';
    if (['active','pm/bsa','in progress'].some(k => s.includes(k)) || assignedName.includes('meher')) return 'bsa';
    if (s === 'new' || s === 'proposed' || !assignedName) return 'business';
    return 'bsa';
  }

  function bizCardHTML(item, laneKey) {
    const f = item.fields || {};
    const sel = _selectedItem?.id === item.id ? ' trk-card-sel' : '';
    const stage = { business:0, bsa:1, dev:2, tester:3, closed:4 }[laneKey] || 0;
    const dots = Array(5).fill(0).map((_,i) =>
      `<span style="color:${i<=stage?'var(--accent)':'var(--border-default)'};">●</span>`
    ).join('');
    const daysInLane = timeDays(f['System.ChangedDate']);
    return `<div class="trk-card${sel}" data-id="${item.id}" tabindex="0">
  <div class="trk-card-top">
    <span class="trk-card-id">#${item.id}</span>
    <span style="font-size:9px;color:var(--text-muted);">${daysInLane}d in lane</span>
  </div>
  <div class="trk-card-title">${esc(f['System.Title'] || '(No Title)')}</div>
  <div style="margin-top:4px;display:flex;gap:3px;font-size:11px;letter-spacing:1px;">${dots}</div>
</div>`;
  }

  function businessColumnsHTML(items) {
    return BIZ_LANES.map(lane => {
      const col = items.filter(i => classifyBizLane(i) === lane.key);
      return `<div class="trk-col" style="border-top:3px solid ${lane.color};min-width:0;">
  <div class="trk-col-hd">
    <span class="trk-col-label">${lane.icon} ${lane.label}</span>
    <span class="trk-col-badge" style="background:${lane.color}22;color:${lane.color};border:1px solid ${lane.color}44;">${col.length}</span>
  </div>
  <div style="font-size:9px;color:${lane.color};margin:-4px 0 6px;text-transform:uppercase;letter-spacing:0.05em;">${lane.badge}</div>
  <div class="trk-cards">
    ${col.length ? col.map(i => bizCardHTML(i, lane.key)).join('') : '<div class="trk-no-items">No items</div>'}
  </div>
</div>`;
    }).join('');
  }

  // ── Classification ───────────────────────────────────────────────
  function classifyItem(item) {
    const s = (item.fields?.['System.State'] || '').toLowerCase();
    if (['closed','resolved','done','completed'].some(k => s === k || s.includes(k))) return 'done';
    if (['in review','with dev','development','testing','uat','on hold','with tester','qa'].some(k => s.includes(k))) return 'handedoff';
    return 'inprogress';
  }

  function getHandoffStage(item) {
    const s = (item.fields?.['System.State'] || '').toLowerCase();
    if (['closed','resolved','done','completed'].some(k => s === k || s.includes(k))) return 3;
    if (s.includes('test') || s.includes('qa') || s.includes('uat')) return 2;
    if (s.includes('dev') || s.includes('review') || s.includes('development')) return 1;
    return 0;
  }

  function getWhoWith(item) {
    const stage = getHandoffStage(item);
    if (stage === 3) return '✅ Closed';
    if (stage === 2) return '🧪 With Tester';
    if (stage === 1) return '🧑‍💻 With Dev';
    return '📝 With BSA';
  }

  // ── Time helpers ────────────────────────────────────────────────
  function timeSince(dateStr) {
    if (!dateStr) return '—';
    const diff  = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    if (mins  <  60) return `${mins}m ago`;
    if (hours <  24) return `${hours}h ago`;
    if (days  <   7) return `${days} day${days !== 1 ? 's' : ''}`;
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }

  function timeDays(fromStr, toStr) {
    const from = new Date(fromStr);
    const to   = toStr ? new Date(toStr) : new Date();
    return Math.max(0, Math.round((to - from) / 86400000));
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch (e) { return dateStr; }
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── ADO fetch ───────────────────────────────────────────────────
  async function fetchItems(silent = false) {
    if (_loading) return;
    _loading = true;
    if (!silent) setSyncState(true);

    try {
      const wiql = {
        query: `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo],
  [System.CreatedBy], [System.ChangedDate], [System.CreatedDate],
  [Microsoft.VSTS.Common.Priority]
FROM WorkItems
WHERE [System.TeamProject] = 'TLE.Empower'
  AND (
    [System.AssignedTo] = @me
    OR [System.CreatedBy] = @me
  )
  AND [System.ChangedDate] >= @today - 60
  AND [System.State] NOT IN ('Removed', 'Deleted', 'Cancelled', 'Canceled', 'Won''t Fix')
ORDER BY [System.ChangedDate] DESC`
      };

      const wiqlResult = await window.adoFetch(
        'TLE.Empower/_apis/wit/wiql?api-version=7.0',
        'POST', wiql, 'application/json'
      );

      if (!wiqlResult.workItems?.length) {
        _allItems = [];
        if (!silent) { renderAll(); updateSidebarBadge(0); }
        return;
      }

      const ids = wiqlResult.workItems.map(w => w.id).slice(0, 200);

      const batch = await window.adoFetch(
        'TLE.Empower/_apis/wit/workitemsbatch?api-version=7.0',
        'POST',
        {
          ids,
          fields: [
            'System.Id','System.Title','System.State',
            'System.AssignedTo','System.CreatedBy',
            'System.ChangedDate','System.CreatedDate',
            'System.WorkItemType','System.IterationPath',
            'System.Description','Microsoft.VSTS.Common.Priority'
          ]
        },
        'application/json'
      );

      const REMOVED_STATES = ['removed','deleted','cancelled','canceled',"won't fix",'wont fix'];
      const newItems = (batch.value || []).filter(i => {
        const s = (i.fields?.['System.State'] || '').toLowerCase().trim();
        return !REMOVED_STATES.includes(s);
      });

      // ── Change detection (for auto-refresh toasts) ────────────
      if (silent && Object.keys(_prevStateMap).length > 0) {
        newItems.forEach(item => {
          const prev  = _prevStateMap[item.id];
          const curr  = item.fields?.['System.State'];
          const title = item.fields?.['System.Title'] || `#${item.id}`;
          if (prev && curr && prev !== curr) {
            window.showToast?.(`📍 ${title} → ${curr}`, 'info');
          }
        });
      }

      // Store state snapshot
      _prevStateMap = {};
      newItems.forEach(i => { _prevStateMap[i.id] = i.fields?.['System.State']; });

      _allItems = newItems;
      updateSidebarBadge(_allItems.length);
      if (!silent) renderAll();
      else {
        // Silent refresh: just re-render columns if on screen
        if (document.getElementById('trk-main')) renderAll();
      }

    } catch (err) {
      if (!silent) showError(err.message);
    } finally {
      _loading = false;
      setSyncState(false);
    }
  }

  // ── Auto-refresh (every 5 min) ──────────────────────────────────
  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => fetchItems(true), 5 * 60 * 1000);
  }

  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }

  // ── Filter + Sort ───────────────────────────────────────────────
  function getFiltered() {
    let items = _allItems.slice();

    if (_activeFilter !== 'all') {
      items = items.filter(i => classifyItem(i) === _activeFilter);
    }

    if (_searchQuery.trim()) {
      const q = _searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.fields?.['System.Title'] || '').toLowerCase().includes(q) ||
        String(i.id).includes(q)
      );
    }

    if (_sortBy === 'recent') {
      items.sort((a,b) => new Date(b.fields?.['System.ChangedDate']||0) - new Date(a.fields?.['System.ChangedDate']||0));
    } else if (_sortBy === 'created') {
      items.sort((a,b) => new Date(b.fields?.['System.CreatedDate']||0) - new Date(a.fields?.['System.CreatedDate']||0));
    } else if (_sortBy === 'priority') {
      items.sort((a,b) => (a.fields?.['Microsoft.VSTS.Common.Priority']||99) - (b.fields?.['Microsoft.VSTS.Common.Priority']||99));
    }

    return items;
  }

  // ── Stats ───────────────────────────────────────────────────────
  function computeStats(items) {
    const total      = items.length;
    const withDev    = items.filter(i => getHandoffStage(i) === 1).length;
    const withTester = items.filter(i => getHandoffStage(i) === 2).length;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const closedThisMonth = items.filter(i => {
      if (classifyItem(i) !== 'done') return false;
      return new Date(i.fields?.['System.ChangedDate'] || 0) >= monthStart;
    }).length;
    const doneItems = items.filter(i => classifyItem(i) === 'done' && i.fields?.['System.CreatedDate']);
    const avgDays = doneItems.length
      ? Math.round(doneItems.reduce((s,i) => s + timeDays(i.fields['System.CreatedDate'], i.fields['System.ChangedDate']), 0) / doneItems.length)
      : null;
    return { total, withDev, withTester, closedThisMonth, avgDays };
  }

  // ── Timeline dots ────────────────────────────────────────────────
  function timelineDots(stage) {
    const steps = ['BSA','Dev','Test','Done'];
    return `<div class="trk-dots">${steps.map((lbl,i) => `
      <div class="trk-dot-step">
        <div class="trk-dot ${i <= stage ? 'trk-dot-on' : ''}"></div>
        <span class="trk-dot-lbl">${lbl}</span>
      </div>${i < steps.length - 1 ? '<div class="trk-dot-conn' + (i < stage ? ' trk-dot-conn-on' : '') + '"></div>' : ''}`
    ).join('')}</div>`;
  }

  // ── Card HTML ────────────────────────────────────────────────────
  function cardHTML(item) {
    const f     = item.fields || {};
    const lane  = classifyItem(item);
    const stage = getHandoffStage(item);
    const sel   = _selectedItem?.id === item.id ? ' trk-card-sel' : '';

    return `<div class="trk-card trk-card-${lane}${sel}" data-id="${item.id}" tabindex="0">
  <div class="trk-card-top">
    <span class="trk-card-id">#${item.id}</span>
    <span class="trk-card-state">${esc(f['System.State'] || '')}</span>
  </div>
  <div class="trk-card-title">${esc(f['System.Title'] || '(No Title)')}</div>
  <div class="trk-card-meta">
    <span class="trk-who">${esc(getWhoWith(item))}</span>
    <span class="trk-since">${timeSince(f['System.ChangedDate'])}</span>
  </div>
  ${timelineDots(stage)}
</div>`;
  }

  // ── Column HTML ──────────────────────────────────────────────────
  function columnHTML(label, lane, items) {
    const col = items.filter(i => classifyItem(i) === lane);
    return `<div class="trk-col trk-col-${lane}">
  <div class="trk-col-hd">
    <span class="trk-col-label">${label}</span>
    <span class="trk-col-badge trk-badge-${lane}">${col.length}</span>
  </div>
  <div class="trk-cards" id="trk-cards-${lane}">
    ${col.length ? col.map(cardHTML).join('') : '<div class="trk-no-items">No items</div>'}
  </div>
</div>`;
  }

  // ── Stats bar HTML ───────────────────────────────────────────────
  function statsBarHTML(items) {
    const s = computeStats(items);
    return `<div class="trk-stats">
  <div class="trk-stat"><span class="trk-sv">${s.total}</span><span class="trk-sl">Tracked</span></div>
  <div class="trk-stat-sep"></div>
  <div class="trk-stat"><span class="trk-sv trk-sv-amber">${s.withDev}</span><span class="trk-sl">With Dev</span></div>
  <div class="trk-stat-sep"></div>
  <div class="trk-stat"><span class="trk-sv trk-sv-amber">${s.withTester}</span><span class="trk-sl">With Tester</span></div>
  <div class="trk-stat-sep"></div>
  <div class="trk-stat"><span class="trk-sv trk-sv-green">${s.closedThisMonth}</span><span class="trk-sl">Closed this month</span></div>
  <div class="trk-stat-sep"></div>
  <div class="trk-stat"><span class="trk-sv">${s.avgDays !== null ? s.avgDays + 'd' : '—'}</span><span class="trk-sl">Avg close time</span></div>
</div>`;
  }

  // ── Toolbar HTML ─────────────────────────────────────────────────
  function toolbarHTML() {
    const filters = [
      { key: 'all',        label: 'All' },
      { key: 'inprogress', label: 'In Progress' },
      { key: 'handedoff',  label: 'Handed Off' },
      { key: 'done',       label: 'Done' },
    ];
    return `<div class="trk-toolbar">
  <div class="trk-view-toggle">
    <button class="trk-view-btn${_trackingView==='standard'?' trk-view-btn-on':''}" id="trk-view-standard">📊 Standard View</button>
    <button class="trk-view-btn${_trackingView==='business'?' trk-view-btn-on':''}" id="trk-view-business">🏢 Business View</button>
  </div>
  <div class="trk-search-wrap">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" class="trk-search-icon">
      <circle cx="6" cy="6" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
    </svg>
    <input type="text" id="trk-search" class="trk-search" placeholder="Search title or ID…" value="${esc(_searchQuery)}" />
  </div>
  <div class="trk-pills">
    ${filters.map(f => `<button class="trk-pill${_activeFilter === f.key ? ' trk-pill-on' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
  </div>
  <select id="trk-sort" class="trk-sort">
    <option value="recent"   ${_sortBy==='recent'   ? 'selected':''}>Recent Activity</option>
    <option value="created"  ${_sortBy==='created'  ? 'selected':''}>Created Date</option>
    <option value="priority" ${_sortBy==='priority' ? 'selected':''}>Priority</option>
  </select>
  <button class="trk-sync-btn" id="trk-sync-btn" title="Re-fetch from ADO">
    <svg id="trk-sync-icon" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 7A5 5 0 1 1 7 2"/><polyline points="7,2 9.5,4.5 7,7"/>
    </svg>
    Sync
  </button>
</div>`;
  }

  // ── Detail panel HTML ────────────────────────────────────────────
  function detailHTML(item) {
    const f     = item.fields || {};
    const stage = getHandoffStage(item);
    const assignee  = f['System.AssignedTo'];
    const createdBy = f['System.CreatedBy'];
    const assigneeName  = (typeof assignee  === 'object' ? assignee?.displayName  : assignee)  || '—';
    const createdByName = (typeof createdBy === 'object' ? createdBy?.displayName : createdBy) || '—';
    const desc = (f['System.Description'] || '').replace(/<[^>]+>/g,'').trim() || '(No description)';
    const adoUrl = `https://dev.azure.com/TheLoanExchange/TLE.Empower/_workitems/edit/${item.id}`;

    return `<div class="trk-det">
  <div class="trk-det-hd">
    <div class="trk-det-row1">
      <span class="trk-det-id">#${item.id}</span>
      <span class="trk-det-type">${esc(f['System.WorkItemType'] || '')}</span>
      <button class="trk-det-close" id="trk-det-close">✕</button>
    </div>
    <div class="trk-det-title">${esc(f['System.Title'] || '')}</div>
    <div class="trk-det-state-row">
      <span class="trk-det-state">${esc(f['System.State'] || '')}</span>
      <span class="trk-det-who">${esc(getWhoWith(item))}</span>
    </div>
  </div>

  <div class="trk-det-journey">
    <div class="trk-det-section-lbl">Journey</div>
    ${timelineDots(stage)}
  </div>

  <div class="trk-det-body">
    <div class="trk-det-fields">
      <div class="trk-det-field"><span class="trk-det-flbl">Assigned To</span><span class="trk-det-fval">${esc(assigneeName)}</span></div>
      <div class="trk-det-field"><span class="trk-det-flbl">Created By</span><span class="trk-det-fval">${esc(createdByName)}</span></div>
      <div class="trk-det-field"><span class="trk-det-flbl">Created</span><span class="trk-det-fval">${formatDate(f['System.CreatedDate'])}</span></div>
      <div class="trk-det-field"><span class="trk-det-flbl">Last Changed</span><span class="trk-det-fval">${formatDate(f['System.ChangedDate'])}</span></div>
      <div class="trk-det-field"><span class="trk-det-flbl">In current state</span><span class="trk-det-fval">${timeSince(f['System.ChangedDate'])}</span></div>
    </div>

    <div class="trk-det-section-lbl">Description</div>
    <div class="trk-det-desc">${esc(desc)}</div>

    <div class="trk-det-section-lbl">State History</div>
    <div id="trk-history" class="trk-history-loading">Loading…</div>
  </div>

  <div class="trk-det-actions">
    <button class="btn btn-primary trk-det-btn" id="trk-btn-ado" data-url="${esc(adoUrl)}">🔗 Open in ADO</button>
    <button class="btn trk-det-btn" id="trk-btn-copy-ac">📋 Copy AC</button>
    <button class="btn trk-det-btn" id="trk-btn-followup">📧 Follow-up</button>
    <button class="btn trk-det-btn" id="trk-btn-copilot">✦ Summarize history</button>
  </div>
</div>`;
  }

  // ── Main render ──────────────────────────────────────────────────
  function renderAll() {
    const main = document.getElementById('trk-main');
    if (!main) return;

    const filtered = getFiltered();
    const hasDetail = !!_selectedItem;

    main.innerHTML = `
      ${statsBarHTML(_allItems)}
      ${toolbarHTML()}
      <div class="trk-body${hasDetail ? ' trk-body-split' : ''}">
        <div class="trk-columns${_trackingView === 'business' ? ' trk-columns-biz' : ''}">
          ${_trackingView === 'business' ? businessColumnsHTML(filtered) : `
            ${columnHTML('🔵 In Progress', 'inprogress', filtered)}
            ${columnHTML('🟡 Handed Off',  'handedoff',  filtered)}
            ${columnHTML('✅ Done',         'done',        filtered)}
          `}
        </div>
        ${hasDetail ? `<div class="trk-detail-wrap">${detailHTML(_selectedItem)}</div>` : ''}
      </div>`;

    wireEvents();

    if (hasDetail) {
      loadHistory(_selectedItem.id);
    }
  }

  // ── Event wiring ─────────────────────────────────────────────────
  function wireEvents() {
    // View toggle
    document.getElementById('trk-view-standard')?.addEventListener('click', () => {
      _trackingView = 'standard';
      localStorage.setItem('bsa-tracking-view', 'standard');
      renderAll();
    });
    document.getElementById('trk-view-business')?.addEventListener('click', () => {
      _trackingView = 'business';
      localStorage.setItem('bsa-tracking-view', 'business');
      renderAll();
    });

    // Cards
    document.querySelectorAll('.trk-card').forEach(card => {
      card.addEventListener('click', () => {
        const id   = parseInt(card.dataset.id, 10);
        const item = _allItems.find(i => i.id === id);
        if (!item) return;
        _selectedItem = (_selectedItem?.id === id) ? null : item;
        renderAll();
      });
    });

    // Close detail
    document.getElementById('trk-det-close')?.addEventListener('click', () => {
      _selectedItem = null;
      renderAll();
    });

    // Search
    document.getElementById('trk-search')?.addEventListener('input', e => {
      _searchQuery = e.target.value;
      renderAll();
    });

    // Filter pills
    document.querySelectorAll('.trk-pill').forEach(p => {
      p.addEventListener('click', () => { _activeFilter = p.dataset.filter; renderAll(); });
    });

    // Sort
    document.getElementById('trk-sort')?.addEventListener('change', e => {
      _sortBy = e.target.value; renderAll();
    });

    // Sync
    document.getElementById('trk-sync-btn')?.addEventListener('click', () => {
      _allItems = [];
      _prevStateMap = {};
      fetchItems();
    });

    // Open in ADO
    document.getElementById('trk-btn-ado')?.addEventListener('click', e => {
      window.api.shell.openExternal(e.currentTarget.dataset.url);
    });

    // Copy AC
    document.getElementById('trk-btn-copy-ac')?.addEventListener('click', () => {
      const ac = (_selectedItem?.fields?.['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').replace(/<[^>]*>/g, '').trim();
      const text = ac || `${_selectedItem?.fields?.['System.Title'] || ''}\n\nNo AC defined.`;
      navigator.clipboard.writeText(text).then(() => window.showToast?.('AC copied to clipboard', 'success'));
    });

    // Follow-up
    document.getElementById('trk-btn-followup')?.addEventListener('click', () => {
      window.navigateTo('followup');
    });

    // Copilot summarize
    document.getElementById('trk-btn-copilot')?.addEventListener('click', () => {
      if (!window.Copilot) return;
      const inp = document.getElementById('cp-input');
      if (inp) inp.value = 'Summarize this item\'s history and current status';
      window.Copilot.open();
      setTimeout(() => {
        const btn = document.getElementById('cp-send-btn');
        btn?.click();
      }, 350);
    });
  }

  // ── State history ────────────────────────────────────────────────
  async function loadHistory(id) {
    const el = document.getElementById('trk-history');
    if (!el) return;
    try {
      const result = await window.adoFetch(
        `TLE.Empower/_apis/wit/workItems/${id}/revisions?api-version=7.0&$top=50`
      );
      const revs   = result.value || [];
      const changes = [];
      let prev = null;
      for (const rev of revs) {
        const state = rev.fields?.['System.State'];
        if (state && state !== prev) {
          const by   = rev.fields?.['System.ChangedBy'];
          const name = (typeof by === 'object' ? by?.displayName : by) || '?';
          changes.push({ state, date: rev.fields?.['System.ChangedDate'], by: name });
          prev = state;
        }
      }
      if (!changes.length) {
        el.innerHTML = '<div class="trk-hist-empty">No state history recorded</div>';
        return;
      }
      el.innerHTML = `<div class="trk-hist-list">${changes.map((c, i) => `
        <div class="trk-hist-item${i === changes.length - 1 ? ' trk-hist-current' : ''}">
          <div class="trk-hist-dot"></div>
          <div class="trk-hist-info">
            <span class="trk-hist-state">${esc(c.state)}</span>
            <span class="trk-hist-meta">${esc(c.by)} · ${formatDate(c.date)}</span>
          </div>
        </div>`).join('')}
      </div>`;
    } catch (err) {
      if (el) el.innerHTML = `<div class="trk-hist-empty">Could not load: ${esc(err.message)}</div>`;
    }
  }

  // ── UI helpers ───────────────────────────────────────────────────
  function setSyncState(loading) {
    const btn  = document.getElementById('trk-sync-btn');
    const icon = document.getElementById('trk-sync-icon');
    if (btn)  btn.disabled  = loading;
    if (icon) icon.style.animation = loading ? 'trk-spin 0.8s linear infinite' : '';
  }

  function showError(msg) {
    const main = document.getElementById('trk-main');
    if (!main) return;
    main.innerHTML = `
      <div class="trk-error">
        <div>⚠️ Could not load tracking data</div>
        <div class="trk-error-msg">${esc(msg)}</div>
        <button class="btn btn-primary" id="trk-retry" style="margin-top:12px;">Retry</button>
      </div>`;
    document.getElementById('trk-retry')?.addEventListener('click', fetchItems);
  }

  function updateSidebarBadge(count) {
    const nav = document.querySelector('.nav-item[data-module="tracking"]');
    if (!nav) return;
    let badge = nav.querySelector('.nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      nav.appendChild(badge);
    }
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }

  // ── Entry point ──────────────────────────────────────────────────
  function render(container) {
    stopAutoRefresh();
    _selectedItem = null;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">📍 My Tracking</div>
        <div class="module-subtitle">Every work item you've touched — live status through the full lifecycle</div>
      </div>
      <div id="trk-main" class="trk-main">
        <div class="trk-loading">
          <div class="trk-spinner"></div>
          <div>Loading your work items…</div>
        </div>
      </div>`;

    fetchItems().then(() => startAutoRefresh());
  }

  // ── Self-register ────────────────────────────────────────────────
  window.Modules = window.Modules || {};
  window.Modules.tracking = {
    render,
    cleanup() {
      stopAutoRefresh();
      _selectedItem = null;
    },
    getContext() {
      const s = computeStats(_allItems);
      const ctx = {
        'Screen':              'My Tracking',
        'Total tracked':       s.total,
        'With Dev':            s.withDev,
        'With Tester':         s.withTester,
        'Closed this month':   s.closedThisMonth,
        'Avg close time':      s.avgDays !== null ? `${s.avgDays} days` : 'N/A',
      };
      if (_selectedItem) {
        const f = _selectedItem.fields || {};
        ctx['Selected item'] = `#${_selectedItem.id}: ${f['System.Title'] || ''}`;
        ctx['Current state'] = f['System.State'] || '';
        ctx['In state since'] = timeSince(f['System.ChangedDate']);
      }
      return ctx;
    }
  };

})();
