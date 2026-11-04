/**
 * Web Audio API ile sentezlenen telifsiz, doğal tavla ses efektleri.
 * Tarayıcı autoplay kısıtlaması nedeniyle context ilk kullanıcı
 * etkileşiminde oluşturulur.
 *
 * Tını: ceviz masada kemik zar ve ahşap pul. Saf osilatör "bip"leri yerine
 * filtrelenmiş gürültü (vuruş/temas) + hızla düşen perdeli sinüs (gövde
 * rezonansı) katmanlanır; tüm sesler yumuşak bir kompresörden geçer.
 */
let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!audioContext) {
    audioContext = new AudioContext();
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(compressor).connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  return audioContext;
}

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Seste doğal his için küçük rastgele sapma (oyun mantığıyla ilgisi yoktur). */
function jitter(value: number, amount: number): number {
  return value * (1 + (Math.random() * 2 - 1) * amount);
}

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  type?: OscillatorType;
  volume: number;
  delayMs?: number;
  attackMs?: number;
  decayMs: number;
  /** Opsiyonel alçak geçiren filtre: sert harmonikleri yumuşatır. */
  lowpassHz?: number;
  /** Filtre zarfı: lowpass bu frekanstan lowpassHz'e iner (pirinç nefesi). */
  lowpassFromHz?: number;
}

function tone({
  frequency,
  endFrequency,
  type = 'sine',
  volume,
  delayMs = 0,
  attackMs = 4,
  decayMs,
  lowpassHz,
  lowpassFromHz,
}: ToneOptions): void {
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + delayMs / 1000;
  const peak = start + attackMs / 1000;
  const end = peak + decayMs / 1000;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, end);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, peak);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  let node: AudioNode = osc;
  if (lowpassHz !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(lowpassFromHz ?? lowpassHz, start);
    if (lowpassFromHz !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(lowpassHz, end);
    }
    node = osc.connect(filter);
  }

  node.connect(gain).connect(masterGain);
  osc.start(start);
  osc.stop(end + 0.02);
}

interface NoiseOptions {
  volume: number;
  delayMs?: number;
  durationMs: number;
  filter: BiquadFilterType;
  frequency: number;
  q?: number;
}

function noise({ volume, delayMs = 0, durationMs, filter, frequency, q = 1 }: NoiseOptions): void {
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const start = ctx.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;

  const source = ctx.createBufferSource();
  source.buffer = getNoise(ctx);
  // Her vuruş tamponun farklı bir yerinden başlar; aynı "hışırtı" tekrarlanmaz.
  const offset = Math.random() * 0.5;

  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = frequency;
  biquad.Q.value = q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  source.connect(biquad).connect(gain).connect(masterGain);
  source.start(start, offset, durationMs / 1000 + 0.02);
}

/** Ahşap gövde vuruşu: perdesi hızla düşen sinüs + üst kısmi + temas tıkı. */
function woodKnock(delayMs: number, pitch: number, volume: number): void {
  tone({ frequency: pitch, endFrequency: pitch * 0.62, volume, delayMs, attackMs: 2, decayMs: 95 });
  tone({
    frequency: pitch * 2.76,
    endFrequency: pitch * 2.3,
    type: 'triangle',
    volume: volume * 0.32,
    delayMs,
    attackMs: 1,
    decayMs: 40,
    lowpassHz: 2400,
  });
  noise({ volume: volume * 0.55, delayMs, durationMs: 22, filter: 'bandpass', frequency: 1700, q: 1.4 });
}

/** Kemik zarın ahşaba çarpması: parlak tık + kısa gövde tınısı. */
function boneClack(delayMs: number, volume: number): void {
  noise({
    volume,
    delayMs,
    durationMs: 16,
    filter: 'bandpass',
    frequency: jitter(3400, 0.15),
    q: 2.5,
  });
  tone({
    frequency: jitter(900, 0.1),
    endFrequency: 620,
    type: 'triangle',
    volume: volume * 0.35,
    delayMs,
    attackMs: 1,
    decayMs: 30,
  });
  woodKnock(delayMs, jitter(210, 0.08), volume * 0.5);
}

export function playDiceSound(): void {
  // İki zar masaya düşer ve giderek sıklaşan, sönümlenen sekmelerle durur.
  const bounces = [0, 115, 195, 250, 290, 318];
  bounces.forEach((t, i) => {
    const volume = 0.22 * Math.pow(0.68, i);
    boneClack(jitter(t, 0.06), volume);
    if (i < 4) boneClack(jitter(t + 38, 0.12), volume * 0.8);
  });
  // Zarların yuvarlanırken çıkardığı hafif hışırtı.
  noise({ volume: 0.035, durationMs: 330, filter: 'bandpass', frequency: 2200, q: 0.6 });
}

/** Sıcak akor: hafif tıngırdatılmış üçgen dalgalar, yumuşak filtreyle. */
function warmChord(frequencies: number[], delayMs: number, volume: number, decayMs: number): void {
  frequencies.forEach((frequency, i) => {
    const noteDelay = delayMs + i * 28;
    tone({ frequency, type: 'triangle', volume, delayMs: noteDelay, attackMs: 12, decayMs, lowpassHz: 2200 });
    tone({ frequency: frequency * 2, volume: volume * 0.18, delayMs: noteDelay, attackMs: 8, decayMs: decayMs * 0.6 });
  });
}

export function playDoubleSound(): void {
  // Zar sekmesi + zarlar oturunca sıcak Re majör akoru.
  playDiceSound();
  warmChord([293.66, 369.99, 440, 587.33], 260, 0.085, 900);
}

export function playPieceSound(): void {
  // Ceviz pulun tahtaya tok oturuşu: alçak gövde + kısa temas.
  woodKnock(0, jitter(150, 0.05), 0.3);
  noise({ volume: 0.05, durationMs: 60, filter: 'lowpass', frequency: 700 });
}

export function playCollectSound(): void {
  // Pul kenar tepsisine bırakılır: daha ince vuruş + yumuşak çan tınısı.
  woodKnock(0, jitter(240, 0.05), 0.22);
  tone({ frequency: 1046.5, volume: 0.05, delayMs: 40, attackMs: 6, decayMs: 420 });
  tone({ frequency: 1567.98, volume: 0.03, delayMs: 70, attackMs: 6, decayMs: 360 });
}

export function playWinSound(): void {
  // Zafer arpeji (Do - Mi - Sol - İnce Do), sıcak üçgen tınıyla.
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
    tone({
      frequency,
      type: 'triangle',
      volume: 0.12,
      delayMs: i * 120,
      attackMs: 10,
      decayMs: i === 3 ? 520 : 220,
      lowpassHz: 3000,
    });
  });
  warmChord([523.25, 659.25, 783.99], 480, 0.05, 900);
}

export function playLoseSound(): void {
  tone({ frequency: 349.23, type: 'triangle', volume: 0.1, attackMs: 14, decayMs: 260, lowpassHz: 1400 });
  tone({
    frequency: 261.63,
    endFrequency: 246.94,
    type: 'triangle',
    volume: 0.09,
    delayMs: 210,
    attackMs: 14,
    decayMs: 480,
    lowpassHz: 1200,
  });
}

/** Pirinç nefesli çalgı benzeri nota: testere dişi + kapanan filtre. */
function brass(frequency: number, delayMs: number, decayMs: number, volume: number): void {
  tone({
    frequency,
    type: 'sawtooth',
    volume,
    delayMs,
    attackMs: 30,
    decayMs,
    lowpassFromHz: 3200,
    lowpassHz: 700,
  });
  tone({
    frequency: frequency / 2,
    type: 'triangle',
    volume: volume * 0.5,
    delayMs,
    attackMs: 30,
    decayMs,
    lowpassHz: 900,
  });
}

export function playMarsFanfare(): void {
  // MARS kutlaması: Sol-Sol-Do tantanası, timpani gümbürtüsü ve parlak final akoru.
  tone({ frequency: 98, endFrequency: 70, volume: 0.28, attackMs: 3, decayMs: 600 });
  noise({ volume: 0.08, durationMs: 220, filter: 'lowpass', frequency: 400 });
  brass(392, 0, 140, 0.07);
  brass(392, 170, 140, 0.07);
  brass(523.25, 340, 520, 0.08);
  tone({ frequency: 130.81, endFrequency: 98, volume: 0.24, delayMs: 340, attackMs: 3, decayMs: 700 });
  [523.25, 659.25, 783.99].forEach((frequency, i) => brass(frequency, 900 + i * 18, 900, 0.055));
  tone({ frequency: 1567.98, volume: 0.04, delayMs: 920, attackMs: 10, decayMs: 1100 });
}

export function playTickSound(urgent = false): void {
  // Tahta blok tıkırtısı (süre uyarısı).
  woodKnock(0, urgent ? 520 : 420, urgent ? 0.16 : 0.1);
}
