import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const loginBtn = document.getElementById('loginBtn');

if(loginBtn) {
    loginBtn.onclick = async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                const name = prompt("Enter Full Name:");
                const dept = prompt("Department (e.g. SLT, CS):");
                const level = prompt("Level (e.g. 100, 200):");

                await setDoc(docRef, {
                    uid: user.uid,
                    name: name,
                    email: user.email,
                    dept: dept,
                    level: level,
                    status: "online"
                });
            }
            window.location.href = "chat.html";
        } catch (error) {
            console.error("Login Error:", error);
        }
    };
}
