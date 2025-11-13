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
    this.decimalsDbPath = path.join(__dirname, '../../data/token_decimals.json');
    this.decimalsDb = new Map(); // Pre-populated decimal database
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.persistentCachePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load decimal database
    this.loadDecimalsDatabase();
    
    // Load cached metadata from disk
    this.loadCacheFromDisk();
  }

  /**
   * 🎯 SOLUTION 5: Detect pump.fun tokens by address pattern
   */
  isPumpFunToken(tokenAddress) {
    // Pump.fun tokens typically have 'pump' in the address suffix
    // or follow specific patterns like ending with 'pump'
    return tokenAddress.toLowerCase().endsWith('pump') || 
           tokenAddress.toLowerCase().includes('pump');
  }
  
  /**
   * Load pre-populated decimals database
   */
  loadDecimalsDatabase() {
    try {
      if (fs.existsSync(this.decimalsDbPath)) {
        const data = fs.readFileSync(this.decimalsDbPath, 'utf8');
        const decimalsData = JSON.parse(data);
        
        Object.entries(decimalsData).forEach(([address, info]) => {
          this.decimalsDb.set(address, info);
        });
        
        logger.info(`Loaded ${this.decimalsDb.size} tokens from decimals database`);
      } else {
        logger.warn('Decimals database not found, will rely on API sources');
      }
    } catch (error) {
      logger.error('Failed to load decimals database:', error);
    }
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
   * Tries multiple sources: DecimalsDB -> Cache -> Jupiter -> DexScreener -> OnChain
   */
  async getTokenMetadata(tokenAddress, solanaService = null) {
    // Check decimals database first (highest priority)
    const dbEntry = this.decimalsDb.get(tokenAddress);
    if (dbEntry) {
      logger.debug(`Using decimals database for ${tokenAddress}: ${dbEntry.decimals} decimals`);
      return {
        symbol: dbEntry.symbol,
        name: dbEntry.symbol, // Use symbol as name for DB entries
        decimals: dbEntry.decimals,
        source: `db-${dbEntry.source}`
      };
    }

    // Check cache second
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

    // Try on-chain first if solanaService available (most reliable for decimals)
    if (solanaService) {
      try {
        logger.debug(`Trying on-chain for token decimals: ${tokenAddress}`);
        const onChainDecimals = await solanaService.getTokenDecimals(tokenAddress);
        
        if (onChainDecimals !== null) {
          // We have reliable decimals, try to get symbol/name from APIs
          let symbol = 'UNKNOWN';
          let name = 'Unknown Token';
          
          for (const source of sources) {
            try {
              const metadata = await source.fn();
              if (metadata && metadata.symbol) {
                symbol = metadata.symbol;
                name = metadata.name || symbol;
                break;
              }
            } catch (error) {
              // Ignore, we already have decimals
            }
          }
          
          const result = {
            symbol,
            name,
            decimals: onChainDecimals,
            source: 'onchain'
          };
          
          // Cache and save
          this.cache.set(tokenAddress, {
            data: result,
            timestamp: Date.now()
          });
          this.saveCacheToDisk();
          
          logger.info(`Fetched metadata with on-chain decimals for ${tokenAddress}:`, result);
          return result;
        }
      } catch (error) {
        logger.warn(`On-chain fetch failed for ${tokenAddress}:`, error.message);
      }
    }

    // Try API sources
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

    // If all sources fail, return default metadata with smart decimals detection
    const isPumpToken = this.isPumpFunToken(tokenAddress);
    const defaultDecimals = isPumpToken ? 6 : 9; // Pump.fun uses 6, standard SPL uses 9
    
    logger.warn(`All metadata sources failed for ${tokenAddress}, using ${isPumpToken ? 'Pump.fun' : 'standard SPL'} default (${defaultDecimals} decimals)`);
    const defaultMetadata = {
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: defaultDecimals,
      source: isPumpToken ? 'pump.fun-detected' : 'default'
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
