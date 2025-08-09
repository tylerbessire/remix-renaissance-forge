import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';

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
}

export const useMashupGenerator = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");

  const uploadSong = async (song: Song): Promise<{ storage_url: string; song_id: string; name: string; artist: string; }> => {
    if (!song.file || !(song.file instanceof File)) {
      throw new Error(`Invalid file for song "${song.name}".`);
    }

    const file_path = `uploads/${song.id}/${song.file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('mashups')
      .upload(file_path, song.file, {
        cacheControl: '3600',
        upsert: true, // Overwrite file if it exists, useful for re-uploads
      });

    if (uploadError) {
      throw new Error(`Failed to upload ${song.name}: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('mashups')
      .getPublicUrl(file_path);

    if (!publicUrlData?.publicUrl) {
        throw new Error(`Could not get public URL for ${song.name}`);
    }

    return {
      storage_url: publicUrlData.publicUrl,
      song_id: song.id,
      name: song.name,
      artist: song.artist,
    };
  };

  const generateMashup = async (songs: Song[]): Promise<MashupResult | null> => {
    if (songs.length < 2 || songs.length > 3) {
      toast.error("Please provide 2-3 songs for mashup");
      return null;
    }

    setIsProcessing(true);
    setProgress(0);
    setProcessingStep("Uploading your tracks...");

    try {
      // Step 1: Upload all songs to Supabase Storage
      const uploadedSongs = await Promise.all(songs.map(async (song, index) => {
        setProgress( (index + 1) / songs.length * 50 ); // Progress for uploads
        return await uploadSong(song);
      }));

      // Step 2: Call the new backend orchestrator function
      setProcessingStep("AI is generating your mashup...");
      setProgress(75);

      const { data: mashupData, error: mashupError } = await supabase.functions.invoke('generate-mashup', {
        body: { 
          songs: uploadedSongs,
        }
      });

      if (mashupError) {
        throw new Error(`Mashup generation failed: ${mashupError.message}`);
      }

      if (!mashupData?.success) {
        throw new Error(mashupData?.details || "The mashup could not be created by the AI.");
      }

      setProcessingStep("Mashup complete!");
      setProgress(100);
      toast.success(`Created "${mashupData.title}"!`);

      return {
        title: mashupData.title,
        concept: mashupData.concept,
        audioUrl: mashupData.mashup_url,
      };

    } catch (error) {
      console.error('Mashup generation error:', error);
      toast.error(error instanceof Error ? error.message : "An unknown error occurred during mashup generation.");
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