require('dotenv').config();

module.exports = {
  // Telegram Bot Configuration
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatIds: process.env.ADMIN_CHAT_IDS?.split(',').map(id => parseInt(id.trim())) || [],
    
    // Webhook configuration
    useWebhook: process.env.USE_WEBHOOK === 'true',
    webhookDomain: process.env.WEBHOOK_DOMAIN, // e.g., https://terminalonebot.com
    webhookPath: process.env.WEBHOOK_PATH || '/telegram/webhook',
    webhookPort: parseInt(process.env.WEBHOOK_PORT) || 3000,
    webhookSecret: process.env.WEBHOOK_SECRET || null,
  },

  // Solana Configuration
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    fallbackRpcUrls: process.env.SOLANA_RPC_FALLBACK_URLS?.split(',').map(url => url.trim()) || [
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com'
    ],
    wsUrl: process.env.SOLANA_WS_URL || null,
    jitoRpcUrl: process.env.JITO_RPC_URL || 'https://mainnet.block-engine.jup.ag',
    jitoAuthKeypair: process.env.JITO_AUTH_KEYPAIR || null,
    network: process.env.SOLANA_NETWORK || 'mainnet-beta', // MAINNET for production
    commitment: 'confirmed',
    maxRetries: 3,
    timeout: 30000, // 30 seconds
    confirmTimeout: 60000, // 60 seconds for transaction confirmation
  },

  // Bot Configuration
  bot: {
    environment: process.env.NODE_ENV || 'production', // Production default
    logLevel: process.env.LOG_LEVEL || 'info',
    port: process.env.PORT || 3000,
    maxConcurrentUsers: 1000,
    rateLimitWindowMs: 60000, // 1 minute
    rateLimitMaxRequests: 30, // 30 requests per minute per user
  },

  // Production Configuration
  production: {
    enableMetrics: true,
    enableHealthCheck: true,
    errorReporting: {
      enabled: true,
      webhookUrl: process.env.ERROR_WEBHOOK_URL,
    },
    monitoring: {
      enabled: true,
      interval: 30000, // 30 seconds
      alertThresholds: {
        errorRate: 0.05, // 5% error rate
        responseTime: 5000, // 5 seconds
        memoryUsage: 0.9, // 90% memory usage
      },
    },
  },

  // API Configuration
  api: {
    coingecko: process.env.COINGECKO_API_KEY,
    jupiter: process.env.JUPITER_API_KEY,
  },

  // Database Configuration (for future use)
  database: {
    url: process.env.DATABASE_URL,
  },

  // Vault & Bounty Configuration
  vault: {
    // Vault wallet for fee collection
    publicKey: process.env.VAULT_PUBLIC_KEY || 'GgnqWs2X52UTeZMn478A5xkLQMXdKR8G2Qf1RHR8gKz8',
    mnemonic: process.env.VAULT_MNEMONIC,
    
    // Fee structure
    feePercentage: 0.01, // 1% fee
    minimumFeeSol: 0.0005, // Minimum 0.0005 SOL per transaction
    
    // Bounty configuration
    bountyChance: 400, // 1 in 400 chance (0.25%)
    bountyPayoutPercent: 0.5, // 50% of vault goes to winner
  },

  // $MIRA Token Configuration
  mira: {
    tokenAddress: '2uk6wbuauQSkxXfoFPmfG8c9GQuzkJJDCUYUZ4b2pump',
  },
};
