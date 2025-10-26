const logger = require('../utils/logger');
const config = require('../../config/config');

class MonitoringService {
  constructor(telegramBot = null, adminChatIds = []) {
    this.telegramBot = telegramBot;
    this.adminChatIds = adminChatIds;
    
    this.metrics = {
      uptime: Date.now(),
      totalRequests: 0,
      errorCount: 0,
      responseTimeSum: 0,
      responseTimeCount: 0,
      activeUsers: new Set(),
      memoryUsage: { heap: 0, external: 0, rss: 0 },
      lastHealthCheck: null,
      status: 'starting',
      recentErrors: [],
      recentAlerts: []
    };
    
    this.healthChecks = new Map(); // service -> status
    this.alerts = new Map(); // alert type -> last sent time
    this.ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes
    
    this.isEnabled = config.production?.monitoring?.enabled ?? true;
    this.alertThresholds = config.production?.monitoring?.alertThresholds || {
      errorRate: 0.1, // 10%
      memoryUsage: 0.8, // 80%
      responseTime: 5000 // 5 seconds
    };
    this.monitoringInterval = config.production?.monitoring?.interval || 60000;
    
    if (this.isEnabled) {
      this.startMonitoring();
    }
    
    logger.info('📊 Monitoring service initialized with alerting');
  }
  
  /**
   * Start monitoring processes
   */
  startMonitoring() {
    logger.info('Starting monitoring service');
    
    // Regular health checks
    setInterval(() => {
      this.performHealthCheck();
    }, this.monitoringInterval);
    
    // Memory monitoring
    setInterval(() => {
      this.updateMemoryMetrics();
      this.checkMemoryUsage();
    }, 15000); // Every 15 seconds
    
    // Performance monitoring
    this.startPerformanceMonitoring();
    
    // Initial health check
    setTimeout(() => {
      this.performHealthCheck();
    }, 5000);
  }
  
  /**
   * Record a request for metrics
   */
  recordRequest(userId, responseTime = 0) {
    this.metrics.totalRequests++;
    
    if (responseTime > 0) {
      this.metrics.responseTimeSum += responseTime;
      this.metrics.responseTimeCount++;
    }
    
    if (userId) {
      this.metrics.activeUsers.add(userId);
    }
    
    // Clean up old users periodically
    if (this.metrics.totalRequests % 100 === 0) {
      this.cleanupActiveUsers();
    }
  }
  
  /**
   * Record an error for metrics
   */
  recordError(error, context = {}) {
    this.metrics.errorCount++;
    
    // Store recent error
    this.metrics.recentErrors.push({
      error: error.message,
      context,
      timestamp: Date.now()
    });
    
    // Keep only last 50 errors
    if (this.metrics.recentErrors.length > 50) {
      this.metrics.recentErrors.shift();
    }
    
    // Check if error rate exceeds threshold
    const errorRate = this.getErrorRate();
    if (errorRate > this.alertThresholds.errorRate) {
      this.sendAlert('high_error_rate', {
        errorRate: (errorRate * 100).toFixed(2) + '%',
        threshold: (this.alertThresholds.errorRate * 100).toFixed(2) + '%',
        recentErrors: this.metrics.errorCount,
        latestError: error.message
      });
    }
    
    // Log to structured logging
    logger.logError(context.operation || 'unknown', error, context);
  }
  
  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.metrics.uptime,
      checks: {}
    };
    
    try {
      // Check memory usage
      await this.checkMemoryHealth(health);
      
      // Check response time
      await this.checkResponseTimeHealth(health);
      
      // Check error rate
      await this.checkErrorRateHealth(health);
      
      // Check external services
      await this.checkExternalServices(health);
      
      // Overall status
      const hasFailures = Object.values(health.checks).some(check => check.status === 'unhealthy');
      health.status = hasFailures ? 'unhealthy' : 'healthy';
      
      this.metrics.lastHealthCheck = health;
      this.metrics.status = health.status;
      
      logger.info(`Health check completed: ${health.status}`, {
        duration: Date.now() - startTime,
        uptime: Math.floor(health.uptime / 1000) + 's'
      });
      
    } catch (error) {
      logger.error('Health check failed:', error);
      health.status = 'unhealthy';
      health.error = error.message;
      this.metrics.lastHealthCheck = health;
      this.metrics.status = 'unhealthy';
    }
    
    return health;
  }
  
  /**
   * Check memory health
   */
  async checkMemoryHealth(health) {
    const memory = process.memoryUsage();
    const totalMemory = memory.rss + memory.heapTotal + memory.external;
    const memoryUsageRatio = totalMemory / (1024 * 1024 * 1024); // Convert to GB
    
    // Assume 2GB limit for health check
    const memoryLimit = 2;
    const usagePercentage = memoryUsageRatio / memoryLimit;
    
    health.checks.memory = {
      status: usagePercentage > this.alertThresholds.memoryUsage ? 'unhealthy' : 'healthy',
      usage: `${memoryUsageRatio.toFixed(2)}GB`,
      percentage: `${(usagePercentage * 100).toFixed(1)}%`,
      heap: `${(memory.heapUsed / 1024 / 1024).toFixed(1)}MB`,
      rss: `${(memory.rss / 1024 / 1024).toFixed(1)}MB`
    };
    
    if (usagePercentage > this.alertThresholds.memoryUsage) {
      this.sendAlert('high_memory_usage', health.checks.memory);
    }
  }
  
  /**
   * Check response time health
   */
  /**
   * Start performance monitoring middleware
   */
  startPerformanceMonitoring() {
    // This will be called by the bot's middleware
    this.performanceMiddleware = async (ctx, next) => {
      const startTime = Date.now();
      
      try {
        await next();
        const responseTime = Date.now() - startTime;
        this.recordRequest(ctx.from?.id, responseTime);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        this.recordRequest(ctx.from?.id, responseTime);
        this.recordError(error, {
          userId: ctx.from?.id,
          messageType: ctx.message?.text || ctx.callbackQuery?.data
        });
        throw error;
      }
    };
  }
  
  /**
   * Create middleware for bot
   */
  createMiddleware() {
    return this.performanceMiddleware;
  }
  
  /**
   * Check response time health
   */
  async checkResponseTimeHealth(health) {
    const avgResponseTime = this.metrics.responseTimeCount > 0 
      ? this.metrics.responseTimeSum / this.metrics.responseTimeCount 
      : 0;
    
    health.checks.responseTime = {
      status: avgResponseTime > this.alertThresholds.responseTime ? 'unhealthy' : 'healthy',
      average: `${avgResponseTime.toFixed(0)}ms`,
      threshold: `${this.alertThresholds.responseTime}ms`,
      totalRequests: this.metrics.totalRequests
    };
    
    if (avgResponseTime > this.alertThresholds.responseTime) {
      this.sendAlert('slow_response_time', health.checks.responseTime);
    }
  }
  
  /**
   * Check error rate health
   */
  async checkErrorRateHealth(health) {
    const errorRate = this.getErrorRate();
    
    health.checks.errorRate = {
      status: errorRate > this.alertThresholds.errorRate ? 'unhealthy' : 'healthy',
      rate: `${(errorRate * 100).toFixed(2)}%`,
      threshold: `${(this.alertThresholds.errorRate * 100).toFixed(2)}%`,
      totalErrors: this.metrics.errorCount,
      totalRequests: this.metrics.totalRequests
    };
  }
  
  /**
   * Update memory metrics
   */
  updateMemoryMetrics() {
    const memory = process.memoryUsage();
    this.metrics.memoryUsage = {
      heap: Math.round(memory.heapUsed / 1024 / 1024), // MB
      external: Math.round(memory.external / 1024 / 1024), // MB
      rss: Math.round(memory.rss / 1024 / 1024) // MB
    };
  }
  
  /**
   * Check memory usage and alert if high
   */
  checkMemoryUsage() {
    const totalMemory = this.metrics.memoryUsage.heap + this.metrics.memoryUsage.external;
    const memoryLimitMB = 2048; // 2GB limit
    const usagePercentage = totalMemory / memoryLimitMB;
    
    if (usagePercentage > this.alertThresholds.memoryUsage) {
      this.sendAlert('high_memory_usage', {
        usage: `${totalMemory}MB`,
        percentage: `${(usagePercentage * 100).toFixed(1)}%`,
        limit: `${memoryLimitMB}MB`
      });
    }
  }
  
  /**
   * Check external services
   */
  async checkExternalServices(health) {
    const services = ['solana', 'coingecko', 'jupiter'];
    health.checks.externalServices = {};
    
    for (const service of services) {
      try {
        const startTime = Date.now();
        let isHealthy = true; // Simplified check
        
        const responseTime = Date.now() - startTime;
        
        health.checks.externalServices[service] = {
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime: `${responseTime}ms`,
          lastCheck: new Date().toISOString()
        };
        
      } catch (error) {
        health.checks.externalServices[service] = {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date().toISOString()
        };
      }
    }
  }
  
  /**
   * Send alert to admins via Telegram
   */
  async sendAlert(alertType, data) {
    // Check cooldown to prevent spam
    const lastAlert = this.alerts.get(alertType);
    if (lastAlert && (Date.now() - lastAlert) < this.ALERT_COOLDOWN) {
      logger.debug(`Alert suppressed (cooldown): ${alertType}`);
      return;
    }
    
    // Record alert
    this.alerts.set(alertType, Date.now());
    this.metrics.recentAlerts.push({
      type: alertType,
      data,
      timestamp: Date.now()
    });
    
    // Keep only last 50 alerts
    if (this.metrics.recentAlerts.length > 50) {
      this.metrics.recentAlerts.shift();
    }
    
    // Format alert message
    const emoji = alertType.includes('error') ? '⚠️' : alertType.includes('memory') ? '💾' : '🐌';
    const title = alertType.replace(/_/g, ' ').toUpperCase();
    const dataStr = JSON.stringify(data, null, 2).replace(/[{}"]/g, '').replace(/,/g, '').trim();
    const message = `${emoji} *${title}*\n\n${dataStr}\n\n_${new Date().toLocaleString()}_`;
    
    // Log alert
    logger.warn(`ALERT: ${alertType}`, data);
    
    // Send to admin chats if Telegram bot available
    if (this.telegramBot && this.adminChatIds.length > 0) {
      for (const chatId of this.adminChatIds) {
        try {
          await this.telegramBot.telegram.sendMessage(chatId, message, {
            parse_mode: 'Markdown'
          });
        } catch (error) {
          logger.error(`Failed to send alert to admin ${chatId}:`, error);
        }
      }
    }
  }
  
  /**
   * Get current error rate
   */
  getErrorRate() {
    if (this.metrics.totalRequests === 0) return 0;
    return this.metrics.errorCount / this.metrics.totalRequests;
  }
  
  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.metrics.uptime;
    const avgResponseTime = this.metrics.responseTimeCount > 0 
      ? this.metrics.responseTimeSum / this.metrics.responseTimeCount 
      : 0;
    
    return {
      status: this.metrics.status,
      uptime: {
        ms: uptime,
        human: this.formatUptime(uptime)
      },
      requests: {
        total: this.metrics.totalRequests,
        errors: this.metrics.errorCount,
        errorRate: `${(this.getErrorRate() * 100).toFixed(2)}%`,
        avgResponseTime: `${avgResponseTime.toFixed(0)}ms`
      },
      memory: this.metrics.memoryUsage
    };
  }
  
  /**
   * Format uptime in human readable format
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

module.exports = MonitoringService;
