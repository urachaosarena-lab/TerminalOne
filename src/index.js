const { Telegraf, session } = require('telegraf');
const config = require('../config/config');
const logger = require('./utils/logger');
const SolanaService = require('./services/SolanaService');
const WalletService = require('./services/WalletService');
const EnhancedPriceService = require('./services/EnhancedPriceService');
const RealtimePriceService = require('./services/RealtimePriceService');
const TokenAnalysisService = require('./services/TokenAnalysisService');
const TokenMetadataService = require('./services/TokenMetadataService');
const MartingaleStrategy = require('./services/MartingaleStrategy');
const GridTradingService = require('./services/GridTradingService');
const RevenueService = require('./services/RevenueService');
const JupiterTradingService = require('./services/JupiterTradingService');
const TradingHistoryService = require('./services/TradingHistoryService');
const ErrorHandlingService = require('./services/ErrorHandlingService');
const RateLimitService = require('./services/RateLimitService');
const MonitoringService = require('./services/MonitoringService');
const { HeroService } = require('./services/HeroService');
const BattleService = require('./services/BattleService');
const AnalyticsService = require('./services/AnalyticsService');
const NotificationService = require('./services/NotificationService');
const { createHealthCheckServer } = require('./utils/healthCheck');
const { getBotTitle } = require('./utils/version');

// Import command handlers
const startCommand = require('./commands/start');
const helpCommand = require('./commands/help');
const walletHandlers = require('./commands/wallet');
const martingaleHandlers = require('./commands/martingale');
const gridHandlers = require('./commands/grid');
const heroHandlers = require('./commands/hero');
const battleHandlers = require('./commands/battle');
const dashboardHandlers = require('./commands/dashboard');
const activeBotsHandlers = require('./commands/activeBots');
const notificationHandlers = require('./commands/notifications');

class TerminalOneBot {
  constructor() {
    this.bot = new Telegraf(config.telegram.token);
    
    // Initialize notification service first (needs bot instance)
    this.notificationService = new NotificationService(this.bot);
    
    // Initialize all services
    this.solanaService = new SolanaService();
    this.enhancedPriceService = new EnhancedPriceService();
    this.realtimePriceService = new RealtimePriceService();
    this.tokenMetadataService = new TokenMetadataService();
    this.walletService = new WalletService(this.solanaService);
    this.tokenAnalysisService = new TokenAnalysisService(this.enhancedPriceService);
    
    // Trading service with metadata support
    this.jupiterTradingService = new JupiterTradingService(this.solanaService, this.walletService, this.tokenMetadataService);
    
    // Production services
    this.revenueService = new RevenueService(this.solanaService);
    this.tradingHistoryService = new TradingHistoryService();
    this.errorHandlingService = new ErrorHandlingService();
    this.rateLimitService = new RateLimitService();
    this.monitoringService = new MonitoringService();
    
    this.martingaleService = new MartingaleStrategy(
      this.solanaService,
      this.enhancedPriceService,
      this.walletService,
      this.jupiterTradingService, // real trading service
      this.revenueService, // revenue service for fee collection
      this.tradingHistoryService, // trading history service for analytics
      this.notificationService // notification service for alerts
    );
    
    // Grid trading service with metadata support
    this.gridTradingService = new GridTradingService(
      this.jupiterTradingService,
      this.enhancedPriceService,
      this.walletService,
      this.tokenMetadataService,
      this.notificationService // notification service for alerts
    );
    
    // RPG Game services
    this.heroService = new HeroService();
    this.battleService = new BattleService(this.heroService);
    
    // Analytics service
    this.analyticsService = new AnalyticsService(
      this.walletService,
      this.martingaleService,
      this.heroService,
      this.revenueService,
      this.gridTradingService // Add grid service
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
        tokenMetadata: this.tokenMetadataService,
        wallet: this.walletService,
        tokenAnalysis: this.tokenAnalysisService,
        martingale: this.martingaleService,
        grid: this.gridTradingService,
        jupiter: this.jupiterTradingService,
        revenue: this.revenueService,
        tradingHistory: this.tradingHistoryService,
        errorHandling: this.errorHandlingService,
        rateLimit: this.rateLimitService,
        monitoring: this.monitoringService,
        hero: this.heroService,
        battle: this.battleService,
        analytics: this.analyticsService,
        notifications: this.notificationService
      };
      return next();
    });
    
    // Track user activity for analytics
    this.bot.use((ctx, next) => {
      if (ctx.from?.id) {
        const actionType = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';
        this.analyticsService.trackUserActivity(ctx.from.id, actionType);
      }
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
      
      if (ctx.session?.awaitingGridToken) {
        await gridHandlers.handleTokenAnalysis(ctx);
        return;
      }
      
      if (ctx.session?.awaitingConfigValue) {
        await martingaleHandlers.handleConfigValueInput(ctx);
        return;
      }
      
      if (ctx.session?.awaitingGridConfig) {
        await gridHandlers.handleConfigValueInput(ctx);
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
    this.bot.action(/pause_strategy_(.+)/, martingaleHandlers.handlePauseStrategy);
    this.bot.action(/stop_strategy_(.+)/, martingaleHandlers.handleStopStrategy);
    
    // Test inline handler for debugging
    this.bot.action(/confirm_stop_strategy_(.+)/, async (ctx) => {
      console.log('====== INLINE HANDLER CALLED ======')
      console.log('Match:', ctx.match);
      console.log('==================================');
      // Call the actual handler
      await martingaleHandlers.handleConfirmStopStrategy(ctx);
    });
    
    this.bot.action(/collect_strategy_rewards_(.+)/, martingaleHandlers.handleCollectStrategyRewards);
    
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
    this.bot.action('config_slippage', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'slippage'));
    this.bot.action('config_stoploss', (ctx) => martingaleHandlers.handleConfigChange(ctx, 'stoploss'));
    
    // History callbacks
    this.bot.action('martingale_history', martingaleHandlers.handleTradingHistory);
    this.bot.action('history_analytics', martingaleHandlers.handleDetailedAnalytics);
    this.bot.action('history_export', martingaleHandlers.handleExportReport);
    
    // Quick-access token buttons for Martingale
    // Token lookup table to keep callback data under Telegram's 64-byte limit
    const QUICK_TOKENS = {
      '1': '2uk6wbuauQSkxXfoFPmfG8c9GQuzkJJDCUYUZ4b2pump', // MIRA
      '2': 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp',  // ORE
      '3': '9Yn6bnF3eKLqocUVMxduh7WWqgQZ8DvWQDYTX9Ncpump', // zKSL
      '4': 'Ce2gx9KGXJ6C9Mp5b5x1sn9Mg87JwEbrQby4Zqo3pump', // NEET
      '5': '5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2', // TROLL
      '6': 'BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta'  // AVICI
    };
    
    this.bot.action(/martingale_quick_(\d+)/, async (ctx) => {
      const tokenId = ctx.match[1];
      const tokenAddress = QUICK_TOKENS[tokenId];
      const userId = ctx.from.id;
      const tokenAnalysisService = ctx.services?.tokenAnalysis;
      
      console.log(`[MARTINGALE QUICK] Button clicked - ID: ${tokenId}, Address: ${tokenAddress}`);
      
      if (!tokenAddress) {
        await ctx.answerCbQuery('❌ Invalid token ID');
        return;
      }
      
      await ctx.answerCbQuery('🔍 Analyzing token...');
      
      try {
        // Show analysis in progress
        await ctx.editMessageText(
          `${require('./utils/version').getBotTitle()}\n\n🔍 **Analyzing token...**\n\n⏳ Fetching market data, please wait...`,
          { parse_mode: 'Markdown' }
        );
        
        // Perform token analysis
        const analysis = await tokenAnalysisService.analyzeToken(tokenAddress);
        const formatted = tokenAnalysisService.formatAnalysisForDisplay(analysis);
        
        // Get user configuration
        const { getUserConfig, calculateMaxInvestment } = require('./commands/martingale');
        const userConfig = getUserConfig(ctx, userId);
        const maxInvestment = calculateMaxInvestment(userConfig);
        
        const analysisMessage = `
${require('./utils/version').getBotTitle()}

${formatted.header}

${formatted.price}
${formatted.changes}
${formatted.volume}

🤖 **Your Martingale Setup:**
💰 Initial: ${userConfig.initialBuyAmount} SOL | 📉 Trigger: ${userConfig.dropPercentage}%
⚡ Multiplier: ${userConfig.multiplier}x | 🔢 Levels: ${userConfig.maxLevels}
🎯 Profit: ${userConfig.profitTarget}% | 📎 Max Risk: ${maxInvestment.toFixed(4)} SOL

🚀 **Ready to launch?**
        `;
        
        // Store analysis for potential launch
        ctx.session = ctx.session || {};
        ctx.session.tokenAnalysis = analysis;
        ctx.session.awaitingToken = false;
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(analysisMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Launch Strategy', 'martingale_confirm_launch')],
            [Markup.button.callback('⚙️ Adjust Config', 'martingale_configure')],
            [Markup.button.callback('🔍 Analyze Another', 'martingale_launch')],
            [Markup.button.callback('🔙 Back', 'martingale_menu')]
          ])
        });
        
      } catch (error) {
        require('./utils/logger').error(`Quick token analysis error for ${tokenAddress}:`, error);
        
        let errorMessage = `${require('./utils/version').getBotTitle()}\n\n❌ **Token Analysis Failed**\n\n`;
        let suggestions = [];
        
        if (error.message.includes('not found')) {
          errorMessage += `🔍 **Token not found**\n\n`;
          suggestions = [
            '✅ Use the full contract address (43-44 characters)',
            '🔄 Try another token from the quick buttons',
            '🌐 Try popular tokens like SOL, BONK, USDC'
          ];
        } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
          errorMessage += `🌐 **Network Connection Issues**\n\n`;
          suggestions = [
            '🔄 Network is slow - please try again in a moment',
            '📊 APIs may be temporarily unavailable'
          ];
        } else {
          errorMessage += `⚠️ **Technical Error**\n\n${error.message}\n\n`;
          suggestions = [
            '🔄 Try again with a different token',
            '📞 Contact support if this persists'
          ];
        }
        
        errorMessage += `💡 **Try these:**\n${suggestions.join('\n')}`;
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(errorMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Try Again', 'martingale_launch')],
            [Markup.button.callback('🔙 Back', 'martingale_menu')]
          ])
        });
      }
    });
    
    // Grid trading callbacks
    this.bot.action('grid_menu', gridHandlers.handleGridMenu);
    this.bot.action('grid_configure', gridHandlers.handleConfigurationMenu);
    this.bot.action('grid_launch', gridHandlers.handleLaunchMenu);
    this.bot.action('grid_confirm_launch', gridHandlers.handleConfirmLaunch);
    this.bot.action('grid_execute_launch', gridHandlers.handleExecuteLaunch);
    this.bot.action('grid_active', gridHandlers.handleActiveGrids);
    this.bot.action(/grid_view_(.+)/, gridHandlers.handleViewGrid);
    this.bot.action(/grid_stop_(.+)/, gridHandlers.handleStopGrid);
    
    // Grid configuration callbacks
    this.bot.action('grid_config_initial', (ctx) => gridHandlers.handleConfigChange(ctx, 'initial'));
    this.bot.action('grid_config_buys', (ctx) => gridHandlers.handleConfigChange(ctx, 'buys'));
    this.bot.action('grid_config_sells', (ctx) => gridHandlers.handleConfigChange(ctx, 'sells'));
    this.bot.action('grid_config_drop', (ctx) => gridHandlers.handleConfigChange(ctx, 'drop'));
    this.bot.action('grid_config_leap', (ctx) => gridHandlers.handleConfigChange(ctx, 'leap'));
    this.bot.action('grid_config_reset', gridHandlers.handleResetConfig);
    
    // Quick-access token buttons for Grid
    // Reuse the same token lookup table
    this.bot.action(/grid_quick_(\d+)/, async (ctx) => {
      const tokenId = ctx.match[1];
      const tokenAddress = QUICK_TOKENS[tokenId];
      const userId = ctx.from.id;
      const tokenAnalysisService = ctx.services?.tokenAnalysis;
      const gridService = ctx.services?.grid;
      
      console.log(`[GRID QUICK] Button clicked - ID: ${tokenId}, Address: ${tokenAddress}`);
      
      if (!tokenAddress) {
        await ctx.answerCbQuery('❌ Invalid token ID');
        return;
      }
      
      await ctx.answerCbQuery('🔍 Analyzing token...');
      
      try {
        // Show analysis in progress
        await ctx.editMessageText(
          `${require('./utils/version').getBotTitle()}\n\n🔍 **Analyzing token...**\n\n⏳ Fetching market data, please wait...`,
          { parse_mode: 'Markdown' }
        );
        
        // Perform token analysis
        const analysis = await tokenAnalysisService.analyzeToken(tokenAddress);
        const formatted = tokenAnalysisService.formatAnalysisForDisplay(analysis);
        
        // Get user configuration
        const config = gridService.getUserConfig(userId);
        
        const analysisMessage = `
${require('./utils/version').getBotTitle()}

${formatted.header}

${formatted.price}
${formatted.changes}
${formatted.volume}

🕸️ **Your Grid Setup:**
💰 Initial: ${config.initialAmount} SOL | 📉 Buys: ${config.numBuys} | 📈 Sells: ${config.numSells}
📊 Drop: ${config.dropPercent}% | 🚀 Leap: ${config.leapPercent}%
📈 Max Coverage: ±${Math.max(config.dropPercent * config.numBuys, config.leapPercent * config.numSells).toFixed(1)}%

🚀 **Ready to launch?**
        `.trim();
        
        // Store analysis for launch
        ctx.session = ctx.session || {};
        ctx.session.gridTokenAnalysis = analysis;
        ctx.session.awaitingGridToken = false;
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(analysisMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Launch Grid', 'grid_confirm_launch')],
            [Markup.button.callback('⚙️ Adjust Config', 'grid_configure')],
            [Markup.button.callback('🔍 Analyze Another', 'grid_launch')],
            [Markup.button.callback('🔙 Back', 'grid_menu')]
          ])
        });
        
      } catch (error) {
        require('./utils/logger').error(`Quick token analysis error for ${tokenAddress}:`, error);
        
        let errorMessage = `${require('./utils/version').getBotTitle()}\n\n❌ **Token Analysis Failed**\n\n`;
        let suggestions = [];
        
        if (error.message.includes('not found')) {
          errorMessage += `🔍 **Token not found**\n\n`;
          suggestions = [
            '✅ Use the full contract address (43-44 characters)',
            '🔄 Try another token from the quick buttons',
            '🌐 Try popular tokens like SOL, BONK, USDC'
          ];
        } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
          errorMessage += `🌐 **Network Connection Issues**\n\n`;
          suggestions = [
            '🔄 Network is slow - please try again in a moment',
            '📊 APIs may be temporarily unavailable'
          ];
        } else {
          errorMessage += `⚠️ **Technical Error**\n\n${error.message}\n\n`;
          suggestions = [
            '🔄 Try again with a different token',
            '📞 Contact support if this persists'
          ];
        }
        
        errorMessage += `💡 **Try these:**\n${suggestions.join('\n')}`;
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(errorMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Try Again', 'grid_launch')],
            [Markup.button.callback('🔙 Back', 'grid_menu')]
          ])
        });
      }
    });
    
    // Hero/RPG callbacks
    this.bot.action('hero_menu', heroHandlers.handleHeroMenu);
    this.bot.action('hero_profile', heroHandlers.handleProfile);
    this.bot.action('hero_battle_menu', heroHandlers.handleBattleMenu);
    this.bot.action('hero_inventory', heroHandlers.handleInventory);
    
    // Stat allocation callbacks
    this.bot.action('stat_strength', async (ctx) => {
      ctx.services.hero.spendStat(ctx.from.id, 'strength');
      await heroHandlers.handleProfile(ctx);
    });
    this.bot.action('stat_wisdom', async (ctx) => {
      ctx.services.hero.spendStat(ctx.from.id, 'wisdom');
      await heroHandlers.handleProfile(ctx);
    });
    this.bot.action('stat_luck', async (ctx) => {
      ctx.services.hero.spendStat(ctx.from.id, 'luck');
      await heroHandlers.handleProfile(ctx);
    });
    
    // Inventory menu callbacks
    this.bot.action('inventory_equip', heroHandlers.handleInventoryEquip);
    this.bot.action('inventory_fuse', heroHandlers.handleInventoryFuse);
    this.bot.action('inventory_sell', heroHandlers.handleInventorySell);
    this.bot.action('inventory_shop', heroHandlers.handleInventoryShop);
    
    // Equip type selection callbacks
    this.bot.action('equip_class', (ctx) => heroHandlers.handleEquipType(ctx, 'class'));
    this.bot.action('equip_weapon', (ctx) => heroHandlers.handleEquipType(ctx, 'weapon'));
    this.bot.action('equip_pet', (ctx) => heroHandlers.handleEquipType(ctx, 'pet'));
    
    // Equip item callbacks (dynamic)
    this.bot.action(/equip_do_(class|weapon|pet)_(\d+)/, async (ctx) => {
      const match = ctx.match;
      const type = match[1];
      const index = parseInt(match[2]);
      const userId = ctx.from.id;
      const hero = ctx.services.hero.getHero(userId);
      const items = hero.inventory.filter(i => i.type === type)
        .sort((a, b) => {
          const rarityOrder = { legendary: 0, rare: 1, common: 2 };
          return rarityOrder[a.rarity] - rarityOrder[b.rarity];
        });
      const inventoryIndex = hero.inventory.indexOf(items[index]);
      const result = ctx.services.hero.equipItem(userId, inventoryIndex);
      if (result.success) {
        await ctx.answerCbQuery(`✅ Equipped ${result.item.id}!`);
      } else {
        await ctx.answerCbQuery(`❌ ${result.error}`);
      }
      await heroHandlers.handleEquipType(ctx, type);
    });
    
    // Unequip callbacks
    this.bot.action(/unequip_(class|weapon|pet)/, async (ctx) => {
      const type = ctx.match[1];
      const userId = ctx.from.id;
      const result = ctx.services.hero.unequipItem(userId, type);
      if (result.success) {
        await ctx.answerCbQuery('✅ Unequipped!');
      } else {
        await ctx.answerCbQuery(`❌ ${result.error}`);
      }
      await heroHandlers.handleEquipType(ctx, type);
    });
    
    // Fuse callbacks
    this.bot.action('fuse_auto', async (ctx) => {
      const userId = ctx.from.id;
      const result = ctx.services.hero.autoFuseItems(userId);
      if (result.fused > 0) {
        await ctx.answerCbQuery(`✨ Fused ${result.fused} items!`);
      } else {
        await ctx.answerCbQuery('❌ Nothing to fuse');
      }
      await heroHandlers.handleInventoryFuse(ctx);
    });
    
    // Sell callbacks
    this.bot.action(/sell_do_(\d+)/, async (ctx) => {
      const index = parseInt(ctx.match[1]);
      const userId = ctx.from.id;
      const price = ctx.services.hero.sellItem(userId, index);
      await ctx.answerCbQuery(`💰 Sold for ${price}💎!`);
      await heroHandlers.handleInventorySell(ctx);
    });
    
    // Shop buy callbacks
    this.bot.action(/shop_buy_(\d+)/, async (ctx) => {
      const index = parseInt(ctx.match[1]);
      const userId = ctx.from.id;
      const result = ctx.services.hero.buyShopItem(userId, index);
      if (result.success) {
        await ctx.answerCbQuery(`✅ Bought ${result.item.id}!`);
      } else {
        await ctx.answerCbQuery(`❌ ${result.error}`);
      }
      await heroHandlers.handleInventoryShop(ctx);
    });
    
    // Battle callbacks
    this.bot.action('battle_start', battleHandlers.handleStartBattle);
    this.bot.action(/ability_(\d+)/, battleHandlers.handleSelectAbility);
    this.bot.action(/target_(\d+)_(\d+)/, battleHandlers.handleSelectTarget);
    this.bot.action('battle_back', battleHandlers.handleBackToAbilities);
    this.bot.action('qte_tap', battleHandlers.handleQTETap);
    this.bot.action('qte_finish', battleHandlers.handleQTEFinish);
    this.bot.action('battle_flee', battleHandlers.handleFleeBattle);
    this.bot.action('battle_collect', battleHandlers.handleCollectRewards);
    
    // Dashboard callback
    this.bot.action('dashboard', dashboardHandlers.handleDashboard);
    
    // Active Bots callback
    this.bot.action('active_bots', activeBotsHandlers.handleActiveBots);
    
    // Notification callbacks
    notificationHandlers(this.bot, this.notificationService);
    
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
    
    // Strategies menu
    this.bot.action('strategies_menu', async (ctx) => {
      const userId = ctx.from.id;
      const martingaleService = ctx.services?.martingale;
      const walletService = ctx.services?.wallet;
      
      // Get SOL balance
      let balanceInfo = '';
      if (walletService) {
        const balance = await walletService.getWalletBalance(userId);
        balanceInfo = balance.hasWallet ? `💰 **Balance:** ${balance.balance.toFixed(4)} SOL` : '💰 **No Wallet Connected**';
      }
      
      // Get active strategies info
      let activeStrategiesInfo = '';
      if (martingaleService) {
        const strategies = martingaleService.getUserStrategies(userId);
        const activeStrategies = strategies.filter(s => s.status === 'active');
        
        if (activeStrategies.length > 0) {
          const totalPnL = activeStrategies.reduce((total, strategy) => {
            const currentValue = strategy.totalTokens * (strategy.highestPrice || 0);
            const pnl = currentValue - strategy.totalInvested;
            return total + pnl;
          }, 0);
          
          const pnlEmoji = totalPnL >= 0 ? '🜢' : '🔴';
          const sign = totalPnL >= 0 ? '+' : '';
          activeStrategiesInfo = `\n📊 **Active Strategies:** ${activeStrategies.length} | **P&L:** ${pnlEmoji} ${sign}${totalPnL.toFixed(4)} SOL`;
        } else {
          activeStrategiesInfo = '\n📊 **No active strategies**';
        }
      }
      
      const message = `
${getBotTitle()}

🤖 **Trading Strategies**

${balanceInfo}${activeStrategiesInfo}

🎯 **Available Strategies:**
• **Martingale Bot:** DCA with multipliers
• **🕸️ Grid Trading:** Automated buy low, sell high
      `;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...require('telegraf').Markup.inlineKeyboard([
          [require('telegraf').Markup.button.callback('🤖 Martingale Bot', 'martingale_menu')],
          [require('telegraf').Markup.button.callback('🕸️ Grid Trading', 'grid_menu')],
          [require('telegraf').Markup.button.callback('🔙 Back to Main', 'back_to_main')]
        ])
      });
    });
    
    // Under construction features
    
    this.bot.action('yeet_assistant', async (ctx) => {
      const message = `
${getBotTitle()}

🚀 **Yeet Assistant**

🚧 **Under Construction** 🚧

🔥 **Coming Soon:**
• 🚀 AI-powered trading decisions
• 🧠 Smart market analysis
• ⚡ Lightning-fast trade execution
• 🎯 Automated profit optimization
• 💬 Natural language trading commands

🤖 **Your AI trading companion!**
      `;
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...require('telegraf').Markup.inlineKeyboard([
          [require('telegraf').Markup.button.callback('🔔 Notify Me', 'notify_yeet_assistant')],
          [require('telegraf').Markup.button.callback('🤖 Back to Strategies', 'strategies_menu'), require('telegraf').Markup.button.callback('🔙 Main Menu', 'back_to_main')]
        ])
      });
    });
    
    // Notification callbacks (placeholder)
    this.bot.action('notify_grid_web', (ctx) => {
      ctx.answerCbQuery('🔔 You\'ll be notified when Grid Web is ready! 🕸️', { show_alert: true });
    });
    
    this.bot.action('notify_yeet_assistant', (ctx) => {
      ctx.answerCbQuery('🔔 You\'ll be notified when Yeet Assistant is ready! 🚀', { show_alert: true });
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
    
    // Catch-all for unmatched callback queries (MUST BE LAST)
    this.bot.on('callback_query', async (ctx) => {
      const data = ctx.callbackQuery?.data;
      console.log('[UNMATCHED CALLBACK]:', data);
      await ctx.answerCbQuery('⚠️ Action not recognized');
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
        const importTypeEmoji = result.importType === 'mnemonic' ? '🌱' : '🔑';
        const importTypeText = result.importType === 'mnemonic' ? 'Seed Phrase' : 'Private Key';
        
        const successMessage = `
${getBotTitle()}

✅ **Wallet Imported Successfully!**

🜢 **Your wallet is now connected:**
📍 **Address:** \`${result.publicKey.slice(0,5)}...${result.publicKey.slice(-5)}\`
${importTypeEmoji} **Import Type:** ${importTypeText}

🚀 **Your wallet is ready for trading!**
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
        `${getBotTitle()}\n\n❌ **Failed to import wallet**\n\n${error.message}`,
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

      // Start the bot (webhook or polling)
      if (config.telegram.useWebhook) {
        await this.startWebhook();
      } else {
        await this.startPolling();
      }

      // Graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));

    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }
  
  async startWebhook() {
    const express = require('express');
    const { webhookDomain, webhookPath, webhookPort, webhookSecret } = config.telegram;
    
    try {
      // Delete existing webhook first
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
      logger.info('Deleted existing webhook');
      
      // Set new webhook
      await this.bot.telegram.setWebhook(
        `${webhookDomain}${webhookPath}`,
        {
          drop_pending_updates: true,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query']
        }
      );
      logger.info(`Webhook set: ${webhookDomain}${webhookPath}`);
      
      // Create Express app for webhook
      const app = express();
      
      // Health check endpoint
      app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
      });
      
      // Webhook endpoint with secret validation
      app.use(this.bot.webhookCallback(webhookPath, {
        secretToken: webhookSecret
      }));
      
      // Start Express server
      app.listen(webhookPort, () => {
        logger.info(`🚀 Bot running on WEBHOOK mode`);
        logger.info(`📡 Webhook URL: ${webhookDomain}${webhookPath}`);
        logger.info(`🔌 Listening on port ${webhookPort}`);
      });
      
      // Verify webhook is set correctly
      const webhookInfo = await this.bot.telegram.getWebhookInfo();
      logger.info('Webhook info:', {
        url: webhookInfo.url,
        pending_updates: webhookInfo.pending_update_count,
        last_error: webhookInfo.last_error_message
      });
      
    } catch (error) {
      logger.error('Failed to set webhook:', error);
      logger.info('Falling back to polling mode...');
      await this.startPolling();
    }
  }
  
  async startPolling() {
    await this.bot.launch();
    logger.info('🚀 Bot running on POLLING mode');
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