
const admin = require('firebase-admin');
const serviceAccount = require('./babb-9779f-firebase-adminsdk-fbsvc-7e56b3262e.json');
const data = require('./merged-data.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://babb-9779f.firebaseio.com'
});

const db = admin.firestore();
const collectionRef = db.collection('songs');

async function uploadData() {
  for (const item of data) {
    try {
      await collectionRef.add(item);
      console.log(`Added: ${item.Title}`);
    } catch (error) {
      console.error(`Error adding ${item.Title}:`, error);
    }
  }
  console.log('Upload complete!');
}

uploadData();
