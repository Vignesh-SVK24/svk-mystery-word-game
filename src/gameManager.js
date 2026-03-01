// src/gameManager.js — Lobby, roles, rounds, win conditions
'use strict';
const { v4: uuidv4 } = require('uuid');
const VoteManager = require('./voteManager');
const { pickWord, scramble, getClue, checkAnswer } = require('./wordBank');

const GAME_STATES = {
    LOBBY: 'lobby',
    ROUND_ACTIVE: 'round_active',
    MEETING: 'meeting',
    VOTE: 'vote',
    ROUND_END: 'round_end',
    GAME_END: 'game_end'
};

class GameManager {
    constructor(io, roomCode) {
        this.io = io;             // socket.io server instance
        this.roomCode = roomCode; // unique lobby code
        this.players = new Map(); // playerId -> player object
        this.hostId = null;
        this.state = GAME_STATES.LOBBY;
        this.detectiveEnabled = false;
        this.difficulty = 'medium';
        this.roundTimer = 90;     // seconds
        this.timerHandle = null;
        this.roundId = 0;
        this.currentWord = null;
        this.voteManager = new VoteManager();
        this.detectiveUsedKick = false;
        this.correctGuessers = new Set();
        this.readyForMeeting = new Set(); // set of playerIds ready to move to meeting
        this.socketToPlayer = new Map(); // socketId -> playerId
        this.tokenToSocket = new Map();  // sessionToken -> socketId
        this.meetingTimer = 60; // seconds for meeting
        this.votingTimer = 30;  // seconds for voting
        this.availableColors = [
            '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
            '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
            '#71717a', '#fb7185', '#f43f5e', '#84cc16', '#a855f7',
            '#0ea5e9', '#ea580c', '#22c55e', '#eab308', '#94a3b8',
            '#dc2626', '#2563eb'
        ];
        this.stats = {
            roundsPlayed: 0,
            kickedPlayers: []
        };
        this.restartVotes = new Set(); // Track who wants to play again
    }

    // Helper to emit to the room
    emitToRoom(event, data) {
        this.io.to(this.roomCode).emit(event, data);
    }

    // ── Player Management ──────────────────────────────────────────────────────

    addPlayer(socket, playerName, sessionToken) {
        socket.join(this.roomCode); // Join the socket room
        const playerId = uuidv4();
        const player = {
            id: playerId,
            name: playerName,
            socketId: socket.id,
            sessionToken,
            color: this._assignRandomColor(),
            ready: false,
            role: null,        // 'killer' | 'detective' | 'guest'
            alive: true,
            spectator: false,
            disconnected: false,
            privatePayload: null
        };
        this.players.set(playerId, player);
        this.socketToPlayer.set(socket.id, playerId);
        this.tokenToSocket.set(sessionToken, socket.id);

        if (!this.hostId) this.hostId = playerId;
        return player;
    }

    reconnectPlayer(socket, sessionToken) {
        // Find player by sessionToken
        let player = null;
        for (const p of this.players.values()) {
            if (p.sessionToken === sessionToken) { player = p; break; }
        }
        if (!player) return null;

        // Reattach socket
        socket.join(this.roomCode); // Join the socket room again
        const oldSocketId = player.socketId;
        this.socketToPlayer.delete(oldSocketId);
        player.socketId = socket.id;
        player.disconnected = false;
        this.socketToPlayer.set(socket.id, player.id);
        this.tokenToSocket.set(sessionToken, socket.id);
        return player;
    }

    removePlayer(socketId) {
        const playerId = this.socketToPlayer.get(socketId);
        if (!playerId) return null;
        const player = this.players.get(playerId);
        if (!player) return null;

        // Don't remove from map during an active game — just mark disconnected
        if (this.state !== GAME_STATES.LOBBY) {
            player.disconnected = true;
        } else {
            if (player.color && !this.availableColors.includes(player.color)) {
                this.availableColors.push(player.color);
            }
            this.players.delete(playerId);
            this.socketToPlayer.delete(socketId);
            // Host migration
            if (playerId === this.hostId) {
                const next = [...this.players.values()].find(p => !p.disconnected);
                this.hostId = next ? next.id : null;
            }
        }
        return player;
    }

    getPlayerBySocket(socketId) {
        const pid = this.socketToPlayer.get(socketId);
        return pid ? this.players.get(pid) : null;
    }

    getPlayerList() {
        return [...this.players.values()].map(p => ({
            id: p.id,
            name: p.name,
            ready: p.ready,
            alive: p.alive,
            spectator: p.spectator,
            disconnected: p.disconnected,
            isHost: p.id === this.hostId,
            color: p.color
        }));
    }

    getAlivePlayers() {
        return [...this.players.values()].filter(p => p.alive && !p.spectator && !p.disconnected);
    }

    // ── Lobby ──────────────────────────────────────────────────────────────────

    setReady(playerId, ready) {
        const p = this.players.get(playerId);
        if (p) p.ready = ready;
    }

    setDetectiveEnabled(enabled) {
        const count = this.players.size;
        this.detectiveEnabled = enabled && count >= 5;
    }

    setDifficulty(difficulty) {
        if (['easy', 'medium', 'hard'].includes(difficulty)) this.difficulty = difficulty;
    }

    _assignRandomColor() {
        if (this.availableColors.length > 0) {
            const idx = Math.floor(Math.random() * this.availableColors.length);
            const color = this.availableColors[idx];
            this.availableColors.splice(idx, 1);
            return color;
        }

        // Fallback: Generate a unique random hex if pool is empty
        const usedColors = Array.from(this.players.values()).map(p => p.color);
        let randomColor = '#ffffff';
        for (let i = 0; i < 20; i++) {
            const hex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            if (!usedColors.includes(hex)) {
                randomColor = hex;
                break;
            }
        }
        return randomColor;
    }

    canStart() {
        const ps = [...this.players.values()];
        return (
            ps.length >= 4 &&
            ps.every(p => p.ready)
        );
    }

    broadcastLobbyState() {
        const payload = {
            roomCode: this.roomCode,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                ready: p.ready,
                isHost: p.id === this.hostId,
                color: p.color
            })),
            hostId: this.hostId,
            difficulty: this.difficulty,
            detectiveEnabled: this.detectiveEnabled,
            roundTimer: this.roundTimer,
            meetingTimer: this.meetingTimer,
            availableColors: this.availableColors
        };
        this.emitToRoom('lobbyState', payload);
    }

    // ── Role Assignment ────────────────────────────────────────────────────────

    assignRoles() {
        const ps = [...this.players.values()];
        // Reset everyone first
        for (const p of ps) {
            p.alive = true;
            p.spectator = false;
        }

        // Shuffle
        for (let i = ps.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ps[i], ps[j]] = [ps[j], ps[i]];
        }

        let idx = 0;
        ps[idx++].role = 'killer';

        if (this.detectiveEnabled && ps.length >= 5) {
            ps[idx++].role = 'detective';
        }

        for (; idx < ps.length; idx++) {
            ps[idx].role = 'guest';
        }
    }

    // ── Round Management ───────────────────────────────────────────────────────

    startRound() {
        this.roundId++;
        this.state = GAME_STATES.ROUND_ACTIVE;
        this.correctGuessers.clear();
        this.readyForMeeting.clear();
        this.voteManager.reset();
        this.voteManager.active = true; // Support early voting from the start
        this.stats.roundsPlayed++;

        const wordObj = pickWord(this.difficulty);
        this.currentWord = wordObj.word;
        const clue = getClue(wordObj);
        const scrambledLetters = scramble(this.currentWord);

        // Send private payloads
        for (const player of this.players.values()) {
            if (player.disconnected) continue;
            let payload;
            const basePayload = {
                role: player.role,
                roundId: this.roundId,
                isAlive: player.alive
            };

            if (player.role === 'killer') {
                payload = { ...basePayload, privatePayload: { clue } };
            } else if (player.role === 'detective') {
                payload = {
                    ...basePayload,
                    privatePayload: { suspects: this.getAlivePlayers().filter(p => p.id !== player.id).map(p => ({ id: p.id, name: p.name, color: p.color })) }
                };
            } else {
                payload = {
                    ...basePayload,
                    privatePayload: { word: this.currentWord, clue }
                };
            }
            player.privatePayload = payload;
            this.io.to(player.socketId).emit('roleAssign', payload);
        }

        // Broadcast alive list to all (no role info)
        this.emitToRoom('roundStarted', {
            roundId: this.roundId,
            timerSeconds: this.roundTimer,
            alivePlayers: this.getAlivePlayers().map(p => ({ id: p.id, name: p.name, color: p.color }))
        });

        // Start round timer
        this._startTimer(this.roundTimer);
    }

    _startTimer(seconds) {
        if (this.timerHandle) clearInterval(this.timerHandle);
        let remaining = seconds;
        this.emitToRoom('timerUpdate', { remaining, total: seconds });
        this.timerHandle = setInterval(() => {
            remaining--;
            this.emitToRoom('timerUpdate', { remaining, total: seconds });
            if (remaining <= 0) {
                clearInterval(this.timerHandle);
                this._onTimerExpired();
            }
        }, 1000);
    }

    _onTimerExpired() {
        if (this.state === GAME_STATES.ROUND_ACTIVE) {
            this.startMeeting();
        } else if (this.state === GAME_STATES.MEETING) {
            this._resolveKickByVotes();
        }
    }

    _scheduleNextRound(delay = 5000) {
        setTimeout(() => {
            if (this.state !== GAME_STATES.GAME_END) {
                // DON'T re-assign roles here, keep roles persistent in same match
                this.startRound();
            }
        }, delay);
    }

    // ── Answer Submission ──────────────────────────────────────────────────────

    submitAnswer(playerId, guess) {
        const player = this.players.get(playerId);
        if (!player || !player.alive || this.state !== GAME_STATES.ROUND_ACTIVE) {
            return { ok: false, reason: 'Game state or player is invalid.' };
        }

        if (player.role === 'guest') {
            if (this.readyForMeeting.has(playerId)) return { ok: false, reason: 'Already ready.' };
            const correct = checkAnswer(guess, this.currentWord);
            if (correct) {
                this.readyForMeeting.add(playerId);
                this.correctGuessers.add(playerId);
                this.emitToRoom('correctGuess', { count: this.correctGuessers.size });
                this._notifyPlayerJoinedMeeting(player);
                // No automatic startMeeting here
            }
            return { ok: true, correct };
        } else {
            if (this.readyForMeeting.has(playerId)) return { ok: false, reason: 'Already ready.' };
            this.readyForMeeting.add(playerId);
            this._notifyPlayerJoinedMeeting(player);
            // No automatic startMeeting here
            return { ok: true };
        }
    }

    callMeeting(playerId) {
        const player = this.players.get(playerId);
        if (!player || !player.alive || this.state !== GAME_STATES.ROUND_ACTIVE) {
            return { ok: false, reason: 'Meeting cannot be called now.' };
        }
        if (!this.readyForMeeting.has(playerId)) {
            return { ok: false, reason: 'You must finish your task before calling a meeting.' };
        }

        this.emitToRoom('chatMessage', {
            from: 'SYSTEM',
            text: `🛎️ ${player.name} has called an Emergency Meeting!`,
            timestamp: Date.now()
        });

        this.startMeeting();
        return { ok: true };
    }

    _notifyPlayerJoinedMeeting(player) {
        // Individual success
        this.io.to(player.socketId).emit('playerReady', {
            alivePlayers: this.getAlivePlayers().map(p => ({ id: p.id, name: p.name, color: p.color })),
            correctWord: player.role === 'guest' ? this.currentWord : null
        });

        // Room-wide update: Who is in the meeting now?
        const attendees = Array.from(this.readyForMeeting).map(id => {
            const p = this.players.get(id);
            return { id: p.id, name: p.name, color: p.color };
        });

        this.emitToRoom('meetingLobbyUpdate', {
            attendees,
            totalAlive: this.getAlivePlayers().length
        });
    }

    _checkAllReadyForMeeting() {
        // Automatic start disabled as per user request "meeting is start only if players call for meeting"
        // But we might still want it if timer runs out (handled by timer logic)
    }

    startMeeting() {
        if (this.timerHandle) clearInterval(this.timerHandle);
        this.state = GAME_STATES.MEETING;
        this.voteManager.startVoting(); // Start voting immediately when meeting begins
        this.emitToRoom('meetingStarted', {
            timerSeconds: this.meetingTimer,
            alivePlayers: this.getAlivePlayers().map(p => ({ id: p.id, name: p.name, color: p.color }))
        });
        this._startTimer(this.meetingTimer);
    }

    // ── Voting ─────────────────────────────────────────────────────────────────

    callVote(callerId, accusedId) {
        // Obsolete in new flow
        return { ok: false, reason: 'Manual voting is disabled.' };
    }

    castVote(voterId, targetId) {
        const voter = this.players.get(voterId);
        if (!voter || !voter.alive) return { ok: false, reason: 'You are not eligible to vote.' };

        // Allow voting in MEETING or if player is ready in ROUND_ACTIVE
        if (this.state !== GAME_STATES.MEETING &&
            !(this.state === GAME_STATES.ROUND_ACTIVE && this.readyForMeeting.has(voterId))) {
            return { ok: false, reason: 'Voting is not active for you yet.' };
        }
        const result = this.voteManager.castVote(voterId, targetId);
        if (!result.ok) return result;

        const aliveIds = this.getAlivePlayers().map(p => p.id);
        this.emitToRoom('voteCast', {
            voterId,
            votedCount: Object.keys(this.voteManager.votes).length,
            totalToVote: aliveIds.length
        });

        if (this.voteManager.isVotingComplete(aliveIds)) {
            this._resolveKickByVotes();
        }
        return { ok: true };
    }

    _resolveKickByVotes() {
        if (this.timerHandle) clearInterval(this.timerHandle);
        const aliveIds = this.getAlivePlayers().map(p => p.id);
        const results = this.voteManager.getResults(aliveIds);

        if (results.kick) {
            this._resolveKick(results.winnerId, true, { tally: results.tally });
        } else {
            this._resolveKick(null, false, { tally: results.tally, tie: results.tie });
        }
    }

    detectiveAction(detId, action, targetId) {
        // Obsolete or could be reused for something else, but per requirements, detective votes like everyone else.
        return { ok: false, reason: 'Detective uses standard voting now.' };
    }

    _resolveKick(accusedId, kick, meta = {}) {
        if (this.timerHandle) clearInterval(this.timerHandle);
        this.state = GAME_STATES.ROUND_END;

        let roleRevealed = null;
        let accusedName = null;

        if (kick && accusedId) {
            const accused = this.players.get(accusedId);
            if (accused) {
                roleRevealed = accused.role;
                accusedName = accused.name;
                accused.alive = false;
                accused.spectator = true;
                this.stats.kickedPlayers.push({ id: accusedId, name: accusedName, role: roleRevealed });
            }
        }

        const kickResult = {
            kicked: kick,
            accusedId,
            accusedName,
            roleRevealed,
            ...meta,
            alivePlayers: this.getAlivePlayers().map(p => ({ id: p.id, name: p.name, color: p.color }))
        };

        this.emitToRoom('kickResult', kickResult);

        // Check win conditions
        const winCheck = this._checkWinCondition(kick, roleRevealed);
        if (winCheck.over) {
            this.state = GAME_STATES.GAME_END;
            setTimeout(() => {
                this.emitToRoom('gameEnd', {
                    winner: winCheck.winner,
                    message: winCheck.message,
                    stats: this.stats
                });
            }, 3000);
        } else {
            this._scheduleNextRound(5000);
        }
    }

    _checkWinCondition(kicked, roleRevealed) {
        if (kicked && roleRevealed === 'killer') {
            return { over: true, winner: 'guests', message: '🎉 The Killer has been caught! Guests win the match!' };
        }
        const aliveCount = this.getAlivePlayers().length;
        if (aliveCount <= 3) {
            return { over: true, winner: 'killer', message: '💀 The Killer wins! Guests have been decimated.' };
        }
        return { over: false };
    }

    startGame(requesterId) {
        if (requesterId !== this.hostId) return { ok: false, reason: 'Only the host can start.' };
        if (!this.canStart()) return { ok: false, reason: 'Not everyone is ready or not enough players.' };
        this.restartVotes.clear(); // Clear any pending restart votes
        this.assignRoles();
        this.startRound();
        return { ok: true };
    }

    playerRestart(playerId) {
        if (this.state !== GAME_STATES.GAME_END) return { ok: false, reason: 'Game has not ended yet.' };
        this.restartVotes.add(playerId);

        this.emitToRoom('restartProgress', {
            ready: this.restartVotes.size,
            total: this.players.size
        });

        if (this.restartVotes.size >= this.players.size) {
            // Reset for new match
            this.roundId = 0;
            this.stats = { roundsPlayed: 0, kickedPlayers: [] };
            this.restartVotes.clear();

            // Start match immediately
            this.assignRoles();
            this.startRound();
        }
    }
}

module.exports = { GameManager, GAME_STATES };
