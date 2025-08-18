
# Tyler's Infinite Remixer

An AI-powered mashup generation studio, built with the help of Lovable.dev.

**Project URL**: https://lovable.dev/projects/223c3af8-9855-46c7-96dc-f0600de92406

## Development Setup (The "Clone and Go" Experience)

This project uses a microservice architecture for its Python backend. The following setup uses `concurrently` and stable tunneling to make local development as simple as possible.

### 1. One-Time Setup

First, ensure you have Node.js, npm, and Python installed. Then, clone the repository and run the setup script:

```bash
git clone <your-repo-url>
cd <your-repo-name>
npm run setup
```

This will install all Node.js dependencies and all Python dependencies from the root `requirements.txt` file.

### 2. Install Tunneling Tool (Choose One)

**Option A: Cloudflare Tunnel (Recommended - Most Reliable)**
```bash
# macOS
brew install cloudflared

# Linux
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Windows
winget install --id Cloudflare.cloudflared
```

**Option B: ngrok (Alternative)**
```bash
# macOS
brew install ngrok/ngrok/ngrok

# Linux
snap install ngrok

# Windows
winget install ngrok.ngrok
```

**Option C: Caddy (For Reverse Proxy)**
```bash
# macOS
brew install caddy

# Linux
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 3. Running the Development Environment

**Option A: Stable Development (Recommended)**
```bash
npm run dev:stable
```
This will:
- ✅ Clean up any processes using ports 8000-8080
- ✅ Start 5 Python API servers for analysis, processing, scoring, orchestration, and separation
- ✅ Start Caddy reverse proxy to route all services through port 8080
- ✅ Create one stable Cloudflare tunnel URL
- ✅ Start the Vite dev server for the frontend

**Option B: Legacy Development (Multiple Tunnels)**
```bash
npm run dev:complete
```
This uses the original localtunnel approach with individual tunnels per service.

### 4. Fix Python Dependencies (If You Get Proxy Errors)

If you see errors like `TypeError: Client.__init__() got an unexpected keyword argument 'proxy'`, run:

```bash
pip uninstall -y httpx httpcore supabase gotrue
pip install -r requirements.txt
```

This fixes compatibility issues between newer `httpx` versions and the Supabase Python client.

### 5. Supabase Environment Variables

This project requires several environment variables to be set in your Supabase project to connect the Deno functions to the Python API services.

Go to your **Supabase Dashboard → Project Settings → Environment Variables** and add the following:

**For Stable Development (Single Tunnel):**
After running `npm run dev:stable`, you'll get one Cloudflare URL. Use it like this:
```
ANALYSIS_API_URL=https://your-tunnel-url.trycloudflare.com/analysis
PROCESSING_API_URL=https://your-tunnel-url.trycloudflare.com/processing
SCORING_API_URL=https://your-tunnel-url.trycloudflare.com/scoring
ORCHESTRATOR_API_URL=https://your-tunnel-url.trycloudflare.com/orchestrator
SEPARATION_API_URL=https://your-tunnel-url.trycloudflare.com/separation
```

**For Legacy Development (Multiple Tunnels):**
```
ANALYSIS_API_URL=https://tylers-remixer-analysis.loca.lt
PROCESSING_API_URL=https://tylers-remixer-processing.loca.lt
SCORING_API_URL=https://tylers-remixer-scoring.loca.lt
ORCHESTRATOR_API_URL=https://tylers-remixer-orchestrator.loca.lt
SEPARATION_API_URL=https://tylers-remixer-separation.loca.lt
```

You will also need to add your `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY`. Refer to the `.env.example` file for the full list.

## Troubleshooting

### Python Service Won't Start
- Check that all dependencies are installed: `pip install -r requirements.txt`
- If you get proxy/proxies errors, uninstall and reinstall: `pip uninstall -y httpx httpcore supabase gotrue && pip install -r requirements.txt`

### Tunnel Connection Issues
- Cloudflare Tunnel is most reliable: `npm run tunnel:cloudflared`
- ngrok is a good alternative: `npm run tunnel:ngrok`
- Localtunnel can be flaky, use as last resort

### Edge Functions Return 503
- Check that your tunnel is running and accessible
- Verify Supabase environment variables are set correctly
- Ensure Python services are running on their expected ports (8000-8004)

## Scripts

- `npm run dev:stable` - Start everything with stable Cloudflare tunnel
- `npm run dev:complete` - Start everything with legacy localtunnel approach
- `npm run python:start` - Start only Python services
- `npm run tunnel:cloudflared` - Start Cloudflare tunnel only
- `npm run tunnel:ngrok` - Start ngrok tunnel only
- `npm run proxy:start` - Start Caddy reverse proxy only
