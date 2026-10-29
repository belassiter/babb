# BABB Repertoire Manager

A web-based repository for BABB band members to view, play, and log rehearsals and performances.

## Overview
- **Public View**: Interactive table of songs using DataTables. Allows playing audio (if available) and logging song plays.
- **Admin View**: Restricted area using Tabulator and Firebase Auth for managing song metadata (Title, Composer, Arranger, etc.).
- **Backend**: Firebase Firestore for database and Firebase Hosting/Storage for deployment.

## Automation & Maintenance

### File Synchronization (`sync-files.js`)
This script automatically links files in your local directories to the Firestore database records based on the song number.
- **PDFs**: Place PDF files in the `./pdfs/` folder.
- **Audio**: Place MP3 files in the `./audio/` folder.
- **Naming Convention**: Files must follow the format `NUM-Name.ext` (e.g., `101-Midnight Blues.mp3` or `101-Midnight Blues.pdf`).
- **Running the script**:
  ```powershell
  node sync-files.js
  ```
  The script will scan the folders, match them against the `Number` field in Firestore, and update the `MP3` and `PDF` fields accordingly.

### Initial Data Upload (`upload-to-firestore.js`)
Used for bulk-importing songs from a JSON file.
1. Prepare your data in `merged-data.json`.
2. Run `node upload-to-firestore.js` to add all items to the `songs` collection.

### CSV Merging (`csvmerge.js`)
A utility to merge multiple source CSV files into the `merged-data.json` format required for the initial upload.

## Dependencies
- **Frontend**: Bootstrap 5, jQuery, DataTables, Tabulator.
- **Backend**: Firebase (Auth, Firestore).
- **Environment**: Node.js is required for running the sync and upload scripts.

## Database Indexing
The "Duplicate Play Check" feature requires a composite index on the `ledger` collection for fields: `songId` (Ascending) and `timestamp` (Descending). If the console shows an error for this query, follow the generated link in the log to create the index in the Firebase console.
