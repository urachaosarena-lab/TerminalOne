const axios = require('axios');
const dns = require('dns');
const { Transaction, VersionedTransaction, VersionedMessage, Keypair, SystemProgram, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');

class JupiterTradingService {
  constructor(solanaService, walletService, tokenMetadataService = null) {
    this.solanaService = solanaService;
    this.walletService = walletService;
    this.tokenMetadataService = tokenMetadataService;
    
    // Set DNS to Google DNS to avoid local DNS issues
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    
    // Request throttling to prevent rate limits
    this.requestQueue = [];
    this.isProcessingQueue = false;
    // Allow override via env var (e.g., 1500ms) to ease 429s
    this.minRequestInterval = parseInt(process.env.JUPITER_MIN_REQUEST_INTERVAL_MS || '1000', 10);
    this.lastRequestTime = 0;
    
    // Jupiter API endpoints with fallback
    this.endpoints = {
      primary: {
        quote: 'https://public.jupiterapi.com/quote',
        swap: 'https://public.jupiterapi.com/swap'
      },
      fallback: {
        quote: 'https://quote-api.jup.ag/v6/quote',
        swap: 'https://quote-api.jup.ag/v6/swap'
      }
    };
    
    // Well-known token mints
    this.tokenMints = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    };
    
    // Retry configuration - increased for better reliability
    this.retryConfig = {
      maxRetries: 5, // Increased from 3 to 5
      baseDelay: 2000, // 2 seconds (increased from 1s)
      maxDelay: 30000,  // 30 seconds (increased from 10s)
      backoffMultiplier: 2,
      slippageIncreasePerRetry: 2 // Increase slippage by 2% on each retry
    };
    
    // Priority fee configuration for faster transactions
    this.priorityFeeConfig = {
      // Auto mode lets Jupiter determine optimal priority fee
      mode: 'auto',
      // Fallback to manual if auto fails (in micro-lamports)
      fallbackMicroLamports: 100000 // 0.0001 SOL priority fee
    };
  }

  /**
   * Sleep utility for retry delays
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Throttle API requests to prevent rate limiting
   */
  async throttledRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      if (!this.isProcessingQueue) {
        this.processRequestQueue().catch(err => {
          logger.error('Failed to process Jupiter request queue:', err?.message || err);
        });
      }
    });
  }

  /**
   * Internal: process the queued Jupiter requests sequentially with spacing
   */
  async processRequestQueue() {
    this.isProcessingQueue = true;
    try {
      while (this.requestQueue.length > 0) {
        const { requestFn, resolve, reject } = this.requestQueue.shift();
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          const waitTime = this.minRequestInterval - timeSinceLastRequest;
          logger.debug(`Throttling Jupiter request: waiting ${waitTime}ms`);
          await this.sleep(waitTime);
        }

        try {
          this.lastRequestTime = Date.now();
          const result = await requestFn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
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
   * Check if error is non-retryable
   */
  isNonRetryableError(error) {
    const nonRetryablePatterns = [
      'No wallet found',
      'Insufficient balance',
      'Invalid token address',
      'Token not supported',
      'Invalid amount',
      'Token account not found', // Token account doesn't exist
      'Invalid public key', // Malformed addresses
      'Account does not exist' // Account validation failed
    ];
    
    const errorMessage = error.message.toLowerCase();
    return nonRetryablePatterns.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if error is RPC rate limit
   */
  isRateLimitError(error) {
    const errorStr = (error.message || '').toLowerCase();
    const responseData = error.response?.data?.message || '';
    const statusCode = error.response?.status;
    
    return statusCode === 429 ||
           errorStr.includes('429') || 
           errorStr.includes('rate limit') ||
           errorStr.includes('too many requests') ||
           responseData.includes('rate limit');
  }
  
  /**
   * Check if error is Jupiter API issue (temporary)
   */
  isJupiterAPIError(error) {
    const errorStr = (error.message || '').toLowerCase();
    const statusCode = error.response?.status;
    
    // Jupiter API errors that should be retried
    return statusCode >= 500 || // Server errors
           errorStr.includes('enotfound') || // DNS issues
           errorStr.includes('econnrefused') || // Connection refused
           errorStr.includes('timeout') || // Timeout errors
           errorStr.includes('network error') ||
           errorStr.includes('socket hang up');
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
          let delay = this.calculateBackoffDelay(attempt);
          
          // For RPC rate limits, use longer delay
          if (this.isRateLimitError(error)) {
            delay = Math.max(delay, 10000 + (attempt * 5000)); // Start at 10s, add 5s per attempt
            logger.warn(`Rate limit detected, waiting ${delay}ms before retry`, {
              userId,
              attempt: attempt + 1
            });
          }
          // For Jupiter API issues, use moderate delay
          else if (this.isJupiterAPIError(error)) {
            delay = Math.max(delay, 5000); // Minimum 5s for API issues
            logger.warn(`Jupiter API error detected, waiting ${delay}ms before retry`, {
              userId,
              attempt: attempt + 1,
              error: error.message
            });
          }
          
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
   * Verify wallet has sufficient balance for trade
   */
  async verifyBalanceForTrade(userId, requiredSOL) {
    const balanceInfo = await this.walletService.getWalletBalance(userId);
    if (!balanceInfo.hasWallet) {
      throw new Error('No wallet connected');
    }
    
    // Reserve 0.01 SOL for transaction fees and rent exemption
    const buffer = 0.01;
    const totalRequired = requiredSOL + buffer;
    
    if (balanceInfo.balance < totalRequired) {
      throw new Error(
        `Insufficient balance: need ${totalRequired.toFixed(4)} SOL (${requiredSOL.toFixed(4)} + ${buffer} buffer), ` +
        `but wallet has ${balanceInfo.balance.toFixed(4)} SOL`
      );
    }
    
    logger.info('Balance verification passed', {
      userId,
      required: requiredSOL,
      buffer,
      available: balanceInfo.balance
    });
    
    return true;
  }

  /**
   * Execute a buy trade (SOL -> Token)
   */
  async executeBuy(userId, { tokenAddress, solAmount, maxSlippage = 3 }) {
    let currentAttempt = 0;
    
    return await this.executeWithRetry(async () => {
      // Verify balance before attempting trade
      await this.verifyBalanceForTrade(userId, solAmount);
      
      // Increase slippage progressively on retries
      const adaptiveSlippage = maxSlippage + (currentAttempt * this.retryConfig.slippageIncreasePerRetry);
      if (currentAttempt > 0) {
        logger.info(`Retry attempt ${currentAttempt}: Increasing slippage to ${adaptiveSlippage}%`, { userId });
      }
      currentAttempt++;
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

      // Get quote from Jupiter with adaptive slippage
      const quote = await this.executeWithRetry(
        () => this.getJupiterQuote({
          inputMint: this.tokenMints.SOL, // SOL
          outputMint: tokenAddress,
          amount: lamportsAmount,
          slippageBps: adaptiveSlippage * 100 // Convert to basis points with adaptive slippage
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

      // Get swap transaction with full amount with retry
      const swapTransaction = await this.executeWithRetry(
        () => this.getJupiterSwapTransaction(quote, wallet.publicKey),
        'Jupiter Swap Transaction (Buy)',
        userId
      );
      if (!swapTransaction || !swapTransaction.swapTransaction) {
        logger.error('Invalid Jupiter swap transaction response:', { 
          swapTransaction, 
          tokenAddress, 
          solAmount 
        });
        throw new Error('Unable to get swap transaction from Jupiter. Please try again or increase slippage.');
      }
      
      // Execute the swap transaction with retry
      const result = await this.executeWithRetry(
        () => this.executeTransaction(wallet, swapTransaction.swapTransaction),
        'Solana Transaction (Buy)',
        userId
      );

      if (result.success) {
        // Get token metadata for correct decimals
        let tokenDecimals = 9; // Default
        if (this.tokenMetadataService) {
          try {
            const metadata = await this.tokenMetadataService.getTokenMetadata(tokenAddress, this.solanaService);
            tokenDecimals = metadata.decimals;
          } catch (e) {
            logger.warn(`Failed to get token decimals for ${tokenAddress}, using default 9`);
          }
        }
        
        // Calculate actual tokens received with correct decimals
        const tokensReceived = parseInt(quote.outAmount) / Math.pow(10, tokenDecimals);
        
        // Calculate platform fee from SOL amount
        const feeAmount = solAmount * 0.01; // 1% fee
        const actualFee = Math.max(feeAmount, 0.0005); // Minimum 0.0005 SOL fee
        
        logger.info(`Collecting platform fee after buy for user ${userId}:`, {
          solAmount: solAmount,
          feeAmount: actualFee
        });
        
        // Collect platform fee after successful swap
        const feeCollection = await this.collectPlatformFee(wallet, actualFee);
        if (!feeCollection.success) {
          logger.warn('Fee collection failed after swap:', feeCollection.error);
        }
        
        // Get current SOL/USD price for accurate price calculation
        let solPriceUSD = 200; // Fallback, should fetch from price service
        try {
          const solPriceData = await require('./EnhancedPriceService').prototype.getSolanaPrice.call({ cache: new Map() });
          if (solPriceData && solPriceData.price) {
            solPriceUSD = solPriceData.price;
          }
        } catch (e) {
          logger.warn('Failed to fetch SOL price, using fallback:', e.message);
        }
        
        // Calculate actual token price in USD
        const actualPriceUSD = (solAmount * solPriceUSD) / tokensReceived;

        return {
          success: true,
          txHash: result.txHash,
          feeCollectionTx: feeCollection.signature,
          tokensReceived: tokensReceived,
          actualPrice: actualPriceUSD, // Price in USD
          solSpent: solAmount, // Amount used for tokens
          grossSolSpent: solAmount, // Original amount
          platformFee: actualFee,
          priceImpact: quote.priceImpactPct,
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
    let currentAttempt = 0;
    
    return await this.executeWithRetry(async () => {
      // Increase slippage progressively on retries
      const adaptiveSlippage = maxSlippage + (currentAttempt * this.retryConfig.slippageIncreasePerRetry);
      if (currentAttempt > 0) {
        logger.info(`Retry attempt ${currentAttempt}: Increasing slippage to ${adaptiveSlippage}%`, { userId });
      }
      currentAttempt++;
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

      // Get token metadata for correct decimals
      let tokenDecimals = 9; // Default
      if (this.tokenMetadataService) {
        try {
          const metadata = await this.tokenMetadataService.getTokenMetadata(tokenAddress, this.solanaService);
          tokenDecimals = metadata.decimals;
        } catch (e) {
          logger.warn(`Failed to get token decimals for ${tokenAddress}, using default 9`);
        }
      }

      // Convert token amount with correct decimals
      const tokenAmountLamports = Math.floor(tokenAmount * Math.pow(10, tokenDecimals));

      logger.info(`Executing sell trade for user ${userId}:`, {
        tokenAddress,
        tokenAmount,
        tokenAmountLamports,
        maxSlippage
      });

      // Get quote from Jupiter with adaptive slippage
      const quote = await this.executeWithRetry(
        () => this.getJupiterQuote({
          inputMint: tokenAddress,
          outputMint: this.tokenMints.SOL, // SOL
          amount: tokenAmountLamports,
          slippageBps: adaptiveSlippage * 100 // Use adaptive slippage
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
    return this.throttledRequest(async () => {
      const params = {
        inputMint,
        outputMint,
        amount,
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
        // Optimized for reliable execution
        maxAccounts: 32, // Reduced from 64 - fewer accounts = more reliable routes
        minimizeSlippage: true, // Enable for better price execution
        onlyTopMarkets: true, // Use only reliable, high-liquidity markets
        platformFeeBps: 0 // No platform fee at quote level (handled separately)
      };
      
      // Try primary endpoint first with longer timeout
      try {
        const response = await axios.get(this.endpoints.primary.quote, {
          params,
          timeout: 30000, // Increased from 15s to 30s
          headers: {
            'User-Agent': 'TerminalOne-Bot/1.0'
          }
        });
        return response.data;
      } catch (primaryError) {
        logger.warn('Primary Jupiter endpoint failed, trying fallback:', primaryError.message);
        
        // Try fallback endpoint
        try {
          const response = await axios.get(this.endpoints.fallback.quote, {
            params,
            timeout: 30000, // Increased timeout
            headers: {
              'Host': 'quote-api.jup.ag',
              'User-Agent': 'TerminalOne-Bot/1.0'
            }
          });
          return response.data;
        } catch (fallbackError) {
          logger.error('Both Jupiter quote endpoints failed:', {
            primary: primaryError.message,
            fallback: fallbackError.message,
            primaryStatus: primaryError.response?.status,
            fallbackStatus: fallbackError.response?.status
          });
          throw new Error(`Jupiter quote endpoints failed (primary: ${primaryError.response?.status || primaryError.message}, fallback: ${fallbackError.response?.status || fallbackError.message})`);
        }
      }
    });
  }

  /**
   * Get swap transaction from Jupiter with fallback
   */
  async getJupiterSwapTransaction(quote, userPublicKey) {
    return this.throttledRequest(async () => {
      const swapData = {
        quoteResponse: quote,
        userPublicKey: userPublicKey,
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        // Add dynamic compute budget for complex swaps
        dynamicComputeUnitLimit: true,
        // Use ONLY prioritizationFeeLamports (mutually exclusive with computeUnitPriceMicroLamports)
        prioritizationFeeLamports: 'auto' // Let Jupiter optimize priority fees automatically
      };
      
      // Only add feeAccount if it's defined
      if (process.env.FEE_ACCOUNT) {
        swapData.feeAccount = process.env.FEE_ACCOUNT;
      }
      
      // Try primary endpoint first with longer timeout
      try {
        const response = await axios.post(this.endpoints.primary.swap, swapData, {
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'TerminalOne-Bot/1.0'
          },
          timeout: 30000 // Increased timeout to match quote endpoint
        });
        return response.data;
      } catch (primaryError) {
        logger.warn('Primary Jupiter swap endpoint failed, trying fallback:', primaryError.message);
        
        // Try fallback endpoint
        try {
          const response = await axios.post(this.endpoints.fallback.swap, swapData, {
            headers: { 
              'Content-Type': 'application/json',
              'Host': 'quote-api.jup.ag',
              'User-Agent': 'TerminalOne-Bot/1.0'
            },
            timeout: 30000 // Increased timeout
          });
          return response.data;
        } catch (fallbackError) {
          logger.error('Both Jupiter swap endpoints failed:', {
            primary: primaryError.message,
            fallback: fallbackError.message,
            fallbackStatus: fallbackError.response?.status,
            fallbackData: fallbackError.response?.data
          });
          throw new Error(`Jupiter swap endpoints failed (primary: ${primaryError.response?.status || primaryError.message}, fallback: ${fallbackError.response?.status || fallbackError.message})`);
        }
      }
    });
  }

  /**
   * Execute the transaction on Solana with enhanced reliability
   */
  async executeTransaction(wallet, swapTransactionBase64) {
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      attempt++;
      
      try {
        // Use executeWithFailover for RPC calls
        const connection = await this.solanaService.executeWithFailover(
          (conn) => Promise.resolve(conn),
          'Get Connection'
        );
        
        const swapTransactionBuffer = Buffer.from(swapTransactionBase64, 'base64');
        
        // Deserialize versioned transaction
        const transaction = VersionedTransaction.deserialize(swapTransactionBuffer);
        
        // ALWAYS get fresh blockhash (critical for reliability)
        logger.info(`🔄 Transaction attempt ${attempt}: Getting fresh blockhash`);
        const { blockhash, lastValidBlockHeight } = await this.solanaService.executeWithFailover(
          (conn) => conn.getLatestBlockhash('finalized'),
          'Get Latest Blockhash'
        );
        transaction.message.recentBlockhash = blockhash;
        
        // Sign the transaction
        const keyPair = wallet.keyPair;
        transaction.sign([keyPair]);
        
        // Send the transaction with optimized settings and failover support
        logger.info(`🚀 Sending transaction (attempt ${attempt}/${maxAttempts})...`);
        const signature = await this.solanaService.executeWithFailover(
          (conn) => conn.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false, // Always use preflight for safety with premium RPC
            maxRetries: 5,
            preflightCommitment: 'confirmed'
          }),
          'Send Transaction'
        );

        logger.info(`✅ Transaction sent: ${signature}`);

        // Wait for confirmation with timeout and failover
        const confirmationPromise = this.solanaService.executeWithFailover(
          (conn) => conn.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight
          }, 'confirmed'),
          'Confirm Transaction'
        );
        
        // Add 60s timeout for confirmation
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
        );
        
        const confirmation = await Promise.race([confirmationPromise, timeoutPromise]);
        
        if (confirmation.value && confirmation.value.err) {
          const errorStr = JSON.stringify(confirmation.value.err);
          logger.error(`Transaction failed on-chain: ${errorStr}`);
          
          // Don't retry on these specific errors
          if (errorStr.includes('InsufficientFunds') || 
              errorStr.includes('AccountNotFound')) {
            return {
              success: false,
              error: `Transaction failed: ${errorStr}`
            };
          }
          
          // Retry on other errors
          if (attempt < maxAttempts) {
            logger.warn(`Retrying transaction after error...`);
            await this.sleep(2000 * attempt); // Increasing delay
            continue;
          }
          
          throw new Error(`Transaction failed: ${errorStr}`);
        }

        logger.info(`Transaction confirmed: ${signature}`);

        return {
          success: true,
          txHash: signature
        };

      } catch (error) {
        logger.error(`Transaction execution failed (attempt ${attempt}/${maxAttempts}):`, error.message);
        
        // Check if we should retry
        const shouldRetry = 
          attempt < maxAttempts &&
          !error.message.includes('InsufficientFunds') &&
          !error.message.includes('AccountNotFound') &&
          (error.message.includes('timeout') ||
           error.message.includes('block height exceeded') ||
           error.message.includes('blockhash not found') ||
           error.message.includes('429'));
        
        if (shouldRetry) {
          logger.info(`Waiting before retry attempt ${attempt + 1}...`);
          await this.sleep(3000 * attempt); // Increasing delay: 3s, 6s, 9s
          continue;
        }
        
        return {
          success: false,
          error: error.message
        };
      }
    }
    
    return {
      success: false,
      error: `Transaction failed after ${maxAttempts} attempts`
    };
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
      const REVENUE_WALLET = 'GgnqWs2X52UTeZMn478A5xkLQMXdKR8G2Qf1RHR8gKz8';
      
      // Check wallet balance first with failover
      const balance = await this.solanaService.executeWithFailover(
        (conn) => conn.getBalance(new PublicKey(wallet.publicKey)),
        'Get Balance for Fee'
      );
      const feeInLamports = Math.floor(feeAmount * 1e9);
      // Rent exemption for account (~0.002 SOL) + transaction fee (~0.000005 SOL) + safety buffer
      const rentExemption = 2500000; // 0.0025 SOL minimum to keep account rent-exempt
      
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
      
      // Get recent blockhash with failover
      const { blockhash, lastValidBlockHeight } = await this.solanaService.executeWithFailover(
        (conn) => conn.getLatestBlockhash('confirmed'),
        'Get Blockhash for Fee'
      );
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(wallet.publicKey);
      
      // Sign and send the fee transaction with failover
      // Skip preflight to avoid simulation errors with uninitialized destination accounts
      transaction.sign(wallet.keyPair);
      const feeSignature = await this.solanaService.executeWithFailover(
        (conn) => conn.sendRawTransaction(transaction.serialize(), {
          skipPreflight: true, // Skip simulation to avoid rent errors
          maxRetries: 3
        }),
        'Send Fee Transaction'
      );
      
      // Wait for confirmation with failover
      await this.solanaService.executeWithFailover(
        (conn) => conn.confirmTransaction({
          signature: feeSignature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed'),
        'Confirm Fee Transaction'
      );
      
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
