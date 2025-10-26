const logger = require('../utils/logger');

/**
 * Rate limiter to prevent abuse and DOS attacks
 * Tracks requests per user per operation type
 */
class RateLimiter {
  constructor() {
    // Store: userId -> operationType -> { count, resetTime }
    this.limits = new Map();
    
    // Rate limit configurations (requests per hour)
    this.limitConfig = {
      // Trading operations
      'trade': 50,
      'swap': 50,
      'strategy_create': 30,
      'strategy_execute': 50,
      
      // Wallet operations
      'wallet_create': 5,
      'wallet_import': 5,
      'wallet_export': 10,
      
      // Battle operations
      'battle_start': 50,
      'battle_action': 100,
      
      // Item operations
      'item_fusion': 30,
      'item_craft': 30,
      
      // General API calls
      'api_call': 100,
      
      // Fee collection
      'fee_collection': 10
    };
    
    // Cleanup old entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
    
    logger.info('🛡️ Rate limiter initialized with generous limits');
  }

  /**
   * Check if user is within rate limit for operation
   * @param {string} userId - User identifier
   * @param {string} operationType - Type of operation
   * @returns {Object} { allowed: boolean, remaining: number, resetTime: Date }
   */
  checkLimit(userId, operationType = 'api_call') {
    const key = `${userId}:${operationType}`;
    const limit = this.limitConfig[operationType] || this.limitConfig.api_call;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Get or create user limit entry
    if (!this.limits.has(key)) {
      this.limits.set(key, {
        count: 0,
        resetTime: now + oneHour
      });
    }

    const userLimit = this.limits.get(key);

    // Reset if time window expired
    if (now >= userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + oneHour;
    }

    // Check if under limit
    if (userLimit.count < limit) {
      userLimit.count++;
      return {
        allowed: true,
        remaining: limit - userLimit.count,
        resetTime: new Date(userLimit.resetTime),
        limit
      };
    }

    // Rate limit exceeded
    logger.warn(`⚠️ Rate limit exceeded for user ${userId}, operation: ${operationType}`);
    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(userLimit.resetTime),
      limit
    };
  }

  /**
   * Telegram bot middleware wrapper
   */
  middleware(operationType = 'api_call') {
    return async (ctx, next) => {
      const userId = ctx.from?.id?.toString();
      
      if (!userId) {
        logger.warn('Rate limiter: No user ID found in context');
        return next();
      }

      const result = this.checkLimit(userId, operationType);

      if (!result.allowed) {
        const minutesUntilReset = Math.ceil((result.resetTime - Date.now()) / 60000);
        await ctx.reply(
          `⚠️ Rate limit exceeded!\n\n` +
          `You've reached the limit of ${result.limit} requests per hour for this operation.\n` +
          `Please try again in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''}.`,
          { parse_mode: 'Markdown' }
        );
        return; // Don't call next()
      }

      // Log remaining requests for resource-intensive operations
      if (['trade', 'swap', 'battle_start', 'fee_collection'].includes(operationType)) {
        logger.debug(`User ${userId} - ${operationType}: ${result.remaining}/${result.limit} remaining`);
      }

      return next();
    };
  }

  /**
   * Manual check without middleware (for use in services)
   */
  async enforceLimit(userId, operationType = 'api_call') {
    const result = this.checkLimit(userId, operationType);
    
    if (!result.allowed) {
      const minutesUntilReset = Math.ceil((result.resetTime - Date.now()) / 60000);
      throw new Error(
        `Rate limit exceeded. You've reached the limit of ${result.limit} requests per hour. ` +
        `Try again in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''}.`
      );
    }
    
    return result;
  }

  /**
   * Get current usage for a user
   */
  getUsage(userId, operationType = 'api_call') {
    const key = `${userId}:${operationType}`;
    const limit = this.limitConfig[operationType] || this.limitConfig.api_call;
    
    if (!this.limits.has(key)) {
      return {
        count: 0,
        limit,
        remaining: limit,
        resetTime: new Date(Date.now() + 60 * 60 * 1000)
      };
    }

    const userLimit = this.limits.get(key);
    return {
      count: userLimit.count,
      limit,
      remaining: Math.max(0, limit - userLimit.count),
      resetTime: new Date(userLimit.resetTime)
    };
  }

  /**
   * Reset limit for specific user and operation (admin function)
   */
  resetLimit(userId, operationType = null) {
    if (operationType) {
      const key = `${userId}:${operationType}`;
      this.limits.delete(key);
      logger.info(`Reset rate limit for user ${userId}, operation: ${operationType}`);
    } else {
      // Reset all operations for user
      for (const key of this.limits.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.limits.delete(key);
        }
      }
      logger.info(`Reset all rate limits for user ${userId}`);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.limits.entries()) {
      if (now >= value.resetTime + 60 * 60 * 1000) { // 1 hour after reset
        this.limits.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Rate limiter cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      totalEntries: this.limits.size,
      byOperation: {}
    };

    for (const key of this.limits.keys()) {
      const operation = key.split(':')[1];
      stats.byOperation[operation] = (stats.byOperation[operation] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

module.exports = rateLimiter;
