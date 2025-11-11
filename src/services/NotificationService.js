const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * NotificationService - Manages user notifications for trading events
 */
class NotificationService {
  constructor(bot) {
    this.bot = bot;
    this.preferencesPath = path.join(__dirname, '../../data/notification_preferences.json');
    this.preferences = new Map();
    
    // Default preferences
    this.defaultPreferences = {
      enabled: true,
      events: {
        gridBuy: true,
        gridSell: true,
        gridComplete: true,
        gridError: true,
        martingaleBuy: true,
        martingaleSell: true,
        martingaleComplete: true,
        martingaleError: true,
        profitTarget: true,
        stopLoss: true,
        lowBalance: true
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      }
    };
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.preferencesPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.loadPreferences();
  }
  
  /**
   * Load notification preferences from file
   */
  loadPreferences() {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf8');
        const prefsObject = JSON.parse(data);
        
        Object.entries(prefsObject).forEach(([userId, prefs]) => {
          this.preferences.set(userId, prefs);
        });
        
        logger.info(`Loaded notification preferences for ${this.preferences.size} users`);
      } else {
        logger.info('No notification preferences found, using defaults');
      }
    } catch (error) {
      logger.error('Failed to load notification preferences:', error);
    }
  }
  
  /**
   * Save notification preferences to file
   */
  savePreferences() {
    try {
      const prefsObject = {};
      this.preferences.forEach((prefs, userId) => {
        prefsObject[userId] = prefs;
      });
      
      fs.writeFileSync(
        this.preferencesPath,
        JSON.stringify(prefsObject, null, 2),
        'utf8'
      );
      
      logger.debug(`Saved notification preferences for ${this.preferences.size} users`);
    } catch (error) {
      logger.error('Failed to save notification preferences:', error);
    }
  }
  
  /**
   * Get user preferences or default
   */
  getUserPreferences(userId) {
    userId = String(userId);
    
    if (!this.preferences.has(userId)) {
      this.preferences.set(userId, { ...this.defaultPreferences });
      this.savePreferences();
    }
    
    return this.preferences.get(userId);
  }
  
  /**
   * Update user preferences
   */
  updatePreferences(userId, updates) {
    userId = String(userId);
    const currentPrefs = this.getUserPreferences(userId);
    
    // Merge updates
    const newPrefs = {
      ...currentPrefs,
      ...updates,
      events: {
        ...currentPrefs.events,
        ...(updates.events || {})
      },
      quietHours: {
        ...currentPrefs.quietHours,
        ...(updates.quietHours || {})
      }
    };
    
    this.preferences.set(userId, newPrefs);
    this.savePreferences();
    
    return newPrefs;
  }
  
  /**
   * Check if notifications are allowed for user and event type
   */
  shouldNotify(userId, eventType) {
    const prefs = this.getUserPreferences(userId);
    
    // Check if notifications are globally enabled
    if (!prefs.enabled) {
      return false;
    }
    
    // Check if specific event type is enabled
    if (!prefs.events[eventType]) {
      return false;
    }
    
    // Check quiet hours
    if (prefs.quietHours.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const start = prefs.quietHours.start;
      const end = prefs.quietHours.end;
      
      // Handle quiet hours that span midnight
      if (start > end) {
        if (currentTime >= start || currentTime < end) {
          return false;
        }
      } else {
        if (currentTime >= start && currentTime < end) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Send notification to user
   */
  async notify(userId, eventType, message, options = {}) {
    userId = String(userId);
    
    if (!this.shouldNotify(userId, eventType)) {
      logger.debug(`Notification suppressed for user ${userId}, event ${eventType}`);
      return false;
    }
    
    try {
      const notification = {
        text: message,
        parse_mode: 'Markdown',
        ...options
      };
      
      await this.bot.telegram.sendMessage(userId, notification.text, notification);
      
      logger.info(`Notification sent to user ${userId}:`, { eventType, message: message.substring(0, 50) });
      return true;
    } catch (error) {
      logger.error(`Failed to send notification to user ${userId}:`, error);
      return false;
    }
  }
  
  /**
   * Notification shortcuts for common events
   */
  async notifyGridBuy(userId, gridId, tokenSymbol, price, amount) {
    const message = `🟢 *Grid Buy Executed*\n\n` +
      `Grid: \`${gridId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Price: $${price.toFixed(6)}\n` +
      `Amount: ${amount.toFixed(4)} tokens`;
    
    return this.notify(userId, 'gridBuy', message);
  }
  
  async notifyGridSell(userId, gridId, tokenSymbol, price, amount, profit) {
    const message = `🔴 *Grid Sell Executed*\n\n` +
      `Grid: \`${gridId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Price: $${price.toFixed(6)}\n` +
      `Amount: ${amount.toFixed(4)} tokens\n` +
      `Profit: ${profit > 0 ? '+' : ''}${profit.toFixed(4)} SOL`;
    
    return this.notify(userId, 'gridSell', message);
  }
  
  async notifyGridComplete(userId, gridId, tokenSymbol, totalProfit) {
    const message = `✅ *Grid Strategy Complete*\n\n` +
      `Grid: \`${gridId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Total Profit: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(4)} SOL`;
    
    return this.notify(userId, 'gridComplete', message);
  }
  
  async notifyGridError(userId, gridId, tokenSymbol, error) {
    const message = `❌ *Grid Error*\n\n` +
      `Grid: \`${gridId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Error: ${error}`;
    
    return this.notify(userId, 'gridError', message);
  }
  
  async notifyMartingaleBuy(userId, strategyId, tokenSymbol, level, price, amount) {
    const message = `🟢 *Martingale Buy - Level ${level}*\n\n` +
      `Strategy: \`${strategyId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Price: $${price.toFixed(6)}\n` +
      `Amount: ${amount.toFixed(4)} SOL`;
    
    return this.notify(userId, 'martingaleBuy', message);
  }
  
  async notifyMartingaleSell(userId, strategyId, tokenSymbol, profit) {
    const message = `🔴 *Martingale Sell*\n\n` +
      `Strategy: \`${strategyId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Profit: ${profit > 0 ? '+' : ''}${profit.toFixed(4)} SOL (${(profit * 100).toFixed(2)}%)`;
    
    return this.notify(userId, 'martingaleSell', message);
  }
  
  async notifyMartingaleComplete(userId, strategyId, tokenSymbol, totalProfit, cycles) {
    const message = `✅ *Martingale Strategy Complete*\n\n` +
      `Strategy: \`${strategyId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Cycles: ${cycles}\n` +
      `Total Profit: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(4)} SOL`;
    
    return this.notify(userId, 'martingaleComplete', message);
  }
  
  async notifyMartingaleError(userId, strategyId, tokenSymbol, error) {
    const message = `❌ *Martingale Error*\n\n` +
      `Strategy: \`${strategyId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Error: ${error}`;
    
    return this.notify(userId, 'martingaleError', message);
  }
  
  async notifyProfitTarget(userId, strategyId, tokenSymbol, profit) {
    const message = `🎯 *Profit Target Reached!*\n\n` +
      `Strategy: \`${strategyId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Profit: +${profit.toFixed(4)} SOL`;
    
    return this.notify(userId, 'profitTarget', message);
  }
  
  async notifyStopLoss(userId, strategyId, tokenSymbol, loss) {
    const message = `🛑 *Stop Loss Triggered*\n\n` +
      `Strategy: \`${strategyId}\`\n` +
      `Token: ${tokenSymbol}\n` +
      `Loss: ${loss.toFixed(4)} SOL`;
    
    return this.notify(userId, 'stopLoss', message);
  }
  
  async notifyLowBalance(userId, currentBalance, requiredBalance) {
    const message = `⚠️ *Low Balance Warning*\n\n` +
      `Current: ${currentBalance.toFixed(4)} SOL\n` +
      `Required: ${requiredBalance.toFixed(4)} SOL\n\n` +
      `Please add funds to continue trading.`;
    
    return this.notify(userId, 'lowBalance', message);
  }
}

module.exports = NotificationService;
