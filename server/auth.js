const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query } = require("./db");

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
const sessions = new Map();

class AuthManager {
  constructor() {
    this.dbAvailable = false;
  }

  setDbAvailable(available) {
    this.dbAvailable = available;
  }

  async register(username, password) {
    if (!username || !password) {
      return { success: false, error: "Username and password are required" };
    }

    const cleanName = username.substring(0, 16).replace(/[^a-zA-Z0-9_]/g, "");
    if (cleanName.length < 3) {
      return { success: false, error: "Username must be at least 3 characters (letters, numbers, underscore)" };
    }

    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters" };
    }

    if (this.dbAvailable) {
      try {
        const existing = await query("SELECT id FROM users WHERE username = $1", [cleanName]);
        if (existing.rows.length > 0) {
          return { success: false, error: "Username already taken" };
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await query(
          "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
          [cleanName, hash]
        );

        await query(
          "INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
          [result.rows[0].id]
        );

        const user = result.rows[0];
        const token = this.createSession(user.id, user.username);
        return { success: true, token, userId: user.id, username: user.username };
      } catch (err) {
        console.error("[Auth] Register error:", err.message);
        return { success: false, error: "Registration failed. Please try again." };
      }
    } else {
      return { success: false, error: "Database not connected. Contact admin." };
    }
  }

  async login(username, password) {
    if (!username || !password) {
      return { success: false, error: "Username and password are required" };
    }

    const cleanName = username.substring(0, 16).replace(/[^a-zA-Z0-9_]/g, "");

    if (this.dbAvailable) {
      try {
        const result = await query(
          "SELECT id, username, password_hash FROM users WHERE username = $1",
          [cleanName]
        );

        if (result.rows.length === 0) {
          return { success: false, error: "Invalid username or password" };
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
          return { success: false, error: "Invalid username or password" };
        }

        await query("UPDATE user_stats SET last_login = NOW() WHERE user_id = $1", [user.id]);

        const token = this.createSession(user.id, user.username);
        return { success: true, token, userId: user.id, username: user.username };
      } catch (err) {
        console.error("[Auth] Login error:", err.message);
        return { success: false, error: "Login failed. Please try again." };
      }
    } else {
      return { success: false, error: "Database not connected. Contact admin." };
    }
  }

  createSession(userId, username) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
      userId,
      username,
      createdAt: Date.now(),
    });
    return token;
  }

  verifySession(token) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  removeSession(token) {
    sessions.delete(token);
  }

  cleanExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (now - session.createdAt > SESSION_TIMEOUT) {
        sessions.delete(token);
      }
    }
  }
}

module.exports = new AuthManager();
