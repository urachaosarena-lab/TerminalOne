const { PublicKey } = require('@solana/web3.js');
const logger = require('./logger');

/**
 * Input validation utilities to prevent malicious or invalid data
 */
class ValidationService {
  
  /**
   * Validate Solana token address
   */
  static validateTokenAddress(address) {
    if (!address || typeof address !== 'string') {
      return { valid: false, error: 'Token address must be a string' };
    }
    
    // Check length (Solana addresses are base58, typically 32-44 chars)
    if (address.length < 32 || address.length > 44) {
      return { valid: false, error: 'Invalid token address length' };
    }
    
    // Validate base58 format and PublicKey validity
    try {
      new PublicKey(address);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid Solana token address format' };
    }
  }

  /**
   * Validate numeric input (amounts, percentages, etc.)
   */
  static validateNumeric(value, options = {}) {
    const { 
      min = 0, 
      max = Number.MAX_SAFE_INTEGER, 
      allowZero = true,
      name = 'Value'
    } = options;
    
    // Check if numeric
    const num = Number(value);
    if (isNaN(num)) {
      return { valid: false, error: `${name} must be a valid number` };
    }
    
    // Check if finite
    if (!isFinite(num)) {
      return { valid: false, error: `${name} must be finite` };
    }
    
    // Check zero
    if (!allowZero && num === 0) {
      return { valid: false, error: `${name} cannot be zero` };
    }
    
    // Check range
    if (num < min) {
      return { valid: false, error: `${name} must be at least ${min}` };
    }
    
    if (num > max) {
      return { valid: false, error: `${name} must not exceed ${max}` };
    }
    
    return { valid: true, value: num };
  }

  /**
   * Validate percentage (0-100)
   */
  static validatePercentage(value, name = 'Percentage') {
    return this.validateNumeric(value, { 
      min: 0, 
      max: 100, 
      allowZero: true,
      name 
    });
  }

  /**
   * Validate trading amount in SOL
   */
  static validateSolAmount(value) {
    return this.validateNumeric(value, {
      min: 0.001, // Minimum 0.001 SOL
      max: 1000000, // Max 1M SOL
      allowZero: false,
      name: 'SOL amount'
    });
  }

  /**
   * Validate slippage percentage
   */
  static validateSlippage(value) {
    return this.validateNumeric(value, {
      min: 0.1,
      max: 50, // Max 50% slippage
      allowZero: false,
      name: 'Slippage'
    });
  }

  /**
   * Validate string length
   */
  static validateStringLength(value, options = {}) {
    const { min = 0, max = 1000, name = 'Input' } = options;
    
    if (typeof value !== 'string') {
      return { valid: false, error: `${name} must be a string` };
    }
    
    if (value.length < min) {
      return { valid: false, error: `${name} must be at least ${min} characters` };
    }
    
    if (value.length > max) {
      return { valid: false, error: `${name} must not exceed ${max} characters` };
    }
    
    return { valid: true, value };
  }

  /**
   * Validate strategy name
   */
  static validateStrategyName(name) {
    const result = this.validateStringLength(name, {
      min: 1,
      max: 50,
      name: 'Strategy name'
    });
    
    if (!result.valid) return result;
    
    // Allow only alphanumeric, spaces, dashes, underscores
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validPattern.test(name)) {
      return { 
        valid: false, 
        error: 'Strategy name can only contain letters, numbers, spaces, dashes, and underscores' 
      };
    }
    
    return { valid: true, value: name.trim() };
  }

  /**
   * Validate private key format (base64 or JSON array)
   */
  static validatePrivateKey(input) {
    if (!input || typeof input !== 'string') {
      return { valid: false, error: 'Private key must be a string' };
    }
    
    // Check if it's too long (prevent DOS)
    if (input.length > 10000) {
      return { valid: false, error: 'Private key input too long' };
    }
    
    // Try base64 format
    try {
      const buffer = Buffer.from(input, 'base64');
      if (buffer.length === 64) {
        return { valid: true, format: 'base64' };
      }
    } catch {}
    
    // Try JSON array format
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed) && parsed.length === 64) {
        return { valid: true, format: 'json' };
      }
    } catch {}
    
    return { 
      valid: false, 
      error: 'Invalid private key format. Must be base64 string or JSON array of 64 numbers' 
    };
  }

  /**
   * Validate mnemonic phrase (12 or 24 words)
   */
  static validateMnemonic(phrase) {
    if (!phrase || typeof phrase !== 'string') {
      return { valid: false, error: 'Mnemonic must be a string' };
    }
    
    const words = phrase.trim().split(/\s+/);
    
    if (words.length !== 12 && words.length !== 24) {
      return { 
        valid: false, 
        error: 'Mnemonic must be 12 or 24 words' 
      };
    }
    
    // Check for suspicious patterns (repeated words, etc.)
    const uniqueWords = new Set(words);
    if (uniqueWords.size < words.length * 0.7) {
      logger.warn('Mnemonic has many repeated words - potentially invalid');
    }
    
    return { valid: true, wordCount: words.length };
  }

  /**
   * Sanitize user input (remove control characters, trim)
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove control characters except newline and tab
    return input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  /**
   * Validate callback data from Telegram buttons
   */
  static validateCallbackData(data, maxLength = 64) {
    if (!data || typeof data !== 'string') {
      return { valid: false, error: 'Callback data must be a string' };
    }
    
    if (data.length > maxLength) {
      return { valid: false, error: `Callback data exceeds ${maxLength} characters` };
    }
    
    return { valid: true, value: data };
  }

  /**
   * Validate user ID (Telegram ID)
   */
  static validateUserId(userId) {
    const result = this.validateNumeric(userId, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      allowZero: false,
      name: 'User ID'
    });
    
    if (!result.valid) return result;
    
    // Telegram IDs are positive integers
    if (!Number.isInteger(result.value)) {
      return { valid: false, error: 'User ID must be an integer' };
    }
    
    return { valid: true, value: result.value };
  }

  /**
   * Validate battle energy cost
   */
  static validateEnergyCost(value) {
    return this.validateNumeric(value, {
      min: 1,
      max: 100,
      allowZero: false,
      name: 'Energy cost'
    });
  }

  /**
   * Validate hero level
   */
  static validateHeroLevel(value) {
    return this.validateNumeric(value, {
      min: 1,
      max: 100,
      allowZero: false,
      name: 'Hero level'
    });
  }
}

module.exports = ValidationService;
