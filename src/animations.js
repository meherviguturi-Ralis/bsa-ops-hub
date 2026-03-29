/* ============================================================
   BSA Ops Hub — Gaming Animations
   Floating XP text · Number count-up
   ============================================================ */

window.Animations = (function () {

  // ----------------------------------------------------------
  // Floating XP Text
  // Spawns a "+N XP" label that drifts upward and fades out
  // ----------------------------------------------------------

  function floatXP(amount, x, y) {
    const el = document.createElement('div');
    el.className = 'float-xp-text';
    el.textContent = `+${amount} XP`;
    // Centre the element on the given point
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    document.body.appendChild(el);
    // Remove after animation (1 s + tiny buffer)
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1150);
  }

  // ----------------------------------------------------------
  // Count-Up Animation
  // Animates an element's text from its current value to
  // `target` over `duration` ms with an ease-out curve.
  // ----------------------------------------------------------

  function countUp(el, target, duration) {
    if (!el) return;
    const startTime = performance.now();
    const startVal  = parseFloat(el.textContent) || 0;
    function tick(now) {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic: decelerates toward the end
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(startVal + (target - startVal) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ----------------------------------------------------------
  // XP-Awarded Event Listener
  // Hooks into the gamification system's custom event and
  // shows floating XP text anchored to the sidebar XP bar.
  // ----------------------------------------------------------

  window.addEventListener('xp-awarded', function (e) {
    const amount = (e.detail && e.detail.amount) ? e.detail.amount : 0;
    if (!amount) return;

    // Try to anchor near the sidebar XP bar; fall back to top-right
    let x, y;
    const xpFill = document.querySelector('.xp-bar-fill');
    const xpBar  = document.querySelector('.xp-bar-container');
    const anchor = xpFill || xpBar || document.querySelector('#sidebar');
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      x = rect.left + rect.width * 0.6;
      y = rect.top - 4;
    } else {
      x = window.innerWidth - 120;
      y = 80;
    }

    floatXP(amount, x, y);
  });

  return { floatXP, countUp };

})();
