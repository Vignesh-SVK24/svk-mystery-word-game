/* ═══════════════════════════════════════════════════════════
   MYSTERY WORD GAME — game.js
   Full socket.io client: screen routing, UI updates,
   vote flow, role reveal, timer, animations.
   ═══════════════════════════════════════════════════════════ */
'use strict';

// ── State ────────────────────────────────────────────────────
const state = {
    sessionToken: localStorage.getItem('mwg_session') || null,
    playerId: null,
    playerName: '',
    isHost: false,
    role: null,
    privatePayload: null,
    roundId: 0,
    timerTotal: 90,
    alivePlayers: [],
    lobbyPlayers: [],
    difficulty: 'medium',
    detectiveEnabled: false,
    selectedDetSuspect: null,
    hasVoted: false,
    answerSubmitted: false,
    gameState: 'lobby',
    detKickUsed: false,
    roomCode: null
};

// ── Socket ───────────────────────────────────────────────────
const socket = io();

// ── Screen Router ─────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = document.getElementById(`screen-${id}`);
    if (s) s.classList.add('active');
    // Make lobby screen visible via flex
    if (id === 'lobby') { s.style.display = 'flex'; } else { s.style.display = ''; }
}

// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 4200);
}

function addChat(containerId, from, text, isOwn = false, isSystem = false, isSpectator = false) {
    const history = $(containerId);
    const wrap = document.createElement('div');
    wrap.className = `chat-msg${isOwn ? ' own-msg' : ''}${isSystem ? ' system-msg' : ''}`;

    if (!isSystem) {
        const nameEl = document.createElement('div');
        nameEl.className = 'msg-name';
        nameEl.textContent = from;
        wrap.appendChild(nameEl);
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble${isSpectator ? ' spectator' : ''}`;
    bubble.textContent = text;
    wrap.appendChild(bubble);

    history.appendChild(wrap);
    history.scrollTop = history.scrollHeight;
}

// ── Title Screen ─────────────────────────────────────────────
function initTitleScreen() {
    generateParticles();

    // Check URL for room code
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        $('inp-room').value = roomFromUrl.toUpperCase();
        toast(`Join link detected for room ${roomFromUrl.toUpperCase()}! 🔗`);
    }

    $('btn-create').addEventListener('click', () => {
        const name = $('inp-name').value.trim();
        if (!name) { toast('Please enter your name!', 'error'); return; }
        if (!socket.connected) { toast('Connecting to server...', 'error'); return; }
        state.playerName = name;
        socket.emit('createRoom', { playerName: name });
    });

    $('btn-join').addEventListener('click', () => {
        const name = $('inp-name').value.trim();
        const room = $('inp-room').value.trim();
        if (!name) { toast('Please enter your name!', 'error'); return; }
        if (!room) { toast('Please enter the lobby code!', 'error'); return; }
        state.playerName = name;
        state.roomCode = room.toUpperCase();
        socket.emit('join', { playerName: name, roomCode: state.roomCode, sessionToken: state.sessionToken });
    });
}

function generateParticles() {
    const container = $('particles');
    const count = 15;
    const colors = ['#c084fc', '#22d3ee', '#4ade80', '#f87171', '#fbbf24'];
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 40 + 20;
        p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration:${10 + Math.random() * 15}s;
      animation-delay:${-Math.random() * 20}s;
    `;
        container.appendChild(p);
    }
}

// ── Lobby Screen ─────────────────────────────────────────────
function initLobbyScreen() {
    $('btn-ready').addEventListener('click', () => {
        const isReady = $('btn-ready').classList.toggle('btn-primary');
        $('btn-ready').classList.toggle('btn-outline', !isReady);
        socket.emit('setReady', { ready: isReady });
    });

    $('btn-start').addEventListener('click', () => {
        socket.emit('startGame');
    });

    $('chk-detective').addEventListener('change', e => {
        socket.emit('setConfig', { detectiveEnabled: e.target.checked });
    });

    $('range-timer').addEventListener('input', e => {
        const val = e.target.value;
        $('timer-val').textContent = val;
        socket.emit('setConfig', { roundTimer: parseInt(val) });
    });

    $('range-meeting-timer').addEventListener('input', e => {
        const val = e.target.value;
        $('meeting-timer-val').textContent = val;
        socket.emit('setConfig', { meetingTimer: parseInt(val) });
    });

    document.querySelectorAll('.btn-diff').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            socket.emit('setConfig', { difficulty: btn.dataset.diff });
        });
    });

    $('lobby-chat-form').addEventListener('submit', e => {
        e.preventDefault();
        const text = $('lobby-chat-input').value.trim();
        if (!text) return;
        socket.emit('chatMessage', { text });
        $('lobby-chat-input').value = '';
    });

    $('btn-copy-url').addEventListener('click', () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;
        navigator.clipboard.writeText(shareUrl).then(() => toast('Share link copied! 📋'));
    });

    // How to Play Modal Logic
    const toggleModal = (id, show) => $(id).classList.toggle('hidden', !show);
    $('btn-open-how-to-play-title').addEventListener('click', () => toggleModal('modal-how-to-play', true));
    $('btn-open-how-to-play-lobby').addEventListener('click', () => toggleModal('modal-how-to-play', true));
    $('btn-close-how-to-play').addEventListener('click', () => toggleModal('modal-how-to-play', false));

    // Close on overlay click
    $('modal-how-to-play').addEventListener('click', (e) => {
        if (e.target === $('modal-how-to-play')) toggleModal('modal-how-to-play', false);
    });
}

function renderLobby(data) {
    state.lobbyPlayers = data.players;
    state.detectiveEnabled = data.detectiveEnabled;
    state.difficulty = data.difficulty;
    $('lobby-count').textContent = `${data.players.length}/10`;

    const lobbyUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;
    $('lobby-url').textContent = lobbyUrl;
    $('lobby-code').textContent = state.roomCode;

    const list = $('player-list');
    list.innerHTML = '';
    data.players.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = `player-item${p.isHost ? ' is-host' : ''}`;

        // Generate bean character
        const beanHtml = getBeanHtml(p.color || '#ffffff');

        div.innerHTML = `
      ${beanHtml}
      <div class="player-name" style="margin-left: 8px;">${escHtml(p.name)}</div>
      <div class="player-badges">
        ${p.isHost ? '<span class="pip pip-host">HOST</span>' : ''}
        <span class="pip ${p.ready ? 'pip-ready' : 'pip-waiting'}">${p.ready ? 'READY' : 'WAIT'}</span>
      </div>
    `;
        list.appendChild(div);
    });

    // Host controls
    const isHost = data.hostId === state.playerId;
    state.isHost = isHost;

    if (isHost) {
        $('host-controls').classList.remove('hidden');
        $('btn-start').classList.remove('hidden');
    } else {
        $('host-controls').classList.add('hidden');
        $('btn-start').classList.add('hidden');
    }

    // Sync settings
    $('chk-detective').checked = data.detectiveEnabled;
    $('range-timer').value = data.roundTimer;
    $('timer-val').textContent = data.roundTimer;
    $('range-meeting-timer').value = data.meetingTimer;
    $('meeting-timer-val').textContent = data.meetingTimer;

    $('detective-note').textContent = data.players.length < 5 ? '⚠️ Requires ≥5 players' : data.detectiveEnabled ? '✅ Detective enabled' : 'Requires ≥5 players';

    // All ready? (Minimum 4 players)
    const allReady = data.players.length >= 4 && data.players.every(p => p.ready);
    $('btn-start').disabled = !allReady;
    $('btn-start').style.opacity = allReady ? '1' : '0.5';
}

// ── Role Reveal Screen ────────────────────────────────────────
function showRoleReveal(roleData) {
    state.role = roleData.role;
    state.roleData = roleData; // Store full role data for isAlive check
    state.privatePayload = roleData.privatePayload;
    state.answerSubmitted = false;
    state.hasVoted = false; // Reset at start of round
    state.selectedDetSuspect = null;

    // Handle spectator view
    if (roleData.isAlive === false) {
        $('role-reveal-title').textContent = '⚠️ YOU ARE SPECTATING';
        $('role-reveal-title').style.color = 'var(--text-muted)';
        $('spectator-status').classList.remove('hidden');
        // Hide all active role sections
        ['role-guest', 'role-killer', 'role-detective'].forEach(id => $(id).classList.add('hidden'));
    } else {
        $('role-reveal-title').textContent = 'YOUR ROLE';
        $('role-reveal-title').style.color = 'var(--cyan)';
        $('spectator-status').classList.add('hidden');

        if (roleData.role === 'guest') {
            $('role-guest').classList.remove('hidden');
            $('guest-word-display').textContent = roleData.privatePayload.word;
            $('role-guest-clue').textContent = roleData.privatePayload.clue || 'Join the meeting!';
            $('answer-feedback').textContent = '';
            $('answer-feedback').className = 'answer-feedback';
            $('inp-answer').value = '';
            $('btn-submit-answer').disabled = false;
        } else if (roleData.role === 'killer') {
            $('role-killer').classList.remove('hidden');
            $('killer-clue').textContent = roleData.privatePayload.clue;
            if ($('btn-killer-ready')) {
                $('btn-killer-ready').disabled = false;
                $('btn-killer-ready').textContent = 'Ready for Meeting 👊';
            }
        } else if (roleData.role === 'detective') {
            $('role-detective').classList.remove('hidden');
            renderDetectiveSuspects(roleData.privatePayload.suspects);
            if ($('btn-det-ready')) {
                $('btn-det-ready').disabled = false;
                $('btn-det-ready').textContent = 'Ready for Meeting 👊';
            }
        }
    }

    showScreen('role');
}


function renderDetectiveSuspects(suspects) {
    const list = $('detective-suspect-list');
    list.innerHTML = '';
    suspects.forEach(s => {
        const item = document.createElement('div');
        item.className = 'det-suspect-item';
        item.dataset.id = s.id;
        item.innerHTML = `<span>${getPlayerEmoji(s.name)}</span><span class="det-suspect-name">${escHtml(s.name)}</span>`;
        item.addEventListener('click', () => {
            document.querySelectorAll('.det-suspect-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            state.selectedDetSuspect = s.id;
            $('btn-det-kick').disabled = state.detKickUsed;
        });
        list.appendChild(item);
    });
}

function initRoleScreen() {
    // Main button submission (Main Card)
    $('btn-killer-ready')?.addEventListener('click', () => {
        if (state.answerSubmitted) return;
        socket.emit('submitAnswer', {});
        $('btn-killer-ready').disabled = true;
        $('btn-killer-ready').textContent = 'Joining...';
    });

    $('btn-det-ready')?.addEventListener('click', () => {
        if (state.answerSubmitted) return;
        socket.emit('submitAnswer', {});
        $('btn-det-ready').disabled = true;
        $('btn-det-ready').textContent = 'Joining...';
    });

    $('btn-submit-answer')?.addEventListener('click', () => {
        const answer = $('inp-answer').value.trim();
        if (!answer || state.answerSubmitted) return;
        socket.emit('submitAnswer', { answer });
    });

    $('round-chat-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = $('round-chat-input').value.trim();
        if (!text) return;
        socket.emit('chatMessage', { text });
        $('round-chat-input').value = '';
    });

    // Support Meeting Hall Chat
    $('hall-chat-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = $('hall-chat-input').value.trim();
        if (!text) return;
        socket.emit('chatMessage', { text });
        $('hall-chat-input').value = '';
    });
}

// ── Screen Transitions ────────────────────────────────────────

function showMeetingScreen() {
    state.screen = 'meeting';
    showScreen('meeting');
    const chip = $('hall-my-role-text');
    if (chip) {
        chip.textContent = (state.role || 'Guest').toUpperCase();
        chip.className = `role-chip-${state.role}`;
    }

    let infoHtml = '';
    if (state.role === 'killer') {
        infoHtml = `<span class="hall-clue">Hint: ${escHtml(state.privatePayload?.clue || '')}</span>`;
    } else if (state.role === 'guest') {
        if (state.answerSubmitted) {
            infoHtml = `<span class="hall-clue" style="color:var(--green)">Solved Word: ${escHtml(state.correctWord || '???')}</span>`;
        } else {
            infoHtml = `<span class="hall-clue">Your word: ${escHtml(state.privatePayload?.scrambled?.join('') || '')}</span>`;
        }
    } else if (state.role === 'detective') {
        infoHtml = `<span class="hall-clue">${state.detKickUsed ? '⚠️ Kick used' : '🔍 Use your power to find the Killer!'}</span>`;
    }

    const footer = $('hall-my-role-info');
    if (footer) {
        footer.innerHTML = `Your role: <span id="hall-my-role-text" class="role-chip-${state.role}">${(state.role || 'Guest').toUpperCase()}</span> ${infoHtml}`;
    }
}

function showRoundScreen() {
    state.screen = 'round';
    showScreen('round');
    $('alive-count').textContent = state.alivePlayers.length;
    renderAliveList(state.alivePlayers);

    // If dead, show simplified sidebar
    if (state.roleData && state.roleData.isAlive === false) {
        $('my-role-panel').innerHTML = `
            <div class="my-role-mini spectator-mode">
                <div style="color:var(--text-muted); font-weight:700;">👻 SPECTATING</div>
                <p class="note">You were kicked. Wait for the match to end.</p>
            </div>
        `;
    } else {
        renderMyRolePanel();
    }

    if ($('round-number')) $('round-number').textContent = state.roundId;
}

function renderAliveList(players) {
    const list = $('alive-list');
    list.innerHTML = '';
    $('alive-count').textContent = players.length;
    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'alive-item';
        item.dataset.id = p.id;
        const beanHtml = getBeanHtml(p.color || '#ffffff');
        item.innerHTML = `<span class="alive-avatar">${beanHtml}</span><span class="alive-name">${escHtml(p.name)}</span>`;
        list.appendChild(item);
    });
}

function renderMyRolePanel() {
    const panel = $('my-role-panel');
    if (!state.role || !panel) return;

    let content = '';
    if (state.role === 'guest' && state.privatePayload) {
        const letters = state.privatePayload.scrambled;
        content = `
      <div class="my-role-mini">
        <div style="color:var(--cyan); font-weight:700; margin-bottom:4px;">👤 Guest</div>
        ${state.answerSubmitted ? `
          <p style="color:var(--green);font-weight:700;margin-top:8px;">✅ Word Solved!</p>
          <div class="solved-word" style="font-size:18px; font-weight:800; color:var(--white); margin: 4px 0;">${escHtml(state.correctWord || '???')}</div>
        ` : `
          <p class="note">Your scrambled word:</p>
          <div class="mini-tile-container">
            ${letters.map(l => `<div class="mini-tile">${escHtml(l)}</div>`).join('')}
          </div>
          <p class="mini-clue mt4">Hint: ${escHtml(state.privatePayload.clue || '')}</p>
          <div class="my-answer-row" style="margin-top:8px;">
            <input type="text" id="my-ans" class="inp" placeholder="Your answer..." maxlength="20" autocomplete="off">
            <button id="my-ans-btn" class="btn btn-primary">✓</button>
          </div>
        `}
      </div>`;
    } else if (state.role === 'killer') {
        content = `<div class="my-role-mini">
      <div style="color:var(--red);font-weight:700; margin-bottom:8px;">🔪 Killer</div>
      <div class="mini-clue">Your Hint: ${escHtml(state.privatePayload?.clue || '')}</div>
    </div>`;
    } else if (state.role === 'detective') {
        content = `<div class="my-role-mini">
      <div style="color:var(--purple);font-weight:700;">🔍 Detective</div>
      <p class="note" style="margin-top:8px;">Find the Killer! ${state.detKickUsed ? '<br>⚠️ Kick already used.' : '<br>⚡ Kick available.'}</p>
    </div>`;
    }

    const meetingBtnHtml = `
      <div class="mt16 pt16" style="border-top: 1px solid rgba(255,255,255,0.1);">
        <button id="btn-call-meeting" class="btn btn-warning w100 ${state.answerSubmitted ? '' : 'disabled'}" ${state.answerSubmitted ? '' : 'disabled'}>
          🛎️ Call Meeting
        </button>
        ${!state.answerSubmitted ? `<p class="note center xsmall mt4">${state.role === 'guest' ? 'Solve word' : 'Click Ready'} to call meeting</p>` : ''}
      </div>
    `;

    panel.innerHTML = content + meetingBtnHtml;

    // Attach listeners
    if (state.answerSubmitted) {
        $('btn-call-meeting')?.addEventListener('click', () => {
            socket.emit('callMeeting');
            $('btn-call-meeting').disabled = true;
            $('btn-call-meeting').textContent = 'Calling...';
        });
    }

    if (state.role === 'guest' && !state.answerSubmitted) {
        $('my-ans-btn')?.addEventListener('click', () => {
            const answer = $('my-ans')?.value.trim();
            if (answer) socket.emit('submitAnswer', { answer });
        });
        $('my-ans')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('my-ans-btn')?.click(); });
    }
}

function initRoundScreen() {
    // Support Meeting Hall Chat
    $('hall-chat-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = $('hall-chat-input').value.trim();
        if (!text) return;
        socket.emit('chatMessage', { text });
        $('hall-chat-input').value = '';
    });
}

function openSuspectPicker() {
    const list = $('suspect-pick-list');
    list.innerHTML = '';
    state.alivePlayers.filter(p => p.id !== state.playerId).forEach(p => {
        const item = document.createElement('div');
        item.className = 'suspect-pick-item';
        item.innerHTML = `<span>${getPlayerEmoji(p.name)}</span><span>${escHtml(p.name)}</span>`;
        item.addEventListener('click', () => {
            socket.emit('callVote', { accusedId: p.id });
            $('modal-suspect-pick').classList.add('hidden');
        });
        list.appendChild(item);
    });
    $('btn-cancel-vote').onclick = () => $('modal-suspect-pick').classList.add('hidden');
    $('modal-suspect-pick').classList.remove('hidden');
}

// ── Vote Modal ────────────────────────────────────────────────
function showVoteModal(data) {
    state.hasVoted = false;
    $('voted-count').textContent = '0';
    $('total-to-vote').textContent = data.alivePlayers.length;
    $('vote-status-text').textContent = 'Waiting for your vote...';

    renderVoteOptions(data.alivePlayers);
    $('modal-vote').classList.remove('hidden');
}

function renderVoteOptions(players) {
    const list = $('vote-options-list');
    list.innerHTML = '';
    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'suspect-pick-item';
        if (p.id === state.playerId) {
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
        }
        item.innerHTML = `<span>${getPlayerEmoji(p.name)}</span><span>${escHtml(p.name)}</span>`;
        item.onclick = () => {
            if (state.hasVoted) return;
            state.hasVoted = true;
            socket.emit('castVote', { vote: p.id });
            $('vote-status-text').textContent = 'Vote cast! Waiting for others...';
            // Disable all options
            document.querySelectorAll('.suspect-pick-item').forEach(el => el.style.pointerEvents = 'none');
            item.classList.add('selected');
        };
        list.appendChild(item);
    });
}

function updateVoteTally(voted, total) {
    if ($('voted-count')) $('voted-count').textContent = voted;
    if ($('total-to-vote')) $('total-to-vote').textContent = total;
}

// ── Kick Result ────────────────────────────────────────────────
function showKickResult(data) {
    $('modal-vote').classList.add('hidden');
    const modal = $('modal-kick-result');

    if (data.kicked) {
        $('kick-stamp').classList.remove('hidden');
        $('kick-result-title').textContent = `${escHtml(data.accusedName || 'Player')} was kicked!`;
        $('kick-result-body').textContent = 'The majority voted to remove them.';

        const chip = $('kick-role-reveal');
        chip.classList.remove('hidden');
        chip.className = `role-reveal-chip role-chip-${data.roleRevealed}`;
        chip.textContent = `Role: ${data.roleRevealed?.toUpperCase() || '???'}`;
    } else {
        $('kick-stamp').classList.add('hidden');
        $('kick-result-title').textContent = 'No Kick!';
        $('kick-result-body').textContent = data.tie ? 'It was a tie — nobody is kicked.' : 'The vote failed to reach a majority.';
        $('kick-role-reveal').classList.add('hidden');
    }
    $('kick-continue-text').textContent = 'Next round starting soon...';
    modal.classList.remove('hidden');

    setTimeout(() => modal.classList.add('hidden'), 4000);
}

// ── Timer ─────────────────────────────────────────────────────
function updateTimer(remaining, total) {
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    const bar = $('timer-bar');
    const barHall = document.querySelector('#meeting-timer-bar .timer-bar');

    if (bar) {
        bar.style.width = `${pct}%`;
        bar.className = `timer-bar${pct < 25 ? ' warning' : ''}`;
    }
    if (barHall) {
        barHall.style.width = `${pct}%`;
        barHall.className = `timer-bar fill${pct < 25 ? ' warning' : ''}`;
    }

    const display = $('timer-display');
    const displayHall = $('meeting-timer-display');
    if (display) display.textContent = `${remaining}s`;
    if (displayHall) displayHall.textContent = `${remaining}s`;
}

// ── Game End Screen ───────────────────────────────────────────
function showGameEnd(data) {
    const isGuestsWin = data.winner === 'guests';
    $('end-winner-emoji').textContent = isGuestsWin ? '🎉' : '💀';
    $('end-winner-title').textContent = isGuestsWin ? 'Guests Win!' : 'Killer Wins!';
    $('end-message').textContent = data.message;

    const stats = data.stats || {};
    $('stats-table').innerHTML = `
    <div class="stat-row"><span>Rounds Played</span><span class="stat-val">${stats.roundsPlayed || 0}</span></div>
    <div class="stat-row"><span>Players Kicked</span><span class="stat-val">${(stats.kickedPlayers || []).length}</span></div>
    ${(stats.kickedPlayers || []).map(p => `<div class="stat-row"><span>⛔ ${escHtml(p.name)}</span><span class="stat-val">${p.role?.toUpperCase()}</span></div>`).join('')}
  `;

    $('btn-play-again').disabled = false;
    $('btn-play-again').textContent = '🔄 Play Again';
    $('btn-play-again').onclick = () => {
        socket.emit('playAgain');
        $('btn-play-again').disabled = true;
        $('btn-play-again').textContent = 'Waiting for others...';
    };
    if ($('play-again-status')) $('play-again-status').textContent = '';

    showScreen('end');
}

// ── Socket Event Handlers ─────────────────────────────────────
socket.on('joined', data => {
    state.playerId = data.playerId;
    state.playerName = data.playerName;
    state.isHost = data.isHost;
    state.sessionToken = data.sessionToken;
    state.roomCode = data.roomCode;
    localStorage.setItem('mwg_session', data.sessionToken);
    showScreen('lobby');
    toast(`Welcome, ${data.playerName}! 👋`);
});

socket.on('reconnected', data => {
    state.playerId = data.playerId;
    state.playerName = data.playerName;
    state.role = data.role;
    state.privatePayload = data.privatePayload;
    state.gameState = data.gameState;
    state.sessionToken = data.sessionToken;
    state.roomCode = data.roomCode;
    localStorage.setItem('mwg_session', data.sessionToken);
    toast('Reconnected! 🔄', 'success');
    // Route to correct screen
    if (data.gameState === 'round_active' || data.gameState === 'vote') {
        showRoundScreen();
    } else if (data.gameState === 'game_end') {
        // Stay on lobby
        showScreen('lobby');
    } else {
        showScreen('lobby');
    }
});

socket.on('lobbyState', data => {
    renderLobby(data);
});

socket.on('roundStarted', data => {
    state.roundId = data.roundId;
    state.alivePlayers = data.alivePlayers;
    state.timerTotal = data.timerSeconds;
    state.hasVoted = false;
    state.detKickUsed = false;
    state.answerSubmitted = false; // Reset for next round
    $('hall-chat-history').innerHTML = '';
    addChat('hall-chat-history', '', '🔮 A new round has begun. Solve the word OR join the meeting!', false, true);
});

socket.on('roleAssign', data => {
    showRoleReveal(data);
});

socket.on('timerUpdate', data => {
    updateTimer(data.remaining, data.total);
});

socket.on('chatMessage', data => {
    const isOwn = data.fromId === state.playerId;
    const isSystem = data.from === 'SYSTEM';

    // Add to whichever screen is active
    let activeChat = 'lobby-chat-history';
    if (document.getElementById('screen-meeting')?.classList.contains('active')) activeChat = 'hall-chat-history';
    else if (document.getElementById('screen-round')?.classList.contains('active')) activeChat = 'round-chat-history';

    addChat(activeChat, data.from, data.text, isOwn, isSystem, data.spectator);
});

socket.on('meetingStarted', data => {
    state.timerTotal = data.timerSeconds;
    toast('Meeting Started! 🛎️', 'info');
    addChat('hall-chat-history', '', '🛎️ Meeting officially started! Discuss and find the Killer.', false, true);
    showMeetingScreen();
    // Initially everyone who isn't ready might be shown as WORKING...
    renderMeetingVoting(data.alivePlayers);
});

socket.on('voteCast', data => {
    // Optional: show a small notification or update a status text
    if (data.voterId === state.playerId) {
        $('hall-voting-status').textContent = '✅ Your vote is cast!';
        $('hall-voting-status').style.color = 'var(--green)';
    }
});

socket.on('playerReady', data => {
    state.answerSubmitted = true;
    state.alivePlayers = data.alivePlayers; // Sync alive list
    if (data.correctWord) state.correctWord = data.correctWord;

    toast('Wait for the meeting to be called! 🛎️', 'success');
    showRoundScreen();
    addChat('round-chat-history', '', '👋 You are ready. Wait for others or for someone to call a meeting.', false, true);
});

socket.on('meetingLobbyUpdate', data => {
    if (state.screen === 'meeting') {
        renderMeetingVoting(state.alivePlayers, data.attendees);
        $('hall-vote-count').textContent = `${data.attendees.length}/${data.totalAlive} Ready`;
    }
});

function renderMeetingVoting(allAlivePlayers, attendees = []) {
    const list = $('hall-vote-grid');
    if (!list) return;
    list.innerHTML = '';

    // Tally check
    const readyCount = attendees.length;
    const totalCount = allAlivePlayers.length;
    if ($('hall-vote-count')) $('hall-vote-count').textContent = `${readyCount}/${totalCount} Joined`;

    if (state.hasVoted) {
        $('hall-voting-status').textContent = '✅ Vote Registered';
        $('hall-voting-status').style.color = 'var(--green)';
    } else {
        $('hall-voting-status').textContent = 'Discussion phase... Click a player to vote.';
        $('hall-voting-status').style.color = 'var(--cyan)';
    }

    allAlivePlayers.forEach(p => {
        const isReady = attendees.length > 0 ? attendees.some(a => a.id === p.id) : true;
        const btn = document.createElement('button');
        btn.className = 'vote-btn';

        if (attendees.length > 0 && !isReady && p.id !== state.playerId) {
            btn.classList.add('not-ready');
            btn.disabled = true;
        }

        const beanHtml = getBeanHtml(p.color || '#ffffff');
        btn.innerHTML = `
            <span class="vote-avatar">${beanHtml}</span>
            <div class="vote-name-wrap" style="flex:1; text-align:left;">
                <span class="vote-name" style="display:block; font-size:16px;">${escHtml(p.name)}</span>
                <span class="vote-status-suffix">${isReady ? '<span class="ready-label" style="color:var(--green); font-weight:bold; font-size:10px;">PRESENT</span>' : '<span class="working-label" style="color:var(--yellow); font-size:10px; font-style:italic;">WORKING...</span>'}</span>
            </div>
            <span class="vote-check ${state.hasVoted ? '' : 'hidden'}">✓</span>
        `;
        if (state.hasVoted) btn.disabled = true;
        if (state.roleData && state.roleData.isAlive === false) btn.disabled = true; // Spectators can't vote
        if (p.id === state.playerId) btn.classList.add('is-me');

        btn.onclick = () => {
            if (state.hasVoted || btn.disabled) return;
            state.hasVoted = true;
            socket.emit('castVote', { vote: p.id });
            document.querySelectorAll('#hall-vote-grid .vote-btn').forEach(b => {
                b.classList.remove('selected');
                b.disabled = true;
            });
            btn.classList.add('selected');
            btn.querySelector('.vote-check').classList.remove('hidden');
            $('hall-voting-status').textContent = '✅ Vote cast!';
            $('hall-voting-status').style.color = 'var(--green)';
        };
        list.appendChild(btn);
    });
}

socket.on('kickResult', data => {
    state.alivePlayers = data.alivePlayers;
    showKickResult(data);
    if (data.kicked) {
        addChat('hall-chat-history', '', `⛔ ${data.accusedName} was kicked! (Role: ${data.roleRevealed?.toUpperCase()})`, false, true);
    } else {
        addChat('hall-chat-history', '', `✅ Nobody was kicked.`, false, true);
    }
});

socket.on('correctGuess', data => {
    $('guess-progress-wrap').classList.remove('hidden');
    const guestCount = state.alivePlayers.length; // approximate
    const pct = Math.min(100, (data.count / Math.max(guestCount - 2, 1)) * 100);
    $('guess-bar').style.width = `${pct}%`;
    $('guess-count').textContent = `${data.count} correct`;
});

socket.on('submitAnswerResult', data => {
    if (state.role !== 'guest') return;
    if (data.ok) {
        if (data.correct) {
            state.answerSubmitted = true; // Mark as submitted locally too
            $('answer-feedback').textContent = '✅ Correct! Joining meeting...';
            $('answer-feedback').className = 'answer-feedback correct';
            $('btn-submit-answer').disabled = true;
            renderMyRolePanel(); // Update sidebar immediately
        } else {
            $('answer-feedback').textContent = '❌ Wrong answer, try again.';
            $('answer-feedback').className = 'answer-feedback wrong';
            toast('Incorrect word, try again!', 'error');
        }
    } else {
        toast(data.reason || 'Submission failed.', 'error');
    }
});

socket.on('roundEnd', data => {
    $('modal-kick-result').classList.add('hidden');
    addChat('hall-chat-history', '', data.message || 'Round ended.', false, true);
});

socket.on('detectivePassed', () => {
    addChat('round-chat-history', '', '🔍 The Detective passed. New round incoming...', false, true);
});

socket.on('gameEnd', data => {
    showGameEnd(data);
});

socket.on('restartProgress', data => {
    if ($('play-again-status')) {
        $('play-again-status').textContent = `${data.ready} / ${data.total} players ready for a new match`;
    }
});

socket.on('error', data => {
    toast(data.message || 'An error occurred', 'error');
});

socket.on('connect_error', () => {
    toast('Connection lost. Retrying...', 'error');
});

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getBeanColor(name) {
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
        '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function getBeanHtml(color) {
    const safeColor = color || '#ffffff';
    return `
        <div class="bean-container" style="--bean-color: ${safeColor};">
            <div class="bean-backpack" style="background-color: ${safeColor};"></div>
            <div class="bean-body" style="background-color: ${safeColor};"></div>
            <div class="bean-visor"></div>
            <div class="bean-nose" style="background-color: ${safeColor};"></div>
            <div class="bean-leg-l" style="background-color: ${safeColor};"></div>
            <div class="bean-leg-r" style="background-color: ${safeColor};"></div>
        </div>
    `;
}

const emojiPool = ['🦊', '🐺', '🦁', '🐯', '🦝', '🐸', '🐼', '🦄', '🐲', '🦋', '🦀', '🦑'];
function getPlayerEmoji(name) {
    let hash = 0;
    for (const ch of (name || '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xFFFFFF;
    return emojiPool[Math.abs(hash) % emojiPool.length];
}

// ── Background Beans ──────────────────────────────────────────
function initBackgroundBeans() {
    const container = $('bg-beans-container');
    if (!container) return;

    const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];

    function spawnBean() {
        const bean = document.createElement('div');
        const isRight = Math.random() > 0.5;
        bean.className = `bg-bean ${isRight ? 'run-right' : 'run-left'}`;

        const color = colors[Math.floor(Math.random() * colors.length)];
        const top = Math.random() * 90; // 0-90% height
        const duration = 10 + Math.random() * 15; // 10-25s

        bean.style.top = `${top}%`;
        bean.style.animationDuration = `${duration}s`;

        bean.innerHTML = `
            <div class="bean-container" style="--bean-color: ${color};">
                <div class="bean-backpack"></div>
                <div class="bean-body"></div>
                <div class="bean-visor"></div>
                <div class="bean-nose"></div>
                <div class="bean-leg-l"></div>
                <div class="bean-leg-r"></div>
            </div>
        `;

        container.appendChild(bean);

        // Remove after animation
        setTimeout(() => bean.remove(), duration * 1000);
    }

    // Initial burst
    for (let i = 0; i < 8; i++) setTimeout(spawnBean, Math.random() * 5000);

    // Continuous spawning
    setInterval(spawnBean, 3000);
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTitleScreen();
    initLobbyScreen();
    initRoleScreen();
    initRoundScreen();
    initBackgroundBeans();
    showScreen('title');
});
