const logger = require('../utils/logger');
const config = require('../../config/config');

class ErrorHandlingService {
  constructor() {
    this.errorCounts = new Map(); // userId -> error count
    this.errorHistory = []; // Array of error objects
    this.isProduction = config.bot.environment === 'production';
    
    // Error categories
    this.ERROR_CATEGORIES = {
      NETWORK: 'network',
      VALIDATION: 'validation', 
      WALLET: 'wallet',
      TRADING: 'trading',
      SYSTEM: 'system',
      USER: 'user'
    };
    
    // Setup automatic cleanup
    this.setupCleanup();
  }

  /**
   * Handle and categorize errors
   */
  async handleError(error, context = {}) {
    try {
      const errorInfo = this.categorizeError(error);
      const userId = context.userId || 'system';
      
      // Log the error
      logger.error('Error occurred:', {
        category: errorInfo.category,
        message: errorInfo.message,
        userId,
        context,
        stack: this.isProduction ? undefined : error.stack
      });
      
      // Track error count per user
      const userErrorCount = this.errorCounts.get(userId) || 0;
      this.errorCounts.set(userId, userErrorCount + 1);
      
      // Add to error history
      this.errorHistory.push({
        timestamp: new Date(),
        category: errorInfo.category,
        message: errorInfo.message,
        userId,
        context,
        handled: true
      });
      
      // Keep only last 1000 errors
      if (this.errorHistory.length > 1000) {
        this.errorHistory.shift();
      }
      
      // Send error alerts if configured
      await this.sendErrorAlert(errorInfo, context);
      
      // Return user-friendly message
      return this.getUserFriendlyMessage(errorInfo);
      
    } catch (handlingError) {
      logger.error('Error in error handler:', handlingError);
      return '❌ An unexpected error occurred. Please try again later.';
    }
  }
  
  /**
   * Categorize errors for better handling
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    // Network errors
    if (message.includes('network') || message.includes('timeout') || 
        message.includes('connection') || message.includes('enotfound')) {
      return {
        category: this.ERROR_CATEGORIES.NETWORK,
        message: error.message,
        retryable: true
      };
    }
    
    // Wallet errors
    if (message.includes('wallet') || message.includes('private key') || 
        message.includes('insufficient') || message.includes('balance')) {
      return {
        category: this.ERROR_CATEGORIES.WALLET,
        message: error.message,
        retryable: false
      };
    }
    
    // Trading errors
    if (message.includes('trade') || message.includes('swap') || 
        message.includes('slippage') || message.includes('jupiter')) {
      return {
        category: this.ERROR_CATEGORIES.TRADING,
        message: error.message,
        retryable: true
      };
    }
    
    // Validation errors
    if (message.includes('invalid') || message.includes('validation') || 
        message.includes('format') || message.includes('range')) {
      return {
        category: this.ERROR_CATEGORIES.VALIDATION,
        message: error.message,
        retryable: false
      };
    }
    
    // System errors
    return {
      category: this.ERROR_CATEGORIES.SYSTEM,
      message: error.message,
      retryable: false
    };
  }
  
  /**
   * Get user-friendly error messages
   */
  getUserFriendlyMessage(errorInfo) {
    const messages = {
      [this.ERROR_CATEGORIES.NETWORK]: '🌐 Network connectivity issue. Please try again in a moment.',
      [this.ERROR_CATEGORIES.WALLET]: '💳 Wallet error. Please check your wallet configuration.',
      [this.ERROR_CATEGORIES.TRADING]: '📈 Trading service temporarily unavailable. Please try again later.',
      [this.ERROR_CATEGORIES.VALIDATION]: '⚠️ Invalid input. Please check your data and try again.',
      [this.ERROR_CATEGORIES.SYSTEM]: '⚙️ System error occurred. Our team has been notified.',
      [this.ERROR_CATEGORIES.USER]: '👤 Please check your input and try again.'
    };
    
    return messages[errorInfo.category] || '❌ An unexpected error occurred. Please try again later.';
  }
  
  /**
   * Send error alerts to configured webhook
   */
  async sendErrorAlert(errorInfo, context) {
    if (!config.production.errorReporting.enabled || !config.production.errorReporting.webhookUrl) {
      return;
    }
    
    // Only alert on system errors or high error rates
    if (errorInfo.category !== this.ERROR_CATEGORIES.SYSTEM && 
        this.getRecentErrorRate() < config.production.monitoring.alertThresholds.errorRate) {
      return;
    }
    
    try {
      const axios = require('axios');
      await axios.post(config.production.errorReporting.webhookUrl, {
        text: `🚨 TerminalOne Error Alert`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'Category', value: errorInfo.category, short: true },
            { title: 'Message', value: errorInfo.message, short: false },
            { title: 'User ID', value: context.userId || 'system', short: true },
            { title: 'Error Rate', value: `${(this.getRecentErrorRate() * 100).toFixed(2)}%`, short: true }
          ],
          timestamp: Math.floor(Date.now() / 1000)
        }]
      });
    } catch (alertError) {
      logger.error('Failed to send error alert:', alertError);
    }
  }
  
  /**
   * Get recent error rate (last 15 minutes)
   */
  getRecentErrorRate() {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentErrors = this.errorHistory.filter(e => e.timestamp > fifteenMinutesAgo);
    
    // Estimate total requests (rough approximation)
    const estimatedRequests = Math.max(recentErrors.length * 10, 100);
    
    return recentErrors.length / estimatedRequests;
  }
  
  /**
   * Get error statistics
   */
  getErrorStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentErrors = this.errorHistory.filter(e => e.timestamp > oneHourAgo);
    const dailyErrors = this.errorHistory.filter(e => e.timestamp > oneDayAgo);
    
    const categoryCounts = {};
    for (const category of Object.values(this.ERROR_CATEGORIES)) {
      categoryCounts[category] = recentErrors.filter(e => e.category === category).length;
    }
    
    return {
      totalErrors: this.errorHistory.length,
      recentErrors: recentErrors.length,
      dailyErrors: dailyErrors.length,
      errorRate: this.getRecentErrorRate(),
      categoryCounts,
      topUsers: this.getTopErrorUsers()
    };
  }
  
  /**
   * Get users with most errors
   */
  getTopErrorUsers() {
    const userErrors = Array.from(this.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    return userErrors.map(([userId, count]) => ({ userId, errorCount: count }));
  }
  
  /**
   * Check if user has too many recent errors
   */
  isUserRateLimited(userId) {
    const userErrorCount = this.errorCounts.get(userId) || 0;
    return userErrorCount > 10; // Max 10 errors per user
  }
  
  /**
   * Setup automatic cleanup
   */
  setupCleanup() {
    // Clean up error counts every hour
    setInterval(() => {
      this.errorCounts.clear();
      logger.info('Cleared error counts');
    }, 60 * 60 * 1000);
    
    // Clean up old error history
    setInterval(() => {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      this.errorHistory = this.errorHistory.filter(e => e.timestamp > oneWeekAgo);
      logger.info(`Cleaned up old errors, ${this.errorHistory.length} errors remaining`);
    }, 24 * 60 * 60 * 1000);
  }
  
  /**
   * Safely execute a function with error handling
   */
  async safeExecute(fn, context = {}, fallback = null) {
    try {
      return await fn();
    } catch (error) {
      const userMessage = await this.handleError(error, context);
      
      if (fallback) {
        return fallback;
      }
      
      throw new Error(userMessage);
    }
  }
  
  /**
   * Create error middleware for bot
   */
  createMiddleware() {
    return async (ctx, next) => {
      try {
        await next();
      } catch (error) {
        const userMessage = await this.handleError(error, {
          userId: ctx.from?.id,
          messageType: ctx.message?.text || ctx.callbackQuery?.data,
          chatId: ctx.chat?.id
        });
        
        try {
          await ctx.reply(userMessage);
        } catch (replyError) {
          logger.error('Failed to send error message:', replyError);
        }
      }
    };
  }
}

module.exports = ErrorHandlingService;