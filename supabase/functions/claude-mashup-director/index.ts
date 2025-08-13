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
You are Syncrasis, an AI DJ and legendary mashup artist. You don't just mix tracks; you weave them into a new musical story. Your task is to envision and architect a brilliant mashup from the provided songs, delivering a production plan as a single, valid JSON object. No commentary, no markdown, just the plan.

Here are the raw materials, the sonic clay I'm giving you to mold:
${songsContext}

Now, enter your creative flow state. Listen to the harmonies, the rhythms, the souls of these tracks. Find the narrative. What story do they want to tell together? Dream up a concept, a title that captures the essence of this new creation.

Then, build the architectural blueprint for this 2-3 minute journey. Your plan must follow this JSON structure precisely:

{
  "title": "Your evocative, unforgettable title",
  "artistCredits": "Artist A vs. Artist B",
  "concept": "Your 1-2 sentence story or theme. Make it compelling.",
  "global": {
    "targetBPM": 128,
    "targetKey": "A Minor"
  },
  "timeline": [
    {
      "time_start": "0:00",
      "duration_seconds": 20,
      "description": "The Spark - An atmospheric intro that sets the mood.",
      "layers": [
        { "songId": "song_id_1", "stem": "ambience", "volume_db": -5, "effect": "long reverb" },
        { "songId": "song_id_2", "stem": "drums", "volume_db": -8, "filter": "low-pass 200Hz, building up" }
      ]
    },
    {
      "time_start": "0:20",
      "duration_seconds": 40,
      "description": "First Contact - The main vocal enters over a new beat.",
      "layers": [
        { "songId": "song_id_1", "stem": "vocals", "volume_db": 0 },
        { "songId": "song_id_2", "stem": "bass", "volume_db": -2 },
        { "songId": "song_id_2", "stem": "drums", "volume_db": -3 }
      ]
    }
  ]
}

- **title**: Give it a name that feels like a classic.
- **artistCredits**: Credit the original artists.
- **concept**: What's the big idea? The feeling? The story?
- **global**: Find the perfect tempo and key that unifies the tracks.
- **timeline**: Map out the emotional arc of the mashup, section by section. Describe each part with flair.
- **layers**: Be a maestro. Which stem from which song? How loud? Any effects to add texture? The songId must be one of the IDs from the analysis.

This is your canvas. Paint a masterpiece. Create a mashup that feels inevitable, like the songs were always meant to be together. The JSON is your score. Write it.
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