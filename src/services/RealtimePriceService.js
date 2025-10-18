const WebSocket = require('ws');
const axios = require('axios');
const logger = require('../utils/logger');

class RealtimePriceService {
  constructor() {
    this.connections = new Map(); // tokenAddress -> WebSocket
    this.priceCallbacks = new Map(); // tokenAddress -> [callbacks]
    this.currentPrices = new Map(); // tokenAddress -> priceData
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    
    // Backup polling for important tokens
    this.backupPolling = new Map();
    this.pollingInterval = 5000; // 5 seconds backup
  }

  /**
   * Subscribe to real-time price updates for a token
   */
  async subscribeToPriceUpdates(tokenAddress, callback) {
    if (!this.priceCallbacks.has(tokenAddress)) {
      this.priceCallbacks.set(tokenAddress, []);
      await this.startRealtimeConnection(tokenAddress);
    }

    this.priceCallbacks.get(tokenAddress).push(callback);
    
    // Send current price if available
    const currentPrice = this.currentPrices.get(tokenAddress);
    if (currentPrice) {
      callback(currentPrice);
    }

    logger.info(`Subscribed to real-time price updates for ${tokenAddress}`);
  }

  /**
   * Start real-time connection for a token
   */
  async startRealtimeConnection(tokenAddress) {
    try {
      // Try Birdeye WebSocket first (most comprehensive)
      await this.connectBirdeyeWebSocket(tokenAddress);
    } catch (error) {
      logger.warn(`Birdeye WebSocket failed for ${tokenAddress}, trying backup polling`);
      await this.startBackupPolling(tokenAddress);
    }
  }

  /**
   * Connect to Birdeye WebSocket (excellent for Solana tokens)
   */
  async connectBirdeyeWebSocket(tokenAddress) {
    const wsUrl = 'wss://public-api.birdeye.so/socket';
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info(`Birdeye WebSocket connected for ${tokenAddress}`);
      
      // Subscribe to price updates
      const subscribeMessage = {
        type: 'SUBSCRIBE_PRICE',
        data: {
          address: tokenAddress,
          type: 'token'
        }
      };
      
      ws.send(JSON.stringify(subscribeMessage));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'PRICE_UPDATE' && message.data.address === tokenAddress) {
          const priceData = {
            price: message.data.value,
            change24h: message.data.change24h || 0,
            change1h: message.data.change1h || 0,
            volume24h: message.data.volume24h || 0,
            timestamp: Date.now(),
            source: 'birdeye_ws'
          };

          this.updatePrice(tokenAddress, priceData);
        }
      } catch (error) {
        logger.error(`Error parsing Birdeye WebSocket message:`, error);
      }
    });

    ws.on('close', () => {
      logger.warn(`Birdeye WebSocket closed for ${tokenAddress}`);
      this.handleReconnection(tokenAddress, 'birdeye');
    });

    ws.on('error', (error) => {
      logger.error(`Birdeye WebSocket error for ${tokenAddress}:`, error);
      ws.close();
    });

    this.connections.set(tokenAddress, ws);
  }

  /**
   * Backup high-frequency polling (5-second intervals)
   */
  async startBackupPolling(tokenAddress) {
    const intervalId = setInterval(async () => {
      try {
        const priceData = await this.fetchPriceHTTP(tokenAddress);
        if (priceData) {
          this.updatePrice(tokenAddress, priceData);
        }
      } catch (error) {
        logger.error(`Backup polling failed for ${tokenAddress}:`, error);
      }
    }, this.pollingInterval);

    this.backupPolling.set(tokenAddress, intervalId);
    logger.info(`Started backup polling for ${tokenAddress}`);
  }

  /**
   * Fetch price via HTTP (backup method)
   */
  async fetchPriceHTTP(tokenAddress) {
    try {
      // Try Jupiter first
      const response = await axios.get(`https://price.jup.ag/v4/price`, {
        params: { ids: tokenAddress },
        timeout: 3000
      });

      if (response.data.data[tokenAddress]) {
        const tokenData = response.data.data[tokenAddress];
        return {
          price: tokenData.price,
          change24h: 0, // Jupiter doesn't provide this
          change1h: 0,
          timestamp: Date.now(),
          source: 'jupiter_http'
        };
      }
    } catch (error) {
      // Try Birdeye HTTP as fallback
      try {
        const response = await axios.get(`https://public-api.birdeye.so/defi/price`, {
          params: { 
            address: tokenAddress,
            include_liquidity: true 
          },
          timeout: 3000
        });

        if (response.data.success) {
          return {
            price: response.data.data.value,
            change24h: response.data.data.priceChange24h || 0,
            change1h: response.data.data.priceChange1h || 0,
            timestamp: Date.now(),
            source: 'birdeye_http'
          };
        }
      } catch (birdeyeError) {
        logger.error(`All HTTP price sources failed for ${tokenAddress}`);
      }
    }

    return null;
  }

  /**
   * Update price and notify all callbacks
   */
  updatePrice(tokenAddress, priceData) {
    const previousPrice = this.currentPrices.get(tokenAddress);
    this.currentPrices.set(tokenAddress, priceData);

    // Add price change indicator
    if (previousPrice) {
      const priceChange = ((priceData.price - previousPrice.price) / previousPrice.price) * 100;
      priceData.instantChange = priceChange;
      priceData.trend = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'stable';
    }

    // Notify all subscribers
    const callbacks = this.priceCallbacks.get(tokenAddress) || [];
    callbacks.forEach(callback => {
      try {
        callback(priceData);
      } catch (error) {
        logger.error(`Error in price callback:`, error);
      }
    });

    logger.debug(`Price updated for ${tokenAddress}: $${priceData.price}`);
  }

  /**
   * Handle reconnections with exponential backoff
   */
  async handleReconnection(tokenAddress, source) {
    const reconnectKey = `${tokenAddress}_${source}`;
    const attempts = this.reconnectAttempts.get(reconnectKey) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts reached for ${tokenAddress}`);
      await this.startBackupPolling(tokenAddress);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds
    
    setTimeout(async () => {
      logger.info(`Attempting reconnection ${attempts + 1} for ${tokenAddress}`);
      this.reconnectAttempts.set(reconnectKey, attempts + 1);
      
      try {
        await this.startRealtimeConnection(tokenAddress);
        this.reconnectAttempts.delete(reconnectKey); // Reset on success
      } catch (error) {
        logger.error(`Reconnection failed for ${tokenAddress}:`, error);
      }
    }, delay);
  }

  /**
   * Get current price (synchronous)
   */
  getCurrentPrice(tokenAddress) {
    return this.currentPrices.get(tokenAddress) || null;
  }

  /**
   * Unsubscribe from price updates
   */
  unsubscribeFromPriceUpdates(tokenAddress, callback) {
    const callbacks = this.priceCallbacks.get(tokenAddress);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }

      // Close connection if no more callbacks
      if (callbacks.length === 0) {
        this.closeConnection(tokenAddress);
      }
    }
  }

  /**
   * Close connection for a token
   */
  closeConnection(tokenAddress) {
    // Close WebSocket
    const ws = this.connections.get(tokenAddress);
    if (ws) {
      ws.close();
      this.connections.delete(tokenAddress);
    }

    // Clear backup polling
    const intervalId = this.backupPolling.get(tokenAddress);
    if (intervalId) {
      clearInterval(intervalId);
      this.backupPolling.delete(intervalId);
    }

    // Clear callbacks and prices
    this.priceCallbacks.delete(tokenAddress);
    this.currentPrices.delete(tokenAddress);

    logger.info(`Closed all connections for ${tokenAddress}`);
  }

  /**
   * Get connection stats
   */
  getConnectionStats() {
    return {
      activeConnections: this.connections.size,
      subscriptions: this.priceCallbacks.size,
      backupPolling: this.backupPolling.size,
      trackedTokens: Array.from(this.currentPrices.keys())
    };
  }
}

module.exports = RealtimePriceService;