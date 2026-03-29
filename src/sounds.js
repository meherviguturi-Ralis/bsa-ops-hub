/* ============================================================
   BSA Ops Hub — Sound System
   Web Audio API — programmatically generated sounds
   ============================================================ */

window.Sounds = (function () {
  let _ctx = null;

  function _getCtx() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _ctx;
  }

  function _playTone(freq, duration, type, gain, startTime) {
    try {
      const ctx = _getCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

      gainNode.gain.setValueAtTime(gain, ctx.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration + 0.05);
    } catch (e) {
      // Audio may be blocked — fail silently
    }
  }

  return {
    /**
     * complete() — ascending arpeggio
     * C5 → E5 → G5 at 0, 0.08, 0.16s
     * sine wave, gain 0.25, 0.3s duration each
     */
    complete() {
      try {
        _playTone(523, 0.3, 'sine', 0.25, 0.0);   // C5
        _playTone(659, 0.3, 'sine', 0.25, 0.08);  // E5
        _playTone(784, 0.3, 'sine', 0.25, 0.16);  // G5
      } catch (e) { /* silent */ }
    },

    /**
     * newItem() — single G5 ping
     * 784 Hz, 0.15s, sine, gain 0.2
     */
    newItem() {
      try {
        _playTone(784, 0.15, 'sine', 0.2, 0.0);
      } catch (e) { /* silent */ }
    },

    /**
     * alert() — descending two-tone
     * A4 (440Hz) then E4 (330Hz) at 0.1s gap
     * triangle wave, 0.25s each, gain 0.3
     */
    alert() {
      try {
        _playTone(440, 0.25, 'triangle', 0.3, 0.0);
        _playTone(330, 0.25, 'triangle', 0.3, 0.1);
      } catch (e) { /* silent */ }
    },

    /**
     * click() — very short tick
     * 800Hz, 0.04s, square, gain 0.05
     */
    click() {
      try {
        _playTone(800, 0.04, 'square', 0.05, 0.0);
      } catch (e) { /* silent */ }
    },

    /**
     * levelUp() — epic fanfare
     * C4-E4-G4-C5 arpeggio quickly, then held C5
     * Sine wave, gain 0.35, with harmony chord
     * Total ~1.2s
     */
    levelUp() {
      try {
        // Main arpeggio: C4-E4-G4-C5
        _playTone(261, 0.15, 'sine', 0.35, 0.0);   // C4
        _playTone(329, 0.15, 'sine', 0.35, 0.12);  // E4
        _playTone(392, 0.15, 'sine', 0.35, 0.24);  // G4
        _playTone(523, 0.5,  'sine', 0.35, 0.36);  // C5 held

        // Harmony chord (slightly softer, offset start)
        _playTone(329, 0.5,  'sine', 0.18, 0.36);  // E4 harmony
        _playTone(392, 0.5,  'sine', 0.15, 0.36);  // G4 harmony
        _playTone(784, 0.4,  'sine', 0.12, 0.5);   // G5 shimmer
      } catch (e) { /* silent */ }
    },

    /**
     * celebrate() — festive ascending scale
     * C4-D4-E4-F4-G4-A4-B4-C5, each 0.05s apart
     * Sine wave, gain 0.2
     */
    celebrate() {
      try {
        const notes = [261, 293, 329, 349, 392, 440, 494, 523]; // C4 to C5
        notes.forEach((freq, i) => {
          _playTone(freq, 0.18, 'sine', 0.2, i * 0.05);
        });
      } catch (e) { /* silent */ }
    },

    /**
     * questComplete() — heroic two-note
     * G4 + C5 played together, held 0.5s
     * Sine wave, gain 0.3
     */
    questComplete() {
      try {
        _playTone(392, 0.5, 'sine', 0.3, 0.0);  // G4
        _playTone(523, 0.5, 'sine', 0.3, 0.0);  // C5 (simultaneous)
        _playTone(784, 0.3, 'sine', 0.15, 0.15); // G5 accent
      } catch (e) { /* silent */ }
    },

    /**
     * followUp() — notification chime
     * E5-C5 descending, 0.15s each
     * Sine wave, gain 0.22
     */
    followUp() {
      try {
        _playTone(659, 0.15, 'sine', 0.22, 0.0);   // E5
        _playTone(523, 0.2,  'sine', 0.22, 0.15);  // C5
      } catch (e) { /* silent */ }
    }
  };
})();
