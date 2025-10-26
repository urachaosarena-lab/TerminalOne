const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

/**
 * Automated backup service for data folder
 * Creates daily backups of hero, wallet, and session data
 */
class BackupService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.backupDir = path.join(__dirname, '../../backups');
    this.maxBackups = 30; // Keep 30 days of backups
    this.backupInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    // Start automatic backup scheduler
    this.startBackupScheduler();
    
    logger.info('💾 Backup service initialized (daily backups, 30-day retention)');
  }

  /**
   * Start automatic backup scheduler
   */
  startBackupScheduler() {
    // Run backup immediately on startup
    this.createBackup().catch(err => {
      logger.error('Initial backup failed:', err);
    });
    
    // Schedule daily backups
    this.backupTimer = setInterval(() => {
      this.createBackup().catch(err => {
        logger.error('Scheduled backup failed:', err);
      });
    }, this.backupInterval);
    
    logger.info('📅 Backup scheduler started (running daily)');
  }

  /**
   * Create a backup of the data folder
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);
      
      logger.info(`📦 Creating backup: ${backupName}`);
      
      // Create backup directory
      fs.mkdirSync(backupPath, { recursive: true });
      
      // Copy all files from data directory
      if (fs.existsSync(this.dataDir)) {
        await this.copyDirectory(this.dataDir, backupPath);
      } else {
        logger.warn('Data directory does not exist yet, creating empty backup');
      }
      
      // Create backup metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        backupName,
        files: this.listFilesInDirectory(backupPath),
        size: this.getDirectorySize(backupPath)
      };
      
      fs.writeFileSync(
        path.join(backupPath, 'backup_metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      logger.info(`✅ Backup created successfully: ${backupName} (${this.formatBytes(metadata.size)})`);
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      return {
        success: true,
        backupName,
        backupPath,
        metadata
      };
      
    } catch (error) {
      logger.error('Backup creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Copy directory recursively
   */
  async copyDirectory(src, dest) {
    // Create destination directory
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Read all files and directories
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Clean up old backups (keep only most recent)
   */
  async cleanupOldBackups() {
    try {
      const backups = fs.readdirSync(this.backupDir)
        .filter(name => name.startsWith('backup_'))
        .map(name => ({
          name,
          path: path.join(this.backupDir, name),
          time: fs.statSync(path.join(this.backupDir, name)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Sort by newest first
      
      // Remove old backups beyond retention limit
      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);
        
        for (const backup of toDelete) {
          logger.info(`🗑️ Removing old backup: ${backup.name}`);
          await this.deleteDirectory(backup.path);
        }
        
        logger.info(`Cleaned up ${toDelete.length} old backups`);
      }
      
    } catch (error) {
      logger.error('Backup cleanup failed:', error);
    }
  }

  /**
   * Delete directory recursively
   */
  async deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  /**
   * Restore from a backup
   */
  async restoreFromBackup(backupName) {
    try {
      const backupPath = path.join(this.backupDir, backupName);
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupName}`);
      }
      
      logger.info(`🔄 Restoring from backup: ${backupName}`);
      
      // Create backup of current data before restoring
      const currentBackupName = `pre-restore_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const currentBackupPath = path.join(this.backupDir, currentBackupName);
      
      if (fs.existsSync(this.dataDir)) {
        await this.copyDirectory(this.dataDir, currentBackupPath);
        logger.info(`Created safety backup: ${currentBackupName}`);
      }
      
      // Clear current data directory
      if (fs.existsSync(this.dataDir)) {
        await this.deleteDirectory(this.dataDir);
      }
      
      // Restore from backup
      await this.copyDirectory(backupPath, this.dataDir);
      
      logger.info(`✅ Successfully restored from backup: ${backupName}`);
      
      return {
        success: true,
        backupName,
        message: `Restored from ${backupName}. Previous data saved to ${currentBackupName}`
      };
      
    } catch (error) {
      logger.error('Restore failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List all available backups
   */
  listBackups() {
    try {
      const backups = fs.readdirSync(this.backupDir)
        .filter(name => name.startsWith('backup_'))
        .map(name => {
          const backupPath = path.join(this.backupDir, name);
          const stats = fs.statSync(backupPath);
          
          // Try to read metadata
          let metadata = null;
          const metadataPath = path.join(backupPath, 'backup_metadata.json');
          if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          }
          
          return {
            name,
            path: backupPath,
            created: stats.mtime,
            size: this.getDirectorySize(backupPath),
            files: metadata?.files?.length || 0,
            metadata
          };
        })
        .sort((a, b) => b.created - a.created); // Newest first
      
      return backups;
      
    } catch (error) {
      logger.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Get backup statistics
   */
  getBackupStats() {
    const backups = this.listBackups();
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    
    return {
      totalBackups: backups.length,
      totalSize: this.formatBytes(totalSize),
      oldestBackup: backups[backups.length - 1]?.created || null,
      newestBackup: backups[0]?.created || null,
      retentionDays: this.maxBackups,
      backupInterval: '24 hours',
      backups: backups.map(b => ({
        name: b.name,
        created: b.created,
        size: this.formatBytes(b.size),
        files: b.files
      }))
    };
  }

  /**
   * Get directory size recursively
   */
  getDirectorySize(dirPath) {
    let size = 0;
    
    if (!fs.existsSync(dirPath)) {
      return 0;
    }
    
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        size += this.getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
    
    return size;
  }

  /**
   * List files in directory recursively
   */
  listFilesInDirectory(dirPath, relativeTo = dirPath) {
    const files = [];
    
    if (!fs.existsSync(dirPath)) {
      return files;
    }
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(relativeTo, fullPath);
      
      if (entry.isDirectory()) {
        files.push(...this.listFilesInDirectory(fullPath, relativeTo));
      } else {
        files.push(relativePath);
      }
    }
    
    return files;
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Stop backup scheduler (for graceful shutdown)
   */
  stop() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      logger.info('Backup scheduler stopped');
    }
  }
}

// Singleton instance
const backupService = new BackupService();

// Graceful shutdown
process.on('SIGINT', () => {
  backupService.stop();
});

process.on('SIGTERM', () => {
  backupService.stop();
});

module.exports = backupService;
