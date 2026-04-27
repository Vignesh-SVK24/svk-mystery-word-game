// src/userStore.js — Simple JSON-based user storage with password hashing
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');

// ── In-memory cache ─────────────────────────────────────────
let users = {}; // username (lowercase) -> { username, passwordHash, salt, token, createdAt }

// ── Load / Save ─────────────────────────────────────────────
function loadUsers() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf-8');
            users = JSON.parse(raw);
        }
    } catch (err) {
        console.warn('[USERSTORE] Could not load users.json:', err.message);
        users = {};
    }
}

function saveUsers() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
    } catch (err) {
        console.warn('[USERSTORE] Could not save users.json:', err.message);
    }
}

// Init: load on startup
loadUsers();

// ── Password Hashing ───────────────────────────────────────
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// ── Public API ──────────────────────────────────────────────

/**
 * Register a new user
 * @returns {{ ok: boolean, token?: string, username?: string, error?: string }}
 */
function register(username, password) {
    if (!username || !password) {
        return { ok: false, error: 'Username and password are required.' };
    }

    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
        return { ok: false, error: 'Username must be 3-20 characters.' };
    }
    if (password.length < 4) {
        return { ok: false, error: 'Password must be at least 4 characters.' };
    }
    // Only allow alphanumeric + underscore
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }

    const key = trimmed.toLowerCase();
    if (users[key]) {
        return { ok: false, error: 'Username already taken.' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const token = uuidv4();

    users[key] = {
        username: trimmed,
        passwordHash,
        salt,
        token,
        gamesPlayed: 0,
        gamesWon: 0,
        createdAt: Date.now()
    };

    saveUsers();
    console.log(`[USERSTORE] Registered: ${trimmed}`);
    return { ok: true, token, username: trimmed };
}

/**
 * Login an existing user
 * @returns {{ ok: boolean, token?: string, username?: string, error?: string }}
 */
function login(username, password) {
    if (!username || !password) {
        return { ok: false, error: 'Username and password are required.' };
    }

    const key = username.trim().toLowerCase();
    const user = users[key];
    if (!user) {
        return { ok: false, error: 'Invalid username or password.' };
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
        return { ok: false, error: 'Invalid username or password.' };
    }

    // Generate a new token on each login
    user.token = uuidv4();
    saveUsers();

    console.log(`[USERSTORE] Login: ${user.username}`);
    return { ok: true, token: user.token, username: user.username };
}

/**
 * Get user profile by auth token
 * @returns {{ ok: boolean, username?: string, gamesPlayed?: number, gamesWon?: number, error?: string }}
 */
function getUserByToken(token) {
    if (!token) return { ok: false, error: 'No token provided.' };

    for (const user of Object.values(users)) {
        if (user.token === token) {
            return {
                ok: true,
                username: user.username,
                gamesPlayed: user.gamesPlayed || 0,
                gamesWon: user.gamesWon || 0
            };
        }
    }
    return { ok: false, error: 'Invalid or expired token.' };
}

/**
 * Increment stats for a user
 */
function incrementStats(username, won) {
    const key = (username || '').trim().toLowerCase();
    const user = users[key];
    if (!user) return;
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    if (won) user.gamesWon = (user.gamesWon || 0) + 1;
    saveUsers();
}

module.exports = { register, login, getUserByToken, incrementStats };
