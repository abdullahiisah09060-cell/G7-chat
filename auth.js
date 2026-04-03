import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const loginBtn = document.getElementById('loginBtn');

if(loginBtn) {
    loginBtn.onclick = async () => {
        try {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
            
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // Check if user exists in Firestore
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // 1. BAN CHECK
                if (userData.isBanned) {
                    alert("🚨 ACCESS DENIED: This account has been suspended by Faculty Admin.");
                    await auth.signOut();
                    location.reload();
                    return;
                }

                // 2. UPDATE STATUS & SESSION
                // We set them to online immediately upon login
                await updateDoc(userDocRef, {
                    status: "online",
                    lastLogin: serverTimestamp(),
                    // Request notification permission if supported
                    notificationStatus: Notification.permission 
                });

                window.location.href = "chat.html";
            } else {
                // New user - send to setup profile (don't set online yet)
                window.location.href = "setup.html";
            }
        } catch (error) {
            console.error("Login Error:", error);
            alert("Google Authentication failed. Please check your connection.");
            loginBtn.disabled = false;
            loginBtn.innerHTML = "Sign in with Google";
        }
    };
}
