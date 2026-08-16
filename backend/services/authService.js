import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import dbStore from './dbStore.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-jwt-secret-here') {
  console.error('❌ JWT_SECRET not configured! Set a strong random secret in .env');
  process.exit(1);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
// Parse session expiry from env string (e.g. '7d' -> 7 days in ms)
function parseExpiryToMs(str) {
  const match = str.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const val = parseInt(match[1]);
  const unit = { d: 86400000, h: 3600000, m: 60000, s: 1000 }[match[2]];
  return val * unit;
}
const SESSION_EXPIRY_MS = parseExpiryToMs(JWT_REFRESH_EXPIRES_IN);

// Hash password
export async function hashPassword(password) {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Generate access token
export function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Generate refresh token (UUID)
export function generateRefreshToken() {
  return uuidv4();
}

// Verify token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Register user
export async function registerUser(email, password, fullName, role = 'student') {
  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existing = await dbStore.selectOne('users', { email: normalizedEmail });
  if (existing) {
    throw new Error('User already exists');
  }

  const passwordHash = await hashPassword(password);

  const user = await dbStore.insert('users', {
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: fullName,
    role,
    is_verified: false,
    avatar_url: ''
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS).toISOString();
  await dbStore.insert('sessions', {
    user_id: user.id,
    token: refreshToken,
    expires_at: expiresAt
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isVerified: user.is_verified,
      avatarUrl: user.avatar_url || ''
    },
    accessToken,
    refreshToken
  };
}

// Login user
export async function loginUser(email, password) {
  const normalizedEmail = email.toLowerCase();

  const user = await dbStore.selectOne('users', { email: normalizedEmail });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  // Store session in Redis
  if (sessionStore) {
    await sessionStore.set(refreshToken, {
      user_id: user.id,
      email: user.email,
      created_at: new Date().toISOString()
    });
  } else {
    // Fallback to database if Redis not available
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS).toISOString();
    await dbStore.insert('sessions', {
      user_id: user.id,
      token: refreshToken,
      expires_at: expiresAt
    });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isVerified: user.is_verified,
      avatarUrl: user.avatar_url || ''
    },
    accessToken,
    refreshToken
  };
}

// Refresh access token
export async function refreshAccessToken(refreshToken) {
  let session = null;

  // Try Redis first
  if (sessionStore) {
    session = await sessionStore.get(refreshToken);
  } else {
    // Fallback to database
    session = await dbStore.selectOne('sessions', { token: refreshToken });
    if (session && session.expires_at) {
      // Check expiry for database sessions
      if (new Date(session.expires_at) < new Date()) {
        await dbStore.deleteOne('sessions', { token: refreshToken });
        throw new Error('Invalid or expired refresh token');
      }
    }
  }

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  const user = await dbStore.findById('users', session.user_id);
  if (!user) {
    throw new Error('Invalid or expired refresh token');
  }

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isVerified: user.is_verified,
      avatarUrl: user.avatar_url || ''
    }
  };
}

// Logout user
export async function logoutUser(refreshToken) {
  if (sessionStore) {
    await sessionStore.delete(refreshToken);
  } else {
    await dbStore.deleteOne('sessions', { token: refreshToken });
  }
}

// Logout from all devices
export async function logoutAllDevices(userId) {
  if (sessionStore) {
    await sessionStore.deleteAll(userId);
  } else {
    await dbStore.delete('sessions', { user_id: userId });
  }
}

// Get user by ID
export async function getUserById(userId) {
  const user = await dbStore.findById('users', userId);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: user.avatar_url || '',
    role: user.role,
    isVerified: user.is_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

// Update user profile
export async function updateUserProfile(userId, updates) {
  const allowedFields = ['full_name', 'avatar_url'];
  const safeUpdates = {};

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      safeUpdates[key] = value;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  await dbStore.updateOne('users', { id: userId }, safeUpdates);
  return getUserById(userId);
}

// Change password
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await dbStore.findById('users', userId);
  if (!user) throw new Error('User not found');

  const isValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isValid) throw new Error('Current password is incorrect');

  const newPasswordHash = await hashPassword(newPassword);
  await dbStore.updateOne('users', { id: userId }, { password_hash: newPasswordHash });
  await logoutAllDevices(userId);

  return { success: true };
}

// Clean up expired sessions
export async function cleanupExpiredSessions() {
  // Redis automatically handles TTL expiration
  // Only cleanup database sessions if Redis is not available
  if (!sessionStore) {
    const now = new Date().toISOString();
    const sessions = await dbStore.findAll('sessions');
    const expired = sessions.filter(s => s.expires_at < now);
    for (const s of expired) {
      await dbStore.deleteOne('sessions', { id: s.id });
    }
  }
}

// Generate password reset token
export async function generateResetToken(email) {
  const normalizedEmail = email.toLowerCase();
  const user = await dbStore.selectOne('users', { email: normalizedEmail });
  
  if (!user) {
    // Don't reveal if user exists - return null but don't throw
    return null;
  }

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  // Save token to database
  await dbStore.updateOne('users', { id: user.id }, {
    reset_token: token,
    reset_token_expiry: expiry.toISOString()
  });

  return { token, email: user.email, fullName: user.full_name };
}

// Validate reset token
export async function validateResetToken(token) {
  if (!token) return null;

  const user = await dbStore.selectOne('users', { reset_token: token });
  if (!user) return null;

  // Check if token is expired
  if (user.reset_token_expiry && new Date(user.reset_token_expiry) < new Date()) {
    // Token expired - clear it
    await dbStore.updateOne('users', { id: user.id }, {
      reset_token: null,
      reset_token_expiry: null
    });
    return null;
  }

  return user;
}

// Reset password using token
export async function resetPassword(token, newPassword) {
  const user = await validateResetToken(token);
  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  // Hash new password
  const newPasswordHash = await hashPassword(newPassword);

  // Update password and clear reset token
  await dbStore.updateOne('users', { id: user.id }, {
    password_hash: newPasswordHash,
    reset_token: null,
    reset_token_expiry: null
  });

  // Invalidate all existing sessions for security
  await logoutAllDevices(user.id);

  return { success: true };
}
