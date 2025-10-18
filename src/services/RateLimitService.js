const logger = require('../utils/logger');
const config = require('../../config/config');

class RateLimitService {
  constructor() {
    this.userRequests = new Map(); // userId -> { count, resetTime, blocked }
    this.globalRequests = new Map(); // timeWindow -> requestCount
    this.blockedUsers = new Set(); // Temporarily blocked users
    
    // Configuration
    this.windowMs = config.bot.rateLimitWindowMs;
    this.maxRequests = config.bot.rateLimitMaxRequests;
    this.maxConcurrentUsers = config.bot.maxConcurrentUsers;
    
    // Cleanup intervals
    this.setupCleanup();
  }
  
  /**
   * Check if user is within rate limits
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    
    // Check if user is blocked
    if (this.blockedUsers.has(userId)) {
      return {
        allowed: false,
        reason: 'temporarily_blocked',
        retryAfter: this.windowMs,
        remaining: 0
      };
    }
    
    // Get or create user request data
    if (!this.userRequests.has(userId)) {
      this.userRequests.set(userId, {
        count: 0,
        resetTime: windowStart + this.windowMs,
        firstRequest: now
      });
    }
    
    const userData = this.userRequests.get(userId);
    
    // Reset counter if window has passed
    if (now >= userData.resetTime) {
      userData.count = 0;
      userData.resetTime = windowStart + this.windowMs;
    }
    
    // Check if user has exceeded limit
    if (userData.count >= this.maxRequests) {
      // Block user for this window
      this.blockedUsers.add(userId);
      
      logger.warn(`Rate limit exceeded for user ${userId}`, {
        requests: userData.count,
        limit: this.maxRequests,
        windowMs: this.windowMs
      });
      
      return {
        allowed: false,
        reason: 'rate_limit_exceeded',
        retryAfter: userData.resetTime - now,
        remaining: 0
      };
    }
    
    // Check global concurrent users
    if (this.userRequests.size >= this.maxConcurrentUsers) {
      return {
        allowed: false,
        reason: 'server_busy',
        retryAfter: 30000, // 30 seconds
        remaining: userData.count
      };
    }
    
    // Allow request and increment counter
    userData.count++;
    
    return {
      allowed: true,
      remaining: this.maxRequests - userData.count,
      resetTime: userData.resetTime
    };
  }
  
  /**
   * Record a request for a user
   */
  recordRequest(userId, requestType = 'general') {
    const result = this.checkRateLimit(userId);
    
    // Track global request patterns
    const now = Date.now();
    const hourKey = Math.floor(now / (60 * 60 * 1000)); // Hour-based key
    
    if (!this.globalRequests.has(hourKey)) {
      this.globalRequests.set(hourKey, {
        total: 0,
        byType: {},
        uniqueUsers: new Set()
      });
    }
    
    const hourData = this.globalRequests.get(hourKey);
    hourData.total++;
    hourData.byType[requestType] = (hourData.byType[requestType] || 0) + 1;
    hourData.uniqueUsers.add(userId);
    
    return result;
  }
  
  /**
   * Create middleware for Telegraf bot
   */
  createMiddleware() {
    return async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId) {
        return next();
      }
      
      const requestType = this.getRequestType(ctx);
      const result = this.recordRequest(userId, requestType);
      
      if (!result.allowed) {
        const message = this.getRateLimitMessage(result);
        await ctx.reply(message);
        return;
      }
      
      // Add rate limit info to context
      ctx.rateLimit = result;
      
      return next();
    };
  }
  
  /**
   * Get request type from context
   */
  getRequestType(ctx) {
    if (ctx.message?.text) {
      if (ctx.message.text.startsWith('/')) {
        return 'command';
      }
      return 'message';
    }
    
    if (ctx.callbackQuery?.data) {
      const data = ctx.callbackQuery.data;
      if (data.includes('martingale')) return 'martingale';
      if (data.includes('wallet')) return 'wallet';
      if (data.includes('config')) return 'config';
      return 'callback';
    }
    
    return 'other';
  }
  
  /**
   * Get user-friendly rate limit message
   */
  getRateLimitMessage(result) {
    switch (result.reason) {
      case 'rate_limit_exceeded':
        const minutes = Math.ceil(result.retryAfter / (60 * 1000));
        return `🚦 **Rate Limit Exceeded**\n\n⏰ You've reached the limit of ${this.maxRequests} requests per minute.\n\n🕒 Please wait ${minutes} minute(s) before trying again.\n\n💡 **Tip:** Use the bot more slowly to avoid limits.`;
      
      case 'temporarily_blocked':
        return `🚫 **Temporarily Blocked**\n\n⏱️ You've been temporarily blocked due to excessive requests.\n\n🕒 Please wait a moment and try again.\n\n📞 If you think this is an error, contact support.`;
      
      case 'server_busy':
        return `🏢 **Server Busy**\n\n📊 The server is currently handling maximum capacity.\n\n⏳ Please try again in 30 seconds.\n\n💪 We're working to serve everyone!`;
      
      default:
        return '❌ Request not allowed. Please try again later.';
    }
  }
  
  /**
   * Setup automatic cleanup
   */
  setupCleanup() {
    // Clean up expired user data every minute
    setInterval(() => {
      const now = Date.now();
      const toDelete = [];
      
      for (const [userId, userData] of this.userRequests.entries()) {
        // Remove inactive users (no requests in last hour)
        if (now - userData.firstRequest > 60 * 60 * 1000 && userData.count === 0) {
          toDelete.push(userId);
        }
        
        // Unblock users after window expires
        if (now >= userData.resetTime && this.blockedUsers.has(userId)) {
          this.blockedUsers.delete(userId);
        }
      }
      
      toDelete.forEach(userId => this.userRequests.delete(userId));
      
      if (toDelete.length > 0) {
        logger.info(`Cleaned up ${toDelete.length} inactive users from rate limiter`);
      }
    }, 60 * 1000);
    
    // Clean up old global request data every hour
    setInterval(() => {
      const now = Date.now();
      const currentHour = Math.floor(now / (60 * 60 * 1000));
      const toDelete = [];
      
      for (const hourKey of this.globalRequests.keys()) {
        // Keep only last 24 hours
        if (currentHour - hourKey > 24) {
          toDelete.push(hourKey);
        }
      }
      
      toDelete.forEach(hourKey => this.globalRequests.delete(hourKey));
      
      if (toDelete.length > 0) {
        logger.info(`Cleaned up ${toDelete.length} hours of global request data`);
      }
    }, 60 * 60 * 1000);
  }
  
  /**
   * Get current statistics
   */
  getStats() {
    const now = Date.now();
    const currentHour = Math.floor(now / (60 * 60 * 1000));
    const currentHourData = this.globalRequests.get(currentHour) || { total: 0, byType: {}, uniqueUsers: new Set() };
    
    // Active users (made request in last window)
    const activeUsers = Array.from(this.userRequests.entries())
      .filter(([_, userData]) => now - userData.firstRequest < this.windowMs)
      .length;
    
    return {
      activeUsers,
      blockedUsers: this.blockedUsers.size,
      totalUsers: this.userRequests.size,
      currentHourRequests: currentHourData.total,
      currentHourUsers: currentHourData.uniqueUsers.size,
      requestsByType: currentHourData.byType,
      rateLimitConfig: {
        windowMs: this.windowMs,
        maxRequests: this.maxRequests,
        maxConcurrentUsers: this.maxConcurrentUsers
      }
    };
  }
  
  /**
   * Get user-specific statistics
   */
  getUserStats(userId) {
    const userData = this.userRequests.get(userId);
    if (!userData) {
      return {
        isActive: false,
        requestsInWindow: 0,
        remainingRequests: this.maxRequests,
        isBlocked: false
      };
    }
    
    const now = Date.now();
    const isInCurrentWindow = now < userData.resetTime;
    
    return {
      isActive: true,
      requestsInWindow: isInCurrentWindow ? userData.count : 0,
      remainingRequests: isInCurrentWindow ? this.maxRequests - userData.count : this.maxRequests,
      isBlocked: this.blockedUsers.has(userId),
      resetTime: userData.resetTime,
      timeUntilReset: Math.max(0, userData.resetTime - now)
    };
  }
  
  /**
   * Manually block a user (admin function)
   */
  blockUser(userId, duration = this.windowMs) {
    this.blockedUsers.add(userId);
    
    // Auto-unblock after duration
    setTimeout(() => {
      this.blockedUsers.delete(userId);
      logger.info(`Auto-unblocked user ${userId}`);
    }, duration);
    
    logger.warn(`Manually blocked user ${userId} for ${duration}ms`);
  }
  
  /**
   * Manually unblock a user (admin function)
   */
  unblockUser(userId) {
    const wasBlocked = this.blockedUsers.delete(userId);
    if (wasBlocked) {
      logger.info(`Manually unblocked user ${userId}`);
    }
    return wasBlocked;
  }
  
  /**
   * Reset user's rate limit (admin function)
   */
  resetUserLimit(userId) {
    this.userRequests.delete(userId);
    this.blockedUsers.delete(userId);
    logger.info(`Reset rate limit for user ${userId}`);
  }
}

module.exports = RateLimitService;