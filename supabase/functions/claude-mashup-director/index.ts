import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songs, analysisData } = await req.json();
    
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Prepare detailed context for the AI, using the rich data from our new analysis function
    const songsContext = songs.map((song: any, index: number) => {
      const analysis = analysisData?.[index] || {};
      return `
Song ${index + 1} (id: "${song.song_id}"): "${song.name}" by ${song.artist}
- BPM: ${analysis.bpm?.toFixed(2)}
- Key: ${analysis.key}
- Duration: ${analysis.duration_seconds?.toFixed(2)}s
- Energy: ${analysis.energy?.toFixed(3)}
- Harmonic Complexity: ${analysis.harmonic_complexity?.toFixed(3)}
- Chroma Profile: [${analysis.chroma_profile?.map(v => v.toFixed(3)).join(', ')}]
      `.trim();
    }).join('\n\n');

    const prompt = `
You are a world-class professional mashup artist and DJ, acting as an AI music production engine. Your task is to create a detailed, structured production plan for a mashup of two or more songs.

The final output MUST be a single, valid JSON object. Do not include any text, markdown, or formatting outside of the JSON object itself.

I have ${songs.length} songs with the following musical analysis:
${songsContext}

Based on this data, create a production plan with the following JSON structure:

{
  "title": "A creative, catchy title for the mashup",
  "artistCredits": "Artist A vs. Artist B",
  "concept": "A brief, 1-2 sentence narrative or thematic concept for the mashup.",
  "global": {
    "targetBPM": 125,
    "targetKey": "C Minor"
  },
  "timeline": [
    {
      "time_start": "0:00",
      "duration_seconds": 15,
      "description": "Intro",
      "layers": [
        { "songId": "${songs[0].song_id}", "stem": "drums", "volume_db": -3, "filter": "high-pass 80Hz" },
        { "songId": "${songs[1].song_id}", "stem": "other", "volume_db": -6, "effect": "reverb" }
      ]
    },
    {
      "time_start": "0:15",
      "duration_seconds": 30,
      "description": "Verse 1",
      "layers": [
        { "songId": "${songs[0].song_id}", "stem": "vocals", "volume_db": 0 },
        { "songId": "${songs[1].song_id}", "stem": "bass", "volume_db": -1.5 },
        { "songId": "${songs[0].song_id}", "stem": "drums", "volume_db": -3 }
      ]
    }
  ]
}

- **title**: A creative title for the mashup.
- **artistCredits**: A string crediting the original artists.
- **concept**: A short description of the creative vision.
- **global**: Overall settings for the entire track. Use the provided analysis to pick a good targetBPM and targetKey.
- **timeline**: An array of sequential sections. Each section has a start time, duration in seconds, description, and a list of layers.
- **layers**: Each layer specifies which songId and stem to use, its volume in dB (0 is full volume, negative values are quieter), and any optional filters or effects.

Generate a complete timeline for a 2-3 minute mashup. Be creative and musically intelligent. Ensure the transitions are smooth and the combination of stems makes musical sense. The songId for each layer must match one of the song IDs provided above.
`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anthropicApiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229', // Using a model known for strong JSON output
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    }

    const responseData = await response.json();
    const rawText = responseData.content[0].text;

    // Attempt to parse the JSON response
    let mashupPlan;
    try {
      mashupPlan = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse JSON from Claude's response:", rawText);
      throw new Error("AI returned a malformed creative plan. Could not parse JSON.");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...mashupPlan
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in claude-mashup-director:', error.message);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to get creative direction', 
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});