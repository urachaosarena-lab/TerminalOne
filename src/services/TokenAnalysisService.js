const axios = require('axios');
const logger = require('../utils/logger');

class TokenAnalysisService {
  constructor(priceService) {
    this.priceService = priceService;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
  }

  /**
   * Comprehensive token analysis for Martingale strategy
   */
  async analyzeToken(tokenInput) {
    try {
      // Resolve token address from input (ticker or address)
      const tokenAddress = await this.resolveTokenAddress(tokenInput);
      if (!tokenAddress) {
        throw new Error(`Token not found: ${tokenInput}`);
      }

      // Check cache first
      const cacheKey = `analysis_${tokenAddress}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      // Gather comprehensive token data
      const [basicInfo, priceData, volumeData, liquidityData, volatilityData] = await Promise.all([
        this.getTokenBasicInfo(tokenAddress),
        this.getCurrentPriceData(tokenAddress),
        this.getVolumeData(tokenAddress),
        this.getLiquidityData(tokenAddress),
        this.getVolatilityData(tokenAddress)
      ]);

      // Calculate Martingale suitability score
      const suitabilityScore = this.calculateMartingaleSuitability({
        volatility: volatilityData,
        liquidity: liquidityData,
        volume: volumeData,
        priceData
      });

      const analysis = {
        tokenAddress,
        symbol: basicInfo.symbol,
        name: basicInfo.name,
        
        // Price information
        currentPrice: priceData.price,
        priceChange1h: priceData.change1h,
        priceChange24h: priceData.change24h,
        
        // Volume data
        volume24h: volumeData.volume24h,
        volumeChange24h: volumeData.volumeChange24h,
        
        // Liquidity data
        liquidity: liquidityData.total,
        marketCap: liquidityData.marketCap,
        
        // Volatility metrics
        volatility1h: volatilityData.volatility1h,
        volatility24h: volatilityData.volatility24h,
        volatility7d: volatilityData.volatility7d,
        
        // Martingale-specific metrics
        suitabilityScore: suitabilityScore.score,
        suitabilityRating: suitabilityScore.rating,
        riskLevel: suitabilityScore.riskLevel,
        recommendations: suitabilityScore.recommendations,
        
        // Risk warnings
        warnings: this.generateWarnings(tokenAddress, basicInfo, liquidityData, volatilityData),
        
        timestamp: new Date()
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: analysis,
        timestamp: Date.now()
      });

      logger.info(`Token analysis completed for ${basicInfo.symbol}:`, {
        price: analysis.currentPrice,
        volatility24h: analysis.volatility24h,
        suitabilityScore: analysis.suitabilityScore
      });

      return analysis;

    } catch (error) {
      logger.error(`Token analysis failed for ${tokenInput}:`, error);
      throw error;
    }
  }

  /**
   * Resolve token address from ticker or address
   */
  async resolveTokenAddress(tokenInput) {
    // If it's already an address (43-44 characters), validate and return it
    if (tokenInput.length >= 43 && tokenInput.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tokenInput)) {
      // For direct addresses, assume they're valid and return immediately
      logger.info(`Using direct token address: ${tokenInput}`);
      return tokenInput;
    }

    // Try multiple sources to find by symbol
    const sources = [
      {
        name: 'Jupiter All Tokens',
        url: 'https://token.jup.ag/all',
        timeout: 8000
      },
      {
        name: 'Jupiter Strict List',
        url: 'https://token.jup.ag/strict',
        timeout: 5000
      }
    ];

    for (const source of sources) {
      try {
        logger.info(`Trying to resolve ${tokenInput} using ${source.name}`);
        const response = await axios.get(source.url, { 
          timeout: source.timeout,
          headers: {
            'User-Agent': 'TerminalOne-Bot/1.0'
          }
        });
        
        const token = response.data.find(t => 
          t.symbol && t.symbol.toLowerCase() === tokenInput.toLowerCase()
        );
        
        if (token) {
          logger.info(`Resolved ${tokenInput} to address: ${token.address} via ${source.name}`);
          return token.address;
        }
        
      } catch (error) {
        logger.warn(`Failed to resolve via ${source.name}:`, error.message);
        continue; // Try next source
      }
    }

    // If symbol resolution failed, try some common token mappings
    const commonTokens = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      'WIF': 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      'PEPE': '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
    };

    const upperInput = tokenInput.toUpperCase();
    if (commonTokens[upperInput]) {
      logger.info(`Found ${tokenInput} in common tokens list: ${commonTokens[upperInput]}`);
      return commonTokens[upperInput];
    }

    logger.warn(`Token ${tokenInput} not found in any source`);
    return null;
  }

  /**
   * Get basic token information
   */
  async getTokenBasicInfo(tokenAddress) {
    const sources = [
      {
        name: 'Jupiter All',
        fetch: async () => {
          const response = await axios.get('https://token.jup.ag/all', { 
            timeout: 5000,
            headers: { 'User-Agent': 'TerminalOne-Bot/1.0' }
          });
          const token = response.data.find(t => t.address === tokenAddress);
          return token ? {
            symbol: token.symbol || 'UNKNOWN',
            name: token.name || 'Unknown Token',
            decimals: token.decimals || 9,
            logoURI: token.logoURI
          } : null;
        }
      },
      {
        name: 'Jupiter Strict',
        fetch: async () => {
          const response = await axios.get('https://token.jup.ag/strict', { 
            timeout: 3000,
            headers: { 'User-Agent': 'TerminalOne-Bot/1.0' }
          });
          const token = response.data.find(t => t.address === tokenAddress);
          return token ? {
            symbol: token.symbol || 'UNKNOWN',
            name: token.name || 'Unknown Token',
            decimals: token.decimals || 9,
            logoURI: token.logoURI
          } : null;
        }
      },
      {
        name: 'Birdeye',
        fetch: async () => {
          const response = await axios.get(`https://public-api.birdeye.so/defi/token_overview`, {
            params: { address: tokenAddress },
            timeout: 8000,
            headers: { 'User-Agent': 'TerminalOne-Bot/1.0' }
          });
          
          if (response.data.success && response.data.data) {
            const data = response.data.data;
            return {
              symbol: data.symbol || 'UNKNOWN',
              name: data.name || 'Unknown Token',
              decimals: data.decimals || 9,
              logoURI: data.logoURI
            };
          }
          return null;
        }
      }
    ];

    // Try each source in order
    for (const source of sources) {
      try {
        logger.info(`Fetching token info for ${tokenAddress} from ${source.name}`);
        const result = await source.fetch();
        if (result && result.symbol !== 'UNKNOWN') {
          logger.info(`Got token info from ${source.name}: ${result.symbol}`);
          return result;
        }
      } catch (error) {
        logger.warn(`Failed to get token info from ${source.name}:`, error.message);
        continue;
      }
    }

    // If all sources fail, return basic info
    logger.warn(`All sources failed for token ${tokenAddress}, using fallback info`);
    return {
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 9,
      logoURI: null
    };
  }

  /**
   * Get current price data with changes
   */
  async getCurrentPriceData(tokenAddress) {
    try {
      return await this.priceService.getTokenPrice(tokenAddress);
    } catch (error) {
      return {
        price: 0,
        change1h: 0,
        change24h: 0,
        source: 'error'
      };
    }
  }

  /**
   * Get volume data and trends
   */
  async getVolumeData(tokenAddress) {
    // Try DexScreener first (more reliable)
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        {
          timeout: 8000,
          headers: {
            'User-Agent': 'TerminalOne-Bot/1.0'
          }
        }
      );

      if (response.data.pairs && response.data.pairs.length > 0) {
        // Use the pair with highest liquidity
        const bestPair = response.data.pairs.reduce((best, current) => {
          const currentLiquidity = parseFloat(current.liquidity?.usd || 0);
          const bestLiquidity = parseFloat(best.liquidity?.usd || 0);
          return currentLiquidity > bestLiquidity ? current : best;
        });

        return {
          volume24h: parseFloat(bestPair.volume?.h24 || 0),
          volumeChange24h: 0, // DexScreener doesn't provide volume change
          trades24h: parseFloat(bestPair.txns?.h24?.buys || 0) + parseFloat(bestPair.txns?.h24?.sells || 0)
        };
      }
    } catch (error) {
      logger.warn('Failed to get volume data from DexScreener:', error.message);
    }

    // Fallback to Birdeye (may require auth)
    try {
      const response = await axios.get(`https://public-api.birdeye.so/defi/token_overview`, {
        params: { address: tokenAddress },
        timeout: 5000
      });

      if (response.data.success) {
        const data = response.data.data;
        return {
          volume24h: data.v24hUSD || 0,
          volumeChange24h: data.v24hChangePercent || 0,
          trades24h: data.trade24h || 0
        };
      }
    } catch (error) {
      logger.warn('Failed to get volume data from Birdeye:', error.message);
    }

    return {
      volume24h: 0,
      volumeChange24h: 0,
      trades24h: 0
    };
  }

  /**
   * Get liquidity data
   */
  async getLiquidityData(tokenAddress) {
    try {
      const response = await axios.get(`https://public-api.birdeye.so/defi/token_overview`, {
        params: { address: tokenAddress },
        timeout: 5000
      });

      if (response.data.success) {
        const data = response.data.data;
        return {
          total: data.liquidity || 0,
          marketCap: data.mc || 0,
          fdv: data.fdv || 0
        };
      }
    } catch (error) {
      logger.error('Failed to get liquidity data:', error);
    }

    return {
      total: 0,
      marketCap: 0,
      fdv: 0
    };
  }

  /**
   * Calculate volatility metrics
   */
  async getVolatilityData(tokenAddress) {
    try {
      // Get historical price data for volatility calculation
      const response = await axios.get(`https://public-api.birdeye.so/defi/history_price`, {
        params: {
          address: tokenAddress,
          address_type: 'token',
          type: '1H',
          time_from: Math.floor(Date.now() / 1000) - (7 * 24 * 3600), // 7 days
          time_to: Math.floor(Date.now() / 1000)
        },
        timeout: 10000
      });

      if (response.data.success && response.data.data.items.length > 0) {
        const prices = response.data.data.items.map(item => item.value);
        
        return {
          volatility1h: this.calculateVolatility(prices.slice(-1)), // Last hour
          volatility24h: this.calculateVolatility(prices.slice(-24)), // Last 24 hours
          volatility7d: this.calculateVolatility(prices) // Full 7 days
        };
      }
    } catch (error) {
      logger.error('Failed to get volatility data:', error);
    }

    return {
      volatility1h: 0,
      volatility24h: 0,
      volatility7d: 0
    };
  }

  /**
   * Calculate volatility from price array
   */
  calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Return as percentage
  }

  /**
   * Calculate Martingale strategy suitability score
   */
  calculateMartingaleSuitability({ volatility, liquidity, volume, priceData }) {
    let score = 0;
    let recommendations = [];
    let riskLevel = 'LOW';

    // Volatility scoring (ideal: 10-30% daily volatility)
    if (volatility.volatility24h >= 10 && volatility.volatility24h <= 30) {
      score += 25;
      recommendations.push('✅ Good volatility for Martingale');
    } else if (volatility.volatility24h < 10) {
      score += 10;
      recommendations.push('⚠️ Low volatility - fewer opportunities');
    } else {
      score += 5;
      recommendations.push('🚨 High volatility - increased risk');
      riskLevel = 'HIGH';
    }

    // Liquidity scoring
    if (liquidity.total > 1000000) {
      score += 25;
      recommendations.push('✅ Strong liquidity');
    } else if (liquidity.total > 100000) {
      score += 15;
      recommendations.push('⚠️ Moderate liquidity');
    } else {
      score += 5;
      recommendations.push('🚨 Low liquidity - slippage risk');
      riskLevel = 'HIGH';
    }

    // Volume scoring
    if (volume.volume24h > 500000) {
      score += 25;
      recommendations.push('✅ High trading volume');
    } else if (volume.volume24h > 50000) {
      score += 15;
      recommendations.push('⚠️ Moderate volume');
    } else {
      score += 5;
      recommendations.push('🚨 Low volume - exit difficulties');
      if (riskLevel !== 'HIGH') riskLevel = 'MEDIUM';
    }

    // Price stability scoring
    if (Math.abs(priceData.change24h) < 50) {
      score += 25;
      recommendations.push('✅ Reasonable price stability');
    } else {
      score += 10;
      recommendations.push('⚠️ High price volatility');
      riskLevel = 'HIGH';
    }

    // Determine rating
    let rating;
    if (score >= 80) rating = 'EXCELLENT';
    else if (score >= 60) rating = 'GOOD';
    else if (score >= 40) rating = 'FAIR';
    else rating = 'POOR';

    return {
      score,
      rating,
      riskLevel,
      recommendations
    };
  }

  /**
   * Generate risk warnings
   */
  generateWarnings(tokenAddress, basicInfo, liquidityData, volatilityData) {
    const warnings = [];

    // Low liquidity warning
    if (liquidityData.total < 100000) {
      warnings.push('⚠️ Low liquidity may cause high slippage');
    }

    // High volatility warning
    if (volatilityData.volatility24h > 50) {
      warnings.push('🚨 Extreme volatility detected - high risk');
    }

    // Unknown token warning
    if (basicInfo.symbol === 'UNKNOWN') {
      warnings.push('⚠️ Token information incomplete - verify manually');
    }

    // New token warning (basic check)
    if (liquidityData.marketCap < 1000000) {
      warnings.push('🚨 Low market cap - potential rug pull risk');
    }

    return warnings;
  }

  /**
   * Format analysis for display
   */
  formatAnalysisForDisplay(analysis) {
    const formatNumber = (num) => {
      if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
      if (num < 0.00000001) return `$${num.toExponential(2)}`;
      return `$${num.toFixed(8)}`;
    };

    const formatPercentage = (num) => {
      const sign = num >= 0 ? '+' : '';
      const emoji = num >= 0 ? '🟢' : '🔴';
      return `${emoji} ${sign}${num.toFixed(2)}%`;
    };

    // Use the resolved token symbol or show the contract address
    const displaySymbol = analysis.symbol !== 'UNKNOWN' ? analysis.symbol : 
      `${analysis.tokenAddress.slice(0,4)}...${analysis.tokenAddress.slice(-4)}`;
    
    return {
      header: `📊 **${displaySymbol}** Analysis`,
      price: `💰 **Price:** ${formatNumber(analysis.currentPrice)}`,
      changes: `📈 **1H:** ${formatPercentage(analysis.priceChange1h)} | **24H:** ${formatPercentage(analysis.priceChange24h)}`,
      volume: `📊 **Volume 24H:** ${formatNumber(analysis.volume24h)}`,
      liquidity: `💧 **Liquidity:** ${formatNumber(analysis.liquidity)}`,
      volatility: `⚡ **Volatility 24H:** ${analysis.volatility24h.toFixed(1)}%`,
      suitability: `🎯 **Martingale Score:** ${analysis.suitabilityScore}/100 (${analysis.suitabilityRating})`,
      risk: `⚠️ **Risk Level:** ${analysis.riskLevel}`,
      recommendations: analysis.recommendations.join('\n'),
      warnings: analysis.warnings.length > 0 ? analysis.warnings.join('\n') : '✅ No major warnings detected'
    };
  }
}

module.exports = TokenAnalysisService;