/* ============================================================
   BSA Ops Hub — Loan Context Module (API-driven, read-only)
   ============================================================ */

(function () {
  'use strict';

  let currentLoanContext = null;

  // ── Mock placeholder API ──────────────────────────────────────
  async function fetchLoanContext(loanNumber) {
    // TODO: replace with real API call → /api/loan/${loanNumber}
    await new Promise(r => setTimeout(r, 600)); // simulate latency
    if (!loanNumber) return { error: 'No loan number provided' };
    return {
      loanNumber,
      borrowerName:  'Jane Doe',
      loanType:      'Conventional',
      status:        'In Underwriting',
      module:        'Loan Pipeline',
      screen:        'Loan Summary',
      keyFields: [
        'Loan Amount: $450,000',
        'Rate: 6.875%',
        'LTV: 80%',
        'Property: 123 Main St, Irvine CA 92614',
      ]
    };
  }

  // ── Render ────────────────────────────────────────────────────
  function render(container) {
    container.innerHTML = `
      <div style="max-width:560px;margin:32px auto;padding:0 16px;">

        <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;color:var(--text-muted);text-transform:uppercase;margin-bottom:16px;">
          Loan Context
        </div>

        <div style="display:flex;gap:8px;margin-bottom:24px;">
          <input
            id="lc-loan-number"
            type="text"
            placeholder="Enter loan number…"
            style="flex:1;background:var(--bg-tertiary);border:1px solid var(--border-default);border-radius:6px;color:var(--text-primary);font-size:13px;padding:8px 12px;outline:none;font-family:inherit;transition:border-color 0.15s;"
            onFocus="this.style.borderColor='var(--accent)'"
            onBlur="this.style.borderColor='var(--border-default)'"
          />
          <button id="lc-fetch-btn" class="btn btn-primary" style="white-space:nowrap;">Fetch</button>
        </div>

        <div id="lc-result"></div>

      </div>`;

    document.getElementById('lc-fetch-btn').addEventListener('click', () => fetchAndRender());
    document.getElementById('lc-loan-number').addEventListener('keydown', e => {
      if (e.key === 'Enter') fetchAndRender();
    });
  }

  async function fetchAndRender() {
    const loanNumber = document.getElementById('lc-loan-number')?.value.trim();
    const result     = document.getElementById('lc-result');
    if (!result) return;

    if (!loanNumber) {
      result.innerHTML = `<div style="font-size:12px;color:var(--text-muted);">Enter a loan number first.</div>`;
      return;
    }

    result.innerHTML = `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);"><div class="mail-spinner"></div>Fetching…</div>`;

    const data = await fetchLoanContext(loanNumber);

    if (data.error) {
      result.innerHTML = `<div style="font-size:12px;color:#f85149;">${data.error}</div>`;
      return;
    }

    currentLoanContext = data;
    result.innerHTML   = renderContextCard(data);
  }

  function row(label, value) {
    if (!value) return '';
    return `
      <div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--border-default);">
        <span style="width:130px;flex-shrink:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">${label}</span>
        <span style="font-size:13px;color:var(--text-primary);">${value}</span>
      </div>`;
  }

  function renderContextCard(d) {
    const fields = (d.keyFields || []).map(f => `<div style="font-size:12px;color:var(--text-secondary);padding:2px 0;">• ${f}</div>`).join('');
    return `
      <div style="background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:8px;padding:16px;">
        ${row('Loan Number',   d.loanNumber)}
        ${row('Borrower',      d.borrowerName)}
        ${row('Loan Type',     d.loanType)}
        ${row('Status',        d.status)}
        ${row('Module',        d.module)}
        ${row('Screen',        d.screen)}
        <div style="display:flex;gap:12px;padding:7px 0;">
          <span style="width:130px;flex-shrink:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);">Key Fields</span>
          <div>${fields || '<span style="font-size:12px;color:var(--text-muted);">None</span>'}</div>
        </div>
      </div>`;
  }

  window.Modules['loan-context'] = { render };
  window.LoanContext = { getCurrent: () => currentLoanContext };

})();
