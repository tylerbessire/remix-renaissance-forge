import { useState, useCallback } from 'react';
import { analyzeFile, computeCompatibility } from '@/utils/audioAnalysis';
import type { AnalysisResult } from '@/utils/audioAnalysis';
import { toast } from 'sonner';

interface Song {
  id: string;
  file?: File;
}

export function useAudioAnalysis() {
  const [analyzedSongs, setAnalyzedSongs] = useState<Map<string, AnalysisResult>>(new Map());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeSong = useCallback(async (song: Song): Promise<AnalysisResult | null> => {
    // Check cache first
    const cached = analyzedSongs.get(song.id);
    if (cached) {
      return cached;
    }

    if (!song.file) {
      toast.error("Cannot analyze a song without a file.");
      return null;
    }

    setIsAnalyzing(true);
    toast.info(`Analyzing song...`);

    try {
      const result = await analyzeFile(song.id, song.file);
      setAnalyzedSongs(prev => new Map(prev).set(song.id, result));
      toast.success(`Analysis complete!`);
      return result;
    } catch (error) {
      toast.error("Analysis failed.");
      console.error(error);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzedSongs]);

  const analyzeMashupCompatibility = useCallback(async (songs: Song[]) => {
    const analyses: AnalysisResult[] = [];
    for (const song of songs) {
      const analysis = await analyzeSong(song);
      if (analysis) {
        analyses.push(analysis);
      } else {
        // If any song fails analysis, we can't determine compatibility.
        return { score: 0, reasons: ["Analysis failed for one or more songs."], suggestions: [] };
      }
    }

    if (analyses.length < 2) {
      return { score: 0, reasons: ["Need at least 2 analyzed songs."], suggestions: [] };
    }

    const compatibility = await computeCompatibility(analyses);
    toast.success(`Mashup compatibility: ${compatibility.score}%`);
    return compatibility;
  }, [analyzeSong]);

  const getAnalysis = useCallback((songId: string): AnalysisResult | undefined => {
    return analyzedSongs.get(songId);
  }, [analyzedSongs]);

  return {
    isAnalyzing,
    analyzeSong,
    getAnalysis,
    analyzeMashupCompatibility
  };
}