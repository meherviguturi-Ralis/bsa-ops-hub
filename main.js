const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// ── MSAL (optional — graceful if missing) ───────────────────
let msalNode = null;
try { msalNode = require('@azure/msal-node'); } catch (e) { /* not installed */ }

// ── Microsoft Graph — in-memory token state ─────────────────
let _msalApp   = null;
let _msalToken = null;
let _msalEmail = '';

function graphRequest(method, url, body) {
  return new Promise((resolve) => {
    if (!_msalToken) { resolve({ error: 'Not authenticated' }); return; }
    const urlObj = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        Authorization: `Bearer ${_msalToken.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (!data.trim() || res.statusCode === 204) { resolve({ success: true }); return; }
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: `HTTP ${res.statusCode}: ${data.slice(0,200)}` }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'Graph request timed out' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function refreshTokenSilently() {
  if (!_msalApp || !_msalToken) return;
  try {
    const fresh = await _msalApp.acquireTokenSilent({
      account: _msalToken.account,
      scopes: ['Mail.Read', 'Mail.ReadWrite', 'User.Read'],
    });
    if (fresh) _msalToken = fresh;
  } catch (e) { /* token may still be valid */ }
}

let Store;
let store;
let mainWindow;

async function initStore() {
  Store = (await import('electron-store')).default;
  store = new Store({
    defaults: {
      adoOrg: 'TheLoanExchange',
      adoProject: 'TLE.Empower',
      userName: 'Meher Viguturi',
      adoPat: '',
      anthropicKey: '',
      msClientId:    '',
      msTenantId:    'common',
      msRedirectUri: 'http://localhost:3456',
      msAuthMethod:  'devicecode',
      mailScanInterval: 2,
      mailFetchDays: 7,
      mailKeywords: '',
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d1117',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  await initStore();

  // Window control handlers
  ipcMain.on('app:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('app:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('app:close', () => {
    if (mainWindow) mainWindow.close();
  });

  // Settings handlers
  ipcMain.handle('settings:get', () => {
    return store.store;
  });

  ipcMain.handle('settings:set', (event, { key, value }) => {
    store.set(key, value);
    return true;
  });

  // ADO request handler
  ipcMain.handle('ado:request', (event, { method, url, pat, body, contentType }) => {
    return new Promise((resolve, reject) => {
      try {
        const token = Buffer.from(`:${pat}`).toString('base64');
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: method || 'GET',
          headers: {
            'Authorization': `Basic ${token}`,
            'Content-Type': contentType || 'application/json',
            'Accept': 'application/json'
          }
        };

        const reqBody = body ? JSON.stringify(body) : null;
        if (reqBody) {
          options.headers['Content-Length'] = Buffer.byteLength(reqBody);
        }

        const req = https.request(options, (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            const status = res.statusCode;
            if (status === 401) {
              resolve({ error: 'Authentication failed (401) — your ADO PAT may be expired or invalid. Please update it in Settings.' });
              return;
            }
            if (status === 403) {
              resolve({ error: 'Access denied (403) — your ADO PAT may not have the required Work Items (Read & Write) scope.' });
              return;
            }
            if (!data.trim()) {
              resolve({ error: `Empty response from ADO (HTTP ${status})` });
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({ error: `HTTP ${status} — unexpected response: ${data.slice(0, 200)}` });
            }
          });
        });

        req.on('error', (err) => {
          resolve({ error: err.message });
        });

        req.setTimeout(15000, () => {
          req.destroy();
          resolve({ error: 'Request timed out' });
        });

        if (reqBody) {
          req.write(reqBody);
        }
        req.end();
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  });

  // AI complete handler — calls Anthropic REST API directly
  ipcMain.handle('ai:complete', (event, { messages, system, model, apiKey }) => {
    return new Promise((resolve) => {
      const key = apiKey || store.get('anthropicKey') || '';
      if (!key) {
        resolve({ error: 'Anthropic API key not configured. Add it in Settings.' });
        return;
      }

      const payload = {
        model: model || 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: messages || [],
      };
      if (system) payload.system = system;

      const body = JSON.stringify(payload);

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      let data = '';

      const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              resolve({ error: parsed.error.message || 'Anthropic API error' });
            } else {
              resolve({ content: parsed.content });
            }
          } catch (e) {
            resolve({ error: `Failed to parse API response: ${data.slice(0, 300)}` });
          }
        });
      });

      req.setTimeout(60000, () => {
        req.destroy();
        resolve({ error: 'AI request timed out after 60s' });
      });

      req.on('error', (err) => {
        resolve({ error: err.message });
      });

      req.write(body);
      req.end();
    });
  });

  // MCP: persist current manual input so mcp-server.js can read it
  ipcMain.handle('mail:setInputEmail', (event, { subject, body }) => {
    try {
      const dir = app.getPath('userData');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'current-input.json'), JSON.stringify({ subject, body }), 'utf8');
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // File system handlers
  ipcMain.handle('fs:write', (event, { filePath, content }) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('fs:saveDialog', async (event, { filename, content }) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:openDialog', async (event, { filters }) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters: filters || [{ name: 'All Files', extensions: ['*'] }],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false };
      }

      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf8');
      const name = path.basename(filePath);
      return { success: true, content, path: filePath, name };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Shell open external
  ipcMain.handle('shell:openExternal', (event, url) => {
    shell.openExternal(url);
    return true;
  });

  // ── Mail: auth via MSAL auth-code + PKCE ─────────────────
  ipcMain.handle('mail:auth', async (event, { clientId, tenantId }) => {
    if (!msalNode) return { error: '@azure/msal-node not found. Run: npm install @azure/msal-node' };
    const { PublicClientApplication, CryptoProvider } = msalNode;
    const crypto = new CryptoProvider();
    const id = (clientId || store.get('msClientId') || '').trim();
    const tenant = (tenantId || store.get('msTenantId') || 'common').trim();
    if (!id) return { error: 'Microsoft Client ID not configured. Add it in Settings.' };

    const pca = new PublicClientApplication({
      auth: { clientId: id, authority: `https://login.microsoftonline.com/${tenant}` },
    });
    const port = 3456;
    const redirectUri = `http://localhost:${port}`;
    const scopes = ['Mail.Read', 'Mail.ReadWrite', 'User.Read'];

    return new Promise((resolve) => {
      let done = false;
      let pkceCodes = null;

      const server = http.createServer(async (req, res) => {
        if (done) return;
        try {
          const u = new URL(req.url, redirectUri);
          const code = u.searchParams.get('code');
          const err  = u.searchParams.get('error');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="font-family:sans-serif;padding:40px;background:#0d1117;color:#e6edf3"><h2>✅ Authentication complete</h2><p>Return to BSA Ops Hub.</p></body></html>');
          done = true;
          clearTimeout(tmo);
          server.close();
          if (err || !code) { resolve({ error: err || 'No auth code received' }); return; }
          const tokenRes = await pca.acquireTokenByCode({
            code, redirectUri, scopes,
            codeVerifier: pkceCodes?.verifier,
          });
          _msalApp   = pca;
          _msalToken = tokenRes;
          _msalEmail = tokenRes.account?.username || tokenRes.account?.name || '';
          resolve({ success: true, email: _msalEmail });
        } catch (e) { resolve({ error: e.message }); }
      });

      const tmo = setTimeout(() => {
        if (!done) { done = true; server.close(); resolve({ error: 'Auth timed out (5 min)' }); }
      }, 5 * 60 * 1000);

      server.on('error', (e) => {
        done = true; clearTimeout(tmo);
        resolve({ error: `Auth server error: ${e.message}` });
      });

      server.listen(port, async () => {
        try {
          pkceCodes = await crypto.generatePkceCodes();
          const authUrl = await pca.getAuthCodeUrl({
            scopes, redirectUri,
            codeChallenge: pkceCodes.challenge,
            codeChallengeMethod: 'S256',
          });
          shell.openExternal(authUrl);
        } catch (e) { server.close(); done = true; resolve({ error: e.message }); }
      });
    });
  });

  function formPost(url, params) {
    return new Promise((resolve) => {
      const body = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      const urlObj = new URL(url);
      const opts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ error: `HTTP ${res.statusCode}` }); } });
      });
      req.on('error', e => resolve({ error: e.message }));
      req.setTimeout(20000, () => { req.destroy(); resolve({ error: 'Request timed out' }); });
      req.write(body);
      req.end();
    });
  }

  ipcMain.handle('mail:devicecode-init', async () => {
    const clientId = (store.get('msClientId') || '04b07795-8ddb-461a-bbee-02f9e1bf7b46').trim();
    const res = await formPost('https://login.microsoftonline.com/common/oauth2/v2.0/devicecode', {
      client_id: clientId,
      scope: 'Mail.Read Mail.ReadWrite User.Read offline_access',
    });
    if (!res.user_code) return { error: res.error_description || res.error || 'Device code request failed' };
    return { user_code: res.user_code, verification_uri: res.verification_uri, device_code: res.device_code, expires_in: res.expires_in || 900, interval: res.interval || 5 };
  });

  ipcMain.handle('mail:devicecode-poll', async (event, { deviceCode }) => {
    const clientId = (store.get('msClientId') || '04b07795-8ddb-461a-bbee-02f9e1bf7b46').trim();
    const res = await formPost('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    });
    if (res.error === 'authorization_pending' || res.error === 'slow_down') return { pending: true };
    if (res.error === 'expired_token') return { error: 'Code expired. Please try again.' };
    if (res.error) return { error: res.error_description || res.error };
    if (!res.access_token) return { error: 'No access token received' };
    _msalToken = { accessToken: res.access_token };
    try {
      const me = await graphRequest('GET', 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName');
      _msalEmail = me.mail || me.userPrincipalName || me.displayName || '';
    } catch { _msalEmail = ''; }
    return { success: true, email: _msalEmail };
  });

  ipcMain.handle('mail:getStatus', () => ({
    connected: !!_msalToken,
    email: _msalEmail,
  }));

  ipcMain.handle('mail:disconnect', () => {
    _msalApp = null; _msalToken = null; _msalEmail = '';
    return { success: true };
  });

  ipcMain.handle('mail:getMessages', async (event, { days, top }) => {
    await refreshTokenSilently();
    const since = new Date(Date.now() - (days || 7) * 86400000).toISOString();
    const sel = 'id,subject,from,receivedDateTime,bodyPreview,body,isRead,importance,conversationId';
    const url = `https://graph.microsoft.com/v1.0/me/messages` +
      `?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}` +
      `&$select=${sel}` +
      `&$orderby=${encodeURIComponent('receivedDateTime desc')}` +
      `&$top=${top || 50}`;
    return graphRequest('GET', url);
  });

  ipcMain.handle('mail:markRead', async (event, { emailId }) => {
    await refreshTokenSilently();
    return graphRequest('PATCH',
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
      { isRead: true });
  });

  ipcMain.handle('mail:getUnreadCount', async () => {
    await refreshTokenSilently();
    return graphRequest('GET',
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=unreadItemCount');
  });

  ipcMain.handle('mail:getConversation', async (event, { conversationId }) => {
    await refreshTokenSilently();
    if (!conversationId) return { value: [] };
    const sel = 'id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,conversationId';
    const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
    const url = `https://graph.microsoft.com/v1.0/me/messages?$filter=${filter}&$select=${sel}&$orderby=${encodeURIComponent('receivedDateTime asc')}&$top=20`;
    return graphRequest('GET', url);
  });

  ipcMain.handle('mail:getAttachments', async (event, { messageId }) => {
    await refreshTokenSilently();
    const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=id,name,size,contentBytes,contentType,isInline`;
    return graphRequest('GET', url);
  });

  ipcMain.handle('mail:saveAttachment', async (event, { filename, contentBytes }) => {
    try {
      const docsDir = path.join(app.getPath('userData'), 'bsa-documents');
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
      const safe = filename.replace(/[/\\?%*:|"<>]/g, '_');
      const filePath = path.join(docsDir, safe);
      fs.writeFileSync(filePath, Buffer.from(contentBytes, 'base64'));
      return { success: true, filePath };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('shell:openPath', (event, filePath) => {
    shell.openPath(filePath);
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
