const { Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const crypto = require('crypto');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const logger = require('../utils/logger');
const config = require('../../config/config');

class BountyService {
  constructor(solanaService, bountyStatsService, notificationService) {
    this.solanaService = solanaService;
    this.bountyStatsService = bountyStatsService;
    this.notificationService = notificationService;
    
    // Bounty configuration
    this.BOUNTY_CHANCE = config.vault.bountyChance; // 1 in 400
    this.PAYOUT_PERCENT = config.vault.bountyPayoutPercent; // 50%
    this.VAULT_PUBLIC_KEY = config.vault.publicKey;
    
    // Initialize vault keypair
    this.vaultKeypair = null;
    this.initializeVault();
  }

  /**
   * Initialize vault wallet from mnemonic
   */
  async initializeVault() {
    try {
      const mnemonic = config.vault.mnemonic;
      
      if (!mnemonic) {
        throw new Error('Vault mnemonic not found in config');
      }

      // Validate mnemonic
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid vault mnemonic');
      }

      // Derive seed from mnemonic
      const seed = await bip39.mnemonicToSeed(mnemonic);
      
      // Derive keypair (using standard Solana derivation path)
      const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
      this.vaultKeypair = Keypair.fromSeed(derivedSeed);
      
      // Verify public key matches
      const derivedPublicKey = this.vaultKeypair.publicKey.toBase58();
      if (derivedPublicKey !== this.VAULT_PUBLIC_KEY) {
        logger.warn(`Vault public key mismatch! Expected: ${this.VAULT_PUBLIC_KEY}, Got: ${derivedPublicKey}`);
      }
      
      logger.info(`Vault initialized: ${this.VAULT_PUBLIC_KEY}`);
      
    } catch (error) {
      logger.error('Error initializing vault:', error);
      throw error;
    }
  }

  /**
   * Generate cryptographically secure random number between 1-400
   * Returns 1 if bounty is won, otherwise returns 2-400
   */
  generateBountyRoll() {
    // Generate cryptographically secure random bytes
    const randomBytes = crypto.randomBytes(4);
    const randomInt = randomBytes.readUInt32BE(0);
    
    // Map to 1-400 range
    const roll = (randomInt % this.BOUNTY_CHANCE) + 1;
    
    return roll;
  }

  /**
   * Check if bounty should be triggered and process payout
   */
  async checkAndProcessBounty(userId, userPublicKey) {
    try {
      // Generate random number
      const roll = this.generateBountyRoll();
      
      // Record the roll
      await this.bountyStatsService.recordRollResult(roll);
      await this.bountyStatsService.incrementTick();
      
      logger.info(`Bounty roll for user ${userId}: ${roll}/${this.BOUNTY_CHANCE}`);
      
      // Check if bounty is won (roll === 1)
      if (roll === 1) {
        logger.info(`🎯 BOUNTY HIT! User ${userId} won!`);
        return await this.processBountyWin(userId, userPublicKey);
      }
      
      return {
        won: false,
        roll,
        message: null
      };
      
    } catch (error) {
      logger.error('Error checking bounty:', error);
      return {
        won: false,
        error: error.message
      };
    }
  }

  /**
   * Process bounty win and send payout
   */
  async processBountyWin(userId, userPublicKey) {
    try {
      // Get vault balance
      const vaultBalance = await this.getVaultBalance();
      
      if (vaultBalance === 0) {
        logger.warn('Vault is empty, cannot process bounty payout');
        return {
          won: true,
          paid: false,
          amount: 0,
          message: '🎯 You hit the BOUNTY! But the vault is currently empty. 😢'
        };
      }
      
      // Calculate payout (50% of vault)
      const payoutAmount = vaultBalance * this.PAYOUT_PERCENT;
      const payoutLamports = Math.floor(payoutAmount * LAMPORTS_PER_SOL);
      
      // Send payout to user
      const signature = await this.sendBountyPayout(userPublicKey, payoutLamports);
      
      if (signature) {
        // Record the win
        await this.bountyStatsService.recordBountyWin(userId, payoutAmount);
        
        logger.info(`Bounty payout sent: ${payoutAmount.toFixed(6)} SOL to user ${userId}`);
        
        return {
          won: true,
          paid: true,
          amount: payoutAmount,
          signature,
          message: this.getBountyWinMessage(payoutAmount, signature)
        };
      } else {
        return {
          won: true,
          paid: false,
          amount: payoutAmount,
          message: '🎯 You hit the BOUNTY! But payment failed. Please contact support.'
        };
      }
      
    } catch (error) {
      logger.error('Error processing bounty win:', error);
      return {
        won: true,
        paid: false,
        error: error.message,
        message: '🎯 You hit the BOUNTY! But there was an error processing payment.'
      };
    }
  }

  /**
   * Send bounty payout to winner
   */
  async sendBountyPayout(userPublicKey, lamports) {
    try {
      const connection = this.solanaService.getConnection();
      
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.vaultKeypair.publicKey,
          toPubkey: new PublicKey(userPublicKey),
          lamports
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.vaultKeypair.publicKey;
      
      // Sign transaction
      transaction.sign(this.vaultKeypair);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize());
      
      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');
      
      logger.info(`Bounty payout transaction confirmed: ${signature}`);
      
      return signature;
      
    } catch (error) {
      logger.error('Error sending bounty payout:', error);
      return null;
    }
  }

  /**
   * Get vault SOL balance
   */
  async getVaultBalance() {
    try {
      const connection = this.solanaService.getConnection();
      const balance = await connection.getBalance(new PublicKey(this.VAULT_PUBLIC_KEY));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Error getting vault balance:', error);
      return 0;
    }
  }

  /**
   * Get bounty win celebration message
   */
  getBountyWinMessage(payoutAmount, signature) {
    const solscanLink = `https://solscan.io/tx/${signature}`;
    
    return `
🎉🎯🎉 **BOUNTY JACKPOT WON!** 🎉🎯🎉

💰 **You won:** ${payoutAmount.toFixed(6)} SOL

🔗 **Transaction:** [View on Solscan](${solscanLink})

🎊 **Congratulations!** You hit the 1-in-400 chance!

The bounty has been sent to your wallet instantly! 🚀
    `.trim();
  }

  /**
   * Get bounty statistics for dashboard
   */
  async getBountyStats() {
    const vaultBalance = await this.getVaultBalance();
    const stats = this.bountyStatsService.getStats();
    
    // Get SOL price for USD conversion (placeholder - integrate with price service)
    const solPrice = 150; // TODO: Get from price service
    
    return {
      vaultBalance,
      vaultBalanceUSD: vaultBalance * solPrice,
      currentPayout: vaultBalance * this.PAYOUT_PERCENT,
      currentPayoutUSD: vaultBalance * this.PAYOUT_PERCENT * solPrice,
      totalFeesCollected: stats.totalFeesCollected,
      totalFeesCollectedUSD: stats.totalFeesCollected * solPrice,
      totalBountyWins: stats.totalBountyWins,
      currentTick: stats.currentTick,
      lastRollResult: stats.lastRollResult,
      bountyChance: this.BOUNTY_CHANCE,
      payoutPercent: this.PAYOUT_PERCENT * 100,
      vaultPublicKey: this.VAULT_PUBLIC_KEY,
      recentWins: stats.bountyHistory
    };
  }

  /**
   * Check if vault is initialized
   */
  isVaultReady() {
    return this.vaultKeypair !== null;
  }
}

module.exports = BountyService;
