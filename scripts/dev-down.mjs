#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const ports = [8000,8001,8002,8003,8004,8080,5173];

function bash(cmd) { spawn("bash", ["-lc", cmd], { stdio: "inherit" }); }

if (process.platform === "win32") {
  console.log("On Windows, close the terminal or kill processes via Task Manager.");
  process.exit(0);
}

bash(`lsof -ti tcp:${ports.join(",")} | xargs -r kill -9`);
bash(`pkill -f "uvicorn|cloudflared|caddy|vite|node .*dev"`); // best-effort
