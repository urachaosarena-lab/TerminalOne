const axios = require('axios');
const dns = require('dns');
const { Transaction, VersionedTransaction, VersionedMessage, Keypair, SystemProgram, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');

class JupiterTradingService {
  constructor(solanaService, walletService) {
    this.solanaService = solanaService;
    this.walletService = walletService;
    
    // Set DNS to Google DNS to avoid local DNS issues
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    
    // Jupiter API endpoints with fallback
    this.endpoints = {
      primary: {
        quote: 'https://quote-api.jup.ag/v6/quote',
        swap: 'https://quote-api.jup.ag/v6/swap'
      },
      fallback: {
        quote: 'https://104.21.18.74/v6/quote',
        swap: 'https://104.21.18.74/v6/swap'
      }
    };
    
    // Well-known token mints
    this.tokenMints = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    };
    
    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 10000,  // 10 seconds
      backoffMultiplier: 2
    };
  }

  /**
   * Sleep utility for retry delays
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoffDelay(attempt) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelay
    );
    return delay + Math.random() * 1000; // Add jitter
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry(operation, operationName, userId = null) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          logger.info(`${operationName} succeeded on retry attempt ${attempt}`, { userId });
        }
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          logger.error(`${operationName} failed with non-retryable error:`, {
            userId,
            error: error.message,
            attempt: attempt + 1
          });
          throw error;
        }
        
        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          logger.warn(`${operationName} failed, retrying in ${delay}ms:`, {
            userId,
            error: error.message,
            attempt: attempt + 1,
            maxRetries: this.retryConfig.maxRetries
          });
          await this.sleep(delay);
        } else {
          logger.error(`${operationName} failed after ${this.retryConfig.maxRetries} retries:`, {
            userId,
            error: error.message
          });
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Check if error is non-retryable
   */
  isNonRetryableError(error) {
    const nonRetryablePatterns = [
      'No wallet found',
      'Insufficient balance',
      'Invalid token address',
      'Token not supported',
      'Invalid amount',
      'Slippage too high',
      'Price impact too high'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return nonRetryablePatterns.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Execute a buy trade (SOL -> Token)
   */
  async executeBuy(userId, { tokenAddress, solAmount, maxSlippage = 3 }) {
    return await this.executeWithRetry(async () => {
      const walletData = this.walletService.getUserWallet(userId);
      if (!walletData) {
        throw new Error('No wallet found for user');
      }
      
      // Create keypair from stored private key
      const privateKeyBuffer = Buffer.from(walletData.privateKey, 'base64');
      const keyPair = Keypair.fromSecretKey(privateKeyBuffer);
      
      const wallet = {
        publicKey: walletData.publicKey,
        keyPair: keyPair
      };

      // Convert SOL amount to lamports (1 SOL = 1e9 lamports)
      const lamportsAmount = Math.floor(solAmount * 1e9);

      logger.info(`Executing buy trade for user ${userId}:`, {
        tokenAddress,
        solAmount,
        lamportsAmount,
        maxSlippage
      });

      // Get quote from Jupiter with retry
      const quote = await this.executeWithRetry(
        () => this.getJupiterQuote({
          inputMint: this.tokenMints.SOL, // SOL
          outputMint: tokenAddress,
          amount: lamportsAmount,
          slippageBps: maxSlippage * 100 // Convert to basis points
        }),
        'Jupiter Quote (Buy)',
        userId
      );

      if (!quote || !quote.outAmount) {
        logger.error('Invalid Jupiter quote response:', { quote, tokenAddress, amount: lamportsAmount });
        throw new Error(`Unable to get quote from Jupiter. Token may not be tradable or have insufficient liquidity.`);
      }

      logger.info('Jupiter quote received:', {
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct
      });

      // Calculate and collect platform fee before swap
      const feeAmount = solAmount * 0.01; // 1% fee
      const netSolAmount = solAmount - Math.max(feeAmount, 0.0005); // Minimum 0.0005 SOL fee
      const actualFee = solAmount - netSolAmount;
      
      // Log fee collection
      logger.info(`Collecting platform fee for user ${userId}:`, {
        originalAmount: solAmount,
        feeAmount: actualFee,
        netAmount: netSolAmount
      });
      
      // Update quote with net amount (after fee) with retry
      const netQuote = await this.executeWithRetry(
        () => this.getJupiterQuote({
          inputMint: this.tokenMints.SOL,
          outputMint: tokenAddress,
          amount: Math.floor(netSolAmount * 1e9),
          slippageBps: maxSlippage * 100
        }),
        'Jupiter Net Quote (Buy)',
        userId
      );
      
      if (!netQuote) {
        throw new Error('Unable to get quote from Jupiter for net amount');
      }
      
      // Get swap transaction with net amount with retry
      const swapTransaction = await this.executeWithRetry(
        () => this.getJupiterSwapTransaction(netQuote, wallet.publicKey),
        'Jupiter Swap Transaction (Buy)',
        userId
      );
      if (!swapTransaction || !swapTransaction.swapTransaction) {
        logger.error('Invalid Jupiter swap transaction response:', { 
          swapTransaction, 
          tokenAddress, 
          netAmount: netSolAmount 
        });
        throw new Error('Unable to get swap transaction from Jupiter. Please try again or increase slippage.');
      }

      // Collect platform fee first
      const feeCollection = await this.collectPlatformFee(wallet, actualFee);
      if (!feeCollection.success) {
        logger.warn('Fee collection failed, proceeding with swap:', feeCollection.error);
      }
      
      // Execute the swap transaction with retry
      const result = await this.executeWithRetry(
        () => this.executeTransaction(wallet, swapTransaction.swapTransaction),
        'Solana Transaction (Buy)',
        userId
      );

      if (result.success) {
        // Calculate actual tokens received (from net quote)
        const tokensReceived = parseInt(netQuote.outAmount) / 1e6; // Adjust decimals based on token
        
        // Get current SOL/USD price for accurate price calculation
        const solPriceUSD = 200; // Fallback, should fetch from price service
        try {
          const solPriceData = await require('./EnhancedPriceService').prototype.getSolanaPrice.call({ cache: new Map() });
          if (solPriceData && solPriceData.price) {
            solPriceUSD = solPriceData.price;
          }
        } catch (e) {
          logger.warn('Failed to fetch SOL price, using fallback:', e.message);
        }
        
        // Calculate actual token price in USD
        const actualPriceUSD = (netSolAmount * solPriceUSD) / tokensReceived;

        return {
          success: true,
          txHash: result.txHash,
          feeCollectionTx: feeCollection.signature,
          tokensReceived: tokensReceived,
          actualPrice: actualPriceUSD, // Price in USD
          solSpent: netSolAmount, // Net amount actually used for tokens
          grossSolSpent: solAmount, // Original amount including fees
          platformFee: actualFee,
          priceImpact: netQuote.priceImpactPct,
          timestamp: new Date()
        };
      }
      throw new Error(result.error);

    }, `Buy Trade (${tokenAddress})`, userId);
  }

  /**
   * Execute a sell trade (Token -> SOL)
   */
  async executeSell(userId, { tokenAddress, tokenAmount, maxSlippage = 3 }) {
    return await this.executeWithRetry(async () => {
      const walletData = this.walletService.getUserWallet(userId);
      if (!walletData) {
        throw new Error('No wallet found for user');
      }
      
      // Create keypair from stored private key
      const privateKeyBuffer = Buffer.from(walletData.privateKey, 'base64');
      const keyPair = Keypair.fromSecretKey(privateKeyBuffer);
      
      const wallet = {
        publicKey: walletData.publicKey,
        keyPair: keyPair
      };

      // Convert token amount (adjust for token decimals)
      const tokenAmountLamports = Math.floor(tokenAmount * 1e6); // Assume 6 decimals

      logger.info(`Executing sell trade for user ${userId}:`, {
        tokenAddress,
        tokenAmount,
        tokenAmountLamports,
        maxSlippage
      });

      // Get quote from Jupiter with retry
      const quote = await this.executeWithRetry(
        () => this.getJupiterQuote({
          inputMint: tokenAddress,
          outputMint: this.tokenMints.SOL, // SOL
          amount: tokenAmountLamports,
          slippageBps: maxSlippage * 100
        }),
        'Jupiter Quote (Sell)',
        userId
      );

      if (!quote) {
        throw new Error('Unable to get quote from Jupiter');
      }

      logger.info('Jupiter sell quote received:', {
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct
      });

      // Get swap transaction with retry
      const swapTransaction = await this.executeWithRetry(
        () => this.getJupiterSwapTransaction(quote, wallet.publicKey),
        'Jupiter Swap Transaction (Sell)',
        userId
      );
      if (!swapTransaction) {
        throw new Error('Unable to get swap transaction from Jupiter');
      }

      // Execute the transaction with retry
      const result = await this.executeWithRetry(
        () => this.executeTransaction(wallet, swapTransaction.swapTransaction),
        'Solana Transaction (Sell)',
        userId
      );

      if (result.success) {
        // Calculate gross SOL received from Jupiter
        const grossSolReceived = parseInt(quote.outAmount) / 1e9; // Convert lamports to SOL
        
        // Calculate platform fee
        const feeAmount = grossSolReceived * 0.01; // 1% fee
        const actualFee = Math.max(feeAmount, 0.0005); // Minimum 0.0005 SOL fee
        const netSolReceived = grossSolReceived - actualFee;
        
        logger.info(`Collecting platform fee on sell for user ${userId}:`, {
          grossSolReceived: grossSolReceived,
          feeAmount: actualFee,
          netSolReceived: netSolReceived
        });
        
        // Collect platform fee
        const feeCollection = await this.collectPlatformFee(wallet, actualFee);
        if (!feeCollection.success) {
          logger.warn('Fee collection failed on sell:', feeCollection.error);
        }
        
        const actualPrice = netSolReceived / tokenAmount;

        return {
          success: true,
          txHash: result.txHash,
          feeCollectionTx: feeCollection.signature,
          solReceived: netSolReceived, // Net amount after fees
          grossSolReceived: grossSolReceived, // Gross amount before fees
          platformFee: actualFee,
          actualPrice: actualPrice,
          tokensSold: tokenAmount,
          priceImpact: quote.priceImpactPct,
          timestamp: new Date()
        };
      } else {
        throw new Error(result.error);
      }

    }, `Sell Trade (${tokenAddress})`, userId);
  }

  /**
   * Get quote from Jupiter API with fallback
   */
  async getJupiterQuote({ inputMint, outputMint, amount, slippageBps = 100 }) {
    const params = {
      inputMint,
      outputMint,
      amount,
      slippageBps,
      onlyDirectRoutes: false,
      asLegacyTransaction: false
    };
    
    // Try primary endpoint first
    try {
      const response = await axios.get(this.endpoints.primary.quote, {
        params,
        timeout: 15000
      });
      return response.data;
    } catch (primaryError) {
      logger.warn('Primary Jupiter endpoint failed, trying fallback:', primaryError.message);
      
      // Try fallback endpoint
      try {
        const response = await axios.get(this.endpoints.fallback.quote, {
          params,
          timeout: 15000,
          headers: {
            'Host': 'quote-api.jup.ag'
          }
        });
        return response.data;
      } catch (fallbackError) {
        logger.error('Both Jupiter endpoints failed:', {
          primary: primaryError.message,
          fallback: fallbackError.message
        });
        return null;
      }
    }
  }

  /**
   * Get swap transaction from Jupiter with fallback
   */
  async getJupiterSwapTransaction(quote, userPublicKey) {
    const swapData = {
      quoteResponse: quote,
      userPublicKey: userPublicKey,
      wrapAndUnwrapSol: true,
      useSharedAccounts: true,
      computeUnitPriceMicroLamports: 'auto'
    };
    
    // Only add feeAccount if it's defined
    if (process.env.FEE_ACCOUNT) {
      swapData.feeAccount = process.env.FEE_ACCOUNT;
    }
    
    // Try primary endpoint first
    try {
      const response = await axios.post(this.endpoints.primary.swap, swapData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data;
    } catch (primaryError) {
      logger.warn('Primary Jupiter swap endpoint failed, trying fallback:', primaryError.message);
      
      // Try fallback endpoint
      try {
        const response = await axios.post(this.endpoints.fallback.swap, swapData, {
          headers: { 
            'Content-Type': 'application/json',
            'Host': 'quote-api.jup.ag'
          },
          timeout: 15000
        });
        return response.data;
      } catch (fallbackError) {
        logger.error('Both Jupiter swap endpoints failed:', {
          primary: primaryError.message,
          fallback: fallbackError.message,
          fallbackStatus: fallbackError.response?.status,
          fallbackData: fallbackError.response?.data
        });
        return null;
      }
    }
  }

  /**
   * Execute the transaction on Solana
   */
  async executeTransaction(wallet, swapTransactionBase64) {
    try {
      const swapTransactionBuffer = Buffer.from(swapTransactionBase64, 'base64');
      
      // Deserialize versioned transaction
      const transaction = VersionedTransaction.deserialize(swapTransactionBuffer);
      
      // Sign the transaction
      const keyPair = wallet.keyPair;
      transaction.sign([keyPair]);
      
      // Send the transaction
      const connection = this.solanaService.connection;
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3
      });

      logger.info('Transaction sent:', signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      logger.info('Transaction confirmed:', signature);

      return {
        success: true,
        txHash: signature
      };

    } catch (error) {
      logger.error('Transaction execution failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if token has sufficient liquidity for trading
   */
  async checkLiquidity(tokenAddress, requiredAmount) {
    try {
      // Try to get a quote for the required amount
      const quote = await this.getJupiterQuote({
        inputMint: this.tokenMints.SOL,
        outputMint: tokenAddress,
        amount: Math.floor(requiredAmount * 1e9), // Convert SOL to lamports
        slippageBps: 500 // 5% slippage tolerance for liquidity check
      });

      if (!quote) {
        return { hasLiquidity: false, reason: 'No quote available' };
      }

      // Check price impact - if too high, liquidity is insufficient
      const priceImpact = parseFloat(quote.priceImpactPct || 0);
      if (priceImpact > 10) { // 10% price impact threshold
        return { 
          hasLiquidity: false, 
          reason: `Price impact too high: ${priceImpact}%`,
          priceImpact 
        };
      }

      return {
        hasLiquidity: true,
        priceImpact,
        estimatedOutput: quote.outAmount
      };

    } catch (error) {
      logger.error('Liquidity check failed:', error);
      return { hasLiquidity: false, reason: error.message };
    }
  }

  /**
   * Get current market price for a token pair
   */
  async getMarketPrice(inputMint, outputMint, amount = 1e9) {
    try {
      const quote = await this.getJupiterQuote({
        inputMint,
        outputMint,
        amount
      });

      if (!quote) {
        return null;
      }

      return {
        price: parseFloat(quote.outAmount) / amount,
        priceImpact: quote.priceImpactPct,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Market price fetch failed:', error);
      return null;
    }
  }

  /**
   * Collect platform fee by sending SOL to revenue wallet
   */
  async collectPlatformFee(wallet, feeAmount) {
    try {
      const REVENUE_WALLET = 'BgvbtjrHc1ciRmrPkRBHG3cqcxh14qussJaFtTG1XArK';
      const connection = this.solanaService.connection;
      
      // Check wallet balance first
      const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
      const feeInLamports = Math.floor(feeAmount * 1e9);
      const rentExemption = 5000; // 0.000005 SOL for rent exemption
      
      if (balance < feeInLamports + rentExemption) {
        logger.warn(`Insufficient balance for fee collection:`, {
          balance: balance / 1e9,
          feeAmount,
          required: (feeInLamports + rentExemption) / 1e9
        });
        return {
          success: false,
          error: 'Insufficient balance for fee'
        };
      }
      
      // Create fee transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(wallet.publicKey),
          toPubkey: new PublicKey(REVENUE_WALLET),
          lamports: feeInLamports
        })
      );
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(wallet.publicKey);
      
      // Sign and send the fee transaction
      transaction.sign(wallet.keyPair);
      const feeSignature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 2
      });
      
      // Wait for confirmation
      await connection.confirmTransaction({
        signature: feeSignature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      logger.info(`Platform fee collected:`, {
        amount: feeAmount,
        signature: feeSignature,
        revenueWallet: REVENUE_WALLET
      });
      
      return {
        success: true,
        signature: feeSignature,
        amount: feeAmount
      };
      
    } catch (error) {
      logger.error('Failed to collect platform fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = JupiterTradingService;
