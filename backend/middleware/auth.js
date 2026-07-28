import { verifyToken } from '../services/authService.js';
import dbStore from '../services/dbStore.js';
import logger from '../services/logger.js';

// Authentication middleware
export async function authenticate(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify the user still exists in the database
    const user = await dbStore.findById('users', decoded.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'Your session is no longer valid. Please log in again.' 
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Optional authentication - doesn't fail if no token
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      if (decoded) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role
        };
      }
    }

    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
}

// Role-based authorization middleware
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Admin only middleware
export function adminOnly(req, res, next) {
  return authorize('admin')(req, res, next);
}

// Teacher or admin middleware
export function teacherOrAdmin(req, res, next) {
  return authorize('teacher', 'admin')(req, res, next);
}
