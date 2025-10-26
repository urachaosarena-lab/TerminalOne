const crypto = require('crypto');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Session security manager with CSRF protection
 * Sessions do NOT expire (as requested by user)
 */
class SessionSecurity {
  constructor() {
    this.sessions = new Map(); // userId -> session data
    this.csrfTokens = new Map(); // userId -> csrf token
    this.sessionStoragePath = path.join(__dirname, '../../data/sessions.json');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.sessionStoragePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load existing sessions
    this.loadSessions();
    
    // Save sessions periodically (every 5 minutes)
    setInterval(() => this.saveSessions(), 5 * 60 * 1000);
    
    logger.info('🔐 Session security initialized (persistent, no expiry)');
  }

  /**
   * Load sessions from disk
   */
  loadSessions() {
    try {
      if (fs.existsSync(this.sessionStoragePath)) {
        const data = fs.readFileSync(this.sessionStoragePath, 'utf8');
        const sessionData = JSON.parse(data);
        
        // Restore sessions
        if (sessionData.sessions) {
          Object.entries(sessionData.sessions).forEach(([userId, session]) => {
            this.sessions.set(userId, {
              ...session,
              createdAt: new Date(session.createdAt),
              lastActivity: new Date(session.lastActivity)
            });
          });
        }
        
        // Restore CSRF tokens
        if (sessionData.csrfTokens) {
          Object.entries(sessionData.csrfTokens).forEach(([userId, token]) => {
            this.csrfTokens.set(userId, token);
          });
        }
        
        logger.info(`Loaded ${this.sessions.size} sessions from disk`);
      }
    } catch (error) {
      logger.error('Failed to load sessions:', error);
    }
  }

  /**
   * Save sessions to disk
   */
  saveSessions() {
    try {
      const sessionData = {
        sessions: {},
        csrfTokens: {}
      };
      
      // Convert maps to objects
      this.sessions.forEach((session, userId) => {
        sessionData.sessions[userId] = session;
      });
      
      this.csrfTokens.forEach((token, userId) => {
        sessionData.csrfTokens[userId] = token;
      });
      
      fs.writeFileSync(
        this.sessionStoragePath,
        JSON.stringify(sessionData, null, 2),
        'utf8'
      );
      
      logger.debug(`Saved ${this.sessions.size} sessions to disk`);
    } catch (error) {
      logger.error('Failed to save sessions:', error);
    }
  }

  /**
   * Create or get session for user
   */
  getOrCreateSession(userId, userInfo = {}) {
    userId = userId.toString();
    
    if (this.sessions.has(userId)) {
      const session = this.sessions.get(userId);
      // Update last activity
      session.lastActivity = new Date();
      return session;
    }
    
    // Create new session
    const session = {
      userId,
      sessionId: this.generateToken(),
      createdAt: new Date(),
      lastActivity: new Date(),
      userInfo: {
        username: userInfo.username,
        firstName: userInfo.first_name,
        lastName: userInfo.last_name
      },
      isAuthenticated: true
    };
    
    this.sessions.set(userId, session);
    logger.info(`Created new session for user ${userId}`);
    
    return session;
  }

  /**
   * Generate CSRF token for user
   */
  generateCsrfToken(userId) {
    userId = userId.toString();
    const token = this.generateToken();
    this.csrfTokens.set(userId, token);
    return token;
  }

  /**
   * Validate CSRF token
   */
  validateCsrfToken(userId, token) {
    userId = userId.toString();
    const storedToken = this.csrfTokens.get(userId);
    
    if (!storedToken) {
      logger.warn(`No CSRF token found for user ${userId}`);
      return false;
    }
    
    if (storedToken !== token) {
      logger.warn(`Invalid CSRF token for user ${userId}`);
      return false;
    }
    
    return true;
  }

  /**
   * Middleware to validate CSRF for sensitive operations
   */
  csrfProtection(ctx, next) {
    const userId = ctx.from?.id?.toString();
    
    if (!userId) {
      logger.warn('CSRF protection: No user ID in context');
      return next();
    }
    
    // Get CSRF token from callback data or message
    const csrfToken = ctx.callbackQuery?.data?.split('_csrf_')[1] || 
                     ctx.session?.csrfToken;
    
    if (!csrfToken) {
      logger.warn(`CSRF protection: No token provided by user ${userId}`);
      return ctx.reply('⚠️ Security error: Invalid request. Please try again.');
    }
    
    if (!this.validateCsrfToken(userId, csrfToken)) {
      logger.warn(`CSRF protection: Invalid token for user ${userId}`);
      return ctx.reply('⚠️ Security error: Invalid request token. Please try again.');
    }
    
    return next();
  }

  /**
   * Get session for user
   */
  getSession(userId) {
    userId = userId.toString();
    return this.sessions.get(userId);
  }

  /**
   * Check if user has active session
   */
  hasSession(userId) {
    userId = userId.toString();
    return this.sessions.has(userId);
  }

  /**
   * Destroy session (logout)
   */
  destroySession(userId) {
    userId = userId.toString();
    this.sessions.delete(userId);
    this.csrfTokens.delete(userId);
    this.saveSessions();
    logger.info(`Destroyed session for user ${userId}`);
  }

  /**
   * Generate secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Update session activity
   */
  updateActivity(userId) {
    userId = userId.toString();
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Get all sessions (admin function)
   */
  getAllSessions() {
    const sessions = [];
    this.sessions.forEach((session, userId) => {
      sessions.push({
        userId,
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        userInfo: session.userInfo
      });
    });
    return sessions;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    let activeToday = 0;
    let activeThisWeek = 0;
    
    this.sessions.forEach(session => {
      if (session.lastActivity >= oneDayAgo) activeToday++;
      if (session.lastActivity >= oneWeekAgo) activeThisWeek++;
    });
    
    return {
      totalSessions: this.sessions.size,
      activeToday,
      activeThisWeek
    };
  }
}

// Singleton instance
const sessionSecurity = new SessionSecurity();

// Graceful shutdown - save sessions
process.on('SIGINT', () => {
  logger.info('Saving sessions before shutdown...');
  sessionSecurity.saveSessions();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Saving sessions before shutdown...');
  sessionSecurity.saveSessions();
  process.exit(0);
});

module.exports = sessionSecurity;
