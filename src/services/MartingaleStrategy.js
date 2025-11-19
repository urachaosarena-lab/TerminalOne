const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class MartingaleStrategy {
  constructor(solanaService, priceService, walletService, tradingService, revenueService, tradingHistoryService = null, notificationService = null) {
    this.solanaService = solanaService;
    this.priceService = priceService;
    this.walletService = walletService;
    this.tradingService = tradingService;
    this.revenueService = revenueService;
    this.tradingHistoryService = tradingHistoryService;
    this.notificationService = notificationService;
    
    // File persistence
    this.strategiesStoragePath = path.join(__dirname, '../../data/strategies.json');
    
    // Active Martingale strategies
    this.activeStrategies = new Map(); // userId -> strategy[]
    this.strategyMonitors = new Map(); // strategyId -> monitoring data
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.strategiesStoragePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load strategies from file
    this.loadStrategiesFromFile();
  }
  
  loadStrategiesFromFile() {
    try {
      if (fs.existsSync(this.strategiesStoragePath)) {
        const data = fs.readFileSync(this.strategiesStoragePath, 'utf8');
        const strategies = JSON.parse(data);
        
        Object.entries(strategies).forEach(([userId, userStrategies]) => {
          // Convert date strings back to Date objects
          const restoredStrategies = userStrategies.map(strategy => ({
            ...strategy,
            createdAt: new Date(strategy.createdAt),
            lastCheck: new Date(strategy.lastCheck),
            completedAt: strategy.completedAt ? new Date(strategy.completedAt) : undefined,
            stoppedAt: strategy.stoppedAt ? new Date(strategy.stoppedAt) : undefined,
            buyOrders: strategy.buyOrders.map(order => ({
              ...order,
              timestamp: new Date(order.timestamp)
            }))
          }));
          
          this.activeStrategies.set(userId, restoredStrategies);
          
          // Restart monitoring for active strategies
          restoredStrategies.forEach(strategy => {
            if (strategy.status === 'active') {
              this.startStrategyMonitoring(strategy).catch(err => {
                logger.error(`Failed to restart monitoring for strategy ${strategy.id}:`, err);
              });
            }
          });
        });
        
        logger.info(`Loaded ${this.activeStrategies.size} users with strategies from storage`);
      }
    } catch (error) {
      logger.error('Failed to load strategies:', error);
    }
  }
  
  saveStrategiesToFile() {
    try {
      const strategiesObject = {};
      this.activeStrategies.forEach((strategies, userId) => {
        strategiesObject[userId] = strategies;
      });
      
      fs.writeFileSync(this.strategiesStoragePath, JSON.stringify(strategiesObject, null, 2), 'utf8');
      logger.info(`Saved ${this.activeStrategies.size} users' strategies to storage`);
    } catch (error) {
      logger.error('Failed to save strategies:', error);
    }
  }

  /**
   * Create a new Martingale Long strategy
   */
  async createMartingaleStrategy(userId, config) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
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
      
      // Trading configuration
      slippage: config.slippage || 1.0, // Slippage tolerance for trades
      
      // Risk management
      maxTotalInvestment: config.maxTotalInvestment, // Maximum SOL to risk
      cooldownPeriod: config.cooldownPeriod || 3600000, // 1 hour cooldown between strategies
      
      // Strategy state
      status: 'active', // active, paused, completed, stopped
      currentLevel: 0, // Current Martingale level (0 = initial buy done)
      totalInvested: 0, // Total SOL invested
      totalTokens: 0, // Total tokens accumulated
      averageBuyPrice: 0, // Volume-weighted average buy price
      sellCycles: 0, // Number of times profit target was hit
      
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
    this.saveStrategiesToFile();

    // Log strategy creation
    if (this.tradingHistoryService) {
      await this.tradingHistoryService.logStrategyEvent(userId, {
        strategyId: strategy.id,
        type: 'created',
        tokenAddress: strategy.tokenAddress,
        symbol: strategy.symbol,
        config: {
          initialBuyAmount: strategy.initialBuyAmount,
          dropPercentage: strategy.dropPercentage,
          multiplier: strategy.multiplier,
          maxLevels: strategy.maxLevels,
          profitTarget: strategy.profitTarget,
          slippage: strategy.slippage
        }
      });
    }

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
        expectedPrice: currentPrice.price,
        maxSlippage: strategy.slippage
      });

      if (tradeResult.success) {
        buyOrder.status = 'completed';
        buyOrder.tokensReceived = tradeResult.tokensReceived;
        buyOrder.actualPrice = tradeResult.actualPrice;
        
        // Update strategy state - track both gross and net amounts
        strategy.totalInvested = strategy.initialBuyAmount; // Gross amount (for display)
        strategy.netInvested = tradeResult.solSpent || (strategy.initialBuyAmount * 0.99); // Net amount actually used for tokens
        strategy.totalTokens = tradeResult.tokensReceived;
        strategy.averageBuyPrice = currentPrice.price;
        strategy.lastBuyPrice = currentPrice.price;
        strategy.highestPrice = currentPrice.price;
        strategy.lowestPrice = currentPrice.price;

        // Log the trade
        if (this.tradingHistoryService) {
          await this.tradingHistoryService.logTrade(strategy.userId, {
            type: 'buy',
            strategyId: strategy.id,
            tokenAddress: strategy.tokenAddress,
            symbol: strategy.symbol,
            solAmount: strategy.initialBuyAmount,
            tokenAmount: tradeResult.tokensReceived,
            price: tradeResult.actualPrice,
            txHash: tradeResult.txHash,
            slippage: strategy.slippage,
            priceImpact: tradeResult.priceImpact,
            platformFee: tradeResult.platformFee,
            status: 'completed'
          });
        }

        logger.info(`Initial buy completed for strategy ${strategy.id}:`, buyOrder);
      } else {
        buyOrder.status = 'failed';
        buyOrder.error = tradeResult.error;
        strategy.status = 'failed';
        
        throw new Error(`Initial buy failed: ${tradeResult.error}`);
      }

      strategy.buyOrders.push(buyOrder);
      this.saveStrategiesToFile();

    } catch (error) {
      logger.error(`Initial buy failed for strategy ${strategy.id}:`, error);
      strategy.status = 'failed';
      this.saveStrategiesToFile();
      throw error;
    }
  }

  /**
   * Start monitoring the strategy for price movements
   */
  async startStrategyMonitoring(strategy) {
    // Check if already being monitored with active interval
    if (this.strategyMonitors.has(strategy.id)) {
      logger.info(`Strategy ${strategy.id} is already being monitored`);
      return;
    }

    strategy.isMonitoring = true;

    // Use interval-based monitoring (check every 60 seconds to reduce API load)
    const monitoringInterval = setInterval(async () => {
      try {
        if (strategy.status !== 'active') {
          clearInterval(monitoringInterval);
          return;
        }

        const priceData = await this.priceService.getTokenPrice(strategy.tokenAddress);
        await this.handlePriceUpdate(strategy, priceData);
      } catch (error) {
        logger.error(`Error monitoring strategy ${strategy.id}:`, error);
      }
    }, 60000); // Check every 60 seconds

    this.strategyMonitors.set(strategy.id, {
      interval: monitoringInterval,
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

    // Prevent immediate profit taking - require at least 2 minutes since strategy start
    const timeSinceStart = Date.now() - strategy.createdAt.getTime();
    const minTimeBeforeProfit = 2 * 60 * 1000; // 2 minutes
    
    if (timeSinceStart < minTimeBeforeProfit) {
      return; // Don't check profit for first 2 minutes
    }

    // Get SOL price for proper conversion
    const solPrice = await this.priceService.getSolanaPrice();
    
    // Calculate current USD value of tokens
    const currentUsdValue = strategy.totalTokens * currentPrice;
    
    // Convert to SOL value
    const currentSolValue = currentUsdValue / solPrice.price;
    
    // Calculate profit percentage based on net SOL invested vs SOL value
    const netInvested = strategy.netInvested || (strategy.totalInvested * 0.99); // Fallback for old strategies (account for 1% fee)
    const profitPercentage = ((currentSolValue - netInvested) / netInvested) * 100;

    logger.info(`Profit check for strategy ${strategy.id}:`, {
      totalTokens: strategy.totalTokens,
      tokenPriceUSD: currentPrice,
      currentUsdValue: currentUsdValue,
      solPriceUSD: solPrice.price,
      currentSolValue: currentSolValue,
      totalInvested: strategy.totalInvested,
      netInvested: netInvested,
      profitPercentage: profitPercentage,
      profitTarget: strategy.profitTarget,
      timeSinceStart: timeSinceStart
    });
    
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
        expectedPrice: currentPrice,
        maxSlippage: strategy.slippage
      });

      if (tradeResult.success) {
        buyOrder.status = 'completed';
        buyOrder.tokensReceived = tradeResult.tokensReceived;
        buyOrder.actualPrice = tradeResult.actualPrice;

        // Update strategy state
        const previousTotal = strategy.totalTokens * strategy.averageBuyPrice;
        const newTokens = tradeResult.tokensReceived;
        const newTotal = strategy.totalTokens + newTokens;
        
        // Track net investment (after fees) for accurate loss calculation
        strategy.totalInvested += buyAmount; // Gross amount (for display)
        const netBuyAmount = tradeResult.solSpent || (buyAmount * 0.99); // Net amount actually used
        strategy.netInvested = (strategy.netInvested || 0) + netBuyAmount;
        strategy.totalTokens = newTotal;
        strategy.averageBuyPrice = (previousTotal + (newTokens * tradeResult.actualPrice)) / newTotal;
        strategy.lastBuyPrice = tradeResult.actualPrice;
        strategy.currentLevel = nextLevel;

        // Log the martingale trade
        if (this.tradingHistoryService) {
          await this.tradingHistoryService.logTrade(strategy.userId, {
            type: 'buy',
            strategyId: strategy.id,
            tokenAddress: strategy.tokenAddress,
            symbol: strategy.symbol,
            solAmount: buyAmount,
            tokenAmount: tradeResult.tokensReceived,
            price: tradeResult.actualPrice,
            txHash: tradeResult.txHash,
            slippage: strategy.slippage,
            priceImpact: tradeResult.priceImpact,
            platformFee: tradeResult.platformFee,
            status: 'completed',
            level: nextLevel
          });
        }

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
      this.saveStrategiesToFile();

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
        expectedPrice: currentPrice,
        maxSlippage: strategy.slippage
      });

      if (sellResult.success) {
        sellOrder.status = 'completed';
        sellOrder.solReceived = sellResult.solReceived;
        sellOrder.actualPrice = sellResult.actualPrice;

        // Calculate final performance
        const totalProfit = sellResult.solReceived - strategy.totalInvested;
        const finalProfitPercentage = (totalProfit / strategy.totalInvested) * 100;

        // Log the sell trade
        if (this.tradingHistoryService) {
          await this.tradingHistoryService.logTrade(strategy.userId, {
            type: 'sell',
            strategyId: strategy.id,
            tokenAddress: strategy.tokenAddress,
            symbol: strategy.symbol,
            solAmount: sellResult.solReceived,
            tokenAmount: strategy.totalTokens,
            price: sellResult.actualPrice,
            txHash: sellResult.txHash,
            slippage: strategy.slippage,
            priceImpact: sellResult.priceImpact,
            platformFee: sellResult.platformFee,
            status: 'completed',
            profitTaking: true
          });
        }

        // Increment cycle counter
        strategy.sellCycles = (strategy.sellCycles || 0) + 1;
        strategy.lifetimeProfit = (strategy.lifetimeProfit || 0) + totalProfit;
        strategy.lastCycleProfit = totalProfit;
        strategy.lastCycleProfitPercentage = finalProfitPercentage;
        strategy.lastCycleCompletedAt = new Date();

        // Log cycle completion
        if (this.tradingHistoryService) {
          const duration = new Date().getTime() - strategy.createdAt.getTime();
          await this.tradingHistoryService.logStrategyEvent(strategy.userId, {
            strategyId: strategy.id,
            type: 'cycle_completed',
            cycle: strategy.sellCycles,
            tokenAddress: strategy.tokenAddress,
            symbol: strategy.symbol,
            totalInvested: strategy.totalInvested,
            finalValue: sellResult.solReceived,
            realizedPnL: totalProfit,
            roi: finalProfitPercentage,
            duration: duration,
            tradesCount: strategy.buyOrders.length + 1, // +1 for sell
            maxLevel: strategy.currentLevel
          });
        }

        logger.info(`Strategy ${strategy.id} completed cycle ${strategy.sellCycles}:`, {
          totalInvested: strategy.totalInvested,
          finalValue: sellResult.solReceived,
          profit: totalProfit,
          profitPercentage: finalProfitPercentage,
          lifetimeProfit: strategy.lifetimeProfit
        });

        // Reset strategy state for new cycle (INFINITE MARTINGALE)
        strategy.currentLevel = 0;
        strategy.totalInvested = 0;
        strategy.netInvested = 0;
        strategy.totalTokens = 0;
        strategy.averageBuyPrice = 0;
        strategy.lastBuyPrice = null;
        strategy.highestPrice = null;
        strategy.lowestPrice = null;
        strategy.buyOrders = [];
        strategy.status = 'active'; // Keep strategy active

        this.saveStrategiesToFile();

        // Execute initial buy for new cycle immediately
        logger.info(`Starting cycle ${strategy.sellCycles + 1} for strategy ${strategy.id}`);
        await this.executeInitialBuy(strategy);

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

    // Prevent immediate stop loss - require at least 2 minutes since strategy start
    const timeSinceStart = Date.now() - strategy.createdAt.getTime();
    const minTimeBeforeStopLoss = 2 * 60 * 1000; // 2 minutes
    
    if (timeSinceStart < minTimeBeforeStopLoss) {
      return; // Don't check stop loss for first 2 minutes
    }

    // Get SOL price for proper conversion
    const solPrice = await this.priceService.getSolanaPrice();
    
    // Calculate current USD value and convert to SOL
    const currentUsdValue = strategy.totalTokens * currentPrice;
    const currentSolValue = currentUsdValue / solPrice.price;
    
    // Calculate loss percentage based on net SOL invested (after fees)
    const netInvested = strategy.netInvested || (strategy.totalInvested * 0.99); // Fallback for old strategies (account for 1% fee)
    const lossPercentage = ((netInvested - currentSolValue) / netInvested) * 100;

    logger.info(`Stop loss check for strategy ${strategy.id}:`, {
      totalTokens: strategy.totalTokens,
      tokenPriceUSD: currentPrice,
      currentUsdValue: currentUsdValue,
      solPriceUSD: solPrice.price,
      currentSolValue: currentSolValue,
      totalInvested: strategy.totalInvested,
      netInvested: netInvested,
      lossPercentage: lossPercentage,
      maxLossPercentage: strategy.maxLossPercentage,
      timeSinceStart: timeSinceStart
    });

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
        
        // Log the stop loss sell trade
        if (this.tradingHistoryService) {
          await this.tradingHistoryService.logTrade(strategy.userId, {
            type: 'sell',
            strategyId: strategy.id,
            tokenAddress: strategy.tokenAddress,
            symbol: strategy.symbol,
            solAmount: sellResult.solReceived,
            tokenAmount: strategy.totalTokens,
            price: sellResult.actualPrice,
            txHash: sellResult.txHash,
            slippage: strategy.slippage,
            priceImpact: sellResult.priceImpact,
            platformFee: sellResult.platformFee,
            status: 'completed',
            stopLoss: true
          });
        }
        
        strategy.status = 'stopped';
        strategy.finalLoss = totalLoss;
        strategy.finalLossPercentage = lossPercentage;
        strategy.stoppedAt = new Date();
        strategy.stopReason = 'stop_loss';

        // Log strategy stop loss event
        if (this.tradingHistoryService) {
          const duration = strategy.stoppedAt.getTime() - strategy.createdAt.getTime();
          await this.tradingHistoryService.logStrategyEvent(strategy.userId, {
            strategyId: strategy.id,
            type: 'stopped',
            tokenAddress: strategy.tokenAddress,
            symbol: strategy.symbol,
            totalInvested: strategy.totalInvested,
            finalValue: sellResult.solReceived,
            realizedPnL: -totalLoss,
            roi: -lossPercentage,
            duration: duration,
            tradesCount: strategy.buyOrders.length + 1, // +1 for sell
            maxLevel: strategy.currentLevel,
            stopReason: 'stop_loss'
          });
        }

        await this.stopStrategyMonitoring(strategy.id);
        this.saveStrategiesToFile();

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
   * REAL TRADING METHODS (Jupiter DEX Integration)
   */

  async executeMarketBuy(userId, { tokenAddress, solAmount, expectedPrice, maxSlippage = 1.0 }) {
    try {
      // Calculate platform fee (1% of transaction)
      const feeCalculation = this.revenueService.calculateTransactionFee(solAmount);
      
      logger.info(`Martingale buy with fee for user ${userId}:`, {
        originalAmount: solAmount,
        feeAmount: feeCalculation.feeAmount,
        netAmount: feeCalculation.netAmount
      });
      
      if (!this.tradingService) {
        throw new Error('Trading service not available');
      }
      
      // Execute real Jupiter swap
      const jupiterResult = await this.tradingService.executeBuy(userId, {
        tokenAddress: tokenAddress,
        solAmount: feeCalculation.netAmount,
        maxSlippage: maxSlippage
      });
      
      if (jupiterResult.success) {
        // Record revenue only on successful real trade
        await this.revenueService.recordRevenue(userId, jupiterResult.platformFee || feeCalculation.feeAmount);
        
        logger.info(`Jupiter buy completed for user ${userId}:`, {
          txHash: jupiterResult.txHash,
          solSpent: jupiterResult.solSpent,
          tokensReceived: jupiterResult.tokensReceived,
          actualPrice: jupiterResult.actualPrice,
          priceImpact: jupiterResult.priceImpact,
          platformFeeRecorded: jupiterResult.platformFee || feeCalculation.feeAmount
        });
        
        return {
          success: true,
          tokensReceived: jupiterResult.tokensReceived,
          actualPrice: jupiterResult.actualPrice,
          txHash: jupiterResult.txHash,
          platformFee: jupiterResult.platformFee || feeCalculation.feeAmount,
          feePercentage: feeCalculation.feePercentage,
          priceImpact: jupiterResult.priceImpact
        };
      } else {
        throw new Error(jupiterResult.error || 'Jupiter swap failed');
      }
      
    } catch (error) {
      logger.error('Error executing market buy with Jupiter:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeMarketSell(userId, { tokenAddress, tokenAmount, expectedPrice, maxSlippage = 1.0 }) {
    try {
      if (!this.tradingService) {
        throw new Error('Trading service not available');
      }
      
      // Execute real Jupiter sell swap
      const jupiterResult = await this.tradingService.executeSell(userId, {
        tokenAddress: tokenAddress,
        tokenAmount: tokenAmount,
        maxSlippage: maxSlippage
      });
      
      if (jupiterResult.success) {
        // Record revenue only on successful real trade (fee already collected by JupiterTradingService)
        await this.revenueService.recordRevenue(userId, jupiterResult.platformFee);
        
        logger.info(`Jupiter sell completed for user ${userId}:`, {
          txHash: jupiterResult.txHash,
          tokensSold: jupiterResult.tokensSold,
          grossSolReceived: jupiterResult.grossSolReceived,
          platformFee: jupiterResult.platformFee,
          netSolReceived: jupiterResult.solReceived,
          priceImpact: jupiterResult.priceImpact,
          platformFeeRecorded: jupiterResult.platformFee
        });
        
        return {
          success: true,
          solReceived: jupiterResult.solReceived, // Already net amount after platform fee
          actualPrice: jupiterResult.actualPrice,
          txHash: jupiterResult.txHash,
          platformFee: jupiterResult.platformFee,
          feePercentage: (jupiterResult.platformFee / jupiterResult.grossSolReceived) * 100,
          priceImpact: jupiterResult.priceImpact
        };
      } else {
        throw new Error(jupiterResult.error || 'Jupiter sell failed');
      }
      
    } catch (error) {
      logger.error('Error executing market sell with Jupiter:', error);
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
    // Ensure userId is string for consistency
    userId = String(userId);
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
    if (monitor && monitor.interval) {
      clearInterval(monitor.interval);
      this.strategyMonitors.delete(strategyId);
      
      const strategy = this.getStrategy(strategyId);
      if (strategy) {
        strategy.isMonitoring = false;
      }
      
      logger.info(`Stopped monitoring strategy ${strategyId}`);
    }
  }

  /**
   * Pause strategy - now deletes strategy and saves to history
   */
  async pauseStrategy(strategyId) {
    const strategy = this.getStrategy(strategyId);
    if (!strategy) return false;
    
    if (strategy.status === 'active') {
      // Stop monitoring first
      await this.stopStrategyMonitoring(strategyId);
      
      // Mark as paused and set timestamp
      strategy.status = 'paused';
      strategy.pausedAt = new Date();
      strategy.pauseReason = 'user_action';
      
      // Log to history if available
      if (this.tradingHistoryService) {
        const duration = strategy.pausedAt.getTime() - strategy.createdAt.getTime();
        await this.tradingHistoryService.logStrategyEvent(strategy.userId, {
          strategyId: strategy.id,
          type: 'paused',
          tokenAddress: strategy.tokenAddress,
          symbol: strategy.symbol,
          totalInvested: strategy.totalInvested,
          currentValue: strategy.totalTokens * (strategy.averageBuyPrice || 0),
          duration: duration,
          tradesCount: strategy.buyOrders.length,
          maxLevel: strategy.currentLevel,
          pauseReason: 'user_action'
        });
      }
      
      // Remove from active strategies (delete it)
      const userId = String(strategy.userId);
      const userStrategies = this.activeStrategies.get(userId);
      if (userStrategies) {
        const index = userStrategies.findIndex(s => s.id === strategyId);
        if (index !== -1) {
          userStrategies.splice(index, 1);
          
          // Clean up empty user arrays
          if (userStrategies.length === 0) {
            this.activeStrategies.delete(userId);
          }
        }
      }
      
      this.saveStrategiesToFile();
      
      logger.info(`Strategy ${strategyId} paused and removed from active list`, {
        userId: strategy.userId,
        totalInvested: strategy.totalInvested,
        totalTokens: strategy.totalTokens
      });
      
      return true;
    }
    return false;
  }

  resumeStrategy(strategyId) {
    const strategy = this.getStrategy(strategyId);
    if (strategy && strategy.status === 'paused') {
      strategy.status = 'active';
      this.saveStrategiesToFile();
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