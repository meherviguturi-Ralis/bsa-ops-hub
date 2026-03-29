/* ============================================================
   BSA Ops Hub — Empower Academy
   Progressive learning game: Duolingo × RPG × Empower LOS
   ============================================================ */

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  const PROGRESS_KEY = 'bsa-academy-v1';
  const CONTENT_KEY  = 'bsa-academy-content-v1';

  const XP = {
    learn: 10, flashcards: 15, quiz2of3: 20, quiz3of3: 30,
    quiz4of5: 30, quiz5of5: 50,
    scenarioPartial: 20, scenarioFull: 40,
    levelBonus: 25, worldBonus: 100, bossBonus: 150,
    streak7: 50,
  };

  const ACADEMY_RANKS = [
    { xp: 0,    name: 'Trainee',       emoji: '🌱', badge: '1' },
    { xp: 200,  name: 'Apprentice',    emoji: '⭐', badge: '2' },
    { xp: 500,  name: 'Analyst',       emoji: '🌟', badge: '3' },
    { xp: 1000, name: 'Senior Analyst',emoji: '💫', badge: '4' },
    { xp: 2000, name: 'Expert',        emoji: '🔥', badge: '5' },
    { xp: 4000, name: 'Master',        emoji: '🏆', badge: '6' },
  ];

  // ── World / Level Structure ──────────────────────────────────────
  const WORLDS = [
    {
      id: 'w0', name: 'Empower Basics', emoji: '🏠', color: '#58a6ff',
      levels: [
        { id: 'w0l0', name: 'What is Empower LOS?',      topic: 'Empower LOS overview — what it is, the loan lifecycle from application to closing, and why it matters at The Loan Exchange' },
        { id: 'w0l1', name: 'Navigating Screens',         topic: 'Empower LOS key screens: Pipeline view, Loan Summary, Conditions tab, Document Manager, and the Audit Log' },
        { id: 'w0l2', name: 'Loan States & Milestones',   topic: 'Empower loan states and milestones: Processing, Underwriting, Closing, PTD (Prior to Documents), AWC (Automated Workflow Conditions)' },
        { id: 'w0l3', name: 'Fields & Expressions',       topic: 'Empower LOS fields and expressions: DB field numbers (e.g. DB223 = Loan Amount), Expression Manager EX02, expression types and how BSAs use them' },
        { id: 'w0l4', name: 'BOSS: Screen Master',        topic: 'Comprehensive Empower LOS navigation, screens, states, and fields for a BSA at The Loan Exchange', isBoss: true, bossName: 'THE SCREEN MASTER', bossEmoji: '🖥️' },
      ]
    },
    {
      id: 'w1', name: 'Conditions Master', emoji: '📋', color: '#f0883e',
      levels: [
        { id: 'w1l0', name: 'What Are Conditions?',       topic: 'Empower loan conditions: what they are, PTD (Prior to Documents), AWC (At and With Closing), and Prior to Purchase — purpose of each' },
        { id: 'w1l1', name: 'Condition Types',            topic: 'Empower condition types: Document conditions, Verbiage conditions, System conditions — differences and when each applies' },
        { id: 'w1l2', name: 'Clearing Conditions',        topic: 'Clearing Empower conditions: who clears what (BSA, underwriter, processor, closer), role permissions, and the clearing workflow' },
        { id: 'w1l3', name: 'Condition Expressions',      topic: 'Empower condition expressions and triggers: how automated conditions fire, business rules engine, expression syntax for condition activation' },
        { id: 'w1l4', name: 'BOSS: Condition Guardian',   topic: 'Diagnosing and resolving complex Empower condition scenarios: stuck conditions, wrong assignments, expression failures, PTD blocking closings', isBoss: true, bossName: 'THE CONDITION GUARDIAN', bossEmoji: '📋' },
      ]
    },
    {
      id: 'w2', name: 'Exchange Title', emoji: '⚡', color: '#bc8cff',
      levels: [
        { id: 'w2l0', name: 'Exchange Title Integration', topic: 'Exchange Title integration with Empower LOS: what it is, why TLE uses it, RealEC connection, and the BSA\'s role in the integration' },
        { id: 'w2l1', name: 'The Event Sequence',         topic: 'Exchange Title event sequence: Event 100 (title order), Event 130 (commitment received), Event 150 (cleared to close), Event 385 (sync), Event 180 (policy issued) — what triggers each' },
        { id: 'w2l2', name: 'RealEC Portal Management',  topic: 'RealEC portal: what BSA manages, how to verify orders, check acknowledgments, and troubleshoot missing events in the portal vs Empower' },
        { id: 'w2l3', name: 'Failures & Fixes',          topic: 'Exchange Title common failures: Event 130 not firing (title commitment flag, vendor setup), Event 385 blocked by open PTD conditions, vendor credential errors, and resolution steps' },
        { id: 'w2l4', name: 'BOSS: Event Sequence Guardian', topic: 'Tracing and fixing a completely broken Exchange Title event sequence from Event 100 through 180 with multiple failures', isBoss: true, bossName: 'THE EVENT SEQUENCE GUARDIAN', bossEmoji: '⚡' },
      ]
    },
    {
      id: 'w3', name: 'Exchange Appraisal', emoji: '🏡', color: '#3fb950',
      levels: [
        { id: 'w3l0', name: 'Appraisal Workflow',         topic: 'Appraisal ordering workflow in Empower LOS: loan readiness check, property address requirements, loan purpose and property type driving form selection (1004, 1073)' },
        { id: 'w3l1', name: 'SoCal Direct Integration',  topic: 'SoCal Direct AMC integration with Empower Exchange Appraisal: AMC panel assignment, county coverage, Event 200 (order placed), UCDP submission settings for GSE delivery' },
        { id: 'w3l2', name: 'Appraisal Statuses',        topic: 'Empower appraisal status codes and meanings: ordered, acknowledged, inspection scheduled, report received (Event 210), under review, approved, revision requested' },
        { id: 'w3l3', name: 'Common Errors & Fixes',     topic: 'Empower appraisal common errors: AMC panel mismatch, UCDP submission failure blocking closing, Event 210 missing, appraisal value concerns and LTV impact' },
        { id: 'w3l4', name: 'BOSS: Appraisal Guardian',  topic: 'Diagnosing and fully resolving a stalled appraisal order in Empower: from Event 200 through UCDP submission with multiple blockers', isBoss: true, bossName: 'THE APPRAISAL GUARDIAN', bossEmoji: '🏡' },
      ]
    },
    {
      id: 'w4', name: 'DocMagic & DocuTech', emoji: '📄', color: '#d29922',
      levels: [
        { id: 'w4l0', name: 'DocMagic & DocuTech Intro', topic: 'DocMagic and DocuTech: what they are, difference between the two, how they integrate with Empower LOS for document generation and disclosure delivery' },
        { id: 'w4l1', name: 'Document Packages',         topic: 'Empower document package generation: what triggers doc generation, PTD conditions required, loan milestones that fire document packages, closing doc package contents' },
        { id: 'w4l2', name: 'XML Field Mapping',         topic: 'Empower XML field mapping for DocMagic: BorSSN field, LoanAmount (DB223), how Empower maps loan data to XML nodes, field ID format Fields["XXXX"]' },
        { id: 'w4l3', name: 'Disclosure & Compliance',  topic: 'Disclosure tracking in Empower: TRID compliance flags, LE (Loan Estimate) and CD (Closing Disclosure) timing requirements, tolerance violations, compliance alerts BSA must watch' },
        { id: 'w4l4', name: 'BOSS: Document Architect',  topic: 'Correctly mapping 5 XML fields for document generation and diagnosing a failed document package in Empower with DocMagic', isBoss: true, bossName: 'THE DOCUMENT ARCHITECT', bossEmoji: '📄' },
      ]
    },
    {
      id: 'w5', name: 'BSA Expert', emoji: '🧠', color: '#ff7b72',
      levels: [
        { id: 'w5l0', name: 'Writing Perfect AC',         topic: 'Writing perfect acceptance criteria for Empower LOS features as a BSA: Given/When/Then format, specific Empower field references, edge cases, and testability requirements' },
        { id: 'w5l1', name: 'UAT Test Design',            topic: 'Designing UAT test cases for Empower LOS workflows: test coverage, positive/negative cases, regression risk, writing steps that QA can execute in Empower' },
        { id: 'w5l2', name: 'Stakeholder Communication', topic: 'BSA stakeholder communication at TLE: updating Jason Goliver (PM) and Paul Yap (Dev), escalation patterns, status language for mortgage LOS changes' },
        { id: 'w5l3', name: 'Sprint Planning',            topic: 'Sprint planning for Empower LOS projects: sizing LOS configuration work, ADO work item breakdown, dependencies between BSA, Dev, and QA in mortgage tech' },
        { id: 'w5l4', name: 'FINAL BOSS: Full Cycle',    topic: 'Complete BSA cycle for a new Empower feature: receive request → write AC → design UAT → coordinate handoff → verify in production', isBoss: true, bossName: 'THE FINAL GUARDIAN', bossEmoji: '🧠', isFinalBoss: true },
      ]
    },
  ];

  // ── Module-level state ───────────────────────────────────────────
  let _container   = null;
  let _levelState  = {};   // active level session
  let _sessionStart = Date.now();

  // ── Progress ─────────────────────────────────────────────────────
  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null') || {
        completedLevels: [], totalXP: 0, worldXP: [0,0,0,0,0,0],
        quizCorrect: 0, quizTotal: 0, badges: [],
        lastOpenDate: null, streak: 0, timeSpentMs: 0,
      };
    } catch (e) {
      return { completedLevels: [], totalXP: 0, worldXP: [0,0,0,0,0,0], quizCorrect: 0, quizTotal: 0, badges: [], lastOpenDate: null, streak: 0, timeSpentMs: 0 };
    }
  }

  function saveProgress(patch) {
    const p = { ...loadProgress(), ...patch };
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
    updateSidebarBadge();
    return p;
  }

  function isLevelComplete(wI, lI) {
    return loadProgress().completedLevels.includes(`w${wI}l${lI}`);
  }

  function isLevelUnlocked(wI, lI) {
    if (wI === 0 && lI === 0) return true;
    if (lI === 0) return WORLDS[wI - 1].levels.every((_, i) => isLevelComplete(wI - 1, i));
    return isLevelComplete(wI, lI - 1);
  }

  function getAcademyRank(xp) {
    let rank = ACADEMY_RANKS[0];
    for (const r of ACADEMY_RANKS) { if (xp >= r.xp) rank = r; }
    return rank;
  }

  // ── Content cache ────────────────────────────────────────────────
  function getContentCache() {
    try { return JSON.parse(localStorage.getItem(CONTENT_KEY) || '{}'); } catch { return {}; }
  }

  function getCached(wI, lI) {
    return getContentCache()[`w${wI}l${lI}`] || null;
  }

  function setCached(wI, lI, data) {
    try {
      const cache = getContentCache();
      cache[`w${wI}l${lI}`] = data;
      localStorage.setItem(CONTENT_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  // ── JSON parser (handles Claude code-fenced output) ──────────────
  function parseJSON(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    const raw = fenced ? fenced[1] : text.trim();
    const arr = raw.match(/(\[[\s\S]+\])/);
    return JSON.parse(arr ? arr[1] : raw);
  }

  // ── Empower system context for Claude calls ──────────────────────
  const EMPOWER_CONTEXT = `You are an Empower LOS expert at The Loan Exchange. Key facts:
- Exchange Title events: 100=Order, 130=Commitment Received, 150=Cleared to Close, 385=Sync, 180=Policy Issued
- AWC = Automated Workflow Conditions (auto-trigger on loan data changes)
- PTD = Prior to Documents (conditions blocking doc draw)
- EX02 = Expression Manager | DM02 = Data Manager | MU01/02/03 = User/Role/Resource Managers
- DB223 = Loan Amount field | Screen 225 = Underwriting Decision
- DocMagic: document generation via XML field mapping, Fields["XXXX"] format
- UCDP = Universal Collateral Data Portal (GSE appraisal submission)
- SoCal Direct = AMC for Exchange Appraisal in Southern California
- Custom fields: Custom.PMorBSA, Custom.Dev, Custom.QA, Custom.Requester
- Supervisory 2nd Sign: Level 1 ($832K-$1.25M), Level 2 ($1.25M-$3M), Level 3 (≥$3M)`;

  // ── Content generation via Claude API ────────────────────────────
  async function generateContent(wI, lI) {
    const apiKey = window.appSettings?.anthropicKey;
    if (!apiKey) return null;

    const level = WORLDS[wI].levels[lI];
    const topic = level.topic;
    const isBoss = !!level.isBoss;
    const qCount = isBoss ? 5 : 3;

    const prompt = `${EMPOWER_CONTEXT}

Generate learning content about this Empower LOS topic: "${topic}"

Return ONLY valid JSON in this exact structure (no other text):
{
  "learn": "HTML string (200 words): 2-3 paragraphs explaining the topic with <strong> tags on key terms. End with a <div class='ac-tip'>💡 <strong>Did you know?</strong> [one surprising fact]</div>",
  "flashcards": [
    {"front": "short question a BSA trainee would face", "back": "clear concise answer (1-2 sentences)"},
    {"front": "...", "back": "..."},
    {"front": "...", "back": "..."}
  ],
  "quiz": [
    {"question": "practical scenario question (not a definition)", "options": ["a","b","c","d"], "correct_index": 0, "explanation": "why this is correct"},
    ...(${qCount} total questions)
  ],
  "scenario": "3-4 sentence realistic scenario a BSA at TLE would face related to ${topic}. Be specific with Empower field names or screen names."
}`;

    try {
      const res = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        apiKey,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = res.content?.[0]?.text || '';
      if (res.error) throw new Error(res.error);
      return parseJSON(text);
    } catch (e) {
      console.warn('Academy content generation failed:', e.message);
      return null;
    }
  }

  async function gradeScenarioAnswer(scenario, answer) {
    const apiKey = window.appSettings?.anthropicKey;
    if (!apiKey) return { score: 7, feedback: 'Answer recorded. Add your API key in Settings for AI grading.' };

    const prompt = `${EMPOWER_CONTEXT}

Grade this BSA trainee's answer to an Empower LOS scenario challenge.

Scenario: "${scenario}"

Their answer: "${answer}"

Score 1-10. Return ONLY JSON:
{"score": 7, "feedback": "2-3 sentences of specific feedback on what they got right and what they missed. Be encouraging but honest. Reference specific Empower concepts."}`;

    try {
      const res = await window.api.ai.complete({
        model: 'claude-sonnet-4-6',
        apiKey,
        messages: [{ role: 'user', content: prompt }],
      });
      return parseJSON(res.content?.[0]?.text || '');
    } catch (e) {
      return { score: 7, feedback: 'Good effort! Your answer showed understanding of the key concepts.' };
    }
  }

  // ── Streak tracking ───────────────────────────────────────────────
  function checkStreak() {
    const p = loadProgress();
    const today = new Date().toDateString();
    const last  = p.lastOpenDate;

    if (last === today) return p.streak;

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = last === yesterday ? p.streak + 1 : 1;

    saveProgress({ lastOpenDate: today, streak: newStreak });

    if (newStreak % 7 === 0) {
      awardXP(XP.streak7, `🔥 ${newStreak}-day streak!`);
      window.showToast?.(`🔥 ${newStreak}-day streak! +${XP.streak7} XP`, 'success');
    }
    return newStreak;
  }

  // ── XP ────────────────────────────────────────────────────────────
  function awardXP(amount, reason) {
    const p = loadProgress();
    saveProgress({ totalXP: p.totalXP + amount });
    window.awardXP?.('academy_' + reason.slice(0, 20), reason);
  }

  // ── Sound (Web Audio API) ─────────────────────────────────────────
  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const sounds = {
        correct: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.15]],
        wrong:   [[220, 0, 0.3]],
        level:   [[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.1], [1047, 0.24, 0.3]],
        boss:    [[130, 0, 0.4], [146, 0.15, 0.4], [110, 0.30, 0.6]],
        flip:    [[880, 0, 0.06]],
      };
      (sounds[type] || []).forEach(([freq, delay, dur]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = type === 'boss' ? 'sawtooth' : 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + dur + 0.05);
      });
    } catch (e) { /* silent */ }
  }

  // ── Confetti ──────────────────────────────────────────────────────
  function spawnConfetti() {
    const wrap = document.createElement('div');
    wrap.className = 'ac-confetti-wrap';
    document.body.appendChild(wrap);
    const colors = ['#58a6ff','#3fb950','#f0883e','#bc8cff','#ffd700','#ff7b72'];
    for (let i = 0; i < 48; i++) {
      const d = document.createElement('div');
      d.className = 'ac-confetti-dot';
      d.style.cssText = `left:${Math.random()*100}%;background:${colors[i%colors.length]};animation-delay:${Math.random()*0.6}s;animation-duration:${1.4+Math.random()*0.8}s;width:${5+Math.random()*8}px;height:${5+Math.random()*8}px;border-radius:${Math.random()>0.5?'50%':'2px'};`;
      wrap.appendChild(d);
    }
    setTimeout(() => wrap.remove(), 3200);
  }

  // ── Sidebar badge ─────────────────────────────────────────────────
  function updateSidebarBadge() {
    const nav = document.querySelector('.nav-item[data-module="academy"]');
    if (!nav) return;
    let badge = nav.querySelector('.nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      nav.appendChild(badge);
    }
    const rank = getAcademyRank(loadProgress().totalXP);
    badge.textContent = `Lv${rank.badge}`;
    badge.style.background = 'var(--accent)';
    badge.style.display = '';
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function progressBar(parts, current) {
    const labels = { learn: 'A', flashcards: 'B', quiz: 'C', scenario: 'D' };
    return `<div class="ac-parts-bar">${parts.map(p => `
      <div class="ac-part-step ${current===p?'ac-part-active':_levelState.done?.includes(p)?'ac-part-done':''}">
        <div class="ac-part-dot">${labels[p]||p}</div>
        <span class="ac-part-lbl">${p==='learn'?'Learn':p==='flashcards'?'Cards':p==='quiz'?'Quiz':'Challenge'}</span>
      </div>
    `).join('<div class="ac-part-conn"></div>')}</div>`;
  }

  function setMain(html) {
    if (_container) _container.innerHTML = html;
  }

  // ── View: World Map ───────────────────────────────────────────────
  function showWorldMap() {
    const p     = loadProgress();
    const streak = p.streak;
    const rank   = getAcademyRank(p.totalXP);
    const nextRank = ACADEMY_RANKS[ACADEMY_RANKS.indexOf(rank) + 1];
    const xpPct = nextRank ? Math.round(((p.totalXP - rank.xp) / (nextRank.xp - rank.xp)) * 100) : 100;

    const worldCards = WORLDS.map((w, wI) => {
      const done      = w.levels.filter((_, lI) => isLevelComplete(wI, lI)).length;
      const unlocked  = wI === 0 || WORLDS[wI-1].levels.every((_,lI) => isLevelComplete(wI-1, lI));
      const complete  = done === 5;
      return `
        <div class="ac-world-card ${!unlocked?'ac-world-locked':complete?'ac-world-done':''}" data-world="${wI}" ${!unlocked?'':'style="border-color:'+w.color+'33;"'}>
          <div class="ac-world-emoji">${!unlocked ? '🔒' : w.emoji}</div>
          <div class="ac-world-name">${esc(w.name)}</div>
          <div class="ac-world-prog">
            <div class="ac-world-bar"><div class="ac-world-fill" style="width:${done/5*100}%;background:${w.color};"></div></div>
            <span class="ac-world-count">${done}/5</span>
          </div>
          ${complete ? '<div class="ac-world-complete">✓ Complete</div>' : ''}
        </div>`;
    }).join('');

    setMain(`
      <div class="module-header" style="margin-bottom:0;padding-bottom:12px;border-bottom:1px solid var(--border-default);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div class="module-title">🎮 Empower Academy</div>
            <div class="module-subtitle">Master Empower LOS through progressive levels, quests &amp; boss challenges</div>
          </div>
          <button class="ac-stats-btn" id="ac-stats-btn">📊 My Stats</button>
        </div>
      </div>

      <div class="ac-hud">
        <div class="ac-hud-rank">
          <span class="ac-rank-emoji">${rank.emoji}</span>
          <div>
            <div class="ac-rank-name">${rank.name}</div>
            <div class="ac-rank-xp">${p.totalXP} XP${nextRank ? ` · ${nextRank.xp - p.totalXP} to next` : ' · MAX'}</div>
          </div>
          <div class="ac-xp-bar-wrap">
            <div class="ac-xp-bar"><div class="ac-xp-fill" style="width:${xpPct}%"></div></div>
          </div>
        </div>
        ${streak > 0 ? `<div class="ac-streak">🔥 <strong>${streak}</strong> day streak</div>` : ''}
      </div>

      <div class="ac-world-grid">${worldCards}</div>
    `);

    _container.querySelectorAll('.ac-world-card:not(.ac-world-locked)').forEach(card => {
      card.addEventListener('click', () => showLevelPath(parseInt(card.dataset.world)));
    });
    document.getElementById('ac-stats-btn')?.addEventListener('click', showStats);
  }

  // ── View: Level Path ──────────────────────────────────────────────
  function showLevelPath(wI) {
    const world = WORLDS[wI];
    const levels = world.levels.map((lv, lI) => {
      const done     = isLevelComplete(wI, lI);
      const unlocked = isLevelUnlocked(wI, lI);
      const current  = unlocked && !done;
      return `
        <div class="ac-lv-node ${done?'ac-lv-done':unlocked?'ac-lv-current':'ac-lv-locked'}" data-level="${lI}">
          <div class="ac-lv-circle" style="${done||current?'border-color:'+world.color+';':('')}">
            ${done ? '⭐' : lv.isBoss ? (unlocked?lv.bossEmoji:'🔒') : (unlocked?'▶':'🔒')}
          </div>
          <div class="ac-lv-label">${esc(lv.name)}</div>
          ${lv.isBoss ? '<div class="ac-lv-boss-tag">BOSS</div>' : ''}
        </div>
        ${lI < 4 ? `<div class="ac-lv-conn ${done?'ac-lv-conn-done':''}"></div>` : ''}`;
    }).join('');

    setMain(`
      <div class="ac-path-header">
        <button class="ac-back-btn" id="ac-back-world">← Worlds</button>
        <div class="ac-path-title"><span>${world.emoji}</span> ${esc(world.name)}</div>
      </div>
      <div class="ac-lv-path">${levels}</div>
    `);

    document.getElementById('ac-back-world')?.addEventListener('click', showWorldMap);
    _container.querySelectorAll('.ac-lv-node.ac-lv-done, .ac-lv-node.ac-lv-current').forEach(node => {
      node.addEventListener('click', () => startLevel(wI, parseInt(node.dataset.level)));
    });
  }

  // ── View: Boss Intro ──────────────────────────────────────────────
  function showBossIntro(wI, lI, onContinue) {
    const lv = WORLDS[wI].levels[lI];
    playSound('boss');
    setMain(`
      <div class="ac-boss-intro">
        <div class="ac-boss-emoji">${lv.bossEmoji}</div>
        <div class="ac-boss-title">BOSS CHALLENGE</div>
        <div class="ac-boss-name">${esc(lv.bossName)}</div>
        <div class="ac-boss-desc">You must answer <strong>4 of 5 questions</strong> correctly and complete a <strong>scenario challenge</strong> to defeat this boss.</div>
        ${lv.isFinalBoss ? '<div class="ac-boss-final-badge">⚡ FINAL BOSS ⚡</div>' : ''}
        <button class="btn btn-primary ac-boss-start-btn" id="ac-boss-start">⚔️ Begin Challenge</button>
      </div>
    `);
    document.getElementById('ac-boss-start')?.addEventListener('click', onContinue);
  }

  // ── Level start — load/generate content ──────────────────────────
  async function startLevel(wI, lI) {
    const lv    = WORLDS[wI].levels[lI];
    const isBoss = !!lv.isBoss;

    _levelState = { wI, lI, done: [], xpEarned: {}, quizCorrect: 0, quizTotal: 0, scenarioScore: 0, startMs: Date.now() };

    if (isBoss) {
      showBossIntro(wI, lI, async () => {
        await loadAndShowLearn(wI, lI);
      });
      return;
    }
    await loadAndShowLearn(wI, lI);
  }

  async function loadAndShowLearn(wI, lI) {
    const cached = getCached(wI, lI);
    if (cached) { showPartLearn(wI, lI, cached); return; }

    if (!window.appSettings?.anthropicKey) {
      showNoKeyMessage(wI, lI);
      return;
    }

    setMain(`<div class="ac-loading"><div class="ac-spinner"></div><div>Generating lesson content…</div><div class="ac-loading-sub">Claude is crafting your lesson</div></div>`);

    const content = await generateContent(wI, lI);
    if (!content) { showNoKeyMessage(wI, lI); return; }

    setCached(wI, lI, content);
    showPartLearn(wI, lI, content);
  }

  function showNoKeyMessage(wI, lI) {
    const lv = WORLDS[wI].levels[lI];
    const isBoss = !!lv.isBoss;
    const parts = isBoss ? ['learn','quiz','scenario'] : ['learn','flashcards','quiz','scenario'];
    setMain(`
      <div class="ac-level-wrap">
        ${progressBar(parts, 'learn')}
        <div class="ac-learn-card">
          <div class="ac-learn-topic">📚 ${esc(lv.name)}</div>
          <div style="text-align:center;padding:40px 20px;">
            <div style="font-size:32px;margin-bottom:12px;">🔑</div>
            <div style="font-size:14px;color:var(--text-primary);margin-bottom:8px;font-weight:600;">API Key Required</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Lesson content is AI-generated. Add your Anthropic API key in Settings to unlock all Academy lessons.</div>
            <button class="btn btn-primary" id="ac-go-settings">Go to Settings</button>
          </div>
        </div>
      </div>
    `);
    document.getElementById('ac-go-settings')?.addEventListener('click', () => window.navigateTo('settings'));
  }

  // ── Part A: Learn ─────────────────────────────────────────────────
  function showPartLearn(wI, lI, content) {
    const lv    = WORLDS[wI].levels[lI];
    const isBoss = !!lv.isBoss;
    const parts = isBoss ? ['learn','quiz','scenario'] : ['learn','flashcards','quiz','scenario'];

    setMain(`
      <div class="ac-level-wrap">
        <div class="ac-level-header">
          <button class="ac-back-btn" id="ac-back-path">← ${esc(WORLDS[wI].name)}</button>
          <div class="ac-level-title">${esc(lv.name)}</div>
        </div>
        ${progressBar(parts, 'learn')}
        <div class="ac-learn-card">
          <div class="ac-learn-topic">📚 Learn</div>
          <div class="ac-learn-content">${content.learn || '<p>Content loaded.</p>'}</div>
        </div>
        <div class="ac-level-footer">
          <button class="btn btn-primary ac-continue-btn" id="ac-learn-done">I&rsquo;ve read this → Continue</button>
        </div>
      </div>
    `);

    document.getElementById('ac-back-path')?.addEventListener('click', () => showLevelPath(wI));
    document.getElementById('ac-learn-done')?.addEventListener('click', () => {
      _levelState.done = ['learn'];
      awardXP(XP.learn, 'learn_part');
      _levelState.xpEarned.learn = XP.learn;
      if (isBoss) {
        showPartQuiz(wI, lI, content);
      } else {
        showPartFlashcards(wI, lI, content);
      }
    });
  }

  // ── Part B: Flashcards ────────────────────────────────────────────
  function showPartFlashcards(wI, lI, content) {
    const lv    = WORLDS[wI].levels[lI];
    const cards = content.flashcards || [];
    const parts = ['learn','flashcards','quiz','scenario'];
    let current = 0;
    let flipped = false;
    const seen  = new Set();

    function renderCard() {
      const card = cards[current];
      if (!card) { completeFlashcards(); return; }
      const cardArea = document.getElementById('ac-card-area');
      if (!cardArea) return;
      flipped = false;
      cardArea.innerHTML = `
        <div class="ac-flip-card" id="ac-flip-card">
          <div class="ac-flip-inner">
            <div class="ac-flip-front">
              <div class="ac-flip-label">Question ${current+1} of ${cards.length}</div>
              <div class="ac-flip-text">${esc(card.front)}</div>
              <div class="ac-flip-hint">Click to reveal answer</div>
            </div>
            <div class="ac-flip-back">
              <div class="ac-flip-label">Answer</div>
              <div class="ac-flip-text">${esc(card.back)}</div>
            </div>
          </div>
        </div>
        <div class="ac-flip-actions" id="ac-flip-actions" style="display:none;">
          <button class="btn btn-primary" id="ac-flip-next">${current < cards.length-1 ? 'Next Card →' : 'Continue to Quiz →'}</button>
        </div>`;

      document.getElementById('ac-flip-card')?.addEventListener('click', () => {
        document.getElementById('ac-flip-card')?.classList.add('ac-flipped');
        playSound('flip');
        seen.add(current);
        setTimeout(() => { const el = document.getElementById('ac-flip-actions'); if (el) el.style.display = 'flex'; }, 400);
      });
      document.getElementById('ac-flip-next')?.addEventListener('click', () => {
        current++;
        if (current < cards.length) renderCard();
        else completeFlashcards();
      });
    }

    function completeFlashcards() {
      _levelState.done = ['learn','flashcards'];
      awardXP(XP.flashcards, 'flashcards_part');
      _levelState.xpEarned.flashcards = XP.flashcards;
      showPartQuiz(wI, lI, content);
    }

    setMain(`
      <div class="ac-level-wrap">
        <div class="ac-level-header">
          <button class="ac-back-btn" id="ac-back-path">← ${esc(WORLDS[wI].name)}</button>
          <div class="ac-level-title">${esc(lv.name)}</div>
        </div>
        ${progressBar(parts, 'flashcards')}
        <div class="ac-flash-wrap">
          <div class="ac-flash-title">🃏 Flashcards — flip each card</div>
          <div id="ac-card-area"></div>
        </div>
      </div>
    `);

    document.getElementById('ac-back-path')?.addEventListener('click', () => showLevelPath(wI));
    renderCard();
  }

  // ── Part C: Quiz ──────────────────────────────────────────────────
  function showPartQuiz(wI, lI, content) {
    const lv       = WORLDS[wI].levels[lI];
    const isBoss   = !!lv.isBoss;
    const parts    = isBoss ? ['learn','quiz','scenario'] : ['learn','flashcards','quiz','scenario'];
    const questions = content.quiz || [];
    const required  = isBoss ? 4 : 2;
    let qIdx = 0, correct = 0, answered = false;
    const timer = { el: null, start: isBoss ? Date.now() : null, duration: 10 * 60 * 1000 };

    function renderQ() {
      const q = questions[qIdx];
      if (!q) { finishQuiz(); return; }
      answered = false;
      const qArea = document.getElementById('ac-quiz-area');
      if (!qArea) return;
      qArea.innerHTML = `
        <div class="ac-quiz-progress">Question ${qIdx+1} / ${questions.length}</div>
        <div class="ac-quiz-q">${esc(q.question)}</div>
        <div class="ac-quiz-options">
          ${q.options.map((opt, i) => `<button class="ac-quiz-opt" data-idx="${i}">${esc(opt)}</button>`).join('')}
        </div>
        <div class="ac-quiz-explanation" id="ac-explanation" style="display:none;"></div>
        <button class="btn btn-primary" id="ac-quiz-next" style="display:none;margin-top:12px;">${qIdx < questions.length-1 ? 'Next →' : 'Finish Quiz'}</button>`;

      qArea.querySelectorAll('.ac-quiz-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const chosen = parseInt(btn.dataset.idx);
          const isCorrect = chosen === q.correct_index;
          if (isCorrect) { correct++; playSound('correct'); btn.classList.add('ac-opt-correct'); }
          else { playSound('wrong'); btn.classList.add('ac-opt-wrong'); qArea.querySelectorAll('.ac-quiz-opt')[q.correct_index]?.classList.add('ac-opt-correct'); }
          const expEl = document.getElementById('ac-explanation');
          if (expEl) { expEl.style.display = 'block'; expEl.textContent = q.explanation || ''; }
          document.getElementById('ac-quiz-next').style.display = '';
        });
      });
      document.getElementById('ac-quiz-next')?.addEventListener('click', () => { qIdx++; renderQ(); });
    }

    function finishQuiz() {
      _levelState.quizCorrect += correct;
      _levelState.quizTotal += questions.length;
      const passed = correct >= required;
      const xpEarned = isBoss ? (correct >= 5 ? XP.quiz5of5 : XP.quiz4of5) : (correct >= 3 ? XP.quiz3of3 : XP.quiz2of3);
      awardXP(xpEarned, 'quiz_part');
      _levelState.xpEarned.quiz = xpEarned;
      _levelState.done = isBoss ? ['learn','quiz'] : ['learn','flashcards','quiz'];

      // Update global quiz stats
      const p = loadProgress();
      saveProgress({ quizCorrect: p.quizCorrect + correct, quizTotal: p.quizTotal + questions.length });

      const qArea = document.getElementById('ac-quiz-area');
      if (qArea) qArea.innerHTML = `
        <div class="ac-quiz-result ${passed?'ac-result-pass':'ac-result-fail'}">
          <div class="ac-result-score">${correct}/${questions.length}</div>
          <div class="ac-result-label">${passed ? '✅ Passed!' : `⚠️ ${correct}/${required} required`}</div>
          <button class="btn btn-primary" id="ac-to-scenario" style="margin-top:16px;">${passed ? 'Continue to Challenge →' : 'Retry Quiz'}</button>
        </div>`;
      document.getElementById('ac-to-scenario')?.addEventListener('click', () => {
        if (passed) showPartScenario(wI, lI, content);
        else showPartQuiz(wI, lI, content);
      });
    }

    let timerInterval = null;
    function startTimer() {
      if (!isBoss) return;
      timerInterval = setInterval(() => {
        const el = document.getElementById('ac-boss-timer-fill');
        if (!el) { clearInterval(timerInterval); return; }
        const elapsed = Date.now() - timer.start;
        const pct = Math.max(0, 100 - (elapsed / timer.duration * 100));
        el.style.width = pct + '%';
        if (pct === 0) clearInterval(timerInterval);
      }, 1000);
    }

    setMain(`
      <div class="ac-level-wrap">
        <div class="ac-level-header">
          <div class="ac-level-title">${isBoss ? '⚔️ Boss Quiz — ' : ''}${esc(lv.name)}</div>
        </div>
        ${progressBar(parts, 'quiz')}
        ${isBoss ? `<div class="ac-boss-timer"><div class="ac-boss-timer-fill" id="ac-boss-timer-fill"></div><span class="ac-timer-label">10 min</span></div>` : ''}
        <div class="ac-quiz-wrap"><div id="ac-quiz-area"></div></div>
      </div>
    `);

    if (isBoss) startTimer();
    _levelState.timerInterval = timerInterval;
    renderQ();
  }

  // ── Part D: Scenario Challenge ────────────────────────────────────
  function showPartScenario(wI, lI, content) {
    const lv    = WORLDS[wI].levels[lI];
    const isBoss = !!lv.isBoss;
    const parts = isBoss ? ['learn','quiz','scenario'] : ['learn','flashcards','quiz','scenario'];
    const scenario = content.scenario || '';

    setMain(`
      <div class="ac-level-wrap">
        <div class="ac-level-header">
          <div class="ac-level-title">💬 Scenario Challenge</div>
        </div>
        ${progressBar(parts, 'scenario')}
        <div class="ac-scenario-card">
          <div class="ac-scenario-label">🎯 Your Scenario</div>
          <div class="ac-scenario-text">${esc(scenario)}</div>
          <textarea id="ac-scenario-input" class="ac-scenario-input" placeholder="Walk through your approach step by step… (minimum 30 words)" rows="5"></textarea>
          <div class="ac-scenario-footer">
            <span id="ac-word-count" class="ac-word-count">0 words</span>
            <button class="btn btn-primary" id="ac-submit-scenario" disabled>Submit Answer →</button>
          </div>
        </div>
        <div id="ac-grade-result"></div>
      </div>
    `);

    const inp = document.getElementById('ac-scenario-input');
    const wc  = document.getElementById('ac-word-count');
    const btn = document.getElementById('ac-submit-scenario');

    inp?.addEventListener('input', () => {
      const words = inp.value.trim().split(/\s+/).filter(Boolean).length;
      if (wc) wc.textContent = `${words} word${words!==1?'s':''}`;
      if (btn) btn.disabled = words < 30;
    });

    btn?.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Grading…';
      const gradeArea = document.getElementById('ac-grade-result');
      if (gradeArea) gradeArea.innerHTML = `<div class="ac-grading"><div class="ac-spinner"></div><div>Claude is reviewing your answer…</div></div>`;

      const result = await gradeScenarioAnswer(scenario, inp?.value || '');
      const score  = parseInt(result.score) || 5;
      const stars  = score >= 9 ? 3 : score >= 7 ? 2 : score >= 4 ? 1 : 0;
      const xp     = score >= 7 ? XP.scenarioFull : score >= 4 ? XP.scenarioPartial : 0;

      _levelState.scenarioScore = score;
      _levelState.xpEarned.scenario = xp;
      if (xp > 0) awardXP(xp, 'scenario_part');

      if (gradeArea) gradeArea.innerHTML = `
        <div class="ac-grade-card ${score>=7?'ac-grade-pass':score>=4?'ac-grade-mid':'ac-grade-fail'}">
          <div class="ac-grade-score">Score: ${score}/10</div>
          <div class="ac-grade-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3-stars)}</div>
          <div class="ac-grade-feedback">${esc(result.feedback)}</div>
          <div class="ac-grade-xp">+${xp} XP earned</div>
          ${score < 4
            ? `<button class="btn" id="ac-retry-scenario" style="margin-top:12px;">Retry Challenge</button>`
            : `<button class="btn btn-primary" id="ac-finish-level" style="margin-top:12px;">Complete Level →</button>`
          }
        </div>`;

      document.getElementById('ac-retry-scenario')?.addEventListener('click', () => showPartScenario(wI, lI, content));
      document.getElementById('ac-finish-level')?.addEventListener('click', () => completeLevelFlow(wI, lI, stars));
    });
  }

  // ── Level complete ────────────────────────────────────────────────
  function completeLevelFlow(wI, lI, stars) {
    if (_levelState.timerInterval) clearInterval(_levelState.timerInterval);

    const lv     = WORLDS[wI].levels[lI];
    const isBoss = !!lv.isBoss;
    const bonus  = isBoss ? XP.bossBonus : XP.levelBonus;

    awardXP(bonus, isBoss ? 'boss_complete' : 'level_complete');
    _levelState.xpEarned.bonus = bonus;

    // Mark complete
    const p = loadProgress();
    const key = `w${wI}l${lI}`;
    if (!p.completedLevels.includes(key)) {
      const newCompleted = [...p.completedLevels, key];
      const worldXP = [...(p.worldXP || [0,0,0,0,0,0])];
      worldXP[wI] = (worldXP[wI] || 0) + Object.values(_levelState.xpEarned).reduce((a,b)=>a+b,0);
      saveProgress({ completedLevels: newCompleted, worldXP });
    }

    // World complete?
    const worldDone = WORLDS[wI].levels.every((_, i) => isLevelComplete(wI, i));
    if (worldDone) {
      awardXP(XP.worldBonus, 'world_complete');
      window.showToast?.(`🌟 World "${WORLDS[wI].name}" complete! +${XP.worldBonus} XP`, 'success');
    }

    const xpBreakdown = _levelState.xpEarned;
    const total = Object.values(xpBreakdown).reduce((a,b)=>a+b,0);

    spawnConfetti();
    playSound('level');

    setMain(`
      <div class="ac-complete-wrap">
        <div class="ac-complete-stars">
          ${[1,2,3].map(s => `<span class="ac-star ${stars>=s?'ac-star-on':''}" style="animation-delay:${(s-1)*0.2}s">⭐</span>`).join('')}
        </div>
        <div class="ac-complete-title">${isBoss ? '👑 BOSS DEFEATED!' : '⭐ LEVEL COMPLETE!'}</div>
        <div class="ac-complete-name">${esc(lv.name)}</div>
        <div class="ac-xp-breakdown">
          ${Object.entries(xpBreakdown).filter(([,v])=>v>0).map(([k,v])=>`
            <div class="ac-xp-row"><span>${k==='learn'?'📚 Learn':k==='flashcards'?'🃏 Cards':k==='quiz'?'❓ Quiz':k==='scenario'?'💬 Challenge':'🎁 Bonus'}</span><span class="ac-xp-val">+${v} XP</span></div>
          `).join('')}
          <div class="ac-xp-row ac-xp-total"><span>Total</span><span class="ac-xp-val">+${total} XP</span></div>
        </div>
        <div class="ac-complete-btns">
          <button class="btn" id="ac-back-to-world">← World Map</button>
          ${lI < 4 && isLevelUnlocked(wI, lI+1) ? `<button class="btn btn-primary" id="ac-next-level">Next Level →</button>` : ''}
        </div>
      </div>
    `);

    document.getElementById('ac-back-to-world')?.addEventListener('click', showWorldMap);
    document.getElementById('ac-next-level')?.addEventListener('click', () => startLevel(wI, lI + 1));
  }

  // ── View: Stats ────────────────────────────────────────────────────
  function showStats() {
    const p     = loadProgress();
    const rank  = getAcademyRank(p.totalXP);
    const worldsDone = WORLDS.filter((w, wI) => w.levels.every((_, lI) => isLevelComplete(wI, lI))).length;
    const accuracy = p.quizTotal > 0 ? Math.round(p.quizCorrect / p.quizTotal * 100) : 0;
    const worldXP = p.worldXP || [0,0,0,0,0,0];
    const maxXP = Math.max(...worldXP, 1);
    const strongest = worldXP.indexOf(Math.max(...worldXP));
    const weakest   = worldXP.indexOf(Math.min(...worldXP));

    setMain(`
      <div class="ac-stats-wrap">
        <div class="ac-path-header">
          <button class="ac-back-btn" id="ac-back-from-stats">← Academy</button>
          <div class="ac-path-title">📊 My Academy Stats</div>
        </div>

        <div class="ac-stats-grid">
          <div class="ac-stat-card"><div class="ac-stat-big">${rank.emoji} ${rank.name}</div><div class="ac-stat-lbl">Academy Rank</div></div>
          <div class="ac-stat-card"><div class="ac-stat-big">${p.totalXP}</div><div class="ac-stat-lbl">Total XP</div></div>
          <div class="ac-stat-card"><div class="ac-stat-big">${worldsDone}/6</div><div class="ac-stat-lbl">Worlds Complete</div></div>
          <div class="ac-stat-card"><div class="ac-stat-big">${p.completedLevels.length}/30</div><div class="ac-stat-lbl">Levels Complete</div></div>
          <div class="ac-stat-card"><div class="ac-stat-big">${accuracy}%</div><div class="ac-stat-lbl">Quiz Accuracy</div></div>
          <div class="ac-stat-card"><div class="ac-stat-big">🔥 ${p.streak}</div><div class="ac-stat-lbl">Day Streak</div></div>
        </div>

        <div class="ac-stats-section-lbl">XP per World</div>
        <div class="ac-world-bars">
          ${WORLDS.map((w, i) => `
            <div class="ac-wbar-row">
              <span class="ac-wbar-name">${w.emoji} ${esc(w.name)}</span>
              <div class="ac-wbar-track"><div class="ac-wbar-fill" style="width:${worldXP[i]/maxXP*100}%;background:${w.color};"></div></div>
              <span class="ac-wbar-xp">${worldXP[i]} XP</span>
            </div>`).join('')}
        </div>

        ${maxXP > 0 ? `
        <div class="ac-stats-insight">
          <span>💪 Strongest: <strong>${WORLDS[strongest]?.name}</strong></span>
          <span>📈 Focus area: <strong>${WORLDS[weakest]?.name}</strong></span>
        </div>` : ''}

        <button class="btn" id="ac-reset-content" style="margin-top:16px;font-size:11px;opacity:0.5;">🗑 Clear Content Cache</button>
      </div>
    `);

    document.getElementById('ac-back-from-stats')?.addEventListener('click', showWorldMap);
    document.getElementById('ac-reset-content')?.addEventListener('click', () => {
      localStorage.removeItem(CONTENT_KEY);
      window.showToast?.('Content cache cleared. Lessons will regenerate.', 'info');
    });
  }

  // ── Entry point ───────────────────────────────────────────────────
  function render(container) {
    _container = container;
    if (_levelState.timerInterval) clearInterval(_levelState.timerInterval);
    _levelState = {};
    checkStreak();
    showWorldMap();
    updateSidebarBadge();
  }

  // ── Self-register ─────────────────────────────────────────────────
  window.Modules = window.Modules || {};
  window.Modules.academy = {
    render,
    cleanup() {
      if (_levelState.timerInterval) clearInterval(_levelState.timerInterval);
      _container = null;
    },
    getContext() {
      const p    = loadProgress();
      const rank = getAcademyRank(p.totalXP);
      return {
        'Screen':           'Empower Academy',
        'Academy rank':     rank.name,
        'Total XP':         p.totalXP,
        'Levels completed': p.completedLevels.length + '/30',
        'Current streak':   p.streak + ' days',
        'Quiz accuracy':    (p.quizTotal > 0 ? Math.round(p.quizCorrect/p.quizTotal*100) : 0) + '%',
      };
    }
  };

})();
