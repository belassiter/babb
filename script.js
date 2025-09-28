// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- Configuration ---
// The base URL of where the site will be hosted.
const baseUrl = "https://belassiter.com/babb";
// ---------------------

// For Firebase JS SDK v7.20.0 and later, measurementId is optional


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get a reference to the database service
const db = getFirestore();

// Get a reference to the "songs" collection
const songsCollectionRef = collection(db, "songs");

getDocs(songsCollectionRef)
  .then((querySnapshot) => {
    // Get the table body element from your HTML
    const tableBody = document.getElementById('songs-table-body');

    querySnapshot.forEach((doc) => {
      const song = doc.data();

      // Create a new table row element
      const row = document.createElement('tr');

      // --- Create a cell for each data point ---

      // Number
      const numberCell = document.createElement('td');
      numberCell.textContent = song.Number || '';
      row.appendChild(numberCell);

      // Title
      const titleCell = document.createElement('td');
      titleCell.textContent = song.Title || '';
      row.appendChild(titleCell);

      // Composer
      const composerCell = document.createElement('td');
      composerCell.textContent = song.Composer || '';
      row.appendChild(composerCell);

      // Arranger
      const arrangerCell = document.createElement('td');
      arrangerCell.textContent = song.Arranger || '';
      row.appendChild(arrangerCell);
      
      // Arranger/Composer
      const comparrCell = document.createElement('td');
      comparrCell.textContent = song['Arranger/Composer'] || '';
      row.appendChild(comparrCell);

      // Feature
      const featureCell = document.createElement('td');
      featureCell.textContent = song['Feature'] || '';
      row.appendChild(featureCell);

      // PDF Link
      const pdfCell = document.createElement('td');
      if (song.PDF) {
        pdfCell.innerHTML = `<a href="${baseUrl}/${song.PDF}" target="_blank">PDF</a>`;
      }
      row.appendChild(pdfCell);

      // Album the recording is from
      const albumCell = document.createElement('td');
      albumCell.textContent = song.Album || '';
      row.appendChild(albumCell);

      // MP3 for playback
      const mp3Cell = document.createElement('td');
      if (song.MP3) {
        const fullUrl = `${baseUrl}/${song.MP3}`;
        mp3Cell.innerHTML = `<button class="btn btn-success btn-sm play-btn" data-src="${fullUrl}" data-title="${song.Title}">Play</button>`;
      }
      row.appendChild(mp3Cell);

      // --- Add the completed row to the table body ---
      tableBody.appendChild(row);
    });

    // --- Set up the global audio player ---
    const audioPlayerContainer = document.getElementById('audio-player-container');
    const audioPlayer = document.getElementById('global-audio-player');
    const nowPlayingTitle = document.getElementById('now-playing-title');

    tableBody.addEventListener('click', function(event) {
      // Check if a play button was clicked
      if (event.target.classList.contains('play-btn')) {
        const button = event.target;
        const songUrl = button.getAttribute('data-src');
        const songTitle = button.getAttribute('data-title');

        // Update the player's source and title
        audioPlayer.src = songUrl;
        nowPlayingTitle.textContent = songTitle;

        // Show the player and start playback
        audioPlayerContainer.style.display = 'block';
        audioPlayer.play();
      }
    });

    // Initialize DataTables after the table is populated
    $('#songs-table').DataTable({
        // Set the default sort order
        // Sort by the first column (index 0) in ascending order
        "order": [[ 0, "asc" ]],
        "paging": false,
        "responsive": true,
        "fixedHeader": true,
        //buttons for column visibility
        "dom": 'Bfrtip',
        "buttons": [
            'colvis',
            {
              extend: 'pdf',
              exportOptions: {
                columns: [0,1,2,3] // Adjust column indexes as needed
              }
            },
            'csv',
            'excel',
            'print'
        ]   
    });

  })
  .catch((error) => {
    console.log("Error getting documents: ", error);
  });
