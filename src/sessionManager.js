// src/sessionManager.js — Session tokens for reconnection
const { v4: uuidv4 } = require('uuid');

// Map: sessionToken -> { playerId, playerName, gameData }
const sessions = new Map();
// Map: playerId -> sessionToken
const playerTokens = new Map();

/**
 * Create a new session for a player. Returns sessionToken.
 */
function createSession(playerId, playerName) {
    const token = uuidv4();
    sessions.set(token, { playerId, playerName, disconnectedAt: null });
    playerTokens.set(playerId, token);
    return token;
}

/**
 * Get session by token, or null if not found.
 */
function getSession(token) {
    return sessions.get(token) || null;
}

/**
 * Mark player as disconnected (start expiry timer: 60s).
 */
function markDisconnected(token) {
    const session = sessions.get(token);
    if (session) {
        session.disconnectedAt = Date.now();
        // Auto-remove after 60 seconds
        setTimeout(() => {
            const s = sessions.get(token);
            if (s && s.disconnectedAt !== null) {
                sessions.delete(token);
                playerTokens.delete(s.playerId);
            }
        }, 60000);
    }
}

/**
 * Mark player as reconnected (clear disconnectedAt).
 */
function markReconnected(token) {
    const session = sessions.get(token);
    if (session) {
        session.disconnectedAt = null;
    }
}

/**
 * Get session token for a playerId.
 */
function getTokenByPlayerId(playerId) {
    return playerTokens.get(playerId) || null;
}

/**
 * Remove session entirely.
 */
function removeSession(token) {
    const session = sessions.get(token);
    if (session) {
        playerTokens.delete(session.playerId);
    }
    sessions.delete(token);
}

module.exports = { createSession, getSession, markDisconnected, markReconnected, getTokenByPlayerId, removeSession };
