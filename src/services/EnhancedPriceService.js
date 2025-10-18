const axios = require('axios');
const logger = require('../utils/logger');

class EnhancedPriceService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds cache for token prices
    this.solCacheTimeout = 60000; // 1 minute cache for SOL price
    
    // Well-known token addresses on Solana
    this.knownTokens = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      // Add more as needed
    };
  }

  /**
   * Get SOL price from CoinGecko (most reliable for major tokens)
   */
  async getSolanaPrice() {
    const cacheKey = 'solana-price';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.solCacheTimeout) {
      return cached.data;
    }

    try {
      // Try CoinGecko Pro API first (includes 1h change)
      let response;
      try {
        response = await axios.get(
          'https://pro-api.coingecko.com/api/v3/simple/price',
          {
            params: {
              ids: 'solana',
              vs_currencies: 'usd',
              include_24hr_change: true,
              include_1h_change: true
            },
            headers: {
              'X-Cg-Pro-Api-Key': process.env.COINGECKO_API_KEY || ''
            },
            timeout: 10000
          }
        );
      } catch (proError) {
        // Fallback to free API (no 1h change)
        response = await axios.get(
          'https://api.coingecko.com/api/v3/simple/price',
          {
            params: {
              ids: 'solana',
              vs_currencies: 'usd',
              include_24hr_change: true
            },
            timeout: 10000
          }
        );
      }

      const data = response.data.solana;
      const priceData = {
        price: data.usd,
        change1h: data.usd_1h_change || 0,  // Will be 0 for free API
        change24h: data.usd_24h_change || 0,
        timestamp: Date.now(),
        source: 'coingecko'
      };

      this.cache.set(cacheKey, {
        data: priceData,
        timestamp: Date.now()
      });

      logger.info('Fetched SOL price from CoinGecko', priceData);
      return priceData;

    } catch (error) {
      logger.error('Failed to fetch SOL price from CoinGecko:', error.message);
      return this.getFallbackPrice();
    }
  }

  /**
   * Get token price from Jupiter (best for new/small tokens)
   */
  async getTokenPriceFromJupiter(tokenAddress) {
    const cacheKey = `jupiter-${tokenAddress}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Jupiter Price API v2
      const response = await axios.get(
        `https://price.jup.ag/v4/price`,
        {
          params: {
            ids: tokenAddress
          },
          timeout: 10000
        }
      );

      if (!response.data.data[tokenAddress]) {
        throw new Error('Token not found on Jupiter');
      }

      const tokenData = response.data.data[tokenAddress];
      const priceData = {
        price: tokenData.price,
        change24h: 0, // Jupiter doesn't provide 24h change
        change1h: 0,  // Jupiter doesn't provide 1h change
        timestamp: Date.now(),
        source: 'jupiter',
        address: tokenAddress
      };

      this.cache.set(cacheKey, {
        data: priceData,
        timestamp: Date.now()
      });

      logger.info(`Fetched token price from Jupiter: ${tokenAddress}`, priceData);
      return priceData;

    } catch (error) {
      logger.error(`Failed to fetch token price from Jupiter (${tokenAddress}):`, error.message);
      throw error;
    }
  }

  /**
   * Get token price from CoinGecko (best for established tokens)
   */
  async getTokenPriceFromCoinGecko(tokenAddress) {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/token_price/solana',
        {
          params: {
            contract_addresses: tokenAddress,
            vs_currencies: 'usd',
            include_24hr_change: true
          },
          timeout: 10000
        }
      );

      const tokenData = response.data[tokenAddress.toLowerCase()];
      if (!tokenData) {
        throw new Error('Token not found on CoinGecko');
      }

      const priceData = {
        price: tokenData.usd,
        change24h: tokenData.usd_24h_change || 0,
        change1h: 0, // CoinGecko free tier doesn't include 1h change
        timestamp: Date.now(),
        source: 'coingecko',
        address: tokenAddress
      };

      logger.info(`Fetched token price from CoinGecko: ${tokenAddress}`, priceData);
      return priceData;

    } catch (error) {
      logger.error(`Failed to fetch token price from CoinGecko (${tokenAddress}):`, error.message);
      throw error;
    }
  }

  /**
   * Smart token price fetching (tries multiple sources)
   */
  async getTokenPrice(tokenAddress) {
    // Handle SOL specifically
    if (tokenAddress === 'SOL' || tokenAddress === this.knownTokens.SOL) {
      return await this.getSolanaPrice();
    }

    // Try CoinGecko first for established tokens, then Jupiter
    try {
      return await this.getTokenPriceFromCoinGecko(tokenAddress);
    } catch (error) {
      logger.warn(`CoinGecko failed for ${tokenAddress}, trying Jupiter...`);
      try {
        return await this.getTokenPriceFromJupiter(tokenAddress);
      } catch (jupiterError) {
        logger.error(`Both CoinGecko and Jupiter failed for ${tokenAddress}`);
        throw new Error(`Unable to fetch price for token: ${tokenAddress}`);
      }
    }
  }

  /**
   * Get token info from Jupiter (includes metadata)
   */
  async getTokenInfo(tokenAddress) {
    try {
      const response = await axios.get(
        `https://token.jup.ag/strict`,
        { timeout: 10000 }
      );

      const token = response.data.find(t => t.address === tokenAddress);
      return token || null;

    } catch (error) {
      logger.error('Failed to fetch token info from Jupiter:', error.message);
      return null;
    }
  }

  /**
   * Format price change with emojis
   */
  formatPriceChange(change) {
    const sign = change >= 0 ? '+' : '';
    const emoji = change >= 0 ? '🟢' : '🔴';
    return `${emoji} ${sign}${change.toFixed(2)}%`;
  }

  /**
   * Format price display
   */
  formatPrice(price) {
    if (price === 0) return '$0.00000000';
    if (price < 0.00000001) return `$${price.toExponential(2)}`;
    return `$${price.toFixed(8)}`;
  }

  /**
   * Fallback price data
   */
  getFallbackPrice() {
    const cached = this.cache.get('solana-price');
    if (cached) {
      logger.warn('Using cached SOL price data');
      return cached.data;
    }

    return {
      price: 0,
      change1h: 0,
      change24h: 0,
      timestamp: Date.now(),
      error: true,
      source: 'fallback'
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Price cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      entries: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

module.exports = EnhancedPriceService;