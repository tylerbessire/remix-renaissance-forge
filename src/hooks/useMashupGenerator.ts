import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

      setProcessingStep("Trash pandas are working their magic...");
      setProgress(80);
      
      // Simulate final processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      setProcessingStep("Mashup complete!");
      setProgress(100);

      if (data?.success) {
        toast.success(`Created "${data.result.title}"!`);
        return data.result;
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