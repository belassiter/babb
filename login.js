import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

const auth = getAuth();
const provider = new GoogleAuthProvider();

// --- IMPORTANT ---
// Add the email addresses of authorized admins here
const authorizedAdmins = [
    'belassiter@gmail.com', // Replace with your authorized Google account(s)
];

document.getElementById('google-login-btn').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            // This gives you a Google Access Token. You can use it to access the Google API.
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential.accessToken;
            // The signed-in user info.
            const user = result.user;

            // Check if the signed-in user's email is in the authorized list
            if (authorizedAdmins.includes(user.email)) {
                // User is authorized, redirect to admin page
                window.location.href = 'admin.html';
            } else {
                // User is not authorized, sign them out and show an error
                signOut(auth).then(() => {
                    alert('This Google account is not authorized for admin access.');
                }).catch((error) => {
                    console.error('Sign out error', error);
                });
            }
        }).catch((error) => {
            // Handle Errors here.
            const errorCode = error.code;
            const errorMessage = error.message;
            // The email of the user's account used.
            const email = error.customData.email;
            // The AuthCredential type that was used.
            const credential = GoogleAuthProvider.credentialFromError(error);
            
            console.error(`Login Error (${errorCode}): ${errorMessage}`);
            alert(`Could not log in. Please try again. Error: ${errorMessage}`);
        });
});