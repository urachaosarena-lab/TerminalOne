const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class BountyStatsService {
  constructor() {
    this.dataFile = path.join(__dirname, '../../data/bounty-stats.json');
    this.stats = {
      totalFeesCollected: 0, // Total fees collected all-time (SOL)
      totalBountyWins: 0, // Number of times bounty was hit
      currentTick: 0, // Transactions since last bounty win
      lastRollResult: null, // Last 1-400 random number generated
      bountyHistory: [], // Array of {timestamp, userId, amount, tick}
    };
    
    this.initialize();
  }

  /**
   * Initialize and load stats from file
   */
  async initialize() {
    try {
      await this.loadStats();
      logger.info('BountyStatsService initialized');
    } catch (error) {
      logger.error('Error initializing BountyStatsService:', error);
    }
  }

  /**
   * Load stats from persistent storage
   */
  async loadStats() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      this.stats = JSON.parse(data);
      logger.info('Bounty stats loaded from file');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, use default stats
        logger.info('No bounty stats file found, starting fresh');
        await this.saveStats();
      } else {
        logger.error('Error loading bounty stats:', error);
      }
    }
  }

  /**
   * Save stats to persistent storage
   */
  async saveStats() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      // Save stats
      await fs.writeFile(
        this.dataFile,
        JSON.stringify(this.stats, null, 2),
        'utf8'
      );
    } catch (error) {
      logger.error('Error saving bounty stats:', error);
    }
  }

  /**
   * Record a fee collection
   */
  async recordFeeCollection(feeAmount) {
    this.stats.totalFeesCollected += feeAmount;
    await this.saveStats();
  }

  /**
   * Increment transaction tick (called on every transaction)
   */
  async incrementTick() {
    this.stats.currentTick++;
    await this.saveStats();
  }

  /**
   * Record the last roll result
   */
  async recordRollResult(rollResult) {
    this.stats.lastRollResult = rollResult;
    await this.saveStats();
  }

  /**
   * Record a bounty win
   */
  async recordBountyWin(userId, payoutAmount) {
    this.stats.totalBountyWins++;
    this.stats.currentTick = 0; // Reset tick counter
    
    // Add to history
    this.stats.bountyHistory.push({
      timestamp: new Date().toISOString(),
      userId,
      amount: payoutAmount,
      tick: this.stats.currentTick
    });
    
    // Keep only last 100 bounty wins in history
    if (this.stats.bountyHistory.length > 100) {
      this.stats.bountyHistory = this.stats.bountyHistory.slice(-100);
    }
    
    await this.saveStats();
    
    logger.info(`Bounty win recorded: User ${userId} won ${payoutAmount.toFixed(6)} SOL`);
  }

  /**
   * Get all stats
   */
  getStats() {
    return {
      totalFeesCollected: this.stats.totalFeesCollected,
      totalBountyWins: this.stats.totalBountyWins,
      currentTick: this.stats.currentTick,
      lastRollResult: this.stats.lastRollResult,
      bountyHistory: this.stats.bountyHistory.slice(-10) // Last 10 wins
    };
  }

  /**
   * Get current tick count
   */
  getCurrentTick() {
    return this.stats.currentTick;
  }

  /**
   * Get total bounty wins
   */
  getTotalBountyWins() {
    return this.stats.totalBountyWins;
  }

  /**
   * Get total fees collected
   */
  getTotalFeesCollected() {
    return this.stats.totalFeesCollected;
  }

  /**
   * Get last roll result
   */
  getLastRollResult() {
    return this.stats.lastRollResult;
  }

  /**
   * Get bounty win history
   */
  getBountyHistory(limit = 10) {
    return this.stats.bountyHistory.slice(-limit);
  }

  /**
   * Reset stats (admin only - for testing)
   */
  async resetStats() {
    this.stats = {
      totalFeesCollected: 0,
      totalBountyWins: 0,
      currentTick: 0,
      lastRollResult: null,
      bountyHistory: [],
    };
    await this.saveStats();
    logger.warn('Bounty stats have been reset!');
  }
}

module.exports = BountyStatsService;
