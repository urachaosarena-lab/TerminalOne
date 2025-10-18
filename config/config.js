require('dotenv').config();

module.exports = {
  // Telegram Bot Configuration
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatIds: process.env.ADMIN_CHAT_IDS?.split(',').map(id => parseInt(id.trim())) || [],
  },

  // Solana Configuration
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    network: process.env.SOLANA_NETWORK || 'mainnet-beta', // MAINNET for production
    commitment: 'confirmed',
    maxRetries: 3,
    timeout: 30000, // 30 seconds
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
};