/**
 * Horror audio synthesised live with the Web Audio API.
 *
 * The whole soundscape is procedural — no asset loading. The constructor is
 * cheap; the AudioContext itself is created lazily on the first user gesture
 * because most browsers refuse to start audio before that.
 */
export class HorrorAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneOscA: OscillatorNode | null = null;
  private droneOscB: OscillatorNode | null = null;
  private droneStarted = false;

  private destroyed = false;

  private ensureContext(): AudioContext | null {
    if (this.destroyed) return null;
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  /** Resume the underlying context after the user has interacted with the page. */
  resume() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  /** Spin up the looping ambient drone. Idempotent. */
  startDrone() {
    if (this.droneStarted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const oscA = ctx.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = 55;
    oscA.detune.value = -8;

    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.value = 82.5;
    oscB.detune.value = 12;

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    oscA.start();
    oscB.start();

    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);

    this.droneFilter = filter;
    this.droneGain = gain;
    this.droneOscA = oscA;
    this.droneOscB = oscB;
    this.droneStarted = true;
  }

  /**
   * Update drone tension in response to ghost proximity.
   *
   * @param p — 0 (calm) … 1 (very close)
   */
  setProximity(p: number) {
    if (!this.ctx || !this.droneGain || !this.droneFilter || !this.droneOscA || !this.droneOscB) {
      return;
    }
    const t = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, p));
    const targetGain = 0.16 + clamped * 0.34;
    const targetCutoff = 220 + clamped * 760;
    const detuneOffset = clamped * 130;
    this.droneGain.gain.linearRampToValueAtTime(targetGain, t + 0.12);
    this.droneFilter.frequency.linearRampToValueAtTime(targetCutoff, t + 0.18);
    this.droneOscA.detune.linearRampToValueAtTime(-8 + detuneOffset, t + 0.18);
    this.droneOscB.detune.linearRampToValueAtTime(12 + detuneOffset, t + 0.18);
  }

  /** Soft chime when picking up a key. */
  playKey() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const tones = [880, 1320];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const t0 = t + i * 0.06;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.09, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });
  }

  /** Short bright sweep when an exorcism connects. */
  playExorcism() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    // Triangle sweep up, plus a bell-ish overtone.
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.linearRampToValueAtTime(1760, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.36, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.75);

    const bell = ctx.createOscillator();
    bell.type = "sine";
    bell.frequency.setValueAtTime(2640, t);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.18, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    bell.connect(bg);
    bg.connect(this.master);
    bell.start(t);
    bell.stop(t + 0.6);
  }

  /** A single off-key piano note — used when the music room comes alive. */
  playPianoNote(noteIndex: number = -1) {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    // A minor scale notes (Hz)
    const scale = [220, 247, 261.63, 293.66, 329.63, 349.23, 415.3];
    const idx = noteIndex >= 0 ? noteIndex % scale.length : Math.floor(Math.random() * scale.length);
    const freq = scale[idx];

    const fundamental = ctx.createOscillator();
    fundamental.type = "triangle";
    fundamental.frequency.value = freq;
    const overtone = ctx.createOscillator();
    overtone.type = "sine";
    overtone.frequency.value = freq * 2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.08, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);

    fundamental.connect(g);
    overtone.connect(og);
    g.connect(this.master);
    og.connect(this.master);

    fundamental.start(t);
    fundamental.stop(t + 1.7);
    overtone.start(t);
    overtone.stop(t + 1.1);
  }

  /** Low rumble — useful as a thunder/bell tone when 23:00 hits. */
  playMidnightChime() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.9);
  }

  /** Soft thud, used when the vanished ghost is moving. */
  playFootstep() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** Short scare hit for the moment the ghost first locks on. */
  playStinger() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  /** High shrieking sweep + noise burst when she catches the player. */
  playGameOver() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1700, t);
    osc.frequency.exponentialRampToValueAtTime(2600, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.42, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.4);

    this.playNoiseBurst(0.32, 0.45);
  }

  private playNoiseBurst(volume: number, duration: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  destroy() {
    this.destroyed = true;
    try {
      this.droneOscA?.stop();
      this.droneOscB?.stop();
    } catch {
      // already stopped
    }
    this.droneOscA?.disconnect();
    this.droneOscB?.disconnect();
    this.droneFilter?.disconnect();
    this.droneGain?.disconnect();
    this.master?.disconnect();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.droneOscA = null;
    this.droneOscB = null;
    this.droneFilter = null;
    this.droneGain = null;
    this.droneStarted = false;
  }
}
