import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    formatLastPlayed,
    getLocalDateString,
    coercePlays,
    incrementPlays,
    isWithinHours,
    matchesSearchFilter,
    sortLedgerPlaysDescending,
    formatHistoryPlayDate,
    isAuthorizedAdmin
} from '../repertoire-calc.js';

describe('BABB Repertoire & Admin Calculator', () => {

    describe('formatLastPlayed', () => {
        test('formats valid YYYY-MM-DD date to localized string', () => {
            const formatted = formatLastPlayed('2025-10-15', 'en-US');
            assert.equal(formatted, 'October 15, 2025');
        });

        test('returns empty string for null, undefined, or empty string', () => {
            assert.equal(formatLastPlayed(null), '');
            assert.equal(formatLastPlayed(undefined), '');
            assert.equal(formatLastPlayed(''), '');
            assert.equal(formatLastPlayed('   '), '');
        });

        test('returns raw string if not in YYYY-MM-DD 3-part format', () => {
            assert.equal(formatLastPlayed('2025'), '2025');
            assert.equal(formatLastPlayed('Spring Concert'), 'Spring Concert');
            assert.equal(formatLastPlayed('10/15/2025'), '10/15/2025');
        });

        test('returns raw string if parts are not valid numbers', () => {
            assert.equal(formatLastPlayed('YYYY-MM-DD'), 'YYYY-MM-DD');
            assert.equal(formatLastPlayed('2025-XX-15'), '2025-XX-15');
        });
    });

    describe('getLocalDateString', () => {
        test('formats given Date to YYYY-MM-DD with zero-padding', () => {
            const date = new Date(2026, 4, 9); // May 9, 2026 (month is 0-indexed)
            assert.equal(getLocalDateString(date), '2026-05-09');
        });

        test('formats end of year date correctly', () => {
            const date = new Date(2025, 11, 31); // Dec 31, 2025
            assert.equal(getLocalDateString(date), '2025-12-31');
        });

        test('defaults to today when no date or invalid date passed', () => {
            const str = getLocalDateString(null);
            assert.match(str, /^\d{4}-\d{2}-\d{2}$/);
            const strInvalid = getLocalDateString(new Date('invalid'));
            assert.match(strInvalid, /^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('coercePlays & incrementPlays', () => {
        test('coerces valid numbers and numeric strings', () => {
            assert.equal(coercePlays(0), 0);
            assert.equal(coercePlays(5), 5);
            assert.equal(coercePlays('12'), 12);
            assert.equal(coercePlays(' 7 '), 7);
        });

        test('handles messy or missing real-world data gracefully', () => {
            assert.equal(coercePlays(null), 0);
            assert.equal(coercePlays(undefined), 0);
            assert.equal(coercePlays(''), 0);
            assert.equal(coercePlays('?'), 0);
            assert.equal(coercePlays('-'), 0);
            assert.equal(coercePlays(-3), 0);
            assert.equal(coercePlays(NaN), 0);
            assert.equal(coercePlays(3.7), 3); // floors floats
        });

        test('incrementPlays increments safely', () => {
            assert.equal(incrementPlays(0), 1);
            assert.equal(incrementPlays(4), 5);
            assert.equal(incrementPlays('9'), 10);
            assert.equal(incrementPlays(null), 1);
            assert.equal(incrementPlays('?'), 1);
        });
    });

    describe('isWithinHours', () => {
        const refDate = new Date('2026-10-30T12:00:00Z');

        test('returns true for timestamp within window', () => {
            const playTime = new Date('2026-10-30T02:00:00Z'); // 10 hours ago
            assert.equal(isWithinHours(playTime, 24, refDate), true);
        });

        test('returns false for timestamp outside window', () => {
            const oldPlayTime = new Date('2026-10-29T10:00:00Z'); // 26 hours ago
            assert.equal(isWithinHours(oldPlayTime, 24, refDate), false);
        });

        test('handles Firestore timestamp mock ({ toDate() })', () => {
            const fsTimestamp = { toDate: () => new Date('2026-10-30T10:00:00Z') }; // 2 hours ago
            assert.equal(isWithinHours(fsTimestamp, 24, refDate), true);
        });

        test('handles seconds timestamp object', () => {
            const secTimestamp = { seconds: Math.floor(refDate.getTime() / 1000) - 3600 }; // 1 hour ago
            assert.equal(isWithinHours(secTimestamp, 24, refDate), true);
        });

        test('returns false for null, invalid or future timestamps beyond tolerance', () => {
            assert.equal(isWithinHours(null, 24, refDate), false);
            assert.equal(isWithinHours('invalid', 24, refDate), false);
            assert.equal(isWithinHours(new Date('2026-11-05T12:00:00Z'), 24, refDate), false);
        });
    });

    describe('matchesSearchFilter', () => {
        const sampleSong = {
            id: 'doc123',
            Number: '42',
            Title: 'Birdland',
            Composer: 'Joe Zawinul',
            Arranger: 'Bob Lowden',
            Feature: 'Tenor Sax',
            plays: 6
        };

        test('returns true when filter matches title (case-insensitive)', () => {
            assert.equal(matchesSearchFilter(sampleSong, 'bird'), true);
            assert.equal(matchesSearchFilter(sampleSong, 'BIRDLAND'), true);
        });

        test('returns true when filter matches song number or composer', () => {
            assert.equal(matchesSearchFilter(sampleSong, '42'), true);
            assert.equal(matchesSearchFilter(sampleSong, 'zawinul'), true);
        });

        test('returns false when no field matches', () => {
            assert.equal(matchesSearchFilter(sampleSong, 'Ellington'), false);
        });

        test('returns true for empty or null filter string', () => {
            assert.equal(matchesSearchFilter(sampleSong, ''), true);
            assert.equal(matchesSearchFilter(sampleSong, null), true);
            assert.equal(matchesSearchFilter(sampleSong, '   '), true);
        });

        test('handles messy data with null, undefined, and non-string fields', () => {
            const messySong = {
                Number: null,
                Title: undefined,
                Composer: 'Count Basie',
                plays: 0,
                extraObj: { nested: 'value' }
            };
            assert.equal(matchesSearchFilter(messySong, 'Basie'), true);
            assert.equal(matchesSearchFilter(messySong, '0'), true);
            assert.equal(matchesSearchFilter(messySong, 'nonexistent'), false);
            assert.equal(matchesSearchFilter(null, 'test'), false);
        });
    });

    describe('sortLedgerPlaysDescending & formatHistoryPlayDate', () => {
        test('sorts plays descending by timestamp', () => {
            const plays = [
                { id: '1', timestamp: new Date('2025-01-01T12:00:00Z') },
                { id: '2', timestamp: new Date('2026-06-01T12:00:00Z') },
                { id: '3', timestamp: new Date('2025-08-01T12:00:00Z') }
            ];
            const sorted = sortLedgerPlaysDescending(plays);
            assert.equal(sorted[0].id, '2');
            assert.equal(sorted[1].id, '3');
            assert.equal(sorted[2].id, '1');
            // Ensure immutability
            assert.equal(plays[0].id, '1');
        });

        test('handles Firestore Timestamp objects with toMillis() or toDate()', () => {
            const plays = [
                { id: 'older', timestamp: { toMillis: () => 1000 } },
                { id: 'newer', timestamp: { toMillis: () => 2000 } },
                { id: 'missing', timestamp: null }
            ];
            const sorted = sortLedgerPlaysDescending(plays);
            assert.equal(sorted[0].id, 'newer');
            assert.equal(sorted[1].id, 'older');
            assert.equal(sorted[2].id, 'missing');
        });

        test('formatHistoryPlayDate formats date to M/D/YYYY', () => {
            const d = new Date(2026, 9, 30); // Oct 30, 2026
            assert.equal(formatHistoryPlayDate(d), '10/30/2026');
            assert.equal(formatHistoryPlayDate({ toDate: () => d }), '10/30/2026');
        });

        test('formatHistoryPlayDate handles null or invalid input', () => {
            assert.equal(formatHistoryPlayDate(null), 'Unknown Date');
            assert.equal(formatHistoryPlayDate('not-a-date'), 'Unknown Date');
        });
    });

    describe('isAuthorizedAdmin', () => {
        const adminList = ['belassiter@gmail.com', 'brian@belassiter.com'];

        test('authorizes exact match', () => {
            assert.equal(isAuthorizedAdmin('belassiter@gmail.com', adminList), true);
            assert.equal(isAuthorizedAdmin('brian@belassiter.com', adminList), true);
        });

        test('authorizes case-insensitively and with whitespace', () => {
            assert.equal(isAuthorizedAdmin('Belassiter@gmail.com', adminList), true);
            assert.equal(isAuthorizedAdmin('  BRIAN@belassiter.com  ', adminList), true);
        });

        test('rejects unauthorized emails or empty input', () => {
            assert.equal(isAuthorizedAdmin('intruder@gmail.com', adminList), false);
            assert.equal(isAuthorizedAdmin('', adminList), false);
            assert.equal(isAuthorizedAdmin(null, adminList), false);
            assert.equal(isAuthorizedAdmin(undefined, adminList), false);
            assert.equal(isAuthorizedAdmin('belassiter@gmail.com', []), false);
        });
    });
});
