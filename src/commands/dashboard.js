const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');
const { formatSOL } = require('../utils/uiHelpers');

/**
 * Handle dashboard view
 */
const handleDashboard = async (ctx) => {
  const analyticsService = ctx.services?.analytics;
  
  if (!analyticsService) {
    await ctx.reply('❌ Analytics service not available');
    return;
  }
  
  try {
    // Get all dashboard data
    const data = analyticsService.getDashboardData();
    
    const message = `
${getBotTitle()}

📊 **Platform Dashboard**

👥 **User Engagement**
• Active (7d): **${data.userEngagement.activeUsers7d}** | New (7d): **${data.userEngagement.newUsers7d}**
• Active (30d): **${data.userEngagement.activeUsers30d}** | New (30d): **${data.userEngagement.newUsers30d}**

🤖 **Trading Activity**
• Total Strategies: **${data.tradingActivity.totalStrategiesLaunched}**
• Active Strategies: **${data.tradingActivity.activeStrategies}**
• Total Volume: **${formatSOL(data.tradingActivity.totalVolume).replace(' SOL', '')} SOL**

⚔️ **Battle Activity**
• Total PvE Battles: **${data.battleActivity.totalBattles}**

💰 **Revenue**
• 7d Fees: **${formatSOL(data.revenue.fees7d).replace(' SOL', '')} SOL**
• 30d Fees: **${formatSOL(data.revenue.fees30d).replace(' SOL', '')} SOL**

🔄 **Updated:** ${new Date(data.generatedAt).toLocaleString()}
    `;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh', 'dashboard'), Markup.button.callback('🔙 Main Menu', 'back_to_main')]
    ]);
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (error) {
    console.error('Error displaying dashboard:', error);
    await ctx.reply('❌ Error loading dashboard data. Please try again.');
  }
};

module.exports = {
  handleDashboard
};
