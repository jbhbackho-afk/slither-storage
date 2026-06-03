class AudioManager {
  constructor() {
    this.ctx = null;
    this.boostOsc = null;
    this.boostGain = null;
    this.boostFilter = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playEat() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.08);
  }

  startBoost() {
    this.init();
    if (!this.ctx || this.boostOsc) return;
    
    const now = this.ctx.currentTime;
    this.boostOsc = this.ctx.createOscillator();
    this.boostGain = this.ctx.createGain();
    this.boostFilter = this.ctx.createBiquadFilter();
    
    this.boostOsc.type = 'sawtooth';
    this.boostOsc.frequency.setValueAtTime(55, now); // Low hum
    
    this.boostFilter.type = 'lowpass';
    this.boostFilter.frequency.setValueAtTime(120, now);
    
    this.boostGain.gain.setValueAtTime(0.0, now);
    this.boostGain.gain.linearRampToValueAtTime(0.06, now + 0.1);
    
    this.boostOsc.connect(this.boostFilter);
    this.boostFilter.connect(this.boostGain);
    this.boostGain.connect(this.ctx.destination);
    
    this.boostOsc.start(now);
  }

  stopBoost() {
    if (!this.ctx || !this.boostOsc) return;
    
    const now = this.ctx.currentTime;
    try {
      this.boostGain.gain.cancelScheduledValues(now);
      this.boostGain.gain.setValueAtTime(this.boostGain.gain.value, now);
      this.boostGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      const osc = this.boostOsc;
      this.boostOsc = null;
      
      setTimeout(() => {
        try {
          osc.stop();
        } catch (e) {}
      }, 100);
    } catch (e) {
      this.boostOsc = null;
    }
  }

  playDeath() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Create noise for explosion
    const bufferSize = this.ctx.sampleRate * 0.35;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1000, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 0.35);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start(now);
    
    // Heavy sub drop synth
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
    
    subGain.gain.setValueAtTime(0.35, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    
    subOsc.start(now);
    subOsc.stop(now + 0.3);
  }

  playClick() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playPowerUp() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.22);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playShieldBreak() {
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(280, now);
    osc1.frequency.linearRampToValueAtTime(70, now + 0.15);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(140, now);
    osc2.frequency.linearRampToValueAtTime(35, now + 0.22);
    gain2.gain.setValueAtTime(0.2, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.15);
    osc2.start(now);
    osc2.stop(now + 0.22);
  }
}

const audioManager = new AudioManager();
export default audioManager;
