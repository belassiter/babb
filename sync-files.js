const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const PDF_DIR = './pdfs';
const AUDIO_DIR = './audio';
const SERVICE_ACCOUNT_FILE = './babb-9779f-firebase-adminsdk-fbsvc-7e56b3262e.json';
// ---------------------

console.log('Starting file synchronization script...');

function getFilesInDir(dir) {
    if (!fs.existsSync(dir)) {
        console.error(`\nError: Required directory not found: ${path.resolve(dir)}`);
        console.error('Please create this directory and place your files inside it.');
        return null;
    }
    try {
        return fs.readdirSync(dir);
    } catch (error) {
        console.error(`\nError reading directory ${dir}:`, error);
        return null;
    }
}

function createFileMap(files, dir) {
    const map = new Map();
    for (const file of files) {
        const match = file.match(/^(\d+)-/);
        if (match) {
            const number = parseInt(match[1], 10);
            const relativePath = path.join(dir, file).replace(/\\/g, '/').replace('./', '/');
            map.set(number, relativePath);
        }
    }
    return map;
}

async function syncFiles() {
    try {
        const serviceAccount = require(SERVICE_ACCOUNT_FILE);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin initialized successfully.');
    } catch (error) {
        console.error(`\nError: Could not initialize Firebase.`);
        console.error(`Please ensure your service account key file is named and placed correctly: '${SERVICE_ACCOUNT_FILE}'.`);
        process.exit(1);
    }

    const db = admin.firestore();
    const songsCollectionRef = db.collection('songs');

    console.log(`\nScanning for files in ${PDF_DIR} and ${AUDIO_DIR}...`);
    const pdfFiles = getFilesInDir(PDF_DIR);
    if (pdfFiles === null) process.exit(1);

    const audioFiles = getFilesInDir(AUDIO_DIR);
    if (audioFiles === null) process.exit(1);

    const pdfMap = createFileMap(pdfFiles, PDF_DIR);
    const audioMap = createFileMap(audioFiles, AUDIO_DIR);
    console.log(`Found ${pdfMap.size} PDFs and ${audioMap.size} audio files with valid names.`);

    console.log('\nFetching all song metadata from Firestore...');
    const snapshot = await songsCollectionRef.get();
    if (snapshot.empty) {
        console.log('No songs found in Firestore.');
        return;
    }
    console.log(`Found ${snapshot.size} songs in the database.`);

    const updatesToCommit = [];
    snapshot.forEach(doc => {
        const song = doc.data();
        const songNumber = parseInt(song.Number, 10);

        if (isNaN(songNumber)) {
            console.warn(`- Skipping song with ID '${doc.id}' due to invalid 'Number': ${song.Number}`);
            return;
        }

        const newPdfPath = pdfMap.get(songNumber) || '';
        const newAudioPath = audioMap.get(songNumber) || '';
        const currentPdfPath = song.PDF || '';
        const currentAudioPath = song.MP3 || '';

        if (newPdfPath !== currentPdfPath || newAudioPath !== currentAudioPath) {
            updatesToCommit.push({ ref: doc.ref, data: { PDF: newPdfPath, MP3: newAudioPath }, number: song.Number, title: song.Title });
        }
    });

    if (updatesToCommit.length === 0) {
        console.log('\nEverything is already up-to-date. No changes were made.');
        return;
    }

    console.log(`\nFound ${updatesToCommit.length} songs that need updates. Committing changes to Firestore in batches...`);

    const batchSize = 400; // Firestore batches are limited to 500 operations.
    for (let i = 0; i < updatesToCommit.length; i += batchSize) {
        const batch = db.batch();
        const chunk = updatesToCommit.slice(i, i + batchSize);
        console.log(`- Processing batch ${i / batchSize + 1} of ${Math.ceil(updatesToCommit.length / batchSize)} (${chunk.length} items)`);

        for (const update of chunk) {
            console.log(`  - Queuing update for #${update.number} (${update.title})`);
            batch.update(update.ref, update.data);
        }

        try {
            await batch.commit();
            console.log(`  ... Batch committed successfully.`);
        } catch (error) {
            if (error.code === 'resource-exhausted') {
                console.error('\nError: Firebase quota exceeded. You have made too many writes to the database in a short period.');
                console.error('Please wait for your daily quota to reset (this can take up to 24 hours) and try running the script again.');
                console.error('If you frequently hit this limit, you may need to upgrade to a paid Firebase plan.');
            } else {
                console.error(`\nAn error occurred during a batch update:`, error);
                console.error('Some updates may not have been saved. Please try running the script again later.');
            }
            return; // Stop on error
        }
    }

    console.log(`\nSuccessfully updated ${updatesToCommit.length} songs in the database!`);
}

syncFiles();
