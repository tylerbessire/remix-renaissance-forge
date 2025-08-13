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
  // This is needed if you're planning to invoke your function from a browser.
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
        throw new Error('PYTHON_API_URL environment variable is not set.');
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

    // The python API now returns the { success: true, jobId: "..." } object.
    // We can just forward this to the client.
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
