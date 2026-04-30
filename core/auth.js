const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Logger = require('./logger');

class AuthManager {
  constructor() {
    this.config = null;
    this.jwtSecret = process.env.JWT_SECRET || 'easy-js-secret-key-change-in-production';
    this.jwtExpiry = process.env.JWT_EXPIRY || '24h';
  }

  initialize(authConfig) {
    this.config = authConfig;
    Logger.debug(`Auth initialized for model: ${authConfig.model}, type: ${authConfig.type}`);
  }

  async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  generateToken(userId, payload = {}) {
    return jwt.sign(
      { userId, ...payload },
      this.jwtSecret,
      { expiresIn: this.jwtExpiry }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  jwtMiddleware() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Missing or invalid authorization header'
        });
      }

      const token = authHeader.slice(7);

      try {
        const decoded = this.verifyToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: Invalid token'
        });
      }
    };
  }

  async loginUser(email, password, db) {
    if (!db) {
      throw new Error('Database not configured for authentication');
    }

    try {
      const user = await db.query(this.config.model, 'findOne', null, {
        filter: { email }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const isValid = await this.comparePassword(password, user.password);

      if (!isValid) {
        throw new Error('Invalid password');
      }

      const token = this.generateToken(user.id || user._id, { email: user.email });

      return {
        success: true,
        token,
        user: {
          id: user.id || user._id,
          email: user.email,
          name: user.name || undefined
        }
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async registerUser(userData, db) {
    if (!db) {
      throw new Error('Database not configured for authentication');
    }

    try {
      // Hash password
      userData.password = await this.hashPassword(userData.password);

      const user = await db.query(this.config.model, 'create', userData);

      const token = this.generateToken(user.id || user._id, { email: user.email });

      return {
        success: true,
        token,
        user: {
          id: user.id || user._id,
          email: user.email,
          name: user.name || undefined
        }
      };
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }
}

module.exports = AuthManager;
