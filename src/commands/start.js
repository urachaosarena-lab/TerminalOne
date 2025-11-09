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
    
    // Get active strategies info
    const martingaleService = ctx.services?.martingale;
    let strategiesText = '';
    if (martingaleService && balanceInfo.hasWallet) {
      const strategies = martingaleService.getUserStrategies(userId);
      const activeStrategies = strategies.filter(s => s.status === 'active');
      
      if (activeStrategies.length > 0) {
        // Get SOL price for proper conversion
        const solPriceData = await priceService.getSolanaPrice();
        const solPrice = solPriceData.price || 200; // Fallback
        
        // Calculate PnL in SOL properly
        const pnlResults = await Promise.all(activeStrategies.map(async (strategy) => {
          let tokenPrice = strategy.averageBuyPrice || 0;
          try {
            const priceData = await priceService.getTokenPrice(strategy.tokenAddress);
            tokenPrice = priceData.price || tokenPrice;
          } catch (err) {
            // Use stored price if fetch fails
          }
          
          // Calculate current value in SOL: (tokens * token price USD) / SOL price USD
          const currentValueUSD = strategy.totalTokens * tokenPrice;
          const currentValueSOL = currentValueUSD / solPrice;
          const pnl = currentValueSOL - strategy.totalInvested;
          const roi = strategy.totalInvested > 0 ? (pnl / strategy.totalInvested * 100) : 0;
          
          return { pnl, roi };
        }));
        
        const totalPnL = pnlResults.reduce((sum, result) => sum + result.pnl, 0);
        const avgRoi = pnlResults.reduce((sum, result) => sum + result.roi, 0) / pnlResults.length;
        
        const pnlEmoji = totalPnL >= 0 ? '🟢' : '🔴';
        const sign = totalPnL >= 0 ? '+' : '';
        
        strategiesText = `\n🤖 **Active Strategies:** ${activeStrategies.length} | ${pnlEmoji} ${sign}${totalPnL.toFixed(4)} SOL (${sign}${avgRoi.toFixed(1)}%)`;
      } else {
        strategiesText = '\n🤖 **Active Strategies:** 0';
      }
    }

    const welcomeMessage = `
${getBotTitle()}

🟠 *Your Premium Solana Trading Terminal*

📊 **SOL Market Data**
${priceInfo}

${balanceText}
${balanceInfo.hasWallet ? `\n📍 \`${balanceInfo.publicKey.slice(0,5)}...${balanceInfo.publicKey.slice(-5)}\`` : ''}${strategiesText}

🚀 *Ready to dominate the Solana ecosystem?*
    `;

    const keyboard = balanceInfo.hasWallet ? 
      // User has wallet - show main menu
      Markup.inlineKeyboard([
        [Markup.button.callback('💰 Wallet', 'wallet'), Markup.button.callback('💻 Active Bots', 'active_bots')],
        [Markup.button.callback('🤖 Strategies', 'strategies_menu'), Markup.button.callback('⚔️ Hero', 'hero_menu')],
        [Markup.button.callback('📊 Dashboard', 'dashboard'), Markup.button.callback('🔄 Trade', 'trade')],
        [Markup.button.callback('⚙️ Settings', 'settings'), Markup.button.callback('❓ Help', 'help')]
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



