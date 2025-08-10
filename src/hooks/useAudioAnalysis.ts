import { useState, useCallback } from 'react';
import { audioAnalyzer, type AudioAnalysisResult } from '@/utils/audioAnalysis';
import { toast } from 'sonner';

interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface SongWithAnalysis extends Song {
  analysis?: AudioAnalysisResult;
}

export const useAudioAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analyzedSongs, setAnalyzedSongs] = useState<Map<string, AudioAnalysisResult>>(new Map());

  const analyzeSong = useCallback(async (song: Song): Promise<AudioAnalysisResult | null> => {
    // Check if already analyzed
    const existing = analyzedSongs.get(song.id);
    if (existing) {
      return existing;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      toast.info(`🎵 Analyzing "${song.name}" with AI...`);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const result = await audioAnalyzer.analyzeFile(song.file);
      
      clearInterval(progressInterval);
      setAnalysisProgress(100);

      // Cache the result
      setAnalyzedSongs(prev => new Map(prev).set(song.id, result));

      toast.success(`✨ Analysis complete! Genre: ${result.features.genre}, Tempo: ${result.features.tempo} BPM`);
      
      return result;
    } catch (error) {
      console.error('Analysis failed:', error);
      toast.error('Failed to analyze audio. Using basic analysis.');
      
      // Return basic fallback analysis
      const fallback: AudioAnalysisResult = {
        features: {
          tempo: 120,
          energy: 0.5,
          danceability: 0.5,
          valence: 0.5,
          genre: 'Unknown'
        }
      };
      
      setAnalyzedSongs(prev => new Map(prev).set(song.id, fallback));
      return fallback;
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  }, [analyzedSongs]);

  const analyzeMashupCompatibility = useCallback(async (songs: Song[]) => {
    if (songs.length < 2) {
      return { score: 0, reasons: ['Need at least 2 songs'], suggestions: [] };
    }

    try {
      // Ensure all songs are analyzed
      const analyses: AudioAnalysisResult[] = [];
      
      for (const song of songs) {
        const analysis = await analyzeSong(song);
        if (analysis) {
          analyses.push(analysis);
        }
      }

      const compatibility = await audioAnalyzer.analyzeCompatibility(analyses);
      
      // Show compatibility result
      const emoji = compatibility.score >= 80 ? '🔥' : compatibility.score >= 60 ? '✨' : compatibility.score >= 40 ? '⚡' : '🎯';
      toast.success(`${emoji} Mashup compatibility: ${compatibility.score}%`);
      
      return compatibility;
    } catch (error) {
      console.error('Compatibility analysis failed:', error);
      toast.error('Failed to analyze mashup compatibility');
      return { score: 50, reasons: ['Analysis unavailable'], suggestions: [] };
    }
  }, [analyzeSong]);

  const getAnalysis = useCallback((songId: string): AudioAnalysisResult | undefined => {
    return analyzedSongs.get(songId);
  }, [analyzedSongs]);

  const clearAnalysis = useCallback((songId?: string) => {
    if (songId) {
      setAnalyzedSongs(prev => {
        const newMap = new Map(prev);
        newMap.delete(songId);
        return newMap;
      });
    } else {
      setAnalyzedSongs(new Map());
    }
  }, []);

  return {
    analyzeSong,
    analyzeMashupCompatibility,
    getAnalysis,
    clearAnalysis,
    isAnalyzing,
    analysisProgress,
    analyzedCount: analyzedSongs.size
  };
};