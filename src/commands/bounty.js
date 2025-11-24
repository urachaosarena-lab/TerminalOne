const logger = require('../utils/logger');

async function handleBountyCommand(ctx, services) {
  const { bountyService } = services;
  const userId = ctx.from.id;

  try {
    logger.info(`User ${userId} requested bounty dashboard`);

    // Get bounty statistics
    const stats = await bountyService.getBountyStats();

    // Format the dashboard message
    const message = formatBountyDashboard(stats);

    // Send or edit dashboard with back button
    const keyboard = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Refresh Stats', callback_data: 'bounty_refresh' }],
          [{ text: '🔙 Back to Menu', callback_data: 'back_to_main' }]
        ]
      }
    };

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, keyboard);
      await ctx.answerCbQuery();
    } else {
      await ctx.reply(message, keyboard);
    }

  } catch (error) {
    logger.error('Error showing bounty dashboard:', error);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Error loading dashboard');
    } else {
      await ctx.reply('❌ Error loading bounty dashboard. Please try again later.');
    }
  }
}

/**
 * Format bounty dashboard message
 */
function formatBountyDashboard(stats) {
  const {
    vaultBalance,
    vaultBalanceUSD,
    totalFeesCollected,
    totalFeesCollectedUSD,
    currentPayout,
    currentPayoutUSD,
    totalBountyWins,
    currentTick,
    lastRollResult,
    vaultPublicKey,
    bountyChance,
    payoutPercent
  } = stats;

  // Calculate chance percentage
  const chancePercent = ((1 / bountyChance) * 100).toFixed(2);

  const message = `
🎯 *Bounty Dashboard*

💸 *Fees Stats:*
· Platform Fee: 1% per tx (min. 0.0005 SOL)
· Vault Wallet: \`${vaultPublicKey}\`
· Total Collected: ${totalFeesCollected.toFixed(6)} SOL ($${totalFeesCollectedUSD.toFixed(2)})
· Current Vault: ${vaultBalance.toFixed(6)} SOL ($${vaultBalanceUSD.toFixed(2)})

🎰 *Jackpot Stats:*
· Trigger Chance: 1 in ${bountyChance} (${chancePercent}%) on every tx
· Total Wins: ${totalBountyWins}
· Current Tick: ${currentTick}
· Current Payout: ${currentPayout.toFixed(6)} SOL ($${currentPayoutUSD.toFixed(2)})
· Last 1-${bountyChance} Gen (1=🎯): ${lastRollResult === 1 ? '🎯 ' : ''}${lastRollResult || 'N/A'}

📊 *How it Works:*
Every trade you make has a 1-in-${bountyChance} chance to trigger the bounty jackpot! If you hit it, you instantly receive ${payoutPercent}% of the vault balance. Good luck! 🍀
  `.trim();

  return message;
}

/**
 * Handle bounty refresh callback
 */
async function handleBountyRefresh(ctx, services) {
  const { bountyService } = services;
  const userId = ctx.from.id;

  try {
    logger.info(`User ${userId} refreshed bounty dashboard`);

    // Get updated statistics
    const stats = await bountyService.getBountyStats();

    // Format the dashboard message
    const message = formatBountyDashboard(stats);

    // Edit the message
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Refresh Stats', callback_data: 'bounty_refresh' }],
          [{ text: '🔙 Back to Menu', callback_data: 'back_to_main' }]
        ]
      }
    });

    // Answer callback query
    await ctx.answerCbQuery('✅ Stats refreshed!');

  } catch (error) {
    logger.error('Error refreshing bounty dashboard:', error);
    await ctx.answerCbQuery('❌ Error refreshing stats');
  }
}

module.exports = {
  handleBountyCommand,
  handleBountyRefresh
};
