const express = require('express');
const config = require('../../config/config');
const logger = require('./logger');

/**
 * Create health check endpoint for monitoring
 */
function createHealthCheckServer(services) {
  const app = express();
  const port = config.bot.port + 1; // Use different port for health checks
  
  app.use(express.json());
  
  // Basic health check
  app.get('/health', async (req, res) => {
    try {
      const health = await services.monitoring.getHealthEndpoint();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
      
    } catch (error) {
      logger.error('Health check endpoint error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Detailed metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      const metrics = services.monitoring.getMetrics();
      const rateLimitStats = services.rateLimit.getStats();
      const errorStats = services.errorHandling.getErrorStats();
      
      res.json({
        timestamp: new Date().toISOString(),
        metrics,
        rateLimit: rateLimitStats,
        errors: errorStats
      });
      
    } catch (error) {
      logger.error('Metrics endpoint error:', error);
      res.status(500).json({
        error: 'Failed to retrieve metrics',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Ready check (for k8s readiness probes)
  app.get('/ready', (req, res) => {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  });
  
  // Live check (for k8s liveness probes)
  app.get('/live', (req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        logger.info(`Health check server listening on port ${port}`);
        resolve(server);
      });
      
      server.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { createHealthCheckServer };