/* ============================================================
   BSA Ops Hub — Settings Module
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // Render
  // ============================================================

  function render(container) {
    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">Settings</div>
        <div class="module-subtitle">Configure your ADO connection and AI integration</div>
      </div>

      <div style="max-width:640px;">

        <!-- Connection Section -->
        <div class="settings-section">
          <div class="settings-section-title">Connection — Azure DevOps</div>

          <div class="form-group">
            <label for="set-ado-org">ADO Organization</label>
            <input type="text" id="set-ado-org" value="TheLoanExchange" readonly style="opacity:0.6;cursor:not-allowed;" />
            <div class="settings-hint">Organization: ralisservices / TheLoanExchange</div>
          </div>

          <div class="form-group">
            <label for="set-ado-project">ADO Project</label>
            <input type="text" id="set-ado-project" value="TLE.Empower" readonly style="opacity:0.6;cursor:not-allowed;" />
          </div>

          <div class="form-group">
            <label for="set-ado-pat">ADO Personal Access Token</label>
            <div class="input-with-toggle">
              <input type="password" id="set-ado-pat" placeholder="Paste your ADO PAT here…" autocomplete="off" />
              <button class="input-toggle-btn" id="toggle-pat" title="Show/hide PAT">
                <svg id="eye-pat-show" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M1 8 C3 4 6 2 8 2 C10 2 13 4 15 8 C13 12 10 14 8 14 C6 14 3 12 1 8Z"/>
                  <circle cx="8" cy="8" r="2.5"/>
                </svg>
                <svg id="eye-pat-hide" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="display:none;">
                  <path d="M1 8 C3 4 6 2 8 2 C10 2 13 4 15 8"/>
                  <line x1="2" y1="2" x2="14" y2="14"/>
                  <path d="M6.5 6.5 C6.5 6.5 5.5 7 5.5 8"/>
                  <path d="M9.5 9.5 C9.5 9.5 10.5 9 10.5 8"/>
                </svg>
              </button>
            </div>
            <div class="settings-hint">
              Get your ADO PAT from <a href="#" id="link-ado-pat" style="color:var(--accent);text-decoration:none;">dev.azure.com → User Settings → Personal Access Tokens</a><br/>
              Required scopes: <strong style="color:var(--text-secondary);">Work Items (Read &amp; Write)</strong>
            </div>
          </div>

          <div id="pat-status-badge" style="display:none;margin-bottom:8px;"></div>
        </div>

        <!-- AI Section -->
        <div class="settings-section">
          <div class="settings-section-title">AI — Anthropic Claude</div>

          <div class="form-group">
            <label for="set-anthropic-key">Anthropic API Key</label>
            <div class="input-with-toggle">
              <input type="password" id="set-anthropic-key" placeholder="sk-ant-…" autocomplete="off" />
              <button class="input-toggle-btn" id="toggle-ai-key" title="Show/hide key">
                <svg id="eye-ai-show" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M1 8 C3 4 6 2 8 2 C10 2 13 4 15 8 C13 12 10 14 8 14 C6 14 3 12 1 8Z"/>
                  <circle cx="8" cy="8" r="2.5"/>
                </svg>
                <svg id="eye-ai-hide" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="display:none;">
                  <path d="M1 8 C3 4 6 2 8 2 C10 2 13 4 15 8"/>
                  <line x1="2" y1="2" x2="14" y2="14"/>
                </svg>
              </button>
            </div>
            <div class="settings-hint">
              Get your key from <a href="#" id="link-anthropic-key" style="color:var(--accent);text-decoration:none;">console.anthropic.com → API Keys</a><br/>
              Used by: <strong style="color:var(--text-secondary);">Copilot, Mail Inbox, Messages</strong>
              &nbsp;·&nbsp; Model: <strong style="color:var(--accent);">claude-sonnet-4-6</strong>
            </div>
          </div>
          <div id="ai-key-status-badge" style="display:none;margin-bottom:8px;"></div>
        </div>

        <!-- Outlook Integration Section -->
        <div class="settings-section">
          <div class="settings-section-title">Outlook Integration — Microsoft Graph</div>

          <!-- Status display -->
          <div id="outlook-status-area" style="margin-bottom:8px;"></div>
          <div id="outlook-last-error" style="display:none;font-size:11px;color:#f85149;background:#f8514912;border:1px solid #f8514930;border-radius:5px;padding:6px 10px;margin-bottom:10px;"></div>

          <div class="form-group">
            <label for="set-ms-client-id">Microsoft Client ID</label>
            <input type="text" id="set-ms-client-id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" />
            <div class="settings-hint">Azure App Registration → Overview → Application (client) ID</div>
          </div>

          <div class="form-group">
            <label for="set-ms-tenant-id">Tenant ID</label>
            <input type="text" id="set-ms-tenant-id" placeholder="common (or your tenant ID)" autocomplete="off" />
            <div class="settings-hint">Leave <strong>common</strong> for multi-tenant, or paste your org Tenant ID</div>
          </div>

          <div class="form-group">
            <label for="set-ms-redirect-uri">Redirect URI</label>
            <input type="text" id="set-ms-redirect-uri" placeholder="http://localhost:3456" autocomplete="off" />
            <div class="settings-hint">Must match the Redirect URI registered in Azure Portal (type: Web)</div>
          </div>

          <div class="form-group">
            <label for="set-ms-auth-method">Auth Method</label>
            <select id="set-ms-auth-method" style="background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:6px;color:var(--text-primary);font-size:13px;padding:7px 10px;width:100%;">
              <option value="devicecode">Device Code (recommended — no redirect needed)</option>
              <option value="msal">MSAL Interactive (requires redirect URI)</option>
            </select>
            <div class="settings-hint">Device Code opens a browser and shows a code to paste. MSAL uses a redirect flow.</div>
          </div>

          <!-- Required scopes (read-only) -->
          <div class="form-group">
            <label>Required Scopes</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
              ${['Mail.Read','User.Read','offline_access'].map(s =>
                `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;background:var(--accent)18;color:var(--accent);border:1px solid var(--accent)33;">${s}</span>`
              ).join('')}
            </div>
            <div class="settings-hint">Add these under Azure App Registration → API Permissions → Microsoft Graph → Delegated</div>
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;margin-top:4px;margin-bottom:8px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-outlook-connect">🔗 Connect Outlook</button>
            <button class="btn" id="btn-outlook-test">🔍 Test Connection</button>
            <button class="btn" id="btn-outlook-clear" style="color:#f85149;border-color:#f8514955;">🗑 Clear Config</button>
            <button class="btn" id="btn-outlook-disconnect" style="display:none;">Disconnect</button>
          </div>

          <div class="settings-hint" style="margin-top:0;">
            Need to register an app?
            <a href="#" id="link-azure-portal" style="color:var(--accent);text-decoration:none;">Azure Portal → App Registrations</a><br/>
            Manual input mode (Mail tab → ✏ Manual) works without Outlook credentials.
          </div>

          <div class="settings-section-title" style="margin-top:16px;font-size:11px;">Email Scan Settings</div>

          <div class="form-group">
            <label for="set-mail-interval">Auto-scan interval</label>
            <select id="set-mail-interval" style="background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:6px;color:var(--text-primary);font-size:13px;padding:7px 10px;width:100%;">
              <option value="1">Every 1 minute</option>
              <option value="2" selected>Every 2 minutes</option>
              <option value="5">Every 5 minutes</option>
              <option value="0">Manual only</option>
            </select>
          </div>

          <div class="form-group">
            <label for="set-mail-days">Fetch last</label>
            <select id="set-mail-days" style="background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:6px;color:var(--text-primary);font-size:13px;padding:7px 10px;width:100%;">
              <option value="7" selected>7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          <div class="form-group">
            <label for="set-mail-keywords">Change Request Keywords</label>
            <textarea id="set-mail-keywords" rows="3" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:6px;color:var(--text-primary);font-size:12px;padding:8px 10px;box-sizing:border-box;font-family:inherit;resize:vertical;" placeholder="change request, cr , heloc, empower, bsa, requirement…"></textarea>
            <div class="settings-hint">Comma-separated. Emails containing these keywords are shown in the <strong>Change Requests</strong> tab. Leave blank to use defaults.</div>
          </div>
        </div>

        <!-- Profile Section -->
        <div class="settings-section">
          <div class="settings-section-title">Profile</div>

          <div class="form-group">
            <label for="set-username">Your Name</label>
            <input type="text" id="set-username" placeholder="Your name" />
            <div class="settings-hint">Displayed in the status bar and used in AI-generated messages.</div>
          </div>
        </div>

        <!-- About Section -->
        <div class="settings-section">
          <div class="settings-section-title">About</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Application</div>
              <div style="font-size:13px;color:var(--text-primary);">BSA Ops Hub</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Version</div>
              <div style="font-size:13px;color:var(--text-primary);">1.0.0</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Organization</div>
              <div style="font-size:13px;color:var(--text-primary);">The Loan Exchange</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">LOS</div>
              <div style="font-size:13px;color:var(--text-primary);">Empower</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">PM</div>
              <div style="font-size:13px;color:var(--text-primary);">Jason Goliver</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Developer</div>
              <div style="font-size:13px;color:var(--text-primary);">Paul Yap</div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div style="display:flex;align-items:center;gap:12px;padding-bottom:32px;">
          <button class="btn btn-primary" id="btn-save-settings" style="min-width:140px;">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 12V3l2-2h5l1 1v3H5v1h5v1H5v1h5l1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>
              <rect x="5" y="8" width="4" height="3"/>
            </svg>
            Save Settings
          </button>
          <span id="settings-save-status" style="font-size:12px;color:var(--text-muted);"></span>
        </div>

      </div>
    `;

    // Populate from current settings
    const settings = window.appSettings || {};

    const patInput      = document.getElementById('set-ado-pat');
    const userInput     = document.getElementById('set-username');
    const aiKeyInput    = document.getElementById('set-anthropic-key');
    const clientIdEl    = document.getElementById('set-ms-client-id');
    const tenantIdEl    = document.getElementById('set-ms-tenant-id');
    const redirectUriEl = document.getElementById('set-ms-redirect-uri');
    const authMethodEl  = document.getElementById('set-ms-auth-method');
    const intervalEl    = document.getElementById('set-mail-interval');
    const daysEl        = document.getElementById('set-mail-days');
    const keywordsEl    = document.getElementById('set-mail-keywords');

    if (patInput && settings.adoPat)          patInput.value      = settings.adoPat;
    if (userInput)                             userInput.value     = settings.userName || 'Meher Viguturi';
    if (aiKeyInput && settings.anthropicKey)   aiKeyInput.value    = settings.anthropicKey;
    if (clientIdEl && settings.msClientId)     clientIdEl.value    = settings.msClientId;
    if (tenantIdEl)                            tenantIdEl.value    = settings.msTenantId || 'common';
    if (redirectUriEl)                         redirectUriEl.value = settings.msRedirectUri || 'http://localhost:3456';
    if (authMethodEl && settings.msAuthMethod) authMethodEl.value  = settings.msAuthMethod;
    if (intervalEl && settings.mailScanInterval) intervalEl.value = String(settings.mailScanInterval);
    if (daysEl && settings.mailFetchDays)       daysEl.value    = String(settings.mailFetchDays);
    if (keywordsEl && settings.mailKeywords)    keywordsEl.value = settings.mailKeywords;

    // Show PAT status badge
    updatePatStatus(settings.adoPat);
    updateAiKeyStatus(settings.anthropicKey);
    refreshOutlookStatus();

    // Wire up events
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

    // Outlook connect / test / clear / disconnect
    document.getElementById('btn-outlook-connect')?.addEventListener('click', connectOutlook);
    document.getElementById('btn-outlook-test')?.addEventListener('click', testConnection);
    document.getElementById('btn-outlook-clear')?.addEventListener('click', clearOutlookConfig);
    document.getElementById('btn-outlook-disconnect')?.addEventListener('click', disconnectOutlook);

    // Azure portal link
    document.getElementById('link-azure-portal')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.shell.openExternal('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade');
    });

    // Toggle PAT visibility
    document.getElementById('toggle-pat').addEventListener('click', () => toggleVisibility('set-ado-pat', 'eye-pat-show', 'eye-pat-hide'));

    // Toggle AI key visibility
    document.getElementById('toggle-ai-key').addEventListener('click', () => toggleVisibility('set-anthropic-key', 'eye-ai-show', 'eye-ai-hide'));

    // External links
    document.getElementById('link-ado-pat').addEventListener('click', (e) => {
      e.preventDefault();
      window.api.shell.openExternal('https://dev.azure.com/TheLoanExchange/_usersSettings/tokens');
    });

    document.getElementById('link-anthropic-key').addEventListener('click', (e) => {
      e.preventDefault();
      window.api.shell.openExternal('https://console.anthropic.com/settings/keys');
    });

    // Live status on input
    if (patInput) {
      patInput.addEventListener('input', () => updatePatStatus(patInput.value));
    }
    if (aiKeyInput) {
      aiKeyInput.addEventListener('input', () => updateAiKeyStatus(aiKeyInput.value));
    }
  }

  // ============================================================
  // Outlook Integration helpers
  // ============================================================

  function setOutlookError(msg) {
    const el = document.getElementById('outlook-last-error');
    if (!el) return;
    if (msg) { el.style.display = ''; el.textContent = '⚠ Last error: ' + msg; }
    else      { el.style.display = 'none'; el.textContent = ''; }
  }

  async function refreshOutlookStatus() {
    const area         = document.getElementById('outlook-status-area');
    const connectBtn   = document.getElementById('btn-outlook-connect');
    const disconnectBtn= document.getElementById('btn-outlook-disconnect');
    if (!area) return;
    try {
      const status = await window.api.mail.getStatus();
      if (status.connected) {
        area.innerHTML = `<div class="outlook-status-connected">✅ Connected — ${status.email}</div>`;
        if (connectBtn)    connectBtn.style.display    = 'none';
        if (disconnectBtn) disconnectBtn.style.display = '';
        setOutlookError(null);
      } else {
        area.innerHTML = `<div class="outlook-status-disconnected">Not connected — manual input mode active</div>`;
        if (connectBtn)    connectBtn.style.display    = '';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
      }
    } catch (e) {
      area.innerHTML = `<div class="outlook-status-disconnected">Status unavailable</div>`;
      setOutlookError(e.message);
    }
  }

  async function connectOutlook() {
    const btn        = document.getElementById('btn-outlook-connect');
    const area       = document.getElementById('outlook-status-area');
    const clientId   = document.getElementById('set-ms-client-id')?.value.trim();
    const tenantId   = document.getElementById('set-ms-tenant-id')?.value.trim() || 'common';
    const authMethod = document.getElementById('set-ms-auth-method')?.value || 'devicecode';

    if (!clientId) { window.showToast?.('Enter your Microsoft Client ID first.', 'error'); return; }

    await window.api.settings.set('msClientId',   clientId);
    await window.api.settings.set('msTenantId',   tenantId);
    await window.api.settings.set('msAuthMethod', authMethod);
    window.appSettings = { ...window.appSettings, msClientId: clientId, msTenantId: tenantId, msAuthMethod: authMethod };

    if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
    if (area) area.innerHTML = `<div class="outlook-status-disconnected">Waiting for authentication…</div>`;
    setOutlookError(null);

    try {
      let res;
      if (authMethod === 'devicecode') {
        const init = await window.api.mail.deviceCodeInit();
        if (init.error) throw new Error(init.error);
        area.innerHTML = `<div class="outlook-status-disconnected">
          Open <strong>aka.ms/devicelogin</strong> and enter code:
          <span style="font-size:16px;font-weight:700;letter-spacing:3px;color:var(--text-primary);background:var(--bg-tertiary);padding:2px 10px;border-radius:4px;margin-left:6px;">${init.userCode}</span>
        </div>`;
        res = await window.api.mail.deviceCodePoll(init.deviceCode);
      } else {
        res = await window.api.mail.auth({ clientId, tenantId });
      }

      if (res?.success || res?.email) {
        area.innerHTML = `<div class="outlook-status-connected">✅ Connected — ${res.email}</div>`;
        document.getElementById('btn-outlook-disconnect').style.display = '';
        if (btn) btn.style.display = 'none';
        window.showToast?.('✅ Outlook connected as ' + res.email, 'success');
      } else {
        const err = res?.error || 'Unknown error';
        area.innerHTML = `<div class="outlook-status-disconnected">Connection failed</div>`;
        setOutlookError(err);
        window.showToast?.('Outlook connection failed: ' + err, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🔗 Connect Outlook'; }
      }
    } catch (e) {
      area.innerHTML = `<div class="outlook-status-disconnected">Connection error</div>`;
      setOutlookError(e.message);
      if (btn) { btn.disabled = false; btn.textContent = '🔗 Connect Outlook'; }
    }
  }

  async function testConnection() {
    const btn = document.getElementById('btn-outlook-test');
    if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
    try {
      const status = await window.api.mail.getStatus();
      if (status.connected) {
        window.showToast?.('✅ Outlook connection is active — ' + status.email, 'success');
        setOutlookError(null);
      } else {
        window.showToast?.('Outlook not connected. Use Connect Outlook to authenticate.', 'info');
      }
      refreshOutlookStatus();
    } catch (e) {
      setOutlookError(e.message);
      window.showToast?.('Test failed: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Test Connection'; }
    }
  }

  async function clearOutlookConfig() {
    if (!confirm('Clear all Outlook credentials and disconnect?')) return;
    await window.api.mail.disconnect();
    await window.api.settings.set('msClientId',    '');
    await window.api.settings.set('msTenantId',    'common');
    await window.api.settings.set('msRedirectUri', 'http://localhost:3456');
    await window.api.settings.set('msAuthMethod',  'devicecode');
    window.appSettings = { ...window.appSettings, msClientId: '', msTenantId: 'common', msRedirectUri: 'http://localhost:3456', msAuthMethod: 'devicecode' };
    document.getElementById('set-ms-client-id').value    = '';
    document.getElementById('set-ms-tenant-id').value    = 'common';
    document.getElementById('set-ms-redirect-uri').value = 'http://localhost:3456';
    document.getElementById('set-ms-auth-method').value  = 'devicecode';
    setOutlookError(null);
    refreshOutlookStatus();
    window.showToast?.('Outlook config cleared. Manual mode is still available.', 'info');
  }

  async function disconnectOutlook() {
    await window.api.mail.disconnect();
    refreshOutlookStatus();
    window.showToast?.('Outlook disconnected', 'info');
  }

  // ============================================================
  // Toggle Password Visibility
  // ============================================================

  function toggleVisibility(inputId, showIconId, hideIconId) {
    const input = document.getElementById(inputId);
    const showIcon = document.getElementById(showIconId);
    const hideIcon = document.getElementById(hideIconId);

    if (!input) return;

    if (input.type === 'password') {
      input.type = 'text';
      if (showIcon) showIcon.style.display = 'none';
      if (hideIcon) hideIcon.style.display = '';
    } else {
      input.type = 'password';
      if (showIcon) showIcon.style.display = '';
      if (hideIcon) hideIcon.style.display = 'none';
    }
  }

  // ============================================================
  // PAT Status Badge
  // ============================================================

  function updatePatStatus(pat) {
    const badge = document.getElementById('pat-status-badge');
    if (!badge) return;

    if (pat && pat.trim().length > 10) {
      badge.style.display = '';
      badge.innerHTML = `<span class="badge badge-active" style="font-size:12px;">✓ PAT configured</span>`;
    } else if (pat && pat.trim().length > 0) {
      badge.style.display = '';
      badge.innerHTML = `<span class="badge badge-pending" style="font-size:12px;">⚠ PAT looks incomplete</span>`;
    } else {
      badge.style.display = '';
      badge.innerHTML = `<span class="badge badge-removed" style="font-size:12px;">✗ No PAT configured</span>`;
    }
  }

  // ============================================================
  // AI Key Status Badge
  // ============================================================

  function updateAiKeyStatus(key) {
    const badge = document.getElementById('ai-key-status-badge');
    if (!badge) return;
    if (key && key.trim().startsWith('sk-ant-')) {
      badge.style.display = '';
      badge.innerHTML = `<span class="badge badge-active" style="font-size:12px;">✓ API key configured</span>`;
    } else if (key && key.trim().length > 0) {
      badge.style.display = '';
      badge.innerHTML = `<span class="badge badge-pending" style="font-size:12px;">⚠ Key format unexpected (should start with sk-ant-)</span>`;
    } else {
      badge.style.display = '';
      badge.innerHTML = `<span class="badge badge-removed" style="font-size:12px;">✗ No API key configured</span>`;
    }
  }

  // ============================================================
  // Save Settings
  // ============================================================

  async function saveSettings() {
    const btn = document.getElementById('btn-save-settings');
    const statusEl = document.getElementById('settings-save-status');

    const patInput      = document.getElementById('set-ado-pat');
    const userInput     = document.getElementById('set-username');
    const aiKeyInput    = document.getElementById('set-anthropic-key');
    const clientIdEl    = document.getElementById('set-ms-client-id');
    const tenantIdEl    = document.getElementById('set-ms-tenant-id');
    const redirectUriEl = document.getElementById('set-ms-redirect-uri');
    const authMethodEl  = document.getElementById('set-ms-auth-method');
    const intervalEl    = document.getElementById('set-mail-interval');
    const daysEl        = document.getElementById('set-mail-days');
    const keywordsEl    = document.getElementById('set-mail-keywords');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }

    try {
      const updates = {
        adoPat:           (patInput || {}).value || '',
        userName:         ((userInput || {}).value || 'Meher Viguturi').trim(),
        anthropicKey:     (aiKeyInput || {}).value?.trim() || '',
        msClientId:       (clientIdEl || {}).value?.trim()    || '',
        msTenantId:       (tenantIdEl || {}).value?.trim()    || 'common',
        msRedirectUri:    (redirectUriEl || {}).value?.trim() || 'http://localhost:3456',
        msAuthMethod:     (authMethodEl || {}).value          || 'devicecode',
        mailScanInterval: parseInt((intervalEl || {}).value) || 2,
        mailFetchDays:    parseInt((daysEl || {}).value) || 7,
        mailKeywords:     (keywordsEl || {}).value?.trim() || '',
      };

      await window.api.settings.set('adoPat',           updates.adoPat);
      await window.api.settings.set('userName',         updates.userName);
      await window.api.settings.set('anthropicKey',     updates.anthropicKey);
      await window.api.settings.set('msClientId',       updates.msClientId);
      await window.api.settings.set('msTenantId',       updates.msTenantId);
      await window.api.settings.set('msRedirectUri',    updates.msRedirectUri);
      await window.api.settings.set('msAuthMethod',     updates.msAuthMethod);
      await window.api.settings.set('mailScanInterval', updates.mailScanInterval);
      await window.api.settings.set('mailFetchDays',    updates.mailFetchDays);
      await window.api.settings.set('mailKeywords',     updates.mailKeywords);

      // Update global settings
      window.appSettings = { ...window.appSettings, ...updates };

      // Update status bar user
      const userEl = document.getElementById('status-user');
      if (userEl) userEl.textContent = updates.userName;

      // Update connection status
      const hasPat = !!(updates.adoPat && updates.adoPat.trim());
      const dotEl = document.getElementById('status-indicator');
      const textEl = document.getElementById('status-text');
      if (dotEl) dotEl.classList.toggle('error', !hasPat);
      if (textEl) textEl.textContent = hasPat ? 'Connected to ADO' : 'ADO PAT not configured';

      updatePatStatus(updates.adoPat);
      updateAiKeyStatus(updates.anthropicKey);

      if (statusEl) {
        statusEl.style.color = 'var(--green)';
        statusEl.textContent = '✓ Settings saved successfully';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
      }

      try { Sounds.complete(); } catch (e) { /* silent */ }
      window.showToast('Settings saved!', 'success');

    } catch (err) {
      if (statusEl) {
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = '✗ Save failed: ' + err.message;
      }
      window.showToast('Save failed: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 12V3l2-2h5l1 1v3H5v1h5v1H5v1h5l1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>
            <rect x="5" y="8" width="4" height="3"/>
          </svg>
          Save Settings
        `;
      }
    }
  }

  // ============================================================
  // Self-register
  // ============================================================

  window.Modules = window.Modules || {};
  window.Modules.settings = {
    render,
    cleanup() {}
  };

})();
