import { useState, useCallback } from 'react';
import { analyzeFile, computeCompatibility } from '@/utils/audioAnalysis';
import type { AnalysisResult, CompatibilityWeights } from '@/utils/audioAnalysis';
import { toast } from 'sonner';

interface Song {
  id: string;
  file?: File;
}

export function useAudioAnalysis() {
  const [analyzedSongs, setAnalyzedSongs] = useState<Map<string, AnalysisResult>>(new Map());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeSong = useCallback(async (song: Song): Promise<AnalysisResult | null> => {
    try {
      // Check cache first
      const cached = analyzedSongs.get(song.id);
      if (cached) return cached;

      // Validate song object
      if (!song || typeof song !== 'object') {
        toast.error('Invalid song object provided for analysis');
        return null;
      }

      if (!song.id) {
        toast.error('Song is missing an ID');
        return null;
      }

      if (!song.file) {
        toast.error(`Cannot analyze "${song.id}" without a file`);
        return null;
      }

      // Validate file object
      if (!(song.file instanceof File)) {
        toast.error(`Invalid file object for "${song.id}"`);
        return null;
      }

      setIsAnalyzing(true);
      toast.info(`Analyzing ${song.id}...`);

      const result = await analyzeFile(song.id, song.file);
      
      if (!result) {
        toast.error(`Analysis returned no results for ${song.id}`);
        return null;
      }

      setAnalyzedSongs(prev => new Map(prev).set(song.id, result));
      toast.success(`Analysis complete for ${song.id}!`);
      return result;

    } catch (error) {
      console.error(`Analysis error for song ${song?.id || 'unknown'}:`, error);
      
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Don't show the full technical error to users, just a friendly message
      const userMessage = errorMessage.includes('Edge Function returned a non-2xx status code')
        ? 'Analysis service is currently unavailable. Please try again later.'
        : errorMessage;

      toast.error(`Analysis failed for ${song?.id || 'song'}: ${userMessage}`);
      return null;

    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzedSongs]);

  const analyzeMashupCompatibility = useCallback(async (songs: Song[], weights?: CompatibilityWeights) => {
    const analyses: AnalysisResult[] = [];
    for (const song of songs) {
      let analysis = analyzedSongs.get(song.id);
      if (!analysis) {
        analysis = await analyzeSong(song);
      }

      if (analysis) {
        analyses.push(analysis);
      } else {
        toast.error("Compatibility check failed: one or more songs could not be analyzed.");
        return { score: 0, reasons: ["Analysis failed for one or more songs."], suggestions: [] };
      }
    }

    if (analyses.length < 2) {
      return { score: 0, reasons: ["Need at least 2 analyzed songs."], suggestions: [] };
    }

    const compatibility = computeCompatibility(analyses, weights);
    toast.success(`Mashup compatibility: ${compatibility.score}%`);
    return compatibility;
  }, [analyzedSongs, analyzeSong]);

  const getAnalysis = useCallback((songId: string): AnalysisResult | undefined => {
    return analyzedSongs.get(songId);
  }, [analyzedSongs]);

  return {
    isAnalyzing,
    analyzeSong,
    getAnalysis,
    analyzedSongs, // Exporting the map
    analyzeMashupCompatibility
  };
}