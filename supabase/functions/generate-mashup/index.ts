import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MashupRequest {
  songs: Array<{
    id: string;
    name: string;
    artist: string;
    audioData: string; // base64 encoded audio
  }>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songs }: MashupRequest = await req.json();

    if (!songs || songs.length < 2 || songs.length > 3) {
      return new Response(
        JSON.stringify({ error: 'Please provide 2-3 songs for mashup' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Step 1: Generate concept with Claude
    console.log('Generating mashup concept...');
    const concept = await generateMashupConcept(songs);

    // Step 2: Create mashup title
    console.log('Creating mashup title...');
    const title = await generateMashupTitle(songs, concept);

    // Step 3: Simulate music generation (would integrate with Suno or similar)
    console.log('Generating music...');
    const audioResult = await generateMashupAudio(songs, concept);

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          title,
          concept,
          audioUrl: audioResult.url,
          metadata: {
            duration: audioResult.duration,
            genre: audioResult.genre,
            energy: audioResult.energy
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating mashup:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate mashup', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function generateMashupConcept(songs: any[]): Promise<string> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  if (!anthropicApiKey) {
    // Fallback concept generation
    const genres = ['Electronic', 'Ambient', 'Rock-Fusion', 'Synthwave', 'Experimental'];
    const adjectives = ['Ethereal', 'Thunderous', 'Hypnotic', 'Chaotic', 'Sublime'];
    const concepts = ['digital consciousness', 'neon dreams', 'cosmic rebellion', 'urban decay', 'infinite loops'];
    
    const randomGenre = genres[Math.floor(Math.random() * genres.length)];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomConcept = concepts[Math.floor(Math.random() * concepts.length)];
    
    return `A ${randomAdj.toLowerCase()} ${randomGenre.toLowerCase()} journey through ${randomConcept}, where the essence of "${songs[0].name}" collides with the energy of "${songs[1].name}" to create something entirely new.`;
  }

  try {
    const prompt = `Create a creative concept for a music mashup combining these tracks:
${songs.map(s => `- "${s.name}" by ${s.artist}`).join('\n')}

Generate a single paragraph describing the artistic vision, sound, and emotional journey of this mashup. Be creative, futuristic, and evocative. Focus on how the tracks blend together to create something new.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anthropicApiKey}`,
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    return `A beautiful collision where ${songs[0].name} meets ${songs[1].name}, creating an otherworldly journey through digital soundscapes.`;
  }
}

async function generateMashupTitle(songs: any[], concept: string): Promise<string> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  if (!anthropicApiKey) {
    // Fallback title generation
    const prefixes = ['Neon', 'Cyber', 'Digital', 'Electric', 'Cosmic', 'Shadow', 'Crystal'];
    const suffixes = ['Dreams', 'Chaos', 'Fusion', 'Echo', 'Pulse', 'Vortex', 'Requiem'];
    
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return `${randomPrefix} ${randomSuffix}`;
  }

  try {
    const prompt = `Based on this mashup concept: "${concept}"

Create a single, catchy title for this mashup. The title should be:
- 2-4 words max
- Evocative and memorable
- Reflects the fusion of the original tracks
- Has that "bitchin'" energy mentioned in the requirements

Just return the title, nothing else.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anthropicApiKey}`,
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text.trim().replace(/['"]/g, '');
  } catch (error) {
    console.error('Error generating title:', error);
    return 'Digital Dreamscape';
  }
}

async function generateMashupAudio(songs: any[], concept: string): Promise<any> {
  // This would integrate with Suno API or similar music generation service
  // For now, we'll simulate the process and return mock data
  
  console.log('Processing audio with concept:', concept);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Mock audio generation result
  return {
    url: 'https://example.com/generated-mashup.mp3', // This would be the actual generated audio URL
    duration: '3:42',
    genre: 'Electronic Fusion',
    energy: 'High'
  };
}