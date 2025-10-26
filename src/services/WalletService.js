const { Keypair, PublicKey } = require('@solana/web3.js');
const { generateMnemonic, mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const encryption = require('../utils/encryption');

class WalletService {
  constructor(solanaService) {
    this.solanaService = solanaService;
    this.userWallets = new Map();
    this.walletStoragePath = path.join(__dirname, '../../data/wallets.json');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.walletStoragePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load existing wallets from file
    this.loadWalletsFromFile();
  }
  
  /**
   * Load wallets from persistent storage
   */
  loadWalletsFromFile() {
    try {
      if (fs.existsSync(this.walletStoragePath)) {
        const data = fs.readFileSync(this.walletStoragePath, 'utf8');
        const wallets = JSON.parse(data);
        
        // Restore wallets to memory and decrypt sensitive data
        Object.entries(wallets).forEach(([userId, walletData]) => {
          // Decrypt private key and mnemonic if encrypted
          if (walletData.privateKey && encryption.isEncrypted(walletData.privateKey)) {
            walletData.privateKey = encryption.decrypt(walletData.privateKey);
          }
          if (walletData.mnemonic && encryption.isEncrypted(walletData.mnemonic)) {
            walletData.mnemonic = encryption.decrypt(walletData.mnemonic);
          }
          this.userWallets.set(userId, walletData);
        });
        
        logger.info(`Loaded ${this.userWallets.size} wallets from persistent storage (encrypted)`);
      } else {
        logger.info('No existing wallet data found, starting fresh');
      }
    } catch (error) {
      logger.error('Failed to load wallets from file:', error);
    }
  }
  
  /**
   * Save wallets to persistent storage (with encryption)
   */
  saveWalletsToFile() {
    try {
      // Convert Map to object for JSON storage and encrypt sensitive data
      const walletsObject = {};
      this.userWallets.forEach((wallet, userId) => {
        // Clone wallet to avoid modifying in-memory data
        const walletCopy = { ...wallet };
        
        // Encrypt private key and mnemonic before saving
        if (walletCopy.privateKey) {
          walletCopy.privateKey = encryption.encrypt(walletCopy.privateKey);
        }
        if (walletCopy.mnemonic) {
          walletCopy.mnemonic = encryption.encrypt(walletCopy.mnemonic);
        }
        
        walletsObject[userId] = walletCopy;
      });
      
      // Write to file with proper formatting
      fs.writeFileSync(
        this.walletStoragePath,
        JSON.stringify(walletsObject, null, 2),
        'utf8'
      );
      
      logger.info(`Saved ${this.userWallets.size} wallets to persistent storage (encrypted)`);
    } catch (error) {
      logger.error('Failed to save wallets to file:', error);
    }
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

      // Store wallet for user
      this.userWallets.set(userId, walletData);
      
      // Persist to file
      this.saveWalletsToFile();

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
   * Import wallet from private key or seed phrase
   */
  async importWallet(userId, input) {
    try {
      let keypair;
      let importedMnemonic = null;

      // First, try to import as seed phrase (12 or 24 words)
      const words = input.trim().split(/\s+/);
      if (words.length === 12 || words.length === 24) {
        try {
          const { validateMnemonic } = require('bip39');
          if (validateMnemonic(input.trim())) {
            // Valid mnemonic - create keypair from it
            const seed = mnemonicToSeedSync(input.trim());
            const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
            keypair = Keypair.fromSeed(derivedSeed);
            importedMnemonic = input.trim();
            logger.info(`Imported wallet from seed phrase for user ${userId}`);
          } else {
            throw new Error('Invalid mnemonic');
          }
        } catch (mnemonicError) {
          // If mnemonic parsing fails, continue to try as private key
          logger.debug('Failed to parse as mnemonic, trying as private key');
        }
      }

      // If not a valid mnemonic, try to parse as private key
      if (!keypair) {
        try {
          // Try base64 format first
          const secretKeyBuffer = Buffer.from(input, 'base64');
          if (secretKeyBuffer.length !== 64) throw new Error('Invalid length');
          keypair = Keypair.fromSecretKey(secretKeyBuffer);
        } catch {
          try {
            // Try parsing as JSON array
            const secretKeyArray = JSON.parse(input);
            if (!Array.isArray(secretKeyArray) || secretKeyArray.length !== 64) {
              throw new Error('Invalid array format');
            }
            keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
          } catch {
            throw new Error('Invalid format');
          }
        }
      }

      const walletData = {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
        mnemonic: importedMnemonic, // Store mnemonic if imported from seed phrase
        imported: true,
        importType: importedMnemonic ? 'mnemonic' : 'privateKey',
        createdAt: new Date().toISOString()
      };

      // Store wallet for user
      this.userWallets.set(userId, walletData);
      
      // Persist to file
      this.saveWalletsToFile();

      logger.info(`Imported wallet for user ${userId}: ${walletData.publicKey} (${walletData.importType})`);
      
      return {
        publicKey: walletData.publicKey,
        success: true,
        importType: walletData.importType
      };

    } catch (error) {
      logger.error('Failed to import wallet:', error.message);
      throw new Error('Invalid format. Please provide a valid Solana private key (Base64 or JSON array) or 12/24 word seed phrase.');
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
      this.saveWalletsToFile();
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