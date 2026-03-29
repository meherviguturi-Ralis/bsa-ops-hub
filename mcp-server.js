#!/usr/bin/env node
'use strict';

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const https = require('https');

// Matches app.getPath('userData') in Electron for app name 'bsa-ops-hub'
const STATE_FILE   = path.join(os.homedir(), 'AppData', 'Roaming', 'bsa-ops-hub', 'current-input.json');
const VAULT_BASE   = 'C:/ObsidianVault/BSA Ops Hub';
const ALLOWED_FOLDERS = ['Knowledge', 'Empower', 'Testing'];

const CONFIG_FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'bsa-ops-hub', 'config.json');

function getAdoSettings() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      org:     cfg.adoOrg     || 'TheLoanExchange',
      project: cfg.adoProject || 'TLE.Empower',
      pat:     cfg.adoPat     || '',
    };
  } catch {
    return { org: 'TheLoanExchange', project: 'TLE.Empower', pat: '' };
  }
}

function buildTicketHtml(t) {
  const emp = t.empower || {};
  let h = '';
  h += `<h3>Summary</h3><p>${(t.summary || '').replace(/\n/g, '<br/>')}</p>`;
  h += `<h3>Change Request</h3><ul>${(t.change_request || []).map(c => `<li>${c}</li>`).join('')}</ul>`;
  h += `<h3>Acceptance Criteria</h3><ul>${(t.acceptance_criteria || []).map(a => `<li>${a}</li>`).join('')}</ul>`;
  h += `<h3>BSA Notes</h3><ul>${(t.bsa_notes || []).map(n => `<li>${n}</li>`).join('')}</ul>`;
  const missing = (t.missing_requirements || []).filter(p => p.trim());
  if (missing.length) h += `<h3>⚠ Missing Requirements</h3><ul>${missing.map(p => `<li>${p}</li>`).join('')}</ul>`;
  h += `<h3>Empower</h3>`;
  if (emp.module)     h += `<p><strong>Module:</strong> ${emp.module}</p>`;
  if (emp.screen)     h += `<p><strong>Screen:</strong> ${emp.screen}</p>`;
  if (emp.logic_type) h += `<p><strong>Logic:</strong> ${emp.logic_type}</p>`;
  if ((emp.fields || []).length) h += `<ul>${emp.fields.map(f => `<li>${f}</li>`).join('')}</ul>`;
  return h;
}

function adoRequest(url, pat, body) {
  return new Promise((resolve) => {
    const token   = Buffer.from(`:${pat}`).toString('base64');
    const urlObj  = new URL(url);
    const reqBody = JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Authorization':  `Basic ${token}`,
        'Content-Type':   'application/json-patch+json',
        'Accept':         'application/json',
        'Content-Length': Buffer.byteLength(reqBody),
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401) return resolve({ error: 'ADO auth failed (401) — check your PAT.' });
        if (res.statusCode === 403) return resolve({ error: 'ADO access denied (403) — PAT missing Work Items scope.' });
        try { resolve(JSON.parse(data)); } catch { resolve({ error: `HTTP ${res.statusCode} — ${data.slice(0, 200)}` }); }
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'Request timed out' }); });
    req.write(reqBody);
    req.end();
  });
}

async function createAdoTicket(data) {
  const { org, project, pat } = getAdoSettings();
  if (!pat) return { success: false, error: 'ADO PAT not configured. Set it in BSA Ops Hub Settings.' };
  const patchBody = [
    { op: 'add', path: '/fields/System.Title',       value: (data.title || 'Dev Ticket').slice(0, 120) },
    { op: 'add', path: '/fields/System.Description', value: buildTicketHtml(data) },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: 2 },
    { op: 'add', path: '/fields/System.Tags',        value: 'email-ticket' },
  ];
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$User%20Story?api-version=7.0`;
  const res = await adoRequest(url, pat, patchBody);
  if (res.error || !res.id) return { success: false, error: res.error || 'Unknown ADO error' };
  return {
    success: true,
    id:  String(res.id),
    url: `https://dev.azure.com/${org}/${project}/_workitems/edit/${res.id}`,
  };
}

function safeName(s) {
  return (s || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
}

function saveObsidianNote({ folder, filename, content }) {
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return { success: false, error: `Folder "${folder}" not allowed. Use: ${ALLOWED_FOLDERS.join(', ')}` };
  }
  let name = safeName(filename);
  if (!name.endsWith('.md')) name += '.md';
  const fullPath = path.join(VAULT_BASE, folder, name);
  try {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return { success: true, path: fullPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

const server = new Server(
  { name: 'bsa-ops-hub', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_input_change_request',
      description: 'Returns the manually entered email (subject + body) from BSA Ops Hub.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'create_ado_ticket',
      description: 'Creates an ADO User Story from a structured BSA ticket.',
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title:                { type: 'string' },
          summary:              { type: 'string' },
          change_request:       { type: 'array',  items: { type: 'string' } },
          acceptance_criteria:  { type: 'array',  items: { type: 'string' } },
          bsa_notes:            { type: 'array',  items: { type: 'string' } },
          missing_requirements: { type: 'array',  items: { type: 'string' } },
          empower: {
            type: 'object',
            properties: {
              module:     { type: 'string' },
              screen:     { type: 'string' },
              fields:     { type: 'array', items: { type: 'string' } },
              logic_type: { type: 'string' }
            }
          }
        }
      }
    },
    {
      name: 'save_obsidian_note',
      description: 'Saves a markdown note to the BSA Ops Hub Obsidian vault.',
      inputSchema: {
        type: 'object',
        required: ['folder', 'filename', 'content'],
        properties: {
          folder:   { type: 'string', description: 'Vault subfolder: Knowledge | Empower | Testing' },
          filename: { type: 'string', description: 'File name (without or with .md)' },
          content:  { type: 'string', description: 'Markdown content to write' }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'get_input_change_request') {
    try {
      const raw  = fs.readFileSync(STATE_FILE, 'utf8');
      const data = JSON.parse(raw);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ subject: data.subject || '', body: data.body || '' })
          }
        ]
      };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'No input provided' })
          }
        ]
      };
    }
  }

  if (name === 'create_ado_ticket') {
    const result = await createAdoTicket(args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result)
        }
      ]
    };
  }

  if (name === 'save_obsidian_note') {
    const result = saveObsidianNote(args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result)
        }
      ]
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
