const { Markup } = require('telegraf');
const logger = require('../utils/logger');
const config = require('../../config/config');

/**
 * Admin command - visible only to whitelisted admins
 */

// Get admin chat IDs from config
const ADMIN_CHAT_IDS = config.bot.adminChatIds || [];

/**
 * Check if user is admin
 */
function isAdmin(userId) {
  return ADMIN_CHAT_IDS.includes(userId.toString());
}

/**
 * Admin middleware - restrict access to admins only
 */
function adminOnly() {
  return async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    
    if (!isAdmin(userId)) {
      logger.logSecurity('unauthorized_admin_access', {
        userId,
        username: ctx.from?.username,
        command: ctx.message?.text || ctx.callbackQuery?.data
      });
      
      await ctx.reply('⛔ Access denied. This command is for administrators only.');
      return;
    }
    
    return next();
  };
}

/**
 * Register admin commands
 */
function registerAdminCommands(bot, services) {
  const { 
    monitoringService, 
    backupService, 
    rateLimiter, 
    sessionSecurity,
    revenueService,
    transactionVerificationService
  } = services;

  /**
   * /admin - Show admin panel
   */
  bot.command('admin', adminOnly(), async (ctx) => {
    try {
      const userId = ctx.from.id.toString();
      
      logger.logUserAction(userId, 'admin_panel_accessed');
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 System Status', 'admin_status'),
          Markup.button.callback('💾 Backups', 'admin_backups')
        ],
        [
          Markup.button.callback('👥 Users', 'admin_users'),
          Markup.button.callback('💰 Revenue', 'admin_revenue')
        ],
        [
          Markup.button.callback('📈 Metrics', 'admin_metrics'),
          Markup.button.callback('⚙️ Settings', 'admin_settings')
        ],
        [
          Markup.button.callback('🔄 Restart Services', 'admin_restart'),
          Markup.button.callback('📝 Logs', 'admin_logs')
        ]
      ]);
      
      await ctx.reply(
        `🛡️ *Admin Panel* - 🦈**TerminalOne🦈v0.06**\n\n` +
        `Welcome, Administrator!\n\n` +
        `Select an option:`,
        { parse_mode: 'Markdown', ...keyboard }
      );
      
    } catch (error) {
      logger.error('Admin panel error:', error);
      await ctx.reply('❌ Error loading admin panel');
    }
  });

  /**
   * System Status
   */
  bot.action('admin_status', adminOnly(), async (ctx) => {
    try {
      const health = monitoringService?.getMetrics() || { status: 'unknown' };
      const backupStats = backupService?.getBackupStats() || {};
      const rateLimiterStats = rateLimiter?.getStats() || {};
      
      const message = `📊 *System Status*\n\n` +
        `*Status:* ${health.status}\n` +
        `*Uptime:* ${health.uptime?.human || 'N/A'}\n` +
        `*Total Requests:* ${health.requests?.total || 0}\n` +
        `*Error Rate:* ${health.requests?.errorRate || '0%'}\n` +
        `*Avg Response:* ${health.requests?.avgResponseTime || 'N/A'}\n` +
        `*Memory:* ${health.memory?.heap || 0}MB heap, ${health.memory?.rss || 0}MB RSS\n\n` +
        `*Backups:* ${backupStats.totalBackups || 0} (${backupStats.totalSize || 'N/A'})\n` +
        `*Rate Limiter:* ${rateLimiterStats.totalEntries || 0} active entries`;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Admin status error:', error);
      await ctx.answerCbQuery('❌ Error fetching status');
    }
  });

  /**
   * Backup Management
   */
  bot.action('admin_backups', adminOnly(), async (ctx) => {
    try {
      const backupStats = backupService?.getBackupStats() || {};
      const backups = backupStats.backups?.slice(0, 5) || [];
      
      let message = `💾 *Backup Management*\n\n` +
        `*Total Backups:* ${backupStats.totalBackups || 0}\n` +
        `*Total Size:* ${backupStats.totalSize || 'N/A'}\n` +
        `*Retention:* ${backupStats.retentionDays || 30} days\n\n`;
      
      if (backups.length > 0) {
        message += `*Recent Backups:*\n`;
        for (const backup of backups) {
          const date = new Date(backup.created);
          message += `• ${date.toLocaleDateString()} - ${backup.size} (${backup.files} files)\n`;
        }
      } else {
        message += `_No backups found_`;
      }
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Create Backup Now', 'admin_backup_create')],
        [Markup.button.callback('« Back', 'admin_back')]
      ]);
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
      
    } catch (error) {
      logger.error('Admin backups error:', error);
      await ctx.answerCbQuery('❌ Error fetching backups');
    }
  });

  /**
   * Create backup now
   */
  bot.action('admin_backup_create', adminOnly(), async (ctx) => {
    try {
      await ctx.answerCbQuery('Creating backup...');
      
      const result = await backupService?.createBackup();
      
      if (result?.success) {
        await ctx.reply(`✅ Backup created successfully!\n\nName: ${result.backupName}\nSize: ${result.metadata?.size || 'N/A'} bytes`);
      } else {
        await ctx.reply(`❌ Backup failed: ${result?.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      logger.error('Admin backup create error:', error);
      await ctx.answerCbQuery('❌ Backup creation failed');
    }
  });

  /**
   * Revenue Stats
   */
  bot.action('admin_revenue', adminOnly(), async (ctx) => {
    try {
      const revenueStats = revenueService?.getRevenueStats() || {};
      
      const message = `💰 *Revenue Statistics*\n\n` +
        `*Total Revenue:* ${revenueStats.totalRevenue || '0.000000'} SOL\n` +
        `*Today:* ${revenueStats.todayRevenue || '0.000000'} SOL\n` +
        `*Yesterday:* ${revenueStats.yesterdayRevenue || '0.000000'} SOL\n` +
        `*Total Transactions:* ${revenueStats.totalTransactions || 0}\n` +
        `*Total Users:* ${revenueStats.totalUsers || 0}\n` +
        `*Avg Fee/User:* ${revenueStats.averageFeePerUser || '0.000000'} SOL\n\n` +
        `*Fee Config:*\n` +
        `• Percentage: ${revenueStats.feePercentage || 1}%\n` +
        `• Min: ${revenueStats.minimumFee || 0.0005} SOL\n` +
        `• Max: ${revenueStats.maximumFee || 0.1} SOL\n\n` +
        `*Wallet:* \`${revenueStats.revenueWallet || 'Not set'}\``;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Admin revenue error:', error);
      await ctx.answerCbQuery('❌ Error fetching revenue stats');
    }
  });

  /**
   * Metrics
   */
  bot.action('admin_metrics', adminOnly(), async (ctx) => {
    try {
      const health = monitoringService?.getMetrics() || {};
      
      const message = `📈 *Detailed Metrics*\n\n` +
        `*Requests:*\n` +
        `• Total: ${health.requests?.total || 0}\n` +
        `• Errors: ${health.requests?.errors || 0}\n` +
        `• Error Rate: ${health.requests?.errorRate || '0%'}\n` +
        `• Avg Response: ${health.requests?.avgResponseTime || 'N/A'}\n\n` +
        `*Memory:*\n` +
        `• Heap: ${health.memory?.heap || 0} MB\n` +
        `• External: ${health.memory?.external || 0} MB\n` +
        `• RSS: ${health.memory?.rss || 0} MB\n\n` +
        `*Uptime:* ${health.uptime?.human || 'N/A'}`;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Admin metrics error:', error);
      await ctx.answerCbQuery('❌ Error fetching metrics');
    }
  });

  /**
   * Users
   */
  bot.action('admin_users', adminOnly(), async (ctx) => {
    try {
      const sessions = sessionSecurity?.getAllSessions() || [];
      const activeToday = sessions.filter(s => {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return s.lastActivity >= oneDayAgo;
      }).length;
      
      const message = `👥 *User Statistics*\n\n` +
        `*Total Sessions:* ${sessions.length}\n` +
        `*Active Today:* ${activeToday}\n` +
        `*Active This Week:* ${sessions.length}\n\n` +
        `_Use /admin_user_details for detailed user information_`;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Admin users error:', error);
      await ctx.answerCbQuery('❌ Error fetching user stats');
    }
  });

  /**
   * Settings
   */
  bot.action('admin_settings', adminOnly(), async (ctx) => {
    try {
      const message = `⚙️ *System Settings*\n\n` +
        `*Rate Limiting:* Enabled\n` +
        `• Trade ops: 50/hour\n` +
        `• Battle ops: 50/hour\n` +
        `• Wallet ops: 5-10/hour\n\n` +
        `*Security:*\n` +
        `• Wallet encryption: ✅ AES-256\n` +
        `• CSRF protection: ✅ Enabled\n` +
        `• Session persistence: ✅ Enabled\n\n` +
        `*Backups:*\n` +
        `• Frequency: Daily\n` +
        `• Retention: 30 days\n\n` +
        `_Settings can be modified in config files_`;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Admin settings error:', error);
      await ctx.answerCbQuery('❌ Error fetching settings');
    }
  });

  /**
   * Logs
   */
  bot.action('admin_logs', adminOnly(), async (ctx) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const logsDir = path.join(__dirname, '../../logs');
      let message = `📝 *System Logs*\n\n`;
      
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        message += `*Available log files:*\n`;
        for (const file of files.slice(0, 10)) {
          const stats = fs.statSync(path.join(logsDir, file));
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          message += `• ${file} (${sizeMB}MB)\n`;
        }
      } else {
        message += `_No logs directory found_`;
      }
      
      message += `\n_Use /admin_download_logs to download logs_`;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      logger.error('Admin logs error:', error);
      await ctx.answerCbQuery('❌ Error fetching logs');
    }
  });

  /**
   * Restart Services
   */
  bot.action('admin_restart', adminOnly(), async (ctx) => {
    try {
      await ctx.answerCbQuery('⚠️ Service restart requires manual deployment');
      await ctx.reply(
        `⚠️ *Service Restart*\n\n` +
        `To restart services, use the deployment script:\n\n` +
        `\`node scripts/deploy.js\`\n\n` +
        `Or manually restart the PM2 process:\n\n` +
        `\`pm2 restart TerminalOne\``,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      logger.error('Admin restart error:', error);
      await ctx.answerCbQuery('❌ Error');
    }
  });

  /**
   * Back button
   */
  bot.action('admin_back', adminOnly(), async (ctx) => {
    try {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 System Status', 'admin_status'),
          Markup.button.callback('💾 Backups', 'admin_backups')
        ],
        [
          Markup.button.callback('👥 Users', 'admin_users'),
          Markup.button.callback('💰 Revenue', 'admin_revenue')
        ],
        [
          Markup.button.callback('📈 Metrics', 'admin_metrics'),
          Markup.button.callback('⚙️ Settings', 'admin_settings')
        ],
        [
          Markup.button.callback('🔄 Restart Services', 'admin_restart'),
          Markup.button.callback('📝 Logs', 'admin_logs')
        ]
      ]);
      
      await ctx.editMessageText(
        `🛡️ *Admin Panel* - 🦈**TerminalOne🦈v0.06**\n\n` +
        `Welcome, Administrator!\n\n` +
        `Select an option:`,
        { parse_mode: 'Markdown', ...keyboard }
      );
      
    } catch (error) {
      logger.error('Admin back error:', error);
      await ctx.answerCbQuery('❌ Error');
    }
  });

  logger.info('✅ Admin commands registered');
}

module.exports = {
  registerAdminCommands,
  isAdmin,
  adminOnly,
  ADMIN_CHAT_IDS
};
