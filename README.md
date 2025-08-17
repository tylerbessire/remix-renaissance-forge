# Tyler's Infinite Remixer

An AI-powered mashup generation studio, built with the help of Lovable.dev.

**Project URL**: https://lovable.dev/projects/223c3af8-9855-46c7-96dc-f0600de92406

## Development Setup (The "Clone and Go" Experience)

This project uses a microservice architecture for its Python backend. The following setup uses `concurrently` and `localtunnel` to make local development as simple as possible.

### 1. One-Time Setup

First, ensure you have Node.js, npm, and Python installed. Then, clone the repository and run the setup script:

```bash
git clone <your-repo-url>
cd <your-repo-name>
npm run setup
```
This will install all Node.js dependencies and all Python dependencies from the root `requirements.txt` file.

### 2. Running the Development Environment

To start the full stack (Vite frontend, all Python API servers, and the tunnels), simply run:

```bash
npm run dev:complete
```

That's it! 🚀 This single command will:
- ✅ Clean up any processes using ports 8000-8080.
- ✅ Start 4 Python API servers for analysis, processing, scoring, and orchestration.
- ✅ Create 4 consistent tunnel URLs with `localtunnel`.
- ✅ Start the Vite dev server for the frontend.

### 3. Supabase Environment Variables

This project requires several environment variables to be set in your Supabase project to connect the Deno functions to the Python API services.

Go to your **Supabase Dashboard → Project Settings → Environment Variables** and add the following. Thanks to `localtunnel`, these URLs are consistent and do not need to be changed between development sessions.

```
ANALYSIS_API_URL=https://tylers-remixer-analysis.loca.lt
PROCESSING_API_URL=https://tylers-remixer-processing.loca.lt
SCORING_API_URL=https://tylers-remixer-scoring.loca.lt
ORCHESTRATOR_API_URL=https://tylers-remixer-orchestrator.loca.lt
SEPARATION_API_URL=https://tylers-remixer-separation.loca.lt
```

The `ORCHESTRATOR_API_URL` is required by the `claude-mashup-orchestrator` Supabase function.
If it's missing, the function logs a warning at startup and returns a JSON response:

```json
{
  "error": "Missing ORCHESTRATOR_API_URL",
  "details": "Set the ORCHESTRATOR_API_URL environment variable to the base URL of the orchestrator service."
}
```

You will also need to add your `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY`. Refer to the `.env.example` file for the full list.
