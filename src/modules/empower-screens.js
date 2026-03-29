/* ============================================================
   Empower Screen Mapper — shared utility
   Used by Dashboard + Work Items detail panels (Features 4 & 5)
   ============================================================ */

(function () {
  'use strict';

  const SCREEN_KEYWORD_MAP = {
    'Pipeline':           ['pipeline', 'loan list', 'search loan'],
    'Loan Summary':       ['loan summary', 'borrower info', 'loan details'],
    'Conditions':         ['condition', 'ptd', 'awc', 'prior to docs', 'prior to funding'],
    'Exchange Title':     ['exchange title', 'title order', 'realec', 'event 100', 'event 130', 'event 150', 'event 180', 'event 385'],
    'Exchange Appraisal': ['exchange appraisal', 'appraisal order', 'socal direct'],
    'DocMagic':           ['docmagic', 'document package', 'xml'],
    'DocuTech':           ['docutech', 'compliance', 'disclosure'],
    'URLA 1003':          ['urla', '1003', 'gross monthly income', 'borrower application'],
    'Fees':               ['fee', 'closing cost', 'apr'],
    'Rate Lock':          ['rate lock', 'lock', 'float'],
    'Underwriting':       ['underwriting', 'uw', 'decision'],
    'Closing':            ['closing', 'closing date', 'settlement'],
    'Funding':            ['funding', 'fund', 'wire'],
    'Admin Tools':        ['admin', 'configuration', 'expression', 'validation rule', 'business rule']
  };

  const SCREEN_DETAILS = {
    'Pipeline':           { nav: 'Empower → Loan Pipeline (main screen)', fields: ['Loan Number','Borrower Name','Loan Amount','Status','Assigned To'], checklist: ['Confirmed loan appears in pipeline','Verified filter/sort settings','Checked column visibility'] },
    'Loan Summary':       { nav: 'Pipeline → Open Loan → Loan Summary tab', fields: ['Borrower Name','Property Address','Loan Amount','Loan Type','Lien Position'], checklist: ['Confirmed borrower data fields','Verified loan type mapping','Checked property fields'] },
    'Conditions':         { nav: 'Pipeline → Open Loan → Conditions tab', fields: ['Condition Category','PTD/AWC/PTC flag','Responsible Party','Due Date','Cleared By'], checklist: ['Confirmed field exists on screen','Validated expression/rule','Checked PTD/AWC impact'] },
    'Exchange Title':     { nav: 'Pipeline → Open Loan → Services tab → Exchange Title', fields: ['Title Vendor','Order Status','Event Trigger','Commitment Date'], checklist: ['Confirmed field exists on screen','Validated expression/rule','Verified vendor portal','Checked event sequence (100→130→150→385→180)'] },
    'Exchange Appraisal': { nav: 'Pipeline → Open Loan → Services tab → Exchange Appraisal', fields: ['AMC Vendor','Order Status','Appraised Value','UCDP Status'], checklist: ['Confirmed field exists on screen','Verified AMC panel assignment','Checked UCDP submission settings'] },
    'DocMagic':           { nav: 'Pipeline → Open Loan → Forms tab → DocMagic', fields: ['Document Type','Package Status','SmartClose Settings','State Package'], checklist: ['Confirmed field exists on screen','Validated DocMagic field mapping','Checked TRID timing settings'] },
    'DocuTech':           { nav: 'Pipeline → Open Loan → Forms tab → DocuTech / SureDocs', fields: ['Doc Package Type','Closing Disclosure','API Token Status'], checklist: ['Confirmed field exists on screen','Verified doc package type','Checked CD generation settings'] },
    'URLA 1003':          { nav: 'Pipeline → Open Loan → URLA 1003 tab', fields: ['Borrower Income','Employment Type','Assets','Liabilities','Declarations'], checklist: ['Confirmed field exists on screen','Checked field mapping to Empower fields','Tested in UAT'] },
    'Fees':               { nav: 'Pipeline → Open Loan → Fees tab', fields: ['Fee Name','Fee Amount','Paid By','APR Flag','Section'], checklist: ['Confirmed field exists on screen','Checked APR impact','Validated closing cost calculation'] },
    'Rate Lock':          { nav: 'Pipeline → Open Loan → Rate Lock tab', fields: ['Rate','Lock Period','Lock Status','Lock Expiration','Float Down'], checklist: ['Confirmed field exists on screen','Verified rate lock period','Checked float down option'] },
    'Underwriting':       { nav: 'Pipeline → Open Loan → Underwriting tab', fields: ['UW Decision','Conditions','Suspense Reason','Submission Date'], checklist: ['Confirmed field exists on screen','Verified UW decision mapping','Checked condition linkage'] },
    'Closing':            { nav: 'Pipeline → Open Loan → Closing tab', fields: ['Closing Date','Settlement Agent','Closing Location','Funding Date'], checklist: ['Confirmed field exists on screen','Verified closing date field','Checked AWC list transmission'] },
    'Funding':            { nav: 'Pipeline → Open Loan → Funding tab', fields: ['Funding Date','Wire Amount','Wire Status','Disbursement Date'], checklist: ['Confirmed field exists on screen','Verified wire amount','Checked funding conditions cleared'] },
    'Admin Tools':        { nav: 'Empower → Admin → Business Rules Engine', fields: ['Rule Name','Trigger Event','Condition Expression','Action','Active Flag'], checklist: ['Confirmed field exists on screen','Validated expression/rule','Tested in sandbox','Checked production impact'] }
  };

  const ACADEMY_SCREENS = new Set(['Exchange Title','Exchange Appraisal','Conditions','Admin Tools']);

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function detect(titleText, descText) {
    const haystack = ((titleText||'') + ' ' + (descText||'').replace(/<[^>]+>/g,' ')).toLowerCase();
    const matched = [];
    for (const [screen, keywords] of Object.entries(SCREEN_KEYWORD_MAP)) {
      if (keywords.some(kw => haystack.includes(kw)) && !matched.includes(screen)) {
        matched.push(screen);
      }
    }
    return matched;
  }

  function ckKey(itemId, screen) {
    return `bsa-screen-ck-${itemId}-${screen.replace(/\s+/g,'-')}`;
  }

  function loadCk(itemId, screen) {
    try { return JSON.parse(localStorage.getItem(ckKey(itemId, screen)) || 'null'); } catch { return null; }
  }

  function saveCk(itemId, screen, state) {
    try { localStorage.setItem(ckKey(itemId, screen), JSON.stringify(state)); } catch {}
  }

  function renderExpandedPanel(screenName, itemId, container) {
    const existing = container.querySelector('.emps-panel');
    if (existing && existing.dataset.screen === screenName) { existing.remove(); return; }
    if (existing) existing.remove();

    const detail = SCREEN_DETAILS[screenName];
    if (!detail) return;

    const savedState = loadCk(itemId, screenName) || {};
    const checkHtml = detail.checklist.map((item, i) =>
      `<label class="emps-check-item"><input type="checkbox" class="emps-chk" data-idx="${i}" ${savedState[i]?'checked':''}/><span>${esc(item)}</span></label>`
    ).join('');
    const fieldsHtml = detail.fields.map(f => `<span class="emps-field-pill">${esc(f)}</span>`).join('');
    const hasAcademy = ACADEMY_SCREENS.has(screenName);

    const panel = document.createElement('div');
    panel.className = 'emps-panel';
    panel.dataset.screen = screenName;
    panel.innerHTML = `
      <div class="emps-panel-hd">
        <span>🖥 ${esc(screenName)}</span>
        <button class="emps-close-btn">✕</button>
      </div>
      <div class="emps-nav-path">${esc(detail.nav)}</div>
      <div class="emps-sub-label">Common Fields</div>
      <div class="emps-fields-row">${fieldsHtml}</div>
      <div class="emps-sub-label">BSA Checklist</div>
      <div class="emps-checklist">${checkHtml}</div>
      ${hasAcademy ? `<button class="emps-academy-btn">View in Empower Academy →</button>` : ''}
    `;
    container.appendChild(panel);

    panel.querySelectorAll('.emps-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const state = {};
        panel.querySelectorAll('.emps-chk').forEach(c => { state[c.dataset.idx] = c.checked; });
        saveCk(itemId, screenName, state);
      });
    });
    panel.querySelector('.emps-close-btn').addEventListener('click', () => panel.remove());
    panel.querySelector('.emps-academy-btn')?.addEventListener('click', () => window.navigateTo?.('academy'));
  }

  function renderPills(wrap, screens, itemId) {
    wrap.innerHTML = `
      <div class="emps-section-label">🖥 Empower Screens</div>
      <div class="emps-pills-row">${screens.map(s => `<button class="emps-pill" data-screen="${esc(s)}">🖥 ${esc(s)}</button>`).join('')}</div>
    `;
    wrap.querySelectorAll('.emps-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        wrap.querySelectorAll('.emps-pill').forEach(p =>
          p.classList.toggle('emps-pill-active', p === pill && !pill.classList.contains('emps-pill-active'))
        );
        renderExpandedPanel(pill.dataset.screen, itemId, wrap);
      });
    });
  }

  function renderSection(container, item) {
    if (!container) return;
    const f = item.fields || {};
    const title = f['System.Title'] || '';
    const desc = f['System.Description'] || '';
    const id = item.id;
    const screens = detect(title, desc);

    const wrap = document.createElement('div');
    wrap.className = 'emps-section';

    if (!screens.length) {
      wrap.innerHTML = `
        <div class="emps-section-label">🖥 Empower Screens</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <button class="emps-detect-btn" id="emps-detect-${id}">✦ Detect Screen</button>
          <span id="emps-detect-result-${id}" style="font-size:11px;color:var(--text-muted);"></span>
        </div>
      `;
      container.appendChild(wrap);
      wrap.querySelector(`#emps-detect-${id}`)?.addEventListener('click', async () => {
        const apiKey = window.appSettings?.anthropicKey;
        const resultEl = wrap.querySelector(`#emps-detect-result-${id}`);
        if (!apiKey) { if (resultEl) resultEl.textContent = 'Add Anthropic API key in Settings'; return; }
        if (resultEl) resultEl.innerHTML = '<span class="emps-loading">Detecting…</span>';
        const plain = (title + ' ' + desc.replace(/<[^>]+>/g,' ')).slice(0,500);
        const prompt = `You are a BSA. Given this Empower LOS task, identify which screens are relevant. Return ONLY a JSON array of screen names from this list: ${Object.keys(SCREEN_KEYWORD_MAP).join(', ')}.\n\nTask: ${plain}`;
        try {
          const res = await window.api.ai.complete({ apiKey, messages:[{ role:'user', content: prompt }] });
          const text = (res.content?.[0]?.text||'').replace(/```(?:json)?\s*/g,'').replace(/\s*```/g,'').trim();
          const detected = JSON.parse(text);
          if (resultEl) resultEl.innerHTML = '';
          wrap.innerHTML = '';
          renderPills(wrap, Array.isArray(detected) ? detected : [], id);
        } catch { if (resultEl) resultEl.textContent = 'Detection failed. Try again.'; }
      });
      return;
    }

    renderPills(wrap, screens, id);
    container.appendChild(wrap);
  }

  window.EmpowerScreens = { detect, renderSection, SCREEN_DETAILS };

})();
