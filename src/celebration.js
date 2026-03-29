/* ============================================================
   BSA Ops Hub — Celebration Effects
   Canvas confetti + level-up overlay
   ============================================================ */

window.Celebration = (function () {

  const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f0883e', '#f85149'];

  function confetti(options) {
    options = options || {};
    const canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:9999'
    ].join(';');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const particleCount = options.count || 80;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const isCircle = Math.random() > 0.7;
      particles.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 100,
        w: 6 + Math.random() * 6,
        h: 6 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        gravity: 0.12,
        isCircle: isCircle,
        opacity: 1
      });
    }

    let startTime = null;
    const duration = 3000;

    function draw(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let allGone = true;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;

        if (elapsed > duration * 0.6) {
          p.opacity = Math.max(0, p.opacity - 0.02);
        }

        if (p.y < canvas.height + 20 && p.opacity > 0) {
          allGone = false;
        }

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.isCircle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }

        ctx.restore();
      }

      if (!allGone && elapsed < duration + 1000) {
        requestAnimationFrame(draw);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(draw);

    // Safety cleanup
    setTimeout(() => {
      if (canvas.parentNode) canvas.remove();
    }, duration + 1500);
  }

  function levelUp(levelName) {
    // Trigger confetti first
    confetti({ count: 100 });

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'levelup-overlay';
    overlay.innerHTML = `
      <div class="levelup-card">
        <div class="levelup-sparkle">✨</div>
        <div class="levelup-title">LEVEL UP!</div>
        <div class="levelup-name">${levelName || 'New Level'}</div>
        <div class="levelup-sub">Keep up the great work!</div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Remove after animation
    setTimeout(() => {
      overlay.style.transition = 'opacity 500ms ease';
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 550);
    }, 2500);
  }

  function taskComplete() {
    const container = document.getElementById('module-container');
    if (!container) return;
    container.classList.remove('celebrate-flash');
    // Force reflow
    void container.offsetWidth;
    container.classList.add('celebrate-flash');
    setTimeout(() => {
      container.classList.remove('celebrate-flash');
    }, 700);
  }

  // ----------------------------------------------------------
  // Card Explosion
  // Bursts particles from a priority-queue card, then removes
  // the card from the DOM.
  // ----------------------------------------------------------

  function cardExplosion(cardEl) {
    if (!cardEl || !cardEl.parentNode) return;

    const rect = cardEl.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;

    // Canvas overlay
    const canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:9999'
    ].join(';');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Generate particles in a radial burst
    const particles = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 5;
      particles.push({
        x:  cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        r:  2 + Math.random() * 3,
        color:   COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: 1,
        gravity: 0.18
      });
    }

    // Animate card out with a brief scale-up then fade
    cardEl.style.transition = 'transform 120ms ease, opacity 350ms ease';
    cardEl.style.transform  = 'scale(1.06)';
    cardEl.style.opacity    = '0';
    setTimeout(() => {
      if (cardEl.parentNode) cardEl.remove();
    }, 380);

    // Particle animation
    const duration = 650;
    let startTs = null;

    function draw(ts) {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let anyAlive = false;

      for (const p of particles) {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += p.gravity;
        p.opacity = Math.max(0, 1 - elapsed / duration);
        if (p.opacity > 0) {
          anyAlive = true;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle   = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (anyAlive && elapsed < duration + 100) {
        requestAnimationFrame(draw);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(draw);

    // Safety cleanup
    setTimeout(() => { if (canvas.parentNode) canvas.remove(); }, duration + 300);
  }

  return {
    confetti,
    levelUp,
    taskComplete,
    cardExplosion
  };

})();
