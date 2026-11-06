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

/** Kısa, filtrelenmiş gürültü darbesi: ahşap/kemik teması saf tondan değil gürültüden doğar. */
function knock(o: {
  type: BiquadFilterType;
  hz: number;
  ms: number;
  volume: number;
  q?: number;
  delayMs?: number;
}): void {
  noise({
    volume: o.volume,
    delayMs: o.delayMs ?? 0,
    durationMs: o.ms,
    filter: o.type,
    frequency: o.hz,
    q: o.q ?? 0.8,
  });
}

/** Pulun ahşap tahtaya oturması: tok, kısa "tak" (alçak geçiren ~1.8 kHz, ~40 ms) + hafif gövde. */
function woodSeat(delayMs: number, volume: number): void {
  knock({ type: 'lowpass', hz: jitter(1800, 0.1), q: 0.7, ms: 42, volume, delayMs });
  knock({ type: 'lowpass', hz: 480, q: 0.6, ms: 70, volume: volume * 0.7, delayMs });
}

/** Kemik zarın ahşaba çarpması: parlak "tık". strength azaldıkça (sekmeler) kısalır ve sessizleşir. */
function boneClack(delayMs: number, volume: number, strength = 1): void {
  const ms = 8 + 12 * strength;
  knock({ type: 'bandpass', hz: jitter(3300, 0.12), q: 2.4, ms, volume, delayMs });
  knock({ type: 'highpass', hz: 5200, q: 0.7, ms: ms * 0.6, volume: volume * 0.35, delayMs });
  knock({ type: 'lowpass', hz: 900, q: 0.7, ms: 22, volume: volume * 0.3 * strength, delayMs });
}

/** Sıcak akor: hafif tıngırdatılmış üçgen dalgalar, yumuşak filtreyle. */
function warmChord(frequencies: number[], delayMs: number, volume: number, decayMs: number): void {
  frequencies.forEach((frequency, i) => {
    const noteDelay = delayMs + i * 28;
    tone({ frequency, type: 'triangle', volume, delayMs: noteDelay, attackMs: 12, decayMs, lowpassHz: 2200 });
    tone({ frequency: frequency * 2, volume: volume * 0.18, delayMs: noteDelay, attackMs: 8, decayMs: decayMs * 0.6 });
  });
}

/**
 * Zarın masaya tek bir değmesi. Atış animasyonu her sekmede çağırır: strength 1 ilk (sert) değme,
 * sonraki sekmeler giderek hafifler ve kısalır; ses böylece zarın görünen hareketiyle eşzamanlı kalır.
 */
export function playDiceImpact(strength = 1): void {
  boneClack(0, 0.2 * (0.25 + 0.75 * strength), strength);
}

/** Çift zar yerine oturunca duyulan sıcak akor (zar sekmeleri ayrıca çalar). */
export function playDoubleChord(): void {
  warmChord([293.66, 369.99, 440, 587.33], 0, 0.085, 900);
}

export function playPieceSound(): void {
  woodSeat(0, jitter(0.5, 0.08));
}

/**
 * Toplama: pul tepsiye iner ve rayda diğer pullara çarpar. Raydaki pul sayısı arttıkça
 * çarpışma "tıkırtısı" uzar (en fazla 4 küçük çarpma).
 */
export function playCollectSound(stackSize = 0): void {
  knock({ type: 'lowpass', hz: jitter(2200, 0.08), q: 0.7, ms: 34, volume: 0.4 });
  knock({ type: 'lowpass', hz: 700, q: 0.6, ms: 55, volume: 0.25 });
  const hits = Math.min(4, 1 + Math.floor(stackSize / 4));
  for (let i = 1; i <= hits; i += 1) {
    knock({
      type: 'bandpass',
      hz: jitter(2600, 0.15),
      q: 3,
      ms: 7,
      volume: 0.18 / i,
      delayMs: 13 * i + Math.random() * 6,
    });
  }
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
  knock({ type: 'bandpass', hz: urgent ? 1700 : 1300, q: 2, ms: 22, volume: urgent ? 0.16 : 0.1 });
}
