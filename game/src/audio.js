// All sound is synthesised with WebAudio: an engine hum that follows the throttle,
// wind noise, a chime for rings, a thud for storm hits, an alarm at low fuel and a
// short fanfare when a sortie ends. No audio files, no network. The context is
// created on the first user gesture, so browsers allow it.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned sawtooth oscillators through a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55 * 1.007;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass filter.
      const length = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from any user gesture (start, key press) so sound is allowed. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Continuous engine + wind, driven every frame by throttle and speed. */
    setFlight(throttle, speedKnots, active) {
      if (!ctx || !started) return;
      const target = active && !muted ? 0.05 + throttle * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const freq = 48 + throttle * 55 + speedKnots * 0.08;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(active && !muted ? 0.015 + (speedKnots / 230) * 0.05 : 0, ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speedKnots * 4, ctx.currentTime, 0.2);
    },
    ring(perfect) {
      tone(880, 0.18, 'sine', 0.25);
      tone(1318, 0.3, 'sine', 0.22, 0.07);
      if (perfect) tone(1760, 0.35, 'sine', 0.2, 0.14);
    },
    crate() {
      tone(659, 0.12, 'triangle', 0.22);
      tone(988, 0.2, 'triangle', 0.2, 0.06);
    },
    fuel() {
      tone(523, 0.15, 'sine', 0.22);
      tone(784, 0.25, 'sine', 0.2, 0.08);
    },
    hit() {
      tone(160, 0.3, 'square', 0.3, 0, 60);
      tone(90, 0.4, 'sawtooth', 0.25, 0.02, 40);
    },
    alarm() {
      tone(1046, 0.12, 'square', 0.12);
      tone(1046, 0.12, 'square', 0.12, 0.18);
    },
    crash() {
      tone(220, 0.9, 'sawtooth', 0.3, 0, 30);
      tone(110, 1.1, 'square', 0.25, 0.05, 28);
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, i * 0.11));
    },
    victory() {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.22, i * 0.12));
    },
    click() {
      tone(700, 0.06, 'sine', 0.15);
    },
  };
}
