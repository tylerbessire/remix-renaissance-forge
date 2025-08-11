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
  // Newer response shape
  result?: {
    title?: string;
    concept?: string;
    audioUrl?: string;        // direct URL
    storage_path?: string;    // storage path
    mashup_url?: string;      // alias for storage path
  };
  // Legacy/alternate fields
  mashup_url?: string;
  title?: string;
  concept?: string;
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
        fileSize: song.file.size,
        contentType: song.file.type || undefined,
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

    // Require authentication before proceeding
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please sign in to upload and generate mashups.");
      setIsProcessing(false);
      setProgress(0);
      setProcessingStep("");
      return null;
    }

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

      // Determine file location from function response and create signed URL only when needed
      const title = data.result?.title ?? data.title ?? 'Your Mashup';
      const concept = data.result?.concept ?? data.concept ?? '';
      const storagePath = data.result?.storage_path ?? data.result?.mashup_url ?? data.mashup_url;
      const directUrl = data.result?.audioUrl;

      let finalUrl: string | undefined;
      if (directUrl && /^https?:\/\//.test(directUrl)) {
        finalUrl = directUrl;
      } else if (storagePath) {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('mashups')
          .createSignedUrl(storagePath, 3600); // 3600 seconds = 1 hour

        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error(`Could not create secure link for the mashup: ${signedUrlError?.message || 'Unknown error'}`);
        }
        finalUrl = signedUrlData.signedUrl;
      } else {
        throw new Error('Mashup function did not return a file location.');
      }

      setProcessingStep("Mashup complete!");
      setProgress(100);
      toast.success(`Created "${title}"!`);

      return {
        title,
        concept,
        audioUrl: finalUrl,
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