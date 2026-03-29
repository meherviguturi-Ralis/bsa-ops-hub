/* ============================================================
   BSA Ops Hub — Mail Inbox
   Microsoft Graph API + AI parsing + ADO actions
   3-panel email detail view
   ============================================================ */

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────
  const DEFAULT_KEYWORDS = [
    'change request', 'change order', 'cr ', 'modification',
    'revise', 'amend', 'empower', 'heloc', 'bsa',
    'requirement', 'feature request', 'new feature',
  ];
  const DOCS_KEY = 'bsa-documents-v1';

  // ── Module state ─────────────────────────────────────────────
  let _container    = null;
  let _emails       = [];
  let _selected     = null;
  let _tab          = 'cr';
  let _autoTimer    = null;
  let _lastCheck    = null;
  let _isConnected  = false;
  let _userEmail    = '';
  let _listScrollPos = 0;
  let _parseCache   = {};   // emailId → parse result
  let _ticketCache  = {};   // emailId → generated dev ticket
  let _adoLinks     = {};   // emailId → { id, title }
  let currentParsedTicket = null;
  let currentInputEmail   = null;

  // ── Helpers ──────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeSince(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 2)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    if (h < 24)  return `${h}h ago`;
    if (d === 1) return 'Yesterday';
    if (d < 7)   return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getKeywords() {
    const custom = (window.appSettings?.mailKeywords || '').trim();
    if (custom) return custom.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    return DEFAULT_KEYWORDS;
  }

  function isCR(email) {
    const text = ((email.subject || '') + ' ' + (email.bodyPreview || '')).toLowerCase();
    return getKeywords().some(k => text.includes(k));
  }

  function detectTags(email) {
    const tags = [];
    const text = ((email.subject || '') + ' ' + (email.bodyPreview || '')).toLowerCase();
    if (/urgent|asap|eod|by today|immediate/.test(text)) tags.push('urgent');
    if (isCR(email)) tags.push('cr');
    if (/waiting for your|please review|can you|could you|let me know/.test(text)) tags.push('waiting');
    if (tags.length === 0) tags.push('fyi');
    return tags;
  }

  const TAG_HTML = {
    urgent:  `<span class="mail-tag mail-tag-urgent">🔴 URGENT</span>`,
    cr:      `<span class="mail-tag mail-tag-cr">🔵 CR</span>`,
    waiting: `<span class="mail-tag mail-tag-waiting">🟡 WAITING</span>`,
    fyi:     `<span class="mail-tag mail-tag-fyi">🟢 FYI</span>`,
  };

  function sanitizeHtml(html) {
    return (html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, 'about:');
  }

  function fileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf')                    return '📄';
    if (['xlsx','xls','csv'].includes(ext)) return '📊';
    if (['docx','doc'].includes(ext))     return '📝';
    if (['png','jpg','jpeg','gif','bmp','webp'].includes(ext)) return '🖼';
    if (['zip','rar','7z'].includes(ext)) return '🗜';
    return '📎';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  // ── Documents helpers ────────────────────────────────────────
  function loadDocs() {
    try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]'); } catch { return []; }
  }
  function saveDocs(docs) {
    try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); } catch {}
  }

  // ── Priority (ADO) ───────────────────────────────────────────
  const PRIORITY_MAP = { high: 1, medium: 2, low: 3 };

  function getAdoSettings() {
    const s = window.appSettings || {};
    return { org: s.adoOrg || 'TheLoanExchange', project: s.adoProject || 'TLE.Empower', pat: s.adoPat || '' };
  }

  // ── Sidebar badges ───────────────────────────────────────────
  function updateMailBadge(count) {
    const nav = document.querySelector('.nav-item[data-module="mail"]');
    if (!nav) return;
    let badge = nav.querySelector('.nav-badge');
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; nav.appendChild(badge); }
    if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  function updateDocsBadge() {
    const nav = document.querySelector('.nav-item[data-module="documents"]');
    if (!nav) return;
    const count = loadDocs().length;
    let badge = nav.querySelector('.nav-badge');
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; nav.appendChild(badge); }
    if (count > 0) { badge.textContent = String(count); badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  // ── Fetch emails ─────────────────────────────────────────────
  async function fetchEmails(silent) {
    const days = parseInt(window.appSettings?.mailFetchDays) || 7;
    const res  = await window.api.mail.getMessages({ days, top: 50 });
    if (res.error) {
      if (!silent) window.showToast?.('Mail fetch failed: ' + res.error, 'error');
      return;
    }
    const fresh = res.value || [];

    if (silent && _lastCheck && fresh.length) {
      const newCR = fresh.filter(e =>
        new Date(e.receivedDateTime).getTime() > _lastCheck && isCR(e) && !e.isRead
      );
      newCR.forEach(e => {
        try {
          const n = new window.Notification('📬 New Change Request', {
            body: `${e.from?.emailAddress?.name || e.from?.emailAddress?.address}: ${e.subject}`,
          });
          n.onclick = () => window.navigateTo?.('mail');
        } catch (_) {}
      });
      if (newCR.length) flashNavItem();
    }

    _lastCheck = Date.now();
    _emails    = fresh;
    updateMailBadge(fresh.filter(e => !e.isRead).length);
    if (_container) renderList();
  }

  function flashNavItem() {
    const nav = document.querySelector('.nav-item[data-module="mail"]');
    if (!nav) return;
    let n = 0;
    const iv = setInterval(() => {
      nav.classList.toggle('mail-nav-flash');
      if (++n >= 6) { clearInterval(iv); nav.classList.remove('mail-nav-flash'); }
    }, 300);
  }

  function startAutoScan() {
    stopAutoScan();
    const mins = parseInt(window.appSettings?.mailScanInterval) || 2;
    if (mins === 0) return;
    _autoTimer = setInterval(() => fetchEmails(true), mins * 60 * 1000);
  }

  function stopAutoScan() {
    if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
  }

  // ── Connection banner (amber / green) ────────────────────────
  function showConnectionBanner() {
    if (!_container) return;
    _container.querySelector('.mail-conn-banner')?.remove();
    const banner = document.createElement('div');
    if (_isConnected) {
      banner.className = 'mail-conn-banner mail-conn-banner-ok';
      banner.innerHTML = `<span>✅ Outlook connected — ${esc(_userEmail)}</span>`;
      _container.insertBefore(banner, _container.firstChild);
      setTimeout(() => banner.remove(), 3000);
    } else {
      banner.className = 'mail-conn-banner mail-conn-banner-warn';
      banner.innerHTML = `
        <span>⚠ Outlook not connected</span>
        <button class="mail-conn-btn" id="mail-conn-now">MSAL →</button>
        <button class="mail-conn-btn mail-conn-btn-dc" id="mail-conn-device">🔑 Device Code</button>
        <button class="mail-conn-dismiss" id="mail-conn-dismiss">✕</button>`;
      _container.insertBefore(banner, _container.firstChild);
      document.getElementById('mail-conn-now')?.addEventListener('click', () => window.navigateTo('settings'));
      document.getElementById('mail-conn-dismiss')?.addEventListener('click', () => banner.remove());
      document.getElementById('mail-conn-device')?.addEventListener('click', () => startDeviceCodeFlow(banner));
    }
  }

  async function startDeviceCodeFlow(banner) {
    banner.innerHTML = `<span class="mail-dc-waiting"><span class="mail-spinner" style="display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:6px;"></span>Requesting device code…</span>`;

    const res = await window.api.mail.deviceCodeInit();
    if (res.error) {
      banner.innerHTML = `<span style="color:var(--red);">❌ ${esc(res.error)}</span> <button class="mail-conn-dismiss" id="mail-dc-err-close">✕</button>`;
      document.getElementById('mail-dc-err-close')?.addEventListener('click', () => banner.remove());
      return;
    }

    banner.innerHTML = `
      <div class="mail-dc-row">
        <span>🔑 Visit <strong id="mail-dc-link-lbl">${esc(res.verification_uri)}</strong> and enter:</span>
        <span class="mail-dc-code">${esc(res.user_code)}</span>
        <button class="mail-conn-btn" id="mail-dc-open">Open Page →</button>
        <button class="mail-conn-btn" id="mail-dc-copy">📋 Copy</button>
        <span class="mail-dc-status" id="mail-dc-status">Waiting for sign-in…</span>
        <button class="mail-conn-dismiss" id="mail-dc-cancel">✕</button>
      </div>`;

    document.getElementById('mail-dc-open')?.addEventListener('click', () => window.api.shell.openExternal(res.verification_uri));
    document.getElementById('mail-dc-copy')?.addEventListener('click', () =>
      navigator.clipboard?.writeText(res.user_code).then(() => window.showToast?.('Code copied!', 'success'))
    );

    let cancelled = false;
    document.getElementById('mail-dc-cancel')?.addEventListener('click', () => { cancelled = true; banner.remove(); });

    const pollMs = Math.max((res.interval || 5), 4) * 1000;
    const expiry = Date.now() + (res.expires_in || 900) * 1000;

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() > expiry) {
        const s = document.getElementById('mail-dc-status');
        if (s) s.textContent = 'Code expired — dismiss and try again.';
        return;
      }

      const result = await window.api.mail.deviceCodePoll(res.device_code);

      if (result.pending) { setTimeout(poll, pollMs); return; }

      if (result.error) {
        const s = document.getElementById('mail-dc-status');
        if (s) s.innerHTML = `<span style="color:var(--red);">❌ ${esc(result.error)}</span>`;
        return;
      }

      if (result.success) {
        _isConnected = true;
        _userEmail = result.email;
        banner.remove();
        showConnectionBanner();
        await fetchEmails(false);
        startAutoScan();
      }
    };

    setTimeout(poll, pollMs);
  }

  // ── Preview 3-panel (not connected) ──────────────────────────
  function showPreviewDetail() {
    const contentArea = document.getElementById('mail-content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div class="mail-3panel">
        <!-- Panel 1: Thread skeleton -->
        <div class="mail-thread-panel" id="mail-thread-panel">
          <div class="mail-panel-header">
            <div class="mail-thread-title" style="color:var(--text-muted);font-style:italic;">Conversation Thread</div>
          </div>
          <div class="mail-thread-body" style="padding:12px;display:flex;flex-direction:column;gap:8px;">
            <div class="mail-bubble mail-bubble-theirs mail-skel-bubble"></div>
            <div class="mail-bubble mail-bubble-mine mail-skel-bubble"></div>
            <div class="mail-bubble mail-bubble-theirs mail-skel-bubble" style="width:70%;"></div>
            <div class="mail-preview-connect-hint">🔗 Connect Outlook to load your real emails</div>
          </div>
        </div>

        <!-- Panel 2: Lock placeholder -->
        <div class="mail-center-panel" id="mail-center-panel">
          <div id="mail-center-scroll" class="mail-preview-lock-wrap">
            <div class="mail-preview-lock-icon">🔒</div>
            <div class="mail-preview-lock-title">Connect Outlook in Settings to view email content</div>
            <div class="mail-actions-bar mail-actions-disabled" style="margin-top:16px;">
              <button class="mail-action-btn" disabled>✦ Parse with AI</button>
              <button class="mail-action-btn" disabled>📋 Create ADO</button>
              <button class="mail-action-btn" disabled>↩ Reply</button>
              <button class="mail-action-btn" disabled>✅ Mark Read</button>
              <button class="mail-action-btn" disabled>📌 Track</button>
              <button class="mail-action-btn mail-action-btn-ticket" disabled>📋 Generate Dev Ticket</button>
            </div>
          </div>
          <div class="mail-reply-wrap" id="mail-reply-wrap" style="display:none;"></div>
        </div>

        <!-- Panel 3: Docs panel (always functional) -->
        <div class="mail-docs-panel" id="mail-docs-panel">
          <div class="mail-panel-header" style="border-bottom:1px solid var(--border-default);flex-shrink:0;">
            <span class="mail-panel-title">📎 Attachments</span>
          </div>
          <div class="mail-docs-attachments">
            <div class="mail-no-attachments">No attachments — connect Outlook to load</div>
          </div>
          <div class="mail-panel-divider"></div>
          <div class="mail-panel-section-label">📁 Saved Documents</div>
          <div class="mail-saved-list" id="mail-saved-list"></div>
          <div style="padding:6px 10px;">
            <button class="mail-action-btn" id="mail-view-docs" style="width:100%;justify-content:center;font-size:11px;">📁 View All Documents</button>
          </div>
        </div>
      </div>`;

    document.getElementById('mail-view-docs')?.addEventListener('click', () => window.navigateTo('documents'));
    renderSavedDocs();
  }

  // ── Inbox shell (list + content area) ────────────────────────
  function showInbox() {
    if (!_container) return;
    _container.innerHTML = `
      <div class="mail-wrap">
        <div class="mail-list-pane" id="mail-list-pane">
          <div class="mail-toolbar">
            <input type="text" id="mail-search" class="mail-search" placeholder="Search emails…" />
            <button class="mail-refresh-btn" id="mail-refresh" title="Refresh">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M13 2.5 A6 6 0 1 1 8 1" stroke-linecap="round"/>
                <polyline points="9,1 13,2.5 11,6" fill="none"/>
              </svg>
            </button>
          </div>
          <div class="mail-tabs">
            <button class="mail-tab ${_tab==='cr'?'mail-tab-active':''}" data-tab="cr">Change Requests</button>
            <button class="mail-tab ${_tab==='all'?'mail-tab-active':''}" data-tab="all">All Inbox</button>
            <button class="mail-tab ${_tab==='manual'?'mail-tab-active':''}" data-tab="manual">✏ Manual</button>
          </div>
          <div class="mail-list" id="mail-list"></div>
        </div>
        <div class="mail-content-area" id="mail-content-area">
          <div class="mail-empty-state">
            <div class="mail-empty-icon">✉️</div>
            <div class="mail-empty-text">Select an email to read</div>
          </div>
        </div>
      </div>`;

    _container.querySelectorAll('.mail-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.tab;
        _container.querySelectorAll('.mail-tab').forEach(b => b.classList.toggle('mail-tab-active', b.dataset.tab === _tab));
        renderList();
      });
    });
    document.getElementById('mail-refresh')?.addEventListener('click', () => fetchEmails(false));
    document.getElementById('mail-search')?.addEventListener('input', renderList);
    renderList();
  }

  // ── Manual input ──────────────────────────────────────────────
  function getInputChangeRequest() {
    if (!currentInputEmail) return null;
    return {
      subject: currentInputEmail.subject || '',
      body:    currentInputEmail.body?.content || '',
    };
  }

  function renderManualInputPanel(listEl) {
    listEl.innerHTML = `
      <div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
        <div class="mail-parse-field-lbl">Subject</div>
        <input id="mail-input-subject" class="mail-parse-input" type="text" placeholder="Email subject…" />
        <div class="mail-parse-field-lbl" style="margin-top:4px;">Body</div>
        <textarea id="mail-input-body" class="mail-parse-textarea" placeholder="Paste email body…" style="min-height:160px;"></textarea>
        <button class="btn btn-primary" id="mail-input-parse" style="margin-top:4px;">✦ Parse Email</button>
      </div>`;
    document.getElementById('mail-input-parse')?.addEventListener('click', () => {
      const subject = document.getElementById('mail-input-subject')?.value.trim() || '';
      const body    = document.getElementById('mail-input-body')?.value.trim() || '';
      currentInputEmail = {
        id: 'manual-input',
        subject,
        body: { content: body },
        receivedDateTime: new Date().toISOString(),
        isRead: true,
      };
      if (!currentInputEmail?.body?.content) {
        alert('Please paste a change request email first');
        currentInputEmail = null;
        return;
      }
      currentParsedTicket = null;
      window.api.mail.setInputEmail(subject, body);
      showEmailDetail(currentInputEmail);
      parseWithAI(currentInputEmail);
    });
  }

  // ── Email list ────────────────────────────────────────────────
  function renderList() {
    const listEl = document.getElementById('mail-list');
    if (!listEl) return;

    if (_tab === 'manual') { renderManualInputPanel(listEl); return; }

    // Preview skeleton when not connected
    if (!_isConnected) {
      listEl.innerHTML = [80, 120, 95].map(w => `
        <div class="mail-item mail-item-skeleton">
          <div class="mail-item-top">
            <span class="mail-skel-line" style="width:${w}px;height:11px;"></span>
            <span class="mail-skel-line" style="width:34px;height:10px;"></span>
          </div>
          <div class="mail-skel-line" style="width:${w + 60}px;height:12px;margin:5px 0 3px;"></div>
          <div class="mail-skel-line" style="width:${w + 100}px;height:10px;"></div>
        </div>`).join('');
      return;
    }

    const query  = (document.getElementById('mail-search')?.value || '').toLowerCase();
    let emails   = _tab === 'cr' ? _emails.filter(isCR) : _emails;
    if (query) emails = emails.filter(e =>
      (e.subject || '').toLowerCase().includes(query) ||
      (e.from?.emailAddress?.name || '').toLowerCase().includes(query) ||
      (e.bodyPreview || '').toLowerCase().includes(query)
    );

    if (!emails.length) {
      listEl.innerHTML = `<div class="mail-list-empty">${_tab==='cr'?'No change request emails found':'No emails found'}</div>`;
      return;
    }

    listEl.innerHTML = emails.map(e => {
      const tags = detectTags(e);
      const ado  = _adoLinks[e.id];
      return `
        <div class="mail-item ${!e.isRead?'mail-item-unread':''} ${_selected?.id===e.id?'mail-item-selected':''}" data-id="${esc(e.id)}">
          <div class="mail-item-top">
            <span class="mail-sender">${esc(e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown')}</span>
            <span class="mail-time">${timeSince(e.receivedDateTime)}</span>
          </div>
          <div class="mail-subject ${!e.isRead?'mail-subject-unread':''}">${esc(e.subject || '(no subject)')}</div>
          <div class="mail-preview">${esc(e.bodyPreview || '')}</div>
          <div class="mail-item-footer">
            <div class="mail-tags">${tags.map(t => TAG_HTML[t]||'').join('')}</div>
            ${ado ? `<span class="mail-ado-badge">ADO #${ado.id}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.mail-item').forEach(el => {
      el.addEventListener('click', () => {
        const email = _emails.find(e => e.id === el.dataset.id);
        if (email) selectEmail(email);
      });
    });

    // Restore scroll position
    listEl.scrollTop = _listScrollPos;
  }

  // ── Select email → show 3-panel ──────────────────────────────
  function selectEmail(email) {
    // Save current list scroll position
    _listScrollPos = document.getElementById('mail-list')?.scrollTop || 0;
    _selected = email;
    currentParsedTicket = null;
    renderList();
    showEmailDetail(email);
  }

  // ── 3-panel detail view ──────────────────────────────────────
  function showEmailDetail(email) {
    const contentArea = document.getElementById('mail-content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div class="mail-3panel">
        <!-- Panel 1: Thread -->
        <div class="mail-thread-panel" id="mail-thread-panel">
          <div class="mail-panel-header">
            <button class="mail-back-btn" id="mail-back-btn">← Back</button>
            <div class="mail-thread-title">${esc((email.subject || '').slice(0, 40))}</div>
          </div>
          <div class="mail-thread-body" id="mail-thread-body">
            <div class="mail-thread-loading"><div class="mail-spinner"></div></div>
          </div>
        </div>

        <!-- Panel 2: Email detail + actions -->
        <div class="mail-center-panel" id="mail-center-panel">
          <div id="mail-center-scroll">
            <!-- Filled by renderCenterPanel -->
          </div>
          <div class="mail-reply-wrap" id="mail-reply-wrap" style="display:none;"></div>
        </div>

        <!-- Panel 3: Attachments + Documents -->
        <div class="mail-docs-panel" id="mail-docs-panel">
          <div class="mail-panel-header" style="border-bottom:1px solid var(--border-default);flex-shrink:0;">
            <span class="mail-panel-title">📎 Attachments</span>
          </div>
          <div class="mail-docs-attachments" id="mail-docs-attachments">
            <div class="mail-thread-loading"><div class="mail-spinner"></div></div>
          </div>
          <div class="mail-panel-divider"></div>
          <div class="mail-panel-section-label">📁 Saved Documents</div>
          <div class="mail-saved-list" id="mail-saved-list"></div>
        </div>
      </div>`;

    document.getElementById('mail-back-btn')?.addEventListener('click', backToInbox);

    renderCenterPanel(email);
    loadThread(email);
    loadAttachments(email);
    renderSavedDocs();
  }

  // ── Panel 2: center email detail ────────────────────────────
  function renderCenterPanel(email) {
    const scroll = document.getElementById('mail-center-scroll');
    if (!scroll) return;
    const from   = email.from?.emailAddress || {};
    const tags   = detectTags(email);
    const ado    = _adoLinks[email.id];
    const body   = sanitizeHtml(email.body?.content || email.bodyPreview || '');

    scroll.innerHTML = `
      <div class="mail-detail-header">
        <div class="mail-detail-subject">${esc(email.subject || '(no subject)')}</div>
        <div class="mail-detail-meta">
          <div class="mail-detail-from">
            <span class="mail-avatar">${(from.name || from.address || '?')[0].toUpperCase()}</span>
            <div>
              <div class="mail-from-name">${esc(from.name || from.address || 'Unknown')}</div>
              <div class="mail-from-addr">${esc(from.address || '')}</div>
            </div>
          </div>
          <div class="mail-detail-time">${new Date(email.receivedDateTime).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
        </div>
        <div class="mail-detail-tags">${tags.map(t => TAG_HTML[t]||'').join('')}</div>
      </div>

      <div class="mail-actions-bar">
        <button class="mail-action-btn" id="ma-parse">✦ Parse with AI</button>
        <button class="mail-action-btn" id="ma-create-ado">📋 Create ADO</button>
        <button class="mail-action-btn mail-action-reply-btn" id="ma-reply-toggle">↩ Reply</button>
        <button class="mail-action-btn" id="ma-read">✅ Mark Read</button>
        <button class="mail-action-btn" id="ma-track">📌 Track</button>
        <button class="mail-action-btn mail-action-btn-ticket" id="ma-gen-ticket">📋 Generate Dev Ticket</button>
      </div>

      ${ado ? `<div class="mail-ado-banner">✅ ADO #${ado.id} — <em>${esc(ado.title)}</em></div>` : ''}

      <div class="mail-body-wrap">
        <div class="mail-body-content" id="mail-body-content">${body}</div>
      </div>

      <div id="mail-parse-area"></div>`;

    // Intercept links
    scroll.querySelector('#mail-body-content')?.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (a) { e.preventDefault(); window.api.shell.openExternal(a.href); }
    });

    document.getElementById('ma-parse')?.addEventListener('click', () => parseWithAI(email));

    document.getElementById('ma-create-ado')?.addEventListener('click', () => {
      const cached = _parseCache[email.id];
      if (cached) createAdoItem(email, cached);
      else { window.showToast?.('Parse the email first for best results.', 'info'); createAdoItemBasic(email); }
    });

    document.getElementById('ma-reply-toggle')?.addEventListener('click', () => toggleReplyComposer(email));

    document.getElementById('ma-read')?.addEventListener('click', async () => {
      const res = await window.api.mail.markRead(email.id);
      if (!res.error) { email.isRead = true; renderList(); window.showToast?.('Marked as read', 'success'); }
    });

    document.getElementById('ma-track')?.addEventListener('click', () => {
      const cached = _parseCache[email.id];
      if (cached) createAdoItem(email, cached, true);
      else createAdoItemBasic(email, true);
    });

    document.getElementById('ma-gen-ticket')?.addEventListener('click', () => generateDevTicket(email));

    // If already parsed, show cached result
    if (_parseCache[email.id]) renderParseCard(email, _parseCache[email.id]);
    // If ticket already generated, show it
    else if (_ticketCache[email.id]) renderTicketCard(email, _ticketCache[email.id]);
  }

  // ── Panel 1: conversation thread ─────────────────────────────
  async function loadThread(email) {
    const threadBody = document.getElementById('mail-thread-body');
    if (!threadBody) return;

    const convId = email.conversationId;
    if (!convId) {
      threadBody.innerHTML = renderThreadBubble(email, true);
      return;
    }

    const res = await window.api.mail.getConversation(convId);
    const msgs = res.value || [];

    if (!msgs.length) {
      threadBody.innerHTML = renderThreadBubble(email, true);
      return;
    }

    const header = `<div class="mail-thread-count">${msgs.length} message${msgs.length!==1?'s':''}</div>`;
    const bubbles = msgs.map(m => renderThreadBubble(m, m.id === email.id)).join('');
    threadBody.innerHTML = header + bubbles + (msgs.length === 1 ? '<div class="mail-thread-no-replies">No replies yet</div>' : '');

    // Click bubble to load that email in center panel
    threadBody.querySelectorAll('.mail-bubble[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        const msg = msgs.find(m => m.id === el.dataset.id);
        if (msg) {
          // Merge body from _emails cache or use what we have
          const full = _emails.find(e => e.id === msg.id) || msg;
          _selected = full;
          renderList();
          renderCenterPanel(full);
          loadAttachments(full);
          threadBody.querySelectorAll('.mail-bubble').forEach(b => b.classList.remove('mail-bubble-active'));
          el.classList.add('mail-bubble-active');
        }
      });
    });

    // Scroll to bottom (latest message)
    threadBody.scrollTop = threadBody.scrollHeight;
  }

  function renderThreadBubble(email, isActive) {
    const from      = email.from?.emailAddress || {};
    const isMine    = (from.address || '').toLowerCase() === _userEmail.toLowerCase();
    const name      = isMine ? 'You' : (from.name || from.address || 'Unknown');
    const preview   = (email.bodyPreview || '').slice(0, 100);
    return `
      <div class="mail-bubble ${isMine?'mail-bubble-mine':'mail-bubble-theirs'} ${isActive?'mail-bubble-active':''}" data-id="${esc(email.id)}">
        <div class="mail-bubble-meta">${esc(name)} · ${timeSince(email.receivedDateTime)}</div>
        <div class="mail-bubble-text">${esc(preview)}</div>
      </div>`;
  }

  // ── Panel 3: attachments + saved docs ───────────────────────
  async function loadAttachments(email) {
    const el = document.getElementById('mail-docs-attachments');
    if (!el) return;

    const res = await window.api.mail.getAttachments(email.id);
    const all = (res.value || []).filter(a => !a.isInline);

    if (!all.length) {
      el.innerHTML = `<div class="mail-no-attachments">No attachments</div>`;
      return;
    }

    el.innerHTML = all.map(a => `
      <div class="mail-attach-item" data-id="${esc(a.id)}">
        <span class="mail-attach-icon">${fileIcon(a.name)}</span>
        <div class="mail-attach-info">
          <div class="mail-attach-name" title="${esc(a.name)}">${esc(a.name)}</div>
          <div class="mail-attach-size">${formatSize(a.size)}</div>
        </div>
        <button class="mail-attach-save" data-content="${esc(a.contentBytes||'')}" data-name="${esc(a.name)}" title="Save to Documents">💾</button>
      </div>`).join('');

    el.querySelectorAll('.mail-attach-save').forEach(btn => {
      btn.addEventListener('click', () => saveAttachmentToDocs(email, btn.dataset.name, btn.dataset.content));
    });
  }

  async function saveAttachmentToDocs(email, filename, contentBytes) {
    if (!contentBytes) { window.showToast?.('Attachment content not available', 'error'); return; }

    // Check duplicate
    const existing = loadDocs().find(d => d.filename === filename);
    if (existing) { window.showToast?.(`Already saved — ${filename}`, 'info'); return; }

    const res = await window.api.mail.saveAttachment({ filename, contentBytes });
    if (res.error) { window.showToast?.('Save failed: ' + res.error, 'error'); return; }

    const doc = {
      id:                  Date.now() + '-' + filename,
      filename,
      size:                Math.round(contentBytes.length * 3 / 4),
      savedDate:           new Date().toISOString(),
      sourceEmailSubject:  email.subject || '',
      sourceEmailSender:   email.from?.emailAddress?.name || email.from?.emailAddress?.address || '',
      filePath:            res.filePath,
    };

    const docs = loadDocs();
    docs.unshift(doc);
    saveDocs(docs);
    updateDocsBadge();
    window.DocumentsModule?.refresh?.();
    window.showToast?.(`✅ Saved — ${filename} added to Documents`, 'success');
    renderSavedDocs();
  }

  function renderSavedDocs() {
    const el = document.getElementById('mail-saved-list');
    if (!el) return;
    const docs = loadDocs().slice(0, 10);
    if (!docs.length) { el.innerHTML = `<div class="mail-no-attachments">No saved documents yet</div>`; return; }
    el.innerHTML = docs.map(d => `
      <div class="mail-saved-item">
        <span class="mail-attach-icon">${fileIcon(d.filename)}</span>
        <div class="mail-attach-info">
          <div class="mail-attach-name" title="${esc(d.filename)}">${esc(d.filename)}</div>
          <div class="mail-attach-size">${timeSince(d.savedDate)}</div>
        </div>
        <button class="mail-attach-open" data-path="${esc(d.filePath)}" title="Open file">📂</button>
      </div>`).join('');
    el.querySelectorAll('.mail-attach-open').forEach(btn => {
      btn.addEventListener('click', () => window.api.shell.openPath(btn.dataset.path));
    });
  }

  // ── Inline reply composer ─────────────────────────────────────
  function toggleReplyComposer(email) {
    const wrap = document.getElementById('mail-reply-wrap');
    if (!wrap) return;
    if (wrap.style.display !== 'none' && wrap.innerHTML) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = '';
    renderReplyComposer(email, '');
  }

  function renderReplyComposer(email, draftText) {
    const wrap = document.getElementById('mail-reply-wrap');
    if (!wrap) return;
    const from    = email.from?.emailAddress || {};
    const subject = 'Re: ' + (email.subject || '');
    wrap.innerHTML = `
      <div class="mail-composer">
        <div class="mail-composer-header">
          <span>↩ Re: ${esc((email.subject || '').slice(0,50))}</span>
          <button class="mail-composer-close" id="mail-composer-close">✕</button>
        </div>
        <textarea id="mail-composer-body" class="mail-composer-textarea" placeholder="Write your reply…">${esc(draftText)}</textarea>
        <div class="mail-composer-footer">
          <button class="btn" id="mail-composer-draft">✦ Draft with AI</button>
          <button class="btn btn-primary" id="mail-composer-outlook">↩ Send in Outlook</button>
          <button class="btn" id="mail-composer-copy">Copy</button>
        </div>
        <div id="mail-composer-ai-status"></div>
      </div>`;

    document.getElementById('mail-composer-close')?.addEventListener('click', () => { wrap.style.display = 'none'; wrap.innerHTML = ''; });

    document.getElementById('mail-composer-draft')?.addEventListener('click', async () => {
      const status = document.getElementById('mail-composer-ai-status');
      if (status) status.innerHTML = `<div class="mail-parsing"><div class="mail-spinner"></div><span>Drafting with AI…</span></div>`;
      const draft = await generateDraft(email);
      const ta = document.getElementById('mail-composer-body');
      if (ta && draft) ta.value = draft;
      if (status) status.innerHTML = '';
    });

    document.getElementById('mail-composer-outlook')?.addEventListener('click', () => {
      const body = document.getElementById('mail-composer-body')?.value || draftText;
      window.api.shell.openExternal(`mailto:${from.address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    });

    document.getElementById('mail-composer-copy')?.addEventListener('click', () => {
      const body = document.getElementById('mail-composer-body')?.value || '';
      navigator.clipboard?.writeText(body).then(() => window.showToast?.('Copied!', 'success'));
    });
  }

  // ── Back to inbox ─────────────────────────────────────────────
  function backToInbox() {
    _selected = null;
    const contentArea = document.getElementById('mail-content-area');
    if (contentArea) {
      contentArea.innerHTML = `
        <div class="mail-empty-state">
          <div class="mail-empty-icon">✉️</div>
          <div class="mail-empty-text">Select an email to read</div>
        </div>`;
    }
    renderList();
    // Restore scroll
    requestAnimationFrame(() => {
      const listEl = document.getElementById('mail-list');
      if (listEl) listEl.scrollTop = _listScrollPos;
    });
  }

  // ── AI Parse ─────────────────────────────────────────────────
  async function parseWithAI(email) {
    const area = document.getElementById('mail-parse-area');
    if (!area) return;
    const apiKey = window.appSettings?.anthropicKey;
    if (!apiKey) { area.innerHTML = `<div class="mail-parse-card mail-parse-nokey">🔑 Add your Anthropic API key in Settings to use AI parsing.</div>`; return; }
    if (_parseCache[email.id]) { renderParseCard(email, _parseCache[email.id]); return; }

    area.innerHTML = `<div class="mail-parsing"><div class="mail-spinner"></div><span>Claude is reading this email…</span></div>`;
    const bodyText = (email.body?.content || email.bodyPreview || '').replace(/<[^>]+>/g, ' ').slice(0, 3000);
    const prompt = `You are a BSA at The Loan Exchange analyzing an incoming email. Extract the following and return ONLY valid JSON:
{
  "type": "change_request" | "bug_report" | "new_feature" | "question" | "fyi",
  "priority": "high" | "medium" | "low",
  "requester": "name of person asking",
  "summary": "one sentence summary of what is being asked",
  "empower_area": "which Empower LOS area this relates to, or null",
  "suggested_title": "concise ADO work item title",
  "suggested_description": "ADO work item description with full context",
  "action_needed": "what the BSA needs to do next",
  "estimated_effort": "small (< 2hrs) | medium (2-8hrs) | large (> 8hrs)"
}
Email subject: ${email.subject || ''}
Email body: ${bodyText}`;

    const res = await window.api.ai.complete({ apiKey, messages: [{ role: 'user', content: prompt }] });
    if (res.error) { area.innerHTML = `<div class="mail-parse-card mail-parse-error">AI parse failed: ${esc(res.error)}</div>`; return; }

    try {
      const text   = res.content?.[0]?.text || '';
      const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      const data = JSON.parse(fenced ? fenced[1] : text.trim());
      currentParsedTicket = data;

      _parseCache[email.id] = data;
      renderParseCard(email, data);
      return data;
    } catch (e) {
      area.innerHTML = `<div class="mail-parse-card mail-parse-error">Could not parse AI response. Try again.</div>`;
    }
  }

  function renderParseCard(email, result) {
    const area = document.getElementById('mail-parse-area');
    if (!area) return;
    const tc = { change_request:'#58a6ff', bug_report:'#f85149', new_feature:'#3fb950', question:'#d29922', fyi:'#8b949e' };
    const pc = { high:'#f85149', medium:'#d29922', low:'#3fb950' };
    const ec = { 'small (< 2hrs)':'#3fb950', 'medium (2-8hrs)':'#d29922', 'large (> 8hrs)':'#f85149' };
    area.innerHTML = `
      <div class="mail-parse-card">
        <div class="mail-parse-header">
          <span class="mail-parse-label">✦ AI Analysis</span>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <span class="mail-badge" style="background:${tc[result.type]||'#888'}22;color:${tc[result.type]||'#888'};border-color:${tc[result.type]||'#888'}44;">${(result.type||'').replace(/_/g,' ').toUpperCase()}</span>
            <span class="mail-badge" style="background:${pc[result.priority]||'#888'}22;color:${pc[result.priority]||'#888'};border-color:${pc[result.priority]||'#888'}44;">${(result.priority||'').toUpperCase()}</span>
            <span class="mail-badge" style="background:${ec[result.estimated_effort]||'#888'}22;color:${ec[result.estimated_effort]||'#888'};border-color:${ec[result.estimated_effort]||'#888'}44;">${result.estimated_effort||''}</span>
          </div>
        </div>
        <div class="mail-parse-summary">${esc(result.summary||'')}</div>
        ${result.empower_area ? `<div class="mail-parse-area-tag">⚡ ${esc(result.empower_area)}</div>` : ''}
        ${result.action_needed ? `<div class="mail-parse-action">→ ${esc(result.action_needed)}</div>` : ''}
        <div class="mail-parse-fields">
          <div class="mail-parse-field-lbl">ADO Title</div>
          <input id="mail-ado-title" class="mail-parse-input" type="text" value="${esc(result.suggested_title||'')}" />
          <div class="mail-parse-field-lbl" style="margin-top:8px;">Description</div>
          <textarea id="mail-ado-desc" class="mail-parse-textarea">${esc(result.suggested_description||'')}</textarea>
        </div>
        <div class="mail-parse-footer">
          <button class="btn btn-primary" id="mail-create-from-parse">📋 Create ADO Item →</button>
          <button class="btn" id="mail-parse-dismiss">Dismiss</button>
        </div>
      </div>`;

    document.getElementById('mail-create-from-parse')?.addEventListener('click', () => {
      const updated = {
        ...result,
        suggested_title:       document.getElementById('mail-ado-title')?.value || result.suggested_title,
        suggested_description: document.getElementById('mail-ado-desc')?.value  || result.suggested_description,
      };
      _parseCache[email.id] = updated;
      createAdoItem(email, updated);
    });
    document.getElementById('mail-parse-dismiss')?.addEventListener('click', () => { area.innerHTML = ''; });
  }

  // ── Create ADO Item ──────────────────────────────────────────
  async function createAdoItem(email, result, quietTrack) {
    const { org, project, pat } = getAdoSettings();
    if (!pat) { window.showToast?.('ADO PAT not configured. Go to Settings.', 'error'); return; }
    const from      = email.from?.emailAddress || {};
    const dateStr   = new Date(email.receivedDateTime).toLocaleString();
    const preview   = (email.body?.content || email.bodyPreview || '').replace(/<[^>]+>/g, ' ').slice(0, 600);
    const priority  = PRIORITY_MAP[result.priority] || 2;
    const description = (result.suggested_description || '') +
      `\n\n---\n**Original email from:** ${from.name||from.address||'Unknown'} &lt;${from.address||''}&gt;\n**Received:** ${dateStr}\n\n${preview}`;

    const patchBody = [
      { op: 'add', path: '/fields/System.Title',          value: result.suggested_title || email.subject },
      { op: 'add', path: '/fields/System.Description',    value: description.replace(/\n/g,'<br/>') },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: priority },
      { op: 'add', path: '/fields/System.Tags',           value: 'email-import' },
    ];
    const url = `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/$User%20Story?api-version=7.0`;
    const res = await window.api.ado.request('POST', url, pat, patchBody, 'application/json-patch+json');
    if (res.error || !res.id) { window.showToast?.('ADO create failed: ' + (res.error||'Unknown'), 'error'); return; }

    _adoLinks[email.id] = { id: res.id, title: result.suggested_title || email.subject };
    window.showToast?.(`✅ ADO #${res.id} created — ${result.suggested_title || email.subject}`, 'success');
    window.api.mail.markRead(email.id); email.isRead = true;
    renderList();
    renderCenterPanel(email);
    if (!quietTrack) window.showToast?.(`ADO #${res.id} will appear in My Tracking.`, 'info');
  }

  async function createAdoItemBasic(email, quietTrack) {
    await createAdoItem(email, { suggested_title: email.subject||'(No subject)', suggested_description: email.bodyPreview||'', priority: 'medium' }, quietTrack);
  }

  // ── Feature 2: Dev Ticket Generator ─────────────────────────
  async function generateDevTicket(email) {
    const area = document.getElementById('mail-parse-area');
    if (!area) return;

    // Check localStorage cache first
    const cacheKey = 'bsa-ticket-' + email.id;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { const t = JSON.parse(cached); _ticketCache[email.id] = t; renderTicketCard(email, t); return; } catch {}
    }

    const apiKey = window.appSettings?.anthropicKey;
    if (!apiKey) {
      area.innerHTML = `<div class="mail-parse-card mail-parse-nokey">🔑 Add your Anthropic API key in Settings to generate dev tickets.</div>`;
      return;
    }

    area.innerHTML = `<div class="mail-parsing"><div class="mail-spinner"></div><span>Generating dev ticket…</span></div>`;

    const bodyText = (email.body?.content || email.bodyPreview || '').replace(/<[^>]+>/g,' ').slice(0,3000);
    const prompt = `Process ONLY the selected email.
Extract structured ticket data.
Return ONLY valid JSON. No explanation.
{
  "title": "",
  "summary": "",
  "change_request": [],
  "acceptance_criteria": [],
  "bsa_notes": [],
  "missing_requirements": [],
  "empower": {
    "module": "",
    "screen": "",
    "fields": [],
    "logic_type": ""
  }
}
Email:
Subject: ${email.subject || ''}
${bodyText}`;

    try {
      const res = await window.api.ai.complete({ apiKey, messages: [{ role:'user', content: prompt }] });
      if (res.error) throw new Error(res.error);
      const text = res.content?.[0]?.text || '';
      const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      const ticket = JSON.parse(fenced ? fenced[1] : text.trim());
      localStorage.setItem(cacheKey, JSON.stringify(ticket));
      _ticketCache[email.id] = ticket;
      renderTicketCard(email, ticket);
    } catch (e) {
      area.innerHTML = `<div class="mail-parse-card mail-parse-error">Ticket generation failed: ${esc(e.message)}</div>`;
    }
  }

  function renderTicketCard(email, ticket) {
    const area = document.getElementById('mail-parse-area');
    if (!area) return;
    _ticketCache[email.id] = ticket;

    const missing = (ticket.missing_requirements || []).filter(p => p.trim());
    const acHtml = (ticket.acceptance_criteria || []).map(a => `<div class="mail-ticket-ac">☐ ${esc(a)}</div>`).join('');
    const crHtml = (ticket.change_request || []).map(c => `<div class="mail-ticket-li">- ${esc(c)}</div>`).join('');
    const notesHtml = (ticket.bsa_notes || []).map(n => `<div class="mail-ticket-li">- ${esc(n)}</div>`).join('');
    const missingHtml = missing.map(p => `<div class="mail-ticket-li">- ${esc(p)}</div>`).join('');
    const emp = ticket.empower || {};
    const empFieldsHtml = (emp.fields || []).map(f => `<div class="mail-ticket-li">- ${esc(f)}</div>`).join('');

    area.innerHTML = `
      <div class="mail-ticket-card">
        <div class="mail-ticket-hd">
          <span class="mail-ticket-title-lbl">📋 DEV TICKET DRAFT</span>
          ${missing.length ? `<span class="mail-ticket-pending-badge">⚠ ${missing.length} missing item${missing.length!==1?'s':''}</span>` : ''}
        </div>
        <div class="mail-ticket-divider"></div>

        <div class="mail-ticket-section-lbl">TITLE</div>
        <div class="mail-ticket-body" id="tkt-title" data-field="title">${esc(ticket.title||'')}</div>

        <div class="mail-ticket-section-lbl">SUMMARY</div>
        <div class="mail-ticket-body" id="tkt-summary" data-field="summary">${esc(ticket.summary||'')}</div>

        <div class="mail-ticket-section-lbl">CHANGE REQUEST</div>
        <div>${crHtml || '<span style="color:var(--text-muted);font-size:11px;">None</span>'}</div>

        <div class="mail-ticket-section-lbl">ACCEPTANCE CRITERIA</div>
        <div class="mail-ticket-ac-list">${acHtml}</div>

        <div class="mail-ticket-section-lbl">BSA NOTES</div>
        <div>${notesHtml}</div>

        ${missing.length ? `<div class="mail-ticket-section-lbl" style="color:#d29922;">MISSING REQUIREMENTS ⚠</div><div>${missingHtml}</div>` : ''}

        <div class="mail-ticket-section-lbl">EMPOWER</div>
        <div style="font-size:11px;color:var(--text-secondary);display:flex;flex-direction:column;gap:3px;">
          ${emp.module ? `<div><span style="color:var(--text-muted);">Module:</span> ${esc(emp.module)}</div>` : ''}
          ${emp.screen ? `<div><span style="color:var(--text-muted);">Screen:</span> ${esc(emp.screen)}</div>` : ''}
          ${emp.logic_type ? `<div><span style="color:var(--text-muted);">Logic:</span> ${esc(emp.logic_type)}</div>` : ''}
          ${empFieldsHtml ? `<div><span style="color:var(--text-muted);">Fields:</span>${empFieldsHtml}</div>` : ''}
          ${!emp.module && !emp.screen ? '<span style="color:var(--text-muted);font-size:11px;">None identified</span>' : ''}
        </div>

        <div class="mail-ticket-divider" style="margin-top:10px;"></div>
        <div class="mail-ticket-actions">
          <button class="btn btn-primary" id="tkt-push">📤 Push to ADO</button>
          <button class="btn" id="tkt-obsidian">🟣 Save to Obsidian</button>
          <button class="btn" id="tkt-copy">📋 Copy Full Ticket</button>
          <button class="btn" id="tkt-edit">✏ Edit</button>
        </div>
      </div>`;

    document.getElementById('tkt-obsidian')?.addEventListener('click', () => saveCurrentToObsidian());

    document.getElementById('tkt-copy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(buildTicketText(ticket)).then(() => window.showToast?.('Ticket copied!', 'success'));
    });

    let editing = false;
    document.getElementById('tkt-edit')?.addEventListener('click', () => {
      editing = !editing;
      area.querySelectorAll('.mail-ticket-body').forEach(el => { el.contentEditable = editing ? 'true' : 'false'; });
      document.getElementById('tkt-edit').textContent = editing ? '✅ Done Editing' : '✏ Edit';
    });

    document.getElementById('tkt-push')?.addEventListener('click', () => validateAndPush(email, ticket));
  }

  function genTicketMd(t) {
    return `---
title: "${t.title}"
type: ticket
status: active
---

# ${t.title}

## Summary

- ${t.summary}

## Change Request

${(t.change_request || []).map(i => `- ${i}`).join('\n')}

## Acceptance Criteria

${(t.acceptance_criteria || []).map(i => `- [ ] ${i}`).join('\n')}

## BSA Notes

${(t.bsa_notes || []).map(i => `- ${i}`).join('\n')}

## Missing Requirements

${(t.missing_requirements || []).map(i => `- ${i}`).join('\n')}
`;
  }

  function safeName(s) {
    return (s || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  }

  function saveCurrentToObsidian() {
    if (!currentParsedTicket) { window.showToast?.('Parse an email first.', 'error'); return; }
    const base = 'C:/ObsidianVault/BSA Ops Hub';
    save(`${base}/Knowledge/${safeName(currentParsedTicket.title)}.md`, genTicketMd(currentParsedTicket));
    save(`${base}/Empower/${safeName(currentParsedTicket.empower.screen || currentParsedTicket.title)}.md`, genEmpowerMd(currentParsedTicket));
    window.showToast?.('Saved to Obsidian', 'success');
  }

  async function save(filePath, content) {
    const res = await window.api.fs.write(filePath, content);
    if (res.error) window.showToast?.('Save failed: ' + res.error, 'error');
    return res;
  }

  function genEmpowerMd(t) {
    const emp = t.empower || {};
    return `---
title: "${emp.screen || ''} - ${t.title || ''}"
type: empower-note
---

# ${emp.screen || ''}

## Module

- ${emp.module || ''}

## Fields

${(emp.fields || []).map(f => `- ${f}`).join('\n')}

## Logic

- ${t.summary || ''}
`;
  }

  function buildTicketText(ticket) {
    const hr = '─'.repeat(40);
    const emp = ticket.empower || {};
    const lines = [hr,'📋 DEV TICKET DRAFT',hr,
      '\nTITLE\n'+(ticket.title||''),
      '\nSUMMARY\n'+(ticket.summary||''),
      '\nCHANGE REQUEST'];
    (ticket.change_request||[]).forEach(c => lines.push('- '+c));
    lines.push('\nACCEPTANCE CRITERIA');
    (ticket.acceptance_criteria||[]).forEach(a => lines.push('☐ '+a));
    lines.push('\nBSA NOTES');
    (ticket.bsa_notes||[]).forEach(n => lines.push('- '+n));
    const missing = (ticket.missing_requirements||[]).filter(p=>p.trim());
    if (missing.length) { lines.push('\nMISSING REQUIREMENTS ⚠'); missing.forEach(p => lines.push('- '+p)); }
    lines.push('\nEMPOWER');
    if (emp.module)     lines.push('Module: '+emp.module);
    if (emp.screen)     lines.push('Screen: '+emp.screen);
    if (emp.logic_type) lines.push('Logic: '+emp.logic_type);
    (emp.fields||[]).forEach(f => lines.push('Field: '+f));
    lines.push(hr);
    return lines.join('\n');
  }

  // ── Feature 6: Ticket Validation Gate ────────────────────────
  async function validateAndPush(email, ticket) {
    const area = document.getElementById('mail-parse-area');
    if (!area) return;
    if (!currentParsedTicket) { window.showToast?.('Please parse a selected email first.', 'error'); return; }
    ticket = currentParsedTicket;

    // Append validation section below the ticket card
    let vwrap = document.getElementById('tkt-validation-wrap');
    if (!vwrap) {
      vwrap = document.createElement('div');
      vwrap.id = 'tkt-validation-wrap';
      area.appendChild(vwrap);
    }
    vwrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:var(--radius);margin-top:10px;"><div class="mail-spinner"></div><span style="font-size:13px;">✦ Validating ticket…</span></div>`;

    await new Promise(r => setTimeout(r, 1000));

    const checks = runValidation(ticket);
    const passed = checks.filter(c => c.ok).length;
    const total = checks.length;
    const scoreColor = passed === total ? 'var(--green)' : passed >= 6 ? '#d29922' : 'var(--red)';
    const statusText = passed === total ? '✅ Ready to push' : passed >= 6 ? '⚠ Minor gaps' : '❌ Needs work';

    const checkHtml = checks.map(c => `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-default);">
        <span style="font-size:13px;flex-shrink:0;">${c.ok?'✅':'❌'}</span>
        <div><div style="font-size:12px;color:var(--text-primary);">${esc(c.label)}</div>
        ${!c.ok?`<div style="font-size:11px;color:var(--text-muted);">${esc(c.hint)}</div>`:''}</div>
      </div>`).join('');

    vwrap.innerHTML = `
      <div style="background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:var(--radius);padding:12px;margin-top:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-size:13px;font-weight:600;color:${scoreColor};">${statusText}</span>
          <span style="font-size:11px;color:var(--text-muted);">${passed}/${total} checks passed</span>
        </div>
        ${checkHtml}
        <div style="display:flex;gap:8px;margin-top:12px;align-items:center;">
          ${passed >= 6
            ? `<button class="btn btn-primary" id="tkt-push-confirm">📤 Push to ADO</button>`
            : `<button class="btn" disabled style="opacity:0.5;cursor:not-allowed;">📤 Push to ADO</button>`}
          <button class="btn" id="tkt-push-anyway" style="font-size:11px;color:var(--text-muted);">Push anyway →</button>
        </div>
      </div>`;

    const doPush = async () => {
      const { org, project, pat } = getAdoSettings();
      if (!pat) { window.showToast?.('ADO PAT not configured', 'error'); return; }
      const description = buildTicketHtml(ticket);
      const patchBody = [
        { op:'add', path:'/fields/System.Title', value:(ticket.title||email.subject||'Dev Ticket').slice(0,120) },
        { op:'add', path:'/fields/System.Description', value: description },
        { op:'add', path:'/fields/Microsoft.VSTS.Common.Priority', value: 2 },
        { op:'add', path:'/fields/System.Tags', value:'email-ticket' },
      ];
      const url = `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/$User%20Story?api-version=7.0`;
      const res = await window.api.ado.request('POST', url, pat, patchBody, 'application/json-patch+json');
      if (res.error || !res.id) { window.showToast?.('ADO create failed: '+(res.error||'Unknown'), 'error'); return; }
      _adoLinks[email.id] = { id: res.id, title: (ticket.title||email.subject||'').slice(0,80) };
      window.showToast?.(`✅ ADO #${res.id} created`, 'success');
      currentParsedTicket = null;
      window.api.mail.markRead(email.id); email.isRead = true;
      renderList();
      renderCenterPanel(email);
      // Feature 5: Empower Context card after push
      setTimeout(() => renderPostPushContext(ticket, res.id), 400);
    };

    document.getElementById('tkt-push-confirm')?.addEventListener('click', doPush);
    document.getElementById('tkt-push-anyway')?.addEventListener('click', doPush);
  }

  function runValidation(ticket) {
    const ac = ticket.acceptance_criteria || [];
    const gwt = ac.filter(a => /given|when|then/i.test(a));
    const missing = (ticket.missing_requirements || []).filter(p => p.trim());
    const notes = ticket.bsa_notes || [];
    const empNotes = notes.filter(n => /empower|ptd|awc|condition|exchange|pipeline|urla|docmagic/i.test(n));
    const emp = ticket.empower || {};
    const cr = ticket.change_request || [];
    const crText = cr.join(' ');
    return [
      { label:'Title present', ok: !!(ticket.title && ticket.title.trim()), hint:'Provide a concise ticket title' },
      { label:'Summary present and under 3 sentences', ok: !!(ticket.summary && ticket.summary.split(/[.!?]/).filter(s=>s.trim()).length <= 3), hint:'Shorten summary to 3 sentences or less' },
      { label:'Change request describes current vs expected behavior', ok: !!(cr.length > 0 && /current|existing|expected|should|instead/i.test(crText)), hint:'Add both current and expected behavior details' },
      { label:'At least 2 acceptance criteria in Given/When/Then format', ok: gwt.length >= 2, hint:`Found ${gwt.length}/2 Given/When/Then formatted criteria` },
      { label:'BSA notes include at least 1 Empower reference', ok: empNotes.length >= 1, hint:'Add a note referencing a specific Empower screen or field' },
      { label:'No unacknowledged missing requirements', ok: missing.length === 0, hint:`${missing.length} missing requirement(s) need resolution` },
      { label:'Empower screen identified', ok: !!(emp.screen && emp.screen.trim()), hint:'Identify the Empower screen affected' },
    ];
  }

  function buildTicketHtml(ticket) {
    const emp = ticket.empower || {};
    let h = '';
    h += `<h3>Summary</h3><p>${(ticket.summary||'').replace(/\n/g,'<br/>')}</p>`;
    h += `<h3>Change Request</h3><ul>${(ticket.change_request||[]).map(c=>`<li>${c}</li>`).join('')}</ul>`;
    h += `<h3>Acceptance Criteria</h3><ul>${(ticket.acceptance_criteria||[]).map(a=>`<li>${a}</li>`).join('')}</ul>`;
    h += `<h3>BSA Notes</h3><ul>${(ticket.bsa_notes||[]).map(n=>`<li>${n}</li>`).join('')}</ul>`;
    const missing = (ticket.missing_requirements||[]).filter(p=>p.trim());
    if (missing.length) h += `<h3>⚠ Missing Requirements</h3><ul>${missing.map(p=>`<li>${p}</li>`).join('')}</ul>`;
    h += `<h3>Empower</h3>`;
    if (emp.module)     h += `<p><strong>Module:</strong> ${emp.module}</p>`;
    if (emp.screen)     h += `<p><strong>Screen:</strong> ${emp.screen}</p>`;
    if (emp.logic_type) h += `<p><strong>Logic:</strong> ${emp.logic_type}</p>`;
    if ((emp.fields||[]).length) h += `<ul>${emp.fields.map(f=>`<li>${f}</li>`).join('')}</ul>`;
    return h;
  }

  // ── Feature 5: Post-Push Empower Context ─────────────────────
  function renderPostPushContext(ticket, adoId) {
    const area = document.getElementById('mail-parse-area');
    if (!area) return;

    const emp = ticket.empower || {};
    let screens = [emp.screen].filter(s => s && s.trim());
    if (!screens.length && window.EmpowerScreens) {
      screens = window.EmpowerScreens.detect(ticket.title||'', (ticket.change_request||[]).join(' '));
    }
    if (!screens.length) return;

    const BSA_CHECKLIST = [
      'Confirmed field exists on screen',
      'Validated expression/rule',
      'Checked PTD/AWC impact (if conditions)',
      'Verified vendor portal (if Exchange)',
      'Tested in UAT environment',
    ];

    const screensHtml = screens.map(s => {
      const detail = window.EmpowerScreens?.SCREEN_DETAILS?.[s] || null;
      const nav = detail?.nav || s;
      const ckHtml = BSA_CHECKLIST.map((c,i) =>
        `<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:2px 0;">
           <input type="checkbox"/><span style="color:var(--text-secondary);">${esc(c)}</span>
         </label>`
      ).join('');
      const hasAcademy = ['Exchange Title','Exchange Appraisal','Conditions','Admin Tools'].includes(s);
      return `<div style="margin-bottom:10px;padding:10px;background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:var(--radius);">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:3px;">🖥 ${esc(s)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${esc(nav)}</div>
        <div style="display:flex;flex-direction:column;">${ckHtml}</div>
        ${hasAcademy ? `<button class="emps-academy-btn" style="margin-top:6px;" onclick="window.navigateTo('academy')">View in Empower Academy →</button>` : ''}
      </div>`;
    }).join('');

    const card = document.createElement('div');
    card.style.cssText = 'margin-top:12px;padding:12px;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:var(--radius);';
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary);">🖥 Empower Context — ADO #${adoId}</span>
        <button id="emps-ctx-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:0;">✕</button>
      </div>
      ${screensHtml}`;
    area.appendChild(card);
    card.querySelector('#emps-ctx-close')?.addEventListener('click', () => card.remove());
  }

  // ── AI draft helper ──────────────────────────────────────────
  async function generateDraft(email) {
    const apiKey = window.appSettings?.anthropicKey;
    const from   = email.from?.emailAddress || {};
    const parsed = _parseCache[email.id];
    const context = parsed ? parsed.summary : (email.bodyPreview || '').slice(0, 300);
    if (!apiKey) return `Hi ${from.name?.split(' ')[0]||'there'},\n\nThank you for your email. I'll review this and follow up within 1-2 business days.\n\nBest,\nMeher Viguturi`;

    const prompt = `Draft a professional reply email from Meher Viguturi, BSA at The Loan Exchange, acknowledging this change request email. Confirm receipt, mention you will review and create an ADO work item, and give an estimated response time of 1-2 business days. Keep it under 80 words. Reply with ONLY the email body text.

Context: ${context}
Sender name: ${from.name || from.address || 'the sender'}`;

    const res = await window.api.ai.complete({ apiKey, messages: [{ role: 'user', content: prompt }] });
    return res.error ? null : (res.content?.[0]?.text || '').trim();
  }

  // ── Render entry ─────────────────────────────────────────────
  async function render(container) {
    _container   = container;
    stopAutoScan();
    const status = await window.api.mail.getStatus();
    _isConnected = status.connected;
    _userEmail   = status.email || '';

    showInbox();
    showConnectionBanner();

    if (!_isConnected) {
      renderList();        // shows skeleton items
      showPreviewDetail(); // shows 3-panel placeholder
      return;
    }

    if (_emails.length === 0) {
      const listEl = document.getElementById('mail-list');
      if (listEl) listEl.innerHTML = `<div class="mail-list-empty"><div class="mail-spinner" style="margin:0 auto 8px;"></div>Loading…</div>`;
      await fetchEmails(false);
    } else {
      renderList();
    }
    startAutoScan();
  }

  function cleanup() { stopAutoScan(); _container = null; }

  function getContext() {
    return {
      'Screen':          '📬 Mail Inbox',
      'Total emails':    _emails.length,
      'Unread':          _emails.filter(e => !e.isRead).length,
      'Change Requests': _emails.filter(isCR).length,
      'Selected':        _selected ? `"${_selected.subject}"` : 'none',
    };
  }

  // ── Self-register ────────────────────────────────────────────
  window.Modules = window.Modules || {};
  window.Modules.mail = { render, cleanup, getContext };

  // ── Background badge poll ────────────────────────────────────
  setInterval(async () => {
    const status = await window.api.mail?.getStatus?.();
    if (!status?.connected) return;
    const res = await window.api.mail?.getUnreadCount?.();
    if (res?.unreadItemCount !== undefined) updateMailBadge(res.unreadItemCount);
  }, 2 * 60 * 1000);

})();
