const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const config = require('../../config/config');
const logger = require('../utils/logger');

class SolanaService {
  constructor() {
    this.connection = null;
    this.fallbackConnections = [];
    this.currentConnectionIndex = 0;
    this.isInitialized = false;
    this.failedEndpoints = new Map(); // Track failed endpoints with timestamps
    this.endpointCooldown = 60000; // 60 seconds cooldown for failed endpoints
  }

  async initialize() {
    try {
      // Initialize primary connection
      this.connection = new Connection(
        config.solana.rpcUrl,
        {
          commitment: config.solana.commitment,
          wsEndpoint: config.solana.wsUrl,
          confirmTransactionInitialTimeout: config.solana.confirmTimeout
        }
      );

      // Initialize fallback connections
      this.fallbackConnections = config.solana.fallbackRpcUrls.map(url => 
        new Connection(url, config.solana.commitment)
      );

      // Test the primary connection
      const version = await this.connection.getVersion();
      logger.info(`✅ Connected to Solana RPC: ${config.solana.network}`, version);
      logger.info(`🔄 Fallback RPCs configured: ${this.fallbackConnections.length} endpoints`);
      logger.info(`⚡ Using premium RPC endpoint for enhanced reliability`);
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize primary Solana connection, trying fallback...', error.message);
      
      // Try fallback connections
      for (let i = 0; i < this.fallbackConnections.length; i++) {
        try {
          const version = await this.fallbackConnections[i].getVersion();
          logger.info(`✅ Connected via fallback RPC #${i + 1}`);
          this.connection = this.fallbackConnections[i];
          this.currentConnectionIndex = i;
          this.isInitialized = true;
          return true;
        } catch (fallbackError) {
          logger.warn(`Fallback RPC #${i + 1} failed:`, fallbackError.message);
        }
      }
      
      throw new Error('All RPC endpoints failed to connect');
    }
  }

  async getBalance(publicKeyString) {
    if (!this.isInitialized) {
      throw new Error('Solana service not initialized');
    }

    try {
      const publicKey = new PublicKey(publicKeyString);
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL; // Convert lamports to SOL
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw error;
    }
  }

  async getTokenBalance(walletAddress, mintAddress) {
    if (!this.isInitialized) {
      throw new Error('Solana service not initialized');
    }

    try {
      const walletPublicKey = new PublicKey(walletAddress);
      const mintPublicKey = new PublicKey(mintAddress);
      
      // Get token accounts by owner
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        walletPublicKey,
        { mint: mintPublicKey }
      );

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      // Get the balance of the first token account
      const tokenAccount = tokenAccounts.value[0];
      const balance = await this.connection.getTokenAccountBalance(tokenAccount.pubkey);
      
      return parseFloat(balance.value.uiAmount || 0);
    } catch (error) {
      logger.error('Failed to get token balance:', error);
      throw error;
    }
  }

  async getTokenPrice(tokenAddress) {
    // Placeholder for price fetching logic
    // This would typically integrate with Jupiter API, CoinGecko, or other price APIs
    logger.info(`Price fetch requested for token: ${tokenAddress}`);
    throw new Error('Token price fetching not implemented yet');
  }

  async validateAddress(address) {
    try {
      const publicKey = new PublicKey(address);
      // Additional validation: check if it's on curve
      return PublicKey.isOnCurve(publicKey);
    } catch (error) {
      return false;
    }
  }

  getConnection() {
    if (!this.isInitialized) {
      throw new Error('Solana service not initialized');
    }
    return this.connection;
  }

  /**
   * Switch to next available RPC endpoint on failure
   */
  async switchToFallbackRPC() {
    if (this.fallbackConnections.length === 0) {
      logger.warn('⚠️ No fallback RPCs available');
      return false;
    }

    // Mark current endpoint as failed
    const currentUrl = config.solana.rpcUrl;
    this.failedEndpoints.set(currentUrl, Date.now());
    logger.warn(`🔴 Marking RPC as failed: ${currentUrl}`);

    // Try next fallback
    for (let i = 0; i < this.fallbackConnections.length; i++) {
      const nextIndex = (this.currentConnectionIndex + 1 + i) % this.fallbackConnections.length;
      const fallbackConnection = this.fallbackConnections[nextIndex];
      
      try {
        // Test the connection
        await fallbackConnection.getVersion();
        
        logger.info(`✅ Switched to fallback RPC #${nextIndex + 1}`);
        this.connection = fallbackConnection;
        this.currentConnectionIndex = nextIndex;
        return true;
      } catch (error) {
        logger.warn(`Fallback RPC #${nextIndex + 1} unavailable:`, error.message);
      }
    }

    logger.error('❌ All RPC endpoints are unavailable');
    return false;
  }

  /**
   * Execute RPC call with automatic failover
   */
  async executeWithFailover(operation, operationName = 'RPC call') {
    let lastError;
    const maxAttempts = 1 + this.fallbackConnections.length; // Primary + all fallbacks

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation(this.connection);
      } catch (error) {
        lastError = error;
        const isRateLimitOrTimeout = 
          error.message?.includes('429') ||
          error.message?.includes('timeout') ||
          error.message?.includes('rate limit');

        if (isRateLimitOrTimeout && attempt < maxAttempts - 1) {
          logger.warn(`${operationName} failed, switching RPC...`, error.message);
          await this.switchToFallbackRPC();
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay before retry
          continue;
        }
        
        throw error;
      }
    }

    throw lastError;
  }

  async getAccountInfo(publicKeyString) {
    if (!this.isInitialized) {
      throw new Error('Solana service not initialized');
    }

    try {
      const publicKey = new PublicKey(publicKeyString);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      return accountInfo;
    } catch (error) {
      logger.error('Failed to get account info:', error);
      throw error;
    }
  }
}

module.exports = SolanaService;