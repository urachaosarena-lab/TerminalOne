const { Telegraf, session } = require('telegraf');
const config = require('../config/config');
const logger = require('./utils/logger');
const SolanaService = require('./services/SolanaService');
const EnhancedPriceService = require('./services/EnhancedPriceService');
const RealtimePriceService = require('./services/RealtimePriceService');
const WalletService = require('./services/WalletService');
const MartingaleStrategy = require('./services/MartingaleStrategy');
const TokenAnalysisService = require('./services/TokenAnalysisService');
const RevenueService = require('./services/RevenueService');
const ErrorHandlingService = require('./services/ErrorHandlingService');
const RateLimitService = require('./services/RateLimitService');
const MonitoringService = require('./services/MonitoringService');
const { createHealthCheckServer } = require('./utils/healthCheck');

// Import command handlers
const startCommand = require('./commands/start');
const helpCommand = require('./commands/help');
const walletHandlers = require('./commands/wallet');
const martingaleHandlers = require('./commands/martingale');

class TerminalOneBot {
  constructor() {
    this.bot = new Telegraf(config.telegram.token);
    
    // Initialize all services
    this.solanaService = new SolanaService();
    this.enhancedPriceService = new EnhancedPriceService();
    this.realtimePriceService = new RealtimePriceService();
    this.walletService = new WalletService(this.solanaService);
    this.tokenAnalysisService = new TokenAnalysisService(this.enhancedPriceService);
    
    // Production services
    this.revenueService = new RevenueService(this.solanaService);
    this.errorHandlingService = new ErrorHandlingService();
    this.rateLimitService = new RateLimitService();
    this.monitoringService = new MonitoringService();
    
    this.martingaleService = new MartingaleStrategy(
      this.solanaService,
      this.enhancedPriceService,
      this.walletService,
      null, // trading service placeholder
      this.revenueService // revenue service for fee collection
    );
    
    // Make services available to bot context (deprecated - use middleware)
    this.bot.solanaService = this.solanaService;
    this.bot.priceService = this.enhancedPriceService;
    this.bot.walletService = this.walletService;
    
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
    this.setupErrorHandling();
    
    // Setup health check server in production
    if (config.production.enableHealthCheck) {
      this.setupHealthCheckServer();
    }
  }

  setupMiddleware() {
    // Session support
    this.bot.use(session());
    
    // Production middleware (order matters!)
    if (config.bot.environment === 'production') {
      this.bot.use(this.rateLimitService.createMiddleware());
      this.bot.use(this.errorHandlingService.createMiddleware());
      this.bot.use(this.monitoringService.createMiddleware());
    }
    
    // Log all messages
    this.bot.use((ctx, next) => {
      const messageText = ctx.message?.text || ctx.callbackQuery?.data || 'non-text message';
      logger.info(`Received from ${ctx.from?.username || ctx.from?.id}: ${messageText}`);
      return next();
    });

    // Add services to context
    this.bot.use((ctx, next) => {
      ctx.services = {
        solana: this.solanaService,
        price: this.enhancedPriceService,
        realtime: this.realtimePriceService,
        wallet: this.walletService,
        tokenAnalysis: this.tokenAnalysisService,
        martingale: this.martingaleService,
        revenue: this.revenueService,
        errorHandling: this.errorHandlingService,
        rateLimit: this.rateLimitService,
        monitoring: this.monitoringService
      };
      return next();
    });
    
    // Admin check middleware (for future admin commands)
    this.bot.use((ctx, next) => {
      ctx.isAdmin = config.telegram.adminChatIds.includes(ctx.from?.id);
      return next();
    });
  }

  setupCommands() {
    // Basic commands
    this.bot.start(startCommand);
    this.bot.help(helpCommand);

    // Handle text input (private key import, token analysis, etc.)
    this.bot.on('text', async (ctx) => {
      if (ctx.session?.awaitingPrivateKey) {
        await this.handlePrivateKeyImport(ctx);
        return;
      }
      
      if (ctx.session?.awaitingToken) {
        await martingaleHandlers.handleTokenAnalysis(ctx);
        return;
      }
      
      if (ctx.session?.awaitingConfigValue) {
        await martingaleHandlers.handleConfigValueInput(ctx);
        return;
      }
      
      // Handle unknown commands
      if (ctx.message.text.startsWith('/')) {
        ctx.reply('❓ Unknown command. Use /start to access the main menu.');
      }
    });
  }

  setupCallbacks() {
    // Wallet callbacks
    this.bot.action('create_wallet', walletHandlers.handleCreateWallet);
    this.bot.action('import_wallet', walletHandlers.handleImportWallet);
    this.bot.action('wallet', walletHandlers.handleWalletMenu);
    this.bot.action('view_private_key', walletHandlers.handleViewPrivateKey);
    this.bot.action('copy_address', walletHandlers.handleCopyAddress);
    this.bot.action('delete_wallet', walletHandlers.handleDeleteWallet);
    this.bot.action('confirm_delete_wallet', walletHandlers.handleConfirmDeleteWallet);
    this.bot.action('request_airdrop', walletHandlers.handleRequestAirdrop);
    this.bot.action('airdrop_1', (ctx) => walletHandlers.handleExecuteAirdrop(ctx, 1));
    this.bot.action('airdrop_2', (ctx) => walletHandlers.handleExecuteAirdrop(ctx, 2));
    this.bot.action('airdrop_5', (ctx) => walletHandlers.handleExecuteAirdrop(ctx, 5));
    
    // Navigation callbacks
    this.bot.action('back_to_main', startCommand);
    this.bot.action('refresh_balance', walletHandlers.handleWalletMenu);
    
    // Martingale strategy callbacks
    this.bot.action('martingale_menu', martingaleHandlers.handleMartingaleMenu);
    this.bot.action('martingale_configure', martingaleHandlers.handleConfigurationMenu);
    this.bot.action('martingale_launch', martingaleHandlers.handleLaunchMenu);
    this.bot.action('martingale_confirm_launch', martingaleHandlers.handleConfirmLaunch);
    this.bot.action('martingale_execute_launch', martingaleHandlers.handleExecuteLaunch);
    this.bot.action('martingale_active', martingaleHandlers.handleActiveStrategies);
    this.bot.action(/view_strategy_(.+)/, martingaleHandlers.handleViewStrategy);
    
    // Preset callbacks
    this.bot.action('preset_degen', (ctx) => martingaleHandlers.handlePresetSelection(ctx, 'Degen'));
    this.bot.action('preset_regular', (ctx) => martingaleHandlers.handlePresetSelection(ctx, 'Regular'));
    this.bot.action('preset_stable', (ctx) => martingaleHandlers.handlePresetSelection(ctx, 'Stable'));
    
    // Configuration change callbacks
    this.bot.action('config_initial', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'initial'));
    this.bot.action('config_drop', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'drop'));
    this.bot.action('config_multiplier', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'multiplier'));
    this.bot.action('config_levels', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'levels'));
    this.bot.action('config_profit', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'profit'));
    
    // Placeholder callbacks for future features
    this.bot.action('portfolio', (ctx) => {
      ctx.answerCbQuery('📊 Portfolio feature coming soon!');
    });
    
    this.bot.action('trade', (ctx) => {
      ctx.answerCbQuery('🔄 Trading feature coming soon!');
    });
    
    this.bot.action('markets', (ctx) => {
      ctx.answerCbQuery('📈 Markets feature coming soon!');
    });
    
    this.bot.action('settings', (ctx) => {
      ctx.answerCbQuery('⚙️ Settings feature coming soon!');
    });
    
    this.bot.action('help', helpCommand);
    
    // Delete key message callback
    this.bot.action('delete_key_message', async (ctx) => {
      try {
        await ctx.deleteMessage();
        await ctx.answerCbQuery('🗑️ Message deleted');
      } catch (error) {
        await ctx.answerCbQuery('❌ Could not delete message');
      }
    });
  }

  async handlePrivateKeyImport(ctx) {
    const privateKey = ctx.message.text.trim();
    const userId = ctx.from.id;
    
    try {
      // Delete the user's private key message immediately
      await ctx.deleteMessage();
      
      // Import the wallet
      const result = await ctx.services.wallet.importWallet(userId, privateKey);
      
      if (result.success) {
        const successMessage = `
🦈 **TerminalOne🦈**

✅ **Wallet Imported Successfully!**

🟢 **Your wallet is now connected:**
📍 **Address:** \`${result.publicKey.slice(0,5)}...${result.publicKey.slice(-5)}\`

💰 **Loading your balance...**
💡 **Tip:** Your wallet is ready for trading!
        `;
        
        const { Markup } = require('telegraf');
        await ctx.reply(successMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💰 View Wallet', 'wallet')],
            [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
          ])
        });
      }
      
    } catch (error) {
      logger.error('Error importing wallet:', error);
      await ctx.reply(
        '🦈 **TerminalOne🦈**\n\n❌ **Failed to import wallet**\n\n' + error.message,
        {
          parse_mode: 'Markdown',
          ...require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.callback('🔄 Try Again', 'import_wallet')],
            [require('telegraf').Markup.button.callback('🔙 Back', 'back_to_main')]
          ])
        }
      );
    } finally {
      // Clear the awaiting state
      ctx.session.awaitingPrivateKey = false;
    }
  }

  setupErrorHandling() {
    this.bot.catch((err, ctx) => {
      logger.error(`Bot error for ${ctx.updateType}:`, err);
      ctx.reply('😵 Something went wrong. Please try again later.');
    });

    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled promise rejection:', err);
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception:', err);
      process.exit(1);
    });
  }
  
  async setupHealthCheckServer() {
    try {
      const services = {
        monitoring: this.monitoringService,
        rateLimit: this.rateLimitService,
        errorHandling: this.errorHandlingService
      };
      
      this.healthCheckServer = await createHealthCheckServer(services);
      logger.info('Health check server started');
    } catch (error) {
      logger.error('Failed to start health check server:', error);
    }
  }

  async start() {
    try {
      // Initialize Solana connection
      await this.solanaService.initialize();
      logger.info('Solana service initialized');
      
      // Setup health check server in production
      if (config.production?.enableHealthCheck) {
        await this.setupHealthCheckServer();
      }

      // Start the bot
      await this.bot.launch();
      logger.info('TerminalOne bot is running! 🚀');

      // Graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));

    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }
  
  async stop(reason) {
    logger.info(`Stopping TerminalOne bot: ${reason}`);
    
    try {
      // Stop bot
      this.bot.stop(reason);
      
      // Stop health check server
      if (this.healthCheckServer) {
        this.healthCheckServer.close();
        logger.info('Health check server stopped');
      }
      
      logger.info('TerminalOne bot stopped gracefully');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new TerminalOneBot();
  bot.start();
}

module.exports = TerminalOneBot;