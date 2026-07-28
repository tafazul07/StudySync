import express from 'express';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  logoutAllDevices,
  getUserById,
  updateUserProfile,
  changePassword,
  generateResetToken,
  validateResetToken,
  resetPassword
} from '../services/authService.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import { authenticate } from '../middleware/auth.js';
import { loginRateLimiter, sanitizeBody, logSecurityEvent } from '../middleware/security.js';

const router = express.Router();

// A07: Password strength validation
function validatePasswordStrength(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

// Register
router.post('/register', loginRateLimiter, async (req, res) => {
  try {
    const { email, password, fullName, role } = req.body;

    // Validation
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }

    // A07: Stronger password requirements
    const pwError = validatePasswordStrength(password);
    if (pwError) return res.status(400).json({ error: pwError });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // A03: Limit input lengths
    if (fullName.length > 100) return res.status(400).json({ error: 'Name too long' });
    if (email.length > 254) return res.status(400).json({ error: 'Email too long' });

    // A01: Prevent privilege escalation — force 'student' role
    const safeRole = ['student', 'teacher'].includes(role) ? role : 'student';

    const result = await registerUser(email, password, fullName, safeRole);

    logSecurityEvent('AUTH_SUCCESS', {
      ip: req.ip,
      path: req.path,
      email,
      message: `User registered: ${email}`,
      severity: 'info',
    });

    res.status(201).json(result);
  } catch (error) {
    logSecurityEvent('AUTH_FAILURE', {
      ip: req.ip,
      path: req.path,
      email: req.body?.email,
      message: `Registration failed: ${error.message}`,
      severity: 'warn',
    });
    if (error.message === 'User already exists') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login — A07: Rate limited to prevent brute force
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await loginUser(email, password);

    // A07: Reset rate limiter on success
    if (req._loginRateLimiter) req._loginRateLimiter.onSuccess();

    logSecurityEvent('AUTH_SUCCESS', {
      ip: req.ip,
      path: req.path,
      email,
      userId: result.user.id,
      message: `User logged in: ${email}`,
      severity: 'info',
    });

    res.json(result);
  } catch (error) {
    // A07: Track failed login for rate limiting
    if (req._loginRateLimiter) req._loginRateLimiter.onFailure();

    logSecurityEvent('AUTH_FAILURE', {
      ip: req.ip,
      path: req.path,
      email: req.body?.email,
      message: `Login failed: ${error.message}`,
      severity: 'warn',
    });

    if (error.message === 'Invalid credentials') {
      return res.status(401).json({ error: error.message });
    }
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const result = await refreshAccessToken(refreshToken);
    res.json(result);
  } catch (error) {
    console.error('Refresh token error:', error);
    if (error.message === 'Invalid or expired refresh token') {
      return res.status(401).json({ error: error.message });
    }
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    await logoutUser(refreshToken);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Logout from all devices — A01: requires authentication
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    await logoutAllDevices(userId);

    logSecurityEvent('SENSITIVE_OP', {
      ip: req.ip,
      userId,
      path: req.path,
      message: `User logged out from all devices`,
      severity: 'info',
    });

    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Logout from all devices failed' });
  }
});

// Get current user — A01: Requires authentication
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile — A01: Requires authentication
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // A03: Sanitize and limit input
    const clean = sanitizeBody(req.body, ['fullName', 'avatarUrl']);
    const updates = {};

    if (clean.fullName) {
      if (clean.fullName.length > 100) return res.status(400).json({ error: 'Name too long' });
      updates.full_name = clean.fullName;
    }
    if (clean.avatarUrl) {
      // A03: Validate URL format to prevent XSS via avatar
      if (!/^https?:\/\/[^\s<>"']{1,500}$/.test(clean.avatarUrl)) {
        return res.status(400).json({ error: 'Invalid avatar URL' });
      }
      updates.avatar_url = clean.avatarUrl;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const user = await updateUserProfile(userId, updates);
    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password — A01: Requires authentication
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // A07: Stronger password requirements
    const pwError = validatePasswordStrength(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const result = await changePassword(userId, currentPassword, newPassword);

    logSecurityEvent('SENSITIVE_OP', {
      ip: req.ip,
      path: req.path,
      userId,
      message: `Password changed for user ${userId}`,
      severity: 'info',
    });

    res.json(result);
  } catch (error) {
    if (error.message === 'Current password is incorrect') {
      logSecurityEvent('AUTH_FAILURE', {
        ip: req.ip,
        path: req.path,
        userId: req.user?.id,
        message: 'Wrong current password during change',
        severity: 'warn',
      });
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot password - request reset token
router.post('/forgot-password', loginRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Generate reset token (returns null if user doesn't exist - don't reveal)
    const result = await generateResetToken(email);

    if (result) {
      // Build reset link - use frontend URL from env or default
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetLink = `${frontendUrl}/reset-password?token=${result.token}`;

      // Send email
      try {
        await sendPasswordResetEmail(result.email, resetLink, result.fullName);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Don't reveal email sending failures
      }
    }

    logSecurityEvent('PASSWORD_RESET_REQUEST', {
      ip: req.ip,
      path: req.path,
      email,
      message: `Password reset requested for ${email}`,
      severity: 'info',
    });

    // Always return success - don't reveal if email exists
    res.json({ 
      success: true, 
      message: 'If an account exists with that email, a password reset link has been sent.' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', loginRateLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Validate password strength
    const pwError = validatePasswordStrength(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const result = await resetPassword(token, newPassword);

    logSecurityEvent('PASSWORD_RESET', {
      ip: req.ip,
      path: req.path,
      message: 'Password successfully reset',
      severity: 'info',
    });

    res.json(result);
  } catch (error) {
    if (error.message === 'Invalid or expired reset token') {
      logSecurityEvent('PASSWORD_RESET_FAILURE', {
        ip: req.ip,
        path: req.path,
        message: 'Invalid or expired reset token',
        severity: 'warn',
      });
      return res.status(400).json({ error: error.message });
    }
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Validate reset token (for checking before showing form)
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const user = await validateResetToken(token);

    if (!user) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired token' });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

export default router;
