#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class DeploymentManager {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.healthCheckPort = 3001; // Health check runs on PORT + 1
    this.healthCheckUrl = `http://localhost:${this.healthCheckPort}`;
    this.botProcess = null;
  }

  async deploy() {
    console.log('🦈 TerminalOne Bot - Production Deployment');
    console.log('==========================================');
    
    try {
      // Step 1: Pre-deployment checks
      await this.preDeploymentChecks();
      
      // Step 2: Install dependencies
      await this.installDependencies();
      
      // Step 3: Start the bot
      await this.startBot();
      
      // Step 4: Wait for services to initialize
      await this.waitForServices();
      
      // Step 5: Run health checks
      await this.runHealthChecks();
      
      // Step 6: Setup monitoring
      await this.setupMonitoring();
      
      console.log('✅ Deployment completed successfully!');
      console.log('🔗 Health Check: ' + this.healthCheckUrl + '/health');
      console.log('📊 Metrics: ' + this.healthCheckUrl + '/metrics');
      
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      await this.rollback();
      process.exit(1);
    }
  }

  async preDeploymentChecks() {
    console.log('🔍 Running pre-deployment checks...');
    
    // Check .env file exists
    const envPath = path.join(this.projectRoot, '.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env file not found. Copy .env.production and configure it.');
    }
    
    // Load and validate environment variables
    require('dotenv').config({ path: envPath });
    
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'ADMIN_CHAT_IDS',
      'SOLANA_RPC_URL'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    // Validate Telegram bot token format
    if (!process.env.TELEGRAM_BOT_TOKEN.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      throw new Error('Invalid Telegram bot token format');
    }
    
    console.log('✅ Environment validation passed');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    if (majorVersion < 16) {
      console.warn('⚠️ Node.js 16+ recommended for optimal performance');
    }
    
    console.log(`✅ Node.js ${nodeVersion} detected`);
  }

  async installDependencies() {
    console.log('📦 Installing dependencies...');
    
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['ci'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });
      
      npm.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Dependencies installed');
          resolve();
        } else {
          reject(new Error(`npm ci failed with code ${code}`));
        }
      });
      
      npm.on('error', reject);
    });
  }

  async startBot() {
    console.log('🚀 Starting TerminalOne bot...');
    
    return new Promise((resolve, reject) => {
      this.botProcess = spawn('node', ['src/index.js'], {
        cwd: this.projectRoot,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      
      let startupLogs = '';
      
      this.botProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupLogs += output;
        console.log('Bot:', output.trim());
        
        // Check for successful startup indicators
        if (output.includes('Solana service initialized')) {
          console.log('✅ Bot started successfully');
          resolve();
        }
      });
      
      this.botProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('Bot Error:', output.trim());
        
        // Check for critical startup errors
        if (output.includes('Error') && output.includes('TELEGRAM_BOT_TOKEN')) {
          reject(new Error('Bot startup failed - check Telegram token'));
        }
      });
      
      this.botProcess.on('error', reject);
      
      this.botProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Bot process exited with code ${code}`));
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Bot startup timeout (30s)'));
      }, 30000);
    });
  }

  async waitForServices() {
    console.log('⏳ Waiting for services to initialize...');
    
    // Wait for health check server to be ready
    for (let i = 0; i < 30; i++) {
      try {
        await axios.get(`${this.healthCheckUrl}/ready`, { timeout: 1000 });
        console.log('✅ Health check server is ready');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Health check server failed to start');
  }

  async runHealthChecks() {
    console.log('🏥 Running health checks...');
    
    try {
      // Basic health check
      const healthResponse = await axios.get(`${this.healthCheckUrl}/health`, { timeout: 10000 });
      const health = healthResponse.data;
      
      console.log(`📊 System Status: ${health.status}`);
      console.log(`⏰ Uptime: ${Math.floor(health.uptime / 1000)}s`);
      
      if (health.status !== 'healthy') {
        console.warn('⚠️ Some health checks failed:');
        Object.entries(health.checks).forEach(([check, result]) => {
          if (result.status !== 'healthy') {
            console.warn(`  - ${check}: ${result.status} (${result.error || 'Unknown error'})`);
          }
        });
      }
      
      // Detailed metrics
      const metricsResponse = await axios.get(`${this.healthCheckUrl}/metrics`, { timeout: 5000 });
      const metrics = metricsResponse.data;
      
      console.log('📈 System Metrics:');
      console.log(`  - Memory: ${metrics.metrics.memory.rss}MB RSS`);
      console.log(`  - Requests: ${metrics.metrics.requests.total}`);
      console.log(`  - Error Rate: ${metrics.metrics.requests.errorRate}`);
      console.log(`  - Active Users: ${metrics.rateLimit.activeUsers}`);
      
      console.log('✅ Health checks completed');
      
    } catch (error) {
      console.warn('⚠️ Health check failed:', error.message);
      // Don't fail deployment for health check issues
    }
  }

  async setupMonitoring() {
    console.log('📊 Setting up monitoring...');
    
    // Create monitoring script
    const monitorScript = `#!/bin/bash
# TerminalOne Bot Monitoring Script
# Run this with cron every 5 minutes: */5 * * * * /path/to/monitor.sh

HEALTH_URL="${this.healthCheckUrl}/health"
LOG_FILE="/var/log/terminalone-monitor.log"
ALERT_WEBHOOK="${process.env.ERROR_WEBHOOK_URL || ''}"

# Check health endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $HTTP_CODE -ne 200 ]; then
    echo "$(date): Health check failed with HTTP $HTTP_CODE" >> $LOG_FILE
    
    if [ ! -z "$ALERT_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \\
             --data '{"text":"🚨 TerminalOne Bot Health Check Failed - HTTP '$HTTP_CODE'"}' \\
             $ALERT_WEBHOOK
    fi
else
    echo "$(date): Health check passed" >> $LOG_FILE
fi`;

    const monitorPath = path.join(this.projectRoot, 'scripts', 'monitor.sh');
    fs.writeFileSync(monitorPath, monitorScript);
    
    if (process.platform !== 'win32') {
      // Make executable on Unix systems
      fs.chmodSync(monitorPath, 0o755);
    }
    
    console.log('✅ Monitoring script created at:', monitorPath);
    console.log('💡 Setup cron job: */5 * * * * ' + monitorPath);
  }

  async rollback() {
    console.log('🔄 Rolling back deployment...');
    
    if (this.botProcess && !this.botProcess.killed) {
      this.botProcess.kill('SIGTERM');
      console.log('✅ Bot process terminated');
    }
  }

  async stop() {
    console.log('🛑 Stopping TerminalOne bot...');
    
    if (this.botProcess && !this.botProcess.killed) {
      this.botProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      setTimeout(() => {
        if (!this.botProcess.killed) {
          this.botProcess.kill('SIGKILL');
        }
      }, 5000);
      
      console.log('✅ Bot stopped');
    }
  }
}

// CLI handling
if (require.main === module) {
  const command = process.argv[2];
  const deployment = new DeploymentManager();
  
  switch (command) {
    case 'start':
    case 'deploy':
      deployment.deploy().catch(console.error);
      break;
      
    case 'stop':
      deployment.stop().then(() => process.exit(0));
      break;
      
    default:
      console.log('Usage: node deploy.js [start|deploy|stop]');
      console.log('');
      console.log('Commands:');
      console.log('  start, deploy  - Deploy and start the bot');
      console.log('  stop           - Stop the bot');
      process.exit(1);
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Received shutdown signal...');
    await deployment.stop();
    process.exit(0);
  });
}

module.exports = DeploymentManager;