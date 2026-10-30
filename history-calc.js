/**
 * history-calc.js
 * Pure data transformation and metrics calculation functions for BABB History.
 * Designed to be zero-dependency and testable in Node.js and browser ES modules.
 */

/**
 * Calculates the starting cutoff Date for a given time range key.
 * @param {'6months'|'1year'|'3years'|'all'} timeRangeKey
 * @param {Date} [referenceDate=new Date()]
 * @returns {Date|null}
 */
export function getCutoffDate(timeRangeKey, referenceDate = new Date()) {
    if (!timeRangeKey || timeRangeKey === 'all') {
        return null;
    }
    const d = new Date(referenceDate.getTime());
    if (timeRangeKey === '3months') {
        d.setMonth(d.getMonth() - 3);
        return d;
    }
    if (timeRangeKey === '6months') {
        d.setMonth(d.getMonth() - 6);
        return d;
    }
    if (timeRangeKey === '1year') {
        d.setFullYear(d.getFullYear() - 1);
        return d;
    }
    if (timeRangeKey === '3years') {
        d.setFullYear(d.getFullYear() - 3);
        return d;
    }
    return null;
}

/**
 * Safely parses various timestamp formats (Firestore Timestamp, ISO string, epoch ms, Date) to a Date.
 * @param {any} ts
 * @returns {Date|null}
 */
export function parseTimestamp(ts) {
    if (!ts) return null;
    if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
    if (typeof ts.toDate === 'function') {
        const d = ts.toDate();
        return isNaN(d.getTime()) ? null : d;
    }
    const sec = typeof ts.seconds === 'number' ? ts.seconds : (typeof ts._seconds === 'number' ? ts._seconds : null);
    const nano = typeof ts.nanoseconds === 'number' ? ts.nanoseconds : (typeof ts._nanoseconds === 'number' ? ts._nanoseconds : null);
    if (typeof sec === 'number') {
        return new Date(sec * 1000 + (nano ? Math.floor(nano / 1000000) : 0));
    }
    if (typeof ts === 'number' || typeof ts === 'string') {
        const d = new Date(ts);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/**
 * Format a Date to YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
    if (!date) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Filters ledger entries based on cutoff date.
 * @param {Array<{songId: string, timestamp: any}>} ledgerEntries
 * @param {Date|null} cutoffDate
 * @returns {Array<{songId: string, timestamp: any, date: Date}>}
 */
export function filterLedgerByDate(ledgerEntries, cutoffDate) {
    if (!Array.isArray(ledgerEntries)) return [];
    const results = [];
    for (const entry of ledgerEntries) {
        if (!entry || !entry.songId) continue;
        const date = parseTimestamp(entry.timestamp);
        if (!date) continue;
        if (!cutoffDate || date >= cutoffDate) {
            results.push({
                ...entry,
                date
            });
        }
    }
    return results;
}

/**
 * Aggregates play counts and latest date per song ID from filtered ledger entries.
 * @param {Array<{songId: string, date: Date}>} filteredLedger
 * @returns {Map<string, {count: number, lastDate: Date, dates: Date[]}>}
 */
export function aggregatePlaysBySong(filteredLedger) {
    const playMap = new Map();
    if (!Array.isArray(filteredLedger)) return playMap;

    for (const entry of filteredLedger) {
        const { songId, date } = entry;
        let stat = playMap.get(songId);
        if (!stat) {
            stat = { count: 0, lastDate: date, dates: [] };
            playMap.set(songId, stat);
        }
        stat.count += 1;
        stat.dates.push(date);
        if (date > stat.lastDate) {
            stat.lastDate = date;
        }
    }
    return playMap;
}

/**
 * Computes per-song metrics with rank.
 * @param {Array<object>} songs
 * @param {Map<string, {count: number, lastDate: Date}>} playMap
 * @returns {Array<object>}
 */
export function computeSongMetrics(songs, playMap) {
    if (!Array.isArray(songs)) return [];

    const enriched = songs.map(song => {
        const id = song.id || String(song.Number);
        const stat = playMap.get(id);
        const playsInPeriod = stat ? stat.count : 0;
        let lastPlayedStr = '';
        if (stat && stat.lastDate) {
            lastPlayedStr = formatDate(stat.lastDate);
        } else if (song.LastPlayed) {
            lastPlayedStr = String(song.LastPlayed);
        }

        return {
            id,
            Number: song.Number || '',
            Title: (song.Title || '').trim(),
            Composer: (song.Composer || '').trim(),
            Arranger: (song.Arranger || '').trim(),
            Feature: (song.Feature || '').trim(),
            Album: (song.Album || '').trim(),
            plays: playsInPeriod,
            allTimePlays: typeof song.plays === 'number' ? song.plays : playsInPeriod,
            lastPlayed: lastPlayedStr,
            audio: song.MP3 || song.Audio || '',
            pdf: song.PDF || ''
        };
    });

    // Sort by plays descending, then Number ascending (or Title)
    enriched.sort((a, b) => {
        if (b.plays !== a.plays) return b.plays - a.plays;
        const numA = parseInt(a.Number, 10);
        const numB = parseInt(b.Number, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.Title.localeCompare(b.Title);
    });

    // Assign 1-indexed rank
    return enriched.map((item, idx) => ({
        ...item,
        rank: idx + 1
    }));
}

/**
 * Helper to normalize and split names (e.g. composers separated by /)
 * @param {string} rawString
 * @param {boolean} splitSlash
 * @returns {string[]}
 */
export function normalizeNames(rawString, splitSlash = false) {
    if (!rawString) return [];
    const trimmed = String(rawString).trim();
    if (!trimmed || trimmed === '?' || trimmed === '-') return [];

    if (splitSlash && trimmed.includes('/')) {
        return trimmed.split('/')
            .map(s => s.trim())
            .filter(s => s.length > 0 && s !== '?' && s !== '-');
    }
    return [trimmed];
}

/**
 * Format the top chart display string including chart number
 * @param {object} item
 * @returns {string}
 */
export function formatTopChart(item) {
    if (!item || !item.topChartTitle) return '-';
    const prefix = item.topChartNumber ? `#${item.topChartNumber} ` : '';
    const playsSuffix = item.topChartPlays >= 0 ? ` (${item.topChartPlays})` : '';
    return `${prefix}${item.topChartTitle}${playsSuffix}`;
}

/**
 * Computes arranger metrics.
 * @param {Array<object>} songMetrics List of enriched songs with .plays
 * @returns {Array<object>}
 */
export function computeArrangerMetrics(songMetrics) {
    if (!Array.isArray(songMetrics)) return [];
    const map = new Map();

    for (const song of songMetrics) {
        const arrangers = normalizeNames(song.Arranger, false);
        const names = arrangers.length > 0 ? arrangers : ['(Unknown)'];

        for (const name of names) {
            let entry = map.get(name);
            if (!entry) {
                entry = {
                    name,
                    plays: 0,
                    chartCount: 0,
                    topChartNumber: '',
                    topChartTitle: '',
                    topChartPlays: -1
                };
                map.set(name, entry);
            }
            entry.chartCount += 1;
            entry.plays += song.plays;
            if (song.plays > entry.topChartPlays || (song.plays === entry.topChartPlays && !entry.topChartTitle)) {
                entry.topChartPlays = song.plays;
                entry.topChartTitle = song.Title;
                entry.topChartNumber = song.Number || '';
            }
        }
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
        if (b.plays !== a.plays) return b.plays - a.plays;
        if (b.chartCount !== a.chartCount) return b.chartCount - a.chartCount;
        return a.name.localeCompare(b.name);
    });

    return list.map((item, idx) => ({
        rank: idx + 1,
        ...item,
        topChartDisplay: formatTopChart(item)
    }));
}

/**
 * Computes composer metrics. Splits multiple co-composers separated by '/'.
 * @param {Array<object>} songMetrics List of enriched songs with .plays
 * @returns {Array<object>}
 */
export function computeComposerMetrics(songMetrics) {
    if (!Array.isArray(songMetrics)) return [];
    const map = new Map();

    for (const song of songMetrics) {
        const composers = normalizeNames(song.Composer, true);
        const names = composers.length > 0 ? composers : ['(Unknown)'];

        for (const name of names) {
            let entry = map.get(name);
            if (!entry) {
                entry = {
                    name,
                    plays: 0,
                    chartCount: 0,
                    topChartNumber: '',
                    topChartTitle: '',
                    topChartPlays: -1
                };
                map.set(name, entry);
            }
            entry.chartCount += 1;
            entry.plays += song.plays;
            if (song.plays > entry.topChartPlays || (song.plays === entry.topChartPlays && !entry.topChartTitle)) {
                entry.topChartPlays = song.plays;
                entry.topChartTitle = song.Title;
                entry.topChartNumber = song.Number || '';
            }
        }
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
        if (b.plays !== a.plays) return b.plays - a.plays;
        if (b.chartCount !== a.chartCount) return b.chartCount - a.chartCount;
        return a.name.localeCompare(b.name);
    });

    return list.map((item, idx) => ({
        rank: idx + 1,
        ...item,
        topChartDisplay: formatTopChart(item)
    }));
}

/**
 * Computes feature / soloist metrics.
 * @param {Array<object>} songMetrics
 * @returns {Array<object>}
 */
export function computeFeatureMetrics(songMetrics) {
    if (!Array.isArray(songMetrics)) return [];
    const map = new Map();

    for (const song of songMetrics) {
        const feature = (song.Feature || '').trim();
        if (!feature || feature === '?' || feature === '-') continue;

        let entry = map.get(feature);
        if (!entry) {
            entry = {
                name: feature,
                plays: 0,
                chartCount: 0,
                topChartNumber: '',
                topChartTitle: '',
                topChartPlays: -1
            };
            map.set(feature, entry);
        }
        entry.chartCount += 1;
        entry.plays += song.plays;
        if (song.plays > entry.topChartPlays || (song.plays === entry.topChartPlays && !entry.topChartTitle)) {
            entry.topChartPlays = song.plays;
            entry.topChartTitle = song.Title;
            entry.topChartNumber = song.Number || '';
        }
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
        if (b.plays !== a.plays) return b.plays - a.plays;
        if (b.chartCount !== a.chartCount) return b.chartCount - a.chartCount;
        return a.name.localeCompare(b.name);
    });

    return list.map((item, idx) => ({
        rank: idx + 1,
        ...item,
        topChartDisplay: formatTopChart(item)
    }));
}

/**
 * Computes histogram bins of play counts.
 * Bins: 0 plays, 1 play, 2 plays, 3-4 plays, 5-6 plays, 7+ plays.
 * @param {Array<object>} songMetrics
 * @returns {{labels: string[], counts: number[]}}
 */
export function computeHistogram(songMetrics) {
    const bins = [
        { label: '0 plays', count: 0, match: (p) => p === 0 },
        { label: '1 play', count: 0, match: (p) => p === 1 },
        { label: '2 plays', count: 0, match: (p) => p === 2 },
        { label: '3-4 plays', count: 0, match: (p) => p >= 3 && p <= 4 },
        { label: '5-6 plays', count: 0, match: (p) => p >= 5 && p <= 6 },
        { label: '7+ plays', count: 0, match: (p) => p >= 7 }
    ];

    if (Array.isArray(songMetrics)) {
        for (const song of songMetrics) {
            const p = song.plays || 0;
            const bin = bins.find(b => b.match(p));
            if (bin) bin.count += 1;
        }
    }

    return {
        labels: bins.map(b => b.label),
        counts: bins.map(b => b.count)
    };
}

/**
 * Computes plays timeline grouped by rehearsal date (YYYY-MM-DD).
 * @param {Array<{date: Date}>} filteredLedger
 * @returns {{labels: string[], counts: number[]}}
 */
export function computeTimeline(filteredLedger) {
    if (!Array.isArray(filteredLedger)) {
        return { labels: [], counts: [] };
    }

    const dateMap = new Map();
    for (const entry of filteredLedger) {
        if (!entry.date) continue;
        const key = formatDate(entry.date);
        dateMap.set(key, (dateMap.get(key) || 0) + 1);
    }

    const sortedDates = Array.from(dateMap.keys()).sort();
    return {
        labels: sortedDates,
        counts: sortedDates.map(d => dateMap.get(d))
    };
}

/**
 * Computes high-level KPI cards.
 * @param {Array<object>} songs
 * @param {Array<{date: Date}>} filteredLedger
 * @param {Array<object>} songMetrics
 * @param {Array<object>} arrangerMetrics
 * @param {Array<object>} composerMetrics
 * @returns {object}
 */
export function computeKpis(songs, filteredLedger, songMetrics, arrangerMetrics, composerMetrics) {
    const totalSongs = Array.isArray(songs) ? songs.length : 0;
    const totalPlays = Array.isArray(filteredLedger) ? filteredLedger.length : 0;

    const playedSongs = Array.isArray(songMetrics) ? songMetrics.filter(s => s.plays > 0) : [];
    const activeSongsCount = playedSongs.length;
    const utilizationPct = totalSongs > 0 ? Math.round((activeSongsCount / totalSongs) * 100) : 0;

    const distinctDates = new Set(filteredLedger.map(e => formatDate(e.date)).filter(Boolean));
    const totalRehearsals = distinctDates.size;

    const topSong = songMetrics && songMetrics.length > 0 && songMetrics[0].plays > 0 ? songMetrics[0] : null;
    const topArranger = arrangerMetrics && arrangerMetrics.length > 0 && arrangerMetrics[0].plays > 0 ? arrangerMetrics[0] : null;
    const topComposer = composerMetrics && composerMetrics.length > 0 && composerMetrics[0].plays > 0 ? composerMetrics[0] : null;

    return {
        totalPlays,
        totalRehearsals,
        activeSongsCount,
        totalSongs,
        utilizationPct,
        topSong: topSong ? { title: topSong.Title, plays: topSong.plays, number: topSong.Number } : null,
        topArranger: topArranger ? { name: topArranger.name, plays: topArranger.plays } : null,
        topComposer: topComposer ? { name: topComposer.name, plays: topComposer.plays } : null
    };
}
