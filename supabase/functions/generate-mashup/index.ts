import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songs }: MashupRequest = await req.json();

    if (!songs || songs.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Please provide at least 2 songs' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Create a temporary file for the input data
    const tempInputPath = await Deno.makeTempFile({ suffix: ".json" });
    await Deno.writeFile(tempInputPath, new TextEncoder().encode(JSON.stringify({ songs })));

    try {
      const command = new Deno.Command("python3", {
        args: ["./supabase/functions/generate-mashup/index.py", tempInputPath],
      });

      const { code, stdout, stderr } = await command.output();

      if (code !== 0) {
        const errorOutput = new TextDecoder().decode(stderr);
        console.error(`Python script error: ${errorOutput}`);
        throw new Error(`Failed to start mashup job: ${errorOutput}`);
      }

      const output = new TextDecoder().decode(stdout);
      const result = JSON.parse(output);

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } finally {
      await Deno.remove(tempInputPath);
    }

  } catch (error) {
    console.error('Error generating mashup:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate mashup', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});