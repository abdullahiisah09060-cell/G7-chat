import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const loginBtn = document.getElementById('loginBtn');

if(loginBtn) {
    loginBtn.onclick = async () => {
        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, "users", result.user.uid));
        
        if (userDoc.exists()) {
            if (userDoc.data().isBanned) {
                alert("Account Banned!");
                auth.signOut();
            } else {
                window.location.href = "chat.html";
            }
        } else {
            window.location.href = "setup.html";
        }
    };
}