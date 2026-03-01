// test/roles.test.js — Unit tests for role assignment
// We test role assignment logic directly from gameManager internals.
const { GameManager } = require('../src/gameManager');

// Minimal mock for socket.io
function makeMockIo() {
    return {
        _events: {},
        emit: () => { },
        to: () => ({ emit: () => { } })
    };
}

function mockSocket(id) {
    return { id, emit: () => { } };
}

function populateGame(game, count) {
    for (let i = 0; i < count; i++) {
        const sock = mockSocket(`socket-${i}`);
        const token = `token-${i}`;
        game.addPlayer(sock, `Player${i}`, token);
    }
}

describe('Role Assignment', () => {
    test('exactly 1 Killer is always assigned', () => {
        for (let run = 0; run < 50; run++) {
            const game = new GameManager(makeMockIo());
            populateGame(game, 5);
            game.detectiveEnabled = true;
            game.assignRoles();
            const roles = [...game.players.values()].map(p => p.role);
            const killers = roles.filter(r => r === 'killer');
            expect(killers).toHaveLength(1);
        }
    });

    test('Detective is only assigned when enabled AND players >= 5', () => {
        // With 5 players and detective enabled
        const game = new GameManager(makeMockIo());
        populateGame(game, 5);
        game.detectiveEnabled = true;
        game.assignRoles();
        const detectives = [...game.players.values()].filter(p => p.role === 'detective');
        expect(detectives).toHaveLength(1);
    });

    test('Detective NOT assigned when players < 5 even if enabled', () => {
        const game = new GameManager(makeMockIo());
        populateGame(game, 4);
        game.detectiveEnabled = true;
        game.assignRoles();
        const detectives = [...game.players.values()].filter(p => p.role === 'detective');
        expect(detectives).toHaveLength(0);
    });

    test('Detective NOT assigned when not enabled (even with 6 players)', () => {
        const game = new GameManager(makeMockIo());
        populateGame(game, 6);
        game.detectiveEnabled = false;
        game.assignRoles();
        const detectives = [...game.players.values()].filter(p => p.role === 'detective');
        expect(detectives).toHaveLength(0);
    });

    test('all players receive a role', () => {
        const game = new GameManager(makeMockIo());
        populateGame(game, 7);
        game.detectiveEnabled = true;
        game.assignRoles();
        const roles = [...game.players.values()].map(p => p.role);
        roles.forEach(r => expect(['killer', 'detective', 'guest']).toContain(r));
    });

    test('Killer is distributed fairly across players (200 runs)', () => {
        const PLAYERS = 5;
        const RUNS = 200;
        const killerCount = {};
        for (let run = 0; run < RUNS; run++) {
            const game = new GameManager(makeMockIo());
            populateGame(game, PLAYERS);
            game.detectiveEnabled = true;
            game.assignRoles();
            for (const p of game.players.values()) {
                if (p.role === 'killer') {
                    killerCount[p.name] = (killerCount[p.name] || 0) + 1;
                }
            }
        }
        // Each player should be killer in at least 10% of runs (ideal: 20% for 5 players)
        Object.values(killerCount).forEach(count => {
            expect(count).toBeGreaterThanOrEqual(10);
        });
    });

    test('game can start with 4 players, all ready', () => {
        const game = new GameManager(makeMockIo());
        populateGame(game, 4);
        [...game.players.values()].forEach(p => { p.ready = true; });
        expect(game.canStart()).toBe(true);
    });

    test('game cannot start with 3 players', () => {
        const game = new GameManager(makeMockIo());
        populateGame(game, 3);
        [...game.players.values()].forEach(p => { p.ready = true; });
        expect(game.canStart()).toBe(false);
    });

    test('game cannot start if anyone is not ready', () => {
        const game = new GameManager(makeMockIo());
        populateGame(game, 4);
        const players = [...game.players.values()];
        players[0].ready = true;
        players[1].ready = true;
        players[2].ready = true;
        players[3].ready = false; // not ready
        expect(game.canStart()).toBe(false);
    });
});
