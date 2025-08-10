import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// --- Design: Missing Interface Definitions ---
interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface UploadedSong {
  storage_path: string; // Using path instead of URL for security
  song_id: string;
  name: string;
  artist: string;
}

interface MashupResult {
  title: string;
  concept: string;
  audioUrl: string; // This will now be a signed URL
}

interface MashupResponse {
  success: boolean;
  mashup_url: string; // The storage path of the final mashup
  title: string;
  concept: string;
  details?: string;
}

const sanitizeFilename = (filename: string): string => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_\.]/g, '');
};

export const useMashupGenerator = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");

  const uploadSong = async (song: Song): Promise<UploadedSong> => {
    if (!song.file || !(song.file instanceof File)) {
      throw new Error(`Invalid file for song "${song.name}".`);
    }

    const safeFilename = sanitizeFilename(song.file.name);
    const filePath = `uploads/${song.id}/${safeFilename}`;

    // Request a signed upload URL from our Edge Function (uses service role)
    const { data: signedUpload, error: signedErr } = await supabase.functions.invoke<{ path: string; signedUrl: string; token: string }>('create-signed-upload', {
      body: {
        songId: song.id,
        fileName: safeFilename,
      },
    });

    if (signedErr || !signedUpload) {
      throw new Error(`Failed to prepare secure upload for ${song.name}: ${signedErr?.message || 'Unknown error'}.`);
    }

    // Perform the upload using the signed token
    const { error: uploadError } = await supabase.storage
      .from('mashups')
      .uploadToSignedUrl(signedUpload.path, signedUpload.token, song.file);


    if (uploadError) {
      throw new Error(`Failed to upload ${song.name}: ${uploadError.message}.`);
    }

    return {
      storage_path: filePath,
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
      const uploadedSongs = await Promise.all(songs.map(async (song, index) => {
        setProgress( (index + 1) / songs.length * 50 );
        return await uploadSong(song);
      }));

      setProcessingStep("AI is generating your mashup...");
      setProgress(75);

      // The 'data' object will be typed as MashupResponse
      const { data, error } = await supabase.functions.invoke<MashupResponse>('generate-mashup', {
        body: { 
          songs: uploadedSongs, // Sending storage_path instead of public URL
        }
      });

      if (error) {
        throw new Error(`Mashup generation failed: ${error.message}`);
      }

      if (!data || !data.success) {
        throw new Error(data?.details || "The mashup could not be created by the AI.");
      }

      // --- Security: Unrestricted Public Access to Uploaded Files ---
      // Create a signed URL for the final mashup, which expires after 1 hour.
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('mashups')
        .createSignedUrl(data.mashup_url, 3600); // 3600 seconds = 1 hour

      if (signedUrlError) {
        throw new Error(`Could not create secure link for the mashup: ${signedUrlError.message}`);
      }

      setProcessingStep("Mashup complete!");
      setProgress(100);
      toast.success(`Created "${data.title}"!`);

      return {
        title: data.title,
        concept: data.concept,
        audioUrl: signedUrlData.signedUrl,
      };

    } catch (error) {
      console.error('Mashup generation error:', error);
      toast.error(error instanceof Error ? error.message : "An unknown error occurred.");
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