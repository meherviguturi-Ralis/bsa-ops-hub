/* ============================================================
   BSA Ops Hub — Follow-Up Tracker
   Features: Outlook reply detection, AI-drafted responses,
             conversation timeline per item
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'bsa-followup-items';

  const KNOWN_STAKEHOLDERS = [
    { name: 'Neil Pham',       email: 'neil.pham@theloanexchange.com' },
    { name: 'Steve Navarette', email: 'steve.navarette@theloanexchange.com' },
    { name: 'Paul Yap',        email: 'paul.yap@ralisservices.com' },
    { name: 'Jason Goliver',   email: 'jason.goliver@ralisservices.com' }
  ];

  /* ----------------------------------------------------------
     Data Helpers
  ---------------------------------------------------------- */

  function loadItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function saveItems(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { /* silent */ }
  }

  function getItem(id) {
    return loadItems().find(i => i.id === id) || null;
  }

  function updateItem(id, patch) {
    const all = loadItems();
    const idx = all.findIndex(i => i.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...patch };
    saveItems(all);
    return all[idx];
  }

  function generateId() {
    return 'fu-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* ----------------------------------------------------------
     Time / Urgency Helpers
  ---------------------------------------------------------- */

  function timeSince(isoDate) {
    if (!isoDate) return 'Unknown';
    const ms = Date.now() - new Date(isoDate).getTime();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d >= 1) return d === 1 ? '1 day ago' : `${d} days ago`;
    if (h >= 1) return h === 1 ? '1 hour ago' : `${h} hours ago`;
    if (m >= 1) return m === 1 ? '1 min ago' : `${m} mins ago`;
    return 'Just now';
  }

  function formatDateShort(isoDate) {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(isoDate) {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function getDaysWaiting(isoDate) {
    if (!isoDate) return 0;
    return (Date.now() - new Date(isoDate).getTime()) / 86400000;
  }

  function getUrgencyInfo(days) {
    if (days < 1)  return { cls: 'urgency-low',      label: 'Fresh',    color: 'var(--green)' };
    if (days < 3)  return { cls: 'urgency-medium',   label: 'Waiting',  color: 'var(--yellow)' };
    if (days < 7)  return { cls: 'urgency-high',     label: 'Overdue',  color: 'var(--orange)' };
    return             { cls: 'urgency-critical', label: 'Critical', color: 'var(--red)' };
  }

  function getFollowUpCount(item) {
    return (item.timeline || []).filter(e => e.type === 'sent').length;
  }

  function getLastContact(item) {
    const sent = (item.timeline || []).filter(e => e.type === 'sent');
    return sent.length ? sent[sent.length - 1].date : item.addedAt;
  }

  /* ----------------------------------------------------------
     Links
  ---------------------------------------------------------- */

  function teamsLink(email, message) {
    const base = `msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
    return message ? `${base}&message=${encodeURIComponent(message)}` : base;
  }

  function outlookSearchLink(workItemId, title) {
    const q = `#${workItemId} ${(title || '').slice(0, 40)}`;
    return `https://outlook.office.com/mail/inbox?path=/search&q=${encodeURIComponent(q)}`;
  }

  function adoLink(workItemId) {
    return `https://dev.azure.com/TheLoanExchange/TLE.Empower/_workitems/edit/${workItemId}`;
  }

  /* ----------------------------------------------------------
     Build Template Follow-Up (fallback when AI unavailable)
  ---------------------------------------------------------- */

  function buildTemplateFollowUp(item, followUpNum) {
    const days = Math.round(getDaysWaiting(item.addedAt));
    const title = item.workItemTitle || 'this request';
    const firstName = (item.waitingOn || '').split(' ')[0] || item.waitingOn;
    const subject = followUpNum > 1
      ? `Following Up: ${title}`
      : `Follow-Up: ${title}`;

    const openers = [
      `I hope this finds you well. I wanted to touch base regarding`,
      `I'm reaching out to follow up on`,
      `I hope your week is going well! I wanted to check in on`
    ];
    const opener = openers[(followUpNum - 1) % openers.length];

    const body = days > 7
      ? `${opener} "${title}." We'd love to keep this moving — could you let us know where things stand when you get a chance?`
      : `${opener} "${title}." Whenever you have a moment, any update you can share would be really helpful.`;

    const userName = (window.appSettings || {}).userName || 'Meher Viguturi';

    return `Subject: ${subject}

Hi ${firstName},

${body}

Please don't hesitate to reach out if you have any questions or need anything from my end.

Best regards,
${userName}
Business Systems Analyst — The Loan Exchange`;
  }

  /* ----------------------------------------------------------
     AI: Draft Next Follow-Up (smart, context-aware)
  ---------------------------------------------------------- */

  // toneVariant: 0=balanced, 1=formal, 2=casual, 3=gentle urgency
  async function aiDraftNextFollowUp(item, replyContent, toneVariant) {
    const followUpNum = getFollowUpCount(item) + 1;
    const daysSinceAdded = Math.round(getDaysWaiting(item.addedAt));
    const lastSentDate = getLastContact(item);
    const daysSinceLast = Math.round(getDaysWaiting(lastSentDate));
    const firstName = (item.waitingOn || '').split(' ')[0] || item.waitingOn;
    const userName = (window.appSettings || {}).userName || 'Meher Viguturi';

    const toneInstructions = [
      'Warm and professional. Use a friendly opener like "I hope this finds you well" or "I hope your week is going well." Sound like a thoughtful colleague, not a ticket system.',
      'Polished and formal. Use measured, precise language appropriate for executive communication. Still warm but more structured.',
      'Conversational and friendly. Light, approachable tone — like a message from a colleague you work with regularly. Brief and easy to read.',
      'Warm but gently conveys urgency. Acknowledge the wait with empathy, clearly express that the project needs to move forward, but remain fully professional and non-pressuring.'
    ];
    const tone = toneInstructions[toneVariant || 0];

    const previousMessages = (item.timeline || [])
      .filter(e => e.type === 'sent' || e.type === 'reply')
      .map(e => e.type === 'sent'
        ? `[SENT - ${formatDateShort(e.date)}] Follow-Up #${e.followUpNumber}:\n${e.message}`
        : `[REPLY RECEIVED - ${formatDateShort(e.date)}] From ${e.from}:\n${e.content}`)
      .join('\n\n---\n\n');

    const system = `You are drafting a follow-up email on behalf of ${userName}, a Business Systems Analyst at The Loan Exchange.

TONE: ${tone}

STRICT RULES:
- Never include ADO ticket IDs, work item numbers, or any internal system identifiers in the email body.
- Reference the topic by its title only, not by any ID.
- Never say "We've been waiting" — use softer alternatives.
- Keep it under 130 words (excluding subject line).
- Start the output with "Subject:" on its own line, then a blank line, then the email body.
- Sign off as ${userName}, Business Systems Analyst — The Loan Exchange.`;

    const userMsg = `Draft follow-up email #${followUpNum}.

TOPIC: "${item.workItemTitle || 'the item we discussed'}"
RECIPIENT FIRST NAME: ${firstName}
WAITING ${daysSinceLast} day${daysSinceLast !== 1 ? 's' : ''} since last contact (${daysSinceAdded} days total)
NOTES: ${item.notes || 'None'}

CONVERSATION HISTORY:
${previousMessages || '(No prior messages)'}

${replyContent ? `THEIR MOST RECENT REPLY:\n${replyContent}` : ''}`;

    try {
      const response = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        system,
        messages: [{ role: 'user', content: userMsg }]
      });
      if (response && response.content && response.content[0]) {
        const text = (response.content[0].text || '').trim();
        if (text) return text;
      }
    } catch (e) { /* fall through */ }

    return buildTemplateFollowUp(item, followUpNum);
  }

  /* ----------------------------------------------------------
     Modal: Send Follow-Up
  ---------------------------------------------------------- */

  function showSendModal(item, draftText) {
    closeModal();
    const followUpNum = getFollowUpCount(item) + 1;
    let _regenCount = 0;

    const TONE_LABELS = ['🔄 Try More Formal', '🔄 Try Casual & Friendly', '🔄 Try Gentle Urgency', '🔄 Regenerate'];

    const modal = document.createElement('div');
    modal.id = 'fu-modal';
    modal.className = 'fu-modal-overlay';
    modal.innerHTML = `
      <div class="fu-modal-box">
        <div class="fu-modal-header">
          <div>
            <div class="fu-modal-title">✍️ Follow-Up #${followUpNum} — ${escHtml(item.workItemTitle || '')}</div>
            <div class="fu-modal-sub">To: ${escHtml(item.waitingOn || '—')}${item.waitingOnEmail ? ` · ${escHtml(item.waitingOnEmail)}` : ''}</div>
          </div>
          <button class="fu-modal-close" id="fu-modal-close">✕</button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;">Message — edit before sending</div>
          <button class="btn btn-secondary" id="fu-regen-btn" style="font-size:11px;padding:4px 10px;">
            ${TONE_LABELS[0]}
          </button>
        </div>
        <textarea id="fu-send-text" class="fu-modal-textarea">${escHtml(draftText)}</textarea>
        <div id="fu-regen-status" style="font-size:11px;color:var(--text-muted);min-height:16px;text-align:right;"></div>

        <div class="fu-modal-actions">
          <button class="btn btn-secondary" id="fu-copy-btn">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="5" y="5" width="9" height="9" rx="1"/><path d="M2 11V2h9"/>
            </svg>
            Copy
          </button>
          <button class="btn btn-secondary" id="fu-teams-send-btn">
            💬 Send via Teams
          </button>
          <button class="btn btn-primary" id="fu-outlook-send-btn">
            📧 Open in Outlook
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    function extractSubject(body) {
      const m = (body || '').match(/^Subject:\s*(.+)/m);
      return m ? m[1].trim() : `Follow-Up: ${item.workItemTitle || 'Our Discussion'}`;
    }

    // Returns "Re: <last sent subject>" for threading, or the current subject for the first send
    function getOutlookSubject(currentText) {
      const timeline = item.timeline || [];
      const lastSent = [...timeline].reverse().find(e => e.type === 'sent' && e.subject);
      const base = lastSent ? lastSent.subject : extractSubject(currentText);
      // Strip any existing Re: stack to avoid "Re: Re: Re:..."
      const stripped = base.replace(/^(Re:\s*)+/i, '').trim();
      return lastSent ? `Re: ${stripped}` : stripped;
    }

    // Prefer recipient stored from previous send; fall back to item email
    function getOutlookRecipient() {
      const timeline = item.timeline || [];
      const lastSent = [...timeline].reverse().find(e => e.type === 'sent' && e.recipientEmail);
      return (lastSent && lastSent.recipientEmail) || item.waitingOnEmail || '';
    }

    function logSent() {
      const text = document.getElementById('fu-send-text').value;
      const subject = extractSubject(text);
      const all = loadItems();
      const idx = all.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        if (!all[idx].timeline) all[idx].timeline = [];
        all[idx].timeline.push({
          type:           'sent',
          date:           new Date().toISOString(),
          followUpNumber: followUpNum,
          message:        text,
          subject:        subject,
          recipientEmail: item.waitingOnEmail || ''
        });
        all[idx].lastContactAt = new Date().toISOString();
        saveItems(all);
      }
      try { window.XP && window.XP.award('FOLLOW_UP_SENT', `Follow-up #${followUpNum} for ${item.workItemTitle}`); } catch (e) {}
      try { window.Sounds && window.Sounds.followUp(); } catch (e) {}
    }

    modal.querySelector('#fu-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Regenerate button
    modal.querySelector('#fu-regen-btn').addEventListener('click', async () => {
      const regenBtn = document.getElementById('fu-regen-btn');
      const statusEl = document.getElementById('fu-regen-status');
      const textarea = document.getElementById('fu-send-text');

      _regenCount++;
      const toneVariant = ((_regenCount - 1) % 3) + 1; // cycles 1,2,3

      if (regenBtn) { regenBtn.disabled = true; regenBtn.textContent = 'Regenerating…'; }
      if (statusEl) statusEl.textContent = '';

      try {
        const newDraft = await aiDraftNextFollowUp(item, null, toneVariant);
        if (textarea) textarea.value = newDraft;
        if (statusEl) statusEl.textContent = `✓ Regenerated (${['formal', 'casual', 'gentle urgency'][toneVariant - 1]} tone)`;
      } catch (e) {
        if (statusEl) statusEl.textContent = '✗ Regeneration failed';
      }

      if (regenBtn) {
        regenBtn.disabled = false;
        regenBtn.textContent = TONE_LABELS[Math.min(_regenCount, TONE_LABELS.length - 1)];
      }
    });

    modal.querySelector('#fu-copy-btn').addEventListener('click', () => {
      const text = document.getElementById('fu-send-text').value;
      navigator.clipboard.writeText(text).catch(() => {});
      logSent();
      window.showToast('Copied & logged as sent', 'success');
      closeModal();
      reRender();
    });

    modal.querySelector('#fu-teams-send-btn').addEventListener('click', () => {
      const text = document.getElementById('fu-send-text').value;
      // Strip subject line for Teams message
      const body = text.replace(/^Subject:.*\n\n?/m, '').trim();
      const link = teamsLink(item.waitingOnEmail || '', body);
      window.api.shell.openExternal(link);
      logSent();
      window.showToast('Opening Teams…', 'info');
      closeModal();
      reRender();
    });

    modal.querySelector('#fu-outlook-send-btn').addEventListener('click', () => {
      const text = document.getElementById('fu-send-text').value;
      const subject   = getOutlookSubject(text);
      const recipient = getOutlookRecipient();
      // Strip subject line from body for mailto
      const body = text.replace(/^Subject:.*\n\n?/m, '').trim();
      const mailto = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.api.shell.openExternal(mailto);
      logSent();
      window.showToast('Opening Outlook…', 'info');
      closeModal();
      reRender();
    });
  }

  /* ----------------------------------------------------------
     Modal: Mark Reply Received
  ---------------------------------------------------------- */

  function showReplyModal(item) {
    closeModal();

    const modal = document.createElement('div');
    modal.id = 'fu-modal';
    modal.className = 'fu-modal-overlay';
    modal.innerHTML = `
      <div class="fu-modal-box">
        <div class="fu-modal-header">
          <div>
            <div class="fu-modal-title">Mark Reply Received</div>
            <div class="fu-modal-sub">#${item.workItemId} · ${item.workItemTitle}</div>
          </div>
          <button class="fu-modal-close" id="fu-modal-close">✕</button>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Who replied?</label>
          <input type="text" id="fu-reply-from" value="${escHtml(item.waitingOn)}"
            style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:var(--radius);color:var(--text-primary);padding:8px 10px;font-size:13px;" />
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">
            Paste their reply <span style="color:var(--text-muted);">(optional — used by AI to draft next follow-up)</span>
          </label>
          <textarea id="fu-reply-content" rows="5" placeholder="Paste the reply email or Teams message here…"
            style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:var(--radius);color:var(--text-primary);padding:10px 12px;font-size:13px;resize:vertical;line-height:1.6;"></textarea>
        </div>

        <div class="fu-modal-actions">
          <button class="btn btn-secondary" id="fu-reply-save-only">Save Reply Only</button>
          <button class="btn btn-primary" id="fu-reply-save-draft">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="6"/><path d="M6 6c0-1.5 4-1.5 4 .5C10 8 8 8.5 8 10" stroke-linecap="round"/>
              <circle cx="8" cy="12.5" r=".5" fill="currentColor" stroke="none"/>
            </svg>
            Save &amp; Draft Smart Reply
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#fu-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    function saveReply() {
      const from = (document.getElementById('fu-reply-from').value || '').trim() || item.waitingOn;
      const content = (document.getElementById('fu-reply-content').value || '').trim();
      const all = loadItems();
      const idx = all.findIndex(i => i.id === item.id);
      if (idx === -1) return null;
      if (!all[idx].timeline) all[idx].timeline = [];
      all[idx].timeline.push({
        type: 'reply',
        date: new Date().toISOString(),
        from,
        content
      });
      saveItems(all);
      try { window.Sounds && window.Sounds.newItem(); } catch (e) {}
      return { from, content, updatedItem: all[idx] };
    }

    modal.querySelector('#fu-reply-save-only').addEventListener('click', () => {
      saveReply();
      closeModal();
      window.showToast('Reply logged', 'success');
      reRender();
    });

    modal.querySelector('#fu-reply-save-draft').addEventListener('click', async () => {
      const saved = saveReply();
      if (!saved) { closeModal(); return; }

      closeModal();
      window.showToast('Reply logged. Drafting smart follow-up…', 'info');

      const draftText = await aiDraftNextFollowUp(saved.updatedItem, saved.content);
      showSendModal(saved.updatedItem, draftText);
      reRender();
    });
  }

  /* ----------------------------------------------------------
     Render: Timeline Thread
  ---------------------------------------------------------- */

  function renderTimeline(item) {
    const events = item.timeline || [];
    if (events.length === 0) {
      return `<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No messages logged yet.</div>`;
    }

    const lines = events.map((ev, idx) => {
      const isSent  = ev.type === 'sent';
      const isReply = ev.type === 'reply';
      const isAdded = ev.type === 'added';

      if (ev.type === 'email_received') {
        return `
          <div class="tl-event tl-added">
            <div class="tl-dot" style="background:var(--accent);box-shadow:0 0 6px var(--accent);"></div>
            <div class="tl-content">
              <div class="tl-meta">
                <span class="tl-tag" style="background:rgba(88,166,255,0.15);color:var(--accent);border:1px solid rgba(88,166,255,0.3);">📧 Email received</span>
                <span class="tl-date">${formatDateTime(ev.date)}</span>
              </div>
              ${ev.label ? `<div class="tl-body" style="font-weight:600;margin-bottom:2px;">${escHtml(ev.label)}</div>` : ''}
              ${ev.preview ? `<div class="tl-body" style="font-size:11px;color:var(--text-muted);white-space:pre-wrap;max-height:80px;overflow:hidden;">${escHtml(ev.preview)}</div>` : ''}
            </div>
          </div>`;
      }

      if (isAdded) {
        return `
          <div class="tl-event tl-added">
            <div class="tl-dot tl-dot-added"></div>
            <div class="tl-content">
              <div class="tl-meta">Tracking started · ${formatDateTime(ev.date)}</div>
              ${ev.note ? `<div class="tl-body">${escHtml(ev.note)}</div>` : ''}
            </div>
          </div>`;
      }

      // Check for overdue gap before this event
      let gapHtml = '';
      if (idx > 0 && (isSent || isReply)) {
        const prev = events[idx - 1];
        const gapDays = (new Date(ev.date) - new Date(prev.date)) / 86400000;
        if (gapDays > 3 && prev.type === 'sent' && isReply === false) {
          // Overdue gap between sent and next sent (no reply came)
        } else if (gapDays > 5) {
          gapHtml = `
            <div class="tl-gap">
              <div class="tl-gap-line"></div>
              <div class="tl-gap-label">⚠ ${Math.round(gapDays)} day gap</div>
            </div>`;
        }
      }

      if (isSent) {
        const preview = (ev.message || '').split('\n').slice(0, 3).join(' ').slice(0, 120);
        return `${gapHtml}
          <div class="tl-event tl-sent">
            <div class="tl-dot tl-dot-sent"></div>
            <div class="tl-content">
              <div class="tl-meta">
                <span class="tl-tag tl-tag-sent">You · Follow-Up #${ev.followUpNumber}</span>
                <span class="tl-date">${formatDateTime(ev.date)}</span>
              </div>
              <div class="tl-body tl-body-sent">${escHtml(preview)}${ev.message && ev.message.length > 120 ? '…' : ''}</div>
            </div>
          </div>`;
      }

      if (isReply) {
        const preview = (ev.content || '(no content pasted)').slice(0, 160);
        return `${gapHtml}
          <div class="tl-event tl-reply">
            <div class="tl-dot tl-dot-reply"></div>
            <div class="tl-content">
              <div class="tl-meta">
                <span class="tl-tag tl-tag-reply">${escHtml(ev.from)} replied</span>
                <span class="tl-date">${formatDateTime(ev.date)}</span>
              </div>
              ${ev.content
                ? `<div class="tl-body tl-body-reply">${escHtml(preview)}${ev.content.length > 160 ? '…' : ''}</div>`
                : `<div class="tl-body" style="color:var(--text-muted);font-style:italic;">(reply content not pasted)</div>`}
            </div>
          </div>`;
      }

      return '';
    }).join('');

    return `<div class="tl-thread">${lines}</div>`;
  }

  /* ----------------------------------------------------------
     Render: Item Card
  ---------------------------------------------------------- */

  function renderItemCard(item) {
    const days = getDaysWaiting(item.addedAt);
    const urg  = getUrgencyInfo(days);
    const followUpCount = getFollowUpCount(item);
    const lastReply = (item.timeline || []).filter(e => e.type === 'reply').slice(-1)[0];

    return `
      <div class="card fu-item-card" style="border-left:3px solid ${urg.color};" data-item-id="${item.id}">

        <!-- Header row -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px;">
              <a href="${adoLink(item.workItemId)}" target="_blank"
                 style="font-size:11px;color:var(--text-muted);font-family:monospace;text-decoration:none;"
                 onclick="event.stopPropagation()">#${item.workItemId}</a>
              <span style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px;"
                >${escHtml(item.workItemTitle)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);">
              <span>👤 ${escHtml(item.waitingOn)}</span>
              <span style="color:var(--text-muted);">·</span>
              <span>⏱ Waiting ${timeSince(item.addedAt)}</span>
              <span style="color:var(--text-muted);">·</span>
              <span class="urgency-badge ${urg.cls}">${urg.label}</span>
              ${followUpCount > 0
                ? `<span style="color:var(--text-muted);">· ${followUpCount} follow-up${followUpCount > 1 ? 's' : ''} sent</span>`
                : ''}
              ${lastReply
                ? `<span style="color:var(--green);font-weight:600;">· ✓ Reply received ${timeSince(lastReply.date)}</span>`
                : ''}
            </div>
          </div>

          <!-- Action buttons -->
          <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0;min-width:110px;">
            <button class="btn btn-secondary fu-btn" data-action="draft" data-id="${item.id}"
                    style="font-size:11px;padding:5px 8px;justify-content:center;">
              ✍️ Draft Follow-Up
            </button>
            <button class="btn btn-secondary fu-btn" data-action="reply" data-id="${item.id}"
                    style="font-size:11px;padding:5px 8px;justify-content:center;">
              📬 Mark Reply
            </button>
            <button class="btn btn-secondary fu-btn" data-action="outlook" data-id="${item.id}"
                    style="font-size:11px;padding:5px 8px;justify-content:center;">
              🔍 Check Outlook
            </button>
            <button class="btn btn-secondary fu-btn" data-action="teams" data-id="${item.id}"
                    style="font-size:11px;padding:5px 8px;justify-content:center;">
              💬 Teams Chat
            </button>
            <button class="btn fu-btn" data-action="resolve" data-id="${item.id}"
                    style="font-size:11px;padding:5px 8px;justify-content:center;background:rgba(63,185,80,0.12);border-color:var(--green);color:var(--green);">
              ✓ Resolved
            </button>
          </div>
        </div>

        <!-- Urgency progress bar -->
        <div style="height:3px;background:var(--bg-tertiary);border-radius:999px;overflow:hidden;margin-bottom:10px;">
          <div style="height:100%;width:${Math.min(Math.round((days / 7) * 100), 100)}%;background:${urg.color};border-radius:999px;transition:width 500ms ease;"></div>
        </div>

        ${item.notes ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic;margin-bottom:8px;">📝 ${escHtml(item.notes)}</div>` : ''}

        <!-- Timeline toggle -->
        <div style="border-top:1px solid var(--border-subtle);padding-top:8px;margin-top:4px;">
          <button class="fu-btn fu-tl-toggle" data-id="${item.id}"
                  style="background:none;border:none;font-size:11px;color:var(--text-muted);cursor:pointer;padding:0;display:flex;align-items:center;gap:5px;">
            <svg id="tl-chevron-${item.id}" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"
                 style="transition:transform 200ms ease;">
              <polyline points="2,3 5,7 8,3"/>
            </svg>
            ${(item.timeline || []).length
              ? `Thread (${(item.timeline || []).length} event${(item.timeline || []).length > 1 ? 's' : ''})`
              : 'No messages logged yet'}
          </button>
          <div class="fu-timeline-body" id="tl-body-${item.id}" style="display:none;margin-top:10px;">
            ${renderTimeline(item)}
          </div>
        </div>
      </div>
    `;
  }

  /* ----------------------------------------------------------
     Re-render helper (called after mutations)
  ---------------------------------------------------------- */

  let _container = null;

  function reRender() {
    if (_container) render(_container);
  }

  /* ----------------------------------------------------------
     Escape HTML
  ---------------------------------------------------------- */

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function closeModal() {
    const m = document.getElementById('fu-modal');
    if (m) m.remove();
  }

  /* ----------------------------------------------------------
     Render: Full Module
  ---------------------------------------------------------- */

  function render(container) {
    _container = container;
    const items = loadItems().filter(i => i.status !== 'resolved');

    const total   = items.length;
    const overdue = items.filter(i => getDaysWaiting(i.addedAt) > 3).length;
    const avgWait = total
      ? (items.reduce((s, i) => s + getDaysWaiting(i.addedAt), 0) / total).toFixed(1)
      : '0';
    const repliesReceived = items.filter(i =>
      (i.timeline || []).some(e => e.type === 'reply')).length;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">Follow-Up Tracker</div>
        <div class="module-subtitle">Smart replies, AI-drafted responses, and conversation threads</div>
      </div>

      <!-- Stats -->
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
        <div class="card">
          <div class="card-header">Waiting</div>
          <div class="card-value">${total}</div>
          <div class="card-label">active items</div>
        </div>
        <div class="card">
          <div class="card-header">Overdue</div>
          <div class="card-value" style="color:var(--red);">${overdue}</div>
          <div class="card-label">&gt;3 days</div>
        </div>
        <div class="card">
          <div class="card-header">Avg Wait</div>
          <div class="card-value">${avgWait}</div>
          <div class="card-label">days</div>
        </div>
        <div class="card">
          <div class="card-header">Replies In</div>
          <div class="card-value" style="color:var(--green);">${repliesReceived}</div>
          <div class="card-label">replied</div>
        </div>
      </div>

      <!-- Add Form Toggle -->
      <div style="margin-bottom:16px;">
        <button class="btn btn-secondary" id="fu-toggle-add">+ Track New Item</button>
      </div>

      <!-- Add Form -->
      <div id="fu-add-form" style="display:none;background:var(--bg-panel);border:1px solid var(--border-default);border-radius:6px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:14px;">New Follow-Up Item</div>
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          <div class="form-group" style="flex:0 0 130px;margin-bottom:0;">
            <label>ADO Work Item ID</label>
            <input type="number" id="fu-new-id" placeholder="e.g. 1466" />
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label>Title / Description</label>
            <input type="text" id="fu-new-title" placeholder="Brief description of what you need" />
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label>Waiting On</label>
            <input type="text" id="fu-new-name" placeholder="e.g. Steve Navarette" list="fu-stakeholder-list" />
            <datalist id="fu-stakeholder-list">
              ${KNOWN_STAKEHOLDERS.map(s => `<option value="${s.name}">`).join('')}
            </datalist>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label>Email</label>
            <input type="text" id="fu-new-email" placeholder="email@theloanexchange.com" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
          <label>Notes</label>
          <textarea id="fu-new-notes" placeholder="What are you waiting on exactly?" style="min-height:56px;"></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" id="fu-save-new">Track Item</button>
          <button class="btn btn-secondary" id="fu-cancel-new">Cancel</button>
        </div>
      </div>

      <!-- Item List -->
      <div id="fu-item-list">
        ${items.length === 0
          ? '<div class="empty-state">No items being tracked. Add one above to get started.</div>'
          : items.map(renderItemCard).join('')}
      </div>

      <!-- Known Stakeholders -->
      <div class="card" style="margin-top:20px;">
        <div class="section-title" style="margin-bottom:12px;">Quick Contact — Known Stakeholders</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${KNOWN_STAKEHOLDERS.map(s => `
            <button class="btn btn-secondary stakeholder-btn fu-btn"
                    data-action="quick-teams" data-email="${s.email}" data-name="${s.name}"
                    style="font-size:12px;">
              💬 ${s.name} →
            </button>
          `).join('')}
        </div>
      </div>
    `;

    wireEvents(container, items);
  }

  /* ----------------------------------------------------------
     Wire Events
  ---------------------------------------------------------- */

  function wireEvents(container, items) {
    // Add form toggle
    container.querySelector('#fu-toggle-add').addEventListener('click', () => {
      const form = container.querySelector('#fu-add-form');
      const btn  = container.querySelector('#fu-toggle-add');
      const open = form.style.display === 'none';
      form.style.display = open ? 'block' : 'none';
      btn.textContent = open ? '– Close' : '+ Track New Item';
    });

    container.querySelector('#fu-cancel-new').addEventListener('click', () => {
      container.querySelector('#fu-add-form').style.display = 'none';
      container.querySelector('#fu-toggle-add').textContent = '+ Track New Item';
    });

    // Auto-fill email when known stakeholder typed
    const nameInput  = container.querySelector('#fu-new-name');
    const emailInput = container.querySelector('#fu-new-email');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        const match = KNOWN_STAKEHOLDERS.find(s =>
          s.name.toLowerCase() === nameInput.value.toLowerCase());
        if (match && emailInput && !emailInput.value) {
          emailInput.value = match.email;
        }
      });
    }

    // Save new item
    container.querySelector('#fu-save-new').addEventListener('click', () => {
      const wiId    = parseInt(container.querySelector('#fu-new-id').value) || 0;
      const wiTitle = container.querySelector('#fu-new-title').value.trim();
      const name    = container.querySelector('#fu-new-name').value.trim();
      const email   = container.querySelector('#fu-new-email').value.trim();
      const notes   = container.querySelector('#fu-new-notes').value.trim();

      if (!wiId || !name) {
        window.showToast('Work Item ID and name are required.', 'error');
        return;
      }

      const all = loadItems();
      all.push({
        id: generateId(),
        workItemId: wiId,
        workItemTitle: wiTitle || `Work Item #${wiId}`,
        waitingOn: name,
        waitingOnEmail: email,
        addedAt: new Date().toISOString(),
        lastContactAt: null,
        notes,
        status: 'waiting',
        timeline: [{
          type: 'added',
          date: new Date().toISOString(),
          note: notes || 'Follow-up tracking started'
        }]
      });
      saveItems(all);
      try { window.Sounds && window.Sounds.newItem(); } catch (e) {}
      window.showToast(`Tracking follow-up for ${name}`, 'success');
      reRender();
    });

    // Delegate all item-level actions
    container.querySelector('#fu-item-list').addEventListener('click', async (e) => {
      // Timeline toggle
      const tlToggle = e.target.closest('.fu-tl-toggle');
      if (tlToggle) {
        const id   = tlToggle.dataset.id;
        const body = document.getElementById(`tl-body-${id}`);
        const chev = document.getElementById(`tl-chevron-${id}`);
        if (body) {
          const open = body.style.display === 'none';
          body.style.display = open ? 'block' : 'none';
          if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
        }
        return;
      }

      // Action buttons
      const btn = e.target.closest('.fu-btn[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id     = btn.dataset.id;

      if (action === 'quick-teams') {
        const email = btn.dataset.email;
        window.api.shell.openExternal(teamsLink(email));
        return;
      }

      const item = getItem(id);
      if (!item) return;

      if (action === 'draft') {
        window.showToast('Drafting AI follow-up…', 'info');
        const draftText = await aiDraftNextFollowUp(item, null);
        showSendModal(item, draftText);
        return;
      }

      if (action === 'reply') {
        showReplyModal(item);
        return;
      }

      if (action === 'outlook') {
        const url = outlookSearchLink(item.workItemId, item.workItemTitle);
        window.api.shell.openExternal(url);
        window.showToast('Opening Outlook search…', 'info');
        return;
      }

      if (action === 'teams') {
        window.api.shell.openExternal(teamsLink(item.waitingOnEmail || ''));
        return;
      }

      if (action === 'resolve') {
        const all = loadItems();
        const idx = all.findIndex(i => i.id === id);
        if (idx !== -1) {
          all.splice(idx, 1);
          saveItems(all);
          try { window.XP && window.XP.award('FOLLOW_UP_SENT', `Resolved #${item.workItemId}`); } catch (e) {}
          try { window.Sounds && window.Sounds.complete(); } catch (e) {}
          try { window.Celebration && window.Celebration.taskComplete(); } catch (e) {}
          window.showToast('Follow-up resolved! 🎉', 'success');
          reRender();
        }
      }
    });
  }

  /* ----------------------------------------------------------
     Self-register
  ---------------------------------------------------------- */

  window.Modules = window.Modules || {};
  window.Modules.followup = {
    render,
    cleanup() { _container = null; closeModal(); }
  };

})();
