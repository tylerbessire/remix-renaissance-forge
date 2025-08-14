const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { song1_analysis, song2_analysis, mashability_score, user_preferences } = await req.json();

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Create a detailed context string for the prompt
    const context = `
# Song 1 Analysis
${JSON.stringify(song1_analysis, null, 2)}

# Song 2 Analysis
${JSON.stringify(song2_analysis, null, 2)}

# Mashability Score
${JSON.stringify(mashability_score, null, 2)}

# User Preferences
${JSON.stringify(user_preferences, null, 2)}
    `;

    const prompt = `
You are Kill_mR_DJ, a legendary AI music producer with microscopic precision. Your task is to create the ultimate, professional-grade mashup masterplan based on the provided data. The output must be a single, valid JSON object and nothing else.

DATA:
${context}

INSTRUCTIONS:
Create a "masterplan" with the following structure. Be incredibly detailed.

{
  "creative_vision": "A 2-3 sentence, highly evocative description of the mashup's story and feel.",
  "masterplan": {
    "title": "A bitchin', unforgettable title.",
    "artistCredits": "Artist A vs. Artist B",
    "global": {
      "targetBPM": 128,
      "targetKey": "A Minor",
      "timeSignature": [4, 4]
    },
    "timeline": [
      {
        "time_start_sec": 0,
        "duration_sec": 20,
        "description": "Intro: Ethereal pads from Song 2, with a filtered, delayed vocal chop from Song 1's main hook.",
        "energy_level": 0.2,
        "layers": [
          { "songId": "song2", "stem": "other", "volume_db": -6, "effects": ["reverb", "delay"] },
          { "songId": "song1", "stem": "vocals", "volume_db": -10, "effects": ["high-pass-filter-800hz", "ping-pong-delay"] }
        ]
      }
    ],
    "problems_and_solutions": [
      {
        "problem": "The vocal from Song 1 will clash with the synth melody in Song 2's chorus.",
        "solution": "During the chorus, use a multiband sidechain compressor on the synth stem, triggered by the vocal stem, to duck frequencies between 1kHz-4kHz by -6dB, creating a clean pocket for the vocal."
      }
    ]
  }
}

Your plan must be studio-grade. Specify exact timings, effects, and production techniques. Use the analysis data to make informed decisions. For example, if the keys are different, specify the exact pitch shift required. If tempos differ, specify the time-stretch strategy. Create a masterpiece.
`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anthropicApiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229', // Use the most powerful model for this task
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    }

    const responseData = await response.json();
    const rawText = responseData.content[0].text;

    let plan;
    try {
      plan = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse JSON from Claude's response:", rawText);
      throw new Error("AI returned a malformed masterplan.");
    }

    return new Response(
      JSON.stringify(plan),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in claude-mashup-orchestrator:', error.message);
    return new Response(
      JSON.stringify({
        error: 'Failed to create masterplan',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
