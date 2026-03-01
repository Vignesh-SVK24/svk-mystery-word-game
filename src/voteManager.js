// src/voteManager.js — Vote tracking, majority checks, detective kick
'use strict';

/**
 * VoteManager manages a single active vote per game.
 * All methods receive the set of alive player ids to determine majority.
 */
class VoteManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.active = false;
        this.votes = {}; // { voterId: targetId }
        this.startTime = null;
    }

    /**
     * Start a voting session.
     */
    startVoting() {
        this.active = true;
        this.startTime = Date.now();
        return { ok: true };
    }

    /**
     * Record a vote from a player.
     */
    castVote(voterId, targetId) {
        if (!this.active) return { ok: false, reason: 'No active voting session.' };
        if (this.votes[voterId] !== undefined) return { ok: false, reason: 'You already voted.' };
        this.votes[voterId] = targetId;
        return { ok: true, votes: { ...this.votes } };
    }

    /**
     * Check if everyone has voted.
     */
    isVotingComplete(alivePlayerIds) {
        return alivePlayerIds.every(id => this.votes[id] !== undefined);
    }

    /**
     * Determine the results based on the highest vote count.
     */
    getResults(alivePlayerIds) {
        const tally = {};
        // Initialize tally for all alive players
        alivePlayerIds.forEach(id => tally[id] = 0);

        // Count votes
        Object.values(this.votes).forEach(targetId => {
            if (tally[targetId] !== undefined) {
                tally[targetId]++;
            }
        });

        // Find max votes
        let maxVotes = 0;
        let winners = [];

        for (const [id, count] of Object.entries(tally)) {
            if (count > maxVotes) {
                maxVotes = count;
                winners = [id];
            } else if (count === maxVotes && count > 0) {
                winners.push(id);
            }
        }

        // If no one voted or there's a tie, no one is kicked
        if (maxVotes === 0 || winners.length > 1) {
            return { kick: false, winners, tally, tie: winners.length > 1 };
        }

        return { kick: true, winnerId: winners[0], maxVotes, tally };
    }
}

module.exports = VoteManager;
