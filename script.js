// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, updateDoc, deleteDoc, addDoc, runTransaction, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Configuration ---
const baseUrl = "https://belassiter.com/babb";
// ---------------------

async function logSongPlay(songNumberStr) {
    if (!songNumberStr) {
        alert("Please enter a valid song number.");
        return;
    }

    const songNumber = songNumberStr;
    const songsCollectionRef = collection(db, "songs");
    const q = query(songsCollectionRef, where("Number", "==", songNumber));

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            alert(`Error: Song with number ${songNumber} not found.`);
            return;
        }
        if (querySnapshot.size > 1) {
            alert(`Error: Multiple songs found with number ${songNumber}. Please correct the data.`);
            return;
        }

        const songDoc = querySnapshot.docs[0];

        // --- Duplicate Check (Past 24 Hours) ---
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const duplicateQuery = query(
            collection(db, 'ledger'), 
            where("songId", "==", songDoc.id), 
            where("timestamp", ">", Timestamp.fromDate(twentyFourHoursAgo))
        );
        const duplicateSnapshot = await getDocs(duplicateQuery);
        if (!duplicateSnapshot.empty) {
            alert(`Error: A play for song #${songNumber} (${songDoc.data().Title}) was already logged within the last 24 hours.`);
            return;
        }
        // ----------------------------------------

        const ledgerPayload = { songId: songDoc.id, timestamp: Timestamp.fromDate(new Date()) };
        console.debug('Creating ledger-only entry:', ledgerPayload, { user: auth && auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null });
        await addDoc(collection(db, 'ledger'), ledgerPayload);

        // After ledger creation, increment the song's plays in a transaction.
        // This handles the case where plays may be missing or non-numeric.
        const songRef = songDoc.ref;
        try {
            // diagnostic read: get current server-side value before transaction
            const preSnap = await getDoc(songRef);
            const prePlays = preSnap.exists() ? preSnap.data().plays : null;
            console.debug('Pre-increment read', { songId: songRef.id, prePlays, prePlaysType: typeof prePlays, user: auth && auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null });

            await runTransaction(db, async (tx) => {
                const snap = await tx.get(songRef);
                if (!snap.exists()) throw new Error('Song document no longer exists');
                const data = snap.data();
                const current = data.plays == null ? 0 : (Number.isFinite(Number(data.plays)) ? Math.floor(Number(data.plays)) : 0);
                const newPlays = current + 1;

                // Build date-only YYYY-MM-DD for LastPlayed
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const lastPlayedDate = `${yyyy}-${mm}-${dd}`;

                console.debug('Transaction will write plays + LastPlayed', { songId: songRef.id, current, newPlays, lastPlayedDate });
                tx.update(songRef, { plays: newPlays, LastPlayed: lastPlayedDate });
            });

            console.log('Plays incremented successfully after ledger write.');
            alert(`Successfully logged a play for song #${songNumber} (${songDoc.data().Title}).`);
        } catch (incErr) {
            console.error('Failed to increment plays after ledger write:', incErr);
            // If permission-denied, dump the preSnap and transaction intent for diagnosis
            try {
                const preSnap2 = await getDoc(songRef);
                console.debug('Post-failure read', { songId: songRef.id, exists: preSnap2.exists(), data: preSnap2.exists() ? preSnap2.data() : null });
            } catch (readErr) {
                console.warn('Could not read song after failed increment:', readErr);
            }
            alert('Ledger created but could not increment plays. See console for details.');
        }
    } catch (err) {
        console.error('Failed to create ledger entry:', err);
        alert('Could not log play (ledger). See console for details.');
    }
}

// Play an MP3 when a play button is clicked. Reuses a single hidden audio
// element so multiple clicks don't leak elements. Expects the button to have
// a data-src attribute with the audio URL.
function playSong(button) {
    const audioPlayerContainer = document.getElementById('audio-player-container');
    const audioPlayer = document.getElementById('global-audio-player');
    const nowPlayingTitle = document.getElementById('now-playing-title');

    const number = button.getAttribute('data-number');
    const title = button.getAttribute('data-title');
    const album = button.getAttribute('data-album');

    audioPlayer.src = button.getAttribute('data-src');
    nowPlayingTitle.textContent = `#${number} - ${title} from ${album}`;
    audioPlayerContainer.style.display = 'block';
    audioPlayer.play();
}

// Play buttons are handled by DataTables/Tabulator-specific handlers added where
// each table is initialized. Removing the global delegated handler avoids
// double-invocation of playSong (which caused AbortError on rapid clicks).

function loadTabulatorData() {
    const songsCollectionRef = collection(db, "songs");

    getDocs(songsCollectionRef)
      .then((querySnapshot) => {
        const tableData = [];
        querySnapshot.forEach((doc) => {
            tableData.push({ id: doc.id, ...doc.data() });
        });

        const table = new Tabulator("#songs-table", {
            data: tableData,
            layout: "fitData", // Let columns size to content
            history: true, // Enable undo/redo
            initialSort: [
                { column: "Number", dir: "asc" },
            ],
            columns: [
                { title: "Number", field: "Number", editor: "input", sorter: "number" },
                { title: "Title", field: "Title", editor: "input", minWidth: 200 },
                { title: "Composer", field: "Composer", editor: "input" },
                { title: "Arranger", field: "Arranger", editor: "input" },
                { title: "Feature", field: "Feature", editor: "input" },
                { title: "Album", field: "Album", editor: "input" },
                { title: "Plays", field: "plays", sorter: "number", formatter: (cell) => {
                        const song = cell.getRow().getData();
                        const safeLP = song.LastPlayed ? String(song.LastPlayed).replace(/"/g, '&quot;') : '';
                        const readable = safeLP ? (function(ds){
                            const parts = ds.split('-');
                            if (parts.length !== 3) return ds;
                            const y = parseInt(parts[0],10), m = parseInt(parts[1],10)-1, d = parseInt(parts[2],10);
                            if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return ds;
                            const dt = new Date(y,m,d);
                            return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                        })(safeLP) : '';
                        return `<span title="${readable}">${cell.getValue() || 0}</span>`;
                    }
                },
                { 
                    title: "MP3", 
                    field: "MP3", 
                    hozAlign: "center", 
                    headerSort: false,
                    formatter: (cell) => {
                        const song = cell.getRow().getData();
                        return cell.getValue() ? `<button class="btn btn-success btn-sm play-btn" data-src="${baseUrl}/${cell.getValue()}" data-number="${song.Number || ''}" data-title="${song.Title || ''}" data-album="${song.Album || ''}">Play</button>` : "";
                    },
                    cellClick: function(e, cell){
                        if (e.target.classList.contains('play-btn')) {
                            playSong(e.target);
                        }
                    }
                },
                {
                    title: "Delete",
                    formatter: "buttonCross",
                    width: 40,
                    hozAlign: "center",
                    cellClick: function(e, cell) {
                        const row = cell.getRow();
                        const docId = row.getData().id;
                        if (confirm("Are you sure you want to delete this row?")) {
                            const songRef = doc(db, "songs", docId);
                            deleteDoc(songRef)
                                .then(() => {
                                    console.log("Document successfully deleted!");
                                    row.delete();
                                })
                                .catch((error) => {
                                    console.error("Error removing document: ", error);
                                    alert("Error deleting row. See console for details.");
                                });
                        }
                    }
                }
            ],
        });

        // --- Global Filter ---
        const globalFilter = document.getElementById("global-filter");
        
        const customGlobalFilter = (data, filterParams) => {
            const filterValue = filterParams.value.toLowerCase();
            for(let key in data){
                if(String(data[key]).toLowerCase().includes(filterValue)){
                    return true;
                }
            }
            return false;
        };

        globalFilter.addEventListener("keyup", function(){
            const filterValue = globalFilter.value;
            table.setFilter(customGlobalFilter, { value: filterValue });
        });

        // --- Add Row Button ---
        const addRowBtn = document.getElementById("add-row-btn");
        addRowBtn.addEventListener("click", function(){
            // Add a new song to Firestore
            addDoc(collection(db, "songs"), { 
                Title: "New Song",
                DateAdded: Timestamp.now()
            })
                .then((docRef) => {
                    console.log("Document written with ID: ", docRef.id);
                    // Add to Tabulator table
                    table.addRow({ id: docRef.id, Title: "New Song", DateAdded: Timestamp.now() });
                    table.redraw(); // Redraw table to show new row
                })
                .catch((error) => {
                    console.error("Error adding document: ", error);
                    alert("Error adding new row. See console for details.");
                });
        });

        table.on("cellEdited", function(cell){
            const docId = cell.getRow().getData().id;
            const field = cell.getField();
            const value = cell.getValue();

            const songRef = doc(db, "songs", docId);
            updateDoc(songRef, {
                [field]: value
            }).then(() => {
                console.log(`Successfully updated ${field} for song ${docId}`);
            }).catch((error) => {
                console.error("Error updating document: ", error);
                alert("Error saving change. See console for details.");
            });
        });

        document.body.style.display = 'block';
      })
      .catch((error) => {
        console.error("Error getting documents for Tabulator: ", error);
        document.body.style.display = 'block';
      });
}

// --- Page Routing ---
if (window.location.pathname.endsWith('admin.html')) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            addLogoutButton();
            loadTabulatorData();
        } else {
            window.location.href = 'login.html';
        }
    });
} else {
    loadDataTablesData();

    const logPlayBtn = document.getElementById('log-play-btn');
    if (logPlayBtn) {
        logPlayBtn.addEventListener('click', () => {
            const songId = prompt("Please enter the song number:");
            if (songId) {
                logSongPlay(songId.trim());
            }
        });
    }
}

// Restore the DataTables loader function (was accidentally removed)
function loadDataTablesData() {
    const songsCollectionRef = collection(db, "songs");

    getDocs(songsCollectionRef)
      .then((querySnapshot) => {
        const tableBody = document.getElementById('songs-table-body');
        if (!tableBody) return;

        // Clear any existing rows
        tableBody.innerHTML = '';

        querySnapshot.forEach((docSnap) => {
          const song = docSnap.data();
          const row = document.createElement('tr');

          const safeLastPlayed = song.LastPlayed ? String(song.LastPlayed).replace(/"/g, '&quot;') : '';
          const readableLastPlayed = safeLastPlayed ? (function(ds){
                  const parts = ds.split('-');
                  if (parts.length !== 3) return ds;
                  const y = parseInt(parts[0],10), m = parseInt(parts[1],10)-1, d = parseInt(parts[2],10);
                  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return ds;
                  const dt = new Date(y,m,d);
                  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
          })(safeLastPlayed) : '';

          row.innerHTML = `
              <td>${song.Number || ''}</td>
              <td>${song.Title || ''}</td>
              <td>${song.Composer || ''}</td>
              <td>${song.Arranger || ''}</td>
              <td>${song.Feature || ''}</td>
              <td>${song.MP3 ? `<button class="btn btn-success btn-sm play-btn" data-src="${baseUrl}/${song.MP3}" data-number="${song.Number || ''}" data-title="${song.Title || ''}" data-album="${song.Album || ''}">Play</button>` : ''}</td>
              <td>${song.PDF ? `<a href="${baseUrl}/${song.PDF}" target="_blank">PDF</a>` : ''}</td>
              <td><span title="${readableLastPlayed}">${song.plays || 0}</span></td>
          `;
          tableBody.appendChild(row);
        });

        // Initialize DataTables (if not already) with export buttons and play handling
        if (window.$ && $.fn && $.fn.DataTable) {
            try {
                if (!$.fn.DataTable.isDataTable('#songs-table')) {
                    const table = $('#songs-table').DataTable({
                        "order": [[ 0, "asc" ]],
                        "paging": false,
                        "responsive": false,
                        "fixedHeader": true,
                        "scrollX": true,
                        "dom": 'Bfrtip',
                        "buttons": [
                            {
                                extend: 'pdfHtml5',
                                exportOptions: {
                                    columns: [0, 1, 2, 3, 4]
                                }
                            },
                            {
                                extend: 'excelHtml5',
                                exportOptions: {
                                    format: {
                                        body: function ( inner, rowidx, colidx, node ) {
                                            if (colidx === 5) {
                                                var button = $(node).find('button');
                                                return button.length ? button.data('src') : '';
                                            }
                                            if (colidx === 6) {
                                                var link = $(node).find('a');
                                                return link.length ? link.attr('href') : '';
                                            }
                                            return inner;
                                        }
                                    }
                                }
                            }
                        ]
                    });

                    // Add event listener for play buttons using DataTables API
                    table.on('click touchend', '.play-btn', function (e) {
                        e.preventDefault();
                        playSong(this);
                    });

                    // Move custom global search input (#global-filter) into the buttons row so
                    // it appears on the same line as the export buttons.
                    try {
                        const $wrapper = $('#songs-table_wrapper');
                        const $buttons = $wrapper.find('.dt-buttons');
                        const $global = $('#global-filter');
                        if ($buttons.length && $global.length) {
                            // hide the default DataTables filter to avoid duplicate inputs
                            $wrapper.find('div.dataTables_filter').hide();
                            // move our global filter into the buttons container and style it inline
                            $global.detach().css({ display: 'inline-block', marginLeft: '10px', verticalAlign: 'middle' }).insertAfter($buttons);
                        }
                    } catch (e) {
                        // non-fatal
                    }

                    // Fix header alignment issues: adjust columns and fixed header after init
                    try {
                        if (table.columns && typeof table.columns.adjust === 'function') {
                            table.columns.adjust();
                        }
                        if (table.fixedHeader && typeof table.fixedHeader.adjust === 'function') {
                            table.fixedHeader.adjust();
                        }
                    } catch (err) {
                        // ignore
                    }
                    // Schedule a couple of delayed adjustments to let layout settle
                    setTimeout(() => {
                        try {
                            if (table.columns && typeof table.columns.adjust === 'function') table.columns.adjust();
                            if (table.fixedHeader && typeof table.fixedHeader.adjust === 'function') table.fixedHeader.adjust();
                        } catch (e) {}
                    }, 50);
                    setTimeout(() => {
                        try {
                            if (table.columns && typeof table.columns.adjust === 'function') table.columns.adjust();
                            if (table.fixedHeader && typeof table.fixedHeader.adjust === 'function') table.fixedHeader.adjust();
                        } catch (e) {}
                    }, 250);
                } else {
                    // If already initialized, just wire play buttons in case rows changed
                    document.querySelectorAll('.play-btn').forEach(btn => btn.addEventListener('click', function(e){
                        e.preventDefault();
                        playSong(this);
                    }));
                }
            } catch (e) {
                console.warn('DataTables init warning', e);
            }
        }

        document.body.style.display = 'block';
      })
      .catch((error) => {
        console.error("Error getting documents for DataTables: ", error);
        document.body.style.display = 'block';
      });
}

function addLogoutButton() {
    const logoutButton = document.createElement('button');
    logoutButton.textContent = 'Logout';
    logoutButton.className = 'btn btn-danger';
    logoutButton.style.position = 'absolute';
    logoutButton.style.top = '10px';
    logoutButton.style.right = '10px';
    logoutButton.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error('Sign out error', error);
        });
    });
    document.body.appendChild(logoutButton);
}
