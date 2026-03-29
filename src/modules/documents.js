/* ============================================================
   BSA Ops Hub — Documents
   Saved email attachments viewer
   ============================================================ */

(function () {
  'use strict';

  const DOCS_KEY = 'bsa-documents-v1';

  let _container = null;
  let _view      = 'list';   // 'list' | 'grid'
  let _filter    = 'all';    // 'all' | 'pdf' | 'word' | 'excel' | 'image' | 'other'
  let _sort      = 'date';   // 'date' | 'name' | 'type'
  let _query     = '';

  // ── Helpers ──────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadDocs() {
    try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '[]'); } catch { return []; }
  }

  function saveDocs(docs) {
    try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); } catch {}
  }

  function fileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf')                                   return '📄';
    if (['xlsx', 'xls', 'csv'].includes(ext))           return '📊';
    if (['docx', 'doc'].includes(ext))                  return '📝';
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return '🖼';
    if (['zip', 'rar', '7z'].includes(ext))             return '🗜';
    return '📎';
  }

  function fileType(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf')                                   return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(ext))           return 'excel';
    if (['docx', 'doc'].includes(ext))                  return 'word';
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
    return 'other';
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function totalSize(docs) {
    const bytes = docs.reduce((sum, d) => sum + (d.size || 0), 0);
    return formatSize(bytes);
  }

  function updateBadge(count) {
    const nav = document.querySelector('.nav-item[data-module="documents"]');
    if (!nav) return;
    let badge = nav.querySelector('.nav-badge');
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; nav.appendChild(badge); }
    if (count > 0) { badge.textContent = String(count); badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  // ── Main render ──────────────────────────────────────────────
  function render(container) {
    _container = container;
    renderDocuments();
    updateBadge(loadDocs().length);
  }

  function renderDocuments() {
    if (!_container) return;

    let docs = loadDocs();

    // Filter by type
    if (_filter !== 'all') docs = docs.filter(d => fileType(d.filename) === _filter);

    // Filter by query
    if (_query) {
      const q = _query.toLowerCase();
      docs = docs.filter(d =>
        (d.filename || '').toLowerCase().includes(q) ||
        (d.sourceEmailSubject || '').toLowerCase().includes(q) ||
        (d.sourceEmailSender || '').toLowerCase().includes(q)
      );
    }

    // Sort
    if (_sort === 'name') docs.sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
    else if (_sort === 'type') docs.sort((a, b) => fileType(a.filename).localeCompare(fileType(b.filename)));
    else docs.sort((a, b) => new Date(b.savedDate) - new Date(a.savedDate));

    const allDocs = loadDocs();
    const totalMB = totalSize(allDocs);

    _container.innerHTML = `
      <div class="module-header">
        <div class="module-title">📁 Documents</div>
        <div class="module-subtitle">Attachments saved from email — ${allDocs.length} document${allDocs.length!==1?'s':''} · ${totalMB}</div>
      </div>

      <div class="docs-toolbar">
        <input type="text" id="docs-search" class="docs-search" placeholder="Search by filename or source…" value="${esc(_query)}" />

        <div class="docs-filter-pills">
          ${['all','pdf','word','excel','image','other'].map(f => `
            <button class="docs-pill ${_filter===f?'docs-pill-active':''}" data-filter="${f}">
              ${f==='all'?'All':f==='pdf'?'📄 PDF':f==='word'?'📝 Word':f==='excel'?'📊 Excel':f==='image'?'🖼 Images':'📎 Other'}
            </button>`).join('')}
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
          <select id="docs-sort" class="docs-sort">
            <option value="date" ${_sort==='date'?'selected':''}>Date Saved</option>
            <option value="name" ${_sort==='name'?'selected':''}>File Name</option>
            <option value="type" ${_sort==='type'?'selected':''}>File Type</option>
          </select>
          <div class="docs-view-toggle">
            <button class="docs-view-btn ${_view==='list'?'docs-view-active':''}" data-view="list" title="List view">☰</button>
            <button class="docs-view-btn ${_view==='grid'?'docs-view-active':''}" data-view="grid" title="Grid view">⊞</button>
          </div>
        </div>
      </div>

      <div id="docs-content" class="${_view==='grid'?'docs-grid':'docs-list'}">
        ${docs.length === 0 ? renderEmpty() : docs.map(d => _view==='grid' ? renderDocCard(d) : renderDocRow(d)).join('')}
      </div>`;

    // Events
    document.getElementById('docs-search')?.addEventListener('input', e => { _query = e.target.value; renderDocuments(); });
    document.getElementById('docs-sort')?.addEventListener('change', e => { _sort = e.target.value; renderDocuments(); });

    _container.querySelectorAll('.docs-pill').forEach(btn => {
      btn.addEventListener('click', () => { _filter = btn.dataset.filter; renderDocuments(); });
    });
    _container.querySelectorAll('.docs-view-btn').forEach(btn => {
      btn.addEventListener('click', () => { _view = btn.dataset.view; renderDocuments(); });
    });

    _container.querySelectorAll('[data-open-path]').forEach(btn => {
      btn.addEventListener('click', () => window.api.shell.openPath(btn.dataset.openPath));
    });
    _container.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', () => deleteDoc(btn.dataset.deleteId));
    });
  }

  function renderEmpty() {
    return `
      <div class="docs-empty">
        <div style="font-size:40px;margin-bottom:12px;">📁</div>
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">No documents saved yet</div>
        <div style="font-size:12px;color:var(--text-muted);">Open an email in Mail Inbox and click 💾 next to an attachment to save it here.</div>
      </div>`;
  }

  function renderDocRow(doc) {
    return `
      <div class="docs-row">
        <span class="docs-file-icon">${fileIcon(doc.filename)}</span>
        <div class="docs-row-info">
          <div class="docs-row-name">${esc(doc.filename)}</div>
          <div class="docs-row-meta">From: ${esc(doc.sourceEmailSender || 'Unknown')} · ${esc((doc.sourceEmailSubject||'').slice(0,50))} · ${formatDate(doc.savedDate)}</div>
        </div>
        <div class="docs-row-size">${formatSize(doc.size)}</div>
        <div class="docs-row-actions">
          <button class="docs-btn" data-open-path="${esc(doc.filePath)}" title="Open">📂 Open</button>
          <button class="docs-btn docs-btn-danger" data-delete-id="${esc(doc.id)}" title="Delete">🗑</button>
        </div>
      </div>`;
  }

  function renderDocCard(doc) {
    return `
      <div class="docs-card">
        <div class="docs-card-icon">${fileIcon(doc.filename)}</div>
        <div class="docs-card-name" title="${esc(doc.filename)}">${esc(doc.filename)}</div>
        <div class="docs-card-meta">${formatDate(doc.savedDate)}</div>
        <div class="docs-card-source">From: ${esc(doc.sourceEmailSender || 'Unknown')}</div>
        <div class="docs-card-actions">
          <button class="docs-btn" data-open-path="${esc(doc.filePath)}">📂 Open</button>
          <button class="docs-btn docs-btn-danger" data-delete-id="${esc(doc.id)}">🗑</button>
        </div>
      </div>`;
  }

  function deleteDoc(id) {
    const docs = loadDocs().filter(d => d.id !== id);
    saveDocs(docs);
    updateBadge(docs.length);
    renderDocuments();
    window.showToast?.('Document removed', 'info');
  }

  function cleanup() { _container = null; }

  function getContext() {
    const docs = loadDocs();
    return {
      'Screen':     '📁 Documents',
      'Saved docs': docs.length,
      'Total size': totalSize(docs),
    };
  }

  window.Modules = window.Modules || {};
  window.Modules.documents = { render, cleanup, getContext };

  // Public API for other modules
  window.DocumentsModule = {
    refresh() { if (_container) renderDocuments(); updateBadge(loadDocs().length); },
  };

  // Init badge on load
  updateBadge(loadDocs().length);

})();
