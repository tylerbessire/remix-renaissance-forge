// src/utils/audioAnalysis.ts

// Helper to clamp a value between 0 and 1
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface TrackFeatures {
  tempo: number;
  key: string;
  energy: number;
  brightness: number;
  mood?: string;
}

export interface AnalysisResult {
  features: TrackFeatures;
}

// Improved analysis: uploads files to /api/spectral-analysis and computes features
export async function analyzeFile(file: File): Promise<AnalysisResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    // NOTE: This assumes the dev server proxies /api to the functions server.
    // This is a common setup but might need configuration in vite.config.ts.
    const res = await fetch('/api/spectral-analysis', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`analysis failed: ${res.statusText}`);
    const data = await res.json();
    return {
      features: {
        tempo: Math.round(data.tempo ?? 120),
        key: data.key ?? 'Unknown',
        energy: clamp01(data.energy ?? 0.5),
        brightness: clamp01(data.brightness ?? 0.5),
        mood: data.mood,
      },
    };
  } catch (e) {
    console.error("Analysis failed, using fallback.", e);
    // Fallback if analysis fails
    return { features: { tempo: 120, key: 'Unknown', energy: 0.5, brightness: 0.5 } };
  }
}

// Compute mashability using tempo, key and energy
// This is a simplified version as the full logic was not provided.
export async function computeCompatibility(analyses: AnalysisResult[]) {
  if (analyses.length < 2) {
    return { score: 0, reasons: ["Need at least 2 songs"], suggestions: [] };
  }

  // Placeholder logic: score based on tempo difference
  const tempos = analyses.map(a => a.features.tempo);
  const tempoDiff = Math.abs(tempos[0] - tempos[1]);
  const tempoScore = Math.max(0, 100 - tempoDiff * 5);

  return {
    score: Math.round(tempoScore),
    reasons: [`Tempo difference is ${tempoDiff.toFixed(0)} BPM`],
    suggestions: ["Try songs with similar tempos for better results."]
  };
}
