const { Markup } = require('telegraf');

module.exports = async (ctx) => {
  const helpMessage = `
🦈 **TerminalOne🦈**

🟠 **Help & Features**

🔥 **Current Features:**
• 💰 Create & Import Wallets
• 🔍 View SOL Balance
• 📈 Real-time SOL Price
• 🔐 Secure Key Management

⚡ **Coming Soon:**
• 🔄 Token Trading (Jupiter DEX)
• 📊 Portfolio Analytics  
• 🔔 Price Alerts
• 🏆 Social Trading
• 🎮 Gamification

🐟 **Navigation:**
Use the buttons below to navigate through the bot. All features are accessible through the interactive menu system.

🔒 **Security:**
• Never share your private keys
• Always backup your wallet
• Double-check all transactions

🚀 **Ready to start trading?**
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🆕 Create Wallet', 'create_wallet'), Markup.button.callback('📥 Import Wallet', 'import_wallet')],
    [Markup.button.callback('💰 My Wallet', 'wallet'), Markup.button.callback('📊 Portfolio', 'portfolio')],
    [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(helpMessage, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  }
};
