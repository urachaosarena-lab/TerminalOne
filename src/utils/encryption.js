const crypto = require('crypto');
const logger = require('./logger');

// Encryption configuration
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

class EncryptionService {
  constructor() {
    // Get encryption key from environment or generate one
    this.encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
    
    if (!this.encryptionKey) {
      // Generate a key if not provided (for first run)
      this.encryptionKey = crypto.randomBytes(32).toString('hex');
      logger.warn('⚠️ WALLET_ENCRYPTION_KEY not set! Generated temporary key. Add to .env for production!');
      logger.warn(`Generated key: ${this.encryptionKey}`);
    } else {
      logger.info('✅ Wallet encryption enabled');
    }
    
    // Convert hex string to buffer
    this.keyBuffer = Buffer.from(this.encryptionKey, 'hex');
  }

  /**
   * Encrypt sensitive data (private keys, mnemonics)
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.keyBuffer, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return IV + encrypted data (IV needed for decryption)
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedText) {
    try {
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.keyBuffer, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Check if data is encrypted (contains IV separator)
   */
  isEncrypted(data) {
    return typeof data === 'string' && data.includes(':') && data.split(':').length === 2;
  }

  /**
   * Generate a secure random key (for setup)
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }
}

module.exports = new EncryptionService();
