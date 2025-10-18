const logger = require('../utils/logger');

class MartingaleStrategy {
  constructor(solanaService, priceService, walletService, tradingService, revenueService) {
    this.solanaService = solanaService;
    this.priceService = priceService;
    this.walletService = walletService;
    this.tradingService = tradingService;
    this.revenueService = revenueService;
    
    // Active Martingale strategies
    this.activeStrategies = new Map(); // userId -> strategy[]
    this.strategyMonitors = new Map(); // strategyId -> monitoring data
  }

  /**
   * Create a new Martingale Long strategy
   */
  async createMartingaleStrategy(userId, config) {
    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const strategy = {
      id: this.generateStrategyId(),
      userId,
      type: 'martingale_long',
      
      // Token configuration
      tokenAddress: config.tokenAddress,
      symbol: config.symbol,
      
      // Martingale parameters
      initialBuyAmount: config.initialBuyAmount, // First buy amount in SOL
      dropPercentage: config.dropPercentage || 5, // Trigger next buy when price drops X%
      multiplier: config.multiplier || 2, // Each buy is X times larger than previous
      maxLevels: config.maxLevels || 10, // Maximum number of additional buys
      
      // Exit strategy
      profitTarget: config.profitTarget || 10, // Sell all when profit reaches X%
      stopLossEnabled: config.stopLossEnabled || true,
      maxLossPercentage: config.maxLossPercentage || 50, // Stop strategy if total loss > X%
      
      // Risk management
      maxTotalInvestment: config.maxTotalInvestment, // Maximum SOL to risk
      cooldownPeriod: config.cooldownPeriod || 3600000, // 1 hour cooldown between strategies
      
      // Strategy state
      status: 'active', // active, paused, completed, stopped
      currentLevel: 0, // Current Martingale level (0 = initial buy done)
      totalInvested: 0, // Total SOL invested
      totalTokens: 0, // Total tokens accumulated
      averageBuyPrice: 0, // Volume-weighted average buy price
      
      // Buy history
      buyOrders: [],
      
      // Performance tracking
      createdAt: new Date(),
      lastCheck: new Date(),
      lastBuyPrice: null,
      highestPrice: null,
      lowestPrice: null,
      
      // Monitoring
      priceAlerts: [],
      isMonitoring: false
    };

    // Calculate the theoretical maximum investment
    const maxInvestment = this.calculateMaxInvestment(strategy);
    if (maxInvestment > strategy.maxTotalInvestment) {
      throw new Error(`Strategy would require ${maxInvestment.toFixed(4)} SOL maximum, but limit is ${strategy.maxTotalInvestment} SOL`);
    }

    // Store strategy
    if (!this.activeStrategies.has(userId)) {
      this.activeStrategies.set(userId, []);
    }
    this.activeStrategies.get(userId).push(strategy);

    // Execute initial buy
    await this.executeInitialBuy(strategy);

    // Start monitoring
    await this.startStrategyMonitoring(strategy);

    logger.info(`Created Martingale strategy for user ${userId}:`, {
      strategyId: strategy.id,
      token: strategy.symbol,
      initialAmount: strategy.initialBuyAmount,
      maxLevels: strategy.maxLevels,
      maxInvestment: maxInvestment.toFixed(4)
    });

    return strategy;
  }

  /**
   * Execute the initial buy order
   */
  async executeInitialBuy(strategy) {
    try {
      const currentPrice = await this.priceService.getTokenPrice(strategy.tokenAddress);
      
      const buyOrder = {
        level: 0,
        type: 'initial',
        solAmount: strategy.initialBuyAmount,
        price: currentPrice.price,
        timestamp: new Date(),
        status: 'pending'
      };

      // Execute the trade (simplified - in production this would be a real Jupiter swap)
      const tradeResult = await this.executeMarketBuy(strategy.userId, {
        tokenAddress: strategy.tokenAddress,
        solAmount: strategy.initialBuyAmount,
        expectedPrice: currentPrice.price
      });

      if (tradeResult.success) {
        buyOrder.status = 'completed';
        buyOrder.tokensReceived = tradeResult.tokensReceived;
        buyOrder.actualPrice = tradeResult.actualPrice;
        
        // Update strategy state
        strategy.totalInvested = strategy.initialBuyAmount;
        strategy.totalTokens = tradeResult.tokensReceived;
        strategy.averageBuyPrice = currentPrice.price;
        strategy.lastBuyPrice = currentPrice.price;
        strategy.highestPrice = currentPrice.price;
        strategy.lowestPrice = currentPrice.price;

        logger.info(`Initial buy completed for strategy ${strategy.id}:`, buyOrder);
      } else {
        buyOrder.status = 'failed';
        buyOrder.error = tradeResult.error;
        strategy.status = 'failed';
        
        throw new Error(`Initial buy failed: ${tradeResult.error}`);
      }

      strategy.buyOrders.push(buyOrder);

    } catch (error) {
      logger.error(`Initial buy failed for strategy ${strategy.id}:`, error);
      strategy.status = 'failed';
      throw error;
    }
  }

  /**
   * Start monitoring the strategy for price movements
   */
  async startStrategyMonitoring(strategy) {
    if (strategy.isMonitoring) return;

    strategy.isMonitoring = true;

    // Subscribe to real-time price updates
    const priceCallback = (priceData) => {
      this.handlePriceUpdate(strategy, priceData);
    };

    await this.priceService.subscribeToPriceUpdates(strategy.tokenAddress, priceCallback);

    this.strategyMonitors.set(strategy.id, {
      priceCallback,
      startTime: new Date(),
      priceUpdates: 0
    });

    logger.info(`Started monitoring strategy ${strategy.id} for ${strategy.symbol}`);
  }

  /**
   * Handle real-time price updates
   */
  async handlePriceUpdate(strategy, priceData) {
    if (strategy.status !== 'active') return;

    const currentPrice = priceData.price;
    strategy.lastCheck = new Date();

    // Update price tracking
    if (!strategy.highestPrice || currentPrice > strategy.highestPrice) {
      strategy.highestPrice = currentPrice;
    }
    if (!strategy.lowestPrice || currentPrice < strategy.lowestPrice) {
      strategy.lowestPrice = currentPrice;
    }

    // Check for profit target (sell signal)
    await this.checkProfitTarget(strategy, currentPrice);

    // Check for next Martingale buy level
    await this.checkMartingaleTrigger(strategy, currentPrice);

    // Check stop loss
    await this.checkStopLoss(strategy, currentPrice);

    // Increment monitoring counter
    const monitor = this.strategyMonitors.get(strategy.id);
    if (monitor) monitor.priceUpdates++;
  }

  /**
   * Check if profit target is reached
   */
  async checkProfitTarget(strategy, currentPrice) {
    if (strategy.totalTokens === 0) return;

    const currentValue = strategy.totalTokens * currentPrice;
    const totalInvested = strategy.totalInvested;
    const profitPercentage = ((currentValue - totalInvested) / totalInvested) * 100;

    if (profitPercentage >= strategy.profitTarget) {
      await this.executeProfitTaking(strategy, currentPrice, profitPercentage);
    }
  }

  /**
   * Check if conditions are met for next Martingale buy
   */
  async checkMartingaleTrigger(strategy, currentPrice) {
    // Can't buy more if we've reached max levels
    if (strategy.currentLevel >= strategy.maxLevels) return;

    // Need a reference price for comparison
    if (!strategy.lastBuyPrice) return;

    // Check if price has dropped enough to trigger next buy
    const priceDropPercentage = ((strategy.lastBuyPrice - currentPrice) / strategy.lastBuyPrice) * 100;
    
    if (priceDropPercentage >= strategy.dropPercentage) {
      await this.executeMartingaleBuy(strategy, currentPrice);
    }
  }

  /**
   * Execute a Martingale buy (doubling down)
   */
  async executeMartingaleBuy(strategy, currentPrice) {
    try {
      const nextLevel = strategy.currentLevel + 1;
      const buyAmount = strategy.initialBuyAmount * Math.pow(strategy.multiplier, nextLevel);

      // Check if this would exceed our maximum investment limit
      if (strategy.totalInvested + buyAmount > strategy.maxTotalInvestment) {
        logger.warn(`Martingale buy would exceed max investment for strategy ${strategy.id}`);
        return;
      }

      const buyOrder = {
        level: nextLevel,
        type: 'martingale',
        solAmount: buyAmount,
        price: currentPrice,
        timestamp: new Date(),
        status: 'pending'
      };

      // Execute the trade
      const tradeResult = await this.executeMarketBuy(strategy.userId, {
        tokenAddress: strategy.tokenAddress,
        solAmount: buyAmount,
        expectedPrice: currentPrice
      });

      if (tradeResult.success) {
        buyOrder.status = 'completed';
        buyOrder.tokensReceived = tradeResult.tokensReceived;
        buyOrder.actualPrice = tradeResult.actualPrice;

        // Update strategy state
        const previousTotal = strategy.totalTokens * strategy.averageBuyPrice;
        const newTokens = tradeResult.tokensReceived;
        const newTotal = strategy.totalTokens + newTokens;
        
        strategy.totalInvested += buyAmount;
        strategy.totalTokens = newTotal;
        strategy.averageBuyPrice = (previousTotal + (newTokens * tradeResult.actualPrice)) / newTotal;
        strategy.lastBuyPrice = tradeResult.actualPrice;
        strategy.currentLevel = nextLevel;

        logger.info(`Martingale buy level ${nextLevel} completed for strategy ${strategy.id}:`, {
          solAmount: buyAmount,
          tokensReceived: newTokens,
          newAveragePrice: strategy.averageBuyPrice,
          totalInvested: strategy.totalInvested
        });

      } else {
        buyOrder.status = 'failed';
        buyOrder.error = tradeResult.error;
        logger.error(`Martingale buy failed for strategy ${strategy.id}:`, tradeResult.error);
      }

      strategy.buyOrders.push(buyOrder);

    } catch (error) {
      logger.error(`Martingale buy execution failed for strategy ${strategy.id}:`, error);
    }
  }

  /**
   * Execute profit taking (sell all tokens)
   */
  async executeProfitTaking(strategy, currentPrice, profitPercentage) {
    try {
      logger.info(`Executing profit taking for strategy ${strategy.id}: ${profitPercentage.toFixed(2)}% profit`);

      const sellOrder = {
        type: 'profit_taking',
        tokenAmount: strategy.totalTokens,
        price: currentPrice,
        timestamp: new Date(),
        status: 'pending'
      };

      // Execute the sell trade (simplified)
      const sellResult = await this.executeMarketSell(strategy.userId, {
        tokenAddress: strategy.tokenAddress,
        tokenAmount: strategy.totalTokens,
        expectedPrice: currentPrice
      });

      if (sellResult.success) {
        sellOrder.status = 'completed';
        sellOrder.solReceived = sellResult.solReceived;
        sellOrder.actualPrice = sellResult.actualPrice;

        // Calculate final performance
        const totalProfit = sellResult.solReceived - strategy.totalInvested;
        const finalProfitPercentage = (totalProfit / strategy.totalInvested) * 100;

        // Update strategy state
        strategy.status = 'completed';
        strategy.finalProfit = totalProfit;
        strategy.finalProfitPercentage = finalProfitPercentage;
        strategy.completedAt = new Date();

        // Stop monitoring
        await this.stopStrategyMonitoring(strategy.id);

        logger.info(`Strategy ${strategy.id} completed successfully:`, {
          totalInvested: strategy.totalInvested,
          finalValue: sellResult.solReceived,
          profit: totalProfit,
          profitPercentage: finalProfitPercentage
        });

        // Start new strategy if configured for auto-restart
        if (strategy.autoRestart) {
          setTimeout(() => {
            this.createMartingaleStrategy(strategy.userId, strategy);
          }, strategy.cooldownPeriod);
        }

      } else {
        sellOrder.status = 'failed';
        sellOrder.error = sellResult.error;
        logger.error(`Profit taking failed for strategy ${strategy.id}:`, sellResult.error);
      }

    } catch (error) {
      logger.error(`Profit taking execution failed for strategy ${strategy.id}:`, error);
    }
  }

  /**
   * Check stop loss conditions
   */
  async checkStopLoss(strategy, currentPrice) {
    if (!strategy.stopLossEnabled) return;

    const currentValue = strategy.totalTokens * currentPrice;
    const lossPercentage = ((strategy.totalInvested - currentValue) / strategy.totalInvested) * 100;

    if (lossPercentage >= strategy.maxLossPercentage) {
      await this.executeStopLoss(strategy, currentPrice, lossPercentage);
    }
  }

  /**
   * Execute stop loss
   */
  async executeStopLoss(strategy, currentPrice, lossPercentage) {
    try {
      logger.warn(`Executing stop loss for strategy ${strategy.id}: ${lossPercentage.toFixed(2)}% loss`);

      // Similar to profit taking but marks as stop loss
      const sellResult = await this.executeMarketSell(strategy.userId, {
        tokenAddress: strategy.tokenAddress,
        tokenAmount: strategy.totalTokens,
        expectedPrice: currentPrice
      });

      if (sellResult.success) {
        const totalLoss = strategy.totalInvested - sellResult.solReceived;
        
        strategy.status = 'stopped';
        strategy.finalLoss = totalLoss;
        strategy.finalLossPercentage = lossPercentage;
        strategy.stoppedAt = new Date();
        strategy.stopReason = 'stop_loss';

        await this.stopStrategyMonitoring(strategy.id);

        logger.warn(`Strategy ${strategy.id} stopped with loss:`, {
          totalInvested: strategy.totalInvested,
          finalValue: sellResult.solReceived,
          loss: totalLoss,
          lossPercentage: lossPercentage
        });
      }

    } catch (error) {
      logger.error(`Stop loss execution failed for strategy ${strategy.id}:`, error);
    }
  }

  /**
   * SIMULATION METHODS (replace with real trading in production)
   */

  async executeMarketBuy(userId, { tokenAddress, solAmount, expectedPrice }) {
    try {
      // Calculate platform fee (1% of transaction)
      const feeCalculation = this.revenueService.calculateTransactionFee(solAmount);
      
      logger.info(`Martingale buy with fee for user ${userId}:`, {
        originalAmount: solAmount,
        feeAmount: feeCalculation.feeAmount,
        netAmount: feeCalculation.netAmount
      });
      
      // Record the fee for revenue tracking
      await this.revenueService.recordRevenue(userId, feeCalculation.feeAmount);
      
      // This is a simulation - replace with real Jupiter integration
      // In production, include the fee instruction in the transaction
      return {
        success: true,
        tokensReceived: feeCalculation.netAmount / expectedPrice, // Use net amount after fee
        actualPrice: expectedPrice * (1 + (Math.random() * 0.02 - 0.01)), // ±1% slippage
        txHash: `sim_buy_${Date.now()}`,
        platformFee: feeCalculation.feeAmount,
        feePercentage: feeCalculation.feePercentage
      };
    } catch (error) {
      logger.error('Error executing market buy with fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeMarketSell(userId, { tokenAddress, tokenAmount, expectedPrice }) {
    try {
      // Calculate gross SOL amount before fees
      const grossSolAmount = tokenAmount * expectedPrice * 0.99; // 1% slippage
      
      // Calculate platform fee (1% of transaction)
      const feeCalculation = this.revenueService.calculateTransactionFee(grossSolAmount);
      
      logger.info(`Martingale sell with fee for user ${userId}:`, {
        grossAmount: grossSolAmount,
        feeAmount: feeCalculation.feeAmount,
        netAmount: feeCalculation.netAmount
      });
      
      // Record the fee for revenue tracking
      await this.revenueService.recordRevenue(userId, feeCalculation.feeAmount);
      
      // This is a simulation - replace with real Jupiter integration
      // In production, include the fee instruction in the transaction
      return {
        success: true,
        solReceived: feeCalculation.netAmount, // Net amount after platform fee
        actualPrice: expectedPrice * 0.99,
        txHash: `sim_sell_${Date.now()}`,
        platformFee: feeCalculation.feeAmount,
        feePercentage: feeCalculation.feePercentage
      };
    } catch (error) {
      logger.error('Error executing market sell with fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * UTILITY METHODS
   */

  validateConfig(config) {
    if (!config.tokenAddress) return { valid: false, error: 'Token address required' };
    if (!config.initialBuyAmount || config.initialBuyAmount <= 0) return { valid: false, error: 'Initial buy amount must be positive' };
    if (config.dropPercentage <= 0 || config.dropPercentage > 50) return { valid: false, error: 'Drop percentage must be 0-50%' };
    if (config.maxLevels < 1 || config.maxLevels > 20) return { valid: false, error: 'Max levels must be 1-20' };
    if (!config.maxTotalInvestment || config.maxTotalInvestment < config.initialBuyAmount) return { valid: false, error: 'Max total investment too low' };
    
    return { valid: true };
  }

  calculateMaxInvestment(strategy) {
    let total = strategy.initialBuyAmount;
    for (let i = 1; i <= strategy.maxLevels; i++) {
      total += strategy.initialBuyAmount * Math.pow(strategy.multiplier, i);
    }
    return total;
  }

  generateStrategyId() {
    return `martingale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get user strategies
   */
  getUserStrategies(userId) {
    return this.activeStrategies.get(userId) || [];
  }

  /**
   * Get strategy by ID
   */
  getStrategy(strategyId) {
    for (const [userId, strategies] of this.activeStrategies) {
      const strategy = strategies.find(s => s.id === strategyId);
      if (strategy) return strategy;
    }
    return null;
  }

  /**
   * Stop strategy monitoring
   */
  async stopStrategyMonitoring(strategyId) {
    const monitor = this.strategyMonitors.get(strategyId);
    if (monitor) {
      await this.priceService.unsubscribeFromPriceUpdates(
        this.getStrategy(strategyId)?.tokenAddress,
        monitor.priceCallback
      );
      this.strategyMonitors.delete(strategyId);
    }
  }

  /**
   * Pause/resume strategy
   */
  pauseStrategy(strategyId) {
    const strategy = this.getStrategy(strategyId);
    if (strategy && strategy.status === 'active') {
      strategy.status = 'paused';
      return true;
    }
    return false;
  }

  resumeStrategy(strategyId) {
    const strategy = this.getStrategy(strategyId);
    if (strategy && strategy.status === 'paused') {
      strategy.status = 'active';
      return true;
    }
    return false;
  }

  /**
   * Get strategy statistics
   */
  getStrategyStats() {
    const allStrategies = [];
    for (const [userId, strategies] of this.activeStrategies) {
      allStrategies.push(...strategies);
    }

    return {
      total: allStrategies.length,
      active: allStrategies.filter(s => s.status === 'active').length,
      completed: allStrategies.filter(s => s.status === 'completed').length,
      stopped: allStrategies.filter(s => s.status === 'stopped').length,
      monitoring: this.strategyMonitors.size
    };
  }
}

module.exports = MartingaleStrategy;