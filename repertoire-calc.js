/**
 * repertoire-calc.js
 * Pure data transformation, formatting, and validation functions for BABB repertoire & admin.
 * Zero DOM or Firebase dependencies. Testable in Node.js and browser ES modules.
 */

/**
 * Formats a YYYY-MM-DD date string (e.g. from LastPlayed) into a localized, human-readable date.
 * Returns empty string for empty/null input, or the original string if not in YYYY-MM-DD format.
 * @param {string|null|undefined} dateStr
 * @param {string} [locale='en-US']
 * @returns {string}
 */
export function formatLastPlayed(dateStr, locale = 'en-US') {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const trimmed = dateStr.trim();
    if (!trimmed) return '';
    const parts = trimmed.split('-');
    if (parts.length !== 3) return trimmed;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return trimmed;
    const dt = new Date(y, m, d);
    if (Number.isNaN(dt.getTime())) return trimmed;
    return dt.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Builds a YYYY-MM-DD date string from a Date object (defaults to current date).
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getLocalDateString(date = new Date()) {
    const d = (date instanceof Date && !Number.isNaN(date.getTime())) ? date : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Safely coerces a plays count value into a non-negative integer.
 * Handles null, undefined, strings, negative numbers, floats, NaN.
 * @param {any} value
 * @returns {number}
 */
export function coercePlays(value) {
    if (value == null) return 0;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.floor(num);
}

/**
 * Returns the next play count after incrementing.
 * @param {any} currentPlays
 * @returns {number}
 */
export function incrementPlays(currentPlays) {
    return coercePlays(currentPlays) + 1;
}

/**
 * Checks whether a given timestamp is within a specified number of hours relative to referenceDate.
 * Handles Firestore Timestamp ({ toDate() or seconds }), Date, millis, and ISO strings.
 * @param {any} timestamp
 * @param {number} hours
 * @param {Date} [referenceDate=new Date()]
 * @returns {boolean}
 */
export function isWithinHours(timestamp, hours, referenceDate = new Date()) {
    if (!timestamp || typeof hours !== 'number' || hours <= 0) return false;
    let playDate = null;
    if (timestamp instanceof Date) {
        playDate = timestamp;
    } else if (typeof timestamp.toDate === 'function') {
        playDate = timestamp.toDate();
    } else if (typeof timestamp.seconds === 'number') {
        playDate = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
        const d = new Date(timestamp);
        if (!Number.isNaN(d.getTime())) playDate = d;
    }
    if (!playDate || Number.isNaN(playDate.getTime())) return false;

    const refTime = (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) 
        ? referenceDate.getTime() 
        : Date.now();
    const cutoffTime = refTime - hours * 60 * 60 * 1000;
    return playDate.getTime() > cutoffTime && playDate.getTime() <= refTime + 60000;
}

/**
 * Custom global filter predicate for table search (Tabulator).
 * Checks if any property value in data contains the filter value (case-insensitive).
 * Safely handles null, undefined, numbers, booleans, and objects.
 * @param {Object} data
 * @param {string|number|null|undefined} filterValue
 * @returns {boolean}
 */
export function matchesSearchFilter(data, filterValue) {
    if (filterValue == null || filterValue === '') return true;
    if (!data || typeof data !== 'object') return false;
    const searchStr = String(filterValue).trim().toLowerCase();
    if (!searchStr) return true;

    for (const key of Object.keys(data)) {
        const val = data[key];
        if (val == null) continue;
        if (typeof val === 'object' && !(val instanceof Date)) continue;
        if (String(val).toLowerCase().includes(searchStr)) {
            return true;
        }
    }
    return false;
}

/**
 * Sorts ledger play records descending by timestamp (most recent first).
 * Returns a new array, does not mutate input.
 * Handles Firestore Timestamps, Dates, ISO strings, missing/null timestamps gracefully.
 * @param {Array<Object>} plays
 * @returns {Array<Object>}
 */
export function sortLedgerPlaysDescending(plays) {
    if (!Array.isArray(plays)) return [];
    return [...plays].sort((a, b) => {
        const getMillis = (p) => {
            if (!p || !p.timestamp) return 0;
            const ts = p.timestamp;
            if (typeof ts.toMillis === 'function') return ts.toMillis();
            if (typeof ts.toDate === 'function') return ts.toDate().getTime();
            if (typeof ts.seconds === 'number') return ts.seconds * 1000;
            if (ts instanceof Date) return ts.getTime();
            const d = new Date(ts);
            return Number.isNaN(d.getTime()) ? 0 : d.getTime();
        };
        return getMillis(b) - getMillis(a);
    });
}

/**
 * Formats a ledger play timestamp into M/D/YYYY for the play history list modal.
 * @param {any} timestamp
 * @returns {string}
 */
export function formatHistoryPlayDate(timestamp) {
    if (!timestamp) return 'Unknown Date';
    let date = null;
    if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else if (typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
        const d = new Date(timestamp);
        if (!Number.isNaN(d.getTime())) date = d;
    }
    if (!date || Number.isNaN(date.getTime())) return 'Unknown Date';

    const m = date.getMonth() + 1;
    const d = date.getDate();
    const y = date.getFullYear();
    return `${m}/${d}/${y}`;
}

/**
 * Checks if an email is in an authorized admin list.
 * Performs case-insensitive matching and whitespace trimming.
 * @param {string|null|undefined} email
 * @param {Array<string>} [authorizedList=[]]
 * @returns {boolean}
 */
export function isAuthorizedAdmin(email, authorizedList = []) {
    if (!email || typeof email !== 'string' || !Array.isArray(authorizedList)) return false;
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    return authorizedList.some(item => typeof item === 'string' && item.trim().toLowerCase() === normalized);
}
