// src/utils/audioAnalysis.ts

// --- Interfaces ---
export interface AnalysisResult {
  version: string;
  source: { duration_sec: number; sr: number; mono: boolean; used_window_sec: number; };
  beat_grid: { bpm: number; bpm_confidence: number; beats_sec: number[]; downbeats_sec: number[]; time_signature: string; };
  key: { name: string; camelot: string; cents_off: number; confidence: number; method: string; chromagram: number[][]; };
  energy: number;
  brightness: number;
  rhythm: { pulse_clarity: number; rhythmic_complexity: number; };
  spectral_balance: { low_freq_content: number; mid_freq_content: number; high_freq_content: number; };
  roughness: { estimated_roughness: number; };
  diagnostics: { warnings: any[]; };
}

// --- API Communication ---

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = (reader.result as string)?.split(',')[1];
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Failed to read file as base64."));
      }
    };
    reader.onerror = error => reject(error);
  });
}

export async function analyzeFile(songId: string, file: File): Promise<AnalysisResult> {
  try {
    const audioData = await fileToBase64(file);
    const res = await fetch('/api/spectral-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId, audioData }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Analysis API Error (${res.status}): ${errorBody}`);
    }

    const data = await res.json();
    if (!data.success || !data.analysis?.spectralFeatures) {
      throw new Error('Analysis response is missing expected data.');
    }
    
    return data.analysis.spectralFeatures as AnalysisResult;
  } catch (e) {
    console.error("File analysis failed:", e);
    throw e; // Re-throw to be handled by the calling hook
  }
}

// --- Compatibility Scoring Logic ---

const DEFAULT_WEIGHTS = {
  harmonic: 0.4,
  rhythmic: 0.3,
  spectral: 0.2,
  energy: 0.1,
};

export interface CompatibilityWeights {
  harmonic: number;
  rhythmic: number;
  spectral: number;
  energy: number;
}

const CAMELOT_WHEEL: { [key: string]: number } = {
  '1A': 1, '1B': 1, '2A': 2, '2B': 2, '3A': 3, '3B': 3, '4A': 4, '4B': 4,
  '5A': 5, '5B': 5, '6A': 6, '6B': 6, '7A': 7, '7B': 7, '8A': 8, '8B': 8,
  '9A': 9, '9B': 9, '10A': 10, '10B': 10, '11A': 11, '11B': 11, '12A': 12, '12B': 12,
};

function getCamelotDistance(key1: string, key2: string): number {
  const num1 = CAMELOT_WHEEL[key1];
  const num2 = CAMELOT_WHEEL[key2];
  if (!num1 || !num2) return 6;
  const diff = Math.abs(num1 - num2);
  return Math.min(diff, 12 - diff);
}

function calculateHarmonicScore(key1: AnalysisResult['key'], key2: AnalysisResult['key']) {
  const reasons = [];
  const suggestions = [];
  let score = 0;

  if (key1.name === key2.name) {
    score = 100;
    reasons.push(`✅ Perfect harmonic match: Both songs are in ${key1.name}.`);
  } else {
    const camelotDist = getCamelotDistance(key1.camelot, key2.camelot);
    score = Math.max(0, 100 - camelotDist * 15);
    reasons.push(`Harmonic distance is ${camelotDist} step(s) on the Camelot wheel.`);
    if (camelotDist > 2) {
      suggestions.push(`For better harmony, try a song in ${key1.camelot} or a compatible key.`);
    }
  }
  
  const tuningDiff = Math.abs(key1.cents_off - key2.cents_off);
  if (tuningDiff > 15) {
    score -= 10;
    reasons.push(`⚠️ Tuning differs by ${tuningDiff.toFixed(0)} cents, which may require pitch correction.`);
  }

  return { score: Math.max(0, score), reasons, suggestions };
}

function calculateRhythmicScore(a1: AnalysisResult, a2: AnalysisResult) {
  const reasons = [];
  const suggestions = [];
  
  const bpmDiff = Math.abs(a1.beat_grid.bpm - a2.beat_grid.bpm);
  const bpmScore = Math.max(0, 100 - bpmDiff * 5 - Math.pow(bpmDiff, 2) * 0.1);
  reasons.push(`Tempo difference is ${bpmDiff.toFixed(1)} BPM.`);
  if (bpmDiff > 10) {
      suggestions.push(`The tempo difference is large. Consider extensive time-stretching or a transition section.`);
  }

  const clarityScore = ((a1.rhythm.pulse_clarity + a2.rhythm.pulse_clarity) / 2) * 100;
  reasons.push(`Average rhythmic clarity is ${clarityScore.toFixed(0)}%.`);

  const complexityDiff = Math.abs(a1.rhythm.rhythmic_complexity - a2.rhythm.rhythmic_complexity);
  const complexityScore = Math.max(0, 100 - complexityDiff * 20);
  
  const score = bpmScore * 0.6 + clarityScore * 0.3 + complexityScore * 0.1;
  return { score, reasons, suggestions };
}

function calculateSpectralScore(a1: AnalysisResult, a2: AnalysisResult) {
    const reasons = [];
    const suggestions = [];

    const balanceDiff = 
        Math.abs(a1.spectral_balance.low_freq_content - a2.spectral_balance.low_freq_content) +
        Math.abs(a1.spectral_balance.mid_freq_content - a2.spectral_balance.mid_freq_content) +
        Math.abs(a1.spectral_balance.high_freq_content - a2.spectral_balance.high_freq_content);
    const balanceScore = Math.max(0, 100 - balanceDiff * 50);
    reasons.push(`Spectral balance similarity is ${balanceScore.toFixed(0)}%.`);
    if (balanceScore < 70) {
        suggestions.push("Songs have very different frequency content; careful EQing will be required to avoid a muddy mix.");
    }

    const brightnessDiff = Math.abs(a1.brightness - a2.brightness);
    const brightnessScore = Math.max(0, 100 - brightnessDiff * 200);
    reasons.push(`Timbral brightness is ${brightnessScore < 80 ? 'somewhat different' : 'similar'}.`);
    
    const totalRoughness = a1.roughness.estimated_roughness + a2.roughness.estimated_roughness;
    const roughnessScore = Math.max(0, 100 - totalRoughness * 2);
    
    const score = balanceScore * 0.5 + brightnessScore * 0.3 + roughnessScore * 0.2;
    return { score, reasons, suggestions };
}

function calculateEnergyScore(energy1: number, energy2: number) {
    const diff = Math.abs(energy1 - energy2);
    const score = Math.max(0, 100 - diff * 150);
    const reasons = [`Energy levels are ${diff < 0.2 ? 'very similar' : diff < 0.4 ? 'moderately different' : 'very different'}.`];
    const suggestions = diff > 0.4 ? ["Bridge different energy levels with build-ups or breakdowns."] : [];
    return { score, reasons, suggestions };
}


export function computeCompatibility(
  analyses: AnalysisResult[],
  weights: CompatibilityWeights = DEFAULT_WEIGHTS
) {
  if (analyses.length < 2) {
    return { score: 0, reasons: ["Need at least 2 songs"], suggestions: [] };
  }
  const [a1, a2] = analyses;

  const harmonic = calculateHarmonicScore(a1.key, a2.key);
  const rhythmic = calculateRhythmicScore(a1, a2);
  const spectral = calculateSpectralScore(a1, a2);
  const energy = calculateEnergyScore(a1.energy, a2.energy);

  const totalScore = 
    harmonic.score * weights.harmonic +
    rhythmic.score * weights.rhythmic +
    spectral.score * weights.spectral +
    energy.score * weights.energy;

  const reasons = [
    ...harmonic.reasons,
    ...rhythmic.reasons,
    ...spectral.reasons,
    ...energy.reasons,
  ];
  
  const suggestions = [
    ...harmonic.suggestions,
    ...rhythmic.suggestions,
    ...spectral.suggestions,
    ...energy.suggestions,
  ];

  return {
    score: Math.round(totalScore),
    reasons,
    suggestions,
  };
}
