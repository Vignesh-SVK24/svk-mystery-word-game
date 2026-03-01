// server.js — Main entry point: Express + Socket.io + LAN IP display
'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode-terminal');

const { GameManager } = require('./src/gameManager');
const { createSession, getSession, markDisconnected, markReconnected, removeSession } = require('./src/sessionManager');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

function getLanIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// ── Game Rooms Map ─────────────────────────────────────────────────────────
const rooms = new Map(); // roomCode -> GameManager instance
const socketToRoom = new Map(); // socketId -> roomCode

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return rooms.has(code) ? generateRoomCode() : code;
}

// ── Socket.io Events ───────────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log(`[SOCKET] Connected: ${socket.id}`);

    // Create a new room
    socket.on('createRoom', ({ playerName }) => {
        const roomCode = generateRoomCode();
        const game = new GameManager(io, roomCode);
        rooms.set(roomCode, game);

        console.log(`[ROOM] Created: ${roomCode} by ${playerName}`);

        // Auto-join the creator
        joinRoom(socket, { playerName, roomCode });
    });

    // Join an existing room
    socket.on('join', ({ playerName, roomCode, sessionToken }) => {
        joinRoom(socket, { playerName, roomCode, sessionToken });
    });

    function joinRoom(socket, { playerName, roomCode, sessionToken }) {
        if (!roomCode) {
            socket.emit('error', { message: 'Room code is required.' });
            return;
        }

        const code = roomCode.toUpperCase().trim();
        const game = rooms.get(code);

        if (!game) {
            socket.emit('error', { message: `Room ${code} not found.` });
            return;
        }

        // Try reconnect first
        if (sessionToken) {
            const session = getSession(sessionToken);
            if (session) {
                const player = game.reconnectPlayer(socket, sessionToken);
                if (player) {
                    markReconnected(sessionToken);
                    socketToRoom.set(socket.id, code);
                    socket.emit('reconnected', {
                        sessionToken,
                        playerId: player.id,
                        playerName: player.name,
                        role: player.role,
                        privatePayload: player.privatePayload,
                        gameState: game.state,
                        roomCode: code
                    });
                    game.broadcastLobbyState();
                    console.log(`[SOCKET] Reconnected: ${player.name} to ${code}`);
                    return;
                }
            }
        }

        // New join
        const name = (playerName || '').trim().slice(0, 20) || 'Anonymous';
        const newToken = uuidv4();
        createSession(newToken, name); // register token
        const player = game.addPlayer(socket, name, newToken);
        socketToRoom.set(socket.id, code);

        socket.emit('joined', {
            sessionToken: newToken,
            playerId: player.id,
            playerName: player.name,
            isHost: player.id === game.hostId,
            roomCode: code
        });
        game.broadcastLobbyState();
        console.log(`[SOCKET] Joined: ${name} to ${code}`);

        // Chat: announce join
        io.to(code).emit('chatMessage', {
            from: 'SYSTEM',
            text: `${name} joined the lobby!`,
            timestamp: Date.now()
        });
    }

    // ─ Ready toggle ─
    socket.on('setReady', ({ ready }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player) return;
        game.setReady(player.id, !!ready);
        game.broadcastLobbyState();
    });

    // ─ Host config ─
    socket.on('setConfig', ({ detectiveEnabled, difficulty, roundTimer, meetingTimer }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player || player.id !== game.hostId) return;
        if (typeof detectiveEnabled === 'boolean') game.setDetectiveEnabled(detectiveEnabled);
        if (difficulty) game.setDifficulty(difficulty);
        if (roundTimer) game.roundTimer = Math.max(30, Math.min(180, roundTimer));
        if (meetingTimer) game.meetingTimer = Math.max(30, Math.min(180, meetingTimer));
        game.broadcastLobbyState();
    });

    // ─ Start game ─
    socket.on('startGame', () => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player) return;
        const result = game.startGame(player.id);
        if (!result.ok) {
            socket.emit('error', { message: result.reason });
        }
    });

    // ─ Chat ─
    socket.on('chatMessage', ({ text }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player || !text || !text.trim()) return;
        const msg = {
            from: player.name,
            fromId: player.id,
            text: text.trim().slice(0, 300),
            timestamp: Date.now(),
            spectator: player.spectator
        };
        io.to(code).emit('chatMessage', msg);
    });

    // ─ Submit answer ─
    socket.on('submitAnswer', ({ answer }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player) return;
        const result = game.submitAnswer(player.id, answer);
        socket.emit('submitAnswerResult', result);
    });

    // ─ Call meeting ─
    socket.on('callMeeting', () => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player || !player.alive) return;
        const result = game.callMeeting(player.id);
        if (!result.ok) socket.emit('error', { message: result.reason });
    });

    // ─ Call vote (legacy or special) ─
    socket.on('callVote', ({ accusedId }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player || !player.alive) return;
        const result = game.callVote(player.id, accusedId);
        if (!result.ok) socket.emit('error', { message: result.reason });
    });

    // ─ Cast vote ─
    socket.on('castVote', ({ vote }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player || !player.alive) return;
        const result = game.castVote(player.id, vote);
        if (!result.ok) socket.emit('error', { message: result.reason });
    });

    // ─ Detective action ─
    socket.on('detectiveAction', ({ action, targetId }) => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player) return;
        const result = game.detectiveAction(player.id, action, targetId);
        if (!result.ok) socket.emit('error', { message: result.reason });
    });

    // ─ Play Again ─
    socket.on('playAgain', () => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.getPlayerBySocket(socket.id);
        if (!player) return;
        game.playerRestart(player.id);
    });

    // ─ Disconnect ─
    socket.on('disconnect', () => {
        const code = socketToRoom.get(socket.id);
        const game = rooms.get(code);
        if (!game) return;
        const player = game.removePlayer(socket.id);
        if (player) {
            const token = player.sessionToken;
            if (token) markDisconnected(token);
            console.log(`[SOCKET] Disconnected: ${player.name} from ${code}`);
            io.to(code).emit('chatMessage', {
                from: 'SYSTEM',
                text: `${player.name} disconnected.`,
                timestamp: Date.now()
            });
            game.broadcastLobbyState();

            // Clean up room if empty
            if (game.players.size === 0) {
                rooms.delete(code);
                console.log(`[ROOM] Deleted: ${code} (empty)`);
            }
        }
        socketToRoom.delete(socket.id);
    });
});

// ── Start Server ───────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
    const lanIP = getLanIP();
    const url = `http://${lanIP}:${PORT}`;
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║        🔮 MYSTERY WORD GAME SERVER 🔮        ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Local:   http://localhost:${PORT}              ║`);
    console.log(`║  LAN:     ${url.padEnd(35)}║`);
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║  Scan QR code below to join from mobile:     ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    qrcode.generate(url, { small: true });
    console.log(`\n  Share this link with players on the same Wi-Fi: ${url}\n`);
});
