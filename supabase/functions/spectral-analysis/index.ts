const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpectralAnalysisRequest {
  audioData: string; // base64 encoded audio
  songId: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audioData, songId }: SpectralAnalysisRequest = await req.json();

    if (!audioData || !songId) {
      return new Response(
        JSON.stringify({ error: 'Missing audioData or songId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Starting spectral analysis for song: ${songId}`);

    // Check if external Python API is available
    const pythonApiUrl = Deno.env.get('PYTHON_API_URL');
    if (!pythonApiUrl) {
      console.warn('PYTHON_API_URL not set, returning mock analysis');
      // Return mock analysis data for development
      const mockResult = {
        version: "1.0",
        source: {
          duration_sec: 180.0,
          sr: 22050,
          mono: true,
          used_window_sec: 4.0
        },
        beat_grid: {
          bpm: 120.0,
          bpm_confidence: 0.8,
          beats_sec: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
          downbeats_sec: [0.5, 2.5],
          time_signature: "4/4"
        },
        key: {
          name: "C",
          camelot: "8B",
          cents_off: 0.0,
          confidence: 0.75,
          method: "chromagram",
          chromagram: [0.1, 0.2, 0.8, 0.1, 0.2, 0.1, 0.2, 0.3, 0.1, 0.2, 0.1, 0.2]
        },
        energy: 0.6,
        brightness: 0.4,
        rhythm: {
          pulse_clarity: 0.7,
          rhythmic_complexity: 0.3
        },
        spectral_balance: {
          low_freq_content: 0.3,
          mid_freq_content: 0.5,
          high_freq_content: 0.2
        },
        roughness: {
          estimated_roughness: 0.1
        },
        diagnostics: {
          warnings: ["Using mock data - PYTHON_API_URL not configured"]
        }
      };

      return new Response(
        JSON.stringify(mockResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Forward to external Python API
    console.log(`Forwarding analysis request to Python API: ${pythonApiUrl}`);

    const response = await fetch(`${pythonApiUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId, audioData }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Python API error: ${errorBody}`);
      throw new Error(`External API returned status ${response.status}: ${errorBody}`);
    }

    const analysisResult = await response.json();
    console.log(`Analysis completed for song: ${songId}`);

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