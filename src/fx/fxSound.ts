import type { FxSettings, FxType } from './fxSettings';

type SoundName = keyof FxSettings['sound']['types'];

class FxSoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = 0;
  private droneStops: Array<() => void> = [];

  async unlock(volume: number) {
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return false;
      if (!this.context) { this.context = new AudioCtor(); this.master = this.context.createGain(); this.master.gain.value = 0; this.master.connect(this.context.destination); }
      if (this.context.state === 'suspended') await this.context.resume();
      const now = this.context.currentTime;
      const target = Math.min(0.35, Math.max(0, volume / 100 * 0.35));
      this.master!.gain.cancelScheduledValues(now); this.master!.gain.setValueAtTime(this.master!.gain.value, now); this.master!.gain.linearRampToValueAtTime(target, now + 0.15);
      return true;
    } catch {
      return false;
    }
  }

  private async ensure(volume: number) {
    if (!this.context || !this.master) return false;
    if (this.context.state === 'suspended') return false;
    const now = this.context.currentTime;
    const target = Math.min(0.35, Math.max(0, volume / 100 * 0.35));
    this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(this.master.gain.value, now); this.master.gain.linearRampToValueAtTime(target, now + 0.15);
    return true;
  }

  private tone(frequency: number, duration: number, gain = 0.35, delay = 0) {
    if (!this.context || !this.master || this.active >= 3) return;
    this.active += 1;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator(); const envelope = this.context.createGain();
    oscillator.frequency.value = frequency; oscillator.type = 'sine'; envelope.gain.setValueAtTime(0.0001, start); envelope.gain.exponentialRampToValueAtTime(gain, start + 0.025); envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(this.master); oscillator.start(start); oscillator.stop(start + duration + 0.03);
    oscillator.addEventListener('ended', () => { this.active = Math.max(0, this.active - 1); }, { once: true });
  }

  private noise(duration: number) {
    if (!this.context || !this.master || this.active >= 3) return;
    this.active += 1;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(); const filter = this.context.createBiquadFilter(); const gain = this.context.createGain(); const now = this.context.currentTime;
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(180, now); filter.frequency.exponentialRampToValueAtTime(1800, now + duration); gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(0.18, now + duration * 0.45); gain.gain.linearRampToValueAtTime(0.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(); source.addEventListener('ended', () => { this.active = Math.max(0, this.active - 1); }, { once: true });
  }

  async play(name: SoundName, volume: number) {
    if (!await this.ensure(volume)) return;
    if (name === 'heartbeat') { this.tone(60, 0.18, 0.32); this.tone(50, 0.22, 0.28, 0.24); }
    else if (name === 'impact') this.tone(48, 0.65, 0.45);
    else if (name === 'whoosh') this.noise(0.75);
    else if (name === 'drone') this.startDrone();
  }

  async playForEffect(type: FxType, settings: FxSettings) {
    const names: SoundName[] = type === 'horror' ? ['heartbeat', 'drone'] : type === 'explosion' ? ['impact'] : ['whoosh', 'impact'];
    for (const name of names) if (settings.sound.types[name]) await this.play(name, settings.sound.volume);
  }

  private startDrone() {
    if (!this.context || !this.master || this.droneStops.length || this.active >= 3) return;
    this.active += 1;
    const gain = this.context.createGain(); const filter = this.context.createBiquadFilter(); const lfo = this.context.createOscillator(); const lfoGain = this.context.createGain();
    gain.gain.value = 0.08; filter.type = 'lowpass'; filter.frequency.value = 220; lfo.frequency.value = 0.12; lfoGain.gain.value = 35; lfo.connect(lfoGain); lfoGain.connect(filter.frequency); gain.connect(filter); filter.connect(this.master);
    const oscillators = [52, 52.7].map((frequency) => { const oscillator = this.context!.createOscillator(); oscillator.frequency.value = frequency; oscillator.type = 'sine'; oscillator.connect(gain); oscillator.start(); return oscillator; });
    lfo.start(); this.droneStops = [() => { oscillators.forEach((oscillator) => oscillator.stop()); lfo.stop(); gain.disconnect(); filter.disconnect(); this.droneStops = []; this.active = Math.max(0, this.active - 1); }];
  }

  stopAll() {
    this.droneStops.splice(0).forEach((stop) => { try { stop(); } catch { /* already stopped */ } });
    if (this.context && this.master) {
      const context = this.context; const now = context.currentTime;
      this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(this.master.gain.value, now); this.master.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      window.setTimeout(() => { if (context.state === 'running') void context.suspend().catch(() => undefined); }, 180);
    }
  }
}

export const fxSound = new FxSoundEngine();
