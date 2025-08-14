const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MashupRequest {
  songs: Array<{
    song_id: string;
    name: string;
    artist: string;
    storage_path: string;
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { songs }: MashupRequest = await req.json();

    if (!songs || songs.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Please provide at least 2 songs' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get Python API URL - this is required, no fallbacks
    const pythonApiUrl = Deno.env.get('PYTHON_API_URL');
    if (!pythonApiUrl) {
      throw new Error('PYTHON_API_URL environment variable is not configured. External Python API is required for mashup generation.');
    }

    console.log(`Forwarding mashup generation request to Python API: ${pythonApiUrl}`);

    // Forward to external Python API with retry logic
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${pythonApiUrl}/generate-mashup`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ songs }),
          signal: AbortSignal.timeout(120000) // 2 minute timeout for mashup generation
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Python API returned status ${response.status}: ${errorBody}`);
        }

        const jobResult = await response.json();
        
        // Validate response structure
        if (!jobResult.success || !jobResult.jobId) {
          throw new Error('Invalid response from Python API - missing success flag or jobId');
        }

        console.log(`Mashup generation job started: ${jobResult.jobId} on attempt ${attempt}`);

        return new Response(
          JSON.stringify(jobResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        lastError = error;
        console.warn(`Mashup generation attempt ${attempt} failed:`, error.message);
        
        if (attempt < 3) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // All attempts failed
    throw new Error(`Failed to start mashup generation after 3 attempts. Last error: ${lastError.message}`);

  } catch (error) {
    console.error('Error in generate-mashup function:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to start mashup generation job',
        details: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});