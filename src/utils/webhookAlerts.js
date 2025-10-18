const axios = require('axios');
const config = require('../../config/config');
const logger = require('./logger');

class WebhookAlertSystem {
  constructor() {
    this.webhookUrl = config.production?.errorReporting?.webhookUrl;
    this.enabled = config.production?.errorReporting?.enabled && this.webhookUrl;
    this.alertQueue = [];
    this.rateLimits = new Map(); // Alert type -> last sent time
    this.minInterval = 5 * 60 * 1000; // 5 minutes between same alert types
  }

  /**
   * Send alert to configured webhook
   */
  async sendAlert(alertType, title, message, data = {}, priority = 'normal') {
    if (!this.enabled) {
      logger.info(`Alert (webhook disabled): ${alertType} - ${title}`);
      return;
    }

    // Rate limiting - don't spam the same alert type
    const lastSent = this.rateLimits.get(alertType) || 0;
    const now = Date.now();
    
    if (now - lastSent < this.minInterval && priority !== 'critical') {
      logger.debug(`Alert rate limited: ${alertType}`);
      return;
    }

    try {
      const payload = this.createPayload(alertType, title, message, data, priority);
      
      await axios.post(this.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TerminalOne-Bot/1.0'
        }
      });

      this.rateLimits.set(alertType, now);
      logger.info(`Alert sent: ${alertType} - ${title}`);
      
    } catch (error) {
      logger.error('Failed to send webhook alert:', error.message);
      // Don't retry webhook failures to avoid infinite loops
    }
  }

  /**
   * Create webhook payload (supports Slack, Discord, generic)
   */
  createPayload(alertType, title, message, data, priority) {
    const timestamp = new Date().toISOString();
    const emoji = this.getAlertEmoji(alertType, priority);
    
    // Determine webhook type based on URL
    if (this.webhookUrl.includes('slack.com')) {
      return this.createSlackPayload(alertType, title, message, data, priority, emoji, timestamp);
    } else if (this.webhookUrl.includes('discord.com') || this.webhookUrl.includes('discordapp.com')) {
      return this.createDiscordPayload(alertType, title, message, data, priority, emoji, timestamp);
    } else {
      // Generic JSON payload
      return this.createGenericPayload(alertType, title, message, data, priority, emoji, timestamp);
    }
  }

  /**
   * Create Slack-formatted payload
   */
  createSlackPayload(alertType, title, message, data, priority, emoji, timestamp) {
    const color = priority === 'critical' ? 'danger' : priority === 'warning' ? 'warning' : 'good';
    
    const fields = [];
    if (Object.keys(data).length > 0) {
      Object.entries(data).forEach(([key, value]) => {
        fields.push({
          title: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
          value: String(value),
          short: true
        });
      });
    }
    
    return {
      text: `${emoji} **TerminalOne Alert**`,
      attachments: [{
        color,
        title: `${alertType.toUpperCase()}: ${title}`,
        text: message,
        fields,
        footer: 'TerminalOne Bot',
        ts: Math.floor(Date.now() / 1000)
      }]
    };
  }

  /**
   * Create Discord-formatted payload
   */
  createDiscordPayload(alertType, title, message, data, priority, emoji, timestamp) {
    const color = priority === 'critical' ? 0xff0000 : priority === 'warning' ? 0xffa500 : 0x00ff00;
    
    const fields = [];
    if (Object.keys(data).length > 0) {
      Object.entries(data).forEach(([key, value]) => {
        fields.push({
          name: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
          value: String(value),
          inline: true
        });
      });
    }
    
    return {
      content: `${emoji} **TerminalOne Alert**`,
      embeds: [{
        title: `${alertType.toUpperCase()}: ${title}`,
        description: message,
        color,
        fields,
        footer: {
          text: 'TerminalOne Bot'
        },
        timestamp
      }]
    };
  }

  /**
   * Create generic JSON payload
   */
  createGenericPayload(alertType, title, message, data, priority, emoji, timestamp) {
    return {
      service: 'TerminalOne Bot',
      alertType,
      priority,
      title,
      message,
      data,
      timestamp,
      emoji
    };
  }

  /**
   * Get appropriate emoji for alert type
   */
  getAlertEmoji(alertType, priority) {
    const emojis = {
      startup: '🚀',
      shutdown: '🛑',
      error: '❌',
      warning: '⚠️',
      health: '🏥',
      performance: '📊',
      security: '🔒',
      trading: '💰',
      user: '👤',
      system: '⚙️'
    };
    
    if (priority === 'critical') return '🚨';
    return emojis[alertType] || '📢';
  }

  /**
   * Send startup notification
   */
  async sendStartupAlert(version = '1.0', environment = 'production') {
    await this.sendAlert(
      'startup',
      'Bot Started',
      `TerminalOne bot has started successfully in ${environment} mode.`,
      {
        version,
        environment,
        nodeVersion: process.version,
        uptime: '0s'
      },
      'normal'
    );
  }

  /**
   * Send shutdown notification
   */
  async sendShutdownAlert(reason = 'unknown', uptime = 0) {
    await this.sendAlert(
      'shutdown',
      'Bot Shutdown',
      `TerminalOne bot is shutting down. Reason: ${reason}`,
      {
        reason,
        uptime: this.formatUptime(uptime),
        timestamp: new Date().toISOString()
      },
      'warning'
    );
  }

  /**
   * Send error alert
   */
  async sendErrorAlert(error, context = {}) {
    await this.sendAlert(
      'error',
      'System Error',
      `An error occurred: ${error.message}`,
      {
        errorType: error.constructor.name,
        stack: error.stack?.split('\n')[0], // First line only
        ...context
      },
      'critical'
    );
  }

  /**
   * Send performance alert
   */
  async sendPerformanceAlert(metric, value, threshold, unit = '') {
    await this.sendAlert(
      'performance',
      `High ${metric}`,
      `${metric} has exceeded threshold: ${value}${unit} > ${threshold}${unit}`,
      {
        metric,
        currentValue: `${value}${unit}`,
        threshold: `${threshold}${unit}`,
        timestamp: new Date().toISOString()
      },
      'warning'
    );
  }

  /**
   * Send health check alert
   */
  async sendHealthAlert(status, checks = {}) {
    const failedChecks = Object.entries(checks)
      .filter(([_, check]) => check.status === 'unhealthy')
      .map(([name, check]) => `${name}: ${check.error || 'Unknown error'}`);

    await this.sendAlert(
      'health',
      `Health Check ${status === 'healthy' ? 'Recovered' : 'Failed'}`,
      status === 'healthy' 
        ? 'System health has been restored.' 
        : `Health check failed. Issues: ${failedChecks.join(', ')}`,
      {
        status,
        failedChecks: failedChecks.length,
        totalChecks: Object.keys(checks).length
      },
      status === 'healthy' ? 'normal' : 'critical'
    );
  }

  /**
   * Send trading alert
   */
  async sendTradingAlert(type, token, amount, userId, details = {}) {
    await this.sendAlert(
      'trading',
      `${type.toUpperCase()} Trade`,
      `${type} trade executed: ${amount} SOL worth of ${token}`,
      {
        type,
        token,
        amount: `${amount} SOL`,
        userId,
        ...details
      },
      'normal'
    );
  }

  /**
   * Format uptime for display
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Test webhook connection
   */
  async testWebhook() {
    try {
      await this.sendAlert(
        'system',
        'Webhook Test',
        'This is a test message to verify webhook connectivity.',
        {
          timestamp: new Date().toISOString(),
          testId: Math.random().toString(36).substring(7)
        },
        'normal'
      );
      return true;
    } catch (error) {
      logger.error('Webhook test failed:', error.message);
      return false;
    }
  }
}

module.exports = WebhookAlertSystem;