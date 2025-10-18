const axios = require('axios');
const logger = require('../utils/logger');

class PriceService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
  }

  async getSolanaPrice() {
    const cacheKey = 'solana-price';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Using CoinGecko API (free tier)
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: 'solana',
            vs_currencies: 'usd',
            include_24hr_change: true,
            include_1h_change: true
          },
          timeout: 10000
        }
      );

      const data = response.data.solana;
      const priceData = {
        price: data.usd,
        change1h: data.usd_1h_change || 0,
        change24h: data.usd_24h_change || 0,
        timestamp: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: priceData,
        timestamp: Date.now()
      });

      logger.info('Fetched SOL price data', priceData);
      return priceData;

    } catch (error) {
      logger.error('Failed to fetch SOL price:', error.message);
      
      // Return cached data if available, otherwise default values
      if (cached) {
        logger.warn('Using cached SOL price data');
        return cached.data;
      }

      return {
        price: 0,
        change1h: 0,
        change24h: 0,
        timestamp: Date.now(),
        error: true
      };
    }
  }

  formatPriceChange(change) {
    const sign = change >= 0 ? '+' : '';
    const emoji = change >= 0 ? '🟢' : '🔴';
    return `${emoji} ${sign}${change.toFixed(2)}%`;
  }

  formatPrice(price) {
    if (price === 0) return '$0.00';
    return `$${price.toFixed(2)}`;
  }

  async getTokenPrice(tokenAddress) {
    // Placeholder for future token price fetching
    // Will integrate with Jupiter API or other price sources
    logger.info(`Token price requested for: ${tokenAddress}`);
    throw new Error('Token price fetching not implemented yet');
  }
}

module.exports = PriceService;