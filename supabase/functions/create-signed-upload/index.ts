import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songId, fileName } = await req.json();
    if (!songId || !fileName) {
      return new Response(JSON.stringify({ error: 'songId and fileName are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Very simple filename sanitization (also done client-side)
    const safeName = String(fileName).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_.]/g, '');
    const path = `uploads/${songId}/${safeName}`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const { data, error } = await supabase.storage.from('mashups').createSignedUploadUrl(path, { upsert: true });

    if (error || !data) {
      throw new Error(error?.message || 'Failed to create signed upload URL');
    }

    // data contains { signedUrl, token }
    return new Response(JSON.stringify({ path, ...data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to create signed upload', details: e.message } ), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
