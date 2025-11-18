const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');
const logger = require('../utils/logger');
const { formatSOL, formatPnL } = require('../utils/uiHelpers');

/**
 * Handle Active Bots Panel - Unified view of all active strategies
 */
async function handleActiveBots(ctx) {
  const userId = ctx.from.id;
  const martingaleService = ctx.services?.martingale;
  const gridService = ctx.services?.grid;
  const priceService = ctx.services?.price;
  
  try {
    // Get active Martingale strategies
    let martingaleStrategies = [];
    let martingaleActive = 0;
    let martingalePnL = 0;
    
    if (martingaleService) {
      const allStrategies = martingaleService.getUserStrategies(userId);
      martingaleStrategies = allStrategies.filter(s => s.status === 'active');
      martingaleActive = martingaleStrategies.length;
      
      // Calculate total Martingale PnL
      if (martingaleActive > 0 && priceService) {
        const solPriceData = await priceService.getSolanaPrice();
        const solPrice = solPriceData.price || 200;
        
        const pnlResults = await Promise.all(martingaleStrategies.map(async (strategy) => {
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
        
        martingalePnL = pnlResults.reduce((sum, pnl) => sum + pnl, 0);
      }
    }
    
    // Get active Grid strategies
    let gridStrategies = [];
    let gridActive = 0;
    let gridPnL = 0;
    
    if (gridService) {
      gridStrategies = gridService.getUserActiveGrids(userId);
      gridActive = gridStrategies.length;
      
      // Calculate total Grid PnL
      if (gridActive > 0 && priceService) {
        const solPriceData = await priceService.getSolanaPrice();
        const solPrice = solPriceData.price || 200;
        
        const pnlResults = await Promise.all(gridStrategies.map(async (grid) => {
          try {
            const priceData = await priceService.getTokenPrice(grid.tokenAddress);
            const currentPrice = priceData.price || grid.currentPrice;
            
            // Calculate PnL using the grid service method
            const pnlData = await gridService.calculateGridPnL(grid, currentPrice, solPrice);
            
            return pnlData.totalPnLSOL;
          } catch (err) {
            logger.error(`Error calculating grid PnL for ${grid.gridId}:`, err);
            return 0;
          }
        }));
        
        gridPnL = pnlResults.reduce((sum, pnl) => sum + pnl, 0);
      }
    }
    
    // Calculate totals
    const totalActive = martingaleActive + gridActive;
    const totalPnL = martingalePnL + gridPnL;
    
    // Build message
    let message = `${getBotTitle()}\n\n💻 **Active Bots Overview**\n\n`;
    
    if (totalActive === 0) {
      message += `📊 **No Active Bots**\n\nYou don't have any active trading strategies running.\n\n🚀 Launch a strategy to start automated trading!`;
    } else {
      message += `📊 **Total Active:** **${totalActive}** bot${totalActive !== 1 ? 's' : ''}\n`;
      message += `${formatPnL(totalPnL)}\n\n`;
      
      // Martingale section
      if (martingaleActive > 0) {
        message += `🤖 **Martingale Bots**\n`;
        message += `• Active: **${martingaleActive}**\n`;
        message += `• P&L: ${formatPnL(martingalePnL)}\n`;
        
        // Show brief info about each strategy
        martingaleStrategies.slice(0, 3).forEach((strategy, index) => {
          const symbol = strategy.symbol || 'Unknown';
          message += `  ${index + 1}. ${symbol} - ${formatSOL(strategy.totalInvested).replace(' SOL', '')} SOL\n`;
        });
        
        if (martingaleActive > 3) {
          message += `  ... and ${martingaleActive - 3} more\n`;
        }
        
        message += `\n`;
      }
      
      // Grid section
      if (gridActive > 0) {
        message += `🕸️ **Grid Trading Bots**\n`;
        message += `• Active: **${gridActive}**\n`;
        message += `• P&L: ${formatPnL(gridPnL)}\n`;
        
        // Show brief info about each grid
        gridStrategies.slice(0, 3).forEach((grid, index) => {
          const symbol = grid.tokenSymbol || 'Unknown';
          message += `  ${index + 1}. ${symbol} - ${formatSOL(grid.initialAmount).replace(' SOL', '')} SOL\n`;
        });
        
        if (gridActive > 3) {
          message += `  ... and ${gridActive - 3} more\n`;
        }
        
        message += `\n`;
      }
      
      message += `⚡ Bots are monitoring and executing trades automatically.`;
    }
    
    // Build keyboard
    const buttons = [];
    
    if (martingaleActive > 0) {
      buttons.push([Markup.button.callback(`🤖 Martingale Bots (${martingaleActive})`, 'martingale_active')]);
    }
    
    if (gridActive > 0) {
      buttons.push([Markup.button.callback(`🕸️ Grid Bots (${gridActive})`, 'grid_active')]);
    }
    
    buttons.push(
      [Markup.button.callback('🤖 Martingale', 'martingale_menu'), Markup.button.callback('🕸️ Grid', 'grid_menu')],
      [Markup.button.callback('🔄 Refresh', 'active_bots'), Markup.button.callback('🔙 Main Menu', 'back_to_main')]
    );
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    // Send or edit message
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
      await ctx.answerCbQuery();
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (error) {
    logger.error('Error displaying active bots:', error);
    await ctx.reply('❌ Error loading active bots. Please try again.');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
  }
}

module.exports = {
  handleActiveBots
};
