const { Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');

class RevenueService {
  constructor(solanaService) {
    this.solanaService = solanaService;
    
    // Revenue collection wallet
    this.REVENUE_WALLET = 'GgnqWs2X52UTeZMn478A5xkLQMXdKR8G2Qf1RHR8gKz8'; // TerminalOne Revenue Wallet
    
    // Fee configuration
    this.TRANSACTION_FEE_PERCENTAGE = 0.01; // 1% fee
    this.MINIMUM_FEE_SOL = 0.0005; // Minimum 0.0005 SOL fee
    this.MAXIMUM_FEE_SOL = 0.1; // Maximum 0.1 SOL fee per transaction
    
    // Revenue tracking
    this.dailyRevenue = new Map(); // date -> revenue amount
    this.userFeesPaid = new Map(); // userId -> total fees paid
  }

  /**
   * Calculate fee for a transaction
   */
  calculateTransactionFee(transactionAmountSOL) {
    const feeAmount = transactionAmountSOL * this.TRANSACTION_FEE_PERCENTAGE;
    
    // Apply minimum and maximum limits
    const clampedFee = Math.max(
      this.MINIMUM_FEE_SOL,
      Math.min(feeAmount, this.MAXIMUM_FEE_SOL)
    );
    
    return {
      feeAmount: clampedFee,
      feePercentage: (clampedFee / transactionAmountSOL) * 100,
      netAmount: transactionAmountSOL - clampedFee
    };
  }

  /**
   * Create fee collection instruction for a transaction
   */
  createFeeInstruction(payerPublicKey, feeAmount) {
    try {
      const revenueWallet = new PublicKey(this.REVENUE_WALLET);
      const payer = new PublicKey(payerPublicKey);
      
      // Convert SOL to lamports
      const lamports = Math.floor(feeAmount * 1e9);
      
      // Create transfer instruction
      const feeInstruction = SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: revenueWallet,
        lamports
      });
      
      return feeInstruction;
    } catch (error) {
      logger.error('Error creating fee instruction:', error);
      throw new Error('Failed to create fee instruction');
    }
  }

  /**
   * Process transaction with fee collection
   */
  async processTransactionWithFee(userId, transactionData) {
    try {
      const { amount: transactionAmountSOL, userWallet } = transactionData;
      
      // Calculate fee
      const feeCalculation = this.calculateTransactionFee(transactionAmountSOL);
      
      logger.info(`Processing transaction with fee for user ${userId}:`, {
        originalAmount: transactionAmountSOL,
        feeAmount: feeCalculation.feeAmount,
        netAmount: feeCalculation.netAmount
      });

      // Create fee collection instruction
      const feeInstruction = this.createFeeInstruction(
        userWallet.publicKey, 
        feeCalculation.feeAmount
      );

      // Record revenue
      await this.recordRevenue(userId, feeCalculation.feeAmount);
      
      return {
        success: true,
        feeInstruction,
        feeCalculation,
        message: `Transaction fee: ${feeCalculation.feeAmount.toFixed(6)} SOL (${feeCalculation.feePercentage.toFixed(2)}%)`
      };

    } catch (error) {
      logger.error('Error processing transaction with fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Record revenue for tracking
   */
  async recordRevenue(userId, feeAmount) {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Track daily revenue
      const currentDailyRevenue = this.dailyRevenue.get(today) || 0;
      this.dailyRevenue.set(today, currentDailyRevenue + feeAmount);
      
      // Track user fees
      const currentUserFees = this.userFeesPaid.get(userId) || 0;
      this.userFeesPaid.set(userId, currentUserFees + feeAmount);
      
      logger.info(`Recorded revenue: ${feeAmount.toFixed(6)} SOL from user ${userId}`);
      
    } catch (error) {
      logger.error('Error recording revenue:', error);
    }
  }

  /**
   * Get revenue statistics
   */
  getRevenueStats() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Calculate totals
    let totalRevenue = 0;
    let totalTransactions = 0;
    
    for (const [date, revenue] of this.dailyRevenue) {
      totalRevenue += revenue;
      totalTransactions++;
    }
    
    // Calculate user statistics
    const totalUsers = this.userFeesPaid.size;
    const averageFeePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;
    
    return {
      totalRevenue: totalRevenue.toFixed(6),
      totalTransactions,
      totalUsers,
      averageFeePerUser: averageFeePerUser.toFixed(6),
      todayRevenue: (this.dailyRevenue.get(today) || 0).toFixed(6),
      yesterdayRevenue: (this.dailyRevenue.get(yesterday) || 0).toFixed(6),
      revenueWallet: this.REVENUE_WALLET,
      feePercentage: this.TRANSACTION_FEE_PERCENTAGE * 100,
      minimumFee: this.MINIMUM_FEE_SOL,
      maximumFee: this.MAXIMUM_FEE_SOL
    };
  }

  /**
   * Get user fee history
   */
  getUserFeeHistory(userId) {
    const totalPaid = this.userFeesPaid.get(userId) || 0;
    
    return {
      userId,
      totalFeesPaid: totalPaid.toFixed(6),
      averageTransactionFee: '~0.005', // Estimate based on typical usage
      feePercentage: this.TRANSACTION_FEE_PERCENTAGE * 100
    };
  }

  /**
   * Return all revenue records as an array with timestamps and fee amounts
   */
  getAllRevenue() {
    const records = [];
    for (const [date, revenue] of this.dailyRevenue) {
      // Create a timestamp at 00:00:00 UTC for the given date string
      const timestamp = new Date(`${date}T00:00:00.000Z`).toISOString();
      records.push({ timestamp, feeAmount: revenue });
    }
    return records;
  }

  /**
   * Calculate fee preview for user
   */
  previewTransactionFee(transactionAmountSOL) {
    const fee = this.calculateTransactionFee(transactionAmountSOL);
    
    return {
      originalAmount: `${transactionAmountSOL.toFixed(6)} SOL`,
      feeAmount: `${fee.feeAmount.toFixed(6)} SOL`,
      feePercentage: `${fee.feePercentage.toFixed(2)}%`,
      netAmount: `${fee.netAmount.toFixed(6)} SOL`,
      revenueWallet: this.REVENUE_WALLET
    };
  }

  /**
   * Update revenue wallet address
   */
  updateRevenueWallet(newWalletAddress) {
    try {
      // Validate the new wallet address
      new PublicKey(newWalletAddress);
      
      const oldWallet = this.REVENUE_WALLET;
      this.REVENUE_WALLET = newWalletAddress;
      
      logger.info(`Revenue wallet updated from ${oldWallet} to ${newWalletAddress}`);
      
      return {
        success: true,
        message: `Revenue wallet updated to ${newWalletAddress}`
      };
      
    } catch (error) {
      logger.error('Invalid wallet address:', error);
      return {
        success: false,
        error: 'Invalid wallet address format'
      };
    }
  }

  /**
   * Toggle fee collection (for testing)
   */
  setFeeEnabled(enabled) {
    this.feeEnabled = enabled;
    logger.info(`Fee collection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get formatted fee display for UI
   */
  formatFeeDisplay(transactionAmountSOL) {
    const fee = this.calculateTransactionFee(transactionAmountSOL);
    
    return {
      summary: `💰 **Transaction Fee:** ${fee.feeAmount.toFixed(6)} SOL (${fee.feePercentage.toFixed(2)}%)`,
      details: `
📊 **Fee Breakdown:**
• Original Amount: ${transactionAmountSOL.toFixed(6)} SOL
• Platform Fee: ${fee.feeAmount.toFixed(6)} SOL
• You Receive: ${fee.netAmount.toFixed(6)} SOL

💡 **Revenue supports development & operations**
      `,
      netAmount: fee.netAmount
    };
  }

  /**
   * Export revenue data (for accounting)
   */
  exportRevenueData(startDate, endDate) {
    const data = [];
    
    for (const [date, revenue] of this.dailyRevenue) {
      if (date >= startDate && date <= endDate) {
        data.push({
          date,
          revenue: revenue.toFixed(6),
          revenueUSD: (revenue * 150).toFixed(2), // Assuming ~$150 SOL (update with real price)
        });
      }
    }
    
    return {
      period: `${startDate} to ${endDate}`,
      totalDays: data.length,
      totalRevenue: data.reduce((sum, day) => sum + parseFloat(day.revenue), 0).toFixed(6),
      data
    };
  }
}

module.exports = RevenueService;