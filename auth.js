import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const loginBtn = document.getElementById('loginBtn');

if(loginBtn) {
    loginBtn.onclick = async () => {
        try {
            loginBtn.disabled = true;
            loginBtn.innerHTML = "Authenticating...";
            
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // Check if user exists in our Firestore "users" collection
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.isBanned) {
                    alert("🚨 ACCESS DENIED: Your account is suspended.");
                    await auth.signOut();
                    location.reload();
                } else {
                    // User exists and is not banned
                    window.location.href = "chat.html";
                }
            } else {
                // New user - send to setup profile
                window.location.href = "setup.html";
            }
        } catch (error) {
            console.error("Login Error:", error);
            alert("Connection failed. Please try again.");
            loginBtn.disabled = false;
            loginBtn.innerHTML = "Sign in with Google";
        }
    };
}
