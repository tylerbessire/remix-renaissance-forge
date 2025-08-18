
#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CloudflareTunnelManager {
  constructor() {
    this.tunnel = null;
    this.isShuttingDown = false;
  }

  async startTunnel() {
    return new Promise((resolve, reject) => {
      console.log('🚇 Starting Cloudflare tunnel for all services on port 8080...');
      
      const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://127.0.0.1:8080'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let tunnelUrl = null;
      let hasStarted = false;

      tunnel.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`[Cloudflare] ${output}`);
        
        // Look for the tunnel URL in cloudflared output
        const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !hasStarted) {
          tunnelUrl = urlMatch[0];
          hasStarted = true;
          console.log(`✅ Cloudflare tunnel started: ${tunnelUrl}`);
          console.log(`\n🎯 Service URLs:`);
          console.log(`   Analysis API: ${tunnelUrl}/analysis`);
          console.log(`   Processing API: ${tunnelUrl}/processing`);
          console.log(`   Scoring API: ${tunnelUrl}/scoring`);
          console.log(`   Orchestrator API: ${tunnelUrl}/orchestrator`);
          console.log(`   Separation API: ${tunnelUrl}/separation`);
          console.log(`\n📝 Update these URLs in your Supabase environment variables.`);
          resolve({ tunnel, url: tunnelUrl });
        }
      });

      tunnel.stderr.on('data', (data) => {
        const error = data.toString().trim();
        console.error(`[Cloudflare Error] ${error}`);
      });

      tunnel.on('close', (code) => {
        if (!hasStarted && !this.isShuttingDown) {
          const error = new Error(`Cloudflare tunnel failed to start (exit code: ${code})`);
          console.error(`❌ Cloudflare tunnel failed to start`);
          reject(error);
        }
      });

      tunnel.on('error', (error) => {
        console.error(`[Cloudflare] Process error:`, error.message);
        if (!hasStarted) {
          reject(error);
        }
      });

      this.tunnel = tunnel;

      // Timeout if tunnel doesn't start within 30 seconds
      setTimeout(() => {
        if (!hasStarted && !this.isShuttingDown) {
          console.error(`⏰ Cloudflare tunnel timed out`);
          tunnel.kill();
          reject(new Error(`Cloudflare tunnel startup timeout`));
        }
      }, 30000);
    });
  }

  shutdown() {
    this.isShuttingDown = true;
    console.log('\n🛑 Shutting down Cloudflare tunnel...');
    
    if (this.tunnel) {
      try {
        this.tunnel.kill('SIGTERM');
        console.log(`📴 Cloudflare tunnel stopped`);
      } catch (error) {
        console.error(`Error stopping Cloudflare tunnel:`, error.message);
      }
    }
  }
}

// Main execution
const tunnelManager = new CloudflareTunnelManager();

// Handle graceful shutdown
process.on('SIGINT', () => {
  tunnelManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  tunnelManager.shutdown();
  process.exit(0);
});

// Check if cloudflared is installed
const checkCloudflared = spawn('which', ['cloudflared'], { stdio: 'pipe' });
checkCloudflared.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ cloudflared not found. Install it with:');
    console.error('   macOS: brew install cloudflared');
    console.error('   Linux: wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared-linux-amd64.deb');
    console.error('   Windows: winget install --id Cloudflare.cloudflared');
    process.exit(1);
  }

  // Start the tunnel
  tunnelManager.startTunnel()
    .then((result) => {
      console.log('\n🎉 Cloudflare tunnel startup complete!');
      console.log('Press Ctrl+C to stop the tunnel');
    })
    .catch((error) => {
      console.error('Failed to start Cloudflare tunnel:', error.message);
      process.exit(1);
    });
});
