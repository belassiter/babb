import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    getCutoffDate,
    parseTimestamp,
    formatDate,
    filterLedgerByDate,
    aggregatePlaysBySong,
    computeSongMetrics,
    computeArrangerMetrics,
    computeComposerMetrics,
    computeFeatureMetrics,
    computeHistogram,
    computeTimeline,
    computeKpis,
    normalizeNames
} from '../history-calc.js';

describe('BABB History Calculator', () => {
    const fixedNow = new Date('2026-10-29T12:00:00Z');

    describe('getCutoffDate', () => {
        test('returns null for "all" or undefined', () => {
            assert.equal(getCutoffDate('all', fixedNow), null);
            assert.equal(getCutoffDate(null, fixedNow), null);
        });

        test('returns 3 months prior for "3months"', () => {
            const cutoff = getCutoffDate('3months', fixedNow);
            assert.ok(cutoff instanceof Date);
            assert.equal(cutoff.getUTCFullYear(), 2026);
            assert.equal(cutoff.getUTCMonth(), 6); // October (9) - 3 = July (6)
        });

        test('returns 6 months prior for "6months"', () => {
            const cutoff = getCutoffDate('6months', fixedNow);
            assert.ok(cutoff instanceof Date);
            assert.equal(cutoff.getUTCFullYear(), 2026);
            assert.equal(cutoff.getUTCMonth(), 3); // October (9) - 6 = April (3)
        });

        test('returns 1 year prior for "1year"', () => {
            const cutoff = getCutoffDate('1year', fixedNow);
            assert.ok(cutoff instanceof Date);
            assert.equal(cutoff.getUTCFullYear(), 2025);
            assert.equal(cutoff.getUTCMonth(), 9); // October
        });

        test('returns 3 years prior for "3years"', () => {
            const cutoff = getCutoffDate('3years', fixedNow);
            assert.ok(cutoff instanceof Date);
            assert.equal(cutoff.getUTCFullYear(), 2023);
        });
    });

    describe('parseTimestamp & formatDate', () => {
        test('handles Firestore Timestamp objects with toDate()', () => {
            const mockDate = new Date('2025-05-15T10:00:00Z');
            const fsTimestamp = { toDate: () => mockDate };
            assert.equal(parseTimestamp(fsTimestamp)?.getTime(), mockDate.getTime());
        });

        test('handles seconds & nanoseconds objects', () => {
            const ts = { seconds: 1700000000, nanoseconds: 500000000 };
            const parsed = parseTimestamp(ts);
            assert.equal(parsed?.getTime(), 1700000000500);
        });

        test('handles ISO string and Date objects', () => {
            const iso = '2025-01-01T00:00:00Z';
            assert.equal(parseTimestamp(iso)?.toISOString(), '2025-01-01T00:00:00.000Z');
            const d = new Date(iso);
            assert.equal(parseTimestamp(d)?.getTime(), d.getTime());
        });

        test('returns null on invalid input', () => {
            assert.equal(parseTimestamp(null), null);
            assert.equal(parseTimestamp('invalid-date'), null);
        });

        test('formatDate formats YYYY-MM-DD correctly', () => {
            const d = new Date(2025, 4, 9); // May 9 2025
            assert.equal(formatDate(d), '2025-05-09');
            assert.equal(formatDate(null), '');
        });
    });

    describe('normalizeNames', () => {
        test('handles empty, ?, and dash', () => {
            assert.deepEqual(normalizeNames(''), []);
            assert.deepEqual(normalizeNames('?'), []);
            assert.deepEqual(normalizeNames(' - '), []);
        });

        test('returns trimmed name when splitSlash is false', () => {
            assert.deepEqual(normalizeNames('  Sammy Nestico  ', false), ['Sammy Nestico']);
            assert.deepEqual(normalizeNames('Ray Henderson/Mort Dixon', false), ['Ray Henderson/Mort Dixon']);
        });

        test('splits slashes when splitSlash is true', () => {
            assert.deepEqual(normalizeNames('Ray Henderson/Mort Dixon', true), ['Ray Henderson', 'Mort Dixon']);
            assert.deepEqual(normalizeNames('Duke Ellington', true), ['Duke Ellington']);
        });
    });

    describe('filterLedgerByDate & aggregatePlaysBySong', () => {
        const mockLedger = [
            { songId: 'song-1', timestamp: new Date(2026, 7, 1, 12) },
            { songId: 'song-1', timestamp: new Date(2026, 8, 15, 12) },
            { songId: 'song-2', timestamp: new Date(2025, 10, 20, 12) },
            { songId: 'song-3', timestamp: new Date(2024, 4, 10, 12) },
            { songId: 'song-1', timestamp: new Date(2023, 0, 1, 12) }
        ];

        test('filters ledger entries by cutoff date', () => {
            const oneYearCutoff = new Date(2025, 9, 29, 12);
            const filtered = filterLedgerByDate(mockLedger, oneYearCutoff);
            assert.equal(filtered.length, 3);
            assert.ok(filtered.every(e => e.date >= oneYearCutoff));
        });

        test('returns all valid entries when cutoff is null (all-time)', () => {
            const filtered = filterLedgerByDate(mockLedger, null);
            assert.equal(filtered.length, 5);
        });

        test('aggregates play counts and latest date per song', () => {
            const oneYearCutoff = new Date(2025, 9, 29, 12);
            const filtered = filterLedgerByDate(mockLedger, oneYearCutoff);
            const playMap = aggregatePlaysBySong(filtered);

            assert.equal(playMap.get('song-1')?.count, 2);
            assert.equal(playMap.get('song-2')?.count, 1);
            assert.equal(playMap.get('song-3'), undefined);
            assert.equal(formatDate(playMap.get('song-1')?.lastDate), '2026-09-15');
        });
    });

    describe('computeSongMetrics & Ranking', () => {
        const mockSongs = [
            { id: 'song-1', Number: '1', Title: 'A Time for Love', Arranger: 'Sammy Nestico', Composer: 'Johnny Mandel', Feature: 'Trombone' },
            { id: 'song-2', Number: '2', Title: 'Bye Bye Blackbird', Arranger: 'Dave Wolpe', Composer: 'Ray Henderson/Mort Dixon', Feature: '' },
            { id: 'song-3', Number: '3', Title: 'Sophisticated Lady', Arranger: 'Dave Wolpe', Composer: 'Duke Ellington', Feature: 'Alto Sax' },
            { id: 'song-4', Number: '4', Title: 'God Bless the Child', Arranger: 'Sammy Nestico', Composer: 'Billie Holiday', Feature: '' }
        ];

        const mockPlayMap = new Map([
            ['song-1', { count: 5, lastDate: new Date('2026-09-15') }],
            ['song-2', { count: 8, lastDate: new Date('2026-10-01') }],
            ['song-3', { count: 5, lastDate: new Date('2026-08-10') }]
            // song-4 has 0 plays
        ]);

        test('computes rank, plays, and orders by plays descending', () => {
            const metrics = computeSongMetrics(mockSongs, mockPlayMap);

            assert.equal(metrics.length, 4);
            // First should be song-2 (8 plays)
            assert.equal(metrics[0].id, 'song-2');
            assert.equal(metrics[0].plays, 8);
            assert.equal(metrics[0].rank, 1);

            // song-1 and song-3 tied with 5 plays; Number 1 comes before Number 3
            assert.equal(metrics[1].id, 'song-1');
            assert.equal(metrics[1].plays, 5);
            assert.equal(metrics[1].rank, 2);

            assert.equal(metrics[2].id, 'song-3');
            assert.equal(metrics[2].plays, 5);
            assert.equal(metrics[2].rank, 3);

            // song-4 has 0 plays
            assert.equal(metrics[3].id, 'song-4');
            assert.equal(metrics[3].plays, 0);
            assert.equal(metrics[3].rank, 4);
        });

        test('computes arranger aggregations', () => {
            const songMetrics = computeSongMetrics(mockSongs, mockPlayMap);
            const arrangerMetrics = computeArrangerMetrics(songMetrics);

            // Dave Wolpe: song-2 (8) + song-3 (5) = 13 plays across 2 charts
            // Sammy Nestico: song-1 (5) + song-4 (0) = 5 plays across 2 charts
            assert.equal(arrangerMetrics.length, 2);
            assert.equal(arrangerMetrics[0].name, 'Dave Wolpe');
            assert.equal(arrangerMetrics[0].plays, 13);
            assert.equal(arrangerMetrics[0].chartCount, 2);
            assert.equal(arrangerMetrics[0].topChartTitle, 'Bye Bye Blackbird');
            assert.equal(arrangerMetrics[0].topChartDisplay, '#2 Bye Bye Blackbird (8)');
            assert.equal(arrangerMetrics[0].rank, 1);

            assert.equal(arrangerMetrics[1].name, 'Sammy Nestico');
            assert.equal(arrangerMetrics[1].plays, 5);
            assert.equal(arrangerMetrics[1].chartCount, 2);
            assert.equal(arrangerMetrics[1].topChartTitle, 'A Time for Love');
            assert.equal(arrangerMetrics[1].topChartDisplay, '#1 A Time for Love (5)');
            assert.equal(arrangerMetrics[1].rank, 2);
        });

        test('computes composer aggregations with split co-composers', () => {
            const songMetrics = computeSongMetrics(mockSongs, mockPlayMap);
            const composerMetrics = computeComposerMetrics(songMetrics);

            // Ray Henderson & Mort Dixon each get credited for song-2 (8 plays)
            const henderson = composerMetrics.find(c => c.name === 'Ray Henderson');
            const dixon = composerMetrics.find(c => c.name === 'Mort Dixon');
            const ellington = composerMetrics.find(c => c.name === 'Duke Ellington');

            assert.ok(henderson);
            assert.equal(henderson.plays, 8);
            assert.ok(dixon);
            assert.equal(dixon.plays, 8);
            assert.ok(ellington);
            assert.equal(ellington.plays, 5);
        });

        test('computes feature metrics and excludes empty features', () => {
            const songMetrics = computeSongMetrics(mockSongs, mockPlayMap);
            const featureMetrics = computeFeatureMetrics(songMetrics);

            // Features: Trombone (song-1: 5 plays), Alto Sax (song-3: 5 plays)
            assert.equal(featureMetrics.length, 2);
            const names = featureMetrics.map(f => f.name);
            assert.ok(names.includes('Trombone'));
            assert.ok(names.includes('Alto Sax'));
            assert.ok(!names.includes(''));
        });

        test('computes histogram buckets correctly', () => {
            const songMetrics = computeSongMetrics(mockSongs, mockPlayMap);
            const histogram = computeHistogram(songMetrics);

            // 0 plays: song-4 (1)
            // 1 play: 0
            // 2 plays: 0
            // 3-4 plays: 0
            // 5-6 plays: song-1, song-3 (2)
            // 7+ plays: song-2 (1)
            assert.deepEqual(histogram.labels, ['0 plays', '1 play', '2 plays', '3-4 plays', '5-6 plays', '7+ plays']);
            assert.deepEqual(histogram.counts, [1, 0, 0, 0, 2, 1]);

            // Total count should equal total songs
            const total = histogram.counts.reduce((sum, n) => sum + n, 0);
            assert.equal(total, 4);
        });

        test('computes timeline grouped by rehearsal date', () => {
            const ledger = [
                { date: new Date('2026-10-01T19:00:00Z') },
                { date: new Date('2026-10-01T20:30:00Z') },
                { date: new Date('2026-10-08T19:00:00Z') }
            ];
            const timeline = computeTimeline(ledger);
            assert.equal(timeline.labels.length, 2);
            assert.equal(timeline.counts[0], 2); // 2 plays on first date
            assert.equal(timeline.counts[1], 1); // 1 play on second date
        });

        test('computes high-level KPI cards', () => {
            const songMetrics = computeSongMetrics(mockSongs, mockPlayMap);
            const arrangerMetrics = computeArrangerMetrics(songMetrics);
            const composerMetrics = computeComposerMetrics(songMetrics);
            const filteredLedger = [
                { date: new Date('2026-10-01') },
                { date: new Date('2026-10-01') },
                { date: new Date('2026-10-08') }
            ];

            const kpis = computeKpis(mockSongs, filteredLedger, songMetrics, arrangerMetrics, composerMetrics);
            assert.equal(kpis.totalPlays, 3);
            assert.equal(kpis.totalRehearsals, 2);
            assert.equal(kpis.totalSongs, 4);
            assert.equal(kpis.activeSongsCount, 3); // songs 1, 2, 3
            assert.equal(kpis.utilizationPct, 75); // 3 of 4 = 75%
            assert.equal(kpis.topSong?.title, 'Bye Bye Blackbird');
            assert.equal(kpis.topArranger?.name, 'Dave Wolpe');
        });
    });
});
