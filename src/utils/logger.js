const winston = require('winston');
const config = require('../../config/config');
const path = require('path');

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

const logger = winston.createLogger({
  level: config.bot.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'terminalone-bot' },
  transports: [
    // Error logs
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    
    // Combined logs
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    
    // Transaction logs (separate file for easy debugging)
    new winston.transports.File({
      filename: 'logs/transactions.log',
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      )
    }),
    
    // User action logs
    new winston.transports.File({
      filename: 'logs/user-actions.log',
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    
    // Security logs
    new winston.transports.File({
      filename: 'logs/security.log',
      level: 'warn',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (config.bot.environment !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      customFormat
    )
  }));
}

// Helper methods for structured logging
logger.logTransaction = (userId, action, details) => {
  logger.info('TRANSACTION', {
    userId,
    action,
    ...details,
    timestamp: new Date().toISOString()
  });
};

logger.logUserAction = (userId, action, details = {}) => {
  logger.info('USER_ACTION', {
    userId,
    action,
    ...details,
    timestamp: new Date().toISOString()
  });
};

logger.logFeeCollection = (userId, amount, txSignature, status) => {
  logger.info('FEE_COLLECTION', {
    userId,
    amount,
    txSignature,
    status,
    timestamp: new Date().toISOString()
  });
};

logger.logSecurity = (event, details) => {
  logger.warn('SECURITY_EVENT', {
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

logger.logError = (context, error, details = {}) => {
  logger.error('ERROR', {
    context,
    error: error.message,
    stack: error.stack,
    ...details,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;
