/* ============================================================
   BSA Ops Hub — Daily Quest Board Module
   ============================================================ */

(function () {
  const STORAGE_KEY = 'bsa-quests';

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function loadQuestStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { date: todayStr(), quests: [], manualQuests: [] };
      return JSON.parse(raw);
    } catch (e) {
      return { date: todayStr(), quests: [], manualQuests: [] };
    }
  }

  function saveQuestStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) { /* silent */ }
  }

  function generateId() {
    return 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  function getDifficulty(workItem) {
    const type  = (workItem.fields?.['System.WorkItemType'] || '').toLowerCase();
    const state = (workItem.fields?.['System.State'] || '').toLowerCase();

    if (type === 'epic')       return 'epic';
    if (type === 'feature')    return 'hard';
    if (type === 'user story') {
      if (state === 'active') return 'hard';
      return 'medium';
    }
    if (type === 'task') {
      if (state === 'active') return 'medium';
      return 'easy';
    }
    if (type === 'bug')        return 'hard';
    return 'medium';
  }

  const DIFFICULTY_META = {
    easy:   { label: '🟢 Easy',   time: '~30 min', xp: 75,  color: 'var(--green)',  cls: 'quest-difficulty-easy' },
    medium: { label: '🟡 Medium', time: '~1 hr',   xp: 100, color: 'var(--yellow)', cls: 'quest-difficulty-medium' },
    hard:   { label: '🔴 Hard',   time: '~2 hrs',  xp: 150, color: 'var(--red)',    cls: 'quest-difficulty-hard' },
    epic:   { label: '⚡ Epic',   time: '~4 hrs',  xp: 200, color: 'var(--purple)', cls: 'quest-difficulty-epic' }
  };

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // --------------------------------------------------------
  // XP History / Weekly Chart
  // --------------------------------------------------------

  function getWeeklyXpHistory() {
    let state;
    try { state = window.XP ? window.XP.getState() : null; } catch (e) { state = null; }
    if (!state || !state.history) return [];

    // Build last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().split('T')[0]);
    }

    const xpByDay = {};
    days.forEach(d => xpByDay[d] = 0);

    state.history.forEach(entry => {
      const day = entry.date ? entry.date.split('T')[0] : null;
      if (day && xpByDay[day] !== undefined) {
        xpByDay[day] += entry.amount || 0;
      }
    });

    return days.map(d => ({
      label: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      xp: xpByDay[d]
    }));
  }

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  function render(container) {
    let store = loadQuestStore();

    // Reset if it's a new day
    if (store.date !== todayStr()) {
      store = { date: todayStr(), quests: [], manualQuests: store.manualQuests || [] };
      saveQuestStore(store);
    }

    let xpInfo;
    try {
      xpInfo = window.XP ? window.XP.getLevelInfo(window.XP.getState().totalXp) : { level: 1, name: 'Trainee Analyst', currentXp: 0, xpForLevel: 250, xpToNext: 250, progress: 0 };
    } catch (e) {
      xpInfo = { level: 1, name: 'Trainee Analyst', currentXp: 0, xpForLevel: 250, xpToNext: 250, progress: 0 };
    }

    let streakDays = 0;
    try { streakDays = window.XP ? window.XP.getState().streakDays : 0; } catch (e) {}

    const weeklyData = getWeeklyXpHistory();
    const maxXp = Math.max(...weeklyData.map(d => d.xp), 1);

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">Daily Quest Board</div>
        <div class="module-subtitle">${formatDate(new Date())}</div>
      </div>

      <!-- Streak Banner -->
      ${streakDays > 0 ? `
      <div class="streak-banner">
        <span class="streak-count">🔥 ${streakDays}</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--yellow);">Day Streak!</div>
          <div style="font-size:11px;color:var(--text-muted);">Keep logging in daily to maintain your streak.</div>
        </div>
      </div>` : ''}

      <!-- XP Level Display -->
      <div style="background:var(--bg-panel);border:1px solid var(--border-default);border-radius:8px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Current Level</div>
            <div style="font-size:20px;font-weight:700;color:var(--accent);">Level ${xpInfo.level} — ${xpInfo.name}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--text-muted);">${xpInfo.xpToNext > 0 ? `${xpInfo.xpToNext} XP to next level` : 'MAX LEVEL'}</div>
            <div style="font-size:13px;color:var(--text-secondary);">${xpInfo.currentXp} / ${xpInfo.xpForLevel > 0 ? xpInfo.xpForLevel : '∞'} XP</div>
          </div>
        </div>
        <div class="xp-bar-track" style="height:8px;">
          <div class="xp-bar-fill" style="width:${Math.round((xpInfo.progress || 0) * 100)}%;height:100%;"></div>
        </div>
      </div>

      <!-- Add Quest Button -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;">Today's Quests</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="refresh-wi-quests" style="font-size:12px;">↻ Load from ADO</button>
          <button class="btn btn-secondary" id="toggle-add-quest" style="font-size:12px;">+ Add Quest</button>
        </div>
      </div>

      <!-- Add Quest Form (hidden) -->
      <div id="add-quest-form" style="display:none;background:var(--bg-panel);border:1px solid var(--border-default);border-radius:6px;padding:14px;margin-bottom:16px;">
        <div class="form-row" style="margin-bottom:10px;">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label>Quest Title</label>
            <input type="text" id="quest-title-input" placeholder="e.g. Review HELOC conditions..." style="width:100%;" />
          </div>
          <div class="form-group" style="flex:0 0 130px;margin-bottom:0;">
            <label>Difficulty</label>
            <select id="quest-difficulty-input">
              <option value="easy">Easy</option>
              <option value="medium" selected>Medium</option>
              <option value="hard">Hard</option>
              <option value="epic">Epic</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" id="quest-save-btn" style="font-size:12px;">Save Quest</button>
          <button class="btn btn-secondary" id="quest-cancel-btn" style="font-size:12px;">Cancel</button>
        </div>
      </div>

      <!-- Quest List -->
      <div id="quest-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
        ${renderQuestList(store)}
      </div>

      <!-- Weekly XP Chart -->
      <div class="card" style="margin-top:8px;">
        <div class="section-title" style="margin-bottom:12px;">Weekly XP History</div>
        <div class="xp-chart" style="display:flex;flex-direction:row;align-items:flex-end;height:80px;gap:4px;">
          ${weeklyData.map(d => {
            const heightPct = Math.max((d.xp / maxXp) * 100, d.xp > 0 ? 8 : 4);
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;">
                <div style="font-size:9px;color:var(--text-muted);">${d.xp > 0 ? d.xp : ''}</div>
                <div class="xp-bar-day" style="width:100%;height:${heightPct}%;background:var(--accent-dim);border:1px solid var(--accent);border-radius:2px 2px 0 0;min-height:4px;transition:height 500ms ease;"></div>
                <div class="xp-day-label">${d.label}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Toggle add quest form
    container.querySelector('#toggle-add-quest').addEventListener('click', () => {
      const form = container.querySelector('#add-quest-form');
      const visible = form.style.display !== 'none';
      form.style.display = visible ? 'none' : 'block';
    });

    container.querySelector('#quest-cancel-btn').addEventListener('click', () => {
      container.querySelector('#add-quest-form').style.display = 'none';
    });

    container.querySelector('#quest-save-btn').addEventListener('click', () => {
      const title = container.querySelector('#quest-title-input').value.trim();
      const diff  = container.querySelector('#quest-difficulty-input').value;
      if (!title) { window.showToast('Quest title is required', 'error'); return; }

      const freshStore = loadQuestStore();
      freshStore.manualQuests = freshStore.manualQuests || [];
      freshStore.manualQuests.push({
        id: generateId(),
        title,
        difficulty: diff,
        completed: false,
        isManual: true,
        addedAt: new Date().toISOString()
      });
      saveQuestStore(freshStore);
      window.showToast('Quest added!', 'success');
      try { window.Sounds && window.Sounds.newItem(); } catch (e) {}
      render(container);
    });

    // Refresh from ADO
    container.querySelector('#refresh-wi-quests').addEventListener('click', async () => {
      const btn = container.querySelector('#refresh-wi-quests');
      btn.disabled = true;
      btn.textContent = 'Loading...';
      try {
        const result = await window.adoFetch(
          `${window.appSettings.adoProject}/_apis/wit/wiql?api-version=7.0`,
          'POST',
          {
            query: `SELECT [System.Id],[System.Title],[System.WorkItemType],[System.State],[System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '${window.appSettings.adoProject || 'TLE.Empower'}' AND [System.State] NOT IN ('Closed','Removed') AND [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC`
          }
        );

        if (result && result.workItems && result.workItems.length > 0) {
          const ids = result.workItems.slice(0, 20).map(w => w.id);
          const batchResult = await window.adoFetch(
            `${window.appSettings.adoProject}/_apis/wit/workitemsbatch?api-version=7.0`,
            'POST',
            { ids, fields: ['System.Id', 'System.Title', 'System.WorkItemType', 'System.State'] }
          );

          const freshStore = loadQuestStore();
          const existingIds = new Set((freshStore.quests || []).map(q => q.workItemId));
          const newQuests = [];

          (batchResult.value || []).forEach(wi => {
            if (!existingIds.has(wi.id)) {
              const diff = getDifficulty(wi);
              newQuests.push({
                id: generateId(),
                workItemId: wi.id,
                title: wi.fields?.['System.Title'] || `Work Item #${wi.id}`,
                workItemType: wi.fields?.['System.WorkItemType'] || 'Task',
                state: wi.fields?.['System.State'] || 'Active',
                difficulty: diff,
                completed: false,
                isManual: false
              });
            }
          });

          freshStore.quests = [...(freshStore.quests || []), ...newQuests];
          saveQuestStore(freshStore);
          window.showToast(`Loaded ${newQuests.length} quest(s) from ADO`, 'success');
          render(container);
        } else {
          window.showToast('No work items found (or no PAT configured)', 'info');
        }
      } catch (err) {
        window.showToast('Failed to load from ADO: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '↻ Load from ADO';
      }
    });

    // Quest completion event delegation
    container.querySelector('#quest-list').addEventListener('click', (e) => {
      const checkbox = e.target.closest('.quest-checkbox');
      if (!checkbox) return;

      const questId   = checkbox.dataset.id;
      const isManual  = checkbox.dataset.manual === 'true';
      const freshStore = loadQuestStore();

      let quest = null;
      if (isManual) {
        quest = (freshStore.manualQuests || []).find(q => q.id === questId);
        if (quest) quest.completed = !quest.completed;
      } else {
        quest = (freshStore.quests || []).find(q => q.id === questId);
        if (quest) quest.completed = !quest.completed;
      }

      if (!quest) return;
      saveQuestStore(freshStore);

      if (quest.completed) {
        const meta = DIFFICULTY_META[quest.difficulty] || DIFFICULTY_META.medium;
        try { window.Sounds && window.Sounds.questComplete(); } catch (e) {}
        try { window.Celebration && window.Celebration.taskComplete(); } catch (e) {}
        try { window.XP && window.XP.award('QUEST_COMPLETED', `Completed quest: ${quest.title}`); } catch (e) {}
        window.showToast(`Quest complete! +${meta.xp} XP`, 'success');
      }

      render(container);
    });

    // Delete manual quest
    container.querySelector('#quest-list').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.quest-delete-btn');
      if (!delBtn) return;
      const questId = delBtn.dataset.id;
      const freshStore = loadQuestStore();
      freshStore.manualQuests = (freshStore.manualQuests || []).filter(q => q.id !== questId);
      saveQuestStore(freshStore);
      window.showToast('Quest removed', 'info');
      render(container);
    });
  }

  function renderQuestList(store) {
    const allQuests = [
      ...(store.quests || []),
      ...(store.manualQuests || [])
    ];

    if (allQuests.length === 0) {
      return '<div class="empty-state">No quests yet. Click "Load from ADO" to pull your work items or add a manual quest.</div>';
    }

    return allQuests.map(quest => renderQuestCard(quest)).join('');
  }

  function renderQuestCard(quest) {
    const meta = DIFFICULTY_META[quest.difficulty] || DIFFICULTY_META.medium;
    const adoOrg     = (window.appSettings && window.appSettings.adoOrg) || 'TheLoanExchange';
    const adoProject = (window.appSettings && window.appSettings.adoProject) || 'TLE.Empower';
    const adoLink = quest.workItemId
      ? `https://dev.azure.com/${adoOrg}/${adoProject}/_workitems/edit/${quest.workItemId}`
      : null;

    return `
      <div class="quest-card card ${quest.completed ? 'completed' : ''}" style="display:flex;align-items:flex-start;gap:12px;">
        <div style="flex-shrink:0;padding-top:2px;">
          <div
            class="quest-checkbox ${quest.completed ? 'checked' : ''}"
            data-id="${quest.id}"
            data-manual="${quest.isManual ? 'true' : 'false'}"
            style="width:20px;height:20px;border-radius:4px;border:2px solid ${quest.completed ? 'var(--green)' : 'var(--border-default)'};background:${quest.completed ? 'var(--green)' : 'transparent'};cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 150ms ease;flex-shrink:0;"
            role="checkbox"
            aria-checked="${quest.completed}"
            tabindex="0"
          >
            ${quest.completed ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2"><polyline points="1,6 5,10 11,2"/></svg>` : ''}
          </div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-size:13px;font-weight:600;color:${quest.completed ? 'var(--text-muted)' : 'var(--text-primary)'};text-decoration:${quest.completed ? 'line-through' : 'none'};">${quest.title}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="${meta.cls}" style="font-size:11px;font-weight:600;">${meta.label}</span>
            <span style="font-size:11px;color:var(--text-muted);">⏱ ${meta.time}</span>
            <span style="font-size:11px;color:var(--accent);font-weight:600;">+${meta.xp} XP</span>
            ${quest.state ? `<span class="badge badge-active" style="font-size:10px;">${quest.state}</span>` : ''}
            ${quest.workItemType ? `<span style="font-size:10px;color:var(--text-muted);">${quest.workItemType}</span>` : ''}
            ${adoLink ? `<a href="${adoLink}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;">↗ Open in ADO</a>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          ${quest.isManual ? `
            <button class="btn btn-secondary quest-delete-btn" data-id="${quest.id}" style="font-size:11px;padding:4px 8px;color:var(--text-muted);">✕</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // Self-register
  window.Modules = window.Modules || {};
  window.Modules.quests = { render };
})();
