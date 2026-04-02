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
            const userDoc = await getDoc(doc(db, "users", result.user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.isBanned) {
                    alert("🚫 Access Denied: Your account has been suspended.");
                    await auth.signOut();
                    location.reload();
                } else {
                    window.location.href = "chat.html";
                }
            } else {
                // First time user
                window.location.href = "setup.html";
            }
        } catch (error) {
            console.error("Login Failed", error);
            alert("Login failed. Check your connection.");
            loginBtn.disabled = false;
            loginBtn.innerHTML = "Sign in with Google";
        }
    };
}
