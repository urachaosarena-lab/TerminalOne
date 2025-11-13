const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class GridTradingService {
  constructor(jupiterTradingService, enhancedPriceService, walletService, tokenMetadataService = null, notificationService = null) {
    this.jupiterService = jupiterTradingService;
    this.priceService = enhancedPriceService;
    this.walletService = walletService;
    this.tokenMetadataService = tokenMetadataService;
    this.notificationService = notificationService;
    
    // Active grids: userId -> gridId -> gridState
    this.activeGrids = new Map();
    
    // Grid monitoring intervals
    this.monitoringIntervals = new Map();
    
    // Storage path for grid persistence
    this.gridStoragePath = path.join(__dirname, '../../data/grid_strategies.json');
    
    // Default configuration
    this.defaultConfig = {
      initialAmount: 0.10, // SOL
      numBuys: 10,
      numSells: 10,
      dropPercent: 2, // % between buy orders
      leapPercent: 4, // % between sell orders
    };
    
    // Validation limits
    this.limits = {
      initialAmount: { min: 0.04, max: 100 },
      numBuys: { min: 2, max: 50 },
      numSells: { min: 2, max: 50 },
      dropPercent: { min: 0.2, max: 33 },
      leapPercent: { min: 0.2, max: 100 }
    };
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.gridStoragePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load existing grids from file
    this.loadGridsFromFile();
  }
  
  /**
   * Load grids from persistent storage
   */
  loadGridsFromFile() {
    try {
      if (fs.existsSync(this.gridStoragePath)) {
        const data = fs.readFileSync(this.gridStoragePath, 'utf8');
        const gridsData = JSON.parse(data);
        
        // Restore grids to memory
        let activeGridCount = 0;
        Object.entries(gridsData).forEach(([userId, userData]) => {
          const userGrids = new Map();
          
          // Convert dates back from strings
          Object.entries(userData.grids).forEach(([gridId, gridState]) => {
            gridState.createdAt = new Date(gridState.createdAt);
            gridState.lastCheck = new Date(gridState.lastCheck);
            if (gridState.stoppedAt) {
              gridState.stoppedAt = new Date(gridState.stoppedAt);
            }
            
            // Convert filled orders timestamps
            gridState.filledOrders = gridState.filledOrders.map(order => ({
              ...order,
              timestamp: new Date(order.timestamp)
            }));
            
            userGrids.set(gridId, gridState);
            
            // Resume monitoring for active grids
            if (gridState.status === 'active') {
              this.startMonitoring(userId, gridId);
              activeGridCount++;
            }
          });
          
          this.activeGrids.set(userId, {
            config: userData.config,
            grids: userGrids
          });
        });
        
        logger.info(`Loaded ${Object.keys(gridsData).length} user grid data, resumed ${activeGridCount} active grids`);
      } else {
        logger.info('No existing grid data found, starting fresh');
      }
    } catch (error) {
      logger.error('Failed to load grids from file:', error);
    }
  }
  
  /**
   * Save grids to persistent storage
   */
  saveGridsToFile() {
    try {
      // Convert Map to object for JSON storage
      const gridsObject = {};
      this.activeGrids.forEach((userData, userId) => {
        // Convert userId to string for consistent JSON keys
        const userIdStr = String(userId);
        
        const gridsMap = {};
        userData.grids.forEach((gridState, gridId) => {
          gridsMap[gridId] = gridState;
        });
        
        gridsObject[userIdStr] = {
          config: userData.config,
          grids: gridsMap
        };
      });
      
      // Write to file with proper formatting
      fs.writeFileSync(
        this.gridStoragePath,
        JSON.stringify(gridsObject, null, 2),
        'utf8'
      );
      
      logger.debug(`Saved grid data for ${Object.keys(gridsObject).length} users`);
    } catch (error) {
      logger.error('Failed to save grids to file:', error);
    }
  }

  /**
   * Get user's grid configuration or default
   */
  getUserConfig(userId) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    if (!this.activeGrids.has(userId)) {
      this.activeGrids.set(userId, {
        config: { ...this.defaultConfig },
        grids: new Map()
      });
    }
    return this.activeGrids.get(userId).config;
  }

  /**
   * Update user's grid configuration
   */
  updateConfig(userId, configKey, value) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    const config = this.getUserConfig(userId);
    
    // Validate against limits
    if (this.limits[configKey]) {
      const { min, max } = this.limits[configKey];
      if (value < min || value > max) {
        return {
          success: false,
          error: `Value must be between ${min} and ${max}`
        };
      }
    }
    
    config[configKey] = value;
    this.saveGridsToFile(); // Persist config changes
    return { success: true, config };
  }

  /**
   * Launch a new grid trading strategy
   */
  async launchGrid(userId, tokenAddress) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    try {
      const config = this.getUserConfig(userId);
      const walletData = this.walletService.getUserWallet(userId);
      
      if (!walletData) {
        throw new Error('No wallet found');
      }
      
      // Check wallet balance
      const balanceInfo = await this.walletService.getWalletBalance(userId);
      if (!balanceInfo.hasWallet) {
        throw new Error('No wallet found');
      }
      if (balanceInfo.balance < config.initialAmount) {
        throw new Error(`Insufficient balance. Required: ${config.initialAmount} SOL, Available: ${balanceInfo.balance.toFixed(4)} SOL`);
      }
      
      // Pre-fetch token metadata for correct decimal handling
      logger.info(`🔍 Pre-fetching token metadata for ${tokenAddress}...`);
      let tokenMetadata = { symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 6 }; // Default to pump.fun standard
      if (this.tokenMetadataService) {
        try {
          tokenMetadata = await this.tokenMetadataService.getTokenMetadata(tokenAddress, this.walletService.solanaService);
          
          // Validate decimals are reasonable (0-18)
          if (tokenMetadata.decimals < 0 || tokenMetadata.decimals > 18) {
            logger.warn(`⚠️ Invalid decimals ${tokenMetadata.decimals} for ${tokenAddress}, defaulting to 6`);
            tokenMetadata.decimals = 6;
          }
          
          logger.info(`✅ Token metadata verified:`, {
            symbol: tokenMetadata.symbol,
            decimals: tokenMetadata.decimals,
            source: tokenMetadata.source
          });
        } catch (e) {
          logger.error(`❌ Failed to fetch token metadata, using pump.fun default (6 decimals):`, e.message);
          // Keep default of 6 decimals for pump.fun tokens
        }
      }
      
      // Get current token price
      const priceData = await this.priceService.getTokenPrice(tokenAddress);
      if (!priceData || !priceData.price) {
        throw new Error('Unable to fetch token price');
      }
      
      const entryPrice = priceData.price;
      
      // Execute initial buy (50% of initial amount)
      const initialBuyAmount = config.initialAmount / 2;
      logger.info(`Grid: Executing initial buy for ${initialBuyAmount} SOL at price ${entryPrice}`, { userId });
      
      let buyResult;
      try {
        buyResult = await this.jupiterService.executeBuy(userId, {
          tokenAddress,
          solAmount: initialBuyAmount,
          maxSlippage: 3
        });
        
        if (!buyResult.success) {
          throw new Error(buyResult.error);
        }
      } catch (buyError) {
        // 🎯 SOLUTION 4: Enhanced error classification and user-friendly messages
        let userFriendlyError = buyError.message;
        
        if (buyError.message.includes('No routes found') || buyError.message.includes('Unable to get quote')) {
          userFriendlyError = `❌ Token cannot be traded on Jupiter\n\n` +
                             `Possible reasons:\n` +
                             `• Insufficient liquidity in DEX pools\n` +
                             `• Token not indexed on Jupiter\n` +
                             `• Deprecated or broken swap routes\n\n` +
                             `💡 Try a different token with higher liquidity.`;
        } else if (buyError.message.includes('InsufficientFunds') || buyError.message.includes('Insufficient balance')) {
          userFriendlyError = `❌ Insufficient SOL balance\n\n` +
                             `You need at least ${(config.initialAmount + 0.02).toFixed(4)} SOL to launch this grid:\n` +
                             `• ${config.initialAmount.toFixed(4)} SOL for trading\n` +
                             `• 0.02 SOL for transaction fees and rent\n\n` +
                             `💰 Your current balance: ${balanceInfo.balance.toFixed(4)} SOL`;
        } else if (buyError.message.includes('Token account not found') || buyError.message.includes('AccountNotFound')) {
          userFriendlyError = `❌ Token account creation failed\n\n` +
                             `Ensure you have at least 0.015 SOL extra for:\n` +
                             `• Token account rent (~0.002 SOL)\n` +
                             `• Transaction fees\n\n` +
                             `💡 Add more SOL to your wallet and try again.`;
        } else if (buyError.message.includes('429') || buyError.message.includes('rate limit')) {
          userFriendlyError = `❌ Network congestion detected\n\n` +
                             `The Solana network or Jupiter API is experiencing high traffic.\n\n` +
                             `⏳ Please wait 30 seconds and try again.`;
        } else if (buyError.message.includes('timeout')) {
          userFriendlyError = `❌ Transaction timeout\n\n` +
                             `The network took too long to respond.\n\n` +
                             `⏳ Try again in a moment when network is less congested.`;
        }
        
        logger.error('Grid launch failed at initial buy:', {
          userId,
          tokenAddress,
          tokenSymbol: tokenMetadata.symbol,
          error: buyError.message,
          userFriendlyError
        });
        
        throw new Error(userFriendlyError);
      }
      
      // Calculate grid levels
      const buyGrids = this.calculateBuyGrids(entryPrice, config);
      const sellGrids = this.calculateSellGrids(entryPrice, config);
      
      // Use pre-fetched token metadata from earlier validation
      // (already fetched and validated at the start of launchGrid)
      
      // Create grid state
      const gridId = `grid_${userId}_${Date.now()}`;
      const gridState = {
        gridId,
        tokenAddress,
        tokenSymbol: tokenMetadata.symbol,
        tokenName: tokenMetadata.name,
        tokenDecimals: tokenMetadata.decimals,
        status: 'active',
        config: { ...config },
        entryPrice,
        initialAmount: config.initialAmount,
        initialBuyAmount,
        tokensHeld: buyResult.tokensReceived,
        buyGrids: buyGrids.map(price => ({
          price,
          amount: initialBuyAmount / config.numBuys, // SOL per buy
          filled: false,
          fillCount: 0
        })),
        sellGrids: sellGrids.map(price => ({
          price,
          amount: buyResult.tokensReceived / config.numSells, // Tokens per sell
          filled: false,
          fillCount: 0
        })),
        totalInvested: initialBuyAmount,
        totalRealized: 0,
        cumulativeSellPnL: 0, // Track cumulative P&L from sells only
        filledOrders: [],
        createdAt: new Date(),
        lastCheck: new Date()
      };
      
      // Store grid
      if (!this.activeGrids.has(userId)) {
        this.activeGrids.set(userId, { config, grids: new Map() });
      }
      this.activeGrids.get(userId).grids.set(gridId, gridState);
      
      // Persist to file
      this.saveGridsToFile();
      
      // Start monitoring
      this.startMonitoring(userId, gridId);
      
      logger.info(`Grid launched successfully`, { userId, gridId, entryPrice });
      
      return {
        success: true,
        gridId,
        entryPrice,
        tokensReceived: buyResult.tokensReceived,
        tokenMetadata: tokenMetadata,
        buyGrids: gridState.buyGrids.length,
        sellGrids: gridState.sellGrids.length
      };
      
    } catch (error) {
      logger.error('Grid launch failed:', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate buy grid levels
   */
  calculateBuyGrids(entryPrice, config) {
    const grids = [];
    for (let i = 1; i <= config.numBuys; i++) {
      const gridPrice = entryPrice * (1 - (i * config.dropPercent / 100));
      grids.push(gridPrice);
    }
    return grids;
  }

  /**
   * Calculate sell grid levels
   */
  calculateSellGrids(entryPrice, config) {
    const grids = [];
    for (let j = 1; j <= config.numSells; j++) {
      const gridPrice = entryPrice * (1 + (j * config.leapPercent / 100));
      grids.push(gridPrice);
    }
    return grids;
  }

  /**
   * Start monitoring a grid (30s interval)
   */
  startMonitoring(userId, gridId) {
    const intervalKey = `${userId}_${gridId}`;
    
    // Clear existing interval if any
    if (this.monitoringIntervals.has(intervalKey)) {
      clearInterval(this.monitoringIntervals.get(intervalKey));
    }
    
    // Monitor every 30 seconds
    const interval = setInterval(async () => {
      try {
        await this.checkGrid(userId, gridId);
      } catch (error) {
        logger.error('Grid monitoring error:', { userId, gridId, error: error.message });
      }
    }, 30000); // 30 seconds
    
    this.monitoringIntervals.set(intervalKey, interval);
    logger.info(`Grid monitoring started`, { userId, gridId });
  }

  /**
   * Check grid and execute orders if price crosses levels
   */
  async checkGrid(userId, gridId) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    const userGrids = this.activeGrids.get(userId);
    if (!userGrids) return;
    
    const gridState = userGrids.grids.get(gridId);
    if (!gridState || gridState.status !== 'active') return;
    
    try {
      // Get current price
      const priceData = await this.priceService.getTokenPrice(gridState.tokenAddress);
      if (!priceData || !priceData.price) {
        logger.warn('Unable to fetch price for grid check', { userId, gridId });
        return;
      }
      
      const currentPrice = priceData.price;
      gridState.lastCheck = new Date();
      
      // Check if price moved too far (>50%) - regrid if needed
      const priceChangePercent = Math.abs((currentPrice - gridState.entryPrice) / gridState.entryPrice * 100);
      if (priceChangePercent > 50) {
        logger.warn('Price moved >50%, considering re-grid', { userId, gridId, priceChangePercent });
        // TODO: Implement re-gridding logic
      }
      
      // Check buy grids (price went down)
      for (const buyGrid of gridState.buyGrids) {
        if (!buyGrid.filled && currentPrice <= buyGrid.price) {
          await this.executeBuyGrid(userId, gridState, buyGrid, currentPrice);
        }
      }
      
      // Check sell grids (price went up)
      for (const sellGrid of gridState.sellGrids) {
        if (!sellGrid.filled && currentPrice >= sellGrid.price && gridState.tokensHeld >= sellGrid.amount) {
          await this.executeSellGrid(userId, gridState, sellGrid, currentPrice);
        }
      }
      
    } catch (error) {
      logger.error('Grid check failed:', { userId, gridId, error: error.message });
    }
  }

  /**
   * Execute a buy order at grid level
   */
  async executeBuyGrid(userId, gridState, buyGrid, currentPrice) {
    try {
      logger.info('Executing buy grid order', { 
        userId, 
        gridId: gridState.gridId, 
        gridPrice: buyGrid.price,
        currentPrice,
        amount: buyGrid.amount 
      });
      
      const buyResult = await this.jupiterService.executeBuy(userId, {
        tokenAddress: gridState.tokenAddress,
        solAmount: buyGrid.amount,
        maxSlippage: 5 // Higher slippage for grid orders
      });
      
      if (buyResult.success) {
        buyGrid.filled = true;
        buyGrid.fillCount++;
        buyGrid.fillPrice = currentPrice;
        buyGrid.tokensReceived = buyResult.tokensReceived;
        
        gridState.tokensHeld += buyResult.tokensReceived;
        gridState.totalInvested += buyGrid.amount;
        gridState.filledOrders.push({
          type: 'buy',
          gridPrice: buyGrid.price,
          fillPrice: currentPrice,
          amount: buyGrid.amount,
          tokensReceived: buyResult.tokensReceived,
          timestamp: new Date(),
          txHash: buyResult.txHash
        });
        
        logger.info('Buy grid order filled', { 
          userId, 
          gridId: gridState.gridId,
          tokensReceived: buyResult.tokensReceived,
          txHash: buyResult.txHash
        });
        
        // Find and enable next sell grid above this price
        const availableSellGrid = gridState.sellGrids.find(sg => 
          sg.price > currentPrice && sg.fillCount < 2
        );
        if (availableSellGrid) {
          availableSellGrid.filled = false; // Make it available
        }
        
        // Persist grid state changes
        this.saveGridsToFile();
      }
      
    } catch (error) {
      logger.error('Buy grid execution failed:', { 
        userId, 
        gridId: gridState.gridId, 
        error: error.message 
      });
    }
  }

  /**
   * Execute a sell order at grid level
   */
  async executeSellGrid(userId, gridState, sellGrid, currentPrice) {
    try {
      logger.info('Executing sell grid order', { 
        userId, 
        gridId: gridState.gridId, 
        gridPrice: sellGrid.price,
        currentPrice,
        amount: sellGrid.amount 
      });
      
      const sellResult = await this.jupiterService.executeSell(userId, {
        tokenAddress: gridState.tokenAddress,
        tokenAmount: sellGrid.amount,
        maxSlippage: 5
      });
      
      if (sellResult.success) {
        sellGrid.filled = true;
        sellGrid.fillCount++;
        sellGrid.fillPrice = currentPrice;
        sellGrid.solReceived = sellResult.solReceived;
        
        // Calculate cost basis for tokens being sold (average cost)
        const avgCostPerToken = gridState.totalInvested / (gridState.tokensHeld + sellGrid.amount);
        const costOfTokensSold = avgCostPerToken * sellGrid.amount;
        const sellProfit = sellResult.solReceived - costOfTokensSold;
        
        gridState.tokensHeld -= sellGrid.amount;
        gridState.totalRealized += sellResult.solReceived;
        gridState.cumulativeSellPnL += sellProfit; // Add to cumulative P&L
        
        gridState.filledOrders.push({
          type: 'sell',
          gridPrice: sellGrid.price,
          fillPrice: currentPrice,
          amount: sellGrid.amount,
          solReceived: sellResult.solReceived,
          profit: sellProfit, // Track individual sell profit
          timestamp: new Date(),
          txHash: sellResult.txHash
        });
        
        logger.info('Sell grid order filled', { 
          userId, 
          gridId: gridState.gridId,
          solReceived: sellResult.solReceived,
          txHash: sellResult.txHash
        });
        
        // Find and enable next buy grid below this price
        const availableBuyGrid = gridState.buyGrids.find(bg => 
          bg.price < currentPrice && bg.fillCount < 2
        );
        if (availableBuyGrid) {
          availableBuyGrid.filled = false; // Make it available
        }
        
        // Persist grid state changes
        this.saveGridsToFile();
      }
      
    } catch (error) {
      logger.error('Sell grid execution failed:', { 
        userId, 
        gridId: gridState.gridId, 
        error: error.message 
      });
    }
  }

  /**
   * Stop a grid
   */
  async stopGrid(userId, gridId) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    const userGrids = this.activeGrids.get(userId);
    if (!userGrids) {
      return { success: false, error: 'No grids found' };
    }
    
    const gridState = userGrids.grids.get(gridId);
    if (!gridState) {
      return { success: false, error: 'Grid not found' };
    }
    
    // Stop monitoring
    const intervalKey = `${userId}_${gridId}`;
    if (this.monitoringIntervals.has(intervalKey)) {
      clearInterval(this.monitoringIntervals.get(intervalKey));
      this.monitoringIntervals.delete(intervalKey);
    }
    
    gridState.status = 'stopped';
    gridState.stoppedAt = new Date();
    
    // Persist grid state changes
    this.saveGridsToFile();
    
    // Calculate final P&L
    const currentValue = gridState.totalRealized;
    const remainingValue = gridState.tokensHeld * gridState.entryPrice; // Approximate
    const totalValue = currentValue + remainingValue;
    const pnl = totalValue - gridState.totalInvested;
    const pnlPercent = (pnl / gridState.totalInvested) * 100;
    
    logger.info('Grid stopped', { userId, gridId, pnl, pnlPercent });
    
    return {
      success: true,
      gridId,
      pnl,
      pnlPercent,
      totalInvested: gridState.totalInvested,
      totalRealized: gridState.totalRealized,
      tokensHeld: gridState.tokensHeld,
      filledOrders: gridState.filledOrders.length
    };
  }

  /**
   * Get active grids for a user
   */
  getUserActiveGrids(userId) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    const userGrids = this.activeGrids.get(userId);
    if (!userGrids) return [];
    
    return Array.from(userGrids.grids.values())
      .filter(grid => grid.status === 'active');
  }

  /**
   * Get grid details
   */
  getGridDetails(userId, gridId) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    const userGrids = this.activeGrids.get(userId);
    if (!userGrids) return null;
    
    return userGrids.grids.get(gridId);
  }

  /**
   * Calculate current P&L for a grid
   */
  async calculateGridPnL(userId, gridId) {
    // Ensure userId is string for consistency
    userId = String(userId);
    
    const gridState = this.getGridDetails(userId, gridId);
    if (!gridState) return null;
    
    try {
      // Get current token price in USD
      const priceData = await this.priceService.getTokenPrice(gridState.tokenAddress);
      const currentPriceUSD = priceData?.price || gridState.entryPrice;
      
      // Get current SOL price in USD to convert token value to SOL
      const solPriceData = await this.priceService.getTokenPrice('SOL');
      const solPriceUSD = solPriceData?.price || 200;
      
      // Count filled sells
      const filledSells = gridState.sellGrids.filter(g => g.filled).length;
      
      // P&L calculation:
      // - Show 0 until first sell is triggered
      // - After first sell, show cumulative P&L from all sells
      const totalPnL = filledSells > 0 ? gridState.cumulativeSellPnL : 0;
      const pnlPercent = filledSells > 0 ? (gridState.cumulativeSellPnL / gridState.initialAmount) * 100 : 0;
      
      // Unrealized value of held tokens
      const unrealizedValueUSD = gridState.tokensHeld * currentPriceUSD; // Token value in USD
      const unrealizedValueSOL = unrealizedValueUSD / solPriceUSD; // Convert to SOL
      
      // Current total value (realized SOL + unrealized token value in SOL)
      const currentTotalValueSOL = gridState.totalRealized + unrealizedValueSOL;
      const currentTotalValueUSD = currentTotalValueSOL * solPriceUSD;
      
      // SMART CORRECTION for legacy grids created with wrong decimals
      // Detect if tokensHeld is suspiciously high (100x error from wrong decimals)
      let correctedTokensHeld = gridState.tokensHeld;
      let correctionApplied = false;
      
      // Calculate expected tokens based on investment
      const expectedTokens = (gridState.totalInvested * solPriceUSD) / currentPriceUSD;
      const ratio = gridState.tokensHeld / expectedTokens;
      
      // If ratio is ~100 (between 50-150), this is likely a legacy grid with wrong decimals
      // Only apply correction if it makes the value more realistic
      if (ratio > 50 && ratio < 150) {
        const testCorrectedTokens = gridState.tokensHeld / 100;
        const testRatio = testCorrectedTokens / expectedTokens;
        
        // If dividing by 100 brings ratio close to 1, apply correction
        if (testRatio > 0.5 && testRatio < 2.0) {
          correctedTokensHeld = testCorrectedTokens;
          correctionApplied = true;
          logger.warn(`Applied legacy decimal correction to grid ${gridId}: ${gridState.tokensHeld.toFixed(6)} -> ${correctedTokensHeld.toFixed(6)} tokens`);
        }
      }
      
      // Recalculate values with corrected tokens
      const finalUnrealizedValueUSD = correctedTokensHeld * currentPriceUSD;
      const finalUnrealizedValueSOL = finalUnrealizedValueUSD / solPriceUSD;
      const finalCurrentTotalValueSOL = gridState.totalRealized + finalUnrealizedValueSOL;
      const finalCurrentTotalValueUSD = finalCurrentTotalValueSOL * solPriceUSD;
      
      return {
        totalInvested: gridState.totalInvested,
        totalRealized: gridState.totalRealized,
        tokensHeld: correctedTokensHeld, // Use corrected value
        currentPriceUSD, // Token price in USD
        solPriceUSD, // SOL price in USD
        currentTotalValueSOL: finalCurrentTotalValueSOL, // Use corrected value
        currentTotalValueUSD: finalCurrentTotalValueUSD, // Use corrected value
        unrealizedValueSOL: finalUnrealizedValueSOL, // Use corrected value
        unrealizedValueUSD: finalUnrealizedValueUSD, // Use corrected value
        totalPnL, // Cumulative P&L from sells only (0 until first sell)
        pnlPercent, // P&L as percentage of initial investment
        filledBuys: gridState.buyGrids.filter(g => g.filled).length,
        filledSells,
        totalOrders: gridState.filledOrders.length,
        correctionApplied // Flag to indicate if legacy correction was applied
      };
    } catch (error) {
      logger.error('P&L calculation failed:', { userId, gridId, error: error.message });
      return null;
    }
  }
}

module.exports = GridTradingService;
