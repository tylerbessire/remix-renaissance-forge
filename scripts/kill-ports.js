#!/usr/bin/env node
import { execSync } from 'child_process';

const start = 8000;
const end = 8080;

for (let port = start; port <= end; port++) {
  try {
    const pid = execSync(`lsof -ti :${port}`).toString().trim();
    if (pid) {
      execSync(`kill -9 ${pid}`);
      console.log(`🚫 Killed process ${pid} on port ${port}`);
    }
  } catch (err) {
    // No process on this port
  }
}
