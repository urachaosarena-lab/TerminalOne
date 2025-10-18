# 🦈 TerminalOne Bot - Production Deployment Guide

## 📋 Prerequisites

Before deploying to production, ensure you have:

- ✅ Node.js 16+ installed
- ✅ Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- ✅ Solana mainnet RPC endpoint (or use public endpoint)
- ✅ Server with at least 2GB RAM
- ✅ Webhook URL for alerts (Slack/Discord recommended)

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy the production environment template
cp .env.production .env

# Edit the .env file with your actual values
nano .env
```

**Required Environment Variables:**
```bash
TELEGRAM_BOT_TOKEN=123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ADMIN_CHAT_IDS=your_telegram_user_id
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ERROR_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

### 2. Deploy with Automated Script

```bash
# Make sure you're in the project directory
cd TerminalOne

# Run the deployment script
node scripts/deploy.js deploy
```

### 3. Verify Deployment

```bash
# Run end-to-end tests
node scripts/test-e2e.js

# Check health endpoints
curl http://localhost:3001/health
curl http://localhost:3001/metrics
```

## 🔧 Manual Setup (Advanced)

### Install Dependencies
```bash
npm ci --production
```

### Start the Bot
```bash
NODE_ENV=production node src/index.js
```

### Process Management (PM2 Recommended)
```bash
npm install -g pm2

# Start with PM2
pm2 start src/index.js --name "terminalone-bot" --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints

- **Health Check**: `GET /health` - Overall system health
- **Readiness**: `GET /ready` - Service readiness
- **Liveness**: `GET /live` - Process liveness  
- **Metrics**: `GET /metrics` - Detailed system metrics

### Monitoring Setup

1. **Health Check Monitoring**:
```bash
# Setup monitoring script (runs every 5 minutes)
crontab -e

# Add this line:
*/5 * * * * /path/to/TerminalOne/scripts/monitor.sh
```

2. **Log Monitoring**:
```bash
# View real-time logs
tail -f /var/log/terminalone-monitor.log

# Or with PM2
pm2 logs terminalone-bot
```

## 🔔 Alert Configuration

### Slack Webhooks
1. Go to [Slack API](https://api.slack.com/messaging/webhooks)
2. Create a new webhook for your workspace
3. Copy the webhook URL to `ERROR_WEBHOOK_URL`

### Discord Webhooks  
1. Go to your Discord channel settings
2. Create a webhook
3. Copy the webhook URL to `ERROR_WEBHOOK_URL`

### Test Alerts
```bash
# Test webhook connectivity
node -e "
const WebhookAlertSystem = require('./src/utils/webhookAlerts');
const alerts = new WebhookAlertSystem();
alerts.testWebhook().then(success => console.log('Webhook test:', success ? 'PASS' : 'FAIL'));
"
```

## 🔒 Security Considerations

### Rate Limiting
- Default: 30 requests/minute per user
- Max concurrent users: 1000
- Automatic user blocking for abuse

### Data Protection
- Private keys encrypted and stored securely
- User sessions timeout after inactivity
- Revenue wallet uses hardware-level security

### Access Control
- Admin commands restricted by `ADMIN_CHAT_IDS`
- Production environment isolates sensitive operations
- Comprehensive error handling prevents data leaks

## 📈 Performance Optimization

### Memory Management
- Automatic memory monitoring and alerts
- User data cleanup routines
- Cache TTL optimization

### Request Optimization
- Price data caching (30s-60s TTL)
- Connection pooling for external APIs
- Efficient Solana RPC usage

## 🧪 Testing

### Pre-deployment Testing
```bash
# Run all tests
node scripts/test-e2e.js

# Test specific components
npm test
```

### Production Validation
```bash
# Verify bot responds
curl -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe

# Check Solana connectivity
node -e "
const { Connection } = require('@solana/web3.js');
const conn = new Connection('https://api.mainnet-beta.solana.com');
conn.getVersion().then(v => console.log('Solana version:', v['solana-core']));
"
```

## 📊 Revenue Tracking

The bot automatically collects a 1% fee on all Martingale strategy transactions:

- **Revenue Wallet**: `BgvbtjrHc1ciRmrPkRBHG3cqcxh14qussJaFtTG1XArK`
- **Fee Structure**: 1% with min 0.001 SOL, max 0.1 SOL per transaction
- **Analytics**: Real-time revenue tracking via `/metrics` endpoint

## 🎯 Feature Flags

Configure optional features via environment variables:

```bash
# Enable/disable features
ENABLE_HEALTH_CHECKS=true
ENABLE_RATE_LIMITING=true
ENABLE_MONITORING=true
ENABLE_REVENUE_COLLECTION=true
```

## 🆘 Troubleshooting

### Common Issues

**Bot Not Responding**:
```bash
# Check bot status
pm2 status terminalone-bot

# Check logs
pm2 logs terminalone-bot --lines 50
```

**Health Check Failures**:
```bash
# Check health endpoint
curl -v http://localhost:3001/health

# Check memory usage
free -h
```

**Solana Connectivity Issues**:
```bash
# Test RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://api.mainnet-beta.solana.com
```

### Debug Mode
```bash
# Run with debug logging
LOG_LEVEL=debug node src/index.js
```

### Emergency Shutdown
```bash
# Graceful shutdown
node scripts/deploy.js stop

# Force kill (last resort)
pkill -f "node src/index.js"
```

## 📞 Support

For production deployment support:
- Check logs first: `/var/log/terminalone-monitor.log`
- Review health metrics: `http://localhost:3001/metrics`
- Monitor webhook alerts in your configured channel

## 🔄 Updates & Maintenance

### Updating the Bot
```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm ci

# Restart with zero downtime (PM2)
pm2 reload terminalone-bot
```

### Database Backups (Future)
When database integration is added, implement regular backups of user configurations and strategy history.

---

**🦈 TerminalOne Bot** - Your Premium Solana Trading Terminal

*Ready to dominate the markets? Deploy with confidence!*