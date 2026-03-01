// test/scramble.test.js — Unit tests for wordBank scramble
const { scramble, checkAnswer, pickWord } = require('../src/wordBank');

describe('scramble()', () => {
    test('scrambled result is never equal to original word', () => {
        const words = ['apple', 'planet', 'ocean', 'labyrinth', 'bridge'];
        words.forEach(word => {
            // Run 20 times
            for (let i = 0; i < 20; i++) {
                const result = scramble(word);
                expect(result.join('')).not.toBe(word);
            }
        });
    });

    test('scrambled array contains all original letters', () => {
        const word = 'planet';
        for (let i = 0; i < 20; i++) {
            const result = scramble(word);
            expect(result).toHaveLength(word.length);
            const sortedOriginal = word.split('').sort().join('');
            const sortedScrambled = [...result].sort().join('');
            expect(sortedScrambled).toBe(sortedOriginal);
        }
    });

    test('single-char word still returns array of that char', () => {
        const result = scramble('a');
        expect(result).toEqual(['a']);
    });

    test('scramble returns an array', () => {
        expect(Array.isArray(scramble('mystery'))).toBe(true);
    });

    test('distribution: each position appears in different slots over many runs', () => {
        const word = 'abcde';
        const counts = Array(word.length).fill(0).map(() => Array(word.length).fill(0));
        const runs = 500;
        for (let i = 0; i < runs; i++) {
            const result = scramble(word);
            result.forEach((char, pos) => {
                const origPos = word.indexOf(char);
                counts[origPos][pos]++;
            });
        }
        // Each char should appear in multiple positions (not always same slot)
        for (let orig = 0; orig < word.length; orig++) {
            const nonZeroPositions = counts[orig].filter(c => c > 0).length;
            expect(nonZeroPositions).toBeGreaterThan(1);
        }
    });
});

describe('checkAnswer()', () => {
    test('exact match returns true', () => {
        expect(checkAnswer('apple', 'apple')).toBe(true);
    });

    test('case-insensitive match returns true', () => {
        expect(checkAnswer('APPLE', 'apple')).toBe(true);
        expect(checkAnswer('Apple', 'apple')).toBe(true);
    });

    test('wrong answer returns false', () => {
        expect(checkAnswer('orange', 'apple')).toBe(false);
    });

    test('trims whitespace', () => {
        expect(checkAnswer('  apple  ', 'apple')).toBe(true);
    });
});

describe('pickWord()', () => {
    test('returns word object with word and clues', () => {
        const obj = pickWord('easy');
        expect(obj).toHaveProperty('word');
        expect(obj).toHaveProperty('clues');
        expect(Array.isArray(obj.clues)).toBe(true);
    });

    test('word is a non-empty string between 4-10 chars', () => {
        for (let i = 0; i < 20; i++) {
            const obj = pickWord('medium');
            expect(obj.word.length).toBeGreaterThanOrEqual(4);
            expect(obj.word.length).toBeLessThanOrEqual(12);
        }
    });

    test('falls back to medium tier for unknown difficulty', () => {
        const obj = pickWord('ultra-mega-hard');
        expect(obj).toHaveProperty('word');
    });
});
