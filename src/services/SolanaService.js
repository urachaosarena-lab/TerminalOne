const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const config = require('../../config/config');
const logger = require('../utils/logger');

class SolanaService {
  constructor() {
    this.connection = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      this.connection = new Connection(
        config.solana.rpcUrl,
        config.solana.commitment
      );

      // Test the connection
      const version = await this.connection.getVersion();
      logger.info(`Connected to Solana cluster: ${config.solana.network}`, version);
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize Solana connection:', error);
      throw error;
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