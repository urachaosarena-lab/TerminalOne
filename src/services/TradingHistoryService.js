const logger = require('../utils/logger');

class TradingHistoryService {
  constructor() {
    // In-memory storage for trading history (should be replaced with database in production)
    this.tradingHistory = new Map(); // userId -> trades[]
    this.strategyHistory = new Map(); // userId -> strategies[]
    this.analytics = new Map(); // userId -> analytics data
  }

  /**
   * Log a trade execution
   */
  async logTrade(userId, tradeData) {
    try {
      const trade = {
        id: this.generateTradeId(),
        userId,
        timestamp: new Date(),
        ...tradeData,
        // Standardized fields
        type: tradeData.type, // 'buy' | 'sell'
        strategyId: tradeData.strategyId,
        tokenAddress: tradeData.tokenAddress,
        symbol: tradeData.symbol,
        
        // Trade amounts
        solAmount: tradeData.solAmount || 0,
        tokenAmount: tradeData.tokenAmount || 0,
        price: tradeData.price,
        
        // Execution details
        txHash: tradeData.txHash,
        slippage: tradeData.slippage,
        priceImpact: tradeData.priceImpact,
        
        // Fees
        platformFee: tradeData.platformFee || 0,
        gasUsed: tradeData.gasUsed || 0,
        
        // Status
        status: tradeData.status || 'completed', // 'pending', 'completed', 'failed'
        error: tradeData.error
      };

      // Store trade
      if (!this.tradingHistory.has(userId)) {
        this.tradingHistory.set(userId, []);
      }
      this.tradingHistory.get(userId).push(trade);
      
      // Update analytics
      await this.updateUserAnalytics(userId, trade);
      
      logger.info(`Trade logged for user ${userId}:`, {
        tradeId: trade.id,
        type: trade.type,
        symbol: trade.symbol,
        amount: trade.type === 'buy' ? trade.solAmount : trade.tokenAmount,
        price: trade.price
      });
      
      return trade;
      
    } catch (error) {
      logger.error(`Error logging trade for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Log strategy lifecycle events
   */
  async logStrategyEvent(userId, eventData) {
    try {
      const event = {
        id: this.generateEventId(),
        userId,
        timestamp: new Date(),
        ...eventData,
        // Standardized fields
        strategyId: eventData.strategyId,
        type: eventData.type, // 'created', 'completed', 'stopped', 'failed'
        tokenAddress: eventData.tokenAddress,
        symbol: eventData.symbol,
        
        // Strategy performance
        totalInvested: eventData.totalInvested || 0,
        finalValue: eventData.finalValue || 0,
        realizedPnL: eventData.realizedPnL || 0,
        unrealizedPnL: eventData.unrealizedPnL || 0,
        roi: eventData.roi || 0,
        
        // Strategy details
        duration: eventData.duration || 0, // in milliseconds
        tradesCount: eventData.tradesCount || 0,
        maxLevel: eventData.maxLevel || 0,
        
        // Configuration
        config: eventData.config || {}
      };

      // Store strategy event
      if (!this.strategyHistory.has(userId)) {
        this.strategyHistory.set(userId, []);
      }
      this.strategyHistory.get(userId).push(event);
      
      logger.info(`Strategy event logged for user ${userId}:`, {
        eventId: event.id,
        strategyId: event.strategyId,
        type: event.type,
        symbol: event.symbol
      });
      
      return event;
      
    } catch (error) {
      logger.error(`Error logging strategy event for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user trading history with filters
   */
  getUserTradingHistory(userId, options = {}) {
    const userTrades = this.tradingHistory.get(userId) || [];
    
    let filteredTrades = [...userTrades];
    
    // Apply filters
    if (options.symbol) {
      filteredTrades = filteredTrades.filter(trade => 
        trade.symbol?.toLowerCase() === options.symbol.toLowerCase()
      );
    }
    
    if (options.type) {
      filteredTrades = filteredTrades.filter(trade => trade.type === options.type);
    }
    
    if (options.strategyId) {
      filteredTrades = filteredTrades.filter(trade => trade.strategyId === options.strategyId);
    }
    
    if (options.dateFrom) {
      filteredTrades = filteredTrades.filter(trade => 
        trade.timestamp >= new Date(options.dateFrom)
      );
    }
    
    if (options.dateTo) {
      filteredTrades = filteredTrades.filter(trade => 
        trade.timestamp <= new Date(options.dateTo)
      );
    }
    
    // Sort by timestamp (newest first)
    filteredTrades.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit results
    const limit = options.limit || 50;
    return filteredTrades.slice(0, limit);
  }

  /**
   * Get user strategy history
   */
  getUserStrategyHistory(userId, options = {}) {
    const userStrategies = this.strategyHistory.get(userId) || [];
    
    let filteredStrategies = [...userStrategies];
    
    // Apply filters
    if (options.symbol) {
      filteredStrategies = filteredStrategies.filter(strategy => 
        strategy.symbol?.toLowerCase() === options.symbol.toLowerCase()
      );
    }
    
    if (options.type) {
      filteredStrategies = filteredStrategies.filter(strategy => strategy.type === options.type);
    }
    
    // Sort by timestamp (newest first)
    filteredStrategies.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit results
    const limit = options.limit || 20;
    return filteredStrategies.slice(0, limit);
  }

  /**
   * Get user analytics
   */
  getUserAnalytics(userId, timeframe = '30d') {
    const analytics = this.analytics.get(userId) || this.getDefaultAnalytics();
    
    // Filter by timeframe if needed
    const cutoffDate = this.getTimeframeCutoff(timeframe);
    const recentTrades = this.getUserTradingHistory(userId, { dateFrom: cutoffDate });
    const recentStrategies = this.getUserStrategyHistory(userId, { dateFrom: cutoffDate });
    
    return {
      ...analytics,
      timeframe: {
        period: timeframe,
        tradesCount: recentTrades.length,
        strategiesCount: recentStrategies.length,
        totalVolume: recentTrades.reduce((sum, trade) => sum + (trade.solAmount || 0), 0),
        averageTradeSize: recentTrades.length > 0 ? 
          recentTrades.reduce((sum, trade) => sum + (trade.solAmount || 0), 0) / recentTrades.length : 0,
        winRate: this.calculateWinRate(recentTrades),
        totalPnL: this.calculateTotalPnL(recentStrategies),
        averageROI: this.calculateAverageROI(recentStrategies)
      }
    };
  }

  /**
   * Update user analytics after each trade
   */
  async updateUserAnalytics(userId, trade) {
    let analytics = this.analytics.get(userId) || this.getDefaultAnalytics();
    
    // Update counters
    analytics.totalTrades++;
    analytics.totalVolume += trade.solAmount || 0;
    analytics.totalFeesPaid += trade.platformFee || 0;
    
    // Update by trade type
    if (trade.type === 'buy') {
      analytics.totalBuys++;
      analytics.totalSolSpent += trade.solAmount || 0;
    } else if (trade.type === 'sell') {
      analytics.totalSells++;
      analytics.totalSolReceived += trade.solAmount || 0;
    }
    
    // Update tokens traded
    if (!analytics.tokensTraded.includes(trade.symbol) && trade.symbol) {
      analytics.tokensTraded.push(trade.symbol);
    }
    
    // Update averages
    analytics.averageTradeSize = analytics.totalVolume / analytics.totalTrades;
    analytics.averageSlippage = ((analytics.averageSlippage * (analytics.totalTrades - 1)) + (trade.slippage || 0)) / analytics.totalTrades;
    
    // Update last activity
    analytics.lastActivity = new Date();
    analytics.firstActivity = analytics.firstActivity || new Date();
    
    this.analytics.set(userId, analytics);
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(userId, timeframe = '7d') {
    const analytics = this.getUserAnalytics(userId, timeframe);
    const trades = this.getUserTradingHistory(userId, { 
      dateFrom: this.getTimeframeCutoff(timeframe) 
    });
    const strategies = this.getUserStrategyHistory(userId, { 
      dateFrom: this.getTimeframeCutoff(timeframe) 
    });
    
    return {
      summary: {
        timeframe,
        totalTrades: trades.length,
        totalStrategies: strategies.length,
        totalVolume: trades.reduce((sum, trade) => sum + (trade.solAmount || 0), 0),
        totalPnL: strategies.reduce((sum, strategy) => sum + (strategy.realizedPnL || 0), 0),
        winRate: this.calculateWinRate(trades),
        averageROI: this.calculateAverageROI(strategies)
      },
      trades,
      strategies,
      analytics
    };
  }

  /**
   * Helper methods
   */
  getDefaultAnalytics() {
    return {
      totalTrades: 0,
      totalBuys: 0,
      totalSells: 0,
      totalVolume: 0,
      totalSolSpent: 0,
      totalSolReceived: 0,
      totalFeesPaid: 0,
      averageTradeSize: 0,
      averageSlippage: 0,
      tokensTraded: [],
      winRate: 0,
      totalPnL: 0,
      bestStrategy: null,
      worstStrategy: null,
      firstActivity: null,
      lastActivity: null
    };
  }

  getTimeframeCutoff(timeframe) {
    const now = new Date();
    switch (timeframe) {
      case '1d':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  calculateWinRate(trades) {
    if (trades.length === 0) return 0;
    
    const profitableTrades = trades.filter(trade => {
      // For buy trades, we can't determine profitability immediately
      // For sell trades, we need to compare with average buy price
      // This is a simplified calculation
      return trade.status === 'completed' && !trade.error;
    });
    
    return (profitableTrades.length / trades.length) * 100;
  }

  calculateTotalPnL(strategies) {
    return strategies.reduce((total, strategy) => {
      return total + (strategy.realizedPnL || 0);
    }, 0);
  }

  calculateAverageROI(strategies) {
    if (strategies.length === 0) return 0;
    
    const totalROI = strategies.reduce((sum, strategy) => sum + (strategy.roi || 0), 0);
    return totalROI / strategies.length;
  }

  generateTradeId() {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateEventId() {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear old data (for memory management)
   */
  cleanup(maxAgeMs = 90 * 24 * 60 * 60 * 1000) { // 90 days default
    const cutoffDate = new Date(Date.now() - maxAgeMs);
    
    for (const [userId, trades] of this.tradingHistory.entries()) {
      const recentTrades = trades.filter(trade => trade.timestamp > cutoffDate);
      if (recentTrades.length !== trades.length) {
        this.tradingHistory.set(userId, recentTrades);
        logger.info(`Cleaned up ${trades.length - recentTrades.length} old trades for user ${userId}`);
      }
    }
    
    for (const [userId, strategies] of this.strategyHistory.entries()) {
      const recentStrategies = strategies.filter(strategy => strategy.timestamp > cutoffDate);
      if (recentStrategies.length !== strategies.length) {
        this.strategyHistory.set(userId, recentStrategies);
        logger.info(`Cleaned up ${strategies.length - recentStrategies.length} old strategy events for user ${userId}`);
      }
    }
  }
}

module.exports = TradingHistoryService;