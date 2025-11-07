const axios = require('axios');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * TokenMetadataService
 * 
 * Fetches and caches token metadata (symbol, name, decimals)
 * from Jupiter and DexScreener APIs
 */
class TokenMetadataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 3600000; // 1 hour cache for token metadata
    this.persistentCachePath = path.join(__dirname, '../../data/token_metadata_cache.json');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.persistentCachePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load cached metadata from disk
    this.loadCacheFromDisk();
  }

  /**
   * Load metadata cache from disk
   */
  loadCacheFromDisk() {
    try {
      if (fs.existsSync(this.persistentCachePath)) {
        const data = fs.readFileSync(this.persistentCachePath, 'utf8');
        const cached = JSON.parse(data);
        
        Object.entries(cached).forEach(([address, metadata]) => {
          this.cache.set(address, {
            data: metadata,
            timestamp: Date.now() // Reset timestamp on load
          });
        });
        
        logger.info(`Loaded ${this.cache.size} token metadata entries from cache`);
      }
    } catch (error) {
      logger.error('Failed to load token metadata cache:', error);
    }
  }

  /**
   * Save metadata cache to disk
   */
  saveCacheToDisk() {
    try {
      const cacheObject = {};
      this.cache.forEach((value, key) => {
        cacheObject[key] = value.data;
      });
      
      fs.writeFileSync(
        this.persistentCachePath,
        JSON.stringify(cacheObject, null, 2),
        'utf8'
      );
      
      logger.debug(`Saved ${Object.keys(cacheObject).length} token metadata entries to cache`);
    } catch (error) {
      logger.error('Failed to save token metadata cache:', error);
    }
  }

  /**
   * Get token metadata from Jupiter Token List
   */
  async getMetadataFromJupiter(tokenAddress) {
    try {
      const response = await axios.get(
        'https://token.jup.ag/all',
        { 
          timeout: 10000,
          headers: {
            'User-Agent': 'TerminalOne-Bot/1.0'
          }
        }
      );

      const token = response.data.find(t => t.address === tokenAddress);
      
      if (token) {
        return {
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown Token',
          decimals: token.decimals || 9,
          logoURI: token.logoURI,
          source: 'jupiter'
        };
      }
      
      return null;
    } catch (error) {
      logger.warn(`Failed to fetch metadata from Jupiter for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get token metadata from DexScreener
   */
  async getMetadataFromDexScreener(tokenAddress) {
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
        return null;
      }

      // Find the most liquid pair
      const bestPair = response.data.pairs.reduce((best, current) => {
        const currentLiquidity = parseFloat(current.liquidity?.usd || 0);
        const bestLiquidity = parseFloat(best.liquidity?.usd || 0);
        return currentLiquidity > bestLiquidity ? current : best;
      });

      const tokenInfo = bestPair.baseToken?.address === tokenAddress 
        ? bestPair.baseToken 
        : bestPair.quoteToken;

      if (tokenInfo) {
        return {
          symbol: tokenInfo.symbol || 'UNKNOWN',
          name: tokenInfo.name || 'Unknown Token',
          decimals: 9, // DexScreener doesn't provide decimals, use default
          source: 'dexscreener'
        };
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to fetch metadata from DexScreener for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get token metadata from Solana on-chain (fallback)
   */
  async getMetadataFromOnchain(tokenAddress, solanaService) {
    try {
      if (!solanaService) {
        return null;
      }

      const connection = solanaService.connection;
      const { PublicKey } = require('@solana/web3.js');
      const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
      
      const mintPubkey = new PublicKey(tokenAddress);
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      
      if (mintInfo.value && mintInfo.value.data.parsed) {
        const decimals = mintInfo.value.data.parsed.info.decimals;
        
        return {
          symbol: 'UNKNOWN',
          name: 'Unknown Token',
          decimals: decimals,
          source: 'onchain'
        };
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to fetch on-chain metadata for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Smart token metadata fetching
   * Tries multiple sources: Cache -> Jupiter -> DexScreener -> OnChain
   */
  async getTokenMetadata(tokenAddress, solanaService = null) {
    // Check cache first
    const cached = this.cache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.debug(`Using cached metadata for ${tokenAddress}`);
      return cached.data;
    }

    // Try sources in order
    const sources = [
      { name: 'Jupiter', fn: () => this.getMetadataFromJupiter(tokenAddress) },
      { name: 'DexScreener', fn: () => this.getMetadataFromDexScreener(tokenAddress) }
    ];

    // Add on-chain as last resort if solanaService is available
    if (solanaService) {
      sources.push({ 
        name: 'OnChain', 
        fn: () => this.getMetadataFromOnchain(tokenAddress, solanaService) 
      });
    }

    for (const source of sources) {
      try {
        logger.debug(`Trying ${source.name} for token metadata: ${tokenAddress}`);
        const metadata = await source.fn();
        
        if (metadata) {
          // Cache the result
          this.cache.set(tokenAddress, {
            data: metadata,
            timestamp: Date.now()
          });
          
          // Save to disk periodically
          this.saveCacheToDisk();
          
          logger.info(`Fetched metadata from ${source.name} for ${tokenAddress}:`, metadata);
          return metadata;
        }
      } catch (error) {
        logger.warn(`${source.name} failed for ${tokenAddress}:`, error.message);
        continue;
      }
    }

    // If all sources fail, return default metadata
    logger.warn(`All metadata sources failed for ${tokenAddress}, using defaults`);
    const defaultMetadata = {
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 9, // Most Solana tokens use 9 decimals
      source: 'default'
    };

    // Cache the default to avoid repeated lookups
    this.cache.set(tokenAddress, {
      data: defaultMetadata,
      timestamp: Date.now()
    });

    return defaultMetadata;
  }

  /**
   * Format token amount with correct decimals
   */
  formatTokenAmount(amount, decimals) {
    // amount is usually in smallest unit (like lamports)
    // divide by 10^decimals to get human-readable amount
    const divisor = Math.pow(10, decimals);
    return amount / divisor;
  }

  /**
   * Convert human-readable amount to smallest unit
   */
  toSmallestUnit(amount, decimals) {
    const multiplier = Math.pow(10, decimals);
    return Math.floor(amount * multiplier);
  }

  /**
   * Format token display with smart precision
   */
  formatTokenDisplay(amount, decimals, symbol = '') {
    const readableAmount = this.formatTokenAmount(amount, decimals);
    
    // Smart formatting based on magnitude
    let formattedAmount;
    if (readableAmount >= 1000000) {
      formattedAmount = (readableAmount / 1000000).toFixed(2) + 'M';
    } else if (readableAmount >= 1000) {
      formattedAmount = (readableAmount / 1000).toFixed(2) + 'K';
    } else if (readableAmount >= 1) {
      formattedAmount = readableAmount.toFixed(2);
    } else if (readableAmount >= 0.01) {
      formattedAmount = readableAmount.toFixed(4);
    } else if (readableAmount >= 0.0001) {
      formattedAmount = readableAmount.toFixed(6);
    } else {
      formattedAmount = readableAmount.toFixed(8);
    }
    
    return symbol ? `${formattedAmount} ${symbol}` : formattedAmount;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Token metadata cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      entries: this.cache.size,
      addresses: Array.from(this.cache.keys())
    };
  }
}

module.exports = TokenMetadataService;
