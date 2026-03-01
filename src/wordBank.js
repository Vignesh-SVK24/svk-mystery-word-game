// src/wordBank.js — Word selection, scramble, clue generation, answer checking
const wordsData = require('../data/words.json');

/**
 * Pick a random word object {word, clues} from the given difficulty tier.
 */
function pickWord(difficulty = 'medium') {
    const pool = wordsData[difficulty] || wordsData['medium'];
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Fisher-Yates shuffle that guarantees the result !== original string.
 * Returns array of characters.
 */
function scramble(word) {
    const letters = word.split('');
    let shuffled;
    let attempts = 0;
    do {
        shuffled = [...letters];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        attempts++;
        // Safety: if word is 1 char or all same letters, break after 50 tries
        if (attempts > 50) break;
    } while (shuffled.join('') === word);
    return shuffled;
}

/**
 * Pick a clue from the word's clue list (random).
 */
function getClue(wordObj) {
    const clues = wordObj.clues;
    return clues[Math.floor(Math.random() * clues.length)];
}

/**
 * Case-insensitive exact match check.
 */
function checkAnswer(guess, word) {
    return guess.trim().toLowerCase() === word.toLowerCase();
}

module.exports = { pickWord, scramble, getClue, checkAnswer };
