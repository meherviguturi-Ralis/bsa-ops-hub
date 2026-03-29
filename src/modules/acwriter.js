/* ============================================================
   BSA Ops Hub — AC Writer Module
   Acceptance Criteria Generator
   ============================================================ */

(function () {
  'use strict';

  let _selectedItem = null;
  let _generatedAC = '';

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
    if (!state) return '';
    const s = state.toLowerCase();
    if (s === 'active' || s === 'in progress' || s === 'committed') return `<span class="badge badge-active">${escapeHtml(state)}</span>`;
    if (s === 'new' || s === 'proposed') return `<span class="badge badge-new">${escapeHtml(state)}</span>`;
    if (s === 'resolved' || s === 'closed' || s === 'done') return `<span class="badge badge-done">${escapeHtml(state)}</span>`;
    if (s === 'testing' || s === 'in testing') return `<span class="badge badge-testing">${escapeHtml(state)}</span>`;
    return `<span class="badge badge-pending">${escapeHtml(state)}</span>`;
  }

  // ============================================================
  // Render
  // ============================================================

  function render(container) {
    _generatedAC = '';
    _selectedItem = window._selectedWorkItem || null;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">AC Writer</div>
        <div class="module-subtitle">Acceptance Criteria Generator — powered by Claude AI</div>
      </div>

      <div class="two-col" style="align-items:flex-start;">

        <!-- Left: Work Item Selector -->
        <div class="two-col-left">
          <div class="section">
            <div class="section-title">Work Item</div>
            <div class="search-bar">
              <input type="search" id="ac-wi-search" placeholder="Search by ID or title…" />
              <button class="btn btn-secondary" id="btn-ac-search">Search</button>
            </div>
            <div id="ac-wi-results" style="margin-bottom:12px;"></div>
          </div>

          <div class="section" id="ac-wi-preview" style="display:none;">
            <div class="section-title">Selected Item</div>
            <div id="ac-wi-preview-content" class="detail-panel"></div>
          </div>

          <div class="section">
            <div class="section-title">AC Style Options</div>
            <div class="form-group">
              <label for="ac-format">Format</label>
              <select id="ac-format">
                <option value="given-when-then">Given / When / Then (BDD)</option>
                <option value="user-story">User Story style</option>
                <option value="checklist">Acceptance Checklist</option>
                <option value="gherkin">Gherkin (Feature/Scenario)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="ac-detail">Detail Level</label>
              <select id="ac-detail">
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
                <option value="brief">Brief</option>
              </select>
            </div>
            <div class="form-group">
              <label for="ac-extra-context">Additional Context (optional)</label>
              <textarea id="ac-extra-context" rows="3" placeholder="Any business rules, edge cases, or context to include…"></textarea>
            </div>
          </div>
        </div>

        <!-- Right: AC Output -->
        <div class="two-col-right">
          <div class="section">
            <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
              <span>Generated Acceptance Criteria</span>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-secondary" id="btn-ac-copy" style="display:none;font-size:12px;">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="7" height="7" rx="1"/><path d="M2 8V2a1 1 0 0 1 1-1h6"/></svg>
                  Copy
                </button>
                <button class="btn btn-secondary" id="btn-ac-save" style="display:none;font-size:12px;">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10V3l2-2h5l1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><rect x="4" y="6" width="4" height="4"/><rect x="3" y="1" width="5" height="3"/></svg>
                  Save
                </button>
                <button class="btn btn-primary" id="btn-ac-generate">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polygon points="2,2 12,7 2,12"/>
                  </svg>
                  Generate AC
                </button>
              </div>
            </div>
            <div id="ac-output" class="ai-output" style="min-height:300px;">
              <div class="ai-placeholder" id="ac-placeholder">
                <div>📋</div>
                <div>Select a work item on the left, then click "Generate AC" to create acceptance criteria using Claude AI.</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    // Wire up events
    document.getElementById('btn-ac-search').addEventListener('click', searchWorkItems);
    document.getElementById('ac-wi-search').addEventListener('keydown', e => { if (e.key === 'Enter') searchWorkItems(); });
    document.getElementById('btn-ac-generate').addEventListener('click', generateAC);
    document.getElementById('btn-ac-copy').addEventListener('click', copyAC);
    document.getElementById('btn-ac-save').addEventListener('click', saveAC);

    // If a work item was pre-selected from Work Items module
    if (_selectedItem) {
      showSelectedItem(_selectedItem);
    }
  }

  // ============================================================
  // Search Work Items
  // ============================================================

  async function searchWorkItems() {
    const query = (document.getElementById('ac-wi-search') || {}).value || '';
    const resultsEl = document.getElementById('ac-wi-results');
    if (!resultsEl) return;

    if (!query.trim()) {
      resultsEl.innerHTML = '';
      return;
    }

    resultsEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Searching…</div>';

    const settings = window.appSettings;
    if (!settings || !settings.adoPat) {
      resultsEl.innerHTML = '<div class="no-pat-banner">⚠️ ADO PAT required. Configure in Settings.</div>';
      return;
    }

    try {
      const project = settings.adoProject || 'TLE.Empower';
      const safeQ = query.replace(/'/g, "''");

      // Check if it's a numeric ID search
      let wiqlQuery;
      if (/^\d+$/.test(query.trim())) {
        wiqlQuery = `SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType] FROM WorkItems WHERE [System.Id]=${query.trim()}`;
      } else {
        wiqlQuery = `SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType] FROM WorkItems WHERE [System.TeamProject]='${project}' AND [System.Title] CONTAINS '${safeQ}' ORDER BY [System.ChangedDate] DESC`;
      }

      const wiqlResult = await window.adoFetch(
        `${project}/_apis/wit/wiql?api-version=7.1`,
        'POST',
        { query: wiqlQuery }
      );

      const ids = (wiqlResult.workItems || []).slice(0, 20).map(w => w.id);
      if (ids.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state">No results found.</div>';
        return;
      }

      const batchResult = await window.adoFetch(
        `${project}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Id,System.Title,System.State,System.WorkItemType,System.Description,System.AssignedTo,System.IterationPath,Microsoft.VSTS.Common.Priority&api-version=7.1`,
        'GET'
      );

      const items = (batchResult && batchResult.value) ? batchResult.value : [];
      if (items.length === 0) {
        resultsEl.innerHTML = '<div class="empty-state">No results found.</div>';
        return;
      }

      const html = items.map((item, idx) => {
        const state = item.fields['System.State'] || '';
        const type = item.fields['System.WorkItemType'] || '';
        return `
          <div class="wi-item" data-idx="${idx}" style="cursor:pointer;">
            <span class="wi-item-id">#${item.id}</span>
            <span class="wi-item-title">${escapeHtml(item.fields['System.Title'] || '')}</span>
            <span class="wi-item-type">${escapeHtml(type)}</span>
            ${getStateBadge(state)}
          </div>
        `;
      }).join('');

      resultsEl.innerHTML = `<div class="wi-list">${html}</div>`;

      resultsEl.querySelectorAll('.wi-item').forEach((el, idx) => {
        el.addEventListener('click', () => {
          showSelectedItem(items[idx]);
          resultsEl.innerHTML = '';
          (document.getElementById('ac-wi-search') || {}).value = '';
        });
      });

    } catch (err) {
      resultsEl.innerHTML = `<div class="no-pat-banner">⚠️ ${escapeHtml(err.message)}</div>`;
    }
  }

  // ============================================================
  // Show Selected Item Preview
  // ============================================================

  function showSelectedItem(item) {
    _selectedItem = item;
    const preview = document.getElementById('ac-wi-preview');
    const previewContent = document.getElementById('ac-wi-preview-content');

    if (!preview || !previewContent) return;

    preview.style.display = '';

    const fields = item.fields || {};
    const title = fields['System.Title'] || '(No Title)';
    const state = fields['System.State'] || '';
    const type = fields['System.WorkItemType'] || '';
    const iteration = fields['System.IterationPath'] || '—';
    const priority = fields['Microsoft.VSTS.Common.Priority'] || '—';
    const description = fields['System.Description'] || '';

    previewContent.innerHTML = `
      <div style="margin-bottom:8px;">
        <span style="font-size:11px;color:var(--text-muted);font-family:monospace;">#${item.id}</span>
        ${getStateBadge(state)}
        <span class="badge badge-removed" style="margin-left:4px;">${escapeHtml(type)}</span>
      </div>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:10px;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:var(--text-muted);">Priority: ${escapeHtml(String(priority))} &nbsp;|&nbsp; ${escapeHtml(iteration)}</div>
      ${description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5;max-height:80px;overflow:hidden;">${description.replace(/<[^>]+>/g, ' ').slice(0, 200)}…</div>` : ''}
      <button class="btn btn-secondary" id="btn-ac-clear-item" style="margin-top:10px;font-size:11px;">Clear Selection</button>
    `;

    document.getElementById('btn-ac-clear-item').addEventListener('click', () => {
      _selectedItem = null;
      preview.style.display = 'none';
    });
  }

  // ============================================================
  // Generate AC
  // ============================================================

  async function generateAC() {
    const outputEl = document.getElementById('ac-output');
    const btn = document.getElementById('btn-ac-generate');
    const settings = window.appSettings;

    if (!_selectedItem) {
      window.showToast('Please select a work item first.', 'warning');
      return;
    }

    if (!settings || !settings.anthropicKey) {
      window.showToast('Configure your Anthropic API key in Settings.', 'error');
      return;
    }

    const format = (document.getElementById('ac-format') || {}).value || 'given-when-then';
    const detail = (document.getElementById('ac-detail') || {}).value || 'standard';
    const extraContext = (document.getElementById('ac-extra-context') || {}).value || '';

    const fields = _selectedItem.fields || {};
    const title = fields['System.Title'] || '';
    const type = fields['System.WorkItemType'] || '';
    const state = fields['System.State'] || '';
    const description = (fields['System.Description'] || '').replace(/<[^>]+>/g, ' ').trim();
    const iteration = fields['System.IterationPath'] || '';
    const priority = fields['Microsoft.VSTS.Common.Priority'] || '';

    const formatLabels = {
      'given-when-then': 'Given/When/Then (BDD)',
      'user-story': 'User Story style',
      'checklist': 'Acceptance Checklist',
      'gherkin': 'Gherkin Feature/Scenario'
    };

    const detailLabels = {
      'standard': 'standard depth',
      'detailed': 'highly detailed with edge cases and negative scenarios',
      'brief': 'brief and concise'
    };

    btn.disabled = true;
    btn.textContent = 'Generating…';
    outputEl.className = 'ai-output';
    outputEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Generating acceptance criteria…</div>';

    try {
      const response = await window.api.ai.complete({
        apiKey: settings.anthropicKey,
        model: 'claude-sonnet-4-6',
        system: `You are an expert Business Systems Analyst (BSA) for a mortgage lending company called The Loan Exchange. You specialize in writing clear, precise, and testable acceptance criteria. You work on the TLE.Empower LOS platform.`,
        messages: [
          {
            role: 'user',
            content: `Write acceptance criteria for the following Azure DevOps work item.

Work Item #${_selectedItem.id}: ${title}
Type: ${type}
State: ${state}
Priority: ${priority}
Iteration: ${iteration}
Description: ${description || 'No description provided.'}
${extraContext ? `Additional Context: ${extraContext}` : ''}

Requirements:
- Format: ${formatLabels[format] || format}
- Detail level: ${detailLabels[detail] || detail}
- Include positive scenarios (happy path)
- Include negative/error scenarios where applicable
- Be specific to mortgage/LOS domain where relevant
- Make each criterion independently testable

Output only the acceptance criteria, no preamble.`
          }
        ]
      });

      if (response && response.content && response.content[0]) {
        _generatedAC = response.content[0].text || '';
        outputEl.className = 'ai-output has-content';
        outputEl.textContent = _generatedAC;

        // Show copy/save buttons
        const copyBtn = document.getElementById('btn-ac-copy');
        const saveBtn = document.getElementById('btn-ac-save');
        if (copyBtn) copyBtn.style.display = '';
        if (saveBtn) saveBtn.style.display = '';

        try { Sounds.complete(); } catch (e) { /* silent */ }
        window.showToast('Acceptance criteria generated!', 'success');
      } else if (response && response.error) {
        outputEl.innerHTML = `<div class="ai-placeholder" style="color:var(--red);">AI Error: ${escapeHtml(response.error)}</div>`;
        window.showToast('AI error: ' + response.error, 'error');
      } else {
        outputEl.innerHTML = '<div class="ai-placeholder">No response received. Check your API key.</div>';
      }
    } catch (err) {
      outputEl.innerHTML = `<div class="ai-placeholder" style="color:var(--red);">Error: ${escapeHtml(err.message)}</div>`;
      window.showToast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="2,2 12,7 2,12"/>
        </svg>
        Generate AC
      `;
    }
  }

  // ============================================================
  // Copy / Save
  // ============================================================

  function copyAC() {
    if (!_generatedAC) return;
    navigator.clipboard.writeText(_generatedAC).then(() => {
      window.showToast('Copied to clipboard!', 'success');
      try { Sounds.click(); } catch (e) { /* silent */ }
    });
  }

  async function saveAC() {
    if (!_generatedAC) return;
    const filename = _selectedItem
      ? `AC_${_selectedItem.id}_${(_selectedItem.fields['System.Title'] || 'item').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.md`
      : 'acceptance_criteria.md';

    const content = `# Acceptance Criteria\n\n**Work Item #${_selectedItem ? _selectedItem.id : 'N/A'}:** ${_selectedItem ? (_selectedItem.fields['System.Title'] || '') : ''}\n\n---\n\n${_generatedAC}`;

    const result = await window.api.fs.saveDialog(filename, content);
    if (result && result.success) {
      window.showToast('Saved to ' + result.path, 'success');
    }
  }

  // ============================================================
  // Self-register
  // ============================================================

  window.Modules = window.Modules || {};
  window.Modules.acwriter = {
    render,
    cleanup() {
      _selectedItem = null;
      _generatedAC = '';
    },
    getContext() {
      const ctx = { 'Screen': 'AC Writer' };
      if (_selectedItem) {
        ctx['Work item'] = `#${_selectedItem.id}: ${_selectedItem.fields?.['System.Title'] || ''}`;
        ctx['State']     = _selectedItem.fields?.['System.State'] || '';
      }
      if (_generatedAC) {
        ctx['AC already written (first 300 chars)'] = _generatedAC.slice(0, 300);
      }
      return ctx;
    }
  };

})();
