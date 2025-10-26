const { PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');

/**
 * Transaction verification service to ensure fee collection succeeded
 * Provides on-chain verification for transaction integrity
 */
class TransactionVerificationService {
  constructor(solanaService) {
    this.solanaService = solanaService;
    this.verificationCache = new Map(); // txSignature -> verification result
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 2000; // 2 seconds
  }

  /**
   * Verify transaction was confirmed on-chain
   * @param {string} signature - Transaction signature
   * @param {number} commitment - Commitment level (default: 'confirmed')
   * @returns {Object} Verification result
   */
  async verifyTransaction(signature, commitment = 'confirmed') {
    try {
      // Check cache first
      if (this.verificationCache.has(signature)) {
        const cached = this.verificationCache.get(signature);
        if (Date.now() - cached.timestamp < 60000) { // Cache for 1 minute
          return cached.result;
        }
      }

      logger.info(`🔍 Verifying transaction: ${signature}`);

      let retries = 0;
      let lastError = null;

      while (retries < this.MAX_RETRIES) {
        try {
          // Get transaction details from blockchain
          const txDetails = await this.solanaService.connection.getTransaction(
            signature,
            { 
              commitment,
              maxSupportedTransactionVersion: 0 
            }
          );

          if (!txDetails) {
            // Transaction not found yet, might still be processing
            if (retries < this.MAX_RETRIES - 1) {
              logger.debug(`Transaction ${signature} not found, retry ${retries + 1}/${this.MAX_RETRIES}`);
              await this.sleep(this.RETRY_DELAY);
              retries++;
              continue;
            }
            
            throw new Error('Transaction not found after retries');
          }

          // Check if transaction succeeded
          const succeeded = txDetails.meta?.err === null;

          const result = {
            verified: true,
            succeeded,
            signature,
            slot: txDetails.slot,
            blockTime: txDetails.blockTime,
            fee: txDetails.meta?.fee || 0,
            timestamp: new Date(txDetails.blockTime * 1000),
            error: txDetails.meta?.err
          };

          // Cache result
          this.verificationCache.set(signature, {
            result,
            timestamp: Date.now()
          });

          if (succeeded) {
            logger.info(`✅ Transaction verified successfully: ${signature}`);
          } else {
            logger.error(`❌ Transaction failed on-chain: ${signature}`, txDetails.meta?.err);
          }

          return result;

        } catch (error) {
          lastError = error;
          if (retries < this.MAX_RETRIES - 1) {
            logger.debug(`Verification retry ${retries + 1}/${this.MAX_RETRIES} for ${signature}`);
            await this.sleep(this.RETRY_DELAY);
            retries++;
          } else {
            break;
          }
        }
      }

      // All retries exhausted
      logger.error(`Failed to verify transaction ${signature} after ${this.MAX_RETRIES} retries:`, lastError);
      return {
        verified: false,
        succeeded: false,
        signature,
        error: lastError?.message || 'Verification failed'
      };

    } catch (error) {
      logger.error(`Transaction verification error for ${signature}:`, error);
      return {
        verified: false,
        succeeded: false,
        signature,
        error: error.message
      };
    }
  }

  /**
   * Verify fee collection transaction specifically
   * Checks that the correct amount was transferred to revenue wallet
   */
  async verifyFeeCollection(signature, expectedAmount, revenueWallet) {
    try {
      const verification = await this.verifyTransaction(signature);

      if (!verification.verified || !verification.succeeded) {
        return {
          success: false,
          error: 'Transaction verification failed',
          details: verification
        };
      }

      // Get transaction details to verify transfer amount
      const txDetails = await this.solanaService.connection.getParsedTransaction(
        signature,
        { 
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0 
        }
      );

      if (!txDetails) {
        return {
          success: false,
          error: 'Could not retrieve transaction details'
        };
      }

      // Verify transfer to revenue wallet
      const revenueWalletPubkey = new PublicKey(revenueWallet);
      let transferFound = false;
      let transferAmount = 0;

      // Check all instructions for transfers to revenue wallet
      if (txDetails.meta?.postBalances && txDetails.meta?.preBalances) {
        const accountKeys = txDetails.transaction.message.accountKeys;
        
        for (let i = 0; i < accountKeys.length; i++) {
          const accountKey = accountKeys[i].pubkey.toString();
          
          if (accountKey === revenueWallet) {
            const balanceChange = txDetails.meta.postBalances[i] - txDetails.meta.preBalances[i];
            if (balanceChange > 0) {
              transferFound = true;
              transferAmount = balanceChange / 1e9; // Convert lamports to SOL
              break;
            }
          }
        }
      }

      if (!transferFound) {
        logger.error(`⚠️ Fee collection verification failed: No transfer to revenue wallet found`);
        return {
          success: false,
          error: 'No transfer to revenue wallet detected',
          signature
        };
      }

      // Verify amount (allow small discrepancy due to network fees)
      const amountDifference = Math.abs(transferAmount - expectedAmount);
      const tolerance = 0.000001; // 1 microSOL tolerance

      if (amountDifference > tolerance) {
        logger.warn(`⚠️ Fee amount mismatch: Expected ${expectedAmount} SOL, got ${transferAmount} SOL`);
        return {
          success: false,
          error: `Fee amount mismatch: expected ${expectedAmount} SOL, got ${transferAmount} SOL`,
          signature,
          expectedAmount,
          actualAmount: transferAmount
        };
      }

      logger.info(`✅ Fee collection verified: ${transferAmount.toFixed(9)} SOL to ${revenueWallet}`);

      return {
        success: true,
        verified: true,
        signature,
        amount: transferAmount,
        revenueWallet,
        timestamp: verification.timestamp
      };

    } catch (error) {
      logger.error('Fee collection verification error:', error);
      return {
        success: false,
        error: error.message,
        signature
      };
    }
  }

  /**
   * Get transaction status (simplified check)
   */
  async getTransactionStatus(signature) {
    try {
      const statuses = await this.solanaService.connection.getSignatureStatuses([signature]);
      const status = statuses?.value?.[0];

      if (!status) {
        return {
          found: false,
          confirmed: false,
          finalized: false
        };
      }

      return {
        found: true,
        confirmed: status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized',
        finalized: status.confirmationStatus === 'finalized',
        slot: status.slot,
        confirmations: status.confirmations,
        error: status.err
      };

    } catch (error) {
      logger.error('Error getting transaction status:', error);
      return {
        found: false,
        error: error.message
      };
    }
  }

  /**
   * Wait for transaction confirmation with timeout
   */
  async waitForConfirmation(signature, timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getTransactionStatus(signature);

      if (status.confirmed) {
        return {
          confirmed: true,
          finalized: status.finalized,
          signature
        };
      }

      if (status.error) {
        return {
          confirmed: false,
          error: status.error,
          signature
        };
      }

      // Wait 1 second before checking again
      await this.sleep(1000);
    }

    return {
      confirmed: false,
      error: 'Confirmation timeout',
      signature
    };
  }

  /**
   * Verify multiple transactions in batch
   */
  async verifyBatch(signatures) {
    logger.info(`Verifying batch of ${signatures.length} transactions`);

    const results = await Promise.all(
      signatures.map(sig => this.verifyTransaction(sig))
    );

    const summary = {
      total: results.length,
      verified: results.filter(r => r.verified).length,
      succeeded: results.filter(r => r.verified && r.succeeded).length,
      failed: results.filter(r => r.verified && !r.succeeded).length,
      unverified: results.filter(r => !r.verified).length,
      results
    };

    logger.info(`Batch verification complete: ${summary.succeeded}/${summary.total} succeeded`);

    return summary;
  }

  /**
   * Clear verification cache
   */
  clearCache() {
    const size = this.verificationCache.size;
    this.verificationCache.clear();
    logger.info(`Cleared ${size} cached verifications`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.verificationCache.size,
      entries: Array.from(this.verificationCache.entries()).map(([sig, data]) => ({
        signature: sig,
        verified: data.result.verified,
        succeeded: data.result.succeeded,
        cachedAt: new Date(data.timestamp)
      }))
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TransactionVerificationService;
