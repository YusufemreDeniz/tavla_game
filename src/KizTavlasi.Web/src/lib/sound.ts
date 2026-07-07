/**
 * Web Audio API ile sentezlenen basit, telifsiz ses efektleri.
 * Tarayıcı autoplay kısıtlaması nedeniyle context ilk kullanıcı
 * etkileşiminde oluşturulur.
 */
let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  return audioContext;
}

function playTone(frequency: number, durationMs: number, type: OscillatorType, volume: number, delayMs = 0): void {
  const ctx = getContext();
  if (!ctx) return;

  const start = ctx.currentTime + delayMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + durationMs / 1000);
}

export function playDiceSound(): void {
  // Kısa takırtı: iki hızlı vuruş.
  playTone(180, 60, 'square', 0.12);
  playTone(140, 80, 'square', 0.1, 70);
  playTone(200, 50, 'square', 0.08, 150);
}

export function playPieceSound(): void {
  playTone(520, 90, 'sine', 0.12);
}

export function playCollectSound(): void {
  playTone(660, 100, 'sine', 0.12);
  playTone(880, 140, 'sine', 0.1, 90);
}

export function playWinSound(): void {
  playTone(523, 150, 'sine', 0.14);
  playTone(659, 150, 'sine', 0.14, 140);
  playTone(784, 250, 'sine', 0.16, 280);
}

export function playLoseSound(): void {
  playTone(330, 200, 'sine', 0.12);
  playTone(262, 300, 'sine', 0.1, 180);
}
