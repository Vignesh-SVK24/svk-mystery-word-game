// test/vote.test.js — Unit tests for VoteManager
const VoteManager = require('../src/voteManager');

describe('VoteManager', () => {
    let vm;
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

    beforeEach(() => { vm = new VoteManager(); });

    test('callVote succeeds with valid caller and accused', () => {
        const r = vm.callVote('p1', 'p2');
        expect(r.ok).toBe(true);
        expect(vm.active).toBe(true);
    });

    test('callVote fails if a vote is already active', () => {
        vm.callVote('p1', 'p2');
        const r = vm.callVote('p3', 'p4');
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/already/i);
    });

    test('cannot vote against yourself', () => {
        const r = vm.callVote('p1', 'p1');
        expect(r.ok).toBe(false);
    });

    test('castVote records yes vote', () => {
        vm.callVote('p1', 'p3');
        const r = vm.castVote('p1', 'yes');
        expect(r.ok).toBe(true);
        expect(r.votes['p1']).toBe('yes');
    });

    test('castVote prevents double voting', () => {
        vm.callVote('p1', 'p3');
        vm.castVote('p1', 'yes');
        const r = vm.castVote('p1', 'no');
        expect(r.ok).toBe(false);
    });

    test('majority YES (3 of 5) triggers kick', () => {
        vm.callVote('p1', 'p2');
        vm.castVote('p1', 'yes');
        vm.castVote('p3', 'yes');
        vm.castVote('p4', 'yes');
        const result = vm.checkMajority(players);
        expect(result.decided).toBe(true);
        expect(result.kick).toBe(true);
        expect(result.yes).toBe(3);
    });

    test('majority NO (3 of 5) prevents kick', () => {
        vm.callVote('p1', 'p2');
        vm.castVote('p1', 'no');
        vm.castVote('p3', 'no');
        vm.castVote('p4', 'no');
        const result = vm.checkMajority(players);
        expect(result.decided).toBe(true);
        expect(result.kick).toBe(false);
    });

    test('tie (2 yes, 2 no, 1 absent) is NOT decided yet', () => {
        vm.callVote('p1', 'p2');
        vm.castVote('p1', 'yes');
        vm.castVote('p3', 'yes');
        vm.castVote('p4', 'no');
        vm.castVote('p5', 'no');
        // p2 hasn't voted
        const result = vm.checkMajority(players);
        expect(result.decided).toBe(false);
    });

    test('all vote tie (2 vs 2 on 4 players) — no_kick behavior', () => {
        const fourPlayers = ['p1', 'p2', 'p3', 'p4'];
        vm.callVote('p1', 'p2');
        vm.castVote('p1', 'yes');
        vm.castVote('p3', 'yes');
        vm.castVote('p2', 'no');
        vm.castVote('p4', 'no');
        const result = vm.checkMajority(fourPlayers, 'no_kick');
        expect(result.decided).toBe(true);
        expect(result.kick).toBe(false);
        expect(result.tie).toBe(true);
    });

    test('all vote tie (2 vs 2 on 4 players) — caller_wins behavior', () => {
        const fourPlayers = ['p1', 'p2', 'p3', 'p4'];
        vm.callVote('p1', 'p2');
        vm.castVote('p1', 'yes');
        vm.castVote('p3', 'yes');
        vm.castVote('p2', 'no');
        vm.castVote('p4', 'no');
        const result = vm.checkMajority(fourPlayers, 'caller_wins');
        expect(result.decided).toBe(true);
        expect(result.kick).toBe(true);
    });

    test('detectiveKick returns immediate kick decision', () => {
        const r = vm.detectiveKick('p3');
        expect(r.decided).toBe(true);
        expect(r.kick).toBe(true);
        expect(r.byDetective).toBe(true);
    });

    test('reset clears all state', () => {
        vm.callVote('p1', 'p2');
        vm.castVote('p1', 'yes');
        vm.reset();
        expect(vm.active).toBe(false);
        expect(Object.keys(vm.votes)).toHaveLength(0);
    });
});
