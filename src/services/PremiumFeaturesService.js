const logger = require('../utils/logger');

class PremiumFeaturesService {
  constructor(walletService) {
    this.walletService = walletService;
    
    // TerminalOne Premium Token configuration
    this.TERMINAL_TOKEN_ADDRESS = 'TBD'; // Will be set when token is created
    this.TERMINAL_TOKEN_SYMBOL = 'TERM1';
    
    // Premium feature thresholds (in TERM1 tokens)
    this.PREMIUM_TIERS = {
      BASIC: {
        requiredTokens: 0,
        features: [
          'basic_wallet',
          'basic_trading',
          'price_tracking',
          'simple_strategies'
        ]
      },
      
      PREMIUM: {
        requiredTokens: 1000,
        features: [
          'advanced_martingale',
          'multiple_strategies',
          'real_time_alerts',
          'copy_trading',
          'priority_support'
        ]
      },
      
      VIP: {
        requiredTokens: 10000,
        features: [
          'unlimited_strategies',
          'custom_indicators',
          'api_access',
          'early_features',
          'private_signals',
          'personal_support'
        ]
      },
      
      WHALE: {
        requiredTokens: 100000,
        features: [
          'institutional_tools',
          'custom_development',
          'priority_execution',
          'market_maker_access',
          'exclusive_alpha'
        ]
      }
    };

    // Feature access cache
    this.userTierCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Check user's premium tier based on TERM1 token holdings
   */
  async getUserPremiumTier(userId) {
    // Check cache first
    const cacheKey = `tier_${userId}`;
    const cached = this.userTierCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.tier;
    }

    try {
      // Get user's wallet
      const wallet = this.walletService.getUserWallet(userId);
      if (!wallet) {
        return this.PREMIUM_TIERS.BASIC;
      }

      // Check TERM1 token balance (placeholder - implement when token is created)
      const terminalTokenBalance = await this.getTerminalTokenBalance(wallet.publicKey);
      
      // Determine tier based on balance
      let userTier = this.PREMIUM_TIERS.BASIC;
      
      if (terminalTokenBalance >= this.PREMIUM_TIERS.WHALE.requiredTokens) {
        userTier = this.PREMIUM_TIERS.WHALE;
      } else if (terminalTokenBalance >= this.PREMIUM_TIERS.VIP.requiredTokens) {
        userTier = this.PREMIUM_TIERS.VIP;
      } else if (terminalTokenBalance >= this.PREMIUM_TIERS.PREMIUM.requiredTokens) {
        userTier = this.PREMIUM_TIERS.PREMIUM;
      }

      // Cache the result
      this.userTierCache.set(cacheKey, {
        tier: userTier,
        timestamp: Date.now()
      });

      logger.info(`User ${userId} tier: ${userTier === this.PREMIUM_TIERS.WHALE ? 'WHALE' : userTier === this.PREMIUM_TIERS.VIP ? 'VIP' : userTier === this.PREMIUM_TIERS.PREMIUM ? 'PREMIUM' : 'BASIC'}`);
      
      return userTier;

    } catch (error) {
      logger.error(`Error checking premium tier for user ${userId}:`, error);
      return this.PREMIUM_TIERS.BASIC;
    }
  }

  /**
   * Check if user has access to specific feature
   */
  async hasFeatureAccess(userId, featureName) {
    const userTier = await this.getUserPremiumTier(userId);
    return userTier.features.includes(featureName);
  }

  /**
   * Get user's TERM1 token balance
   */
  async getTerminalTokenBalance(walletAddress) {
    try {
      // Placeholder implementation - replace when TERM1 token is created
      // For now, return 0 (everyone starts as BASIC tier)
      
      // In production, this would check the actual token balance:
      // return await this.solanaService.getTokenBalance(walletAddress, this.TERMINAL_TOKEN_ADDRESS);
      
      return 0;
    } catch (error) {
      logger.error('Error fetching TERM1 balance:', error);
      return 0;
    }
  }

  /**
   * Generate premium upgrade message
   */
  generateUpgradeMessage(currentTier, requiredFeature) {
    const tierNames = {
      [this.PREMIUM_TIERS.BASIC]: 'BASIC',
      [this.PREMIUM_TIERS.PREMIUM]: 'PREMIUM',
      [this.PREMIUM_TIERS.VIP]: 'VIP',
      [this.PREMIUM_TIERS.WHALE]: 'WHALE'
    };

    const currentTierName = tierNames[currentTier] || 'BASIC';
    
    // Find which tier includes the required feature
    let requiredTier = null;
    let requiredTierName = '';
    
    for (const [tierName, tier] of Object.entries(this.PREMIUM_TIERS)) {
      if (tier.features.includes(requiredFeature)) {
        requiredTier = tier;
        requiredTierName = tierName;
        break;
      }
    }

    if (!requiredTier) {
      return `🔒 **Premium Feature**\n\nThis feature is not available in your current plan.`;
    }

    return `
🦈 **TerminalOne🦈**

🔒 **Premium Feature Required**

📊 **Current Tier:** ${currentTierName}
🎯 **Required Tier:** ${requiredTierName}
🪙 **TERM1 Needed:** ${requiredTier.requiredTokens.toLocaleString()} tokens

💎 **${requiredTierName} Benefits:**
${requiredTier.features.map(f => `• ${this.getFeatureName(f)}`).join('\n')}

🚀 **How to Upgrade:**
1. Buy TERM1 tokens on Jupiter DEX
2. Hold ${requiredTier.requiredTokens.toLocaleString()} TERM1 in your wallet
3. Access unlocked instantly!

💡 **TERM1 Token:** Coming Soon!
    `;
  }

  /**
   * Get human-readable feature name
   */
  getFeatureName(featureCode) {
    const featureNames = {
      'basic_wallet': 'Basic Wallet Management',
      'basic_trading': 'Basic Trading',
      'price_tracking': 'Price Tracking',
      'simple_strategies': 'Simple Strategies',
      'advanced_martingale': 'Advanced Martingale Strategies',
      'multiple_strategies': 'Multiple Concurrent Strategies',
      'real_time_alerts': 'Real-time Price Alerts',
      'copy_trading': 'Copy Trading',
      'priority_support': 'Priority Customer Support',
      'unlimited_strategies': 'Unlimited Active Strategies',
      'custom_indicators': 'Custom Technical Indicators',
      'api_access': 'API Access',
      'early_features': 'Early Access to New Features',
      'private_signals': 'Private Trading Signals',
      'personal_support': '1-on-1 Personal Support',
      'institutional_tools': 'Institutional Trading Tools',
      'custom_development': 'Custom Feature Development',
      'priority_execution': 'Priority Trade Execution',
      'market_maker_access': 'Market Maker Tools',
      'exclusive_alpha': 'Exclusive Alpha/Research'
    };

    return featureNames[featureCode] || featureCode;
  }

  /**
   * Check premium access and return restriction message if needed
   */
  async checkPremiumAccess(userId, featureName) {
    const userTier = await this.getUserPremiumTier(userId);
    const hasAccess = userTier.features.includes(featureName);

    if (!hasAccess) {
      return {
        hasAccess: false,
        upgradeMessage: this.generateUpgradeMessage(userTier, featureName)
      };
    }

    return {
      hasAccess: true,
      tier: userTier
    };
  }

  /**
   * Get premium feature limits
   */
  getPremiumLimits(tier) {
    const limits = {
      [this.PREMIUM_TIERS.BASIC]: {
        maxStrategies: 1,
        maxAlerts: 3,
        maxCopyTrades: 0,
        analysisRefreshRate: 300 // 5 minutes
      },
      
      [this.PREMIUM_TIERS.PREMIUM]: {
        maxStrategies: 5,
        maxAlerts: 20,
        maxCopyTrades: 3,
        analysisRefreshRate: 60 // 1 minute
      },
      
      [this.PREMIUM_TIERS.VIP]: {
        maxStrategies: 20,
        maxAlerts: 100,
        maxCopyTrades: 10,
        analysisRefreshRate: 30 // 30 seconds
      },
      
      [this.PREMIUM_TIERS.WHALE]: {
        maxStrategies: -1, // unlimited
        maxAlerts: -1, // unlimited
        maxCopyTrades: -1, // unlimited
        analysisRefreshRate: 10 // 10 seconds
      }
    };

    return limits[tier] || limits[this.PREMIUM_TIERS.BASIC];
  }

  /**
   * Clear cache for user (call when user's balance might have changed)
   */
  clearUserCache(userId) {
    this.userTierCache.delete(`tier_${userId}`);
  }

  /**
   * Get premium statistics
   */
  getPremiumStats() {
    const stats = {
      totalUsers: this.userTierCache.size,
      tierDistribution: {
        BASIC: 0,
        PREMIUM: 0,
        VIP: 0,
        WHALE: 0
      }
    };

    for (const [key, cached] of this.userTierCache) {
      const tier = cached.tier;
      if (tier === this.PREMIUM_TIERS.WHALE) stats.tierDistribution.WHALE++;
      else if (tier === this.PREMIUM_TIERS.VIP) stats.tierDistribution.VIP++;
      else if (tier === this.PREMIUM_TIERS.PREMIUM) stats.tierDistribution.PREMIUM++;
      else stats.tierDistribution.BASIC++;
    }

    return stats;
  }
}

module.exports = PremiumFeaturesService;