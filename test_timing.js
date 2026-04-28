const { io } = require('socket.io-client');
const assert = require('assert');

const URL = 'http://localhost:3000';

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    const clients = [];
    for (let i = 0; i < 4; i++) {
        const socket = io(URL);
        clients.push(socket);
    }

    const host = clients[0];
    
    // Wait for connects
    await wait(500);

    // Join
    let roomCode = null;
    let pidx = 1;

    // Host joins first to create room
    host.emit('join', { playerName: 'Player 1', roomCode: null, sessionToken: null });
    const hostJoin = await new Promise(r => host.once('joined', r));
    roomCode = hostJoin.roomCode;
    console.log('Room Code created:', roomCode);

    for (const c of clients) {
        if (c === host) {
            c.emit('setReady', { ready: true });
            continue;
        }
        c.emit('join', { playerName: 'Player ' + ++pidx, roomCode, sessionToken: null });
        let pReady = new Promise(r => c.once('joined', r));
        await pReady;
        c.emit('setReady', { ready: true });
    }

    await wait(200);

    host.emit('startGame');

    // Wait for roleAssign
    const roles = [];
    for (const c of clients) {
        roles.push(new Promise(r => {
            c.once('roleAssign', (data) => {
                r({ socket: c, roleData: data });
            });
        }));
    }

    const assigned = await Promise.all(roles);
    console.log('Roles assigned:', assigned.map(a => a.roleData.role));

    // Measure time it takes to be 'playerReady'
    const start = Date.now();
    for (const a of assigned) {
        if (a.roleData.role === 'guest') {
            a.socket.emit('submitAnswer', { answer: a.roleData.privatePayload.word });
        } else {
            a.socket.emit('submitAnswer', {});
        }
    }

    const readys = [];
    for (const a of assigned) {
        readys.push(new Promise(r => {
            a.socket.once('playerReady', r);
        }));
    }

    await Promise.all(readys);
    console.log(`All players ready in ${Date.now() - start}ms`);

    const callStart = Date.now();
    let meetingTriggered = false;
    host.once('meetingStarted', () => { meetingTriggered = true; });

    host.emit('callMeeting');
    
    await wait(500);
    if (meetingTriggered) {
        console.log(`Meeting started successfully in ${Date.now() - callStart}ms!`);
    } else {
        console.log(`Meeting NOT started! Did it crash or get ignored?`);
    }

    process.exit(0);
})();
