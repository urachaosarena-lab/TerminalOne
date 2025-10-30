const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');

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
• Active Users (7d): **${data.userEngagement.activeUsers7d}**
• Active Users (30d): **${data.userEngagement.activeUsers30d}**
• New Users (7d): **${data.userEngagement.newUsers7d}**
• New Users (30d): **${data.userEngagement.newUsers30d}**

🤖 **Trading Activity**
• Total Strategies: **${data.tradingActivity.totalStrategiesLaunched}**
• Active Strategies: **${data.tradingActivity.activeStrategies}**
• Total Volume: **${data.tradingActivity.totalVolume.toFixed(4)} SOL**

⚔️ **Battle Activity**
• Total PvE Battles: **${data.battleActivity.totalBattles}**

💰 **Revenue**
• Platform Fees (7d): **${data.revenue.fees7d.toFixed(4)} SOL**
• Platform Fees (30d): **${data.revenue.fees30d.toFixed(4)} SOL**

🔄 **Last Updated:** ${new Date(data.generatedAt).toLocaleString()}
    `;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Refresh', 'dashboard')],
      [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
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
