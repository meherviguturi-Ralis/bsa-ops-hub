/* ============================================================
   BSA Ops Hub — Gamification / XP System
   ============================================================ */

window.XP = (function () {
  const STORAGE_KEY = 'bsa-xp-state';

  const XP_VALUES = {
    TASK_COMPLETE: 100,
    AC_WRITTEN: 150,
    UAT_GENERATED: 200,
    MESSAGE_SENT: 25,
    FOLLOW_UP_SENT: 50,
    WORK_ITEM_UPDATED: 30,
    QUEST_COMPLETED: 75,
    STREAK_BONUS: 50
  };

  const LEVELS = [
    { level: 1, name: 'Trainee Analyst',  threshold: 0 },
    { level: 2, name: 'BSA Associate',    threshold: 250 },
    { level: 3, name: 'Business Analyst', threshold: 600 },
    { level: 4, name: 'Senior Analyst',   threshold: 1200 },
    { level: 5, name: 'Lead Analyst',     threshold: 2200 },
    { level: 6, name: 'Principal BSA',    threshold: 3800 },
    { level: 7, name: 'BSA Architect',    threshold: 6000 },
    { level: 8, name: 'BSA Director',     threshold: 9000 },
    { level: 9, name: 'BSA Legend',       threshold: 13000 }
  ];

  function getDefaultState() {
    return {
      totalXp: 0,
      level: 1,
      streakDays: 0,
      lastActiveDate: null,
      history: []
    };
  }

  function getState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      return JSON.parse(raw);
    } catch (e) {
      return getDefaultState();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage may be unavailable
    }
  }

  function getLevelInfo(totalXp) {
    let currentLevelData = LEVELS[0];
    let nextLevelData = LEVELS[1];

    for (let i = 0; i < LEVELS.length; i++) {
      if (totalXp >= LEVELS[i].threshold) {
        currentLevelData = LEVELS[i];
        nextLevelData = LEVELS[i + 1] || null;
      } else {
        break;
      }
    }

    if (!nextLevelData) {
      // Max level
      return {
        level: currentLevelData.level,
        name: currentLevelData.name,
        currentXp: totalXp - currentLevelData.threshold,
        xpForLevel: 0,
        xpToNext: 0,
        progress: 1
      };
    }

    const xpIntoLevel = totalXp - currentLevelData.threshold;
    const xpForLevel = nextLevelData.threshold - currentLevelData.threshold;
    const progress = Math.min(xpIntoLevel / xpForLevel, 1);

    return {
      level: currentLevelData.level,
      name: currentLevelData.name,
      currentXp: xpIntoLevel,
      xpForLevel: xpForLevel,
      xpToNext: xpForLevel - xpIntoLevel,
      progress: progress
    };
  }

  function checkStreak() {
    const state = getState();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (!state.lastActiveDate) {
      state.streakDays = 1;
      state.lastActiveDate = today;
    } else if (state.lastActiveDate === today) {
      // Already active today, no change
    } else if (state.lastActiveDate === yesterday) {
      // Consecutive day
      state.streakDays = (state.streakDays || 0) + 1;
      state.lastActiveDate = today;
    } else {
      // Streak broken
      state.streakDays = 1;
      state.lastActiveDate = today;
    }

    saveState(state);
    return state;
  }

  function award(action, reason) {
    const amount = XP_VALUES[action] || 0;
    if (amount <= 0) return null;

    const state = getState();
    const oldLevel = getLevelInfo(state.totalXp);

    state.totalXp += amount;

    const newLevelInfo = getLevelInfo(state.totalXp);
    const leveledUp = newLevelInfo.level > oldLevel.level;

    if (leveledUp) {
      state.level = newLevelInfo.level;
    }

    // Update streak / last active
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (!state.lastActiveDate) {
      state.streakDays = 1;
      state.lastActiveDate = today;
    } else if (state.lastActiveDate === today) {
      // No change
    } else if (state.lastActiveDate === yesterday) {
      state.streakDays = (state.streakDays || 0) + 1;
      state.lastActiveDate = today;
    } else {
      state.streakDays = 1;
      state.lastActiveDate = today;
    }

    // Add to history
    state.history = state.history || [];
    state.history.push({
      action,
      reason: reason || action,
      amount,
      total: state.totalXp,
      date: new Date().toISOString()
    });

    // Keep history to last 200 entries
    if (state.history.length > 200) {
      state.history = state.history.slice(-200);
    }

    saveState(state);

    const detail = {
      amount,
      reason: reason || action,
      newTotal: state.totalXp,
      leveledUp,
      newLevel: newLevelInfo.level,
      newLevelName: newLevelInfo.name
    };

    // Dispatch custom event
    try {
      window.dispatchEvent(new CustomEvent('xp-awarded', { detail }));
    } catch (e) {
      // Event dispatch may fail in some contexts
    }

    return detail;
  }

  function getLeaderboard() {
    const state = getState();
    const levelInfo = getLevelInfo(state.totalXp);
    return {
      totalXp: state.totalXp,
      level: levelInfo.level,
      levelName: levelInfo.name,
      streakDays: state.streakDays,
      xpToNext: levelInfo.xpToNext,
      progress: Math.round(levelInfo.progress * 100)
    };
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Initialize streak on load
  checkStreak();

  return {
    XP_VALUES,
    LEVELS,
    getState,
    saveState,
    getLevelInfo,
    award,
    checkStreak,
    getLeaderboard,
    reset
  };
})();
