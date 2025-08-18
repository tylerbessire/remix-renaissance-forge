
#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class NgrokTunnelManager {
  constructor() {
    this.tunnel = null;
    this.isShuttingDown = false;
  }

  async startTunnel() {
    return new Promise((resolve, reject) => {
      console.log('🚇 Starting ngrok tunnel for all services on port 8080...');
      
      const tunnel = spawn('ngrok', ['http', '8080'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let tunnelUrl = null;
      let hasStarted = false;

      tunnel.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`[ngrok] ${output}`);
        
        // ngrok outputs JSON when using --log=stdout
        try {
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('url=https://')) {
              const urlMatch = line.match(/url=(https:\/\/[^\s]+)/);
              if (urlMatch && !hasStarted) {
                tunnelUrl = urlMatch[1];
                hasStarted = true;
                console.log(`✅ ngrok tunnel started: ${tunnelUrl}`);
                console.log(`\n🎯 Service URLs:`);
                console.log(`   Analysis API: ${tunnelUrl}/analysis`);
                console.log(`   Processing API: ${tunnelUrl}/processing`);
                console.log(`   Scoring API: ${tunnelUrl}/scoring`);
                console.log(`   Orchestrator API: ${tunnelUrl}/orchestrator`);
                console.log(`   Separation API: ${tunnelUrl}/separation`);
                console.log(`\n📝 Update these URLs in your Supabase environment variables.`);
                resolve({ tunnel, url: tunnelUrl });
              }
            }
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
      });

      tunnel.stderr.on('data', (data) => {
        const error = data.toString().trim();
        console.error(`[ngrok Error] ${error}`);
      });

      tunnel.on('close', (code) => {
        if (!hasStarted && !this.isShuttingDown) {
          const error = new Error(`ngrok tunnel failed to start (exit code: ${code})`);
          console.error(`❌ ngrok tunnel failed to start`);
          reject(error);
        }
      });

      tunnel.on('error', (error) => {
        console.error(`[ngrok] Process error:`, error.message);
        if (!hasStarted) {
          reject(error);
        }
      });

      this.tunnel = tunnel;

      // Timeout if tunnel doesn't start within 30 seconds
      setTimeout(() => {
        if (!hasStarted && !this.isShuttingDown) {
          console.error(`⏰ ngrok tunnel timed out`);
          tunnel.kill();
          reject(new Error(`ngrok tunnel startup timeout`));
        }
      }, 30000);
    });
  }

  shutdown() {
    this.isShuttingDown = true;
    console.log('\n🛑 Shutting down ngrok tunnel...');
    
    if (this.tunnel) {
      try {
        this.tunnel.kill('SIGTERM');
        console.log(`📴 ngrok tunnel stopped`);
      } catch (error) {
        console.error(`Error stopping ngrok tunnel:`, error.message);
      }
    }
  }
}

// Main execution
const tunnelManager = new NgrokTunnelManager();

// Handle graceful shutdown
process.on('SIGINT', () => {
  tunnelManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  tunnelManager.shutdown();
  process.exit(0);
});

// Check if ngrok is installed
const checkNgrok = spawn('which', ['ngrok'], { stdio: 'pipe' });
checkNgrok.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ ngrok not found. Install it with:');
    console.error('   macOS: brew install ngrok/ngrok/ngrok');
    console.error('   Linux: snap install ngrok');
    console.error('   Windows: winget install ngrok.ngrok');
    process.exit(1);
  }

  // Start the tunnel
  tunnelManager.startTunnel()
    .then((result) => {
      console.log('\n🎉 ngrok tunnel startup complete!');
      console.log('Press Ctrl+C to stop the tunnel');
    })
    .catch((error) => {
      console.error('Failed to start ngrok tunnel:', error.message);
      process.exit(1);
    });
});
