/**
 * Web Audio API ile sentezlenen telifsiz, doğal tavla ses efektleri.
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

function playTone(
  frequency: number,
  durationMs: number,
  type: OscillatorType,
  volume: number,
  delayMs = 0,
  endFrequency?: number,
): void {
  const ctx = getContext();
  if (!ctx) return;

  const start = ctx.currentTime + delayMs / 1000;
  const durationSec = durationMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + durationSec);
  }

  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + durationSec);
}

export function playDiceSound(): void {
  // Ahşap zemin üzerinde kemik zar tıkırtısı: üç ardışık sekme.
  playTone(240, 48, 'triangle', 0.14, 0, 150);
  playTone(195, 55, 'square', 0.1, 60, 130);
  playTone(280, 45, 'triangle', 0.11, 130, 170);
}

export function playDoubleSound(): void {
  // Çift zar geldiğinde zar tıkırtısı + altın akor tınısı.
  playDiceSound();
  playTone(587.33, 120, 'sine', 0.11, 160);
  playTone(880, 180, 'sine', 0.12, 240);
}

export function playPieceSound(): void {
  // Ahşap pulun tahtaya tok vuruşu.
  playTone(420, 75, 'sine', 0.15, 0, 210);
  playTone(180, 50, 'triangle', 0.1, 10, 110);
}

export function playCollectSound(): void {
  // Pul toplama: yükselen çift nota.
  playTone(587.33, 85, 'sine', 0.13, 0);
  playTone(880, 130, 'sine', 0.13, 75);
}

export function playWinSound(): void {
  // Zafer arpeji (Do - Mi - Sol - İnce Do).
  playTone(523.25, 130, 'sine', 0.14, 0);
  playTone(659.25, 130, 'sine', 0.14, 120);
  playTone(783.99, 150, 'sine', 0.15, 240);
  playTone(1046.5, 280, 'sine', 0.16, 370);
}

export function playLoseSound(): void {
  playTone(349.23, 180, 'sine', 0.12, 0);
  playTone(261.63, 280, 'sine', 0.1, 170);
}
