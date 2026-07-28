/**
 * Centralized logging service using Winston.
 *
 * Provides structured, leveled logging with:
 * - Console output (colorized in development)
 * - File output: combined.log (all levels) + error.log (error+)
 * - Security log: security.log (dedicated audit trail)
 *
 * Replaces scattered console.log/console.error calls throughout the app.
 *
 * Usage:
 *   import logger from './logger.js';
 *   logger.info('Server started', { port: 5000 });
 *   logger.error('DB connection failed', { error: err.message });
 *   logger.security('AUTH_FAILURE', { ip: '1.2.3.4', message: '...' });
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '..', 'logs');

// Custom format for console (colorized + concise)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Custom format for files (JSON, machine-parseable)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Security log format (structured for audit trails)
const securityFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({ timestamp, level, message, ...meta });
  })
);

// ============================================================
// Main application logger
// ============================================================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  format: fileFormat,
  transports: [
    // All logs
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
      tailable: true,
    }),
    // Error logs only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});

// Console transport — colorized in dev, JSON in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// ============================================================
// Security logger — separate file for audit trail
// ============================================================
const securityLogger = winston.createLogger({
  level: 'info',
  format: securityFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'security.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Also log security events to console in dev
if (process.env.NODE_ENV !== 'production') {
  securityLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, message, ...meta }) => {
        return `[${timestamp}] 🔒 ${message}`;
      })
    ),
    level: 'info',
  }));
}

// ============================================================
// Convenience methods
// ============================================================

/**
 * Log a security event with structured data.
 * Replaces the old logSecurityEvent() from security.js.
 */
logger.security = function(type, details) {
  const meta = {
    type,
    ip: details.ip || 'unknown',
    userId: details.userId || null,
    email: details.email || null,
    path: details.path || null,
    severity: details.severity || 'info',
  };

  // Map severity to winston level
  const level = {
    critical: 'error',
    error: 'error',
    warn: 'warn',
    info: 'info',
  }[details.severity] || 'info';

  securityLogger.log(level, details.message || type, meta);
};

export default logger;
