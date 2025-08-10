export interface AudioFeatures {
  tempo?: number; // BPM
  energy?: number; // 0..1
  danceability?: number; // 0..1
  valence?: number; // 0..1 (positivity)
  genre?: string;
  speechiness?: number; // 0..1
  acousticness?: number; // 0..1
}

export interface AudioAnalysisResult {
  features: AudioFeatures;
}

// Lightweight client-side analyzer to get the app running.
// Uses simple time-domain statistics; no heavy DSP or external deps.
async function analyzeFile(file: File): Promise<AudioAnalysisResult> {
  try {
    // Browser-only guard
    if (typeof window === 'undefined' ||
        (typeof (window as any).AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined')) {
      return basicFallback();
    }

    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();

    // decodeAudioData can be promise-based in modern browsers
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      // Safari quirk: must pass a copy of the buffer
      const buf = arrayBuffer.slice(0);
      audioCtx.decodeAudioData(buf, resolve, reject);
    });

    const channelData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;

    const energy = clamp01(rms(channelData));
    const zcrVal = zeroCrossingRate(channelData);

    // Extremely naïve tempo estimation heuristic
    const tempo = Math.round(estimateTempoFromZCR(zcrVal, duration));

    // Heuristic feature mapping
    const danceability = clamp01(0.4 + (energy - 0.3) * 0.6);
    const valence = clamp01(0.5 + (0.5 - Math.abs(zcrVal - 0.1)) * 0.8);
    const speechiness = clamp01(zcrVal * 1.2);
    const acousticness = clamp01(0.8 - energy * 0.7);
    const genre = pickGenre({ energy, danceability, valence, speechiness, acousticness, tempo });

    // Best-effort cleanup
    try { audioCtx.close(); } catch {}

    return {
      features: {
        tempo,
        energy,
        danceability,
        valence,
        genre,
        speechiness,
        acousticness,
      },
    };
  } catch (e) {
    console.warn('audioAnalyzer.analyzeFile fallback due to error:', e);
    return basicFallback();
  }
}

function basicFallback(): AudioAnalysisResult {
  return {
    features: {
      tempo: 120,
      energy: 0.5,
      danceability: 0.5,
      valence: 0.5,
      genre: 'Unknown',
      speechiness: 0.1,
      acousticness: 0.3,
    },
  };
}

function rms(data: Float32Array): number {
  let sum = 0;
  const len = data.length;
  for (let i = 0; i < len; i += 1024) {
    const v = data[i];
    sum += v * v;
  }
  const avg = sum / Math.ceil(len / 1024);
  return Math.sqrt(avg);
}

function zeroCrossingRate(data: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < data.length; i += 512) {
    const prev = data[i - 1];
    const curr = data[i];
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) crossings++;
  }
  const frames = Math.ceil(data.length / 512);
  return crossings / Math.max(frames, 1);
}

function estimateTempoFromZCR(zcr: number, durationSec: number): number {
  // Map ZCR heuristically to a plausible BPM range 80..170
  const base = 80 + clamp01(zcr * 2) * 90;
  // Adjust by track duration (short tracks skew slightly higher)
  const durationFactor = clamp01(180 / Math.max(durationSec, 1)) * 10; // up to +10
  const bpm = base + durationFactor;
  return clamp(bpm, 80, 170);
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

function pickGenre(f: Omit<Required<AudioFeatures>, 'genre'> & { tempo: number }): string {
  if (f.energy > 0.75 && f.tempo >= 120) return 'EDM';
  if (f.energy > 0.6 && f.danceability > 0.6) return 'Pop';
  if (f.acousticness > 0.6 && f.energy < 0.5) return 'Acoustic';
  if (f.speechiness > 0.5) return 'Hip-Hop';
  if (f.valence < 0.35 && f.energy > 0.5) return 'Rock';
  return 'Electronic';
}

export async function analyzeCompatibility(analyses: AudioAnalysisResult[]): Promise<{
  score: number;
  reasons: string[];
  suggestions: string[];
}> {
  if (!analyses.length) return { score: 0, reasons: ['No analyses provided'], suggestions: [] };

  const tempos = analyses.map(a => a.features.tempo ?? 120);
  const energies = analyses.map(a => a.features.energy ?? 0.5);

  const maxTempoDiff = Math.max(...tempos) - Math.min(...tempos);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const energySpread = Math.max(...energies) - Math.min(...energies);

  // Scoring: prioritize closer tempos and balanced energy
  const tempoScore = clamp01(1 - maxTempoDiff / 60); // 0 diff -> 1, 60 diff -> 0
  const energyScore = clamp01(1 - energySpread);
  const composite = Math.round((0.6 * tempoScore + 0.4 * energyScore) * 100);

  const reasons: string[] = [];
  if (maxTempoDiff < 8) reasons.push('Tempos closely aligned');
  else if (maxTempoDiff < 16) reasons.push('Tempos moderately aligned');
  else reasons.push('Significant tempo difference');

  if (energySpread < 0.2) reasons.push('Energy levels well balanced');
  else if (energySpread < 0.4) reasons.push('Energy levels somewhat balanced');
  else reasons.push('Energy levels vary widely');

  const suggestions: string[] = [];
  if (maxTempoDiff >= 8) suggestions.push('Time-stretch one track to match BPM');
  if (energySpread >= 0.3) suggestions.push('Use compression/automation to balance energy');
  if (avgEnergy < 0.5) suggestions.push('Add percussive layers to lift energy');

  return { score: composite, reasons, suggestions };
}

export const audioAnalyzer = {
  analyzeFile,
  analyzeCompatibility,
};
