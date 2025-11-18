const axios = require('axios');
const logger = require('../utils/logger');

class EnhancedPriceService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 60 seconds cache for token prices (increased from 30s)
    this.solCacheTimeout = 120000; // 2 minutes cache for SOL price (increased from 1min)
    this.staleTimeout = 300000; // 5 minutes - max age before warning about stale data
    this.maxRetries = 2; // Maximum retry attempts per source
    
    // Well-known token addresses on Solana
    this.knownTokens = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
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
      // Try Jupiter Price API v6 (latest)
      const response = await axios.get(
        `https://price.jup.ag/v6/price`,
        {
          params: {
            ids: tokenAddress
          },
          timeout: 8000,
          headers: {
            'User-Agent': 'TerminalOne-Bot/1.0'
          }
        }
      );

      if (!response.data.data || !response.data.data[tokenAddress]) {
        throw new Error('Token not found on Jupiter');
      }

      const tokenData = response.data.data[tokenAddress];
      const priceData = {
        price: tokenData.price || 0,
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
   * Get token price from DexScreener (very reliable, no auth needed)
   */
  async getTokenPriceFromDexScreener(tokenAddress) {
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

      if (!response.data.pairs || response.data.pairs.length === 0) {
        throw new Error('No pairs found on DexScreener');
      }

      // Find the most liquid pair (highest liquidity)
      const bestPair = response.data.pairs.reduce((best, current) => {
        const currentLiquidity = parseFloat(current.liquidity?.usd || 0);
        const bestLiquidity = parseFloat(best.liquidity?.usd || 0);
        return currentLiquidity > bestLiquidity ? current : best;
      });

      const priceData = {
        price: parseFloat(bestPair.priceUsd || 0),
        change24h: parseFloat(bestPair.priceChange?.h24 || 0),
        change1h: parseFloat(bestPair.priceChange?.h1 || 0),
        timestamp: Date.now(),
        source: 'dexscreener',
        address: tokenAddress,
        liquidity: parseFloat(bestPair.liquidity?.usd || 0)
      };

      logger.info(`Fetched token price from DexScreener: ${tokenAddress}`, priceData);
      return priceData;

    } catch (error) {
      logger.error(`Failed to fetch token price from DexScreener (${tokenAddress}):`, error.message);
      throw error;
    }
  }

  /**
   * Retry helper with exponential backoff
   */
  async retryWithBackoff(fn, retries = this.maxRetries, delay = 1000) {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) throw error;
      logger.debug(`Retrying after ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retries - 1, delay * 2);
    }
  }

  /**
   * Smart token price fetching (tries multiple sources with unified cache and retry logic)
   */
  async getTokenPrice(tokenAddress) {
    // Handle SOL specifically
    if (tokenAddress === 'SOL' || tokenAddress === this.knownTokens.SOL) {
      return await this.getSolanaPrice();
    }

    // Check unified cache first (works across all sources)
    const cacheKey = `price-${tokenAddress}`;
    const cached = this.cache.get(cacheKey);
    
    // Return fresh cached data
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.debug(`Using fresh cached price for ${tokenAddress} from ${cached.data.source}`);
      return cached.data;
    }

    // Warn about stale data but still usable
    if (cached && Date.now() - cached.timestamp < this.staleTimeout) {
      logger.debug(`Cache is stale but recent for ${tokenAddress}, will try to refresh`);
    }

    // Try sources in order of reliability: DexScreener -> Jupiter -> CoinGecko
    const sources = [
      { name: 'DexScreener', fn: () => this.getTokenPriceFromDexScreener(tokenAddress) },
      { name: 'Jupiter', fn: () => this.getTokenPriceFromJupiter(tokenAddress) },
      { name: 'CoinGecko', fn: () => this.getTokenPriceFromCoinGecko(tokenAddress) }
    ];

    for (const source of sources) {
      try {
        logger.info(`Trying ${source.name} for token ${tokenAddress}`);
        // Use retry logic for each source
        const result = await this.retryWithBackoff(source.fn, this.maxRetries, 500);
        if (result && result.price > 0) {
          // Cache the successful result with unified key
          this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
          logger.info(`Successfully fetched and cached price from ${source.name}: $${result.price}`);
          return result;
        }
      } catch (error) {
        logger.warn(`${source.name} failed for ${tokenAddress}: ${error.message}`);
        continue;
      }
    }

    // If all sources fail, check if we have ANY cached data (even expired)
    if (cached) {
      const age = Math.floor((Date.now() - cached.timestamp) / 1000);
      logger.warn(`All sources failed, using ${age}s old cache for ${tokenAddress}`);
      // Mark data as stale
      return {
        ...cached.data,
        stale: true,
        age: age
      };
    }

    // If all sources fail and no cache, return fallback data
    logger.error(`All price sources failed for ${tokenAddress}, no cache available`);
    return {
      price: 0,
      change24h: 0,
      change1h: 0,
      timestamp: Date.now(),
      source: 'error',
      address: tokenAddress,
      error: true
    };
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