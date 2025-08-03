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
    
    console.log('Claude analyzing songs for mashup direction:', songs.map(s => s.name));

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'ANTHROPIC_API_KEY not configured',
          success: false 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Prepare analysis context for Claude
    const songsContext = songs.map((song: any, index: number) => {
      const analysis = analysisData?.[index] || {};
      return `Song ${index + 1}: "${song.name}" by ${song.artist}
- Tempo: ${analysis.tempo || 'Unknown'} BPM
- Energy: ${analysis.energy || 'Unknown'}
- Key: ${analysis.key || 'Unknown'}
- Genre: ${analysis.genre || 'Unknown'}
- Danceability: ${analysis.danceability || 'Unknown'}
- Valence: ${analysis.valence || 'Unknown'}`;
    }).join('\n\n');

    const prompt = `You are a world-class professional mashup artist with years of experience creating viral mashups. You understand music theory, production techniques, and what makes mashups work.

I have ${songs.length} songs that I want to mashup:

${songsContext}

As a professional mashup artist, provide your expert creative direction for this mashup:

1. **Overall Concept**: What's your creative vision? What story does this mashup tell?

2. **Stem Decisions**: 
   - Which song's vocals should be primary? Why?
   - Which song's instrumental/beat should be the foundation?
   - Any vocal harmonies or call-and-response opportunities?

3. **Technical Approach**:
   - Key changes needed (if any)?
   - Tempo adjustments or time-stretching?
   - Transition points and crossfade techniques?

4. **Creative Effects**:
   - What effects would enhance the mashup?
   - Any creative filtering or processing?
   - Breakdown sections or build-ups?

5. **Professional Tips**: What makes this mashup special? What should I watch out for?

Give me specific, actionable advice like you're mentoring a fellow producer. Be creative but practical.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anthropicApiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const creativeDirection = data.content[0].text;

    // Parse Claude's response into structured recommendations
    const recommendations = {
      concept: creativeDirection.match(/\*\*Overall Concept\*\*:(.*?)(?=\*\*|$)/s)?.[1]?.trim() || '',
      stemDecisions: creativeDirection.match(/\*\*Stem Decisions\*\*:(.*?)(?=\*\*|$)/s)?.[1]?.trim() || '',
      technicalApproach: creativeDirection.match(/\*\*Technical Approach\*\*:(.*?)(?=\*\*|$)/s)?.[1]?.trim() || '',
      creativeEffects: creativeDirection.match(/\*\*Creative Effects\*\*:(.*?)(?=\*\*|$)/s)?.[1]?.trim() || '',
      professionalTips: creativeDirection.match(/\*\*Professional Tips\*\*:(.*?)(?=\*\*|$)/s)?.[1]?.trim() || '',
      fullDirection: creativeDirection
    };

    console.log('Claude provided creative direction for mashup');

    return new Response(
      JSON.stringify({ 
        success: true, 
        recommendations,
        title: `Professional Mashup: ${songs[0]?.name} × ${songs[1]?.name}`,
        artistCredits: songs.map((s: any) => s.artist).join(' × ')
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in claude-mashup-director:', error);
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