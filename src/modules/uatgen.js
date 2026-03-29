/* ============================================================
   BSA Ops Hub — UAT Generator Module
   ============================================================ */

(function () {
  'use strict';

  let _selectedItem = null;
  let _generatedUAT = '';

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
    _generatedUAT = '';
    _selectedItem = window._selectedWorkItem || null;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">UAT Generator</div>
        <div class="module-subtitle">User Acceptance Test Case Generator — powered by Claude AI</div>
      </div>

      <div class="two-col" style="align-items:flex-start;">

        <!-- Left: Work Item Selector + Options -->
        <div class="two-col-left">

          <div class="section">
            <div class="section-title">Work Item</div>
            <div class="search-bar">
              <input type="search" id="uat-wi-search" placeholder="Search by ID or title…" />
              <button class="btn btn-secondary" id="btn-uat-search">Search</button>
            </div>
            <div id="uat-wi-results" style="margin-bottom:12px;"></div>
          </div>

          <div id="uat-wi-preview" style="display:none;" class="section">
            <div class="section-title">Selected Item</div>
            <div id="uat-wi-preview-content" class="detail-panel"></div>
          </div>

          <div class="section">
            <div class="section-title">Test Options</div>

            <div class="form-group">
              <label for="uat-format">Output Format</label>
              <select id="uat-format">
                <option value="table">Test Case Table (Step | Action | Expected)</option>
                <option value="numbered">Numbered Steps</option>
                <option value="gherkin">Gherkin Scenarios</option>
                <option value="exploratory">Exploratory Test Charters</option>
              </select>
            </div>

            <div class="form-group">
              <label for="uat-persona">Test Persona</label>
              <select id="uat-persona">
                <option value="loan-officer">Loan Officer</option>
                <option value="processor">Loan Processor</option>
                <option value="underwriter">Underwriter</option>
                <option value="closer">Closer</option>
                <option value="admin">Admin User</option>
                <option value="all">All Personas</option>
              </select>
            </div>

            <div class="form-group">
              <label for="uat-scope">Test Scope</label>
              <select id="uat-scope">
                <option value="happy-path">Happy Path Only</option>
                <option value="standard">Standard (Happy + Edge)</option>
                <option value="comprehensive">Comprehensive (All scenarios)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="uat-extra">Additional Context (optional)</label>
              <textarea id="uat-extra" rows="3" placeholder="Data requirements, environment notes, preconditions…"></textarea>
            </div>
          </div>
        </div>

        <!-- Right: Output -->
        <div class="two-col-right">
          <div class="section">
            <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;">
              <span>Generated UAT Test Cases</span>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-secondary" id="btn-uat-copy" style="display:none;font-size:12px;">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="7" height="7" rx="1"/><path d="M2 8V2a1 1 0 0 1 1-1h6"/></svg>
                  Copy
                </button>
                <button class="btn btn-secondary" id="btn-uat-save" disabled style="font-size:12px;">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10V3l2-2h5l1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><rect x="4" y="6" width="4" height="4"/><rect x="3" y="1" width="5" height="3"/></svg>
                  Save as Markdown
                </button>
                <button class="btn btn-primary" id="btn-uat-generate">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M5 2L4 6L1 7L4 8L5 14L6 8L8 9L6 6L11 6"/>
                    <circle cx="12" cy="4" r="2"/>
                  </svg>
                  Generate UAT Test Cases
                </button>
              </div>
            </div>
            <div id="uat-output" class="ai-output" style="min-height:340px;">
              <div class="ai-placeholder" id="uat-placeholder">
                <div>🧪</div>
                <div>Select a work item on the left and configure test options, then click "Generate UAT Test Cases" to create test cases using Claude AI.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire up events
    document.getElementById('btn-uat-search').addEventListener('click', searchWorkItems);
    document.getElementById('uat-wi-search').addEventListener('keydown', e => { if (e.key === 'Enter') searchWorkItems(); });
    document.getElementById('btn-uat-generate').addEventListener('click', generateUAT);
    document.getElementById('btn-uat-copy').addEventListener('click', copyUAT);
    document.getElementById('btn-uat-save').addEventListener('click', saveUAT);

    // Pre-selected item
    if (_selectedItem) {
      showSelectedItem(_selectedItem);
    }
  }

  // ============================================================
  // Search Work Items
  // ============================================================

  async function searchWorkItems() {
    const query = (document.getElementById('uat-wi-search') || {}).value || '';
    const resultsEl = document.getElementById('uat-wi-results');
    if (!resultsEl || !query.trim()) {
      if (resultsEl) resultsEl.innerHTML = '';
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
          (document.getElementById('uat-wi-search') || {}).value = '';
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
    const preview = document.getElementById('uat-wi-preview');
    const previewContent = document.getElementById('uat-wi-preview-content');
    if (!preview || !previewContent) return;

    preview.style.display = '';

    const fields = item.fields || {};
    const title = fields['System.Title'] || '(No Title)';
    const state = fields['System.State'] || '';
    const type = fields['System.WorkItemType'] || '';
    const description = (fields['System.Description'] || '').replace(/<[^>]+>/g, ' ').trim();
    const priority = fields['Microsoft.VSTS.Common.Priority'] || '—';

    previewContent.innerHTML = `
      <div style="margin-bottom:8px;">
        <span style="font-size:11px;color:var(--text-muted);font-family:monospace;">#${item.id}</span>
        ${getStateBadge(state)}
        <span class="badge badge-removed" style="margin-left:4px;">${escapeHtml(type)}</span>
      </div>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:var(--text-muted);">Priority: ${escapeHtml(String(priority))}</div>
      ${description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;max-height:80px;overflow:hidden;line-height:1.5;">${description.slice(0, 200)}…</div>` : ''}
      <button class="btn btn-secondary" id="btn-uat-clear-item" style="margin-top:10px;font-size:11px;">Clear Selection</button>
    `;

    document.getElementById('btn-uat-clear-item').addEventListener('click', () => {
      _selectedItem = null;
      preview.style.display = 'none';
    });
  }

  // ============================================================
  // Generate UAT
  // ============================================================

  async function generateUAT() {
    const outputEl = document.getElementById('uat-output');
    const btn = document.getElementById('btn-uat-generate');
    const settings = window.appSettings;

    if (!_selectedItem) {
      window.showToast('Please select a work item first.', 'warning');
      return;
    }

    if (!settings || !settings.anthropicKey) {
      window.showToast('Configure your Anthropic API key in Settings.', 'error');
      return;
    }

    const format = (document.getElementById('uat-format') || {}).value || 'table';
    const persona = (document.getElementById('uat-persona') || {}).value || 'loan-officer';
    const scope = (document.getElementById('uat-scope') || {}).value || 'standard';
    const extraContext = (document.getElementById('uat-extra') || {}).value || '';

    const fields = _selectedItem.fields || {};
    const title = fields['System.Title'] || '';
    const type = fields['System.WorkItemType'] || '';
    const description = (fields['System.Description'] || '').replace(/<[^>]+>/g, ' ').trim();
    const priority = fields['Microsoft.VSTS.Common.Priority'] || '';
    const iteration = fields['System.IterationPath'] || '';

    const formatInstructions = {
      'table': 'Format as a test case table with columns: Test Case ID | Test Scenario | Preconditions | Test Steps | Expected Result | Pass/Fail',
      'numbered': 'Format as numbered test steps with clear expected results for each step',
      'gherkin': 'Format as Gherkin Feature/Scenario/Given/When/Then syntax',
      'exploratory': 'Format as exploratory testing charters with: Charter | Areas | Risks'
    };

    const personaLabels = {
      'loan-officer': 'Loan Officer',
      'processor': 'Loan Processor',
      'underwriter': 'Underwriter',
      'closer': 'Closer',
      'admin': 'Admin User',
      'all': 'All user personas (Loan Officer, Processor, Underwriter, Closer, Admin)'
    };

    const scopeInstructions = {
      'happy-path': 'Focus on the happy path only — the main positive workflow.',
      'standard': 'Include the happy path and key edge cases/negative scenarios.',
      'comprehensive': 'Comprehensive coverage: happy path, all edge cases, negative tests, boundary conditions, and error handling.'
    };

    btn.disabled = true;
    btn.textContent = 'Generating…';
    outputEl.className = 'ai-output';
    outputEl.innerHTML = '<div class="loading-state"><span class="spinner"></span> Generating UAT test cases…</div>';

    try {
      const response = await window.api.ai.complete({
        apiKey: settings.anthropicKey,
        model: 'claude-sonnet-4-6',
        system: `You are a QA expert and BSA at The Loan Exchange, a mortgage lending company using the Empower LOS platform. You specialize in writing UAT test cases for mortgage software features. Your test cases are clear, actionable, and ready for business users to execute.`,
        messages: [
          {
            role: 'user',
            content: `Generate UAT test cases for the following Azure DevOps work item.

Work Item #${_selectedItem.id}: ${title}
Type: ${type}
Priority: ${priority}
Iteration: ${iteration}
Description: ${description || 'No description provided.'}
${extraContext ? `Additional Context: ${extraContext}` : ''}

Requirements:
- Test Persona: ${personaLabels[persona] || persona}
- Scope: ${scopeInstructions[scope] || scope}
- Format: ${formatInstructions[format] || format}
- Environment: Empower LOS (mortgage loan origination system)
- Include prerequisites/preconditions
- Be specific about data values where applicable (e.g., loan amounts, borrower types)
- Make each test case independently executable

Output only the test cases, no preamble.`
          }
        ]
      });

      if (response && response.content && response.content[0]) {
        _generatedUAT = response.content[0].text || '';
        outputEl.className = 'ai-output has-content';
        outputEl.textContent = _generatedUAT;

        const copyBtn = document.getElementById('btn-uat-copy');
        const saveBtn = document.getElementById('btn-uat-save');
        if (copyBtn) copyBtn.style.display = '';
        if (saveBtn) saveBtn.disabled = false;

        try { Sounds.complete(); } catch (e) { /* silent */ }
        window.showToast('UAT test cases generated!', 'success');
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
          <path d="M5 2L4 6L1 7L4 8L5 14L6 8L8 9L6 6L11 6"/>
          <circle cx="12" cy="4" r="2"/>
        </svg>
        Generate UAT Test Cases
      `;
    }
  }

  // ============================================================
  // Copy / Save
  // ============================================================

  function copyUAT() {
    if (!_generatedUAT) return;
    navigator.clipboard.writeText(_generatedUAT).then(() => {
      window.showToast('Copied to clipboard!', 'success');
      try { Sounds.click(); } catch (e) { /* silent */ }
    });
  }

  async function saveUAT() {
    if (!_generatedUAT) return;
    const filename = _selectedItem
      ? `UAT_${_selectedItem.id}_${(_selectedItem.fields['System.Title'] || 'item').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.md`
      : 'uat_test_cases.md';

    const title = _selectedItem ? (_selectedItem.fields['System.Title'] || '') : '';
    const content = `# UAT Test Cases\n\n**Work Item #${_selectedItem ? _selectedItem.id : 'N/A'}:** ${title}\n\n**Generated:** ${new Date().toLocaleString()}\n\n---\n\n${_generatedUAT}`;

    const result = await window.api.fs.saveDialog(filename, content);
    if (result && result.success) {
      window.showToast('Saved to ' + result.path, 'success');
      try { Sounds.complete(); } catch (e) { /* silent */ }
    }
  }

  // ============================================================
  // Self-register
  // ============================================================

  window.Modules = window.Modules || {};
  window.Modules.uatgen = {
    render,
    cleanup() {
      _selectedItem = null;
      _generatedUAT = '';
    },
    getContext() {
      const ctx = { 'Screen': 'UAT Generator' };
      if (_selectedItem) {
        ctx['Work item'] = `#${_selectedItem.id}: ${_selectedItem.fields?.['System.Title'] || ''}`;
        ctx['State']     = _selectedItem.fields?.['System.State'] || '';
      }
      if (_generatedUAT) {
        ctx['Test cases written (first 300 chars)'] = _generatedUAT.slice(0, 300);
      }
      return ctx;
    }
  };

})();
