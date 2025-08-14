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

    // Get Python API URL - this is required, no fallbacks
    const pythonApiUrl = Deno.env.get('PYTHON_API_URL');
    if (!pythonApiUrl) {
      throw new Error('PYTHON_API_URL environment variable is not configured. External Python API is required for spectral analysis.');
    }

    // Forward to external Python API with retry logic
    console.log(`Forwarding analysis request to Python API: ${pythonApiUrl}`);
    
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${pythonApiUrl}/analyze`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ songId, audioData }),
          signal: AbortSignal.timeout(60000) // 60 second timeout
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Python API returned status ${response.status}: ${errorBody}`);
        }

        const analysisResult = await response.json();
        
        // Validate response structure
        if (!analysisResult.version || !analysisResult.beat_grid || !analysisResult.key) {
          throw new Error('Invalid response structure from Python API');
        }

        console.log(`Analysis completed for song: ${songId} on attempt ${attempt}`);
        
        return new Response(
          JSON.stringify(analysisResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        lastError = error;
        console.warn(`Analysis attempt ${attempt} failed:`, error.message);
        
        if (attempt < 3) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // All attempts failed
    throw new Error(`Failed to analyze audio after 3 attempts. Last error: ${lastError.message}`);

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