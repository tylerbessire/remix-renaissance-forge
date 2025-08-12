import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: "A 'query' parameter is required." }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Searching YouTube for: ${query}`)

    // Run yt-dlp command to search for videos
    const command = new Deno.Command('yt-dlp', {
      args: [
        '--dump-json',
        `ytsearch5:${query}`
      ],
      stdout: 'piped',
      stderr: 'piped',
    })

    const { code, stdout, stderr } = await command.output()

    if (code !== 0) {
      console.error('yt-dlp error:', new TextDecoder().decode(stderr))
      return new Response(
        JSON.stringify({ 
          error: 'Failed to execute yt-dlp', 
          details: new TextDecoder().decode(stderr) 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const output = new TextDecoder().decode(stdout)
    const results = []

    // Parse each line of JSON output
    for (const line of output.trim().split('\n')) {
      if (line.trim()) {
        try {
          const videoInfo = JSON.parse(line)
          results.push({
            id: videoInfo.id,
            title: videoInfo.title,
            url: videoInfo.webpage_url,
            duration: videoInfo.duration_string,
            thumbnail: videoInfo.thumbnail,
          })
        } catch (parseError) {
          console.error('Failed to parse JSON line:', parseError)
        }
      }
    }

    console.log(`Found ${results.length} results`)

    return new Response(
      JSON.stringify({ success: true, results }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'An unexpected error occurred', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})