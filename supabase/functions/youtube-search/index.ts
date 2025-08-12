import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchBody {
  query?: string;
  maxResults?: number;
}

function iso8601ToHMS(iso: string): string {
  // Example: PT3M15S -> 03:15
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "00:00";
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  const total = hours * 3600 + minutes * 60 + seconds;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing YOUTUBE_API_KEY secret in Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { query, maxResults = 5 } = (await req.json().catch(() => ({}))) as SearchBody;

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({ error: "A valid 'query' parameter is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Search videos
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("key", apiKey);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("q", query);

    const searchResp = await fetch(searchUrl.toString());
    if (!searchResp.ok) {
      const t = await searchResp.text();
      console.error("YouTube search error:", t);
      return new Response(
        JSON.stringify({ error: "YouTube search failed", details: t }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const searchData = await searchResp.json();

    const ids: string[] = (searchData.items || [])
      .map((it: any) => it.id?.videoId)
      .filter(Boolean);

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ success: true, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Fetch durations and thumbnails
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("key", apiKey);
    videosUrl.searchParams.set("part", "contentDetails,snippet");
    videosUrl.searchParams.set("id", ids.join(","));

    const videosResp = await fetch(videosUrl.toString());
    if (!videosResp.ok) {
      const t = await videosResp.text();
      console.error("YouTube videos error:", t);
      return new Response(
        JSON.stringify({ error: "YouTube videos lookup failed", details: t }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videosData = await videosResp.json();
    const byId = new Map<string, any>();
    for (const v of videosData.items || []) {
      byId.set(v.id, v);
    }

    const results = ids.map((id) => {
      const v = byId.get(id);
      const title = v?.snippet?.title ?? "";
      const thumbnail =
        v?.snippet?.thumbnails?.medium?.url ||
        v?.snippet?.thumbnails?.high?.url ||
        v?.snippet?.thumbnails?.default?.url ||
        "";
      const durationISO = v?.contentDetails?.duration ?? "PT0S";
      const duration = iso8601ToHMS(durationISO);
      return {
        id,
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        duration,
        thumbnail,
      };
    });

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("youtube-search edge function error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
