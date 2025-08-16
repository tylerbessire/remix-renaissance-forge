const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Load the orchestrator URL at startup and warn if it's missing
const orchestratorApiUrl = Deno.env.get('ORCHESTRATOR_API_URL');
if (!orchestratorApiUrl) {
  console.warn(
    'ORCHESTRATOR_API_URL is not configured. The claude-mashup-orchestrator function cannot forward requests.'
  );
}

Deno.serve(async (req) => {
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders });
}

if (!orchestratorApiUrl) {
  return new Response(
    JSON.stringify({
      error: 'Missing ORCHESTRATOR_API_URL',
      details:
        'Set the ORCHESTRATOR_API_URL environment variable to the base URL of the orchestrator service.',
    }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

try {
  const body = await req.json();

  // Forward the request to the Python orchestrator service
  const response = await fetch(`${orchestratorApiUrl}/create-masterplan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Supabase-Edge-Function/1.0',
      'bypass-tunnel-reminder': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Orchestrator service failed: ${response.statusText} - ${errorBody}`
    );
  }

  const result = await response.json();

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
} catch (error) {
  console.error('Error in claude-mashup-orchestrator proxy:', error.message);
  return new Response(
    JSON.stringify({
      error: 'Failed to create masterplan',
      details: error.message,
    }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
});
