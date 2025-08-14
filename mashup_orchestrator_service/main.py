import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict
import traceback
import sys
import os
import httpx
import json

# --- Pydantic Models ---
class OrchestrationRequest(BaseModel):
    song1_analysis: Dict
    song2_analysis: Dict
    mashability_score: Dict
    user_preferences: Dict = {}

# --- FastAPI App ---
app = FastAPI()

# --- Claude "Kill_mR_DJ" Logic ---
async def create_masterplan(request: OrchestrationRequest):
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    context = f"""
# Song 1 Analysis
{json.dumps(request.song1_analysis, indent=2)}

# Song 2 Analysis
{json.dumps(request.song2_analysis, indent=2)}

# Mashability Score
{json.dumps(request.mashability_score, indent=2)}

# User Preferences
{json.dumps(request.user_preferences, indent=2)}
    """

    prompt = f"""
You are Kill_mR_DJ, a legendary AI music producer with microscopic precision. Your task is to create the ultimate, professional-grade mashup masterplan based on the provided data. The output must be a single, valid JSON object and nothing else.

DATA:
{context}

INSTRUCTIONS:
Create a "masterplan" with the following structure. Be incredibly detailed.

{{
  "creative_vision": "A 2-3 sentence, highly evocative description of the mashup's story and feel.",
  "masterplan": {{
    "title": "A bitchin', unforgettable title.",
    "artistCredits": "Artist A vs. Artist B",
    "global": {{
      "targetBPM": 128,
      "targetKey": "A Minor",
      "timeSignature": [4, 4]
    }},
    "timeline": [
      {{
        "time_start_sec": 0,
        "duration_sec": 20,
        "description": "Intro: Ethereal pads from Song 2, with a filtered, delayed vocal chop from Song 1's main hook.",
        "energy_level": 0.2,
        "layers": [
          {{ "songId": "song2", "stem": "other", "volume_db": -6, "effects": ["reverb", "delay"] }},
          {{ "songId": "song1", "stem": "vocals", "volume_db": -10, "effects": ["high-pass-filter-800hz", "ping-pong-delay"] }}
        ]
      }}
    ],
    "problems_and_solutions": [
      {{
        "problem": "The vocal from Song 1 will clash with the synth melody in Song 2's chorus.",
        "solution": "During the chorus, use a multiband sidechain compressor on the synth stem, triggered by the vocal stem, to duck frequencies between 1kHz-4kHz by -6dB, creating a clean pocket for the vocal."
      }}
    ]
  }}
}}

Your plan must be studio-grade. Specify exact timings, effects, and production techniques. Use the analysis data to make informed decisions.
"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Authorization': f'Bearer {anthropic_api_key}',
                'Content-Type': 'application/json',
                'x-api-key': anthropic_api_key,
                'anthropic-version': '2023-06-01',
            },
            json={
                'model': 'claude-3-opus-20240229',
                'max_tokens': 4096,
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.5,
            },
            timeout=120,
        )
    response.raise_for_status()
    response_data = response.json()
    raw_text = response_data['content'][0]['text']
    return json.loads(raw_text)

# --- API Endpoint ---
@app.post("/create-masterplan")
async def orchestrator_endpoint(request: OrchestrationRequest):
    try:
        masterplan_response = await create_masterplan(request)
        return masterplan_response
    except Exception as e:
        print(f"Error during masterplan creation: {e}", file=sys.stderr)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create masterplan: {str(e)}")

# --- Main execution ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8003))
    uvicorn.run(app, host="0.0.0.0", port=port)
