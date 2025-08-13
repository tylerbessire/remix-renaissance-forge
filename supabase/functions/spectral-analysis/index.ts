import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpectralAnalysisRequest {
  audioData: string; // base64 encoded audio
  songId: string;
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

    const pythonApiUrl = Deno.env.get('PYTHON_API_URL');
    if (!pythonApiUrl) {
        throw new Error('PYTHON_API_URL environment variable is not set.');
    }

    console.log(`Forwarding spectral analysis for song ${songId} to Python API...`);

    const response = await fetch(`${pythonApiUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Python API error: ${errorBody}`);
        throw new Error(`Analysis failed: Python API returned status ${response.status}`);
    }

    const analysisResult = await response.json();

    // The python API now returns the full analysis object.
    // We can just forward this to the client.
    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in spectral analysis function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process spectral analysis',
        details: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});