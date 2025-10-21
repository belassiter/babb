// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, writeBatch, serverTimestamp, increment, query, where, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
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

    // Use the song number as a string to match the data type in Firestore.
    const songNumber = songNumberStr;

    // 1. Query for the song by its 'Number' field
    const songsCollectionRef = collection(db, "songs");
    const q = query(songsCollectionRef, where("Number", "==", songNumber));

    try {
        const querySnapshot = await getDocs(q);

        // 2. Validate the result
        if (querySnapshot.empty) {
            alert(`Error: Song with number ${songNumber} not found.`);
            return;
        }
        if (querySnapshot.size > 1) {
            alert(`Error: Multiple songs found with number ${songNumber}. Please correct the data.`);
            return;
        }

        const songDoc = querySnapshot.docs[0];
        const songRef = songDoc.ref;
        const songData = songDoc.data();

        // 3. Create a batched write
        const batch = writeBatch(db);

        const ledgerRef = doc(collection(db, "ledger"));
        batch.set(ledgerRef, {
            songId: songDoc.id, // Store the actual document ID
            timestamp: serverTimestamp()
        });

        batch.update(songRef, {
            plays: increment(1)
        });

        // 4. Commit the batch
        await batch.commit();

        alert(`Successfully logged a play for song #${songNumber} (${songData.Title}).`);

    } catch (error) {
        console.error("Error logging song play: ", error);
        alert("An error occurred while logging the play. Please try again.");
    }
}

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

function loadDataTablesData() {
    const songsCollectionRef = collection(db, "songs");

    getDocs(songsCollectionRef)
      .then((querySnapshot) => {
        const tableBody = document.getElementById('songs-table-body');
        if (!tableBody) return;

        querySnapshot.forEach((doc) => {
          const song = doc.data();
          const row = document.createElement('tr');

          row.innerHTML = `
            <td>${song.Number || ''}</td>
            <td>${song.Title || ''}</td>
            <td>${song.Composer || ''}</td>
            <td>${song.Arranger || ''}</td>
            <td>${song.Feature || ''}</td>
            <td>${song.MP3 ? `<button class="btn btn-success btn-sm play-btn" data-src="${baseUrl}/${song.MP3}" data-number="${song.Number || ''}" data-title="${song.Title || ''}" data-album="${song.Album || ''}">Play</button>` : ''}</td>
            <td>${song.PDF ? `<a href="${baseUrl}/${song.PDF}" target="_blank">PDF</a>` : ''}</td>
          `;
          tableBody.appendChild(row);
        });

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

        // Ensure columns and fixed header are adjusted after initialization
        // to prevent header misalignment and search/filter overflow.
        function adjustTable() {
            try {
                if (table.columns && typeof table.columns.adjust === 'function') {
                    table.columns.adjust();
                }
                if (table.fixedHeader && typeof table.fixedHeader.adjust === 'function') {
                    table.fixedHeader.adjust();
                }
            } catch (err) {
                // swallow errors — better to degrade gracefully than crash
                console.warn('Table adjust error', err);
            }
        }

        $(window).on('resize', function () {
            adjustTable();
        });

        // Do a couple of delayed adjustments after init to let layout settle
        setTimeout(adjustTable, 50);
        setTimeout(adjustTable, 250);

        document.body.style.display = 'block';
      })
      .catch((error) => {
        console.error("Error getting documents for DataTables: ", error);
        document.body.style.display = 'block';
      });
}

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
            addDoc(collection(db, "songs"), { Title: "New Song" })
                .then((docRef) => {
                    console.log("Document written with ID: ", docRef.id);
                    // Add to Tabulator table
                    table.addRow({ id: docRef.id, Title: "New Song" });
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
