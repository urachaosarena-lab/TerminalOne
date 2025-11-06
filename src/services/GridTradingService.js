const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class GridTradingService {
  constructor(jupiterTradingService, enhancedPriceService, walletService) {
    this.jupiterService = jupiterTradingService;
    this.priceService = enhancedPriceService;
    this.walletService = walletService;
    
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
      
      // Get current token price
      const priceData = await this.priceService.getTokenPrice(tokenAddress);
      if (!priceData || !priceData.price) {
        throw new Error('Unable to fetch token price');
      }
      
      const entryPrice = priceData.price;
      
      // Execute initial buy (50% of initial amount)
      const initialBuyAmount = config.initialAmount / 2;
      logger.info(`Grid: Executing initial buy for ${initialBuyAmount} SOL at price ${entryPrice}`, { userId });
      
      const buyResult = await this.jupiterService.executeBuy(userId, {
        tokenAddress,
        solAmount: initialBuyAmount,
        maxSlippage: 3
      });
      
      if (!buyResult.success) {
        throw new Error(`Initial buy failed: ${buyResult.error}`);
      }
      
      // Calculate grid levels
      const buyGrids = this.calculateBuyGrids(entryPrice, config);
      const sellGrids = this.calculateSellGrids(entryPrice, config);
      
      // Create grid state
      const gridId = `grid_${userId}_${Date.now()}`;
      const gridState = {
        gridId,
        tokenAddress,
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
      // Get current price
      const priceData = await this.priceService.getTokenPrice(gridState.tokenAddress);
      const currentPrice = priceData?.price || gridState.entryPrice;
      
      // Count filled sells
      const filledSells = gridState.sellGrids.filter(g => g.filled).length;
      
      // P&L calculation:
      // - Show 0 until first sell is triggered
      // - After first sell, show cumulative P&L from all sells
      const totalPnL = filledSells > 0 ? gridState.cumulativeSellPnL : 0;
      const pnlPercent = filledSells > 0 ? (gridState.cumulativeSellPnL / gridState.initialAmount) * 100 : 0;
      
      // Unrealized value of held tokens at current price
      const unrealizedValue = gridState.tokensHeld * currentPrice;
      
      // Current total value (realized SOL + unrealized token value)
      const currentTotalValue = gridState.totalRealized + unrealizedValue;
      
      return {
        totalInvested: gridState.totalInvested,
        totalRealized: gridState.totalRealized,
        tokensHeld: gridState.tokensHeld,
        currentPrice,
        currentTotalValue, // Total portfolio value (realized + unrealized)
        unrealizedValue, // Value of tokens held
        totalPnL, // Cumulative P&L from sells only (0 until first sell)
        pnlPercent, // P&L as percentage of initial investment
        filledBuys: gridState.buyGrids.filter(g => g.filled).length,
        filledSells,
        totalOrders: gridState.filledOrders.length
      };
    } catch (error) {
      logger.error('P&L calculation failed:', { userId, gridId, error: error.message });
      return null;
    }
  }
}

module.exports = GridTradingService;
