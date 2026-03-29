/* ============================================================
   BSA Ops Hub — Empower Step-by-Step Guide System
   Smart detection · Interactive checklist · Persistent progress
   ============================================================ */

window.EmpowerGuide = (function () {
  'use strict';

  const STORAGE_PREFIX  = 'bsa-guide-v1-';
  const STEPS_CACHE_PREFIX = 'bsa-steps-cache-';

  // ----------------------------------------------------------
  // Static guide templates for known Empower workflows
  // ----------------------------------------------------------

  const TEMPLATES = {
    'exchange-title': {
      type: 'Exchange Title',
      steps: [
        {
          id: 'et-1',
          label: 'Verify loan is in the correct stage',
          detail: 'Open the loan in Empower and check the milestone tracker at the top of the loan file. The loan must be in Processing or Submission stage before Exchange Title can be triggered. If the milestone is incorrect, escalate to the PM before proceeding.'
        },
        {
          id: 'et-2',
          label: 'Check Exchange Title configuration in Empower Admin',
          detail: 'Navigate to Empower Admin › Business Rules › Exchange Title Settings. Confirm the title company vendor is configured and the API credentials show a green (active) status. Ensure the correct title product type is mapped to this loan type and state.'
        },
        {
          id: 'et-3',
          label: 'Send Event 100 — Title Order',
          detail: 'In the loan file, open the Services tab and click "Order Title," or trigger Event 100 from the Events panel. A success response (HTTP 200) should be logged immediately. Verify the order appears in the Audit Log under Admin › Tools.'
        },
        {
          id: 'et-4',
          label: 'Confirm Event 130 received — Acknowledgment',
          detail: 'Log into the title vendor portal and confirm the order acknowledgment (Event 130 — Title Ordered) has been received. If Event 130 is missing after 15 minutes, check Empower Admin › Integration Errors. The most common cause is an incorrect loan number format being sent.'
        },
        {
          id: 'et-5',
          label: 'Verify Event 150 — Title Report Ready',
          detail: 'Wait for Event 150 (Preliminary Title Report) to come back from the vendor. It will appear as a new document in the Document Log of the loan file. If it has not arrived within 24 hours, contact the title company directly and reference the order number from Event 100.'
        },
        {
          id: 'et-6',
          label: 'Check Event 385 — Document Package',
          detail: 'Event 385 triggers the closing document package. Open the Documents tab and verify the required title documents are present: title commitment letter, lien search results, and title exception list. Open each document to confirm it is fully and correctly populated.'
        },
        {
          id: 'et-7',
          label: 'Confirm Event 180 — Title Clearance Complete',
          detail: 'Event 180 signals final title clearance and delivery of the title policy. Verify it appears in the Events log, and confirm the final title policy PDF is attached to the loan file. Update the ADO work item state to reflect title clearance.'
        }
      ]
    },

    'exchange-appraisal': {
      type: 'Exchange Appraisal',
      steps: [
        {
          id: 'ea-1',
          label: 'Confirm loan is ready for appraisal order',
          detail: 'Verify the loan is past the initial application stage and the property address is confirmed and correctly entered. Check that the loan purpose (purchase vs. refi) and property type are set correctly — these drive the appraisal form type (1004, 1073, etc.).'
        },
        {
          id: 'ea-2',
          label: 'Verify AMC panel assignment for SoCal Direct',
          detail: 'Navigate to Empower Admin › Vendors › Appraisal. Confirm the SoCal Direct AMC panel is selected for this loan. If the loan county is outside the panel coverage area, a different AMC must be assigned before placing the order.'
        },
        {
          id: 'ea-3',
          label: 'Send Event 200 — Appraisal Ordered',
          detail: 'Trigger Event 200 from the Services tab or Events panel. Confirm the order confirmation number is returned and logged in the Audit Log. This event number is required when following up with the AMC if the appraisal is delayed.'
        },
        {
          id: 'ea-4',
          label: 'Verify UCDP submission settings',
          detail: 'Open Admin › Settings › UCDP and confirm the GSE delivery settings are active for this loan type. Fannie Mae and Freddie Mac submission credentials must both be valid. A failed UCDP submission will block the loan from closing.'
        },
        {
          id: 'ea-5',
          label: 'Monitor appraisal return — Event 210',
          detail: 'Event 210 is sent by the AMC when the appraisal report is complete. It will appear as a PDF in the Document Log. If it has not arrived by the expected date, log into the AMC portal using the order ID from Event 200 to check status.'
        },
        {
          id: 'ea-6',
          label: 'Review appraisal report and import to Empower',
          detail: 'Open the appraisal PDF and review: subject property value, comparable sales selection, condition rating, and any flagged items. Import the final value into the Empower appraisal field and update the LTV calculation. Flag any value concerns to the underwriter.'
        }
      ]
    },

    'heloc': {
      type: 'HELOC Setup',
      steps: [
        {
          id: 'hl-1',
          label: 'Verify HELOC product configuration',
          detail: 'In Empower Admin › Product Configuration, confirm the HELOC product is set up with the correct rate index (Prime or SOFR), draw period length, and repayment period. Verify the credit line limit and minimum draw amount match the loan program guidelines.'
        },
        {
          id: 'hl-2',
          label: 'Check condition configuration is complete',
          detail: 'Open the Conditions tab in the loan file. Confirm all conditions are present and correctly categorized as PTD, PTC, or AWC. If any conditions are missing, add them from the condition library. Verify each condition is assigned to the correct team member.'
        },
        {
          id: 'hl-3',
          label: 'Set and assign PTD conditions',
          detail: 'Filter conditions by "Prior to Documents (PTD)." Required HELOC PTD conditions typically include: flood certification, hazard insurance binder, preliminary title report, and subordination agreement if applicable. Assign each to the appropriate party and set expected due dates.'
        },
        {
          id: 'hl-4',
          label: 'Verify AWC conditions for closing',
          detail: 'Filter conditions by "At and With Closing (AWC)." Common HELOC AWC items: Right of Rescission acknowledgment (3-day waiting period), final hazard insurance dec page, and HOA documents if applicable. Confirm the closing agent has the AWC checklist.'
        },
        {
          id: 'hl-5',
          label: 'Test condition clearance flow in UAT',
          detail: 'In the UAT environment, manually clear each condition type and verify the loan can advance to the next milestone. Confirm clearing a PTD condition correctly triggers the associated business rule. Check that the condition history log captures the clearing event with timestamp and user.'
        }
      ]
    },

    'conditions': {
      type: 'Condition Management',
      steps: [
        {
          id: 'co-1',
          label: 'Audit the current condition list',
          detail: 'Open the Conditions tab in the loan file. Review all existing conditions for completeness and correct categorization (PTD / PTC / AWC). Look for duplicates, missing conditions for this loan type, and any conditions that have been incorrectly cleared.'
        },
        {
          id: 'co-2',
          label: 'Add missing conditions from the library',
          detail: 'Click "Add Condition" and search the condition library for any required conditions that are absent. Use the loan type and program filters to narrow results. Add standard condition sets if available — this applies a pre-built group in one step.'
        },
        {
          id: 'co-3',
          label: 'Assign conditions to responsible parties',
          detail: 'For each open condition, set the responsible party (borrower, title, escrow, underwriter). Confirm the due date is set realistically based on the loan timeline. Conditions without an assignee or due date are commonly overlooked at closing.'
        },
        {
          id: 'co-4',
          label: 'Verify automated condition triggers',
          detail: 'In Empower Admin › Business Rules, check if any conditions have automated triggers on milestone events (e.g., condition auto-added when loan reaches Processing). Confirm the triggers are correctly configured and will not create duplicate conditions.'
        },
        {
          id: 'co-5',
          label: 'Confirm clearing rules and role permissions',
          detail: 'Check Admin › User Roles to confirm the correct roles are authorized to clear each condition type. Some conditions may require a senior underwriter or compliance officer to clear. Incorrect role mapping is a frequent cause of conditions being stuck open.'
        }
      ]
    },

    'validation': {
      type: 'Validation / Expression Fix',
      steps: [
        {
          id: 'vl-1',
          label: 'Identify the failing field and error message',
          detail: 'In the loan file, navigate to the Validation Report tab (or Admin › Reports › Validation). Note the exact field name, field ID (e.g., Fields["2"]), and the full error message verbatim. Take a screenshot for the ADO work item. This is the single source of truth for the next steps.'
        },
        {
          id: 'vl-2',
          label: 'Locate field mapping in Empower Admin',
          detail: 'Go to Empower Admin › Field Mapping and search for the failing field by ID or name. Verify the field type (text, currency, date) matches the data being written to it. If the field is mapped to a custom input, confirm the input is not returning null or an unexpected format.'
        },
        {
          id: 'vl-3',
          label: 'Inspect the Business Rule or Expression',
          detail: 'Open the Business Rules Engine (BRE) and search for rules referencing this field. Open the Expression Editor for the failing rule and check syntax carefully. Common issues: wrong field ID format (must be Fields["XXXX"] with quotes), null reference on optional fields, and date format mismatches.'
        },
        {
          id: 'vl-4',
          label: 'Test the fix with the Expression Tester',
          detail: 'Use the built-in Expression Tester in Empower Admin to simulate the expression with sample loan data. Test edge cases: empty/null value, maximum allowed value, special characters, and cross-state loan scenarios. The Expression Tester output will confirm whether your fix resolves the validation failure.'
        },
        {
          id: 'vl-5',
          label: 'Deploy fix to UAT and run regression test',
          detail: 'Apply the fix in the UAT environment — never directly in production. Create a test loan with the exact same loan type and trigger the validation. Confirm the error is resolved. Also run the full validation report on the test loan to ensure the fix has not broken adjacent rules.'
        },
        {
          id: 'vl-6',
          label: 'Document resolution in ADO and update state',
          detail: 'Return to ADO and update the work item with: root cause of the failure, field or expression that was corrected, before/after screenshots, and UAT confirmation. Move the task state to "In Testing" and tag the QA team member for final verification.'
        }
      ]
    },

    'docmagic': {
      type: 'DocMagic Integration',
      steps: [
        {
          id: 'dm-1',
          label: 'Verify DocMagic API credentials in Empower',
          detail: 'Navigate to Empower Admin › Vendors › DocMagic. Confirm the API username, password, and client ID are correct and the connection status is green. If credentials are expired, request updated credentials from DocMagic support — expired credentials are the #1 cause of document generation failures.'
        },
        {
          id: 'dm-2',
          label: 'Check loan data completeness before ordering',
          detail: 'In the loan file, run the Pre-Close Data Integrity Check (Admin › Tools). All required fields must be populated: loan amount, rate, term, borrower name/SSN, property address, loan purpose, and lien position. Any red fields will cause DocMagic to reject the order.'
        },
        {
          id: 'dm-3',
          label: 'Verify Empower → DocMagic field mappings',
          detail: 'Open Admin › Vendors › DocMagic › Field Mapping. Review the mapping grid for critical fields: loan number format, borrower SSN masking, property address format, loan type code, and closing date. Export the mapping XML and validate it against the DocMagic MISMO 3.4 schema if a mapping error is suspected.'
        },
        {
          id: 'dm-4',
          label: 'Configure SmartClose / CDISC for e-close workflow',
          detail: 'If this loan uses eClose, navigate to Admin › DocMagic › SmartClose Settings. Confirm the e-signature provider is correctly linked (DocuSign or similar). Set the correct eClose type (full eClose, hybrid, or paper). Verify the eNote settings if the investor requires an eNote.'
        },
        {
          id: 'dm-5',
          label: 'Generate and review the document package',
          detail: 'In the loan file, click Services › Generate Documents and select the correct package type (Initial Disclosures, Loan Estimate, Closing Package, or CD). Confirm the job ID is returned. Review every generated document: verify borrower names, loan amount, APR, fees, and all dates are correct.'
        },
        {
          id: 'dm-6',
          label: 'Save package to loan file and transmit',
          detail: 'Once documents are verified, save the approved package to the Document Log in Empower with the correct document type codes. Send to the closing agent via the Empower secure portal. Confirm the agent received the package and note the confirmation in the ADO work item.'
        }
      ]
    },

    'docutech': {
      type: 'DocuTech / SureDocs',
      steps: [
        {
          id: 'dt-1',
          label: 'Verify DocuTech API token in Empower',
          detail: 'Navigate to Empower Admin › Services › DocuTech. Confirm the API token is current (tokens typically expire annually). Check the connection test — a green status is required before ordering. If expired, generate a new token in the DocuTech partner portal.'
        },
        {
          id: 'dt-2',
          label: 'Confirm doc package type matches loan purpose',
          detail: 'In the loan file, verify the loan purpose field is correctly set (purchase, rate/term refi, cash-out refi, HELOC). The doc package type in SureDocs must match exactly. A mismatch will generate incorrect documents — for example, a purchase package for a refinance loan will be missing required refinance disclosures.'
        },
        {
          id: 'dt-3',
          label: 'Check required fields are fully populated',
          detail: 'Run the SureDocs required field check from Admin › Tools. Pay particular attention to: HOA monthly payment (if applicable), subordinate financing amount, prepayment penalty details, and all fee line items on the CD. Missing fee data is the most common cause of CD generation errors.'
        },
        {
          id: 'dt-4',
          label: 'Review Closing Disclosure generation settings',
          detail: 'In Admin › SureDocs › CD Settings, confirm the lender information, settlement agent details, and disbursement date are configured. Check the tolerance calculation settings (0%, 10%, unlimited) for each fee category. Incorrect tolerance settings can cause a TRID violation.'
        },
        {
          id: 'dt-5',
          label: 'Generate package and review output',
          detail: 'Order the document package from the Services tab. Expected generation time is 30 seconds to 3 minutes. Review the CD carefully: loan amount, rate, APR, cash to close, and all itemized fees. Compare the CD against the final Loan Estimate to identify and explain any fee changes.'
        },
        {
          id: 'dt-6',
          label: 'Deliver to settlement agent and confirm receipt',
          detail: 'Transmit the final closing package through the Empower secure document delivery portal. Record the transmission confirmation number in the loan file notes. Confirm with the settlement agent that they received the complete package. Document delivery timestamp in the ADO work item.'
        }
      ]
    }
  };

  // ----------------------------------------------------------
  // Keyword → template mapping (in priority order)
  // ----------------------------------------------------------

  const DETECTORS = [
    { keys: ['exchange title'],                    template: 'exchange-title' },
    { keys: ['exchange appraisal', 'appraisal'],   template: 'exchange-appraisal' },
    { keys: ['docmagic'],                          template: 'docmagic' },
    { keys: ['docutech', 'suredocs'],              template: 'docutech' },
    { keys: ['heloc'],                             template: 'heloc' },
    { keys: ['validation', 'expression'],          template: 'validation' },
    { keys: ['condition', 'ptd', 'awc'],           template: 'conditions' }
  ];

  // Generic Empower keywords that trigger AI generation if no template matches
  const EMPOWER_SIGNALS = ['empower', 'encompass', 'exchange', 'ellie mae', 'loan origination', 'loan officer', 'los ', 'xml', 'event 1', 'event 3', 'event 1'];

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectTemplate(title, description) {
    const haystack = ((title || '') + ' ' + stripHtml(description || '')).toLowerCase();
    for (const det of DETECTORS) {
      if (det.keys.some(k => haystack.includes(k))) {
        return TEMPLATES[det.template] || null;
      }
    }
    return null;
  }

  function isEmpowerRelated(title, description) {
    const haystack = ((title || '') + ' ' + stripHtml(description || '')).toLowerCase();
    return EMPOWER_SIGNALS.some(k => haystack.includes(k)) ||
           DETECTORS.some(d => d.keys.some(k => haystack.includes(k)));
  }

  // ----------------------------------------------------------
  // Progress persistence
  // ----------------------------------------------------------

  function loadProgress(taskId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + taskId);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveProgress(taskId, stepId, checked) {
    try {
      const prog = loadProgress(taskId);
      prog[stepId] = checked;
      localStorage.setItem(STORAGE_PREFIX + taskId, JSON.stringify(prog));
    } catch (e) { /* storage unavailable */ }
  }

  // ----------------------------------------------------------
  // Soft click sound via Web Audio API
  // ----------------------------------------------------------

  function playCheckSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.10, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.20);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.20);
    } catch (e) { /* audio unavailable */ }
  }

  // ----------------------------------------------------------
  // Build and mount the interactive checklist panel
  // ----------------------------------------------------------

  function mountGuide(container, taskId, guideName, steps) {
    const progress  = loadProgress(taskId);
    const doneCount = steps.filter(s => progress[s.id]).length;
    const total     = steps.length;
    const pct       = total ? Math.round((doneCount / total) * 100) : 0;
    const allDone   = doneCount === total;

    const stepsHtml = steps.map((step, i) => {
      const checked = !!progress[step.id];
      return `
        <div class="gs-step ${checked ? 'gs-step-done' : ''}" data-sid="${step.id}">
          <div class="gs-step-header">
            <button class="gs-check ${checked ? 'gs-checked' : ''}" data-sid="${step.id}" title="Mark complete">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <span class="gs-step-num">${i + 1}</span>
            <span class="gs-step-label">${escapeHtml(step.label)}</span>
            <button class="gs-expand" data-sid="${step.id}" title="Show details">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" stroke-width="1.8">
                <polyline points="2,3 5,7 8,3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="gs-detail" id="gsd-${taskId}-${step.id}">
            <div class="gs-detail-body">${escapeHtml(step.detail)}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="empower-guide-panel" id="egp-${taskId}">
        <div class="egp-header">
          <div class="egp-title-row">
            <span class="egp-title">⚙️ Empower Setup Guide</span>
            <span class="egp-type-badge">${escapeHtml(guideName)}</span>
          </div>
          <div class="egp-progress-label" id="egp-label-${taskId}">${doneCount} of ${total} steps complete</div>
        </div>
        <div class="egp-progress-track">
          <div class="egp-progress-fill" id="egp-fill-${taskId}" style="width:${pct}%"></div>
        </div>
        <div class="gs-steps" id="gs-steps-${taskId}">${stepsHtml}</div>
        <div class="egp-complete-banner" id="egp-done-${taskId}" style="display:${allDone ? 'flex' : 'none'};">
          <div>
            <div class="egp-done-title">✅ Task Ready for UAT</div>
            <div class="egp-done-sub">All ${total} steps completed — great work!</div>
          </div>
          <button class="btn btn-primary" id="egp-copy-ac-${taskId}">📋 Copy AC</button>
        </div>
      </div>
    `;

    const panel = container.querySelector(`#egp-${taskId}`);

    // ---- Checkbox click handler ----
    panel.querySelectorAll('.gs-check').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid     = btn.dataset.sid;
        const prog    = loadProgress(taskId);
        const nowDone = !prog[sid];
        saveProgress(taskId, sid, nowDone);

        btn.classList.toggle('gs-checked', nowDone);
        btn.closest('.gs-step').classList.toggle('gs-step-done', nowDone);

        if (nowDone) playCheckSound();

        // Update progress bar + label
        const newProg  = loadProgress(taskId);
        const newDone  = steps.filter(s => newProg[s.id]).length;
        const newPct   = Math.round((newDone / total) * 100);
        const fillEl   = document.getElementById(`egp-fill-${taskId}`);
        const labelEl  = document.getElementById(`egp-label-${taskId}`);
        if (fillEl)  fillEl.style.width = `${newPct}%`;
        if (labelEl) labelEl.textContent = `${newDone} of ${total} steps complete`;

        // Completion celebration
        if (newDone === total) {
          const doneBanner = document.getElementById(`egp-done-${taskId}`);
          if (doneBanner) doneBanner.style.display = 'flex';
          try { window.Celebration && window.Celebration.confetti({ count: 80 }); } catch (ex) {}
          try { window.XP && window.XP.award('TASK_COMPLETE', `Empower guide completed: task #${taskId}`); } catch (ex) {}
        }
      });
    });

    // ---- Expand/collapse — button and header click ----
    function toggleDetail(sid) {
      const detailEl  = document.getElementById(`gsd-${taskId}-${sid}`);
      const expandBtn = panel.querySelector(`.gs-expand[data-sid="${sid}"]`);
      if (!detailEl) return;
      const opening = !detailEl.classList.contains('open');
      detailEl.classList.toggle('open', opening);
      if (expandBtn) expandBtn.classList.toggle('gs-expanded', opening);
    }

    panel.querySelectorAll('.gs-expand').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleDetail(btn.dataset.sid);
      });
    });

    panel.querySelectorAll('.gs-step-header').forEach(header => {
      header.addEventListener('click', e => {
        if (e.target.closest('.gs-check') || e.target.closest('.gs-expand')) return;
        toggleDetail(header.closest('.gs-step').dataset.sid);
      });
    });

    // ---- Copy AC ----
    const copyAcBtn = document.getElementById(`egp-copy-ac-${taskId}`);
    if (copyAcBtn) {
      copyAcBtn.addEventListener('click', () => {
        const acField = steps.map(s => s.ac || s.acceptanceCriteria || '').filter(Boolean).join('\n\n').trim();
        const text = acField || `Task #${taskId} — AC not defined.`;
        navigator.clipboard.writeText(text).then(() => window.showToast?.('AC copied to clipboard', 'success'));
      });
    }
  }

  // ----------------------------------------------------------
  // AI-generated guide (indigo accent, "Suggested Approach")
  // Same interactive UI as mountGuide but distinct styling.
  // ----------------------------------------------------------

  function mountAIGuide(container, taskId, steps) {
    const progress  = loadProgress(taskId);
    const doneCount = steps.filter(s => progress[s.id]).length;
    const total     = steps.length;
    const pct       = total ? Math.round((doneCount / total) * 100) : 0;
    const allDone   = doneCount === total;

    const stepsHtml = steps.map((step, i) => {
      const checked = !!progress[step.id];
      return `
        <div class="gs-step ${checked ? 'gs-step-done' : ''}" data-sid="${step.id}">
          <div class="gs-step-header">
            <button class="gs-check ${checked ? 'gs-checked' : ''}" data-sid="${step.id}" title="Mark complete">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <span class="gs-step-num">${i + 1}</span>
            <span class="gs-step-label">${escapeHtml(step.label || step.title || '')}</span>
            <button class="gs-expand" data-sid="${step.id}" title="Show details">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" stroke-width="1.8">
                <polyline points="2,3 5,7 8,3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="gs-detail" id="gsd-${taskId}-${step.id}">
            <div class="gs-detail-body">${escapeHtml(step.detail || step.description || '')}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="empower-guide-panel egp-ai-variant" id="egp-${taskId}">
        <div class="egp-header">
          <div class="egp-title-row">
            <span class="egp-title">✦ Suggested Approach</span>
          </div>
          <div class="egp-progress-label" id="egp-label-${taskId}">${doneCount} of ${total} steps complete</div>
        </div>
        <div class="egp-progress-track">
          <div class="egp-progress-fill egp-fill-ai" id="egp-fill-${taskId}" style="width:${pct}%"></div>
        </div>
        <div class="gs-steps" id="gs-steps-${taskId}">${stepsHtml}</div>
        <div class="egp-complete-banner" id="egp-done-${taskId}" style="display:${allDone ? 'flex' : 'none'};">
          <div>
            <div class="egp-done-title">✅ Task Complete</div>
            <div class="egp-done-sub">All ${total} steps done — great work!</div>
          </div>
        </div>
      </div>
    `;

    const panel = container.querySelector(`#egp-${taskId}`);

    panel.querySelectorAll('.gs-check').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid     = btn.dataset.sid;
        const prog    = loadProgress(taskId);
        const nowDone = !prog[sid];
        saveProgress(taskId, sid, nowDone);

        btn.classList.toggle('gs-checked', nowDone);
        btn.closest('.gs-step').classList.toggle('gs-step-done', nowDone);

        if (nowDone) playCheckSound();

        const newProg  = loadProgress(taskId);
        const newDone  = steps.filter(s => newProg[s.id]).length;
        const newPct   = Math.round((newDone / total) * 100);
        const fillEl   = document.getElementById(`egp-fill-${taskId}`);
        const labelEl  = document.getElementById(`egp-label-${taskId}`);
        if (fillEl)  fillEl.style.width = `${newPct}%`;
        if (labelEl) labelEl.textContent = `${newDone} of ${total} steps complete`;

        if (newDone === total) {
          const doneBanner = document.getElementById(`egp-done-${taskId}`);
          if (doneBanner) doneBanner.style.display = 'flex';
          try { window.Celebration && window.Celebration.confetti({ count: 80 }); } catch (ex) {}
          try { window.XP && window.XP.award('TASK_COMPLETE', `Task guide completed: #${taskId}`); } catch (ex) {}
        }
      });
    });

    function toggleDetail(sid) {
      const detailEl  = document.getElementById(`gsd-${taskId}-${sid}`);
      const expandBtn = panel.querySelector(`.gs-expand[data-sid="${sid}"]`);
      if (!detailEl) return;
      const opening = !detailEl.classList.contains('open');
      detailEl.classList.toggle('open', opening);
      if (expandBtn) expandBtn.classList.toggle('gs-expanded', opening);
    }

    panel.querySelectorAll('.gs-expand').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleDetail(btn.dataset.sid); });
    });
    panel.querySelectorAll('.gs-step-header').forEach(header => {
      header.addEventListener('click', e => {
        if (e.target.closest('.gs-check') || e.target.closest('.gs-expand')) return;
        toggleDetail(header.closest('.gs-step').dataset.sid);
      });
    });
  }

  // ----------------------------------------------------------
  // Public: renderForTask(item, container)
  // Called from dashboard.selectTask after HTML is set.
  // ----------------------------------------------------------

  const FALLBACK_STEPS = [
    { id: 'fb-1', label: 'Review full task description and clarify requirements',
      detail: 'Read the complete task description carefully. If any requirements are unclear, reach out to the requester for clarification before starting work.' },
    { id: 'fb-2', label: 'Identify impacted screens, fields, or systems',
      detail: 'Map out which parts of the system are affected. List any dependent fields, screens, integrations, or downstream systems that may be impacted.' },
    { id: 'fb-3', label: 'Write acceptance criteria and get sign-off',
      detail: 'Draft clear, testable acceptance criteria. Share with the PM and requester for sign-off before implementation begins.' },
    { id: 'fb-4', label: 'Complete the work, write UAT test cases, hand off to tester',
      detail: 'Implement the changes and document UAT test cases covering all acceptance criteria. Hand off to the QA tester with a summary of what was changed.' }
  ];

  async function renderForTask(item, container) {
    if (!container) return;

    const title       = item.fields['System.Title'] || '';
    const description = item.fields['System.Description'] || '';
    const type        = item.fields['System.WorkItemType'] || '';
    const state       = item.fields['System.State'] || '';
    const taskId      = item.id;

    // PATH A — Empower task: use static template (instant, cyan styling)
    const staticTemplate = detectTemplate(title, description);
    if (staticTemplate) {
      mountGuide(container, taskId, staticTemplate.type, staticTemplate.steps);
      return;
    }

    // PATH B — Any task: AI-generated steps (indigo styling)
    // Check cache first
    const cacheKey = STEPS_CACHE_PREFIX + taskId;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length > 0) {
          mountAIGuide(container, taskId, cached);
          return;
        }
      }
    } catch (e) { /* ignore cache errors */ }

    // Show loading spinner
    container.innerHTML = `
      <div class="empower-guide-panel egp-ai-variant" style="padding:16px;">
        <div style="display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:13px;">
          <span class="spinner"></span>
          <span>✦ Generating steps…</span>
        </div>
      </div>
    `;

    try {
      const settings = window.appSettings;
      if (!settings || !settings.anthropicKey) throw new Error('No API key configured');

      const plainDesc = stripHtml(description).slice(0, 300);
      const response  = await window.api.ai.complete({
        apiKey: settings.anthropicKey,
        model:  'claude-sonnet-4-6',
        system: 'You are a BSA expert at a mortgage company.',
        messages: [{
          role:    'user',
          content: `You are a BSA expert at a mortgage company. Given this work item, generate a practical step-by-step completion guide.\nTask Title: ${title}\nTask Description: ${plainDesc}\nTask Type: ${type}\nState: ${state}\nReturn ONLY a JSON array of 4-6 steps. Each step:\n{"id":"step-1","label":"short step name","detail":"1-2 sentences: what to do, where to go, what success looks like"}\nMake steps specific to this task. No generic steps like 'review the task'.`
        }]
      });

      let text = (response && response.content && response.content[0] && response.content[0].text) || '';
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const steps = JSON.parse(text);
      if (!Array.isArray(steps) || steps.length === 0) throw new Error('Invalid response');

      try { localStorage.setItem(cacheKey, JSON.stringify(steps)); } catch (e) { /* ignore */ }
      mountAIGuide(container, taskId, steps);
    } catch (err) {
      mountAIGuide(container, taskId, FALLBACK_STEPS);
    }
  }

  return { renderForTask };

})();
