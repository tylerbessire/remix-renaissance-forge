import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { audioMixer } from "@/utils/audioMixer";

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

      // Step 2: Call the mashup generation function
      setProcessingStep("Cooking up the mashup concept...");
      setProgress(50);
      
      const { data, error } = await supabase.functions.invoke('generate-mashup', {
        body: { songs: songsData }
      });

      if (error) {
        throw new Error(error.message);
      }

      setProcessingStep("Mixing audio tracks...");
      setProgress(80);
      
      // Mix the actual audio files
      const audioFiles = songs.map(song => song.file);
      const mixedAudioUrl = await audioMixer.mixTracks(audioFiles, {
        crossfadeTime: 2,
        volumeBalance: audioFiles.map(() => 1 / audioFiles.length)
      });

      setProcessingStep("Mashup complete!");
      setProgress(100);

      if (data?.success) {
        toast.success(`Created "${data.result.title}"!`);
        return {
          ...data.result,
          audioUrl: mixedAudioUrl // Use the real mixed audio instead of placeholder
        };
      } else {
        throw new Error("Mashup generation failed");
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