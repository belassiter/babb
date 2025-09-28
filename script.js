// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Hide body by default to prevent flash of content
document.body.style.display = 'none';

// --- Configuration ---
const baseUrl = "https://belassiter.com/babb";
// ---------------------

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
            <td>${song['Arranger/Composer'] || ''}</td>
            <td>${song.Feature || ''}</td>
            <td>${song.PDF ? `<a href="${baseUrl}/${song.PDF}" target="_blank">PDF</a>` : ''}</td>
            <td>${song.Album || ''}</td>
            <td>${song.MP3 ? `<button class="btn btn-success btn-sm play-btn" data-src="${baseUrl}/${song.MP3}" data-title="${song.Title}">Play</button>` : ''}</td>
          `;
          tableBody.appendChild(row);
        });

        $('#songs-table').DataTable({
            "order": [[ 0, "asc" ]],
            "paging": false,
            "responsive": true,
            "fixedHeader": true,
            "dom": 'Bfrtip',
            "buttons": ['colvis', 'pdf', 'csv', 'excel', 'print']
        });

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
                { title: "Arranger/Composer", field: "Arranger/Composer", editor: "input" },
                { title: "Feature", field: "Feature", editor: "input" },
                { title: "Album", field: "Album", editor: "input" },
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

// --- Global Event Listeners ---
document.body.addEventListener('click', function(event) {
    if (event.target.classList.contains('play-btn')) {
        const audioPlayerContainer = document.getElementById('audio-player-container');
        const audioPlayer = document.getElementById('global-audio-player');
        const nowPlayingTitle = document.getElementById('now-playing-title');
        
        const button = event.target;
        audioPlayer.src = button.getAttribute('data-src');
        nowPlayingTitle.textContent = button.getAttribute('data-title');
        audioPlayerContainer.style.display = 'block';
        audioPlayer.play();
    }
});

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
