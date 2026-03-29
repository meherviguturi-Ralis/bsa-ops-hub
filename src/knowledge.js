/* ============================================================
   BSA Ops Hub — Cross-Task Knowledge Engine
   Learns from every completed task to make future work smarter.
   ============================================================ */

(function () {
  'use strict';

  const KB_KEY = 'bsa-knowledge-base-v1';

  // ── Topic keyword map (no API needed for clustering) ─────────
  const CLUSTER_MAP = {
    'Exchange Title':     ['exchange title', 'realec', 'event 100', 'event 130', 'event 150', 'event 180', 'event 385', 'title order'],
    'Exchange Appraisal': ['exchange appraisal', 'appraisal', 'socal direct', 'amc'],
    'HELOC':              ['heloc', 'home equity', 'line of credit'],
    'Conditions':         ['condition', 'ptd', 'awc', 'prior to docs', 'prior to funding'],
    'DocMagic':           ['docmagic', 'xml', 'document package'],
    'DocuTech':           ['docutech', 'compliance', 'disclosure'],
    'Validation':         ['validation', 'expression', 'field', 'error', 'rule'],
    'URLA':               ['urla', '1003', 'loan application'],
  };

  // ── Storage ──────────────────────────────────────────────────
  function load() {
    try {
      return JSON.parse(localStorage.getItem(KB_KEY) || 'null') || empty();
    } catch (e) { return empty(); }
  }

  function save(db) {
    try { localStorage.setItem(KB_KEY, JSON.stringify(db)); } catch (e) { /* silent */ }
  }

  function empty() {
    return { patterns: [], taskLinks: {}, acLibrary: [], blockerMemory: [], clusters: {} };
  }

  function genId() {
    return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // ── Topic detection (instant, no API) ────────────────────────
  function getTopics(title, description) {
    const hay = ((title || '') + ' ' + (description || '').replace(/<[^>]+>/g, '')).toLowerCase();
    const matched = [];
    for (const [topic, kws] of Object.entries(CLUSTER_MAP)) {
      if (kws.some(kw => hay.includes(kw))) matched.push(topic);
    }
    return matched.length > 0 ? matched : ['General'];
  }

  // ── Auto-cluster a task ───────────────────────────────────────
  function clusterTask(taskId, title, description) {
    const topics = getTopics(title, description);
    const db = load();
    const id = String(taskId);
    topics.forEach(topic => {
      if (!db.clusters[topic]) db.clusters[topic] = [];
      if (!db.clusters[topic].includes(id)) db.clusters[topic].push(id);
    });
    // General fallback if only General matched
    if (topics[0] === 'General') {
      if (!db.clusters['General']) db.clusters['General'] = [];
      if (!db.clusters['General'].includes(id)) db.clusters['General'].push(id);
    }
    save(db);
    return topics;
  }

  // ── Pattern extraction (Claude) ───────────────────────────────
  async function extractPattern(taskId, taskTitle, taskDescription, completedSteps) {
    try {
      const apiKey = window.appSettings?.anthropicKey || '';
      if (!apiKey || !window.api?.ai) return null;

      const descClean = (taskDescription || '').replace(/<[^>]+>/g, '').slice(0, 500);
      const stepsStr  = (completedSteps || []).join(', ') || '(steps not recorded)';

      const prompt = `A BSA just completed this Empower LOS work item. Extract reusable knowledge for future similar tasks.
Task Title: ${taskTitle}
Task Description: ${descClean}
Steps completed: ${stepsStr}

Return JSON only:
{
  "topic": "main Empower area (Exchange Title / HELOC / DocMagic / DocuTech / Conditions / Validation / General)",
  "keywords": ["3-6 keywords from this task"],
  "findings": "2-3 sentences: what was learned or confirmed while doing this task",
  "reusableSteps": ["step1", "step2", "step3"],
  "acSnippets": ["any AC patterns that could reuse for similar tasks"],
  "potentialBlockers": ["anything that could block similar tasks in future"]
}`;

      const res = await window.api.ai.complete({
        model:    'claude-sonnet-4-6',
        apiKey,
        messages: [{ role: 'user', content: prompt }],
      });

      const text  = (res.content?.[0]?.text || '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      const db = load();

      const pattern = {
        id:           genId(),
        keywords:     parsed.keywords || [],
        topic:        parsed.topic || 'General',
        title:        (taskTitle || '').slice(0, 80),
        findings:     parsed.findings || '',
        steps:        parsed.reusableSteps || [],
        acSnippets:   parsed.acSnippets || [],
        blockers:     parsed.potentialBlockers || [],
        sourceTaskIds:[String(taskId)],
        createdDate:  new Date().toISOString(),
        useCount:     0,
      };

      db.patterns.push(pattern);
      clusterTask(taskId, taskTitle, taskDescription);
      save(db);

      window.showToast?.(`✦ Knowledge saved — ${pattern.topic} pattern updated`, 'success');
      return pattern;
    } catch (e) {
      return null;
    }
  }

  // ── Find related tasks ────────────────────────────────────────
  function findRelated(taskId, title, description) {
    const db     = load();
    const topics = getTopics(title, description);
    const id     = String(taskId);
    const seen   = new Set([id]);
    const results = [];

    // From taskLinks map
    (db.taskLinks[id] || []).forEach(rid => {
      if (!seen.has(rid)) { seen.add(rid); results.push(rid); }
    });

    // From clusters — same topic
    topics.forEach(topic => {
      (db.clusters[topic] || []).forEach(rid => {
        if (!seen.has(rid)) { seen.add(rid); results.push(rid); }
      });
    });

    return results.slice(0, 6).map(rid => {
      const patterns = db.patterns.filter(p => p.sourceTaskIds.includes(rid));
      const p = patterns[0];
      return {
        taskId:      rid,
        topic:       p?.topic || 'General',
        findings:    p?.findings || '',
        steps:       p?.steps || [],
        createdDate: p?.createdDate || null,
        patternCount: patterns.length,
      };
    }).filter(r => r.findings || r.steps.length); // only show if we have knowledge
  }

  // ── AC Library ────────────────────────────────────────────────
  function addToACLibrary(taskId, taskTitle, topics, acContent) {
    if (!acContent || !acContent.trim()) return;
    const db  = load();
    const sid = String(taskId);
    const existing = db.acLibrary.find(e => e.taskId === sid);
    if (existing) {
      existing.acContent = acContent;
      existing.savedDate = new Date().toISOString();
    } else {
      db.acLibrary.push({
        id:        genId(),
        taskId:    sid,
        taskTitle: taskTitle || '',
        topic:     (topics || [])[0] || 'General',
        keywords:  topics || [],
        acContent,
        savedDate: new Date().toISOString(),
        useCount:  0,
      });
    }
    save(db);
  }

  function searchACLibrary(topics) {
    const db = load();
    return db.acLibrary.filter(e =>
      topics && topics.some(t => t === e.topic || (e.keywords || []).includes(t))
    ).slice(0, 5);
  }

  // ── Blocker memory ────────────────────────────────────────────
  function searchBlockers(topics, title, description) {
    const db  = load();
    const hay = ((title || '') + ' ' + (description || '').replace(/<[^>]+>/g, '')).toLowerCase();
    return db.blockerMemory.filter(b => {
      if (topics && topics.includes(b.topic)) return true;
      if ((b.keywords || []).some(kw => hay.includes(kw.toLowerCase()))) return true;
      return false;
    }).slice(0, 3);
  }

  function logBlockerResolution(topic, keywords, blockerDesc, resolution, taskId) {
    const db = load();
    db.blockerMemory.push({
      id:                 genId(),
      topic:              topic || 'General',
      keywords:           keywords || [],
      blockerDescription: blockerDesc || '',
      resolution:         resolution || '',
      sourceTaskId:       String(taskId),
      date:               new Date().toISOString(),
    });
    save(db);
    window.showToast?.('📝 Blocker resolution saved to knowledge base', 'success');
  }

  // ── Pattern helpers ───────────────────────────────────────────
  function getPatternsForTopics(topics) {
    const db = load();
    return db.patterns.filter(p => topics && topics.includes(p.topic));
  }

  function incrementPatternUse(patternId) {
    const db = load();
    const p  = db.patterns.find(x => x.id === patternId);
    if (p) { p.useCount = (p.useCount || 0) + 1; save(db); }
  }

  // ── Stats ─────────────────────────────────────────────────────
  function getStats() {
    const db    = load();
    const topics = new Set(db.patterns.map(p => p.topic)).size;
    const informed = db.patterns.reduce((s, p) => s + (p.useCount || 0), 0);
    let mostReused = null, maxUse = 0;
    db.patterns.forEach(p => {
      if ((p.useCount || 0) > maxUse) { maxUse = p.useCount; mostReused = p; }
    });
    return {
      patternCount: db.patterns.length,
      topicsCovered: topics,
      tasksInformed: informed,
      acLibraryCount: db.acLibrary.length,
      mostReused: mostReused ? `${mostReused.topic} — used ${mostReused.useCount}x` : null,
    };
  }

  // ── Copilot system prompt context ─────────────────────────────
  function buildCopilotContext(topics) {
    const patterns = getPatternsForTopics(topics);
    if (!patterns.length) return '';
    const lines = patterns.slice(0, 3).map(p => {
      let s = `[${p.topic}] ${p.findings}`;
      if (p.blockers.length) s += ` | Past blockers: ${p.blockers.slice(0, 2).join('; ')}`;
      return s;
    });
    return `\nRelevant knowledge from Meher's past tasks on this topic:\n${lines.join('\n')}`;
  }

  // ── Helpers ───────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7)  return `${days} days ago`;
    const wk = Math.floor(days / 7);
    if (wk < 5)    return `${wk} week${wk !== 1 ? 's' : ''} ago`;
    return `${Math.floor(days / 30)} months ago`;
  }

  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  // ── Render: Related Tasks + Blocker Warning ───────────────────
  function renderRelatedTasksCard(container, taskId, title, description) {
    const topics  = getTopics(title, description);
    clusterTask(taskId, title, description);

    const related  = findRelated(taskId, title, description);
    const blockers = searchBlockers(topics, title, description);
    const patterns = getPatternsForTopics(topics);

    // Blocker warning banner
    if (blockers.length) {
      const warn = document.createElement('div');
      warn.className = 'kb-blocker-warn';
      warn.innerHTML = `
        <div class="kb-blocker-warn-header">
          <span>⚠️ Heads up — similar tasks were previously blocked</span>
          <button class="kb-dismiss-btn" title="Dismiss">✕</button>
        </div>
        ${blockers.map(b => `
          <div class="kb-blocker-item">
            <div class="kb-blocker-desc">${esc(b.blockerDescription)}</div>
            ${b.resolution ? `<div class="kb-blocker-res">✓ Resolution: ${esc(b.resolution)}</div>` : ''}
          </div>
        `).join('')}
      `;
      warn.querySelector('.kb-dismiss-btn').addEventListener('click', () => warn.remove());
      container.appendChild(warn);
    }

    // Blocker log resolution button (for currently-blocked tasks)
    const isCurrentlyBlocked = /\bblocked\b|\bon hold\b|waiting on/i.test(title);
    if (isCurrentlyBlocked) {
      const logBtn = document.createElement('div');
      logBtn.className = 'kb-log-resolution';
      logBtn.innerHTML = `<button class="kb-log-btn">📝 Log Resolution for This Blocker</button>`;
      logBtn.querySelector('.kb-log-btn').addEventListener('click', () => {
        showBlockerLogModal(taskId, title, topics);
      });
      container.appendChild(logBtn);
    }

    if (!related.length && !patterns.length) return;

    // Related tasks card
    const card = document.createElement('div');
    card.className = 'kb-related-card';

    const patternBadge = patterns.length
      ? `<span class="kb-pattern-badge">💡 ${patterns.length} pattern${patterns.length !== 1 ? 's' : ''} for ${topics[0]}</span>`
      : '';

    card.innerHTML = `
      <div class="kb-related-header">
        <span class="kb-related-title">🔗 ${related.length} similar past task${related.length !== 1 ? 's' : ''} found</span>
        ${patternBadge}
        <button class="kb-expand-btn" title="Expand">▼</button>
      </div>
      <div class="kb-related-body">
        ${related.map(r => `
          <div class="kb-related-item">
            <div class="kb-related-meta">
              <span class="kb-topic-badge">${esc(r.topic)}</span>
              <span class="kb-task-ref">#${esc(r.taskId)}</span>
              ${r.createdDate ? `<span class="kb-time-ago">${timeAgo(r.createdDate)}</span>` : ''}
            </div>
            ${r.findings ? `<div class="kb-findings">${esc(r.findings)}</div>` : ''}
            ${r.steps.length ? `
              <details class="kb-steps-details">
                <summary>View Steps →</summary>
                <ol class="kb-steps-list">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
              </details>` : ''}
          </div>
        `).join('')}
      </div>
    `;

    const body    = card.querySelector('.kb-related-body');
    const expBtn  = card.querySelector('.kb-expand-btn');
    body.style.display = 'none'; // collapsed by default

    expBtn.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      expBtn.textContent = open ? '▼' : '▲';
    });

    container.appendChild(card);
  }

  // ── Blocker log modal ─────────────────────────────────────────
  function showBlockerLogModal(taskId, title, topics) {
    if (document.getElementById('kb-blocker-modal')) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'kb-blocker-modal';
    ov.innerHTML = `
      <div class="modal-box" style="max-width:480px;width:92%;">
        <div class="modal-header">
          <div class="modal-title">📝 Log Blocker Resolution</div>
          <button class="btn btn-icon" id="kb-bl-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:12px;color:var(--text-secondary);">For: <strong>${esc(title)}</strong></div>
          <div class="form-group">
            <label>What caused the block?</label>
            <textarea id="kb-bl-desc" rows="3" placeholder="Describe the blocker…" style="font-size:12px;resize:vertical;"></textarea>
          </div>
          <div class="form-group">
            <label>How was it resolved?</label>
            <textarea id="kb-bl-res" rows="3" placeholder="Describe what fixed it…" style="font-size:12px;resize:vertical;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="kb-bl-cancel">Cancel</button>
          <button class="btn btn-primary" id="kb-bl-save">Save to Knowledge Base</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    document.getElementById('kb-bl-close').addEventListener('click', close);
    document.getElementById('kb-bl-cancel').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.getElementById('kb-bl-save').addEventListener('click', () => {
      const desc = document.getElementById('kb-bl-desc').value.trim();
      const res  = document.getElementById('kb-bl-res').value.trim();
      if (!desc) { window.showToast?.('Describe the blocker first.', 'error'); return; }
      logBlockerResolution(topics[0] || 'General', topics, desc, res, taskId);
      close();
    });
  }

  // ── AC Library Modal ──────────────────────────────────────────
  function showACLibraryModal(taskId, title, topics, onSelect) {
    const matches = searchACLibrary(topics);
    if (!matches.length) { onSelect(null); return; }

    if (document.getElementById('kb-ac-modal')) document.getElementById('kb-ac-modal').remove();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'kb-ac-modal';
    ov.innerHTML = `
      <div class="modal-box" style="max-width:600px;width:92%;">
        <div class="modal-header">
          <div class="modal-title">📋 Similar AC found — use as starting point?</div>
          <button class="btn btn-icon" id="kb-ac-close">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;max-height:400px;overflow-y:auto;">
          ${matches.map((ac, i) => `
            <div class="kb-ac-entry">
              <div class="kb-ac-meta">
                <span class="kb-topic-badge">${esc(ac.topic)}</span>
                <span class="kb-ac-date">${fmtDate(ac.savedDate)}</span>
                <em class="kb-ac-task-title">${esc(ac.taskTitle)}</em>
              </div>
              <div class="kb-ac-preview">${esc(ac.acContent.slice(0, 200))}${ac.acContent.length > 200 ? '…' : ''}</div>
              <div style="margin-top:6px;">
                <button class="btn btn-primary kb-ac-use-btn" style="font-size:11px;padding:4px 10px;" data-idx="${i}">Use This →</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="kb-ac-fresh">Start Fresh</button>
          ${matches.length >= 2 ? `<button class="btn btn-secondary" id="kb-ac-combine">Combine Top 2</button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const close = () => ov.remove();
    document.getElementById('kb-ac-close').addEventListener('click', close);
    document.getElementById('kb-ac-fresh').addEventListener('click', () => { close(); onSelect(null); });
    ov.addEventListener('click', e => { if (e.target === ov) close(); });

    ov.querySelectorAll('.kb-ac-use-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const m   = matches[idx];
        const db  = load();
        const entry = db.acLibrary.find(e => e.id === m.id);
        if (entry) { entry.useCount = (entry.useCount || 0) + 1; save(db); }
        close();
        onSelect(m.acContent);
      });
    });

    const combineBtn = document.getElementById('kb-ac-combine');
    if (combineBtn) {
      combineBtn.addEventListener('click', () => {
        const combined = matches.slice(0, 2).map(m => m.acContent).join('\n\n---\n\n');
        close();
        onSelect(combined);
      });
    }
  }

  // ── Dashboard knowledge stats card ────────────────────────────
  function renderStatsCard(container) {
    const stats = getStats();
    if (document.getElementById('kb-stats-card')) return; // already rendered
    const el = document.createElement('div');
    el.id = 'kb-stats-card';
    el.className = 'kb-stats-card';
    el.innerHTML = `
      <div class="kb-stats-header">
        <span>🧠 Knowledge Base</span>
        <button class="kb-stats-nav-btn" title="View Knowledge Panel">View →</button>
      </div>
      <div class="kb-stats-grid">
        <div class="kb-mini-stat"><div class="kb-mini-val">${stats.patternCount}</div><div class="kb-mini-lbl">Patterns</div></div>
        <div class="kb-mini-stat"><div class="kb-mini-val">${stats.topicsCovered}</div><div class="kb-mini-lbl">Topics</div></div>
        <div class="kb-mini-stat"><div class="kb-mini-val">${stats.tasksInformed}</div><div class="kb-mini-lbl">Informed</div></div>
        <div class="kb-mini-stat"><div class="kb-mini-val">${stats.acLibraryCount}</div><div class="kb-mini-lbl">AC Saved</div></div>
      </div>
      ${stats.mostReused ? `<div class="kb-stats-best">⭐ ${esc(stats.mostReused)}</div>` : ''}
    `;
    el.querySelector('.kb-stats-nav-btn').addEventListener('click', () => window.navigateTo?.('knowledge'));
    container.appendChild(el);
  }

  // ── Knowledge Panel Module (nav: knowledge) ───────────────────
  function renderKnowledgePanel(container) {
    const db = load();

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">🧠 Knowledge Base</div>
        <div class="module-subtitle">Patterns and AC learned from every completed task</div>
      </div>

      <div class="kb-panel-stats">
        <div class="kb-panel-stat"><strong>${db.patterns.length}</strong> patterns</div>
        <div class="kb-panel-stat"><strong>${new Set(db.patterns.map(p => p.topic)).size}</strong> topics covered</div>
        <div class="kb-panel-stat"><strong>${db.acLibrary.length}</strong> AC entries</div>
        <div class="kb-panel-stat"><strong>${db.blockerMemory.length}</strong> blocker resolutions</div>
      </div>

      <div class="kb-panel-tabs">
        <button class="kb-tab-btn kb-tab-active" data-tab="patterns">Patterns</button>
        <button class="kb-tab-btn" data-tab="aclibrary">AC Library</button>
      </div>

      <div class="kb-panel-search">
        <input type="search" id="kb-search" placeholder="Search by topic or keyword…" />
      </div>

      <div id="kb-tab-patterns" class="kb-tab-content">
        ${renderPatternsTab(db)}
      </div>
      <div id="kb-tab-aclibrary" class="kb-tab-content" style="display:none;">
        ${renderACTab(db)}
      </div>
    `;

    // Tab switching
    container.querySelectorAll('.kb-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.kb-tab-btn').forEach(b => b.classList.remove('kb-tab-active'));
        btn.classList.add('kb-tab-active');
        container.querySelectorAll('.kb-tab-content').forEach(c => c.style.display = 'none');
        document.getElementById(`kb-tab-${btn.dataset.tab}`).style.display = 'block';
      });
    });

    // Search
    document.getElementById('kb-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('.kb-pattern-card').forEach(card => {
        const hay = card.textContent.toLowerCase();
        card.style.display = hay.includes(q) ? '' : 'none';
      });
      container.querySelectorAll('.kb-aclibrary-card').forEach(card => {
        const hay = card.textContent.toLowerCase();
        card.style.display = hay.includes(q) ? '' : 'none';
      });
    });

    // Delete buttons (patterns)
    container.querySelectorAll('.kb-delete-pattern').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const db2 = load();
        db2.patterns = db2.patterns.filter(p => p.id !== id);
        save(db2);
        renderKnowledgePanel(container);
      });
    });

    // Delete buttons (AC library)
    container.querySelectorAll('.kb-delete-ac').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const db2 = load();
        db2.acLibrary = db2.acLibrary.filter(e => e.id !== id);
        save(db2);
        renderKnowledgePanel(container);
      });
    });

    // Copy AC buttons
    container.querySelectorAll('.kb-copy-ac').forEach(btn => {
      btn.addEventListener('click', () => {
        const db2 = load();
        const entry = db2.acLibrary.find(e => e.id === btn.dataset.id);
        if (entry) {
          navigator.clipboard.writeText(entry.acContent)
            .then(() => window.showToast?.('AC copied to clipboard', 'success'));
        }
      });
    });
  }

  function renderPatternsTab(db) {
    if (!db.patterns.length) {
      return `<div class="kb-empty">No patterns yet. Complete tasks with checklists to build your knowledge base.</div>`;
    }
    // Group by topic
    const groups = {};
    db.patterns.forEach(p => {
      if (!groups[p.topic]) groups[p.topic] = [];
      groups[p.topic].push(p);
    });

    return Object.entries(groups).map(([topic, patterns]) => `
      <div class="kb-group">
        <div class="kb-group-title">${esc(topic)} <span class="kb-group-count">${patterns.length}</span></div>
        ${patterns.map(p => `
          <div class="kb-pattern-card">
            <div class="kb-pattern-header">
              <span class="kb-topic-badge">${esc(p.topic)}</span>
              <span class="kb-use-count">Used ${p.useCount || 0}×</span>
              <button class="kb-delete-pattern" data-id="${esc(p.id)}" title="Delete pattern">🗑</button>
            </div>
            <div class="kb-pattern-title">${esc(p.title)}</div>
            ${p.keywords.length ? `<div class="kb-keyword-row">${p.keywords.map(kw => `<span class="kb-kw-pill">${esc(kw)}</span>`).join('')}</div>` : ''}
            <div class="kb-findings-text">${esc(p.findings)}</div>
            <div class="kb-pattern-meta">
              <span>${p.steps.length} steps · ${p.sourceTaskIds.length} source task${p.sourceTaskIds.length !== 1 ? 's' : ''}</span>
              <span>${fmtDate(p.createdDate)}</span>
            </div>
            ${p.steps.length ? `
              <details>
                <summary class="kb-details-summary">Steps (${p.steps.length})</summary>
                <ol class="kb-steps-list">${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
              </details>` : ''}
            ${p.acSnippets.length ? `
              <details>
                <summary class="kb-details-summary">AC Snippets (${p.acSnippets.length})</summary>
                ${p.acSnippets.map(s => `<div class="kb-ac-snippet">${esc(s)}</div>`).join('')}
              </details>` : ''}
            ${p.blockers.length ? `
              <details>
                <summary class="kb-details-summary">Known Blockers (${p.blockers.length})</summary>
                ${p.blockers.map(b => `<div class="kb-blocker-pill">⚠️ ${esc(b)}</div>`).join('')}
              </details>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  function renderACTab(db) {
    if (!db.acLibrary.length) {
      return `<div class="kb-empty">No AC saved yet. Write and copy AC from work items to build your library.</div>`;
    }
    return db.acLibrary.map(e => `
      <div class="kb-aclibrary-card">
        <div class="kb-pattern-header">
          <span class="kb-topic-badge">${esc(e.topic)}</span>
          <span class="kb-use-count">Used ${e.useCount || 0}×</span>
          <button class="kb-copy-ac" data-id="${esc(e.id)}" title="Copy AC">📋</button>
          <button class="kb-delete-ac" data-id="${esc(e.id)}" title="Delete">🗑</button>
        </div>
        <div class="kb-pattern-title">${esc(e.taskTitle)}</div>
        <div class="kb-pattern-meta"><span>Task #${esc(e.taskId)}</span><span>${fmtDate(e.savedDate)}</span></div>
        <div class="kb-ac-preview-text">${esc(e.acContent.slice(0, 300))}${e.acContent.length > 300 ? '…' : ''}</div>
        <details>
          <summary class="kb-details-summary">Full AC</summary>
          <pre class="kb-ac-full">${esc(e.acContent)}</pre>
        </details>
      </div>
    `).join('');
  }

  // ── Module registration (Knowledge nav item) ──────────────────
  window.Modules = window.Modules || {};
  window.Modules.knowledge = {
    render(container) { renderKnowledgePanel(container); },
    getContext() {
      const s = getStats();
      return {
        'Screen':         'Knowledge Base',
        'Patterns saved': s.patternCount,
        'Topics covered': s.topicsCovered,
        'AC Library':     s.acLibraryCount,
      };
    },
  };

  // ── Public API ────────────────────────────────────────────────
  window.KnowledgeEngine = {
    load, save,
    getTopics, clusterTask,
    extractPattern,
    findRelated,
    addToACLibrary, searchACLibrary, showACLibraryModal,
    searchBlockers, logBlockerResolution, showBlockerLogModal,
    getPatternsForTopics, incrementPatternUse,
    getStats,
    buildCopilotContext,
    renderRelatedTasksCard,
    renderStatsCard,
    renderKnowledgePanel,
  };

})();
