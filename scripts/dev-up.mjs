#!/usr/bin/env node
// One-command dev runner for Infinite Remixer
// Starts python services, Caddy, Cloudflare tunnel,
// updates Supabase envs, deploys functions, starts frontend.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import http from "node:http";

const PROJECT_REF  = process.env.SUPABASE_PROJECT_ID;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const FRONTEND_PORT = process.env.FRONTEND_PORT || "5173";

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error("Missing SUPABASE_PROJECT_ID or SUPABASE_ACCESS_TOKEN env vars.");
  process.exit(1);
}

const services = [
  { name: "analysis",      port: 8000, cmd: ["uvicorn", "audio_analysis_service.main:app", "--host", "0.0.0.0", "--port", "8000"] },
  { name: "processing",    port: 8001, cmd: ["uvicorn", "audio_processing_service.main:app", "--host", "0.0.0.0", "--port", "8001"] },
  { name: "scoring",       port: 8002, cmd: ["uvicorn", "mashability_scoring_service.main:app", "--host", "0.0.0.0", "--port", "8002"] },
  { name: "orchestrator",  port: 8003, cmd: ["uvicorn", "mashup_orchestrator_service.main:app", "--host", "0.0.0.0", "--port", "8003"] },
  { name: "separation",    port: 8004, cmd: ["uvicorn", "stem_separation_service.main:app", "--host", "0.0.0.0", "--port", "8004"] },
];

const functionsToDeploy = ["generate-mashup"]; // add more if you have them

const children = [];

function sh(label, bin, args, opts = {}) {
  const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  p.stdout.on("data", d => console.log(`[${label}] ${d.toString().trim()}`));
  p.stderr.on("data", d => console.error(`[${label} ERROR] ${d.toString().trim()}`));
  children.push(p);
  return p;
}

async function portFree(port) {
  return new Promise(resolve => {
    const srv = http.createServer(() => {});
    srv.on("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => { srv.close(() => resolve(true)); });
  });
}

async function killPorts(ports) {
  const platform = process.platform;
  for (const p of ports) {
    try {
      if (platform === "darwin" || platform === "linux") {
        spawn("bash", ["-lc", `lsof -ti tcp:${p} | xargs -r kill -9`]);
      } else {
        spawn("powershell.exe", ["-Command", `Get-NetTCPConnection -LocalPort ${p} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`]);
      }
    } catch {}
  }
  await delay(400);
}

async function waitFor(url, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, res => { res.resume(); resolve(res.statusCode === 200); });
        req.on("error", () => resolve(false));
      });
      if (ok) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await delay(300);
  }
}

(async () => {
  // 1) Clean slate
  const allPorts = [8080, ...services.map(s => s.port), Number(FRONTEND_PORT)].filter(Boolean);
  console.log("🔪 Killing stale processes...");
  await killPorts(allPorts);

  // 2) Start Python services
  console.log("🐍 Starting Python microservices...");
  for (const svc of services) {
    sh(`py:${svc.name}`, svc.cmd[0], svc.cmd.slice(1), { env: process.env });
  }
  // Wait for health
  for (const svc of services) {
    const ok = await waitFor(`http://127.0.0.1:${svc.port}/health`, 25000);
    if (!ok) {
      console.error(`❌ ${svc.name} on :${svc.port} did not become healthy`);
      process.exit(1);
    }
    console.log(`✅ ${svc.name} healthy on :${svc.port}`);
  }

  // 3) Start Caddy reverse proxy
  console.log("🧭 Starting Caddy reverse proxy on :8080...");
  const caddy = sh("caddy", "caddy", ["run", "--config", "./Caddyfile"]);
  const caddyOk = await waitFor("http://127.0.0.1:8080/health", 15000);
  if (!caddyOk) {
    console.error("❌ Caddy did not reach /health");
    process.exit(1);
  }
  console.log("✅ Caddy ready");

  // 4) Start Cloudflare tunnel and capture URL
  console.log("🚇 Opening Cloudflare tunnel…");
  const cf = spawn("cloudflared", ["tunnel", "--url", "http://127.0.0.1:8080"], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(cf);

  let tunnelUrl = null;
  cf.stdout.on("data", (buf) => {
    const out = buf.toString();
    const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !tunnelUrl) {
      tunnelUrl = m[0];
      console.log(`✅ Tunnel: ${tunnelUrl}`);
      console.log("🔗 Service URLs:");
      console.log(`   ${tunnelUrl}/analysis`);
      console.log(`   ${tunnelUrl}/processing`);
      console.log(`   ${tunnelUrl}/scoring`);
      console.log(`   ${tunnelUrl}/orchestrator`);
      console.log(`   ${tunnelUrl}/separation`);
    }
  });

  await once(cf.stdout, "data"); // wait for some output
  const startWait = Date.now();
  while (!tunnelUrl && Date.now() - startWait < 30000) {
    await delay(200);
  }
  if (!tunnelUrl) {
    console.error("❌ Could not obtain trycloudflare URL");
    process.exit(1);
  }

  // 5) Update Supabase Edge env vars
  console.log("📝 Updating Supabase Edge env vars…");
  const secrets = {
    ANALYSIS_API_URL:      `${tunnelUrl}/analysis`,
    PROCESSING_API_URL:    `${tunnelUrl}/processing`,
    SCORING_API_URL:       `${tunnelUrl}/scoring`,
    ORCHESTRATOR_API_URL:  `${tunnelUrl}/orchestrator`,
    SEPARATION_API_URL:    `${tunnelUrl}/separation`,
  };

  const secretArgs = Object.entries(secrets).flatMap(([k,v]) => [`${k}=${v}`]);
  const setSecrets = sh("supabase", "supabase", ["secrets", "set", "--project-ref", PROJECT_REF, ...secretArgs], {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN }
  });
  await once(setSecrets, "close");

  // 6) Deploy edge functions so they pick up code changes
  console.log("🚀 Deploying edge functions…");
  for (const fn of functionsToDeploy) {
    const dep = sh(`deploy:${fn}`, "supabase", ["functions", "deploy", fn, "--project-ref", PROJECT_REF], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN }
    });
    await once(dep, "close");
  }

  // 7) Start frontend
  console.log("🖥️  Starting frontend dev server…");
  const fe = sh("web", "npm", ["run", "dev"], { env: process.env });
  console.log(`\n🎉 Dev stack up!\n- Frontend:           http://localhost:${FRONTEND_PORT}\n- Proxy health:       http://127.0.0.1:8080/health\n- Public base URL:    ${tunnelUrl}\n- Supabase envs now point to: ${tunnelUrl}/{analysis|processing|scoring|orchestrator|separation}\n\nPress Ctrl+C to stop everything.\n`);

  // Keep process alive until SIGINT
  process.stdin.resume();
})().catch(err => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down…");
  for (const p of children) {
    try { p.kill("SIGINT"); } catch {}
  }
  process.exit(0);
});
