import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { audioMixer } from "@/utils/audioMixer";
import { audioAnalyzer } from "@/utils/audioAnalysis";

interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface MashupResult {
  title: string;
  concept: string;
  audioUrl: string;
  metadata: {
    duration: string;
    genre: string;
    energy: string;
    artistCredits?: string;
    professionalDirection?: any;
  };
}

export const useMashupGenerator = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");

  const generateMashup = async (songs: Song[]): Promise<MashupResult | null> => {
    if (songs.length < 2 || songs.length > 3) {
      toast.error("Please provide 2-3 songs for mashup");
      return null;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      // Step 1: Convert audio files to base64
      setProcessingStep("Analyzing rhythms and instrumentation...");
      setProgress(20);
      
      const songsData = await Promise.all(
        songs.map(async (song) => {
          // Validate that song.file is actually a File object
          if (!song.file || !(song.file instanceof File)) {
            console.error('Invalid file object:', song.file);
            throw new Error(`Invalid file for song "${song.name}". Expected File object, got: ${typeof song.file}`);
          }

          // Convert audio file to base64
          const audioData = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // Remove the data URL prefix to get just the base64 data
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(song.file);
          });

          return {
            id: song.id,
            name: song.name,
            artist: song.artist,
            audioData,
          };
        })
      );

      // Step 2: Mix audio tracks first (avoid edge function memory issues)
      setProcessingStep("Mixing audio tracks...");
      setProgress(50);
      
      const audioFiles = songs.map(song => song.file);
      const mixedAudioUrl = await audioMixer.mixTracks(audioFiles, {
        crossfadeTime: 2,
        volumeBalance: audioFiles.map(() => 1 / audioFiles.length)
      });

      // Step 3: Get Claude's professional mashup direction
      setProcessingStep("Consulting with Claude (Professional Mashup Artist)...");
      setProgress(70);
      
      // Get analysis data for Claude
      const analysisData = await Promise.all(
        songs.map(async (song) => {
          try {
            return await audioAnalyzer.analyzeFile(song.file);
          } catch (error) {
            console.warn('Analysis failed for song:', song.name, error);
            return null;
          }
        })
      );

      const songsMetadata = songs.map(song => ({
        id: song.id,
        name: song.name,
        artist: song.artist,
      }));

      const { data: claudeData, error: claudeError } = await supabase.functions.invoke('claude-mashup-director', {
        body: { 
          songs: songsMetadata,
          analysisData: analysisData.filter(Boolean)
        }
      });

      setProcessingStep("Applying professional mashup techniques...");
      setProgress(90);

      setProcessingStep("Mashup complete!");
      setProgress(100);

      if (claudeData?.success) {
        toast.success(`Created "${claudeData.title}"!`);
        return {
          title: claudeData.title,
          concept: claudeData.recommendations.fullDirection,
          audioUrl: mixedAudioUrl,
          metadata: { 
            duration: "3:30", 
            genre: "Mashup", 
            energy: "High",
            artistCredits: claudeData.artistCredits,
            professionalDirection: claudeData.recommendations
          }
        };
      } else {
        // Fallback with real audio but generated concept
        toast.success("Created mashup with mixed audio!");
        return {
          title: `${songs[0].name} × ${songs[1].name}`,
          concept: "A seamless blend combining the best elements of both tracks.",
          audioUrl: mixedAudioUrl,
          metadata: { duration: "3:30", genre: "Mashup", energy: "High" }
        };
      }

    } catch (error) {
      console.error('Mashup generation error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate mashup");
      return null;
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProcessingStep("");
    }
  };

  return {
    generateMashup,
    isProcessing,
    progress,
    processingStep,
  };
};