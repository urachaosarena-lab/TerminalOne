/**
 * UI Helper Functions
 * Provides consistent formatting and display utilities across all bot panels
 */

/**
 * Format SOL amount with consistent precision
 * @param {number} amount - SOL amount
 * @returns {string} Formatted SOL amount (X.XXXX SOL)
 */
function formatSOL(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '0.0000 SOL';
  }
  return `${amount.toFixed(4)} SOL`;
}

/**
 * Format percentage with consistent precision
 * @param {number} percent - Percentage value
 * @returns {string} Formatted percentage (X.XX%)
 */
function formatPercent(percent) {
  if (typeof percent !== 'number' || isNaN(percent)) {
    return '0.00%';
  }
  return `${percent.toFixed(2)}%`;
}

/**
 * Format USD amount with consistent precision
 * @param {number} amount - USD amount
 * @returns {string} Formatted USD amount ($X.XX)
 */
function formatUSD(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '$0.00';
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Format token price with appropriate precision
 * @param {number} price - Token price in USD
 * @returns {string} Formatted price ($X.XXXXXX)
 */
function formatTokenPrice(price) {
  if (typeof price !== 'number' || isNaN(price)) {
    return '$0.000000';
  }
  
  // Use more decimals for very small values
  if (price < 0.0001) {
    return `$${price.toFixed(8)}`;
  } else if (price < 0.01) {
    return `$${price.toFixed(6)}`;
  } else if (price < 1) {
    return `$${price.toFixed(4)}`;
  } else {
    return `$${price.toFixed(2)}`;
  }
}

/**
 * Format price change with emoji and sign
 * @param {number} change - Price change percentage
 * @returns {string} Formatted price change with emoji
 */
function formatPriceChange(change) {
  if (typeof change !== 'number' || isNaN(change) || change === 0) {
    return '⚪ 0.00%';
  }
  
  const emoji = change >= 0 ? '🟢' : '🔴';
  const sign = change >= 0 ? '+' : '';
  return `${emoji} ${sign}${change.toFixed(2)}%`;
}

/**
 * Format P&L with emoji, sign, and proper formatting
 * @param {number} pnl - Profit/Loss amount in SOL
 * @returns {string} Formatted P&L
 */
function formatPnL(pnl) {
  if (typeof pnl !== 'number' || isNaN(pnl)) {
    return '⚪ 0.0000 SOL';
  }
  
  const emoji = pnl >= 0 ? '🟢' : '🔴';
  const sign = pnl >= 0 ? '+' : '';
  return `${emoji} ${sign}${pnl.toFixed(4)} SOL`;
}

/**
 * Format P&L with percentage
 * @param {number} pnl - Profit/Loss amount
 * @param {number} percent - P&L percentage
 * @returns {string} Formatted P&L with percentage
 */
function formatPnLWithPercent(pnl, percent) {
  if (typeof pnl !== 'number' || isNaN(pnl)) {
    pnl = 0;
  }
  if (typeof percent !== 'number' || isNaN(percent)) {
    percent = 0;
  }
  
  const emoji = pnl >= 0 ? '🟢' : '🔴';
  const sign = pnl >= 0 ? '+' : '';
  return `${emoji} ${sign}${pnl.toFixed(4)} SOL (${sign}${percent.toFixed(2)}%)`;
}

/**
 * Format wallet address (abbreviated)
 * @param {string} address - Full wallet address
 * @returns {string} Abbreviated address (ABCD...WXYZ)
 */
function formatAddress(address) {
  if (!address || typeof address !== 'string' || address.length < 10) {
    return '`Invalid Address`';
  }
  return `\`${address.slice(0, 4)}...${address.slice(-4)}\``;
}

/**
 * Format strategy ID (last 8 characters)
 * @param {string} id - Full strategy ID
 * @returns {string} Abbreviated ID
 */
function formatStrategyId(id) {
  if (!id || typeof id !== 'string' || id.length < 8) {
    return '`Unknown`';
  }
  return `\`${id.slice(-8)}\``;
}

/**
 * Format time ago
 * @param {Date|string|number} date - Date to format
 * @returns {string} Time ago string (e.g., "5m ago", "2h ago", "3d ago")
 */
function formatTimeAgo(date) {
  try {
    const now = new Date();
    const past = new Date(date);
    const diff = now - past;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Format date/time
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDateTime(date) {
  try {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Get status emoji based on status string
 * @param {string} status - Status string (active, paused, completed, stopped, failed)
 * @returns {string} Appropriate emoji
 */
function getStatusEmoji(status) {
  const emojis = {
    active: '🟢',
    paused: '🟡',
    completed: '✅',
    stopped: '🔴',
    failed: '❌',
    pending: '⏳'
  };
  return emojis[status?.toLowerCase()] || '⚪';
}

/**
 * Create section separator
 * @returns {string} Separator line
 */
function getSeparator() {
  return '━━━━━━━━━━━━━━━━━━━━━';
}

/**
 * Format configuration parameter line
 * @param {string} label - Parameter label
 * @param {any} value - Parameter value
 * @param {string} unit - Unit (optional)
 * @returns {string} Formatted parameter line
 */
function formatConfigParam(label, value, unit = '') {
  const unitStr = unit ? ` ${unit}` : '';
  return `**${label}:** ${value}${unitStr}`;
}

/**
 * Format compact config line (multiple params in one line)
 * @param {Array} params - Array of {emoji, label, value, unit} objects
 * @returns {string} Formatted line
 */
function formatCompactConfig(params) {
  return params.map(p => `${p.emoji} ${p.label}: ${p.value}${p.unit || ''}`).join(' | ');
}

/**
 * Create button text with emoji
 * @param {string} emoji - Button emoji
 * @param {string} text - Button text
 * @returns {string} Formatted button text
 */
function buttonText(emoji, text) {
  return `${emoji} ${text}`;
}

/**
 * Format market data line (price + 24h change)
 * @param {string} symbol - Token symbol
 * @param {number} price - Current price
 * @param {number} change24h - 24h price change
 * @returns {string} Formatted market line
 */
function formatMarketData(symbol, price, change24h) {
  const priceStr = formatUSD(price);
  const changeStr = formatPriceChange(change24h);
  return `📊 **Market:** ${symbol} ${priceStr} | 24H: ${changeStr}`;
}

/**
 * Format balance line
 * @param {number} balance - Balance in SOL
 * @param {string} address - Wallet address (optional)
 * @returns {string} Formatted balance section
 */
function formatBalanceSection(balance, address = null) {
  let result = `💰 **Balance:** ${formatSOL(balance).replace(' SOL', '')} SOL`;
  if (address) {
    result += `\n📍 ${formatAddress(address)}`;
  }
  return result;
}

/**
 * Format active bots summary line
 * @param {number} count - Number of active bots
 * @param {number} pnl - Total P&L (optional)
 * @returns {string} Formatted active bots line
 */
function formatActiveBotsLine(count, pnl = null) {
  let result = `💻 **Active Bots:** ${count}`;
  if (pnl !== null && typeof pnl === 'number') {
    const emoji = pnl >= 0 ? '🟢' : '🔴';
    const sign = pnl >= 0 ? '+' : '';
    result += ` | ${emoji} ${sign}${pnl.toFixed(4)} SOL`;
  }
  return result;
}

/**
 * Validate and format number input
 * @param {string} input - User input
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} decimals - Number of decimal places
 * @returns {Object} {valid: boolean, value: number, error: string}
 */
function validateNumberInput(input, min, max, decimals = 4) {
  const value = parseFloat(input);
  
  if (isNaN(value)) {
    return { valid: false, value: null, error: 'Invalid number format' };
  }
  
  if (value < min) {
    return { valid: false, value: null, error: `Value must be at least ${min}` };
  }
  
  if (value > max) {
    return { valid: false, value: null, error: `Value must not exceed ${max}` };
  }
  
  // Round to specified decimals
  const rounded = parseFloat(value.toFixed(decimals));
  
  return { valid: true, value: rounded, error: null };
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 50) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format loading message
 * @param {string} action - Action being performed
 * @returns {string} Loading message
 */
function getLoadingMessage(action = 'Loading') {
  return `⏳ **${action}...**\n\nPlease wait...`;
}

/**
 * Format error message
 * @param {string} error - Error message
 * @param {Array<string>} suggestions - Suggested actions (optional)
 * @returns {string} Formatted error message
 */
function formatErrorMessage(error, suggestions = []) {
  let message = `❌ **Error**\n\n${error}`;
  
  if (suggestions.length > 0) {
    message += '\n\n💡 **Suggestions:**\n';
    message += suggestions.map(s => `• ${s}`).join('\n');
  }
  
  return message;
}

/**
 * Format success message
 * @param {string} title - Success title
 * @param {string} details - Success details (optional)
 * @returns {string} Formatted success message
 */
function formatSuccessMessage(title, details = '') {
  let message = `✅ **${title}**`;
  if (details) {
    message += `\n\n${details}`;
  }
  return message;
}

module.exports = {
  // Formatting
  formatSOL,
  formatPercent,
  formatUSD,
  formatTokenPrice,
  formatPriceChange,
  formatPnL,
  formatPnLWithPercent,
  formatAddress,
  formatStrategyId,
  formatTimeAgo,
  formatDateTime,
  
  // UI Components
  getStatusEmoji,
  getSeparator,
  formatConfigParam,
  formatCompactConfig,
  buttonText,
  
  // Complex Formatters
  formatMarketData,
  formatBalanceSection,
  formatActiveBotsLine,
  
  // Validation
  validateNumberInput,
  
  // Utilities
  truncateText,
  getLoadingMessage,
  formatErrorMessage,
  formatSuccessMessage
};
