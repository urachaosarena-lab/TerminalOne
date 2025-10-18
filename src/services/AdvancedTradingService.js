const axios = require('axios');
const logger = require('../utils/logger');

class AdvancedTradingService {
  constructor(solanaService, priceService, walletService) {
    this.solanaService = solanaService;
    this.priceService = priceService;
    this.walletService = walletService;
    
    // Active trading strategies for each user
    this.userStrategies = new Map(); // userId -> [strategies]
    this.activeMonitors = new Map(); // strategyId -> intervalId
    this.copyTradeFollowers = new Map(); // leaderId -> [followerIds]
    
    // Strategy execution queue
    this.executionQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * AUTO-TRADING STRATEGIES
   */

  /**
   * Create a price-based auto-buy strategy
   */
  async createAutoBuyStrategy(userId, config) {
    const strategy = {
      id: this.generateStrategyId(),
      userId,
      type: 'auto_buy',
      tokenAddress: config.tokenAddress,
      symbol: config.symbol,
      triggerType: config.triggerType, // 'price_drop', 'rsi_oversold', 'volume_spike'
      
      // Price-based triggers
      targetPrice: config.targetPrice, // Buy when price drops to this
      priceDropPercentage: config.priceDropPercentage, // Buy when price drops X%
      
      // RSI-based triggers (requires external API)
      rsiThreshold: config.rsiThreshold || 30, // RSI below this triggers buy
      
      // Trade execution settings
      buyAmount: config.buyAmount, // Amount in SOL to spend
      maxSlippage: config.maxSlippage || 1, // 1% default slippage
      
      // Risk management
      stopLoss: config.stopLoss, // Stop loss percentage
      takeProfit: config.takeProfit, // Take profit percentage
      maxTrades: config.maxTrades || 10, // Max trades per day
      
      // Strategy state
      isActive: true,
      tradesExecuted: 0,
      createdAt: new Date(),
      lastCheck: null
    };

    // Store strategy
    if (!this.userStrategies.has(userId)) {
      this.userStrategies.set(userId, []);
    }
    this.userStrategies.get(userId).push(strategy);

    // Start monitoring
    await this.startStrategyMonitoring(strategy);

    logger.info(`Created auto-buy strategy for user ${userId}:`, strategy);
    return strategy;
  }

  /**
   * Create a grid trading strategy
   */
  async createGridTradingStrategy(userId, config) {
    const strategy = {
      id: this.generateStrategyId(),
      userId,
      type: 'grid_trading',
      tokenAddress: config.tokenAddress,
      symbol: config.symbol,
      
      // Grid parameters
      lowerBound: config.lowerBound, // Lower price bound
      upperBound: config.upperBound, // Upper price bound
      gridLevels: config.gridLevels || 10, // Number of grid levels
      investmentAmount: config.investmentAmount, // Total SOL to use
      
      // Current grid state
      activeOrders: [],
      executedTrades: [],
      
      // Strategy state
      isActive: true,
      createdAt: new Date()
    };

    // Calculate grid levels
    const priceStep = (strategy.upperBound - strategy.lowerBound) / strategy.gridLevels;
    const amountPerLevel = strategy.investmentAmount / strategy.gridLevels;

    for (let i = 0; i <= strategy.gridLevels; i++) {
      const price = strategy.lowerBound + (priceStep * i);
      strategy.activeOrders.push({
        type: i === 0 ? 'buy' : (i === strategy.gridLevels ? 'sell' : 'both'),
        price,
        amount: amountPerLevel,
        filled: false
      });
    }

    // Store and start monitoring
    this.userStrategies.get(userId).push(strategy);
    await this.startStrategyMonitoring(strategy);

    logger.info(`Created grid trading strategy for user ${userId}:`, strategy);
    return strategy;
  }

  /**
   * COPY TRADING FEATURES
   */

  /**
   * Follow a trader (copy their trades)
   */
  async followTrader(followerId, leaderId, config) {
    const copyTradeConfig = {
      id: this.generateStrategyId(),
      followerId,
      leaderId,
      type: 'copy_trade',
      
      // Copy settings
      copyPercentage: config.copyPercentage || 100, // Copy 100% of leader's trade size
      maxCopyAmount: config.maxCopyAmount, // Max SOL per copied trade
      onlyProfitableTrades: config.onlyProfitableTrades || false,
      delayMs: config.delayMs || 0, // Delay before copying (in ms)
      
      // Filters
      tokenWhitelist: config.tokenWhitelist || [], // Only copy these tokens
      tokenBlacklist: config.tokenBlacklist || [], // Never copy these tokens
      minTradeSize: config.minTradeSize || 0.1, // Min trade size to copy
      
      isActive: true,
      createdAt: new Date(),
      tradesCopied: 0
    };

    // Add follower to leader's list
    if (!this.copyTradeFollowers.has(leaderId)) {
      this.copyTradeFollowers.set(leaderId, []);
    }
    this.copyTradeFollowers.get(leaderId).push(copyTradeConfig);

    logger.info(`User ${followerId} is now following ${leaderId} for copy trading`);
    return copyTradeConfig;
  }

  /**
   * Execute a trade and notify copy traders
   */
  async executeTradeWithCopyTrading(userId, tradeData) {
    // Execute the original trade
    const tradeResult = await this.executeJupiterSwap(userId, tradeData);

    // Notify copy traders if trade was successful
    if (tradeResult.success && this.copyTradeFollowers.has(userId)) {
      const followers = this.copyTradeFollowers.get(userId);
      
      for (const follower of followers) {
        if (!follower.isActive) continue;
        
        // Apply filters and copy settings
        if (this.shouldCopyTrade(follower, tradeData)) {
          await this.copytrade(follower, tradeData, tradeResult);
        }
      }
    }

    return tradeResult;
  }

  /**
   * JUPITER DEX INTEGRATION
   */

  /**
   * Execute a swap through Jupiter
   */
  async executeJupiterSwap(userId, swapData) {
    try {
      const wallet = this.walletService.getUserWallet(userId);
      if (!wallet) {
        throw new Error('No wallet found for user');
      }

      // Get quote from Jupiter
      const quote = await this.getJupiterQuote({
        inputMint: swapData.inputMint,
        outputMint: swapData.outputMint,
        amount: swapData.amount,
        slippageBps: swapData.slippage * 100 // Convert to basis points
      });

      if (!quote) {
        throw new Error('Unable to get quote from Jupiter');
      }

      // Get swap transaction
      const swapTransaction = await this.getJupiterSwapTransaction(quote, wallet.publicKey);

      if (!swapTransaction) {
        throw new Error('Unable to get swap transaction');
      }

      // Here you would sign and send the transaction
      // This is a simplified version - in production you'd handle the full transaction flow
      
      logger.info(`Executed Jupiter swap for user ${userId}:`, {
        inputMint: swapData.inputMint,
        outputMint: swapData.outputMint,
        amount: swapData.amount,
        expectedOutput: quote.outAmount
      });

      return {
        success: true,
        txHash: 'simulated_tx_hash', // Would be real transaction hash
        inputAmount: swapData.amount,
        outputAmount: quote.outAmount,
        price: quote.outAmount / swapData.amount,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error(`Jupiter swap failed for user ${userId}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get quote from Jupiter API
   */
  async getJupiterQuote({ inputMint, outputMint, amount, slippageBps = 100 }) {
    try {
      const response = await axios.get('https://quote-api.jup.ag/v6/quote', {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error('Jupiter quote failed:', error);
      return null;
    }
  }

  /**
   * Get swap transaction from Jupiter
   */
  async getJupiterSwapTransaction(quote, userPublicKey) {
    try {
      const response = await axios.post('https://quote-api.jup.ag/v6/swap', {
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error('Jupiter swap transaction failed:', error);
      return null;
    }
  }

  /**
   * STRATEGY MONITORING
   */

  /**
   * Start monitoring a strategy
   */
  async startStrategyMonitoring(strategy) {
    const checkInterval = 30000; // Check every 30 seconds
    
    const intervalId = setInterval(async () => {
      try {
        await this.checkStrategy(strategy);
      } catch (error) {
        logger.error(`Strategy monitoring error for ${strategy.id}:`, error);
      }
    }, checkInterval);

    this.activeMonitors.set(strategy.id, intervalId);
    logger.info(`Started monitoring strategy ${strategy.id}`);
  }

  /**
   * Check if strategy conditions are met
   */
  async checkStrategy(strategy) {
    if (!strategy.isActive) return;

    strategy.lastCheck = new Date();

    switch (strategy.type) {
      case 'auto_buy':
        await this.checkAutoBuyStrategy(strategy);
        break;
      case 'grid_trading':
        await this.checkGridTradingStrategy(strategy);
        break;
      default:
        logger.warn(`Unknown strategy type: ${strategy.type}`);
    }
  }

  /**
   * Check auto-buy strategy conditions
   */
  async checkAutoBuyStrategy(strategy) {
    try {
      const currentPrice = await this.priceService.getTokenPrice(strategy.tokenAddress);
      
      let shouldExecute = false;
      let reason = '';

      // Check price-based triggers
      if (strategy.triggerType === 'price_drop' && strategy.targetPrice) {
        if (currentPrice.price <= strategy.targetPrice) {
          shouldExecute = true;
          reason = `Price dropped to target: $${currentPrice.price}`;
        }
      }

      if (strategy.triggerType === 'price_drop' && strategy.priceDropPercentage) {
        // Would need to track previous price or use 24h change
        if (currentPrice.change24h <= -strategy.priceDropPercentage) {
          shouldExecute = true;
          reason = `Price dropped ${strategy.priceDropPercentage}% in 24h`;
        }
      }

      // Check RSI trigger (would need external RSI data)
      if (strategy.triggerType === 'rsi_oversold') {
        const rsi = await this.getRSIData(strategy.tokenAddress);
        if (rsi && rsi <= strategy.rsiThreshold) {
          shouldExecute = true;
          reason = `RSI oversold: ${rsi}`;
        }
      }

      // Execute trade if conditions are met
      if (shouldExecute && strategy.tradesExecuted < strategy.maxTrades) {
        await this.executeStrategyTrade(strategy, reason);
      }

    } catch (error) {
      logger.error(`Auto-buy strategy check failed for ${strategy.id}:`, error);
    }
  }

  /**
   * Execute a strategy trade
   */
  async executeStrategyTrade(strategy, reason) {
    const tradeData = {
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: strategy.tokenAddress,
      amount: strategy.buyAmount * 1e9, // Convert SOL to lamports
      slippage: strategy.maxSlippage
    };

    const result = await this.executeJupiterSwap(strategy.userId, tradeData);
    
    if (result.success) {
      strategy.tradesExecuted++;
      logger.info(`Strategy trade executed for ${strategy.id}: ${reason}`, result);
    }

    return result;
  }

  /**
   * UTILITY METHODS
   */

  generateStrategyId() {
    return `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  shouldCopyTrade(follower, tradeData) {
    // Apply filters and copy settings
    if (follower.tokenBlacklist.includes(tradeData.outputMint)) return false;
    if (follower.tokenWhitelist.length > 0 && !follower.tokenWhitelist.includes(tradeData.outputMint)) return false;
    if (tradeData.amount < follower.minTradeSize * 1e9) return false;
    
    return true;
  }

  async copytrade(follower, originalTrade, originalResult) {
    // Calculate copy amount
    const copyAmount = Math.min(
      originalTrade.amount * (follower.copyPercentage / 100),
      follower.maxCopyAmount * 1e9
    );

    const copyTradeData = {
      ...originalTrade,
      amount: copyAmount
    };

    // Add delay if configured
    if (follower.delayMs > 0) {
      setTimeout(async () => {
        await this.executeJupiterSwap(follower.followerId, copyTradeData);
      }, follower.delayMs);
    } else {
      await this.executeJupiterSwap(follower.followerId, copyTradeData);
    }

    follower.tradesCopied++;
  }

  async getRSIData(tokenAddress) {
    // This would integrate with TradingView or other technical analysis APIs
    // For now, returning null (not implemented)
    return null;
  }

  /**
   * Get user's active strategies
   */
  getUserStrategies(userId) {
    return this.userStrategies.get(userId) || [];
  }

  /**
   * Stop a strategy
   */
  async stopStrategy(strategyId) {
    // Find and deactivate strategy
    for (const [userId, strategies] of this.userStrategies) {
      const strategy = strategies.find(s => s.id === strategyId);
      if (strategy) {
        strategy.isActive = false;
        
        // Stop monitoring
        const intervalId = this.activeMonitors.get(strategyId);
        if (intervalId) {
          clearInterval(intervalId);
          this.activeMonitors.delete(strategyId);
        }
        
        logger.info(`Stopped strategy ${strategyId}`);
        return true;
      }
    }
    
    return false;
  }
}

module.exports = AdvancedTradingService;