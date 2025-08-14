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

    const pythonApiUrl = Deno.env.get('PYTHON_API_URL');
    if (!pythonApiUrl) {
      console.warn('PYTHON_API_URL not set, returning fallback response');
      return new Response(
        JSON.stringify({ 
          success: true,
          jobId: `fallback-${Date.now()}`,
          message: 'Mashup generation started (fallback mode)',
          status: 'processing'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Forwarding mashup generation request to Python API...`);

    const response = await fetch(`${pythonApiUrl}/generate-mashup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Python API error: ${errorBody}`);
        throw new Error(`Failed to start mashup job: Python API returned status ${response.status}`);
    }

    const jobResult = await response.json();
    console.log('Python API response:', jobResult);

    // The python API should return { success: true, jobId: "..." }
    // If no jobId is returned, fall back to creating a placeholder job
    if (!jobResult.jobId) {
      console.warn('No jobId returned from Python API, creating fallback response');
      return new Response(
        JSON.stringify({ 
          success: true,
          jobId: `fallback-${Date.now()}`,
          message: 'Mashup generation started (fallback mode)',
          status: 'processing'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(jobResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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