const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class AnalyticsService {
  constructor(walletService, martingaleService, heroService, revenueService, gridService = null) {
    this.walletService = walletService;
    this.martingaleService = martingaleService;
    this.heroService = heroService;
    this.revenueService = revenueService;
    this.gridService = gridService;
    
    // File persistence for user activity tracking
    this.userActivityPath = path.join(__dirname, '../../data/user_activity.json');
    this.userActivity = new Map(); // userId -> { firstSeen, lastSeen, actions }
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.userActivityPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load user activity from file
    this.loadUserActivityFromFile();
  }
  
  loadUserActivityFromFile() {
    try {
      if (fs.existsSync(this.userActivityPath)) {
        const data = fs.readFileSync(this.userActivityPath, 'utf8');
        const activityData = JSON.parse(data);
        
        Object.entries(activityData).forEach(([userId, activity]) => {
          this.userActivity.set(userId, {
            firstSeen: new Date(activity.firstSeen),
            lastSeen: new Date(activity.lastSeen),
            actions: activity.actions || []
          });
        });
        
        logger.info(`Loaded ${this.userActivity.size} user activity records from storage`);
      }
    } catch (error) {
      logger.error('Failed to load user activity:', error);
    }
  }
  
  saveUserActivityToFile() {
    try {
      const activityObject = {};
      this.userActivity.forEach((activity, userId) => {
        activityObject[userId] = activity;
      });
      
      fs.writeFileSync(this.userActivityPath, JSON.stringify(activityObject, null, 2), 'utf8');
    } catch (error) {
      logger.error('Failed to save user activity:', error);
    }
  }
  
  /**
   * Track user activity
   */
  trackUserActivity(userId, actionType) {
    userId = String(userId);
    
    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, {
        firstSeen: new Date(),
        lastSeen: new Date(),
        actions: []
      });
    }
    
    const activity = this.userActivity.get(userId);
    activity.lastSeen = new Date();
    activity.actions.push({
      type: actionType,
      timestamp: new Date()
    });
    
    // Keep only last 100 actions per user to prevent bloat
    if (activity.actions.length > 100) {
      activity.actions = activity.actions.slice(-100);
    }
    
    this.saveUserActivityToFile();
  }
  
  /**
   * Get active users in time period
   */
  getActiveUsers(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let activeCount = 0;
    this.userActivity.forEach((activity) => {
      if (activity.lastSeen >= cutoffDate) {
        activeCount++;
      }
    });
    
    return activeCount;
  }
  
  /**
   * Get new users in time period
   */
  getNewUsers(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let newCount = 0;
    this.userActivity.forEach((activity) => {
      if (activity.firstSeen >= cutoffDate) {
        newCount++;
      }
    });
    
    return newCount;
  }
  
  /**
   * Get total strategies launched
   */
  getTotalStrategiesLaunched() {
    let total = 0;
    
    // Count Martingale strategies
    if (this.martingaleService && this.martingaleService.activeStrategies) {
      this.martingaleService.activeStrategies.forEach((strategies) => {
        total += strategies.length;
      });
    }
    
    // Count Grid strategies
    if (this.gridService && this.gridService.activeGrids) {
      this.gridService.activeGrids.forEach((userData) => {
        if (userData.grids) {
          total += userData.grids.size;
        }
      });
    }
    
    return total;
  }
  
  /**
   * Get active strategies count
   */
  getActiveStrategiesCount() {
    let active = 0;
    
    // Count active Martingale strategies
    if (this.martingaleService && this.martingaleService.activeStrategies) {
      this.martingaleService.activeStrategies.forEach((strategies) => {
        active += strategies.filter(s => s.status === 'active').length;
      });
    }
    
    // Count active Grid strategies
    if (this.gridService && this.gridService.activeGrids) {
      this.gridService.activeGrids.forEach((userData) => {
        if (userData.grids) {
          userData.grids.forEach((grid) => {
            if (grid.status === 'active') {
              active++;
            }
          });
        }
      });
    }
    
    return active;
  }
  
  /**
   * Get total trading volume (SOL)
   */
  getTotalTradingVolume() {
    let totalVolume = 0;
    
    // Add Martingale volume
    if (this.martingaleService && this.martingaleService.activeStrategies) {
      this.martingaleService.activeStrategies.forEach((strategies) => {
        strategies.forEach(strategy => {
          totalVolume += strategy.totalInvested || 0;
        });
      });
    }
    
    // Add Grid volume
    if (this.gridService && this.gridService.activeGrids) {
      this.gridService.activeGrids.forEach((userData) => {
        if (userData.grids) {
          userData.grids.forEach((grid) => {
            totalVolume += grid.initialAmount || 0;
          });
        }
      });
    }
    
    return totalVolume;
  }
  
  /**
   * Get total battles fought
   */
  getTotalBattles() {
    let totalBattles = 0;
    
    if (this.heroService && this.heroService.heroes) {
      this.heroService.heroes.forEach((hero) => {
        totalBattles += hero.stats?.totalBattles || 0;
      });
    }
    
    return totalBattles;
  }
  
  /**
   * Get platform fees collected in time period
   */
  getPlatformFees(days = 7) {
    if (!this.revenueService) {
      return 0;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Get all revenue records from the service
    const allRevenue = this.revenueService.getAllRevenue();
    let totalFees = 0;
    
    allRevenue.forEach(record => {
      const recordDate = new Date(record.timestamp);
      if (recordDate >= cutoffDate) {
        totalFees += record.feeAmount || 0;
      }
    });
    
    return totalFees;
  }
  
  /**
   * Get comprehensive dashboard data
   */
  getDashboardData() {
    const data = {
      userEngagement: {
        activeUsers7d: this.getActiveUsers(7),
        activeUsers30d: this.getActiveUsers(30),
        newUsers7d: this.getNewUsers(7),
        newUsers30d: this.getNewUsers(30)
      },
      tradingActivity: {
        totalStrategiesLaunched: this.getTotalStrategiesLaunched(),
        activeStrategies: this.getActiveStrategiesCount(),
        totalVolume: this.getTotalTradingVolume()
      },
      battleActivity: {
        totalBattles: this.getTotalBattles()
      },
      revenue: {
        fees7d: this.getPlatformFees(7),
        fees30d: this.getPlatformFees(30)
      },
      generatedAt: new Date()
    };
    
    return data;
  }
}

module.exports = AnalyticsService;
