const { Keypair, PublicKey } = require('@solana/web3.js');
const { generateMnemonic, mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const logger = require('../utils/logger');

class WalletService {
  constructor(solanaService) {
    this.solanaService = solanaService;
    this.userWallets = new Map(); // In production, use encrypted database
  }

  /**
   * Create a new wallet for user
   */
  async createWallet(userId) {
    try {
      // Generate mnemonic phrase
      const mnemonic = generateMnemonic();
      
      // Create keypair from mnemonic
      const seed = mnemonicToSeedSync(mnemonic);
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
      const keypair = Keypair.fromSeed(derivedSeed);

      const walletData = {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
        mnemonic: mnemonic,
        createdAt: new Date().toISOString()
      };

      // Store wallet for user (in production, encrypt this!)
      this.userWallets.set(userId, walletData);

      logger.info(`Created new wallet for user ${userId}: ${walletData.publicKey}`);
      
      return {
        publicKey: walletData.publicKey,
        success: true
      };

    } catch (error) {
      logger.error('Failed to create wallet:', error);
      throw new Error('Failed to create wallet');
    }
  }

  /**
   * Import wallet from private key
   */
  async importWallet(userId, privateKey) {
    try {
      let keypair;

      // Try to parse as base64 first, then as array
      try {
        const secretKeyBuffer = Buffer.from(privateKey, 'base64');
        if (secretKeyBuffer.length !== 64) throw new Error('Invalid length');
        keypair = Keypair.fromSecretKey(secretKeyBuffer);
      } catch {
        try {
          // Try parsing as JSON array
          const secretKeyArray = JSON.parse(privateKey);
          if (!Array.isArray(secretKeyArray) || secretKeyArray.length !== 64) {
            throw new Error('Invalid array format');
          }
          keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
        } catch {
          throw new Error('Invalid private key format');
        }
      }

      const walletData = {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
        mnemonic: null, // No mnemonic for imported wallets
        imported: true,
        createdAt: new Date().toISOString()
      };

      // Store wallet for user
      this.userWallets.set(userId, walletData);

      logger.info(`Imported wallet for user ${userId}: ${walletData.publicKey}`);
      
      return {
        publicKey: walletData.publicKey,
        success: true
      };

    } catch (error) {
      logger.error('Failed to import wallet:', error.message);
      throw new Error('Invalid private key format. Please provide a valid Solana private key.');
    }
  }

  /**
   * Get user's wallet
   */
  getUserWallet(userId) {
    return this.userWallets.get(userId) || null;
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(userId) {
    const wallet = this.getUserWallet(userId);
    if (!wallet) {
      return { balance: 0, hasWallet: false };
    }

    try {
      const balance = await this.solanaService.getBalance(wallet.publicKey);
      return { 
        balance: balance,
        hasWallet: true,
        publicKey: wallet.publicKey
      };
    } catch (error) {
      logger.error('Failed to get wallet balance:', error);
      return { balance: 0, hasWallet: true, error: true };
    }
  }

  /**
   * Get private key for user (use with caution!)
   */
  getPrivateKey(userId) {
    const wallet = this.getUserWallet(userId);
    if (!wallet) {
      throw new Error('No wallet found for user');
    }

    return {
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic,
      publicKey: wallet.publicKey,
      imported: wallet.imported || false
    };
  }

  /**
   * Check if user has a wallet
   */
  hasWallet(userId) {
    return this.userWallets.has(userId);
  }

  /**
   * Delete user wallet
   */
  deleteWallet(userId) {
    const deleted = this.userWallets.delete(userId);
    if (deleted) {
      logger.info(`Deleted wallet for user ${userId}`);
    }
    return deleted;
  }

  /**
   * Validate Solana address
   */
  validateAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = WalletService;