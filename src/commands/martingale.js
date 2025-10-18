const { Markup } = require('telegraf');

// Default configuration
const CONFIG_LIMITS = {
  initialBuyAmount: { min: 0.01, max: 100 },
  dropPercentage: { min: 0.2, max: 33 },
  multiplier: { min: 1.0, max: 5.0 },
  maxLevels: { min: 1, max: 20 },
  profitTarget: { min: 1, max: 1000 }
};

const STRATEGY_PRESETS = {
  Degen: {
    initialBuyAmount: 0.1,
    dropPercentage: 8,
    multiplier: 1.4,
    maxLevels: 4,
    profitTarget: 8
  },
  Regular: {
    initialBuyAmount: 0.1,
    dropPercentage: 4,
    multiplier: 1.2,
    maxLevels: 6,
    profitTarget: 5
  },
  Stable: {
    initialBuyAmount: 0.1,
    dropPercentage: 2,
    multiplier: 1.1,
    maxLevels: 8,
    profitTarget: 3
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
  
  if (!martingaleService) {
    await ctx.reply('❌ Martingale service not available');
    return;
  }

  // Get user's active strategies
  const activeStrategies = martingaleService.getUserStrategies(userId);
  const activeCount = activeStrategies.filter(s => s.status === 'active').length;
  
  // Get user's current configuration
  const userConfig = getUserConfig(ctx, userId);
  
  const message = `
🦈 **TerminalOne🦈**

🤖 **Martingale Long Strategy**

📊 **Current Configuration:**
💰 Initial Buy: **${userConfig.initialBuyAmount} SOL**
📉 Drop Trigger: **${userConfig.dropPercentage}%**
⚡ Multiplier: **${userConfig.multiplier}x**
🔢 Max Levels: **${userConfig.maxLevels}**
🎯 Profit Target: **${userConfig.profitTarget}%**

💎 **Max Investment:** **${calculateMaxInvestment(userConfig).toFixed(4)} SOL**

📈 **Active Strategies:** ${activeCount}

🚀 Ready to dominate the markets?
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚙️ Configure Strategy', 'martingale_configure')],
    [Markup.button.callback('🔍 Analyze & Launch', 'martingale_launch')],
    [Markup.button.callback('📊 Active Strategies', 'martingale_active'), Markup.button.callback('📈 History', 'martingale_history')],
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

⚙️ **Martingale Configuration**

🔧 **Current Settings:**
💰 **Initial Buy Amount:** ${userConfig.initialBuyAmount} SOL
📉 **Drop Percentage:** ${userConfig.dropPercentage}%
⚡ **Multiplier:** ${userConfig.multiplier}x
🔢 **Max Levels:** ${userConfig.maxLevels}
🎯 **Profit Target:** ${userConfig.profitTarget}%
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
    [Markup.button.callback('🎯 Profit Target', 'config_profit')],
    [Markup.button.callback('🔄 Reset to Defaults', 'config_reset'), Markup.button.callback('✅ Save Config', 'config_save')],
    [Markup.button.callback('🔙 Back', 'martingale_menu')]
  ]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
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
${formatted.liquidity}
${formatted.volatility}

${formatted.suitability}
${formatted.risk}

📋 **Recommendations:**
${formatted.recommendations}

⚠️ **Warnings:**
${formatted.warnings}

🤖 **Your Martingale Setup:**
💰 Initial: ${userConfig.initialBuyAmount} SOL | 📉 Trigger: ${userConfig.dropPercentage}%
⚡ Multiplier: ${userConfig.multiplier}x | 🔢 Levels: ${userConfig.maxLevels}
🎯 Profit: ${userConfig.profitTarget}% | 💎 Max Risk: ${maxInvestment.toFixed(4)} SOL
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
    await ctx.reply(
      `🦈 **TerminalOne🦈**\n\n❌ **Analysis Failed**\n\n${error.message}\n\nPlease try again with a valid token ticker or address.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Try Again', 'martingale_launch')],
          [Markup.button.callback('🔙 Back', 'martingale_menu')]
        ])
      }
    );
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
      maxLossPercentage: 50
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
• Stop Loss: **50%**

🔥 **This will execute the first buy immediately!**

Are you ready to launch?
    `;

    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Launch Now!', 'martingale_execute_launch')],
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
      maxLossPercentage: 50
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

  const message = `
🦈 **TerminalOne🦈**

📊 **Active Strategies** (${active.length})

${active.map((strategy, index) => {
  const roi = strategy.totalInvested > 0 ? 
    (((strategy.totalTokens * strategy.highestPrice || 0) - strategy.totalInvested) / strategy.totalInvested * 100) : 0;
  
  return `**${index + 1}. ${strategy.symbol}**
🆔 \`${strategy.id.slice(-8)}\`
💰 Invested: ${strategy.totalInvested.toFixed(4)} SOL
📊 Level: ${strategy.currentLevel}/${strategy.maxLevels}
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

  const currentValue = strategy.totalTokens * (strategy.highestPrice || 0);
  const roi = strategy.totalInvested > 0 ? 
    ((currentValue - strategy.totalInvested) / strategy.totalInvested * 100) : 0;
  const profitLoss = currentValue - strategy.totalInvested;

  const message = `
🦈 **TerminalOne🦈**

📊 **${strategy.symbol}** Strategy Details

🆔 **ID:** \`${strategy.id.slice(-8)}\`
📈 **Status:** ${getStatusEmoji(strategy.status)} ${strategy.status.toUpperCase()}

💰 **Financial Summary:**
• Total Invested: **${strategy.totalInvested.toFixed(4)} SOL**
• Current Value: **${currentValue.toFixed(4)} SOL**
• P&L: ${profitLoss >= 0 ? '🟢' : '🔴'} **${profitLoss.toFixed(4)} SOL**
• ROI: ${roi >= 0 ? '🟢' : '🔴'} **${roi.toFixed(2)}%**

🤖 **Strategy Info:**
• Level: **${strategy.currentLevel}/${strategy.maxLevels}**
• Avg Buy Price: **$${strategy.averageBuyPrice.toFixed(6)}**
• Profit Target: **${strategy.profitTarget}%**
• Total Tokens: **${strategy.totalTokens.toFixed(4)} ${strategy.symbol}**

📊 **Price Tracking:**
• Current: **$${strategy.highestPrice?.toFixed(6) || 'N/A'}**
• Highest: **$${strategy.highestPrice?.toFixed(6) || 'N/A'}**
• Lowest: **$${strategy.lowestPrice?.toFixed(6) || 'N/A'}**

⏰ **Created:** ${formatDate(strategy.createdAt)}
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⏸️ Pause', `pause_strategy_${strategy.id}`), Markup.button.callback('🛑 Stop', `stop_strategy_${strategy.id}`)],
    [Markup.button.callback('🔄 Refresh', `view_strategy_${strategy.id}`)],
    [Markup.button.callback('🔙 Active Strategies', 'martingale_active')]
  ]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
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
 * Handle configuration value changes
 */
const handleConfigChange = async (ctx, configType) => {
  const configLabels = {
    'initial': '💰 Initial Buy Amount (SOL)',
    'drop': '📉 Drop Percentage (%)',
    'multiplier': '⚡ Multiplier (x)',
    'levels': '🔢 Max Levels',
    'profit': '🎯 Profit Target (%)'
  };
  
  const configLimits = {
    'initial': { min: 0.01, max: 100, step: 0.01 },
    'drop': { min: 1, max: 50, step: 1 },
    'multiplier': { min: 1.1, max: 5, step: 0.1 },
    'levels': { min: 1, max: 10, step: 1 },
    'profit': { min: 1, max: 100, step: 1 }
  };
  
  const limit = configLimits[configType];
  const label = configLabels[configType];
  
  const message = `
🦈 **TerminalOne🦈**

⚙️ **Configure ${label}**

📝 **Current Value:** ${getUserConfig(ctx, ctx.from.id)[configType === 'initial' ? 'initialBuyAmount' : configType === 'drop' ? 'dropPercentage' : configType === 'multiplier' ? 'multiplier' : configType === 'levels' ? 'maxLevels' : 'profitTarget']}

📊 **Valid Range:** ${limit.min} - ${limit.max}

💡 **Send the new value:**
  `;
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', 'martingale_configure')]
    ])
  });
  
  // Set user state for value input
  ctx.session = ctx.session || {};
  ctx.session.awaitingConfigValue = configType;
};

/**
 * Process configuration value input
 */
const handleConfigValueInput = async (ctx) => {
  const configType = ctx.session.awaitingConfigValue;
  const inputValue = parseFloat(ctx.message.text.trim());
  const userId = ctx.from.id;
  
  const configLimits = {
    'initial': { min: 0.01, max: 100 },
    'drop': { min: 1, max: 50 },
    'multiplier': { min: 1.1, max: 5 },
    'levels': { min: 1, max: 10 },
    'profit': { min: 1, max: 100 }
  };
  
  try {
    // Delete user message
    await ctx.deleteMessage();
    
    if (isNaN(inputValue)) {
      await ctx.reply('❌ Invalid number. Please try again.', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', `config_${configType}`)],
          [Markup.button.callback('🔙 Back', 'martingale_configure')]
        ])
      });
      return;
    }
    
    const limit = configLimits[configType];
    if (inputValue < limit.min || inputValue > limit.max) {
      await ctx.reply(`❌ Value must be between ${limit.min} and ${limit.max}`, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', `config_${configType}`)],
          [Markup.button.callback('🔙 Back', 'martingale_configure')]
        ])
      });
      return;
    }
    
    // Update configuration
    const userConfig = getUserConfig(ctx, userId);
    const configKey = configType === 'initial' ? 'initialBuyAmount' : 
                     configType === 'drop' ? 'dropPercentage' :
                     configType === 'multiplier' ? 'multiplier' :
                     configType === 'levels' ? 'maxLevels' : 'profitTarget';
    
    userConfig[configKey] = inputValue;
    saveUserConfig(ctx, userId, userConfig);
    
    // Clear state
    ctx.session.awaitingConfigValue = false;
    
    // Show updated configuration
    await handleConfigurationMenu(ctx);
    
  } catch (error) {
    console.error('Error updating config:', error);
    await ctx.reply('❌ Error updating configuration. Please try again.');
  }
};

/**
 * Handle preset selection
 */
const handlePresetSelection = async (ctx, presetName) => {
  const userId = ctx.from.id;
  const userConfig = getUserConfig(ctx, userId);
  
  // Apply preset
  const preset = STRATEGY_PRESETS[presetName];
  if (preset) {
    Object.assign(userConfig, preset);
    saveUserConfig(ctx, userId, userConfig);
    
    await ctx.answerCbQuery(`✅ Applied ${presetName} preset!`);
    await handleConfigurationMenu(ctx);
  } else {
    await ctx.answerCbQuery('❌ Preset not found');
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
  handleConfigChange,
  handleConfigValueInput,
  handlePresetSelection,
  STRATEGY_PRESETS
};
