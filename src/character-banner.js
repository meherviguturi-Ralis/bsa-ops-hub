/* ============================================================
   BSA Ops Hub — Character Banner (Emoji Walker)
   Clean minimal emoji-based character traverses the full
   dashboard header strip with activity tooltip bubbles.
   Pure CSS animation + minimal JS for tooltip timing only.
   ============================================================ */

(function () {
  'use strict';

  let _timers = [];

  // Four evenly-spaced activity stops (as fractions of strip width)
  const STOPS = [
    { frac: 0.20, label: 'Writing AC ✍️'  },
    { frac: 0.44, label: 'In Standup 📋'  },
    { frac: 0.68, label: 'Coffee ☕'       },
    { frac: 0.90, label: 'Deploying 🚀'   },
  ];

  // Walk duration matches CSS animation (20s)
  const WALK_DURATION = 20000;

  function mount(el) {
    if (!el) return;
    destroy();

    el.innerHTML = `
      <div class="cb-strip" id="cb-strip">
        <div class="cb-walker-wrap" id="cb-walker-wrap">
          <div class="cb-walker" id="cb-walker">🧑‍💻</div>
          <div class="cb-tooltip" id="cb-tooltip"></div>
        </div>
        <div class="cb-activity-label" id="cb-activity-label">Let's get to work...</div>
      </div>`;

    scheduleTooltips();
  }

  function scheduleTooltips() {
    const strip = document.getElementById('cb-strip');

    function cycle() {
      STOPS.forEach(stop => {
        // Time when character (starting at left=0, ending at left=100%) passes each stop
        const arrivalMs = stop.frac * WALK_DURATION;

        // Show tooltip at arrival
        const t1 = setTimeout(() => {
          const tooltip = document.getElementById('cb-tooltip');
          const labelEl = document.getElementById('cb-activity-label');
          if (!tooltip || !labelEl) return;
          tooltip.textContent = stop.label;
          tooltip.classList.add('visible');
          labelEl.textContent = stop.label;
        }, arrivalMs);

        // Hide tooltip 2s later
        const t2 = setTimeout(() => {
          const tooltip = document.getElementById('cb-tooltip');
          const labelEl = document.getElementById('cb-activity-label');
          if (!tooltip || !labelEl) return;
          tooltip.classList.remove('visible');
          labelEl.textContent = 'Walking...';
        }, arrivalMs + 2000);

        _timers.push(t1, t2);
      });

      // Repeat each full walk cycle
      const cycleTimer = setTimeout(() => {
        _timers = [];
        cycle();
      }, WALK_DURATION);
      _timers.push(cycleTimer);
    }

    // Slight delay to ensure offsetWidth is ready
    const initTimer = setTimeout(cycle, 150);
    _timers.push(initTimer);
  }

  function destroy() {
    _timers.forEach(t => clearTimeout(t));
    _timers = [];
  }

  window.CharacterBanner = { mount, destroy };
})();
