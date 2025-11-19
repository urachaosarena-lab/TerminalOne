const { Markup } = require('telegraf');
const { getBotTitle } = require('../utils/version');
const logger = require('../utils/logger');
const { formatSOL, formatPercent } = require('../utils/uiHelpers');

/**
 * Grid Trading Menu
 */
async function handleGridMenu(ctx) {
  const userId = ctx.from.id;
  const gridService = ctx.services?.grid;
  const walletService = ctx.services?.wallet;
  
  if (!gridService) {
    await ctx.reply('❌ Grid service not available');
    return;
  }

  // Get SOL balance
  let balanceText = '';
  if (walletService) {
    const balance = await walletService.getWalletBalance(userId);
    balanceText = balance.hasWallet ? `💰 **Balance:** ${formatSOL(balance.balance).replace(' SOL', '')} SOL` : '💰 **No Wallet Connected**';
  }

  // Get user's active grids
  const activeGrids = gridService.getUserActiveGrids(userId);
  const activeCount = activeGrids.length;
  
  // Get user's current configuration
  const config = gridService.getUserConfig(userId);
  
  const message = `
${getBotTitle()}

🕸️ **Grid Trading**

${balanceText}

📊 **Current Configuration:**
💰 Initial: **${config.initialAmount} SOL** | 📉 Buys: **${config.numBuys}** (${config.dropPercent}%)
📈 Sells: **${config.numSells}** (${config.leapPercent}%) | 📎 Max Risk: **${formatSOL(config.initialAmount).replace(' SOL', '')} SOL**

📈 **Active Grids:** **${activeCount}**

🚀 Ready to profit from volatility?
  `.trim();
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚙️ Configure', 'grid_configure'), Markup.button.callback('🚀 Launch', 'grid_launch')],
    [Markup.button.callback('📊 Active Grids', 'grid_active')],
    [Markup.button.callback('🔙 Back', 'strategies_menu'), Markup.button.callback('🏠 Main Menu', 'back_to_main')]
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
  
  const walletService = ctx.services?.wallet;
  let balanceText = '0.0000';
  if (walletService) {
    const balance = await walletService.getWalletBalance(userId);
    balanceText = balance.hasWallet ? balance.balance.toFixed(4) : '0.0000';
  }
  
  const message = `
${getBotTitle()}

⚙️ **Grid Configuration**

💰 **Balance:** ${balanceText} SOL

🔧 **Current Settings:**
💰 **Initial:** ${config.initialAmount} SOL
📉 **Buys:** ${config.numBuys}
📈 **Sells:** ${config.numSells}
📊 **Drop:** ${config.dropPercent}%
🚀 **Leap:** ${config.leapPercent}%

📊 **Grid Coverage:**
📉 Max Drop: **${(config.dropPercent * config.numBuys).toFixed(1)}%**
📈 Max Leap: **${(config.leapPercent * config.numSells).toFixed(1)}%**

💎 **Total Investment:** **${formatSOL(config.initialAmount).replace(' SOL', '')} SOL**

⚠️ Total SOL reserved for grid trading.
  `.trim();
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Initial', 'grid_config_initial'), Markup.button.callback('📉 Buys', 'grid_config_buys')],
    [Markup.button.callback('📈 Sells', 'grid_config_sells'), Markup.button.callback('📊 Drop %', 'grid_config_drop')],
    [Markup.button.callback('🚀 Leap %', 'grid_config_leap'), Markup.button.callback('🔄 Reset', 'grid_config_reset')],
    [Markup.button.callback('🔙 Back', 'grid_menu')]
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (error) {
    if (error.description?.includes('message to edit not found')) {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      throw error;
    }
  }
  
  // Only answer callback if this was triggered by a button click
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
}

/**
 * Handle config parameter change
 */
async function handleConfigChange(ctx, paramType) {
  const userId = ctx.from.id;
  const config = ctx.services.grid.getUserConfig(userId);
  
  const paramInfo = {
    initial: { name: '💰 Initial Amount', unit: ' SOL', min: 0.04, max: 100, key: 'initialAmount', emoji: '💰' },
    buys: { name: '📉 Buy Orders', unit: '', min: 2, max: 50, key: 'numBuys', emoji: '📉' },
    sells: { name: '📈 Sell Orders', unit: '', min: 2, max: 50, key: 'numSells', emoji: '📈' },
    drop: { name: '📊 Drop %', unit: '%', min: 0.2, max: 33, key: 'dropPercent', emoji: '📊' },
    leap: { name: '🚀 Leap %', unit: '%', min: 0.2, max: 100, key: 'leapPercent', emoji: '🚀' }
  };
  
  const info = paramInfo[paramType];
  if (!info) {
    await ctx.answerCbQuery('❌ Invalid parameter type');
    return;
  }
  
  const currentValue = config[info.key];
  
  // Enhanced message with better formatting
  const message = `
${getBotTitle()}

⚙️ **Configure ${info.name}**

📊 **Current Value:** ${currentValue}${info.unit}
📏 **Valid Range:** ${info.min} - ${info.max}${info.unit}

💡 **Examples:**
${paramType === 'initial' ? '• 0.1 SOL (recommended for testing)\n• 0.5 SOL (regular trading)\n• 1.0 SOL (larger positions)' : ''}
${paramType === 'buys' || paramType === 'sells' ? '• 5 orders (less frequent trades)\n• 10 orders (balanced)\n• 20 orders (more granular)' : ''}
${paramType === 'drop' || paramType === 'leap' ? '• 1% (tight range)\n• 2% (recommended)\n• 5% (wider range)' : ''}

📝 **Send the new value:**
  `.trim();
  
  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (error) {
    if (error.description?.includes('message to edit not found')) {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      throw error;
    }
  }
  
  // Only answer callback if this was triggered by a button click
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  
  // Set awaiting state with parameter type for better handling
  ctx.session = ctx.session || {};
  ctx.session.awaitingGridConfig = info.key;
  ctx.session.gridConfigType = paramType;
}

/**
 * Handle config value input
 */
async function handleConfigValueInput(ctx) {
  const userId = ctx.from.id;
  const configKey = ctx.session.awaitingGridConfig;
  const paramType = ctx.session.gridConfigType;
  
  if (!configKey) return;
  
  const inputText = ctx.message.text.trim();
  
  // Input validation
  if (!inputText || inputText.length > 20) {
    try {
      await ctx.deleteMessage();
    } catch (e) {}
    const errorMsg = await ctx.reply('❌ Invalid input. Please enter a valid number.');
    setTimeout(() => {
      try {
        ctx.telegram.deleteMessage(ctx.chat.id, errorMsg.message_id);
      } catch (e) {}
    }, 3000);
    return;
  }
  
  try {
    // Delete user's message for privacy
    try {
      await ctx.deleteMessage();
    } catch (e) {}
    
    // Show processing message
    const processingMsg = await ctx.reply('⚙️ **Updating configuration...**', {
      parse_mode: 'Markdown'
    });
    
    const value = parseFloat(inputText);
    
    if (isNaN(value)) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `${getBotTitle()}\n\n❌ **Invalid Input**\n\n💬 Please enter a valid number`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', `grid_config_${paramType}`)],
            [Markup.button.callback('🔙 Back', 'grid_configure')]
          ])
        }
      );
      return;
    }
    
    // Attempt to update configuration
    const result = ctx.services.grid.updateConfig(userId, configKey, value);
    
    if (result.success) {
      delete ctx.session.awaitingGridConfig;
      delete ctx.session.gridConfigType;
      
      // Show success message
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `${getBotTitle()}\n\n✅ **Configuration Updated!**\n\n🔄 Returning to configuration menu...`,
        { parse_mode: 'Markdown' }
      );
      
      // Wait a moment then return to config menu
      setTimeout(async () => {
        await handleConfigurationMenu(ctx);
      }, 1500);
      
    } else {
      // Show validation error with retry option
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `${getBotTitle()}\n\n❌ **Value Out of Range**\n\n${result.error}\n\n💬 Your input: ${value}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', `grid_config_${paramType}`)],
            [Markup.button.callback('🔙 Back', 'grid_configure')]
          ])
        }
      );
    }
  } catch (error) {
    logger.error('Config value input error:', error);
    await ctx.reply('❌ Error updating configuration. Please try again.');
    delete ctx.session.awaitingGridConfig;
    delete ctx.session.gridConfigType;
  }
}

/**
 * Grid Launch Menu
 */
async function handleLaunchMenu(ctx) {
  const message = `
${getBotTitle()}

🔍 **Token Analysis & Launch**

📝 **Enter token ticker or address:**

**Examples:**
• \`SOL\` - Solana
• \`BONK\` - Bonk token
• \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\` - USDC address

💡 **Tip:** Grid trading works best for:
• Tokens with high volatility
• Range-bound price action
• Adequate liquidity

🚀 **Send the token now or select a quick token:**
  `.trim();

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('$MIRA🦈', 'grid_quick_1'), Markup.button.callback('$ORE⛏️', 'grid_quick_2')],
      [Markup.button.callback('$zKSL💻', 'grid_quick_3'), Markup.button.callback('$NEET👽', 'grid_quick_4')],
      [Markup.button.callback('$TROLL😈', 'grid_quick_5'), Markup.button.callback('$AVICI🔺', 'grid_quick_6')],
      [Markup.button.callback('❌ Cancel', 'grid_menu')]
    ])
  });

  // Set user state for token input
  ctx.session = ctx.session || {};
  ctx.session.awaitingGridToken = true;
}

/**
 * Handle token analysis and display results
 */
async function handleTokenAnalysis(ctx) {
  const tokenInput = ctx.message.text.trim();
  const userId = ctx.from.id;
  const tokenAnalysisService = ctx.services?.tokenAnalysis;
  
  if (!ctx.session?.awaitingGridToken) return;
  
  // Input validation
  if (!tokenInput || tokenInput.length > 50) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid token input. Please enter a valid token symbol or address.');
    return;
  }
  
  // Check for malicious patterns
  const maliciousPatterns = ['<', '>', 'script', 'javascript', 'data:', 'vbscript'];
  if (maliciousPatterns.some(pattern => tokenInput.toLowerCase().includes(pattern))) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid characters detected. Please enter only token symbols or addresses.');
    return;
  }
  
  // Basic format validation for Solana addresses
  if (tokenInput.length > 10 && !/^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(tokenInput)) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid address format. Please enter a valid Solana token address.');
    return;
  }

  try {
    // Delete user message
    await ctx.deleteMessage();

    // Show analysis in progress
    const processingMsg = await ctx.reply(
      `${getBotTitle()}\n\n🔍 **Analyzing token...**\n\n⏳ Fetching market data, please wait...`,
      { parse_mode: 'Markdown' }
    );

    // Perform token analysis
    const analysis = await tokenAnalysisService.analyzeToken(tokenInput);
    const formatted = tokenAnalysisService.formatAnalysisForDisplay(analysis);

    // Get user configuration
    const config = ctx.services.grid.getUserConfig(userId);

    const analysisMessage = `
${getBotTitle()}

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
    ctx.session.gridTokenAnalysis = analysis;
    ctx.session.awaitingGridToken = false;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Launch Grid', 'grid_confirm_launch')],
      [Markup.button.callback('⚙️ Adjust Config', 'grid_configure')],
      [Markup.button.callback('🔍 Analyze Another', 'grid_launch')],
      [Markup.button.callback('🔙 Back', 'grid_menu')]
    ]);

    // Update the processing message
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      analysisMessage,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );

  } catch (error) {
    logger.error(`Grid token analysis error for ${tokenInput}:`, error);
    
    let errorMessage = `${getBotTitle()}\n\n❌ **Token Analysis Failed**\n\n`;
    let suggestions = [];
    
    if (error.message.includes('not found')) {
      errorMessage += `🔍 **Token not found:** \`${tokenInput}\`\n\n`;
      suggestions = [
        '✅ Use the full contract address (43-44 characters)',
        '🔄 Double-check the token ticker spelling',
        '🌐 Try popular tokens like SOL, BONK, USDC'
      ];
    } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      errorMessage += `🌐 **Network Connection Issues**\n\n`;
      suggestions = [
        '🔄 Network is slow - please try again in a moment',
        '📊 APIs may be temporarily unavailable',
        '⚡ Use a contract address for faster results'
      ];
    } else {
      errorMessage += `⚠️ **Technical Error**\n\n${error.message}\n\n`;
      suggestions = [
        '🔄 Try again with a different token',
        '📜 Use the token\'s contract address instead',
        '📧 Contact support if this persists'
      ];
    }
    
    errorMessage += `💡 **Try these:**\n${suggestions.join('\n')}`;
    
    await ctx.reply(errorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Try Again', 'grid_launch')],
        [Markup.button.callback('🔙 Back', 'grid_menu')]
      ])
    });
  }
}

/**
 * Confirm and launch grid
 */
async function handleConfirmLaunch(ctx) {
  const userId = ctx.from.id;
  const gridService = ctx.services?.grid;
  const analysis = ctx.session?.gridTokenAnalysis;

  if (!analysis) {
    await ctx.answerCbQuery('❌ No token analysis found. Please analyze a token first.');
    return;
  }

  try {
    const config = gridService.getUserConfig(userId);
    
    // Show launch confirmation
    const confirmMessage = `
${getBotTitle()}

🚀 **Launch Confirmation**

🎯 **Token:** ${analysis.symbol} (${analysis.name})
💰 **Initial Amount:** ${config.initialAmount.toFixed(4)} SOL
📊 **Strategy Score:** ${analysis.suitabilityScore}/100

⚠️ **Grid Setup:**
• Initial Buy: **${(config.initialAmount / 2).toFixed(4)} SOL**
• Buy Orders: **${config.numBuys}** (↓${(config.dropPercent * config.numBuys).toFixed(1)}%)
• Sell Orders: **${config.numSells}** (↑${(config.leapPercent * config.numSells).toFixed(1)}%)
• Risk Level: **${analysis.riskLevel}**

🔥 **This will execute the first buy immediately!**

Are you ready to launch?
    `.trim();

    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Launch Now!', 'grid_execute_launch')],
        [Markup.button.url('📊 View on DEXScreener', `https://dexscreener.com/solana/${analysis.tokenAddress}`)],
        [Markup.button.callback('❌ Cancel', 'grid_menu')]
      ])
    });

  } catch (error) {
    await ctx.answerCbQuery('❌ Error preparing launch. Please try again.');
    logger.error('Grid launch preparation error:', error);
  }
}

/**
 * Execute grid launch
 */
async function handleExecuteLaunch(ctx) {
  const userId = ctx.from.id;
  const analysis = ctx.session?.gridTokenAnalysis;
  
  if (!analysis) {
    await ctx.answerCbQuery('❌ No token found. Please start over.');
    return;
  }
  
  await ctx.answerCbQuery('🚀 Launching grid...');
  
  try {
    const loadingMsg = await ctx.editMessageText(
      `${getBotTitle()}\n\n🚀 **Launching Grid Trading...**\n\n⏳ Executing initial buy and setting up grid levels...`,
      { parse_mode: 'Markdown' }
    );
    
    const result = await ctx.services.grid.launchGrid(userId, analysis.tokenAddress);
    
    if (result.success) {
      const tokenSymbol = result.tokenMetadata?.symbol || analysis.symbol;
      
      const message = `
${getBotTitle()}

✅ **GRID LAUNCHED SUCCESSFULLY!**

**Token:** ${tokenSymbol} (${analysis.name || result.tokenMetadata?.name || 'Unknown'})
**Grid ID:** \`${result.gridId.slice(5, 18)}\`
**Entry Price:** $${result.entryPrice.toFixed(2)}
**Initial Tokens:** ${result.tokensReceived.toFixed(6)} ${tokenSymbol}

**Grid Setup:**
📉 ${result.buyGrids} buy orders below entry
📈 ${result.sellGrids} sell orders above entry

🤖 Bot monitoring every 30s and executing trades automatically.

View **📊 Active Grids** to track performance!
      `.trim();
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📊 View Grid', `grid_view_${result.gridId}`)],
          [Markup.button.callback('🕸️ Launch Another', 'grid_launch')],
          [Markup.button.callback('🏠 Main Menu', 'back_to_main')]
        ])
      });
      
      // Clear session
      delete ctx.session.gridTokenAnalysis;
    } else {
      await ctx.editMessageText(
        `${getBotTitle()}\n\n❌ **Grid Launch Failed**\n\n${result.error}\n\nPlease check your balance and try again.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', 'grid_launch')],
            [Markup.button.callback('🔙 Back', 'grid_menu')]
          ])
        }
      );
    }
  } catch (error) {
    logger.error('Grid execute launch error:', error);
    await ctx.editMessageText(
      `${getBotTitle()}\n\n❌ **Error:**\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'grid_menu')]
        ])
      }
    );
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
    const tokenDisplay = grid.tokenSymbol || `${grid.tokenAddress.slice(0, 4)}...${grid.tokenAddress.slice(-4)}`;
    return [Markup.button.callback(`📊 ${tokenDisplay} (${shortId})`, `grid_view_${grid.gridId}`)];
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
  
  const tokenName = gridState.tokenName || 'Unknown Token';
  const tokenSymbol = gridState.tokenSymbol || 'UNKNOWN';
  
  const message = `
${getBotTitle()}

**GRID DETAILS**

**Status:** ${gridState.status === 'active' ? '🟢 Active' : '🔴 Stopped'}
**Token:** ${tokenSymbol} (${tokenName})
**Contract:** \`${gridState.tokenAddress.slice(0, 8)}...${gridState.tokenAddress.slice(-8)}\`
**Runtime:** ${runtime} minutes

**Performance:**
${pnlColor} **P&L:** ${pnl.totalPnL >= 0 ? '+' : ''}${pnl.totalPnL.toFixed(4)} SOL (${pnl.pnlPercent >= 0 ? '+' : ''}${pnl.pnlPercent.toFixed(2)}%)

**Position:**
💰 Invested: ${pnl.totalInvested.toFixed(4)} SOL
💵 Realized: ${pnl.totalRealized.toFixed(4)} SOL
🪙 Tokens Held: ${pnl.tokensHeld.toFixed(6)} ${tokenSymbol}
💲 Value: ${pnl.currentTotalValueSOL.toFixed(4)} SOL ($${pnl.currentTotalValueUSD.toFixed(2)})

**Trading:**
📉 Filled Buys: ${pnl.filledBuys}/${gridState.buyGrids.length}
📈 Filled Sells: ${pnl.filledSells}/${gridState.sellGrids.length}
📊 Total Orders: ${pnl.totalOrders}

**Price:**
Entry: $${gridState.entryPrice.toFixed(2)}
Current: $${pnl.currentPriceUSD.toFixed(2)}
Change: ${((pnl.currentPriceUSD - gridState.entryPrice) / gridState.entryPrice * 100).toFixed(2)}%

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
🪙 Tokens Held: ${result.tokensHeld.toFixed(6)}
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

/**
 * Reset configuration to defaults
 */
async function handleResetConfig(ctx) {
  const userId = ctx.from.id;
  const gridService = ctx.services?.grid;
  
  if (!gridService) {
    await ctx.answerCbQuery('❌ Grid service not available');
    return;
  }
  
  try {
    // Reset to defaults
    const config = gridService.getUserConfig(userId);
    config.initialAmount = 0.10;
    config.numBuys = 10;
    config.numSells = 10;
    config.dropPercent = 2;
    config.leapPercent = 4;
    
    // Save to file
    gridService.saveGridsToFile();
    
    await ctx.answerCbQuery('✅ Configuration reset to defaults!');
    await handleConfigurationMenu(ctx);
  } catch (error) {
    logger.error('Error resetting grid config:', error);
    await ctx.answerCbQuery('❌ Error resetting configuration');
  }
}

module.exports = {
  handleGridMenu,
  handleConfigurationMenu,
  handleConfigChange,
  handleConfigValueInput,
  handleResetConfig,
  handleLaunchMenu,
  handleTokenAnalysis,
  handleConfirmLaunch,
  handleExecuteLaunch,
  handleActiveGrids,
  handleViewGrid,
  handleStopGrid
};
