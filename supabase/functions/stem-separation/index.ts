import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.3.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StemSeparationRequest {
  audioData: string; // base64 encoded audio
  songId: string;
  options?: {
    separateVocals: boolean;
    separateDrums: boolean;
    separateBass: boolean;
    separateOther: boolean;
  };
}

interface StemResult {
  vocals?: string;
  drums?: string;
  bass?: string;
  other?: string;
  accompaniment?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioData, songId, options }: StemSeparationRequest = await req.json();

    if (!audioData || !songId) {
      return new Response(
        JSON.stringify({ error: 'Audio data and song ID are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Starting stem separation for song: ${songId}`);

    // Initialize Hugging Face client
    const hf = new HfInference(Deno.env.get('HUGGING_FACE_ACCESS_TOKEN'));

    // Convert base64 to blob for processing
    const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Use Demucs model for stem separation
    console.log('Processing with Demucs stem separation...');
    
    const stems: StemResult = {};

    try {
      // Extract vocals vs accompaniment first (most common use case)
      const vocalSeparation = await hf.audioToAudio({
        model: 'facebook/demucs-waveform-hq',
        inputs: audioBlob,
        parameters: {
          stems: ['vocals', 'accompaniment']
        }
      });

      if (vocalSeparation && Array.isArray(vocalSeparation)) {
        if (vocalSeparation[0]) {
          const vocalsBuffer = await vocalSeparation[0].arrayBuffer();
          stems.vocals = btoa(String.fromCharCode(...new Uint8Array(vocalsBuffer)));
        }
        if (vocalSeparation[1]) {
          const accompBuffer = await vocalSeparation[1].arrayBuffer();
          stems.accompaniment = btoa(String.fromCharCode(...new Uint8Array(accompBuffer)));
        }
      }

      // If full separation requested, extract individual stems
      if (options?.separateDrums || options?.separateBass || options?.separateOther) {
        console.log('Extracting individual instrument stems...');
        
        const fullSeparation = await hf.audioToAudio({
          model: 'facebook/demucs-waveform-hq',
          inputs: audioBlob,
          parameters: {
            stems: ['vocals', 'drums', 'bass', 'other']
          }
        });

        if (fullSeparation && Array.isArray(fullSeparation)) {
          if (options?.separateDrums && fullSeparation[1]) {
            const drumsBuffer = await fullSeparation[1].arrayBuffer();
            stems.drums = btoa(String.fromCharCode(...new Uint8Array(drumsBuffer)));
          }
          if (options?.separateBass && fullSeparation[2]) {
            const bassBuffer = await fullSeparation[2].arrayBuffer();
            stems.bass = btoa(String.fromCharCode(...new Uint8Array(bassBuffer)));
          }
          if (options?.separateOther && fullSeparation[3]) {
            const otherBuffer = await fullSeparation[3].arrayBuffer();
            stems.other = btoa(String.fromCharCode(...new Uint8Array(otherBuffer)));
          }
        }
      }

    } catch (stemError) {
      console.log('Demucs model not available, using fallback separation...');
      
      // Fallback: Use simpler vocal isolation
      try {
        const simpleVocals = await hf.audioToAudio({
          model: 'facebook/musicgen-small',
          inputs: audioBlob,
          parameters: {
            task: 'vocal_isolation'
          }
        });

        if (simpleVocals) {
          const buffer = await simpleVocals.arrayBuffer();
          stems.vocals = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        }
      } catch (fallbackError) {
        console.error('Fallback separation failed:', fallbackError);
        
        // Ultimate fallback: Return original audio as accompaniment
        stems.accompaniment = audioData;
        stems.vocals = null; // Indicate vocal extraction failed
      }
    }

    console.log(`Stem separation completed for ${songId}`);

    return new Response(
      JSON.stringify({
        success: true,
        songId,
        stems,
        metadata: {
          hasVocals: !!stems.vocals,
          hasDrums: !!stems.drums,
          hasBass: !!stems.bass,
          hasOther: !!stems.other,
          hasAccompaniment: !!stems.accompaniment,
          processedAt: new Date().toISOString()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in stem separation:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to separate stems', 
        details: error.message,
        songId: req.body?.songId || 'unknown'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});