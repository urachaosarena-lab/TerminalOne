const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');

module.exports = async (ctx) => {
  // Get services from context
  const priceService = ctx.services?.price;
  const walletService = ctx.services?.wallet;
  const userId = ctx.from.id;

  try {
    // Get SOL price data
    const priceData = await priceService.getSolanaPrice();
    const priceInfo = priceData.error ? 
      '🔴 Price unavailable' : 
      `${priceService.formatPrice(priceData.price)} | ${priceData.change1h !== 0 ? `1H: ${priceService.formatPriceChange(priceData.change1h)} | ` : ''}24H: ${priceService.formatPriceChange(priceData.change24h)}`;

    // Get wallet balance
    const balanceInfo = await walletService.getWalletBalance(userId);
    const balanceText = balanceInfo.hasWallet ? 
      `💰 **${balanceInfo.balance.toFixed(4)} SOL**` : 
      '💰 **No Wallet Connected**';
    
    // Get ALL active bots info (Martingale + Grid)
    const martingaleService = ctx.services?.martingale;
    const gridService = ctx.services?.grid;
    let activeBotsText = '';
    
    if (balanceInfo.hasWallet) {
      let totalActiveBots = 0;
      let totalPnL = 0;
      let hasAnyPnL = false;
      
      // Get SOL price for proper conversion
      const solPriceData = await priceService.getSolanaPrice();
      const solPrice = solPriceData.price || 200; // Fallback
      
      // Count Martingale active strategies
      if (martingaleService) {
        const strategies = martingaleService.getUserStrategies(userId);
        const activeStrategies = strategies.filter(s => s.status === 'active');
        totalActiveBots += activeStrategies.length;
        
        if (activeStrategies.length > 0) {
          hasAnyPnL = true;
          const pnlResults = await Promise.all(activeStrategies.map(async (strategy) => {
            let tokenPrice = strategy.averageBuyPrice || 0;
            try {
              const priceData = await priceService.getTokenPrice(strategy.tokenAddress);
              tokenPrice = priceData.price || tokenPrice;
            } catch (err) {
              // Use stored price if fetch fails
            }
            
            const currentValueUSD = strategy.totalTokens * tokenPrice;
            const currentValueSOL = currentValueUSD / solPrice;
            const pnl = currentValueSOL - strategy.totalInvested;
            
            return pnl;
          }));
          
          totalPnL += pnlResults.reduce((sum, pnl) => sum + pnl, 0);
        }
      }
      
      // Count Grid active strategies
      if (gridService) {
        const activeGrids = gridService.getUserActiveGrids(userId);
        totalActiveBots += activeGrids.length;
        
        if (activeGrids.length > 0) {
          hasAnyPnL = true;
          const pnlResults = await Promise.all(activeGrids.map(async (grid) => {
            try {
              const priceData = await priceService.getTokenPrice(grid.tokenAddress);
              const currentPrice = priceData.price || grid.currentPrice;
              
              const pnlData = await gridService.calculateGridPnL(grid, currentPrice, solPrice);
              return pnlData.totalPnLSOL;
            } catch (err) {
              return 0;
            }
          }));
          
          totalPnL += pnlResults.reduce((sum, pnl) => sum + pnl, 0);
        }
      }
      
      // Format active bots display
      if (totalActiveBots > 0 && hasAnyPnL) {
        const pnlEmoji = totalPnL >= 0 ? '🟢' : '🔴';
        const sign = totalPnL >= 0 ? '+' : '';
        activeBotsText = `\n💻 **Active Bots:** ${totalActiveBots} | ${pnlEmoji} ${sign}${totalPnL.toFixed(4)} SOL`;
      } else {
        activeBotsText = `\n💻 **Active Bots:** ${totalActiveBots}`;
      }
    }

    // Get Hero stats
    const heroService = ctx.services?.hero;
    let heroStatsText = '';
    
    if (heroService && balanceInfo.hasWallet) {
      try {
        const hero = heroService.getHero(userId);
        if (hero) {
          heroStatsText = `\n\n⚔️ **Hero**\n🧪 **Level:** ${hero.level} | 🌡️ **XP:** ${hero.xp}/${hero.xpToNextLevel} | ⚡ **Energy:** ${hero.energy}/${hero.maxEnergy}`;
        }
      } catch (err) {
        // Hero not created yet, skip
      }
    }

    const welcomeMessage = `
${getBotTitle()}

🟠 *Your Premium Solana Trading Terminal*

📊 **SOL Market Data**
${priceInfo}

${balanceText}
${balanceInfo.hasWallet ? `\n📍 \`${balanceInfo.publicKey.slice(0,5)}...${balanceInfo.publicKey.slice(-5)}\`` : ''}${activeBotsText}${heroStatsText}
    `;

    const keyboard = balanceInfo.hasWallet ? 
      // User has wallet - show main menu
      Markup.inlineKeyboard([
        [Markup.button.callback('💰 Wallet', 'wallet'), Markup.button.callback('💻 Active Bots', 'active_bots')],
        [Markup.button.callback('🤖 Initiate Bot', 'strategies_menu'), Markup.button.callback('⚔️ Hero', 'hero_menu')],
        [Markup.button.callback('📊 Dashboard', 'dashboard'), Markup.button.callback('❓ Help', 'help')]
      ]) :
      // User has no wallet - show wallet setup
      Markup.inlineKeyboard([
        [Markup.button.callback('🆕 Create Wallet', 'create_wallet')],
        [Markup.button.callback('📥 Import Wallet', 'import_wallet')],
        [Markup.button.callback('📊 Dashboard', 'dashboard')],
        [Markup.button.callback('❓ Help', 'help')]
      ]);

    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      ...keyboard
    });

  } catch (error) {
    console.error('Error in start command:', error);
    
    // Fallback message if services fail
    const fallbackMessage = `
${getBotTitle()}

🟠 *Your Premium Solana Trading Terminal*

⚡ *Initializing services...*

🚀 *Ready to get started?*
    `;

    const fallbackKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🆕 Create Wallet', 'create_wallet')],
      [Markup.button.callback('📥 Import Wallet', 'import_wallet')],
      [Markup.button.callback('❓ Help', 'help')]
    ]);

    await ctx.reply(fallbackMessage, {
      parse_mode: 'Markdown',
      ...fallbackKeyboard
    });
  }
};



