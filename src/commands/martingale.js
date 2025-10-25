const { Markup } = require('telegraf');
const logger = require('../utils/logger');

// Default configuration
const CONFIG_LIMITS = {
  initialBuyAmount: { min: 0.01, max: 100 },
  dropPercentage: { min: 0.2, max: 33 },
  multiplier: { min: 1.0, max: 5.0 },
  maxLevels: { min: 1, max: 20 },
  profitTarget: { min: 1, max: 1000 },
  slippage: { min: 0.1, max: 10.0 }
};

const STRATEGY_PRESETS = {
  Degen: {
    initialBuyAmount: 0.01,
    dropPercentage: 8,
    multiplier: 2.0,
    maxLevels: 5,
    profitTarget: 15,
    slippage: 2.0
  },
  Regular: {
    initialBuyAmount: 0.01,
    dropPercentage: 4,
    multiplier: 1.2,
    maxLevels: 6,
    profitTarget: 5,
    slippage: 1.0
  },
  Stable: {
    initialBuyAmount: 0.01,
    dropPercentage: 2,
    multiplier: 1.1,
    maxLevels: 8,
    profitTarget: 3,
    slippage: 0.5
  }
};

// Default to Regular
const DEFAULT_CONFIG = { ...STRATEGY_PRESETS.Regular, maxTotalInvestment: 1.0 };

/**
 * Main Martingale strategy menu
 */
const handleMartingaleMenu = async (ctx) => {
  const userId = ctx.from.id;
  const martingaleService = ctx.services?.martingale;
  const walletService = ctx.services?.wallet;
  
  if (!martingaleService) {
    await ctx.reply('❌ Martingale service not available');
    return;
  }

  // Get SOL balance
  let balanceText = '';
  if (walletService) {
    const balance = await walletService.getWalletBalance(userId);
    balanceText = balance.hasWallet ? `💰 **Balance:** ${balance.balance.toFixed(4)} SOL` : '💰 **No Wallet Connected**';
  }

  // Get user's active strategies
  const activeStrategies = martingaleService.getUserStrategies(userId);
  const activeCount = activeStrategies.filter(s => s.status === 'active').length;
  
  // Get user's current configuration
  const userConfig = getUserConfig(ctx, userId);
  
  const message = `
🦈 **TerminalOne🦈**

🤖 **Martingale Bot**

${balanceText}

📊 **Current Configuration:**
💰 Initial Buy: **${userConfig.initialBuyAmount} SOL**
📉 Drop Trigger: **${userConfig.dropPercentage}%**
⚡ Multiplier: **${userConfig.multiplier}x**
🔢 Max Levels: **${userConfig.maxLevels}**
🎯 Profit Target: **${userConfig.profitTarget}%**

📎 Max Investment: **${calculateMaxInvestment(userConfig).toFixed(4)} SOL**
📈 **Active Strategies:** ${activeCount}

🚀 Ready to dominate the markets?
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚙️ Configure Strategy', 'martingale_configure')],
    [Markup.button.callback('🔍 Search Token & Launch', 'martingale_launch')],
    [Markup.button.callback('📊 Active Strategies', 'martingale_active'), Markup.button.callback('📈 History', 'martingale_history')],
    [Markup.button.callback('🤖 Back to Strategies', 'strategies_menu'), Markup.button.callback('🔙 Main Menu', 'back_to_main')]
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
};

/**
 * Configuration menu
 */
const handleConfigurationMenu = async (ctx) => {
  const userId = ctx.from.id;
  const userConfig = getUserConfig(ctx, userId);
  const maxInvestment = calculateMaxInvestment(userConfig);

  const maxDrop = (userConfig.dropPercentage * userConfig.maxLevels).toFixed(1);
  
  const message = `
🦈 **TerminalOne🦈**

⚙️ **Martingale Bot Configuration**

🔧 **Current Settings:**
💰 **Initial Buy Amount:** ${userConfig.initialBuyAmount} SOL
📉 **Drop Percentage:** ${userConfig.dropPercentage}%
⚡ **Multiplier:** ${userConfig.multiplier}x
🔢 **Max Levels:** ${userConfig.maxLevels}
🎯 **Profit Target:** ${userConfig.profitTarget}%
🌊 **Slippage:** ${userConfig.slippage}%
📉 **Max Drop:** ${maxDrop}%

📊 **Investment Breakdown:**
${generateInvestmentBreakdown(userConfig)}

💎 **Total Max Investment:** **${maxInvestment.toFixed(4)} SOL**

⚠️ This is the maximum SOL you could lose if strategy reaches all levels.
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎯 Degen', 'preset_degen'), Markup.button.callback('⚡ Regular', 'preset_regular'), Markup.button.callback('🛡️ Stable', 'preset_stable')],
    [Markup.button.callback('💰 Initial Amount', 'config_initial'), Markup.button.callback('📉 Drop %', 'config_drop')],
    [Markup.button.callback('⚡ Multiplier', 'config_multiplier'), Markup.button.callback('🔢 Max Levels', 'config_levels')],
    [Markup.button.callback('🎯 Profit Target', 'config_profit'), Markup.button.callback('🌊 Slippage', 'config_slippage')],
    [Markup.button.callback('🔄 Reset to Defaults', 'config_reset')],
    [Markup.button.callback('🔙 Back', 'martingale_menu')]
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (error) {
    if (error.description?.includes('message to edit not found')) {
      // Message was deleted, send new one
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      throw error;
    }
  }
};

/**
 * Launch token analysis menu
 */
const handleLaunchMenu = async (ctx) => {
  const message = `
🦈 **TerminalOne🦈**

🔍 **Token Analysis & Launch**

📝 **Enter token ticker or address:**

**Examples:**
• \`SOL\` - Solana
• \`BONK\` - Bonk token
• \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\` - USDC address

💡 **Tip:** The bot will analyze the token's:
• Recent price volatility
• Trading volume & liquidity
• Martingale strategy suitability
• Risk assessment

🚀 **Send the token now!**
  `;

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', 'martingale_menu')]
    ])
  });

  // Set user state for token input
  ctx.session = ctx.session || {};
  ctx.session.awaitingToken = true;
};

/**
 * Handle token analysis and display results
 */
const handleTokenAnalysis = async (ctx) => {
  const tokenInput = ctx.message.text.trim();
  const userId = ctx.from.id;
  const tokenAnalysisService = ctx.services?.tokenAnalysis;
  
  // Input validation
  if (!tokenInput || tokenInput.length > 50) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid token input. Please enter a valid token symbol or address.');
    return;
  }
  
  // Check for malicious patterns and validate format
  const maliciousPatterns = ['<', '>', 'script', 'javascript', 'data:', 'vbscript'];
  if (maliciousPatterns.some(pattern => tokenInput.toLowerCase().includes(pattern))) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid characters detected. Please enter only token symbols or addresses.');
    return;
  }
  
  // Basic format validation for Solana addresses (should be base58, ~44 characters)
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
      '🦈 **TerminalOne🦈**\n\n🔍 **Analyzing token...**\n\n⏳ Fetching market data, please wait...',
      { parse_mode: 'Markdown' }
    );

    // Perform token analysis
    const analysis = await tokenAnalysisService.analyzeToken(tokenInput);
    const formatted = tokenAnalysisService.formatAnalysisForDisplay(analysis);

    // Get user configuration for strategy preview
    const userConfig = getUserConfig(ctx, userId);
    const maxInvestment = calculateMaxInvestment(userConfig);

    const analysisMessage = `
🦈 **TerminalOne🦈**

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
    ctx.session.tokenAnalysis = analysis;
    ctx.session.awaitingToken = false;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Launch Strategy', 'martingale_confirm_launch')],
      [Markup.button.callback('⚙️ Adjust Config', 'martingale_configure')],
      [Markup.button.callback('🔍 Analyze Another', 'martingale_launch')],
      [Markup.button.callback('🔙 Back', 'martingale_menu')]
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
    logger.error(`Token analysis error for ${tokenInput}:`, error);
    
    let errorMessage = `🦈 **TerminalOne🦈**\n\n❌ **Token Analysis Failed**\n\n`;
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
        '📞 Contact support if this persists'
      ];
    }
    
    errorMessage += `💡 **Try these:**\n${suggestions.join('\n')}`;
    
    await ctx.reply(errorMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Try Again', 'martingale_launch')],
        [Markup.button.callback('🔙 Back', 'martingale_menu')]
      ])
    });
  }
};

/**
 * Confirm and launch strategy
 */
const handleConfirmLaunch = async (ctx) => {
  const userId = ctx.from.id;
  const martingaleService = ctx.services?.martingale;
  const analysis = ctx.session?.tokenAnalysis;

  if (!analysis) {
    await ctx.answerCbQuery('❌ No token analysis found. Please analyze a token first.');
    return;
  }

  try {
    const userConfig = getUserConfig(ctx, userId);
    
    // Prepare strategy configuration
    const strategyConfig = {
      tokenAddress: analysis.tokenAddress,
      symbol: analysis.symbol,
      initialBuyAmount: userConfig.initialBuyAmount,
      dropPercentage: userConfig.dropPercentage,
      multiplier: userConfig.multiplier,
      maxLevels: userConfig.maxLevels,
      profitTarget: userConfig.profitTarget,
      maxTotalInvestment: calculateMaxInvestment(userConfig),
      stopLossEnabled: true,
      maxLossPercentage: 80
    };

    // Show launch confirmation
    const confirmMessage = `
🦈 **TerminalOne🦈**

🚀 **Launch Confirmation**

🎯 **Token:** ${analysis.symbol} (${analysis.name})
💰 **Initial Buy:** ${strategyConfig.initialBuyAmount} SOL
📊 **Strategy Score:** ${analysis.suitabilityScore}/100

⚠️ **Risk Summary:**
• Max Investment: **${strategyConfig.maxTotalInvestment.toFixed(4)} SOL**
• Risk Level: **${analysis.riskLevel}**
• Stop Loss: **80%**

🔥 **This will execute the first buy immediately!**

Are you ready to launch?
    `;

    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Launch Now!', 'martingale_execute_launch')],
        [Markup.button.url('📊 View on DEXScreener', `https://dexscreener.com/solana/${analysis.tokenAddress}`)],
        [Markup.button.callback('❌ Cancel', 'martingale_menu')]
      ])
    });

  } catch (error) {
    await ctx.answerCbQuery('❌ Error preparing launch. Please try again.');
    logger.error('Launch preparation error:', error);
  }
};

/**
 * Execute strategy launch
 */
const handleExecuteLaunch = async (ctx) => {
  const userId = ctx.from.id;
  const martingaleService = ctx.services?.martingale;
  const analysis = ctx.session?.tokenAnalysis;

  try {
    const userConfig = getUserConfig(ctx, userId);
    
    const strategyConfig = {
      tokenAddress: analysis.tokenAddress,
      symbol: analysis.symbol,
      initialBuyAmount: userConfig.initialBuyAmount,
      dropPercentage: userConfig.dropPercentage,
      multiplier: userConfig.multiplier,
      maxLevels: userConfig.maxLevels,
      profitTarget: userConfig.profitTarget,
      maxTotalInvestment: calculateMaxInvestment(userConfig),
      stopLossEnabled: true,
      maxLossPercentage: 80
    };

    // Show launching message
    await ctx.editMessageText(
      '🦈 **TerminalOne🦈**\n\n🚀 **Launching Strategy...**\n\n⏳ Executing initial buy...',
      { parse_mode: 'Markdown' }
    );

    // Create and launch the strategy
    const strategy = await martingaleService.createMartingaleStrategy(userId, strategyConfig);

    const successMessage = `
🦈 **TerminalOne🦈**

✅ **Strategy Launched Successfully!**

🎯 **${strategy.symbol}** Martingale Strategy
🆔 **ID:** \`${strategy.id.slice(-8)}\`

💰 **Initial Buy Executed:**
• Amount: ${strategy.initialBuyAmount} SOL
• Tokens: ${strategy.totalTokens.toFixed(4)} ${strategy.symbol}
• Price: $${strategy.averageBuyPrice.toFixed(6)}

🤖 **Strategy is now active and monitoring!**
📊 View progress in Active Strategies menu.
    `;

    await ctx.editMessageText(successMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 View Strategy', `view_strategy_${strategy.id}`)],
        [Markup.button.callback('📈 Active Strategies', 'martingale_active')],
        [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
      ])
    });

    // Clean up session
    delete ctx.session.tokenAnalysis;

  } catch (error) {
    await ctx.editMessageText(
      `🦈 **TerminalOne🦈**\n\n❌ **Launch Failed**\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', 'martingale_confirm_launch')],
          [Markup.button.callback('🔙 Back', 'martingale_menu')]
        ])
      }
    );
  }
};

/**
 * Show active strategies
 */
const handleActiveStrategies = async (ctx) => {
  const userId = ctx.from.id;
  const martingaleService = ctx.services?.martingale;
  
  const strategies = martingaleService.getUserStrategies(userId);
  const active = strategies.filter(s => s.status === 'active');
  
  // Check for recent failures or stops that need attention
  const recentFailed = strategies.filter(s => 
    s.status === 'failed' && 
    (Date.now() - new Date(s.createdAt).getTime()) < 24 * 60 * 60 * 1000 // Last 24 hours
  );
  const recentStopped = strategies.filter(s => 
    s.status === 'stopped' && s.stopReason === 'stop_loss' &&
    (Date.now() - new Date(s.stoppedAt || s.createdAt).getTime()) < 24 * 60 * 60 * 1000
  );

  if (active.length === 0) {
    const message = `
🦈 **TerminalOne🦈**

📊 **Active Strategies**

📭 **No active strategies found.**

🚀 Launch your first Martingale strategy to start automated trading!
    `;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Analyze & Launch', 'martingale_launch')],
        [Markup.button.callback('🔙 Back', 'martingale_menu')]
      ])
    });
    return;
  }

  let alertsSection = '';
  
  // Add failure alerts at the top if there are any
  if (recentFailed.length > 0 || recentStopped.length > 0) {
    alertsSection += `🚨 **Recent Alerts:**\n`;
    
    recentFailed.slice(0, 2).forEach(strategy => {
      const timeAgo = getTimeAgo(strategy.createdAt);
      alertsSection += `❌ **${strategy.symbol}** - Failed (${timeAgo})\n`;
    });
    
    recentStopped.slice(0, 2).forEach(strategy => {
      const timeAgo = getTimeAgo(strategy.stoppedAt || strategy.createdAt);
      alertsSection += `🛑 **${strategy.symbol}** - Stop loss hit (${timeAgo})\n`;
    });
    
    alertsSection += `\n`;
  }
  
  const message = `
🦈 **TerminalOne🦈**

📈 **Active Strategies** (${active.length})

${alertsSection}${active.map((strategy, index) => {
  const roi = strategy.totalInvested > 0 ? 
    (((strategy.totalTokens * strategy.highestPrice || 0) - strategy.totalInvested) / strategy.totalInvested * 100) : 0;
  
  // Add warning indicator for strategies at risk
  let warningIndicator = '';
  if (strategy.currentLevel >= strategy.maxLevels * 0.8) {
    warningIndicator = '⚠️ '; // High level warning
  } else if (strategy.currentLevel >= strategy.maxLevels * 0.6) {
    warningIndicator = '🟡 '; // Medium level warning
  }
  
  return `${warningIndicator}**${index + 1}. ${strategy.symbol}**
🆔 \`${strategy.id.slice(-8)}\`
💰 Invested: ${strategy.totalInvested.toFixed(4)} SOL
📈 Level: ${strategy.currentLevel}/${strategy.maxLevels}
📈 ROI: ${roi.toFixed(2)}%
⏰ ${getTimeAgo(strategy.createdAt)}`;
}).join('\n\n')}

💡 **Tap a strategy to view details**
  `;

  const keyboard = active.map((strategy, index) => [
    Markup.button.callback(`📊 ${strategy.symbol} (${strategy.currentLevel}/${strategy.maxLevels})`, `view_strategy_${strategy.id}`)
  ]);
  keyboard.push([Markup.button.callback('🔙 Back', 'martingale_menu')]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(keyboard)
  });
};

/**
 * View individual strategy details
 */
const handleViewStrategy = async (ctx) => {
  const strategyId = ctx.match[1]; // Extract strategy ID from callback data
  const martingaleService = ctx.services?.martingale;
  
  const strategy = martingaleService.getStrategy(strategyId);
  if (!strategy) {
    await ctx.answerCbQuery('❌ Strategy not found');
    return;
  }

  // Get current token price and SOL price for proper conversion
  const currentTokenPrice = strategy.highestPrice || strategy.averageBuyPrice || 0;
  const solPrice = await ctx.services?.price?.getSolanaPrice() || { price: 200 }; // Fallback SOL price
  
  // Calculate current value in SOL (tokens * token_price_USD / SOL_price_USD)
  const currentValueUSD = strategy.totalTokens * currentTokenPrice;
  const currentValueSOL = currentValueUSD / solPrice.price;
  
  // Use net invested amount for accurate P&L calculation
  const netInvested = strategy.netInvested || (strategy.totalInvested * 0.99);
  const roi = netInvested > 0 ? 
    ((currentValueSOL - netInvested) / netInvested * 100) : 0;
  const profitLoss = currentValueSOL - netInvested;

  const message = `
🦈 **TerminalOne🦈**

📊 **${strategy.symbol || 'Token'}** Strategy Details

🆔 **ID:** \`${strategy.id.slice(-8)}\`
📈 **Status:** ${getStatusEmoji(strategy.status)} ${strategy.status.toUpperCase()}

💰 **Financial Summary:**
• Total Invested: **${strategy.totalInvested.toFixed(4)} SOL**
• Current Value: **${currentValueSOL.toFixed(4)} SOL**
• P&L: ${profitLoss >= 0 ? '🟢' : '🔴'} **${profitLoss.toFixed(4)} SOL**
• ROI: ${roi >= 0 ? '🟢' : '🔴'} **${roi.toFixed(2)}%**

🤖 **Strategy Info:**
• Level: **${strategy.currentLevel}/${strategy.maxLevels}**
• Avg Buy Price: **$${strategy.averageBuyPrice.toFixed(8)}**
• Profit Target: **${strategy.profitTarget}%**
• Total Tokens: **${strategy.totalTokens.toFixed(4)} ${strategy.symbol}**
• Next Buy Trigger: **$${strategy.lastBuyPrice ? (strategy.lastBuyPrice * (1 - strategy.dropPercentage / 100)).toFixed(8) : 'N/A'}**
• Sell Trigger: **$${(currentTokenPrice * (1 + strategy.profitTarget / 100)).toFixed(8)}**

📊 **Price Tracking:**
• Current: **$${currentTokenPrice.toFixed(8)}**

⏰ **Created:** ${formatDate(strategy.createdAt)}
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⏸️ Pause', `pause_strategy_${strategy.id}`), Markup.button.callback('🛑 Stop', `stop_strategy_${strategy.id}`)],
    [Markup.button.callback('🔄 Refresh', `view_strategy_${strategy.id}`), Markup.button.url('📊 DEXScreener', `https://dexscreener.com/solana/${strategy.tokenAddress}`)],
    [Markup.button.callback('🔙 Active Strategies', 'martingale_active')]
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  } catch (error) {
    // If edit fails (likely due to identical content), show popup instead
    await ctx.answerCbQuery('🔄 Strategy refreshed');
  }
};

/**
 * Utility Functions
 */

function getUserConfig(ctx, userId) {
  // In production, store this in database
  ctx.session = ctx.session || {};
  ctx.session.martingaleConfig = ctx.session.martingaleConfig || { ...DEFAULT_CONFIG };
  return ctx.session.martingaleConfig;
}

function saveUserConfig(ctx, userId, config) {
  ctx.session = ctx.session || {};
  ctx.session.martingaleConfig = config;
}

function calculateMaxInvestment(config) {
  let total = config.initialBuyAmount;
  for (let i = 1; i <= config.maxLevels; i++) {
    total += config.initialBuyAmount * Math.pow(config.multiplier, i);
  }
  return total;
}

function generateInvestmentBreakdown(config) {
  let breakdown = [];
  let cumulative = 0;
  
  breakdown.push(`Level 0: ${config.initialBuyAmount} SOL (Initial)`);
  cumulative += config.initialBuyAmount;
  
  for (let i = 1; i <= config.maxLevels; i++) {
    const amount = config.initialBuyAmount * Math.pow(config.multiplier, i);
    cumulative += amount;
    breakdown.push(`Level ${i}: ${amount.toFixed(4)} SOL (${cumulative.toFixed(4)} total)`);
  }
  
  return breakdown.join('\n');
}

/**
 * Send new configuration menu (helper function)
 */
async function sendNewConfigurationMenu(ctx, userId) {
  const userConfig = getUserConfig(ctx, userId);
  const maxInvestment = calculateMaxInvestment(userConfig);
  const maxDrop = (userConfig.dropPercentage * userConfig.maxLevels).toFixed(1);
  
  const message = `
🦈 **TerminalOne🦈**

⚙️ **Martingale Bot Configuration**

🔧 **Current Settings:**
💰 **Initial Buy Amount:** ${userConfig.initialBuyAmount} SOL
📉 **Drop Percentage:** ${userConfig.dropPercentage}%
⚡ **Multiplier:** ${userConfig.multiplier}x
🔢 **Max Levels:** ${userConfig.maxLevels}
🎯 **Profit Target:** ${userConfig.profitTarget}%
📉 **Max Drop:** ${maxDrop}%

📊 **Investment Breakdown:**
${generateInvestmentBreakdown(userConfig)}

📎 **Total Max Investment:** **${maxInvestment.toFixed(4)} SOL**

📈 This is the maximum SOL you would use if strategy reaches all levels.
  `;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎯 Degen', 'preset_degen'), Markup.button.callback('⚡ Regular', 'preset_regular'), Markup.button.callback('🛡️ Stable', 'preset_stable')],
    [Markup.button.callback('💰 Initial Amount', 'config_initial'), Markup.button.callback('📉 Drop %', 'config_drop')],
    [Markup.button.callback('⚡ Multiplier', 'config_multiplier'), Markup.button.callback('🔢 Max Levels', 'config_levels')],
    [Markup.button.callback('🎯 Profit Target', 'config_profit')],
    [Markup.button.callback('🔄 Reset to Defaults', 'config_reset')],
    [Markup.button.callback('🔙 Back', 'martingale_menu')]
  ]);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

function getStatusEmoji(status) {
  const emojis = {
    active: '🟢',
    paused: '🟡',
    completed: '✅',
    stopped: '🔴',
    failed: '❌'
  };
  return emojis[status] || '⚪';
}

function getTimeAgo(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${minutes}m ago`;
}

function formatDate(date) {
  return new Date(date).toLocaleString();
}

/**
 * Handle pause strategy
 */
const handlePauseStrategy = async (ctx) => {
  const strategyId = ctx.match[1];
  const martingaleService = ctx.services?.martingale;
  
  const strategy = martingaleService.getStrategy(strategyId);
  if (!strategy) {
    await ctx.answerCbQuery('❌ Strategy not found');
    return;
  }

  if (martingaleService.pauseStrategy(strategyId)) {
    await ctx.answerCbQuery('⏸️ Strategy paused successfully');
    // Refresh the strategy view
    await handleViewStrategy(ctx);
  } else {
    await ctx.answerCbQuery('❌ Could not pause strategy');
  }
};

/**
 * Handle stop strategy (show confirmation)
 */
const handleStopStrategy = async (ctx) => {
  const strategyId = ctx.match[1];
  const martingaleService = ctx.services?.martingale;
  
  const strategy = martingaleService.getStrategy(strategyId);
  if (!strategy) {
    await ctx.answerCbQuery('❌ Strategy not found');
    return;
  }

  // Get proper SOL price for accurate conversion
  const currentTokenPrice = strategy.highestPrice || strategy.averageBuyPrice || 0;
  const solPrice = await ctx.services?.price?.getSolanaPrice() || { price: 200 };
  const currentValueUSD = strategy.totalTokens * currentTokenPrice;
  const currentValueSOL = currentValueUSD / solPrice.price;
  const netInvested = strategy.netInvested || (strategy.totalInvested * 0.99);
  const profitLoss = currentValueSOL - netInvested;
  
  const confirmMessage = `
🦈 **TerminalOne🦈**

⚠️ **Stop Strategy Confirmation**

🎯 **Strategy:** ${strategy.symbol}
🆔 **ID:** \`${strategy.id.slice(-8)}\`

💰 **Current Status:**
• Invested: **${strategy.totalInvested.toFixed(4)} SOL**
• Current Value: **${currentValueSOL.toFixed(4)} SOL**
• P&L: ${profitLoss >= 0 ? '🟢' : '🔴'} **${profitLoss.toFixed(4)} SOL**

🛑 **Warning:** This will:
• Stop monitoring price movements
• End the strategy permanently
• Keep your ${strategy.totalTokens.toFixed(4)} ${strategy.symbol} tokens (no automatic sell)

❓ **Are you sure you want to stop this strategy?**
  `;

  try {
    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, Stop Strategy', `confirm_stop_strategy_${strategyId}`)],
        [Markup.button.callback('❌ Cancel', `view_strategy_${strategyId}`)]
      ])
    });
  } catch (error) {
    if (error.description?.includes('message is not modified')) {
      // Message content is the same, just answer the callback
      await ctx.answerCbQuery('⚠️ Confirm to stop this strategy');
    } else {
      throw error;
    }
  }
};

/**
 * Handle confirmed stop strategy
 */
const handleConfirmStopStrategy = async (ctx) => {
  const strategyId = ctx.match[1];
  const martingaleService = ctx.services?.martingale;
  
  const strategy = martingaleService.getStrategy(strategyId);
  if (!strategy) {
    await ctx.answerCbQuery('❌ Strategy not found');
    return;
  }

  try {
    // Show stopping message
    await ctx.editMessageText(
      '🦈 **TerminalOne🦈**\n\n🛑 **Stopping Strategy...**\n\n⏳ Ending monitoring and updating status...',
      { parse_mode: 'Markdown' }
    );

    // Get current price for final value calculation (without selling)
    const currentPrice = await ctx.services.price.getTokenPrice(strategy.tokenAddress);
    const solPrice = await ctx.services.price.getSolanaPrice();
    
    // Calculate current value in SOL
    const currentValueUSD = strategy.totalTokens * currentPrice.price;
    const currentValueSOL = currentValueUSD / solPrice.price;
    const netInvested = strategy.netInvested || (strategy.totalInvested * 0.99);
    
    // Update strategy status (without selling tokens)
    strategy.status = 'stopped';
    strategy.finalValue = currentValueSOL;
    strategy.finalProfit = currentValueSOL - netInvested;
    strategy.finalProfitPercentage = (strategy.finalProfit / netInvested) * 100;
    strategy.stoppedAt = new Date();
    strategy.stopReason = 'manual_stop';
    
    // Stop monitoring
    await martingaleService.stopStrategyMonitoring(strategyId);
    
    const finalMessage = `
🦈 **TerminalOne🦈**

✅ **Strategy Stopped Successfully**

🎯 **${strategy.symbol}** Strategy
🆔 **ID:** \`${strategy.id.slice(-8)}\`

📊 **Final Status:**
• Total Invested: **${strategy.totalInvested.toFixed(4)} SOL**
• Current Value: **${currentValueSOL.toFixed(4)} SOL**
• Unrealized P&L: ${strategy.finalProfit >= 0 ? '🟢' : '🔴'} **${strategy.finalProfit.toFixed(4)} SOL**
• ROI: ${strategy.finalProfitPercentage >= 0 ? '🟢' : '🔴'} **${strategy.finalProfitPercentage.toFixed(2)}%**
• Tokens Held: **${strategy.totalTokens.toFixed(4)} ${strategy.symbol}**

🛑 **Strategy monitoring stopped. Your tokens remain in your wallet.**
    `;
    
    await ctx.editMessageText(finalMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 View History', 'martingale_history')],
        [Markup.button.callback('🔍 Launch New Strategy', 'martingale_launch')],
        [Markup.button.callback('🔙 Main Menu', 'back_to_main')]
      ])
    });

  } catch (error) {
    logger.error(`Error stopping strategy ${strategyId}:`, error);
    
    await ctx.editMessageText(
      `🦈 **TerminalOne🦈**\n\n❌ **Error Stopping Strategy**\n\n${error.message}\n\n🔄 **You can try again or contact support.**`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', `stop_strategy_${strategyId}`)],
          [Markup.button.callback('🔙 View Strategy', `view_strategy_${strategyId}`)]
        ])
      }
    );
  }
};

/**
 * Handle configuration value changes
 */
const handleConfigChange = async (ctx, configType) => {
  const configLabels = {
    'initial': '💰 Initial Buy Amount (SOL)',
    'drop': '📉 Drop Percentage (%)',
    'multiplier': '⚡ Multiplier (x)',
    'levels': '🔢 Max Levels',
    'profit': '🎯 Profit Target (%)',
    'slippage': '🌊 Slippage (%)'
  };
  
  const configLimits = {
    'initial': { min: 0.01, max: 100, step: 0.01 },
    'drop': { min: 0.2, max: 50, step: 0.1 },
    'multiplier': { min: 1.0, max: 5.0, step: 0.1 },
    'levels': { min: 1, max: 20, step: 1 },
    'profit': { min: 0.2, max: 1000, step: 0.1 },
    'slippage': { min: 0.1, max: 10.0, step: 0.1 }
  };
  
  const limit = configLimits[configType];
  const label = configLabels[configType];
  
  const message = `
🦈 **TerminalOne🦈**

⚙️ **Configure ${label}**

📝 **Current Value:** ${getUserConfig(ctx, ctx.from.id)[configType === 'initial' ? 'initialBuyAmount' : configType === 'drop' ? 'dropPercentage' : configType === 'multiplier' ? 'multiplier' : configType === 'levels' ? 'maxLevels' : configType === 'profit' ? 'profitTarget' : 'slippage']}

📊 **Valid Range:** ${limit.min} - ${limit.max}

💡 **Send the new value:**
  `;
  
  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'martingale_configure')]
      ])
    });
  } catch (error) {
    if (error.description?.includes('message to edit not found')) {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'martingale_configure')]
        ])
      });
    } else {
      throw error;
    }
  }
  
  // Set user state for value input
  ctx.session = ctx.session || {};
  ctx.session.awaitingConfigValue = configType;
};

/**
 * Process configuration value input
 */
const handleConfigValueInput = async (ctx) => {
  const configType = ctx.session.awaitingConfigValue;
  const inputText = ctx.message.text.trim();
  const userId = ctx.from.id;
  
  // Input validation
  if (!inputText || inputText.length > 20) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid input. Please enter a valid number.', {
      reply_to_message_id: ctx.message.message_id - 1
    });
    return;
  }
  
  // Check for malicious patterns
  const maliciousPatterns = ['/script', '<script', 'javascript:', 'data:', 'vbscript:', 'onload', 'onerror'];
  if (maliciousPatterns.some(pattern => inputText.toLowerCase().includes(pattern))) {
    await ctx.deleteMessage();
    await ctx.reply('❌ Invalid input detected. Please enter only numbers.', {
      reply_to_message_id: ctx.message.message_id - 1
    });
    return;
  }
  
  const inputValue = parseFloat(inputText);
  
  const configLimits = {
    'initial': { min: 0.01, max: 100 },
    'drop': { min: 0.2, max: 50 },
    'multiplier': { min: 1.0, max: 5.0 },
    'levels': { min: 1, max: 20 },
    'profit': { min: 0.2, max: 1000 },
    'slippage': { min: 0.1, max: 10.0 }
  };
  
  try {
    // Delete user message for privacy
    await ctx.deleteMessage();
    
    // Show processing message
    const processingMsg = await ctx.reply('⚙️ **Updating configuration...**', {
      parse_mode: 'Markdown'
    });
    
    if (isNaN(inputValue)) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        '🦈 **TerminalOne🦈**\n\n❌ **Invalid Input**\n\n💬 Please enter a valid number',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', `config_${configType}`)],
            [Markup.button.callback('🔙 Back', 'martingale_configure')]
          ])
        }
      );
      return;
    }
    
    const limit = configLimits[configType];
    if (inputValue < limit.min || inputValue > limit.max) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        `🦈 **TerminalOne🦈**\n\n❌ **Value Out of Range**\n\n📊 **Valid Range:** ${limit.min} - ${limit.max}\n💬 Your input: ${inputValue}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', `config_${configType}`)],
            [Markup.button.callback('🔙 Back', 'martingale_configure')]
          ])
        }
      );
      return;
    }
    
    // Update configuration
    const userConfig = getUserConfig(ctx, userId);
    const configKey = configType === 'initial' ? 'initialBuyAmount' : 
                     configType === 'drop' ? 'dropPercentage' :
                     configType === 'multiplier' ? 'multiplier' :
                     configType === 'levels' ? 'maxLevels' :
                     configType === 'profit' ? 'profitTarget' : 'slippage';
    
    const oldValue = userConfig[configKey];
    userConfig[configKey] = inputValue;
    saveUserConfig(ctx, userId, userConfig);
    
    // Calculate new max investment for feedback
    const newMaxInvestment = calculateMaxInvestment(userConfig);
    
    // Show success message with changes
    const configLabels = {
      'initial': '💰 Initial Buy Amount',
      'drop': '📉 Drop Percentage', 
      'multiplier': '⚡ Multiplier',
      'levels': '🔢 Max Levels',
      'profit': '🎯 Profit Target',
      'slippage': '🌊 Slippage'
    };
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      `🦈 **TerminalOne🦈**\n\n✅ **Configuration Updated!**\n\n${configLabels[configType]}\n🔄 **${oldValue}** ➡️ **${inputValue}**\n\n💵 **New Max Investment:** ${newMaxInvestment.toFixed(4)} SOL\n\n✨ **Returning to configuration menu...**`,
      { parse_mode: 'Markdown' }
    );
    
    // Clear state
    ctx.session.awaitingConfigValue = false;
    
    // Wait a moment for user to see the success message, then show config menu
    setTimeout(async () => {
      try {
        await handleConfigurationMenu(ctx);
      } catch (error) {
        // If editing fails, send new message
        logger.warn('Failed to edit message, sending new config menu');
        await sendNewConfigurationMenu(ctx, userId);
      }
    }, 2000);
    
    } catch (error) {
    logger.error('Error updating configuration:', error);
    await ctx.reply('❌ Error updating configuration. Please try again.');
  }
};

/**
 * Handle preset selection
 */
const handlePresetSelection = async (ctx, presetName) => {
  const userId = ctx.from.id;
  
  try {
    const userConfig = getUserConfig(ctx, userId);
    
    // Apply preset
    const preset = STRATEGY_PRESETS[presetName];
    if (preset) {
      // Create a copy to avoid reference issues
      Object.assign(userConfig, { ...preset });
      saveUserConfig(ctx, userId, userConfig);
      
      // Show success message with preset details
      const maxInvestment = calculateMaxInvestment(userConfig);
      await ctx.answerCbQuery(`✅ ${presetName} preset applied! Max risk: ${maxInvestment.toFixed(4)} SOL`, { show_alert: false });
      
      // Update the configuration menu
      await handleConfigurationMenu(ctx);
    } else {
      await ctx.answerCbQuery(`❌ ${presetName} preset not found`, { show_alert: true });
      logger.error(`Preset ${presetName} not found in STRATEGY_PRESETS`);
    }
  } catch (error) {
    logger.error(`Error applying preset ${presetName}:`, error);
    await ctx.answerCbQuery('❌ Error applying preset. Please try again.', { show_alert: true });
  }
};

/**
 * Handle trading history display
 */
const handleTradingHistory = async (ctx) => {
  const userId = ctx.from.id;
  const historyService = ctx.services?.tradingHistory;
  
  if (!historyService) {
    await ctx.reply('❌ Trading history service not available');
    return;
  }

  try {
    // Get recent trading history and analytics
    const analytics = historyService.getUserAnalytics(userId, '30d');
    const recentTrades = historyService.getUserTradingHistory(userId, { limit: 10 });
    const recentStrategies = historyService.getUserStrategyHistory(userId, { limit: 5 });
    
    let message = `
🦈 **TerminalOne🦈**

📊 **Trading History & Analytics**

📈 **30-Day Summary:**
• Total Trades: **${analytics.timeframe.tradesCount}**
• Total Strategies: **${analytics.timeframe.strategiesCount}**
• Total Volume: **${analytics.timeframe.totalVolume.toFixed(4)} SOL**
• Average Trade: **${analytics.timeframe.averageTradeSize.toFixed(4)} SOL**
• Win Rate: **${analytics.timeframe.winRate.toFixed(1)}%**
• Total P&L: ${analytics.timeframe.totalPnL >= 0 ? '🟢' : '🔴'} **${analytics.timeframe.totalPnL.toFixed(4)} SOL**

`;

    // Add recent strategies summary
    if (recentStrategies.length > 0) {
      message += `🎯 **Recent Strategies:**\n`;
      recentStrategies.slice(0, 3).forEach((strategy, index) => {
        const statusEmoji = strategy.type === 'completed' ? '✅' : 
                           strategy.type === 'stopped' ? '🛑' : 
                           strategy.type === 'failed' ? '❌' : '🏃';
        const pnlColor = (strategy.realizedPnL || 0) >= 0 ? '🟢' : '🔴';
        message += `${statusEmoji} **${strategy.symbol}** - ${pnlColor} ${(strategy.realizedPnL || 0).toFixed(4)} SOL\n`;
      });
      message += '\n';
    }

    // Add recent trades summary
    if (recentTrades.length > 0) {
      message += `💼 **Recent Trades:**\n`;
      recentTrades.slice(0, 5).forEach((trade, index) => {
        const typeEmoji = trade.type === 'buy' ? '🟢' : '🔴';
        const statusEmoji = trade.status === 'completed' ? '✅' : trade.status === 'failed' ? '❌' : '⏳';
        message += `${typeEmoji}${statusEmoji} **${trade.symbol}** - ${trade.solAmount?.toFixed(4) || '0'} SOL\n`;
      });
    } else {
      message += `💼 **No trades yet**\n\nStart your first strategy to see trading history!\n`;
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📈 Detailed Analytics', 'history_analytics')],
      [Markup.button.callback('📋 All Trades', 'history_trades'), Markup.button.callback('🎯 All Strategies', 'history_strategies')],
      [Markup.button.callback('🔙 Back to Martingale', 'martingale_menu')]
    ]);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    logger.error(`Error displaying trading history for user ${userId}:`, error);
    await ctx.reply('❌ Error loading trading history. Please try again.');
  }
};

/**
 * Handle detailed analytics display
 */
const handleDetailedAnalytics = async (ctx) => {
  const userId = ctx.from.id;
  const historyService = ctx.services?.tradingHistory;
  
  if (!historyService) {
    await ctx.reply('❌ Trading history service not available');
    return;
  }

  try {
    const analytics = historyService.getUserAnalytics(userId, '30d');
    const allTimeAnalytics = historyService.getUserAnalytics(userId, '90d');
    
    const message = `
🦈 **TerminalOne🦈**

📊 **Detailed Performance Analytics**

🎯 **30-Day Performance:**
• Trades: **${analytics.timeframe.tradesCount}** (${analytics.timeframe.strategiesCount} strategies)
• Volume: **${analytics.timeframe.totalVolume.toFixed(4)} SOL**
• P&L: ${analytics.timeframe.totalPnL >= 0 ? '🟢' : '🔴'} **${analytics.timeframe.totalPnL.toFixed(4)} SOL**
• Win Rate: **${analytics.timeframe.winRate.toFixed(1)}%**
• Avg ROI: **${analytics.timeframe.averageROI.toFixed(2)}%**

💰 **All-Time Stats:**
• Total Trades: **${allTimeAnalytics.totalTrades}**
• Total Volume: **${allTimeAnalytics.totalVolume.toFixed(4)} SOL**
• Fees Paid: **${allTimeAnalytics.totalFeesPaid.toFixed(4)} SOL**
• Tokens Traded: **${allTimeAnalytics.tokensTraded.length}**
• Avg Slippage: **${allTimeAnalytics.averageSlippage.toFixed(2)}%**

${allTimeAnalytics.tokensTraded.length > 0 ? 
  `🪙 **Top Tokens:** ${allTimeAnalytics.tokensTraded.slice(0, 5).join(', ')}` : 
  '🪙 **No tokens traded yet**'
}

⏰ **Activity:**
• First Trade: ${allTimeAnalytics.firstActivity ? allTimeAnalytics.firstActivity.toLocaleDateString() : 'N/A'}
• Last Trade: ${allTimeAnalytics.lastActivity ? allTimeAnalytics.lastActivity.toLocaleDateString() : 'N/A'}
    `;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 Export Report', 'history_export')],
      [Markup.button.callback('🔙 Back to History', 'martingale_history')]
    ]);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    logger.error(`Error displaying detailed analytics for user ${userId}:`, error);
    await ctx.reply('❌ Error loading analytics. Please try again.');
  }
};

/**
 * Handle export performance report
 */
const handleExportReport = async (ctx) => {
  const userId = ctx.from.id;
  const historyService = ctx.services?.tradingHistory;
  
  if (!historyService) {
    await ctx.reply('❌ Trading history service not available');
    return;
  }

  try {
    const report = historyService.generatePerformanceReport(userId, '30d');
    
    let reportText = `📊 TERMINALONE TRADING REPORT\n`;
    reportText += `==============================\n`;
    reportText += `User ID: ${userId}\n`;
    reportText += `Period: ${report.summary.timeframe}\n`;
    reportText += `Generated: ${new Date().toISOString()}\n\n`;
    
    reportText += `SUMMARY\n`;
    reportText += `-------\n`;
    reportText += `Total Trades: ${report.summary.totalTrades}\n`;
    reportText += `Total Strategies: ${report.summary.totalStrategies}\n`;
    reportText += `Total Volume: ${report.summary.totalVolume.toFixed(4)} SOL\n`;
    reportText += `Total P&L: ${report.summary.totalPnL.toFixed(4)} SOL\n`;
    reportText += `Win Rate: ${report.summary.winRate.toFixed(1)}%\n`;
    reportText += `Average ROI: ${report.summary.averageROI.toFixed(2)}%\n\n`;
    
    if (report.trades.length > 0) {
      reportText += `RECENT TRADES\n`;
      reportText += `-------------\n`;
      report.trades.slice(0, 10).forEach(trade => {
        reportText += `${trade.timestamp.toISOString()} | ${trade.type.toUpperCase()} | ${trade.symbol} | ${(trade.solAmount || 0).toFixed(4)} SOL | ${trade.status}\n`;
      });
    }
    
    // Send as text file
    await ctx.replyWithDocument({
      source: Buffer.from(reportText, 'utf-8'),
      filename: `terminalone-report-${userId}-${new Date().toISOString().split('T')[0]}.txt`
    }, {
      caption: '📊 **Your Trading Report**\n\nHere\'s your detailed performance report!',
      parse_mode: 'Markdown'
    });
    
  } catch (error) {
    logger.error(`Error exporting report for user ${userId}:`, error);
    await ctx.reply('❌ Error generating report. Please try again.');
  }
};

module.exports = {
  handleMartingaleMenu,
  handleConfigurationMenu,
  handleLaunchMenu,
  handleTokenAnalysis,
  handleConfirmLaunch,
  handleExecuteLaunch,
  handleActiveStrategies,
  handleViewStrategy,
  handlePauseStrategy,
  handleStopStrategy,
  handleConfirmStopStrategy,
  handleConfigChange,
  handleConfigValueInput,
  handlePresetSelection,
  handleTradingHistory,
  handleDetailedAnalytics,
  handleExportReport,
  STRATEGY_PRESETS
};
