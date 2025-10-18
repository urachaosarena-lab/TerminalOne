const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const config = require('../../config/config');
const logger = require('../utils/logger');

class AirdropService {
  constructor(solanaService) {
    this.solanaService = solanaService;
  }

  /**
   * Request SOL airdrop on devnet
   */
  async requestAirdrop(publicKeyString, solAmount = 2) {
    try {
      // Only allow airdrops on devnet
      if (config.solana.network !== 'devnet') {
        throw new Error('Airdrops are only available on devnet');
      }

      const publicKey = new PublicKey(publicKeyString);
      const connection = this.solanaService.getConnection();
      
      // Request airdrop
      const lamports = solAmount * LAMPORTS_PER_SOL;
      
      logger.info(`Requesting airdrop of ${solAmount} SOL for ${publicKeyString}`);
      
      const signature = await connection.requestAirdrop(publicKey, lamports);
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Get new balance
      const balance = await connection.getBalance(publicKey);
      const balanceInSol = balance / LAMPORTS_PER_SOL;
      
      logger.info(`Airdrop successful! New balance: ${balanceInSol} SOL`);
      
      return {
        success: true,
        signature,
        amount: solAmount,
        newBalance: balanceInSol
      };

    } catch (error) {
      logger.error('Airdrop failed:', error);
      
      // Handle common airdrop errors
      if (error.message.includes('airdrop request limit exceeded')) {
        throw new Error('Airdrop limit exceeded. Please wait a few minutes before requesting again.');
      }
      
      if (error.message.includes('blockhash not found')) {
        throw new Error('Network congestion. Please try again in a moment.');
      }
      
      throw new Error(`Airdrop failed: ${error.message}`);
    }
  }

  /**
   * Check if airdrop is available
   */
  isAirdropAvailable() {
    return config.solana.network === 'devnet';
  }

  /**
   * Get recommended airdrop amounts
   */
  getRecommendedAmounts() {
    return [
      { amount: 1, label: '1 SOL (Small test)' },
      { amount: 2, label: '2 SOL (Recommended)' },
      { amount: 5, label: '5 SOL (Large test)' }
    ];
  }
}

module.exports = AirdropService;