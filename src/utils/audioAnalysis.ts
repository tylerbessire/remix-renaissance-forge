// src/utils/audioAnalysis.ts

import { supabase } from '@/integrations/supabase/client';
export interface AnalysisResult {
  version: string;
  harmonic: {
    key: string;
    key_confidence: number;
    chord_progression: string[];
    chord_complexity: number;
  };
  rhythmic: {
    bpm: number;
    beat_confidence: number;
    groove_stability: number;
    swing_factor: number;
  };
  spectral: {
    mfccs: number[][];
    dynamic_range: number;
    brightness: number;
  };
  vocal: {
    vocal_presence: number;
  };
}

export interface CompatibilityWeights {
  bpmDifference?: number;
  keyCompatibility?: number;
  energyBalance?: number;
  spectralBalance?: number;
  rhythmicComplexity?: number;
}

// --- API Communication ---

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Add comprehensive validation
      if (!file) {
        reject(new Error('File is null or undefined'));
        return;
      }
      
      if (!(file instanceof File)) {
        reject(new Error(`Invalid file object: expected File, got ${typeof file}`));
        return;
      }
      
      if (file.size === 0) {
        reject(new Error('File is empty'));
        return;
      }
      
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('File is too large (max 50MB)'));
        return;
      }
      
      if (!file.type.startsWith('audio/')) {
        reject(new Error(`Invalid file type: ${file.type}. Expected audio file.`));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const result = reader.result as string;
          if (!result) {
            reject(new Error("FileReader returned null result"));
            return;
          }
          
          const base64Data = result.split(',')[1];
          if (!base64Data) {
            reject(new Error("Failed to extract base64 data from file"));
            return;
          }
          
          resolve(base64Data);
        } catch (error) {
          reject(new Error(`Error processing file result: ${error.message}`));
        }
      };
      
      reader.onerror = (error) => {
        reject(new Error(`FileReader error: ${error}`));
      };
      
      reader.onabort = () => {
        reject(new Error('File reading was aborted'));
      };
      
      // Start reading the file
      reader.readAsDataURL(file);
      
    } catch (error) {
      reject(new Error(`Unexpected error in fileToBase64: ${error.message}`));
    }
  });
}




export async function analyzeFile(songId: string, file: File): Promise<AnalysisResult> {
  try {
    // Validate inputs
    if (!songId || typeof songId !== 'string') {
      throw new Error('Invalid songId provided');
    }
    
    if (!file) {
      throw new Error('No file provided for analysis');
    }
    
    console.log(`Analyzing file for song ${songId}:`, { 
      fileName: file?.name, 
      fileType: file?.type, 
      fileSize: file?.size,
      isFile: file instanceof File 
    });
    
    // Convert file to base64 with comprehensive error handling
    let audioData: string;
    try {
      audioData = await fileToBase64(file);
    } catch (fileError) {
      throw new Error(`File processing failed: ${fileError.message}`);
    }
    
    // Validate base64 data
    if (!audioData || audioData.length === 0) {
      throw new Error('Failed to convert file to base64 data');
    }
    
    console.log(`Successfully converted file to base64, size: ${audioData.length} characters`);

    // Call Supabase function with error handling
    let response;
    try {
      response = await supabase.functions.invoke('advanced-audio-analysis', {
        body: { songId, audioData },
      });
    } catch (networkError) {
      throw new Error(`Network error calling analysis service: ${networkError.message}`);
    }
    
    const { data, error } = response;

    // Debug logging
    console.log('Supabase function response:', { data, error });

    // Handle Supabase function errors
    if (error) {
      console.error('Supabase function error:', error);
      throw new Error(`Analysis service error: ${error.message || 'Unknown error'}`);
    }
    
    // Validate response data
    if (!data) {
      throw new Error('No data returned from analysis service');
    }
    
    console.log('Analysis response data:', data);
    console.log('Data keys:', Object.keys(data));
    
    if (!data.success) {
      const errorMsg = data.error || data.message || 'Analysis failed';
      throw new Error(`Analysis failed: ${errorMsg}`);
    }
    
    if (!data.analysis) {
      throw new Error('Analysis response is missing analysis data');
    }
    
    // Validate analysis structure
    const analysis = data.analysis;
    console.log('Analysis object:', analysis);
    console.log('Analysis keys:', Object.keys(analysis));
    
    if (!analysis.harmonic || !analysis.rhythmic || !analysis.spectral || !analysis.vocal) {
      console.error('Missing sections:', {
        harmonic: !!analysis.harmonic,
        rhythmic: !!analysis.rhythmic,
        spectral: !!analysis.spectral,
        vocal: !!analysis.vocal
      });
      throw new Error('Analysis response has invalid structure - missing required sections');
    }
    
    if (!analysis.harmonic.key || typeof analysis.rhythmic.bpm !== 'number') {
      console.error('Missing key/BPM:', {
        key: analysis.harmonic.key,
        bpm: analysis.rhythmic.bpm,
        bpmType: typeof analysis.rhythmic.bpm
      });
      throw new Error('Analysis response has invalid structure - missing key or BPM data');
    }
    
    console.log(`Successfully analyzed file for song ${songId}`);
    return analysis as AnalysisResult;

  } catch (error) {
    console.error(`File analysis failed for song ${songId}:`, error);
    
    // Provide user-friendly error messages
    if (error.message.includes('File processing failed')) {
      throw error; // Already user-friendly
    } else if (error.message.includes('Network error')) {
      throw new Error('Unable to connect to analysis service. Please check your internet connection and try again.');
    } else if (error.message.includes('Analysis service error')) {
      throw new Error('The audio analysis service encountered an error. Please try again or contact support if the problem persists.');
    } else if (error.message.includes('Edge Function returned a non-2xx status code')) {
      throw new Error('The analysis service is currently unavailable. Please try again in a few minutes.');
    } else {
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }
}

export interface CompatibilityResult {
  score: number;
  reasons: string[];
  suggestions: string[];
}

export function computeCompatibility(
  analyses: AnalysisResult[],
  weights?: CompatibilityWeights
): CompatibilityResult {
  if (analyses.length < 2) {
    return {
      score: 0,
      reasons: ['Need at least 2 songs for compatibility analysis'],
      suggestions: ['Add more songs to analyze compatibility']
    };
  }

  const defaultWeights: Required<CompatibilityWeights> = {
    bpmDifference: 0.3,
    keyCompatibility: 0.25,
    energyBalance: 0.2,
    spectralBalance: 0.15,
    rhythmicComplexity: 0.1
  };

  const finalWeights = { ...defaultWeights, ...weights };
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let totalScore = 0;

  // Compare first two songs (can be extended for multiple songs)
  const song1 = analyses[0];
  const song2 = analyses[1];

  // BPM Compatibility
  const bpmDiff = Math.abs(song1.rhythmic.bpm - song2.rhythmic.bpm);
  const bpmScore = Math.max(0, 100 - (bpmDiff * 2)); // Penalize BPM differences
  totalScore += bpmScore * finalWeights.bpmDifference;

  if (bpmDiff > 20) {
    reasons.push(`Large BPM difference: ${bpmDiff.toFixed(1)} BPM`);
    suggestions.push('Consider using tempo adjustment tools');
  }

  // Key Compatibility (simplified - using key names)
  const keyScore = getKeyCompatibilityScore(song1.harmonic.key, song2.harmonic.key);
  totalScore += keyScore * finalWeights.keyCompatibility;

  if (keyScore < 50) {
    reasons.push(`Keys may not be harmonically compatible`);
    suggestions.push('Consider key shifting one of the tracks');
  }

  // Energy Balance (using vocal presence as proxy for energy)
  const energyDiff = Math.abs(song1.vocal.vocal_presence - song2.vocal.vocal_presence);
  const energyScore = Math.max(0, 100 - (energyDiff * 100)); // Assuming vocal_presence is 0-1
  totalScore += energyScore * finalWeights.energyBalance;

  if (energyDiff > 0.3) {
    reasons.push(`Significant energy difference between tracks`);
    suggestions.push('Consider adjusting levels or choosing tracks with similar energy');
  }

  // Spectral Balance (using brightness and dynamic range)
  const spectralScore = getSpectralCompatibilityScore(song1.spectral, song2.spectral);
  totalScore += spectralScore * finalWeights.spectralBalance;

  // Rhythmic Complexity (using groove stability and swing factor)
  const rhythmScore = getRhythmCompatibilityScore(song1.rhythmic, song2.rhythmic);
  totalScore += rhythmScore * finalWeights.rhythmicComplexity;

  return {
    score: Math.round(totalScore),
    reasons,
    suggestions
  };
}

function getKeyCompatibilityScore(key1: string, key2: string): number {
  // Simplified Camelot wheel compatibility
  // In a real implementation, you'd have a proper Camelot wheel lookup
  if (key1 === key2) return 100;
  // Adjacent keys are somewhat compatible
  return 60; // Simplified score
}

function getSpectralCompatibilityScore(spec1: any, spec2: any): number {
  // Compare spectral characteristics between tracks
  const brightnessDiff = Math.abs(spec1.brightness - spec2.brightness);
  const dynamicRangeDiff = Math.abs(spec1.dynamic_range - spec2.dynamic_range);
  
  // Normalize differences (brightness is typically 0-8000Hz, dynamic_range is in dB)
  const normalizedBrightnessDiff = brightnessDiff / 8000;
  const normalizedDynamicDiff = Math.abs(dynamicRangeDiff) / 100; // Assuming max 100dB difference
  
  const avgDiff = (normalizedBrightnessDiff + normalizedDynamicDiff) / 2;
  return Math.max(0, 100 - (avgDiff * 100));
}

function getRhythmCompatibilityScore(rhythm1: any, rhythm2: any): number {
  // Compare rhythmic characteristics
  const grooveStabilityDiff = Math.abs(rhythm1.groove_stability - rhythm2.groove_stability);
  const swingFactorDiff = Math.abs(rhythm1.swing_factor - rhythm2.swing_factor);
  const beatConfidenceDiff = Math.abs(rhythm1.beat_confidence - rhythm2.beat_confidence);
  
  const avgDiff = (grooveStabilityDiff + swingFactorDiff + beatConfidenceDiff) / 3;
  return Math.max(0, 100 - (avgDiff * 100));
}

