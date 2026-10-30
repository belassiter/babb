/**
 * history.js
 * Controller for the BABB History page.
 * Manages Firebase data fetching, UI interactions, Chart.js graphs, and DataTables.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

import {
    getCutoffDate,
    filterLedgerByDate,
    aggregatePlaysBySong,
    computeSongMetrics,
    computeArrangerMetrics,
    computeComposerMetrics,
    computeFeatureMetrics,
    computeHistogram,
    computeTimeline,
    computeKpis,
    formatDate
} from "./history-calc.js";

// Initialize Firebase safely from global firebaseConfig or window.firebaseConfig
const fbConfig = (typeof firebaseConfig !== 'undefined') ? firebaseConfig : (window.firebaseConfig || {});
const app = initializeApp(fbConfig);
const db = getFirestore(app);

// Application State
let rawSongs = [];
let rawLedger = [];
let selectedTimeframe = '1year';
let activeDimension = 'songs';

// Chart instances
let histogramChart = null;
let timelineChart = null;
let featureDonutChart = null;

// DataTable instance
let dataTable = null;

// Colors for charts
const COLORS = {
    primary: '#0d6efd',
    primaryLight: 'rgba(13, 110, 253, 0.65)',
    primaryBorder: 'rgba(13, 110, 253, 1)',
    secondary: '#6c757d',
    accent1: '#198754', // Green
    accent2: '#ffc107', // Amber
    accent3: '#dc3545', // Red
    accent4: '#0dcaf0', // Cyan
    accent5: '#6f42c1', // Purple
    palette: [
        '#0d6efd', '#6610f2', '#6f42c1', '#d63384', '#dc3545',
        '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0'
    ]
};

/**
 * Show / hide loading indicator
 */
function setLoading(isLoading) {
    const el = document.getElementById('loading-indicator');
    if (el) el.style.display = isLoading ? 'inline-flex' : 'none';
}

/**
 * Fetch songs and ledger collections from Firestore
 */
async function loadData() {
    setLoading(true);
    try {
        console.log("Fetching songs and ledger from Firestore...");
        const songsSnap = await getDocs(collection(db, "songs"));
        rawSongs = [];
        songsSnap.forEach(doc => {
            rawSongs.push({ id: doc.id, ...doc.data() });
        });

        const ledgerSnap = await getDocs(collection(db, "ledger"));
        rawLedger = [];
        ledgerSnap.forEach(doc => {
            rawLedger.push(doc.data());
        });

        console.log(`Loaded ${rawSongs.length} songs and ${rawLedger.length} ledger entries.`);
        setLoading(false);
        render();
    } catch (err) {
        console.error("Error loading data from Firestore:", err);
        setLoading(false);
        alert("Failed to load repertoire history. See console for details: " + (err.message || err));
    }
}

/**
 * Master recalculate and render function
 */
function render() {
    const cutoffDate = getCutoffDate(selectedTimeframe);
    const filteredLedger = filterLedgerByDate(rawLedger, cutoffDate);
    const playMap = aggregatePlaysBySong(filteredLedger);

    // Compute metric dimensions
    const songMetrics = computeSongMetrics(rawSongs, playMap);
    const arrangerMetrics = computeArrangerMetrics(songMetrics);
    const composerMetrics = computeComposerMetrics(songMetrics);
    const featureMetrics = computeFeatureMetrics(songMetrics);

    // Update KPI cards
    const kpis = computeKpis(rawSongs, filteredLedger, songMetrics, arrangerMetrics, composerMetrics);
    updateKpis(kpis);

    // Update Charts
    updateHistogramChart(computeHistogram(songMetrics));
    updateTimelineChart(computeTimeline(filteredLedger));
    updateFeatureDonutChart(featureMetrics);

    // Update Data Table
    updateTable(songMetrics, arrangerMetrics, composerMetrics, featureMetrics);
}

/**
 * Update KPI DOM Cards
 */
function updateKpis(kpis) {
    if (kpis.topSong) {
        document.getElementById('kpi-top-song-title').textContent = `#${kpis.topSong.number} ${kpis.topSong.title}`;
        document.getElementById('kpi-top-song-plays').textContent = `${kpis.topSong.plays} plays`;
    } else {
        document.getElementById('kpi-top-song-title').textContent = 'None';
        document.getElementById('kpi-top-song-plays').textContent = 'No plays logged';
    }

    if (kpis.topArranger) {
        document.getElementById('kpi-top-arranger-name').textContent = kpis.topArranger.name;
        document.getElementById('kpi-top-arranger-plays').textContent = `${kpis.topArranger.plays} plays`;
    } else {
        document.getElementById('kpi-top-arranger-name').textContent = 'None';
        document.getElementById('kpi-top-arranger-plays').textContent = 'No plays logged';
    }
}

/**
 * Chart 1: Play Frequency Distribution Histogram
 */
function updateHistogramChart(histogramData) {
    const ctx = document.getElementById('histogram-chart');
    if (!ctx) return;

    if (histogramChart) {
        histogramChart.destroy();
    }

    histogramChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: histogramData.labels,
            datasets: [{
                label: 'Number of Charts',
                data: histogramData.counts,
                backgroundColor: [
                    'rgba(245, 158, 11, 0.7)', // 0 plays
                    'rgba(14, 165, 233, 0.7)', // 1 play
                    'rgba(59, 130, 246, 0.7)', // 2 plays
                    'rgba(79, 70, 229, 0.7)',  // 3-4 plays
                    'rgba(147, 51, 234, 0.7)', // 5-6 plays
                    'rgba(16, 185, 129, 0.7)'  // 7+ plays
                ],
                borderColor: [
                    '#d97706',
                    '#0284c7',
                    '#2563eb',
                    '#4338ca',
                    '#7e22ce',
                    '#059669'
                ],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} songs in library`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}



/**
 * Chart 3: Activity Timeline (Plays per rehearsal date)
 */
function updateTimelineChart(timelineData) {
    const ctx = document.getElementById('timeline-chart');
    if (!ctx) return;

    if (timelineChart) {
        timelineChart.destroy();
    }

    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timelineData.labels.length > 0 ? timelineData.labels : ['No data'],
            datasets: [{
                label: 'Charts Played',
                data: timelineData.counts.length > 0 ? timelineData.counts : [0],
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.15)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#0d6efd',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    title: { display: true, text: 'Songs Played' }
                },
                x: {
                    ticks: { maxRotation: 45, minRotation: 0 }
                }
            }
        }
    });
}

/**
 * Chart 4: Feature Breakdown Donut Chart
 */
function updateFeatureDonutChart(featureMetrics) {
    const ctx = document.getElementById('feature-donut-chart');
    if (!ctx) return;

    if (featureDonutChart) {
        featureDonutChart.destroy();
    }

    const activeFeatures = featureMetrics.filter(f => f.plays > 0);
    const labels = activeFeatures.map(f => f.name);
    const data = activeFeatures.map(f => f.plays);

    featureDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length > 0 ? labels : ['None'],
            datasets: [{
                data: data.length > 0 ? data : [1],
                backgroundColor: labels.length > 0 ? COLORS.palette : ['#e2e8f0'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 11 } }
                }
            }
        }
    });
}

/**
 * Master DataTable Builder
 */
function updateTable(songMetrics, arrangerMetrics, composerMetrics, featureMetrics) {
    const tableEl = document.getElementById('metrics-table');
    if (!tableEl) return;

    // Destroy existing table instance before changing columns
    if (dataTable) {
        dataTable.destroy();
        $('#metrics-table').empty(); // Clean DOM structure
    }

    let columns = [];
    let tableData = [];

    if (activeDimension === 'songs') {
        tableData = songMetrics;

        columns = [
            { 
                title: "Plays", 
                data: "plays",
                width: "70px",
                render: function(data, type, row) {
                    if (data === 0) {
                        return '<span class="text-muted">0</span>';
                    }
                    return `<span class="plays-link fw-bold" data-id="${row.id}" data-title="${row.Title}" data-number="${row.Number}">${data}</span>`;
                }
            },
            { title: "#", data: "Number", width: "60px" },
            { title: "Title", data: "Title" },
            { title: "Arranger", data: "Arranger" },
            { title: "Composer", data: "Composer" },
            { title: "Feature", data: "Feature" }
        ];
    } else if (activeDimension === 'arrangers') {
        tableData = arrangerMetrics;
        columns = [
            { title: "Arranger", data: "name", className: "fw-bold" },
            { title: "Plays", data: "plays", className: "fw-bold text-primary", width: "80px" },
            { title: "Charts", data: "chartCount", width: "80px" },
            { title: "Top Chart", data: "topChartDisplay" }
        ];
    } else if (activeDimension === 'composers') {
        tableData = composerMetrics;
        columns = [
            { title: "Composer", data: "name", className: "fw-bold" },
            { title: "Plays", data: "plays", className: "fw-bold text-primary", width: "80px" },
            { title: "Charts", data: "chartCount", width: "80px" },
            { title: "Top Chart", data: "topChartDisplay" }
        ];
    } else if (activeDimension === 'features') {
        tableData = featureMetrics;
        columns = [
            { title: "Feature", data: "name", className: "fw-bold" },
            { title: "Plays", data: "plays", className: "fw-bold text-primary", width: "80px" },
            { title: "Charts", data: "chartCount", width: "80px" },
            { title: "Top Chart", data: "topChartDisplay" }
        ];
    }

    // Rebuild the thead dynamically to match columns
    const theadHtml = '<thead><tr>' + columns.map(c => `<th>${c.title}</th>`).join('') + '</tr></thead>';
    $('#metrics-table').html(theadHtml + '<tbody></tbody>');

    // Re-initialize DataTable without pagination (always show everything)
    dataTable = $('#metrics-table').DataTable({
        data: tableData,
        columns: columns,
        responsive: false,
        paging: false,
        order: [[ (activeDimension === 'songs' ? 0 : 1), 'desc' ]] // Sort by Plays descending by default
    });
}

/**
 * Helper to display human-readable timeframe badge
 */
function selectedTimeframeLabel() {
    switch (selectedTimeframe) {
        case '3months': return '3 Months';
        case '6months': return '6 Months';
        case '1year': return '1 Year';
        case 'all': return 'All';
        default: return '1 Year';
    }
}

function updateTimeframeBadge() {
    const badge = document.getElementById('timeframe-label');
    if (!badge) return;
    switch (selectedTimeframe) {
        case '3months':
            badge.textContent = 'Past 3 Months';
            break;
        case '6months':
            badge.textContent = 'Past 6 Months';
            break;
        case '1year':
            badge.textContent = 'Past 12 Months';
            break;
        case 'all':
            badge.textContent = 'All-Time Repertoire History';
            break;
    }
}

// --- Audio Player Handlers ---
function playSongAudio(button) {
    const container = document.getElementById('audio-player-container');
    const audio = document.getElementById('global-audio-player');
    const titleEl = document.getElementById('now-playing-title');

    const number = button.getAttribute('data-number');
    const title = button.getAttribute('data-title');
    const album = button.getAttribute('data-album');
    const src = button.getAttribute('data-src');

    audio.src = src;
    titleEl.textContent = `#${number} - ${title}${album ? ' (' + album + ')' : ''}`;
    container.style.display = 'block';
    audio.play();
}

// --- Play History Modal ---
async function showPlayHistoryModal(songId, title, number) {
    const modal = document.getElementById('play-history-modal');
    const list = document.getElementById('play-history-list');
    const titleEl = document.getElementById('modal-song-title');

    titleEl.textContent = `#${number} - ${title}`;
    list.innerHTML = '<li>Loading history...</li>';
    modal.style.display = 'flex';

    try {
        const ledgerRef = collection(db, 'ledger');
        let q = query(ledgerRef, where("songId", "==", songId), orderBy("timestamp", "desc"));
        let snap;
        try {
            snap = await getDocs(q);
        } catch (e) {
            // Fallback without index
            snap = await getDocs(query(ledgerRef, where("songId", "==", songId)));
        }

        const entries = [];
        snap.forEach(d => entries.push(d.data()));

        entries.sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime()) : 0;
            const tB = b.timestamp ? (b.timestamp.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime()) : 0;
            return tB - tA;
        });

        list.innerHTML = '';
        if (entries.length === 0) {
            list.innerHTML = '<li>No plays recorded for this chart.</li>';
        } else {
            entries.forEach(entry => {
                const li = document.createElement('li');
                if (entry.timestamp) {
                    const date = entry.timestamp.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp);
                    const m = date.getMonth() + 1;
                    const d = date.getDate();
                    const y = date.getFullYear();
                    li.textContent = `${m}/${d}/${y}`;
                } else {
                    li.textContent = 'Unknown date';
                }
                list.appendChild(li);
            });
        }
    } catch (err) {
        console.error("Error loading play history:", err);
        list.innerHTML = '<li>Error loading play history.</li>';
    }
}

// --- Wire Event Listeners ---
function initEvents() {
    // Timeframe selector buttons
    const timeframeButtons = document.querySelectorAll('#timeframe-selector button');
    timeframeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const time = btn.getAttribute('data-time');
            if (time === selectedTimeframe) return;

            timeframeButtons.forEach(b => {
                b.classList.remove('btn-primary');
                b.classList.add('btn-outline-primary');
            });
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-primary');

            selectedTimeframe = time;
            updateTimeframeBadge();
            render();
        });
    });

    // Dimension tab switcher
    const dimensionButtons = document.querySelectorAll('#dimension-tabs button');
    dimensionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const dim = btn.getAttribute('data-dimension');
            if (dim === activeDimension) return;

            dimensionButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            activeDimension = dim;
            render();
        });
    });

    // Delegated clicks for table (audio play button & plays modal link)
    const tableEl = document.getElementById('metrics-table');
    if (tableEl) {
        tableEl.addEventListener('click', (e) => {
            const playBtn = e.target.closest('.play-audio-btn');
            if (playBtn) {
                playSongAudio(playBtn);
                return;
            }

            const playsLink = e.target.closest('.plays-link');
            if (playsLink) {
                const songId = playsLink.getAttribute('data-id');
                const title = playsLink.getAttribute('data-title');
                const number = playsLink.getAttribute('data-number');
                showPlayHistoryModal(songId, title, number);
            }
        });
    }

    // Close audio player
    const closeAudioBtn = document.getElementById('close-audio-btn');
    if (closeAudioBtn) {
        closeAudioBtn.addEventListener('click', () => {
            const container = document.getElementById('audio-player-container');
            const audio = document.getElementById('global-audio-player');
            audio.pause();
            audio.src = '';
            container.style.display = 'none';
        });
    }

    // Modal close listeners
    const modal = document.getElementById('play-history-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modal && modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });
    }
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadData();
});
