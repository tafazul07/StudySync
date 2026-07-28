/**
 * Security middleware and utilities for OWASP Top 10 protection.
 *
 * Covers:
 * - A01: Broken Access Control (ownership verification helper)
 * - A03: Injection (input sanitization, XSS prevention)
 * - A05: Security Misconfiguration (security headers)
 * - A07: Auth Failures (login rate limiting)
 * - A08: Software/Data Integrity (file upload validation)
 * - A09: Logging/Monitoring (security event logging)
 */

import crypto from 'crypto';
import path from 'path';
import logger from '../services/logger.js';

// ============================================================
// A09: Security Event Logger — structured security logging
// ============================================================
export function logSecurityEvent(type, details) {
  // Use centralized Winston logger — writes to logs/security.log + console
  logger.security(type, details);
}

// ============================================================
// A03: Input Sanitization — prevent XSS and injection
// ============================================================
// HTML-escape to prevent stored XSS
export function sanitizeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Sanitize all string fields in an object (for req.body)
export function sanitizeBody(fields, allowedFields) {
  const clean = {};
  for (const key of allowedFields) {
    if (fields[key] !== undefined) {
      if (typeof fields[key] === 'string') {
        // Trim and limit length (prevent DoS via huge payloads)
        clean[key] = sanitizeHtml(fields[key]).slice(0, 10000);
      } else {
        clean[key] = fields[key];
      }
    }
  }
  return clean;
}

// Validate and limit string length
export function validateStringLength(value, fieldName, maxLen = 500) {
  if (typeof value === 'string' && value.length > maxLen) {
    return `${fieldName} must be at most ${maxLen} characters`;
  }
  return null;
}

// ============================================================
// A05: Security Headers middleware
// ============================================================
export function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Restrict browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Remove X-Powered-By (already done by helmet, but just in case)
  res.removeHeader('X-Powered-By');
  next();
}

// ============================================================
// A07: Login rate limiter — per-IP tracking
// ============================================================
const loginAttempts = new Map(); // IP -> { count, firstAttempt, lockedUntil }

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const WINDOW_DURATION = 15 * 60 * 1000; // 15 minutes

export function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);

  // Check if locked out
  if (record && record.lockedUntil && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    logSecurityEvent('RATE_LIMIT', {
      ip,
      path: req.path,
      message: `Login rate limit exceeded. Locked for ${retryAfter}s more.`,
      severity: 'warn',
    });
    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
      retryAfter,
    });
  }

  // Reset if window expired
  if (record && now - record.firstAttempt > WINDOW_DURATION) {
    loginAttempts.delete(ip);
  }

  // Store the next function so we can track success/failure
  req._loginIp = ip;
  req._loginRateLimiter = {
    onSuccess: () => {
      loginAttempts.delete(ip);
    },
    onFailure: () => {
      const current = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: null };
      current.count++;
      current.firstAttempt = current.firstAttempt || now;
      if (current.count >= MAX_ATTEMPTS) {
        current.lockedUntil = now + LOCKOUT_DURATION;
        logSecurityEvent('RATE_LIMIT', {
          ip,
          path: req.path,
          message: `Account locked after ${current.count} failed attempts for 15 minutes.`,
          severity: 'error',
        });
      }
      loginAttempts.set(ip, current);
    },
  };

  next();
}

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now - record.firstAttempt > WINDOW_DURATION * 2 && (!record.lockedUntil || now > record.lockedUntil)) {
      loginAttempts.delete(ip);
    }
  }
}, 30 * 60 * 1000).unref();

// ============================================================
// A08: File Upload Validation
// ============================================================
// Dangerous file extensions that should never be allowed
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1',
  '.sh', '.bash', '.csh', '.ksh', '.rb', '.pl', '.py',
  '.php', '.asp', '.aspx', '.jsp', '.cgi',
]);

export function isFileExtensionSafe(filename) {
  const ext = path.extname(filename).toLowerCase();
  return !BLOCKED_EXTENSIONS.has(ext);
}

// Validate file size (in bytes)
export function validateFileSize(size, maxBytes = 25 * 1024 * 1024) {
  return size <= maxBytes;
}

// Generate a safe random filename
export function safeFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const randomName = crypto.randomBytes(16).toString('hex');
  return randomName + ext;
}

// ============================================================
// A01: Ownership verification helper
// ============================================================
export function verifyOwnership(resource, userId) {
  if (!resource) return false;
  // Check common ownership fields
  return resource.owner_id === userId ||
         resource.user_id === userId ||
         resource.shared_by === userId ||
         resource.created_by === userId;
}

// ============================================================
// A03: Content-Disposition header sanitization
// ============================================================
export function sanitizeFilenameForHeader(filename) {
  // Remove control characters and quotes
  const safe = (filename || 'download')
    .replace(/[\x00-\x1f\x7f"\\]/g, '')
    .slice(0, 255);
  return safe;
}

// ============================================================
// A05: Error response sanitizer — don't leak internals
// ============================================================
export function sanitizeError(err) {
  // In production, never send stack traces or internal details
  const isDev = process.env.NODE_ENV !== 'production';

  if (err.status && err.status < 500) {
    return { error: err.message };
  }

  // For 500 errors, only show generic message
  if (isDev) {
    return { error: err.message || 'Internal server error' };
  }
  return { error: 'An unexpected error occurred. Please try again later.' };
}
