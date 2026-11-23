// Witnessed rewrite, 23 Nov 2026: this file's final content was last touched by the recorded agent session.
// Azure Cove — procedural sound, no audio files: three tiny radio stations built
// from WebAudio oscillators, plus engine hum, siren, gunshot, crash and pickup
// blips. Everything is guarded so a browser without audio still plays silently.

import { RADIO_STATIONS } from './config.js';

export function createAudio() {
  let ctx = null;
  let station = 0;
  let muted = false;
  let radioTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let step = 0;

  // A short pentatonic walk per station; the pattern is fixed, the station picks
  // the root and the tempo, so the radio sounds different but stays in tune.
  const PATTERNS = [
    [0, 3, 5, 7, 10, 7, 5, 3],
    [0, 0, 7, 0, 10, 0, 12, 7],
    [0, 4, 7, 9, 12, 9, 7, 4],
  ];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      return true;
    } catch {
      return false;
    }
  }

  function note(freq, when, dur, type, gainValue) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function radioTick() {
    if (!ctx || muted) return;
    const st = RADIO_STATIONS[station];
    const pattern = PATTERNS[station % PATTERNS.length];
    const semitone = pattern[step % pattern.length];
    const freq = st.root * Math.pow(2, semitone / 12);
    const now = ctx.currentTime;
    note(freq, now, 0.5, 'triangle', 0.06);
    if (step % 2 === 0) note(freq / 2, now, 0.6, 'sine', 0.09);
    if (step % 4 === 0) note(freq * 2, now, 0.2, 'square', 0.015);
    step += 1;
  }

  function startRadio() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (radioTimer !== null) return;
    const st = RADIO_STATIONS[station];
    const interval = 60000 / st.bpm / 2;
    radioTimer = window.setInterval(radioTick, interval);
  }

  function stopRadio() {
    if (radioTimer !== null) { window.clearInterval(radioTimer); radioTimer = null; }
  }

  return {
    /** Start the audio graph on the first user gesture. */
    unlock() {
      if (ensure()) startRadio();
    },
    nextStation() {
      station = (station + 1) % RADIO_STATIONS.length;
      step = 0;
      stopRadio();
      startRadio();
      return RADIO_STATIONS[station].name;
    },
    stationName() { return RADIO_STATIONS[station].name; },
    toggleMute() {
      muted = !muted;
      if (muted) stopRadio();
      else startRadio();
      return muted;
    },
    setEngine(speed01) {
      if (!ensure() || muted) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineGain.gain.value = 0.0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(ctx.destination);
          engineOsc.start();
        }
        engineOsc.frequency.value = 55 + speed01 * 110;
        engineGain.gain.value = 0.012 + speed01 * 0.02;
      } catch { /* audio is best-effort */ }
    },
    setSiren(on) {
      if (!ensure() || muted) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      try {
        if (!sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'sine';
          sirenOsc.frequency.value = 720;
          sirenGain.gain.value = 0;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(ctx.destination);
          sirenOsc.start();
          window.setInterval(() => {
            if (sirenOsc) sirenOsc.frequency.value = sirenOsc.frequency.value > 700 ? 540 : 720;
          }, 450);
        }
        sirenGain.gain.value = on ? 0.02 : 0;
      } catch { /* audio is best-effort */ }
    },
    blip(freq, dur = 0.12, type = 'square', gainValue = 0.05) {
      if (!ensure() || muted) return;
      note(freq, ctx.currentTime, dur, type, gainValue);
    },
    shot() { this.blip(180, 0.1, 'square', 0.09); },
    crash() { this.blip(70, 0.25, 'sawtooth', 0.1); },
    pickup() { this.blip(880, 0.12, 'sine', 0.07); this.blip(1320, 0.16, 'sine', 0.05); },
    missionDone() {
      this.blip(523, 0.14, 'triangle', 0.08);
      window.setTimeout(() => this.blip(659, 0.14, 'triangle', 0.08), 140);
      window.setTimeout(() => this.blip(784, 0.22, 'triangle', 0.08), 280);
    },
  };
}
