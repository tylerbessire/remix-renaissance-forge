// src/utils/audioAnalysis.ts

import { supabase } from '@/integrations/supabase/client';
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

    const { data, error } = await supabase.functions.invoke('advanced-audio-analysis', {
        body: { songId, audioData },
    });

    if (error) throw error;
    if (!data.success || !data.analysis) { // The proxy now returns the analysis directly
      throw new Error('Analysis response is missing expected data.');
    }

    return data.analysis as AnalysisResult;

  } catch (e) {
    console.error("File analysis failed:", e);
    throw e; // Re-throw to be handled by the calling hook
  }
}

