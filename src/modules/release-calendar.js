/* ============================================================
   BSA Ops Hub — Sprint Release Calendar (Real ADO Data)
   ============================================================ */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────
  let _items       = [];
  let _sprints     = [];
  let _cfg         = loadCfg();
  let _loading     = false;
  let _selected    = null;   // { owner, sprintIdx } | null
  let _container   = null;

  // ── Config persistence ────────────────────────────────────────
  const CFG_KEY = 'bsa-release-cal-cfg';

  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || defaultCfg(); } catch { return defaultCfg(); }
  }
  function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
  function defaultCfg() {
    return {
      releaseName:  'TLE.Empower Release',
      releaseDate:  '',
      sprintStart:  '',
      sprintDays:   14,
      filterType:   'none',   // none | iteration | tag
      filterValue:  '',
    };
  }

  // ── Status mapping ────────────────────────────────────────────
  const STATUS_MAP = [
    { keys: ['closed','resolved','done','completed'],              code: 'closed'     },
    { keys: ['blocked','on hold','on-hold'],                       code: 'blocked'    },
    { keys: ['pending requirement','pending req','needs info'],    code: 'pending_req'},
    { keys: ['testing','uat','with tester','qa'],                  code: 'tester'     },
    { keys: ['with dev','development','in review','code review'],  code: 'dev'        },
    { keys: ['active','in progress','pm/bsa','with bsa'],          code: 'bsa'        },
    { keys: ['new','proposed','approved','to do'],                 code: 'business'   },
  ];

  const STATUS_META = {
    closed:     { label: 'Closed',       color: '#3fb950' },
    blocked:    { label: 'Blocked',      color: '#f85149' },
    pending_req:{ label: 'Pending Req',  color: '#e3b341' },
    tester:     { label: 'Tester',       color: '#2dd4bf' },
    dev:        { label: 'Dev',          color: '#d29922' },
    bsa:        { label: 'BSA',          color: '#A78BFA' },
    business:   { label: 'Business',     color: '#4A9EFF' },
  };

  function mapStatus(adoState) {
    const s = (adoState || '').toLowerCase().trim();
    for (const m of STATUS_MAP) {
      if (m.keys.some(k => s === k || s.includes(k))) return m.code;
    }
    return 'bsa';
  }

  function isDone(code)    { return code === 'closed'; }
  function isBlocked(code) { return code === 'blocked'; }

  // ── ADO helpers ───────────────────────────────────────────────
  function getProject() {
    return (window.appSettings?.adoProject || 'TLE.Empower').trim();
  }

  async function fetchTags() {
    if (!window.appSettings?.adoPat) return [];
    const project = getProject();
    const wiql = {
      query: `SELECT [System.Id],[System.Tags]
              FROM WorkItems
              WHERE [System.TeamProject] = @project
                AND [System.Tags] <> ''
                AND [System.WorkItemType] IN ('User Story','Task','Bug')
                AND [System.State] NOT IN ('Removed','Deleted','Cancelled','Canceled')
              ORDER BY [System.ChangedDate] DESC`
    };
    try {
      const wiqlRes = await window.adoFetch(`${project}/_apis/wit/wiql?$top=500&api-version=7.1`, 'POST', wiql, 'application/json');
      const ids = (wiqlRes?.workItems || []).map(w => w.id).slice(0, 300);
      if (!ids.length) return [];
      const batch = await window.adoFetch(`${project}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Tags&api-version=7.1`, 'GET');
      const tagSet = new Set();
      (batch?.value || []).forEach(item => {
        const raw = item.fields?.['System.Tags'] || '';
        raw.split(';').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
      });
      return [...tagSet].sort();
    } catch { return []; }
  }

  async function fetchItems() {
    if (!window.appSettings?.adoPat) return { error: 'ADO PAT not configured. Go to Settings.' };
    const project = getProject();

    let whereExtra = '';
    if (_cfg.filterType === 'tag' && _cfg.filterValue) {
      whereExtra = ` AND [System.Tags] CONTAINS '${_cfg.filterValue.replace(/'/g, "''")}'`;
    } else if (_cfg.filterType === 'iteration' && _cfg.filterValue) {
      whereExtra = ` AND [System.IterationPath] UNDER '${_cfg.filterValue.replace(/'/g, "''")}'`;
    }

    const wiql = {
      query: `SELECT [System.Id]
              FROM WorkItems
              WHERE [System.TeamProject] = @project
                AND [System.WorkItemType] IN ('User Story','Task','Bug')
                AND [System.State] NOT IN ('Removed','Deleted','Cancelled','Canceled')
                ${whereExtra}
              ORDER BY [System.ChangedDate] DESC`
    };

    let wiqlRes;
    try {
      wiqlRes = await window.adoFetch(`${project}/_apis/wit/wiql?$top=500&api-version=7.1`, 'POST', wiql, 'application/json');
    } catch (e) { return { error: e.message }; }

    if (wiqlRes?.error) return { error: wiqlRes.error };
    const ids = (wiqlRes?.workItems || []).map(w => w.id).slice(0, 300);
    if (!ids.length) return { items: [] };

    const fields = [
      'System.Id','System.Title','System.State','System.AssignedTo',
      'System.IterationPath','System.AreaPath','System.CreatedDate',
      'System.ChangedDate','Microsoft.VSTS.Common.Priority','System.Tags'
    ].join(',');

    let batchRes;
    try {
      batchRes = await window.adoFetch(
        `${project}/_apis/wit/workitems?ids=${ids.join(',')}&fields=${fields}&api-version=7.1`,
        'GET'
      );
    } catch (e) { return { error: e.message }; }

    if (batchRes?.error) return { error: batchRes.error };
    return { items: batchRes?.value || [] };
  }

  // ── Sprint bucketing ──────────────────────────────────────────
  function buildSprints() {
    if (!_cfg.releaseDate || !_cfg.sprintStart) return [];
    const msPerDay  = 86400000;
    const sprintMs  = (_cfg.sprintDays || 14) * msPerDay;
    const startMs   = new Date(_cfg.sprintStart).getTime();
    const endMs     = new Date(_cfg.releaseDate).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) return [];
    const count     = Math.max(1, Math.ceil((endMs - startMs) / sprintMs));
    const today     = Date.now();
    return Array.from({ length: count }, (_, i) => {
      const s = new Date(startMs + i * sprintMs);
      const e = new Date(startMs + (i + 1) * sprintMs - msPerDay);
      return { index: i + 1, start: s, end: e,
               isCurrent: today >= s.getTime() && today <= e.getTime(),
               isPast: today > e.getTime() };
    });
  }

  function sprintIndexForItem(item) {
    if (!_sprints.length) return 1;
    const startMs  = _sprints[0].start.getTime();
    const sprintMs = (_cfg.sprintDays || 14) * 86400000;

    // Try iterationPath: look for "Sprint N" or just a sprint leaf
    const iterPath = item.fields?.['System.IterationPath'] || '';
    const iterMatch = iterPath.match(/Sprint\s+(\d+)/i);
    if (iterMatch) {
      const n = parseInt(iterMatch[1]);
      const found = _sprints.find(s => s.index === n);
      if (found) return found.index;
    }

    // Fall back to changedDate bucketed into sprint windows
    const changedMs = new Date(item.fields?.['System.ChangedDate'] || Date.now()).getTime();
    const idx = Math.floor((changedMs - startMs) / sprintMs);
    const sprintIndex = Math.min(Math.max(idx + 1, 1), _sprints.length);
    console.log('Mapped sprint index:', item.id, sprintIndex);
    return sprintIndex;
  }

  function assigneeName(item) {
    const a = item.fields?.['System.AssignedTo'];
    if (!a) return 'Unassigned';
    if (typeof a === 'object') return a.displayName || a.uniqueName || 'Unassigned';
    return String(a).split('<')[0].trim() || 'Unassigned';
  }

  function transformItems(raw) {
    return raw.map(item => ({
      id:       item.id,
      title:    item.fields?.['System.Title'] || '(No Title)',
      owner:    assigneeName(item),
      sprint:   sprintIndexForItem(item),
      status:   mapStatus(item.fields?.['System.State']),
      state:    item.fields?.['System.State'] || '',
      priority: item.fields?.['Microsoft.VSTS.Common.Priority'] || 3,
      iter:     item.fields?.['System.IterationPath'] || '',
      tags:     item.fields?.['System.Tags'] || '',
      changed:  item.fields?.['System.ChangedDate'] || '',
    }));
  }

  function getOwners(items) {
    return [...new Set(items.map(t => t.owner))].filter(o => o !== 'Unassigned').sort()
      .concat(items.some(t => t.owner === 'Unassigned') ? ['Unassigned'] : []);
  }

  // ── Stats ─────────────────────────────────────────────────────
  function summarize(items) {
    const today  = Date.now();
    const releaseMs = _cfg.releaseDate ? new Date(_cfg.releaseDate).getTime() : 0;
    const remaining = _sprints.filter(s => s.end.getTime() >= today).length;
    const done    = items.filter(t => isDone(t.status)).length;
    const pending = items.filter(t => !isDone(t.status)).length;
    const blocked = items.filter(t => isBlocked(t.status)).length;
    const risk = blocked > 2 || (pending > 8 && remaining <= 1) ? 'High'
               : blocked > 0 || (pending > 4 && remaining <= 2) ? 'Medium' : 'Low';
    return { remaining, done, pending, blocked, risk,
             riskColor: { High:'#f85149', Medium:'#d29922', Low:'#3fb950' }[risk] };
  }

  function personStats(owner, items) {
    const mine    = items.filter(t => t.owner === owner);
    const done    = mine.filter(t => isDone(t.status)).length;
    const pending = mine.filter(t => !isDone(t.status) && !isBlocked(t.status)).length;
    const blocked = mine.filter(t => isBlocked(t.status)).length;
    const pct     = mine.length ? Math.round((done / mine.length) * 100) : 0;
    return { total: mine.length, done, pending, blocked, pct };
  }

  function sprintStats(sprintIdx, items) {
    const s       = items.filter(t => t.sprint === sprintIdx);
    const done    = s.filter(t => isDone(t.status)).length;
    const pending = s.filter(t => !isDone(t.status)).length;
    return { total: s.length, done, pending, carry: pending };
  }

  // ── Shared helpers ────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtDate(d) {
    return d instanceof Date
      ? d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
      : '';
  }
  function statusPill(code) {
    const m = STATUS_META[code] || { label: code, color: '#888' };
    return `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${m.color}22;color:${m.color};border:1px solid ${m.color}44;white-space:nowrap;">${m.label}</span>`;
  }
  function progressBar(pct, color) {
    return `<div style="height:4px;background:var(--bg-tertiary);border-radius:2px;overflow:hidden;margin-top:3px;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;"></div></div>`;
  }

  // ── Config panel ──────────────────────────────────────────────
  function configHTML() {
    return `
      <div id="rc-config" style="display:flex;flex-wrap:wrap;gap:10px;padding:10px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-default);align-items:flex-end;">
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Release Name</div>
          <input id="rc-rel-name" class="mail-parse-input" style="width:160px;" value="${esc(_cfg.releaseName)}" placeholder="e.g. v3.4" />
        </div>
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Release Date</div>
          <input id="rc-rel-date" type="date" class="mail-parse-input" style="width:140px;" value="${esc(_cfg.releaseDate)}" />
        </div>
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Sprint Start</div>
          <input id="rc-spr-start" type="date" class="mail-parse-input" style="width:140px;" value="${esc(_cfg.sprintStart)}" />
        </div>
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Filter By</div>
          <select id="rc-filter-type" class="mail-parse-input" style="width:110px;">
            <option value="none"      ${_cfg.filterType==='none'     ?'selected':''}>None</option>
            <option value="iteration" ${_cfg.filterType==='iteration'?'selected':''}>Iteration</option>
            <option value="tag"       ${_cfg.filterType==='tag'      ?'selected':''}>Tag</option>
          </select>
        </div>
        <div id="rc-filter-val-wrap">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">${_cfg.filterType === 'tag' ? 'Tag' : 'Filter Value'}</div>
          ${_cfg.filterType === 'tag'
            ? `<select id="rc-filter-val" class="mail-parse-input" style="width:160px;"><option value="${esc(_cfg.filterValue)}">${esc(_cfg.filterValue)||'Loading…'}</option></select>`
            : `<input id="rc-filter-val" class="mail-parse-input" style="width:160px;" value="${esc(_cfg.filterValue)}" placeholder="${_cfg.filterType==='iteration'?'e.g. TLE.Empower\\Sprint 5':'Sprint path or tag…'}" />`
          }
        </div>
        <button id="rc-load-btn" class="btn btn-primary" style="height:32px;">Load</button>
        <button id="rc-refresh-btn" class="btn" style="height:32px;" title="Refresh">↺</button>
      </div>`;
  }

  // ── Summary bar ───────────────────────────────────────────────
  function summaryBarHTML(sum) {
    const relDate = _cfg.releaseDate ? new Date(_cfg.releaseDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    return `
      <div style="display:flex;gap:20px;padding:8px 16px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-default);flex-wrap:wrap;align-items:center;">
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Release</div>
          <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${esc(_cfg.releaseName||'—')}</div></div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Date</div>
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${relDate}</div></div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Sprints Left</div>
          <div style="font-size:12px;font-weight:600;color:var(--accent);">${sum.remaining}</div></div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Pending</div>
          <div style="font-size:12px;font-weight:600;color:#d29922;">${sum.pending}</div></div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Done</div>
          <div style="font-size:12px;font-weight:600;color:#3fb950;">${sum.done}</div></div>
        <div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);">Risk</div>
          <div style="font-size:12px;font-weight:700;color:${sum.riskColor};">${sum.risk}</div></div>
        <div style="margin-left:auto;font-size:11px;color:var(--text-muted);">${_items.length} items loaded</div>
      </div>`;
  }

  // ── Calendar grid ─────────────────────────────────────────────
  function calendarHTML(items) {
    if (!_sprints.length) return `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;">Set a Release Date and Sprint Start, then click Load.</div>`;
    if (!items.length)    return `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;">No work items found. Check your ADO PAT and filter settings.</div>`;

    const owners      = getOwners(items);
    const firstColW   = '148px';
    const colW        = '200px';

    // Header
    const sprintThs = _sprints.map(s => {
      const ss  = sprintStats(s.index, items);
      const bg  = s.isCurrent ? 'var(--accent)18' : 'transparent';
      const lbl = s.isCurrent ? `Sprint ${s.index} ◀` : `Sprint ${s.index}`;
      return `<th style="min-width:${colW};padding:8px 10px;background:${bg};border-right:1px solid var(--border-default);vertical-align:top;text-align:left;">
        <div style="font-size:11px;font-weight:700;color:${s.isCurrent?'var(--accent)':'var(--text-primary)'};">${lbl}</div>
        <div style="font-size:10px;color:var(--text-muted);">${fmtDate(s.start)} – ${fmtDate(s.end)}</div>
        <div style="display:flex;gap:6px;margin-top:3px;font-size:10px;">
          <span style="color:#3fb950;">✓${ss.done}</span>
          <span style="color:#d29922;">⏳${ss.pending}</span>
          <span style="color:var(--text-muted);">→${ss.carry}</span>
        </div>
      </th>`;
    }).join('');

    const relTh = `<th style="min-width:${colW};padding:8px 10px;background:var(--accent)10;text-align:left;vertical-align:top;">
      <div style="font-size:11px;font-weight:700;color:var(--accent);">🚀 Release</div>
      <div style="font-size:10px;color:var(--text-muted);">${_cfg.releaseDate ? fmtDate(new Date(_cfg.releaseDate)) : '—'}</div>
    </th>`;

    // Rows
    const rows = owners.map(owner => {
      const ps  = personStats(owner, items);
      const clr = ps.pct >= 80 ? '#3fb950' : ps.pct >= 40 ? '#d29922' : '#f85149';
      const sel = _selected?.owner === owner;

      const personTd = `<td style="min-width:${firstColW};padding:8px 10px;border-right:1px solid var(--border-default);background:var(--bg-secondary);vertical-align:top;position:sticky;left:0;z-index:1;cursor:pointer;${sel?'border-left:2px solid var(--accent);':''}" data-owner="${esc(owner)}" data-sprint="">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${esc(owner)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${ps.total} · ✓${ps.done} · ⏳${ps.pending}${ps.blocked?` · <span style="color:#f85149;">⛔${ps.blocked}</span>`:''}</div>
        <div style="font-size:10px;color:${clr};margin-top:1px;">${ps.pct}%</div>
        ${progressBar(ps.pct, clr)}
      </td>`;

      const sprintTds = _sprints.map(s => {
        const cellItems = items.filter(t => t.owner === owner && t.sprint === s.index);
        const bg = s.isCurrent ? 'var(--accent)06' : 'transparent';
        const isSel = _selected?.owner === owner && _selected?.sprintIdx === s.index;
        const cards = cellItems.length
          ? cellItems.map(t => `
            <div style="padding:5px 7px;background:var(--bg-secondary);border:1px solid ${isBlocked(t.status)?'#f8514955':isDone(t.status)?'var(--border-default)':'var(--border-default)'};border-radius:4px;margin-bottom:4px;${isDone(t.status)?'opacity:0.55;':''}${isBlocked(t.status)?'border-color:#f8514966;':''}" >
              <div style="font-size:11px;color:var(--text-primary);line-height:1.35;margin-bottom:3px;">${esc(t.title)}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:9px;color:var(--text-muted);">#${t.id}</span>
                ${statusPill(t.status)}
              </div>
            </div>`).join('')
          : `<span style="font-size:11px;color:var(--border-default);">—</span>`;

        return `<td style="min-width:${colW};padding:7px 8px;border-right:1px solid var(--border-default);background:${isSel?'var(--accent)12':bg};vertical-align:top;cursor:pointer;" data-owner="${esc(owner)}" data-sprint="${s.index}">${cards}</td>`;
      }).join('');

      const ps2 = personStats(owner, items);
      const relTd = `<td style="min-width:${colW};padding:8px 10px;background:var(--accent)05;vertical-align:top;">
        <div style="font-size:11px;color:${ps2.pending>0?'#d29922':'#3fb950'};">
          ${ps2.pending > 0 ? `⚠ ${ps2.pending} pending` : '✓ All done'}
        </div>
        ${ps2.blocked ? `<div style="font-size:11px;color:#f85149;margin-top:2px;">⛔ ${ps2.blocked} blocked</div>` : ''}
      </td>`;

      return `<tr style="border-bottom:1px solid var(--border-default);">${personTd}${sprintTds}${relTd}</tr>`;
    }).join('');

    return `
      <table style="border-collapse:collapse;width:100%;min-width:max-content;">
        <thead style="position:sticky;top:0;z-index:2;background:var(--bg-primary);">
          <tr style="border-bottom:2px solid var(--border-default);">
            <th style="min-width:${firstColW};padding:8px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);border-right:1px solid var(--border-default);position:sticky;left:0;background:var(--bg-primary);z-index:3;">Owner</th>
            ${sprintThs}
            ${relTh}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Detail panel ──────────────────────────────────────────────
  function detailHTML(items) {
    if (!_selected) return `<div style="padding:20px 16px;color:var(--text-muted);font-size:12px;">Click a cell to see details.</div>`;
    const { owner, sprintIdx } = _selected;
    const mine = sprintIdx
      ? items.filter(t => t.owner === owner && t.sprint === sprintIdx)
      : items.filter(t => t.owner === owner);

    const done    = mine.filter(t => isDone(t.status));
    const pending = mine.filter(t => !isDone(t.status) && !isBlocked(t.status));
    const blocked = mine.filter(t => isBlocked(t.status));

    const label = sprintIdx ? `Sprint ${sprintIdx}` : 'All Sprints';

    function ticketList(arr) {
      if (!arr.length) return `<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:4px 0;">None</div>`;
      return arr.map(t => `
        <div style="padding:6px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;">
          <div style="font-size:11px;color:var(--text-primary);line-height:1.35;">${esc(t.title)}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
            <span style="font-size:9px;color:var(--text-muted);">#${t.id}</span>
            ${statusPill(t.status)}
          </div>
        </div>`).join('');
    }

    return `
      <div style="padding:12px 14px;border-bottom:1px solid var(--border-default);">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${esc(owner)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${label}</div>
      </div>
      <div style="padding:10px 14px;overflow-y:auto;flex:1;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px;">Pending (${pending.length})</div>
        ${ticketList(pending)}
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:10px 0 6px;">Blocked (${blocked.length})</div>
        ${ticketList(blocked)}
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:10px 0 6px;">Done (${done.length})</div>
        ${ticketList(done)}
      </div>`;
  }

  // ── Full render ───────────────────────────────────────────────
  function renderAll() {
    if (!_container) return;
    const sum = summarize(_items);
    _container.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - var(--titlebar-height) - var(--statusbar-height));overflow:hidden;">
        ${configHTML()}
        ${_items.length || _loading ? summaryBarHTML(sum) : ''}
        <div style="display:flex;flex:1;overflow:hidden;">
          <div id="rc-grid" style="flex:1;overflow:auto;">
            ${_loading
              ? `<div style="display:flex;align-items:center;gap:10px;padding:32px;color:var(--text-secondary);font-size:13px;"><div class="mail-spinner"></div>Loading from ADO…</div>`
              : calendarHTML(_items)}
          </div>
          <div id="rc-detail" style="width:260px;flex-shrink:0;border-left:1px solid var(--border-default);display:flex;flex-direction:column;background:var(--bg-secondary);overflow:hidden;">
            ${detailHTML(_items)}
          </div>
        </div>
      </div>`;

    bindEvents();
  }

  function filterValEl()   { return document.getElementById('rc-filter-val'); }
  function filterTypeEl()  { return document.getElementById('rc-filter-type'); }
  function filterWrapEl()  { return document.getElementById('rc-filter-val-wrap'); }

  async function updateFilterValueControl(type) {
    const wrap = filterWrapEl();
    if (!wrap) return;
    if (type === 'tag') {
      wrap.innerHTML = `<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Tag</div>
        <select id="rc-filter-val" class="mail-parse-input" style="width:160px;"><option value="">Loading…</option></select>`;
      const tags = await fetchTags();
      const sel  = filterValEl();
      if (!sel) return;
      sel.innerHTML = `<option value="">— any —</option>` +
        tags.map(t => `<option value="${esc(t)}" ${_cfg.filterValue===t?'selected':''}>${esc(t)}</option>`).join('');
    } else {
      const placeholder = type === 'iteration' ? 'e.g. TLE.Empower\\Sprint 5' : 'Sprint path or tag…';
      wrap.innerHTML = `<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px;">Filter Value</div>
        <input id="rc-filter-val" class="mail-parse-input" style="width:160px;" value="${esc(_cfg.filterValue)}" placeholder="${placeholder}" />`;
    }
  }

  function bindEvents() {
    document.getElementById('rc-load-btn')?.addEventListener('click', onLoad);
    document.getElementById('rc-refresh-btn')?.addEventListener('click', onLoad);

    filterTypeEl()?.addEventListener('change', e => updateFilterValueControl(e.target.value));
    if (_cfg.filterType === 'tag') updateFilterValueControl('tag');

    document.getElementById('rc-grid')?.addEventListener('click', e => {
      const td = e.target.closest('[data-owner]');
      if (!td) return;
      const owner     = td.dataset.owner;
      const sprintIdx = td.dataset.sprint ? parseInt(td.dataset.sprint) : null;
      _selected = { owner, sprintIdx };
      document.getElementById('rc-detail').innerHTML = detailHTML(_items);
      // re-highlight cells
      document.querySelectorAll('#rc-grid td[data-owner]').forEach(cell => {
        const isMatch = cell.dataset.owner === owner &&
          (sprintIdx ? parseInt(cell.dataset.sprint) === sprintIdx : !cell.dataset.sprint);
        cell.style.background = isMatch ? 'var(--accent)12' :
          (_sprints.find(s => s.index === parseInt(cell.dataset.sprint))?.isCurrent ? 'var(--accent)06' : '');
      });
    });
  }

  async function onLoad() {
    _cfg = {
      releaseName:  document.getElementById('rc-rel-name')?.value.trim()  || _cfg.releaseName,
      releaseDate:  document.getElementById('rc-rel-date')?.value         || _cfg.releaseDate,
      sprintStart:  document.getElementById('rc-spr-start')?.value        || _cfg.sprintStart,
      sprintDays:   14,
      filterType:   document.getElementById('rc-filter-type')?.value      || 'none',
      filterValue:  document.getElementById('rc-filter-val')?.value.trim()|| '',
    };
    saveCfg(_cfg);
    _sprints  = buildSprints();
    _loading  = true;
    _selected = null;
    renderAll();

    const result = await fetchItems();
    _loading = false;
    if (result.error) {
      window.showToast?.('ADO fetch failed: ' + result.error, 'error');
      _items = [];
    } else {
      _items = transformItems(result.items);
      console.log('ADO items:', _items.length, _items);
    }
    renderAll();
  }

  // ── Entry point ───────────────────────────────────────────────
  function render(container) {
    _container = container;
    _sprints   = buildSprints();
    renderAll();
    if (_cfg.releaseDate && _cfg.sprintStart) onLoad();
  }

  window.Modules['release-calendar'] = { render };

})();
