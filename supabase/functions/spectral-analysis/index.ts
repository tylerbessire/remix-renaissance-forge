import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fromBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpectralAnalysisRequest {
  audioData: string; // base64 encoded audio
  songId: string;
  metadata?: {
    title: string;
    artist: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioData, songId }: SpectralAnalysisRequest = await req.json();

    if (!audioData || !songId) {
      return new Response(
        JSON.stringify({ error: 'Audio data and song ID are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Starting spectral analysis for song: ${songId}`);

    // Decode base64 audio data
    const audioBuffer = fromBase64(audioData);

    // Create a temporary file for the audio
    const tempFilePath = await Deno.makeTempFile({ suffix: ".wav" });
    await Deno.writeFile(tempFilePath, audioBuffer);

    let analysisResult;
    try {
      // Execute the python script
      const command = new Deno.Command("python3", {
        args: ["./supabase/functions/spectral-analysis/index.py", tempFilePath],
      });

      const { code, stdout, stderr } = await command.output();

      if (code !== 0) {
        const errorOutput = new TextDecoder().decode(stderr);
        console.error(`Python script error: ${errorOutput}`);
        throw new Error(`Analysis script failed: ${errorOutput}`);
      }

      const output = new TextDecoder().decode(stdout);
      analysisResult = JSON.parse(output);

    } finally {
      // Clean up the temporary file
      await Deno.remove(tempFilePath);
    }

    // The python script returns a comprehensive analysis object.
    // We can map this to the desired output structure.
    // For now, let's just embed it and add some placeholders for the other fields.
    const result = {
      success: true,
      songId,
      analysis: {
        spectralFeatures: analysisResult, // Result from python script
        emotionalArc: { // Placeholder
            timeline: [],
            overallMood: "unknown",
            emotionalProgression: [],
            climaxPoint: 0,
            energyPeaks: []
        },
        musicalStructure: { // Placeholder
            verses: [],
            choruses: [],
            bridges: [],
            intro: [],
            outro: []
        },
        mashupPotential: { // Placeholder
          keyCompatibility: 0,
          tempoFlexibility: 0,
          vocalSuitability: 0,
          rhythmicComplexity: 0
        }
      },
      processedAt: new Date().toISOString()
    };

    console.log(`Spectral analysis completed for ${songId}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in spectral analysis:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze audio spectrum', 
        details: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});