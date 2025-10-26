module.exports = {
  apps: [{
    name: 'terminalone-bot',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Environment
    env: {
      NODE_ENV: 'production'
    },
    
    // Restart configuration
    max_memory_restart: '500M',  // Restart if memory exceeds 500MB
    min_uptime: '10s',           // Consider app online after 10 seconds
    max_restarts: 10,            // Max restarts within restart_delay window
    restart_delay: 4000,         // Wait 4 seconds before restarting
    
    // Auto restart
    autorestart: true,
    watch: false,                // Don't watch files in production
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Log rotation (requires pm2-logrotate module)
    // Install with: pm2 install pm2-logrotate
    
    // Graceful shutdown
    kill_timeout: 5000,          // Time to wait for graceful shutdown
    listen_timeout: 3000,        // Time to wait for app to be ready
    
    // Performance
    node_args: '--max-old-space-size=400',  // Limit heap to 400MB
    
    // Process management
    cron_restart: '0 4 * * *',  // Optional: Restart daily at 4 AM
    
    // Health check (if you have a health endpoint)
    // Uncomment if health endpoint is configured
    // health_check: {
    //   enabled: true,
    //   port: 30001,
    //   path: '/health',
    //   interval: 30000,          // Check every 30 seconds
    //   timeout: 5000             // Timeout after 5 seconds
    // }
  }]
};
