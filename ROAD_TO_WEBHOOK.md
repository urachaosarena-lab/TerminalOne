# 🚀 Road to Webhook: Rate Limiting & Performance Optimization

**Created:** 2025-11-19  
**Status:** Pending Implementation  
**Priority:** HIGH - Addresses critical rate limiting issues (610K+ 429 errors)

---

## 📊 Current Problem Summary

- **Issue:** Bot hitting Telegram API rate limits constantly
- **Impact:** 610,541+ HTTP 429 errors accumulated
- **Symptoms:** 
  - Memory growth: 22 MB → 219 MB over 12 hours
  - 73 bot restarts
  - Slow response times
  - Retry storm feedback loops

**Root Cause:**
1. Long polling makes continuous `getUpdates` calls to Telegram
2. When rate limited (429), Telegraf retries automatically
3. Retries also get rate limited, creating exponential retry storm
4. Background monitoring loops (5 active strategies × 2 API calls/minute)
5. No global request throttling

---

## ✅ Immediate Steps (COMPLETED)

### Step 1: Increase Monitoring Interval ✅
**Status:** COMPLETED  
**Impact:** 50% reduction in monitoring API calls

**What was changed:**
- File: `src/services/MartingaleStrategy.js`
- Changed: `setInterval(..., 30000)` → `setInterval(..., 60000)`
- Result: Monitoring checks reduced from every 30s to every 60s

**Expected outcome:**
- 5 strategies × 2 checks/min → 5 strategies × 1 check/min
- 50% reduction in price API calls

### Step 2: Restart Bot ✅
**Status:** Will execute after pushing changes  
**Command:** `pm2 restart terminalone-bot`

**Purpose:**
- Clears retry queue in memory
- Resets rate limit counters
- Applies new 60s monitoring interval

---

## 🎯 Short-term Steps (This Week)

### Step 3: Implement Global Rate Limiter
**Priority:** HIGH  
**Effort:** 2-3 hours  
**Impact:** Prevents burst requests, respects Telegram limits

**Implementation:**

#### A. Create Rate Limiter Wrapper

Create new file: `src/utils/TelegramAPIWrapper.js`

```javascript
const logger = require('./logger');

class TelegramAPIWrapper {
  constructor(telegram) {
    this.telegram = telegram;
    this.queue = [];
    this.processing = false;
    this.lastCall = 0;
    this.minDelay = 100; // 100ms between calls = max 10 calls/sec
    this.requestsInWindow = [];
    this.windowSize = 1000; // 1 second window
    this.maxRequestsPerWindow = 20; // Max 20 requests per second
  }

  /**
   * Queue a Telegram API call with rate limiting
   */
  async queueCall(method, ...args) {
    return new Promise((resolve, reject) => {
      this.queue.push({ method, args, resolve, reject, timestamp: Date.now() });
      this.processQueue();
    });
  }

  /**
   * Process queued API calls with rate limiting
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { method, args, resolve, reject, timestamp } = this.queue.shift();
    
    // Clean up old requests from tracking window
    const now = Date.now();
    this.requestsInWindow = this.requestsInWindow.filter(t => now - t < this.windowSize);
    
    // Check if we're at the rate limit
    if (this.requestsInWindow.length >= this.maxRequestsPerWindow) {
      const oldestRequest = this.requestsInWindow[0];
      const waitTime = this.windowSize - (now - oldestRequest);
      if (waitTime > 0) {
        logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(r => setTimeout(r, waitTime));
      }
      this.requestsInWindow = []; // Reset window
    }
    
    // Ensure minimum delay between calls
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.minDelay) {
      await new Promise(r => setTimeout(r, this.minDelay - timeSinceLastCall));
    }
    
    // Execute the API call
    try {
      const result = await this.telegram[method](...args);
      this.lastCall = Date.now();
      this.requestsInWindow.push(this.lastCall);
      resolve(result);
    } catch (error) {
      if (error.code === 429) {
        // Rate limited - requeue with exponential backoff
        const retryAfter = error.parameters?.retry_after || 5;
        logger.warn(`Rate limited, retrying after ${retryAfter}s`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        this.queue.unshift({ method, args, resolve, reject, timestamp }); // Put back at front
      } else {
        reject(error);
      }
    }
    
    this.processing = false;
    
    // Process next item in queue
    if (this.queue.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Convenience methods for common operations
   */
  sendMessage(...args) {
    return this.queueCall('sendMessage', ...args);
  }

  editMessageText(...args) {
    return this.queueCall('editMessageText', ...args);
  }

  answerCbQuery(...args) {
    return this.queueCall('answerCbQuery', ...args);
  }

  deleteMessage(...args) {
    return this.queueCall('deleteMessage', ...args);
  }
}

module.exports = TelegramAPIWrapper;
```

#### B. Integrate into Bot

Modify `src/index.js`:

```javascript
const TelegramAPIWrapper = require('./utils/TelegramAPIWrapper');

class TerminalOneBot {
  constructor() {
    this.bot = new Telegraf(config.telegram.token);
    
    // Wrap Telegram API with rate limiter
    this.telegramAPI = new TelegramAPIWrapper(this.bot.telegram);
    
    // Replace bot.telegram with wrapped version
    this.bot.telegram = this.telegramAPI;
    
    // ... rest of constructor
  }
}
```

#### C. Update Services

Modify `src/services/NotificationService.js`:

```javascript
async notify(userId, eventType, message, options = {}) {
  // ... existing code ...
  
  // Use wrapped API (automatically rate-limited)
  await this.bot.telegram.sendMessage(userId, notification.text, notification);
  
  // ... rest of method
}
```

**Testing:**
1. Deploy changes
2. Monitor logs for "Rate limit reached" messages
3. Verify no more 429 errors
4. Check response times remain acceptable

---

### Step 4: Disable/Tune Telegraf Auto-Retry
**Priority:** HIGH  
**Effort:** 2 hours  
**Impact:** Prevents retry storms

**Implementation:**

Modify `src/index.js`:

```javascript
const { Telegraf } = require('telegraf');

class TerminalOneBot {
  constructor() {
    // Create bot with custom retry configuration
    this.bot = new Telegraf(config.telegram.token, {
      telegram: {
        apiRoot: 'https://api.telegram.org',
        webhookReply: false,
        agent: null,
        // Disable automatic retry
        attachmentAgent: null
      },
      // Set reasonable timeout
      handlerTimeout: 90000 // 90 seconds
    });
    
    // Implement manual retry logic with better backoff
    this.setupRetryHandler();
    
    // ... rest of constructor
  }

  setupRetryHandler() {
    // Intercept errors and handle 429s manually
    this.bot.catch((err, ctx) => {
      if (err.code === 429) {
        const retryAfter = err.parameters?.retry_after || 30;
        logger.warn(`Rate limited by Telegram, cooling down for ${retryAfter}s`);
        
        // Don't retry immediately - let it fail gracefully
        // User will see the response delayed or need to retry manually
        return;
      }
      
      // Log other errors
      logger.error('Bot error:', err);
    });
  }
}
```

**Benefits:**
- No more automatic retry storms
- Failed messages fail gracefully
- System stabilizes when rate limited
- Manual retry has better backoff strategy

---

### Step 5: Implement Circuit Breaker
**Priority:** MEDIUM  
**Effort:** 2 hours  
**Impact:** Auto-recovery from rate limit cascades

**Implementation:**

Create new file: `src/utils/CircuitBreaker.js`

```javascript
const logger = require('./logger');

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 3;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    // Check circuit state
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Retry after ${new Date(this.nextAttemptTime).toISOString()}`);
      }
      
      // Transition to HALF_OPEN
      this.state = 'HALF_OPEN';
      this.successCount = 0;
      logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        logger.info(`Circuit breaker ${this.name} recovered to CLOSED`);
      }
    }
  }

  onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    // Only trip on rate limit errors
    if (error.code === 429) {
      if (this.state === 'HALF_OPEN') {
        this.open();
      } else if (this.failureCount >= this.failureThreshold) {
        this.open();
      }
    }
  }

  open() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.timeout;
    logger.warn(`Circuit breaker ${this.name} opened due to failures. Will retry at ${new Date(this.nextAttemptTime).toISOString()}`);
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    logger.info(`Circuit breaker ${this.name} manually reset`);
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

module.exports = CircuitBreaker;
```

Integrate into `TelegramAPIWrapper.js`:

```javascript
const CircuitBreaker = require('./CircuitBreaker');

class TelegramAPIWrapper {
  constructor(telegram) {
    // ... existing code ...
    
    this.circuitBreaker = new CircuitBreaker('TelegramAPI', {
      failureThreshold: 10,
      timeout: 60000 // 1 minute cooldown
    });
  }

  async processQueue() {
    // ... existing code ...
    
    // Wrap API call in circuit breaker
    try {
      const result = await this.circuitBreaker.execute(async () => {
        return await this.telegram[method](...args);
      });
      
      this.lastCall = Date.now();
      this.requestsInWindow.push(this.lastCall);
      resolve(result);
    } catch (error) {
      // ... existing error handling ...
    }
  }
}
```

---

## 🎯 Long-term Steps (Next Sprint)

### Step 6: Switch to Webhook Mode ⭐ RECOMMENDED
**Priority:** CRITICAL  
**Effort:** 4-6 hours  
**Impact:** 🔥🔥🔥 VERY HIGH - Eliminates 90% of API calls

**Why Webhooks?**
- **Long Polling:** Bot constantly asks Telegram "Any updates?" (getUpdates calls)
- **Webhooks:** Telegram pushes updates directly to your server (no polling needed)
- **Result:** Massive reduction in API traffic

#### Prerequisites

1. **Domain Name**
   - Example: `terminalone-bot.yourdomain.com`
   - Can use subdomain of existing domain
   - OR use services like DuckDNS (free)

2. **SSL Certificate**
   - Let's Encrypt (free, recommended)
   - OR Cloudflare Tunnel (free, easy)
   - OR self-signed (Telegram accepts for testing)

3. **Open Port**
   - Need to expose port (e.g., 443 or 8443)
   - Configure firewall on Hetzner
   - Set up reverse proxy (nginx/caddy)

#### Implementation Options

**Option A: Nginx + Let's Encrypt (Traditional)**

1. **Install Nginx**
```bash
apt-get update
apt-get install nginx certbot python3-certbot-nginx
```

2. **Get SSL Certificate**
```bash
certbot --nginx -d terminalone-bot.yourdomain.com
```

3. **Configure Nginx**
```nginx
# /etc/nginx/sites-available/terminalone-bot
server {
    listen 443 ssl http2;
    server_name terminalone-bot.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/terminalone-bot.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/terminalone-bot.yourdomain.com/privkey.pem;

    location /bot {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. **Update Bot Code**
```javascript
// src/index.js
async start() {
  if (config.telegram.useWebhook) {
    const webhookDomain = config.telegram.webhookDomain;
    const webhookPath = config.telegram.webhookPath || '/bot';
    const port = config.telegram.webhookPort || 3000;
    
    await this.bot.launch({
      webhook: {
        domain: webhookDomain,
        port: port,
        hookPath: webhookPath
      }
    });
    
    logger.info(`Bot running on webhook: ${webhookDomain}${webhookPath}`);
  } else {
    // Fallback to polling
    await this.bot.launch();
    logger.info('Bot running with long polling');
  }
}
```

5. **Update Config**
```javascript
// config/config.js
module.exports = {
  telegram: {
    token: process.env.TELEGRAM_TOKEN,
    useWebhook: process.env.USE_WEBHOOK === 'true',
    webhookDomain: process.env.WEBHOOK_DOMAIN, // https://terminalone-bot.yourdomain.com
    webhookPath: process.env.WEBHOOK_PATH || '/bot',
    webhookPort: parseInt(process.env.WEBHOOK_PORT) || 3000
  }
};
```

6. **Update .env**
```bash
USE_WEBHOOK=true
WEBHOOK_DOMAIN=https://terminalone-bot.yourdomain.com
WEBHOOK_PATH=/bot
WEBHOOK_PORT=3000
```

**Option B: Cloudflare Tunnel (Easiest, No Domain Needed)**

1. **Install Cloudflared**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared-linux-amd64.deb
```

2. **Login and Create Tunnel**
```bash
cloudflared tunnel login
cloudflared tunnel create terminalone-bot
```

3. **Configure Tunnel**
```yaml
# ~/.cloudflared/config.yml
tunnel: YOUR_TUNNEL_ID
credentials-file: /root/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: terminalone-bot.yourdomain.cfargotunnel.com
    service: http://localhost:3000
  - service: http_status:404
```

4. **Run Tunnel**
```bash
cloudflared tunnel run terminalone-bot
```

5. **Update Bot** (same as Option A)

**Option C: Self-Signed Certificate (Testing Only)**

```javascript
const fs = require('fs');
const https = require('https');

async start() {
  const tlsOptions = {
    key: fs.readFileSync('server-key.pem'),
    cert: fs.readFileSync('server-cert.pem')
  };

  await this.bot.launch({
    webhook: {
      domain: 'https://YOUR_SERVER_IP',
      port: 8443,
      tlsOptions: tlsOptions
    }
  });
}
```

#### Testing Webhook Setup

```bash
# Check if Telegram can reach your webhook
curl -F "url=https://terminalone-bot.yourdomain.com/bot" \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook

# Verify webhook is set
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo

# Expected response:
# {
#   "ok": true,
#   "result": {
#     "url": "https://terminalone-bot.yourdomain.com/bot",
#     "has_custom_certificate": false,
#     "pending_update_count": 0
#   }
# }
```

#### Rollback Plan

If webhook setup fails:

```javascript
// Disable webhook and return to polling
await bot.telegram.deleteWebhook();

// Or in .env
USE_WEBHOOK=false

// Restart bot
pm2 restart terminalone-bot
```

---

### Step 7: Optimize Batch Monitoring
**Priority:** MEDIUM  
**Effort:** 3-4 hours  
**Impact:** Further reduces API calls

**Current Issue:**
- Each strategy checks prices independently
- 5 strategies = 5 separate API calls
- Even if checking same token multiple times

**Solution:**
Batch all monitoring into single interval that fetches unique tokens once

**Implementation:**

Modify `src/services/MartingaleStrategy.js`:

```javascript
class MartingaleStrategy {
  constructor(...) {
    // ... existing code ...
    
    // Global monitoring interval instead of per-strategy
    this.globalMonitoringInterval = null;
    this.startGlobalMonitoring();
  }

  /**
   * Start global monitoring for all active strategies
   */
  startGlobalMonitoring() {
    if (this.globalMonitoringInterval) return;
    
    this.globalMonitoringInterval = setInterval(async () => {
      await this.monitorAllStrategies();
    }, 60000); // Check every 60 seconds
    
    logger.info('Started global strategy monitoring');
  }

  /**
   * Monitor all active strategies in batch
   */
  async monitorAllStrategies() {
    // Collect all active strategies
    const allStrategies = [];
    this.activeStrategies.forEach((strategies) => {
      const active = strategies.filter(s => s.status === 'active');
      allStrategies.push(...active);
    });

    if (allStrategies.length === 0) return;

    // Get unique token addresses
    const uniqueTokens = [...new Set(allStrategies.map(s => s.tokenAddress))];
    
    // Fetch all prices in parallel (but only once per token)
    const pricePromises = uniqueTokens.map(async (address) => {
      try {
        const price = await this.priceService.getTokenPrice(address);
        return { address, price };
      } catch (error) {
        logger.error(`Failed to fetch price for ${address}:`, error);
        return { address, price: null };
      }
    });

    const prices = await Promise.all(pricePromises);
    const priceMap = new Map(prices.map(p => [p.address, p.price]));

    // Also fetch SOL price once (needed for profit calculations)
    const solPrice = await this.priceService.getSolanaPrice();

    // Update all strategies with their respective prices
    for (const strategy of allStrategies) {
      const priceData = priceMap.get(strategy.tokenAddress);
      if (priceData) {
        try {
          // Pass solPrice to avoid refetching
          await this.handlePriceUpdate(strategy, priceData, solPrice);
        } catch (error) {
          logger.error(`Error updating strategy ${strategy.id}:`, error);
        }
      }
    }

    logger.debug(`Monitored ${allStrategies.length} strategies, fetched ${uniqueTokens.length} unique token prices`);
  }

  /**
   * Handle price update (modified to accept optional solPrice)
   */
  async handlePriceUpdate(strategy, priceData, solPrice = null) {
    if (strategy.status !== 'active') return;

    const currentPrice = priceData.price;
    strategy.lastCheck = new Date();

    // ... existing price tracking ...

    // Check for profit target (use cached SOL price if provided)
    await this.checkProfitTarget(strategy, currentPrice, solPrice);

    // ... rest of method ...
  }

  /**
   * DEPRECATED: Old per-strategy monitoring
   * Keep for backwards compatibility but don't use
   */
  async startStrategyMonitoring(strategy) {
    // Global monitoring handles this now
    logger.debug(`Strategy ${strategy.id} will be monitored globally`);
  }
}
```

**Benefits:**
- 5 strategies checking same token = 1 API call (not 5)
- SOL price fetched once per cycle (not per strategy)
- Easier to add more strategies without linear API growth

**Example:**
- Before: 5 strategies × 2 API calls = 10 calls/minute
- After: 1 batch cycle × (unique tokens + 1 SOL price) = ~3 calls/minute
- **Savings: 70% reduction**

---

## 📈 Expected Impact Summary

| Solution | API Call Reduction | Implementation Time | Priority |
|----------|-------------------|---------------------|----------|
| ✅ Increase interval (30s→60s) | 50% | 5 minutes | DONE |
| Step 3: Global rate limiter | Prevents bursts | 2-3 hours | HIGH |
| Step 4: Disable auto-retry | Stops retry storms | 2 hours | HIGH |
| Step 5: Circuit breaker | Auto-recovery | 2 hours | MEDIUM |
| Step 6: **Webhook mode** | **90%** | 4-6 hours | **CRITICAL** |
| Step 7: Batch monitoring | 70% (additional) | 3-4 hours | MEDIUM |

**Combined Impact:**
- Current: ~20 API calls/minute + constant polling
- After all steps: ~3 API calls/minute + no polling
- **Total reduction: ~95%+ of API traffic**

---

## 🚨 Monitoring & Validation

After each step, verify:

```bash
# Check for 429 errors
ssh root@178.156.196.9 "grep -c '429' /root/.pm2/logs/terminalone-bot-error.log"

# Monitor memory usage
ssh root@178.156.196.9 "pm2 status"

# Check bot responsiveness
# Send test message to bot and measure response time

# View real-time logs
ssh root@178.156.196.9 "pm2 logs terminalone-bot --lines 50"
```

**Success Criteria:**
- ✅ Zero 429 errors for 24 hours
- ✅ Memory stable under 100 MB
- ✅ Response time under 2 seconds
- ✅ No unexpected restarts

---

## 📞 Support & Resources

**Telegram Bot API Docs:**
- [Webhooks Guide](https://core.telegram.org/bots/webhooks)
- [Rate Limiting](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)

**Telegraf Docs:**
- [Webhook Setup](https://telegraf.js.org/#/?id=webhooks)
- [Configuration](https://telegraf.js.org/#/?id=configuration)

**Let's Encrypt:**
- [Certbot](https://certbot.eff.org/)

**Cloudflare Tunnel:**
- [Setup Guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

---

## 🎯 Next Steps

1. ✅ Complete immediate fixes (monitoring interval + restart)
2. Schedule time for Steps 3-5 (this week, ~6 hours total)
3. Plan webhook infrastructure (domain, SSL, port)
4. Implement webhook mode (Step 6)
5. Optimize batch monitoring (Step 7)
6. Monitor and validate for 1 week

**Estimated Total Time:** 15-20 hours  
**Expected Outcome:** Stable, fast bot with no rate limiting issues
