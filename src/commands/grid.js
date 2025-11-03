const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');
const logger = require('../utils/logger');

/**
 * Grid Trading Menu
 */
async function handleGridMenu(ctx) {
  const userId = ctx.from.id;
  const config = ctx.services.grid.getUserConfig(userId);
  const activeGrids = ctx.services.grid.getUserActiveGrids(userId);
  
  const message = `
${getBotTitle()}

📊 **GRID TRADING**

Grid trading automatically buys low and sells high using preset price levels. Perfect for range-bound markets!

**Your Configuration:**
💰 Initial Amount: **${config.initialAmount} SOL**
📉 Buy Orders: **${config.numBuys}** (${config.dropPercent}% apart)
📈 Sell Orders: **${config.numSells}** (${config.leapPercent}% apart)

**Active Grids:** ${activeGrids.length}

🎯 **How It Works:**
1. Bot buys 50% of initial amount
2. Sets ${config.numBuys} buy orders below entry
3. Sets ${config.numSells} sell orders above entry
4. Executes trades when price hits levels
5. Runs 24/7 until you stop it

⚠️ **Risk:** Grid works best in sideways markets. Trending markets may cause losses.
  `.trim();
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚙️ Configure', 'grid_configure')],
    [Markup.button.callback('🚀 Launch Grid', 'grid_launch')],
    [Markup.button.callback('📊 Active Grids', 'grid_active')],
    [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
  ]);
  
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
}

/**
 * Grid Configuration Menu
 */
async function handleConfigurationMenu(ctx) {
  const userId = ctx.from.id;
  const config = ctx.services.grid.getUserConfig(userId);
  
  const message = `
${getBotTitle()}

⚙️ **GRID CONFIGURATION**

**Current Settings:**

💰 **Initial Amount:** ${config.initialAmount} SOL
   └ Range: 0.04 - 100 SOL

📉 **Buy Orders:** ${config.numBuys}
   └ Range: 2 - 50 orders

📈 **Sell Orders:** ${config.numSells}
   └ Range: 2 - 50 orders

📊 **Drop %:** ${config.dropPercent}%
   └ Space between buy orders (0.2% - 33%)

🚀 **Leap %:** ${config.leapPercent}%
   └ Space between sell orders (0.2% - 100%)

Select a parameter to change:
  `.trim();
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('💰 Initial Amount', 'grid_config_initial')],
      [Markup.button.callback('📉 Buy Orders', 'grid_config_buys')],
      [Markup.button.callback('📈 Sell Orders', 'grid_config_sells')],
      [Markup.button.callback('📊 Drop %', 'grid_config_drop')],
      [Markup.button.callback('🚀 Leap %', 'grid_config_leap')],
      [Markup.button.callback('🔙 Back', 'grid_menu')]
    ])
  });
  
  await ctx.answerCbQuery();
}

/**
 * Handle config parameter change
 */
async function handleConfigChange(ctx, paramType) {
  const userId = ctx.from.id;
  const config = ctx.services.grid.getUserConfig(userId);
  
  const paramInfo = {
    initial: { name: 'Initial Amount', unit: 'SOL', min: 0.04, max: 100, key: 'initialAmount' },
    buys: { name: 'Buy Orders', unit: '', min: 2, max: 50, key: 'numBuys' },
    sells: { name: 'Sell Orders', unit: '', min: 2, max: 50, key: 'numSells' },
    drop: { name: 'Drop %', unit: '%', min: 0.2, max: 33, key: 'dropPercent' },
    leap: { name: 'Leap %', unit: '%', min: 0.2, max: 100, key: 'leapPercent' }
  };
  
  const info = paramInfo[paramType];
  const currentValue = config[info.key];
  
  const message = `
${getBotTitle()}

**${info.name}**

Current: **${currentValue}${info.unit}**
Range: ${info.min} - ${info.max}${info.unit}

Please send the new value:
  `.trim();
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Cancel', 'grid_configure')]
    ])
  });
  
  await ctx.answerCbQuery();
  
  // Set awaiting state
  ctx.session.awaitingGridConfig = info.key;
}

/**
 * Handle config value input
 */
async function handleConfigValueInput(ctx) {
  const userId = ctx.from.id;
  const configKey = ctx.session.awaitingGridConfig;
  
  if (!configKey) return;
  
  try {
    const value = parseFloat(ctx.message.text);
    
    if (isNaN(value)) {
      await ctx.reply('❌ Invalid number. Please try again.');
      return;
    }
    
    const result = ctx.services.grid.updateConfig(userId, configKey, value);
    
    if (result.success) {
      await ctx.reply(`✅ Configuration updated successfully!`);
      delete ctx.session.awaitingGridConfig;
      await handleConfigurationMenu(ctx);
    } else {
      await ctx.reply(`❌ ${result.error}`);
    }
  } catch (error) {
    logger.error('Config value input error:', error);
    await ctx.reply('❌ Error updating configuration');
  }
}

/**
 * Grid Launch Menu
 */
async function handleLaunchMenu(ctx) {
  const userId = ctx.from.id;
  const config = ctx.services.grid.getUserConfig(userId);
  const balance = await ctx.services.wallet.getBalance(userId);
  
  const message = `
${getBotTitle()}

🚀 **LAUNCH GRID**

**Configuration:**
💰 Initial Amount: ${config.initialAmount} SOL
📉 Buy Orders: ${config.numBuys} (${config.dropPercent}% apart)
📈 Sell Orders: ${config.numSells} (${config.leapPercent}% apart)

**Wallet Balance:** ${balance.toFixed(4)} SOL

**Next Steps:**
1. Send the token address you want to grid trade
2. Bot will execute initial buy (50% = ${(config.initialAmount / 2).toFixed(3)} SOL)
3. Set up ${config.numBuys} buy and ${config.numSells} sell orders
4. Monitor and execute trades automatically

⚠️ Make sure you have at least **${config.initialAmount} SOL** in your wallet.

Send token address to continue:
  `.trim();
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back', 'grid_menu')]
    ])
  });
  
  await ctx.answerCbQuery();
  ctx.session.awaitingGridToken = true;
}

/**
 * Handle token address input and launch grid
 */
async function handleTokenAnalysis(ctx) {
  const userId = ctx.from.id;
  const tokenAddress = ctx.message.text.trim();
  
  if (!ctx.session.awaitingGridToken) return;
  
  delete ctx.session.awaitingGridToken;
  
  // Validate token address
  if (!tokenAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    await ctx.reply('❌ Invalid Solana token address. Please try again or /grid to start over.');
    return;
  }
  
  await ctx.reply('🔄 Launching grid trading strategy...\n\nThis may take a moment.');
  
  try {
    const result = await ctx.services.grid.launchGrid(userId, tokenAddress);
    
    if (result.success) {
      const message = `
${getBotTitle()}

✅ **GRID LAUNCHED SUCCESSFULLY!**

**Grid ID:** \`${result.gridId.slice(0, 16)}...\`
**Token:** \`${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-8)}\`
**Entry Price:** $${result.entryPrice.toFixed(8)}
**Initial Tokens:** ${result.tokensReceived.toLocaleString()}

**Grid Setup:**
📉 ${result.buyGrids} buy orders set below entry
📈 ${result.sellGrids} sell orders set above entry

🤖 Bot is now monitoring prices every 30 seconds and will execute trades automatically when price hits grid levels.

Use /grid to view active grids and performance.
      `.trim();
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📊 View Grid', `grid_view_${result.gridId}`)],
          [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
        ])
      });
    } else {
      await ctx.reply(`❌ **Grid launch failed:**\n\n${result.error}\n\nPlease check your balance and try again.`, {
        parse_mode: 'Markdown'
      });
    }
  } catch (error) {
    logger.error('Grid launch error:', error);
    await ctx.reply('❌ Error launching grid. Please try again later.');
  }
}

/**
 * Show active grids
 */
async function handleActiveGrids(ctx) {
  const userId = ctx.from.id;
  const activeGrids = ctx.services.grid.getUserActiveGrids(userId);
  
  if (activeGrids.length === 0) {
    const message = `
${getBotTitle()}

**ACTIVE GRIDS**

You don't have any active grids.

Use **🚀 Launch Grid** to start a new grid trading strategy.
    `.trim();
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Launch Grid', 'grid_launch')],
        [Markup.button.callback('🔙 Back', 'grid_menu')]
      ])
    });
    await ctx.answerCbQuery();
    return;
  }
  
  const message = `
${getBotTitle()}

**ACTIVE GRIDS** (${activeGrids.length})

Select a grid to view details:
  `.trim();
  
  const buttons = activeGrids.map(grid => {
    const shortId = grid.gridId.slice(5, 13);
    const tokenShort = `${grid.tokenAddress.slice(0, 4)}...${grid.tokenAddress.slice(-4)}`;
    return [Markup.button.callback(`📊 ${tokenShort} (${shortId})`, `grid_view_${grid.gridId}`)];
  });
  
  buttons.push([Markup.button.callback('🔙 Back', 'grid_menu')]);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
  
  await ctx.answerCbQuery();
}

/**
 * View grid details
 */
async function handleViewGrid(ctx) {
  const userId = ctx.from.id;
  const gridId = ctx.match[1];
  
  const gridState = ctx.services.grid.getGridDetails(userId, gridId);
  if (!gridState) {
    await ctx.answerCbQuery('Grid not found');
    return;
  }
  
  const pnl = await ctx.services.grid.calculateGridPnL(userId, gridId);
  
  if (!pnl) {
    await ctx.answerCbQuery('Unable to calculate P&L');
    return;
  }
  
  const pnlEmoji = pnl.totalPnL >= 0 ? '📈' : '📉';
  const pnlColor = pnl.totalPnL >= 0 ? '🟢' : '🔴';
  
  const runtime = Math.floor((new Date() - gridState.createdAt) / 1000 / 60);
  
  const message = `
${getBotTitle()}

**GRID DETAILS**

**Status:** ${gridState.status === 'active' ? '🟢 Active' : '🔴 Stopped'}
**Token:** \`${gridState.tokenAddress.slice(0, 8)}...${gridState.tokenAddress.slice(-8)}\`
**Runtime:** ${runtime} minutes

**Performance:**
${pnlColor} **P&L:** ${pnl.totalPnL >= 0 ? '+' : ''}${pnl.totalPnL.toFixed(4)} SOL (${pnl.pnlPercent >= 0 ? '+' : ''}${pnl.pnlPercent.toFixed(2)}%)

**Position:**
💰 Invested: ${pnl.totalInvested.toFixed(4)} SOL
💵 Realized: ${pnl.totalRealized.toFixed(4)} SOL
🪙 Tokens Held: ${pnl.tokensHeld.toLocaleString()}
💲 Value: ${pnl.unrealizedValue.toFixed(4)} SOL

**Trading:**
📉 Filled Buys: ${pnl.filledBuys}/${gridState.buyGrids.length}
📈 Filled Sells: ${pnl.filledSells}/${gridState.sellGrids.length}
📊 Total Orders: ${pnl.totalOrders}

**Price:**
Entry: $${gridState.entryPrice.toFixed(8)}
Current: $${pnl.currentPrice.toFixed(8)}
Change: ${((pnl.currentPrice - gridState.entryPrice) / gridState.entryPrice * 100).toFixed(2)}%

Last checked: ${new Date(gridState.lastCheck).toLocaleTimeString()}
  `.trim();
  
  const buttons = [];
  if (gridState.status === 'active') {
    buttons.push([Markup.button.callback('🛑 Stop Grid', `grid_stop_${gridId}`)]);
  }
  buttons.push([Markup.button.callback('🔄 Refresh', `grid_view_${gridId}`)]);
  buttons.push([Markup.button.callback('🔙 Back', 'grid_active')]);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
  
  await ctx.answerCbQuery();
}

/**
 * Stop grid
 */
async function handleStopGrid(ctx) {
  const userId = ctx.from.id;
  const gridId = ctx.match[1];
  
  await ctx.answerCbQuery('Stopping grid...');
  
  const result = await ctx.services.grid.stopGrid(userId, gridId);
  
  if (result.success) {
    const pnlEmoji = result.pnl >= 0 ? '📈' : '📉';
    const message = `
${getBotTitle()}

✅ **GRID STOPPED**

${pnlEmoji} **Final P&L:** ${result.pnl >= 0 ? '+' : ''}${result.pnl.toFixed(4)} SOL (${result.pnlPercent >= 0 ? '+' : ''}${result.pnlPercent.toFixed(2)}%)

**Summary:**
💰 Total Invested: ${result.totalInvested.toFixed(4)} SOL
💵 Total Realized: ${result.totalRealized.toFixed(4)} SOL
🪙 Tokens Held: ${result.tokensHeld.toLocaleString()}
📊 Orders Filled: ${result.filledOrders}

Grid monitoring has been stopped. You can still view the grid history.
    `.trim();
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Active Grids', 'grid_active')],
        [Markup.button.callback('🏠 Main Menu', 'back_to_main')]
      ])
    });
  } else {
    await ctx.reply(`❌ Error stopping grid: ${result.error}`);
  }
}

module.exports = {
  handleGridMenu,
  handleConfigurationMenu,
  handleConfigChange,
  handleConfigValueInput,
  handleLaunchMenu,
  handleTokenAnalysis,
  handleActiveGrids,
  handleViewGrid,
  handleStopGrid
};
