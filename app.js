import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // 1. Load Personal Profile Info into Sidebar
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
        const userData = userDoc.data();
        document.getElementById('userName').innerText = userData.name;
        document.getElementById('userDept').innerText = `${userData.dept} | ${userData.level}`;
        
        // Check for Admin Access (for all 3 admins)
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtn = document.getElementById('adminBtn');
            if(adminBtn) adminBtn.style.display = 'block';
        }
    }

    // 2. Load Group Messages
    const qMessages = query(collection(db, "messages"), orderBy("createdAt"), limit(100));
    onSnapshot(qMessages, (snapshot) => {
        msgDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const isMe = data.uid === user.uid;
            msgDiv.innerHTML += `
                <div class="msg ${isMe ? 'me' : ''}">
                    <span class="msg-info">${data.name} (${data.dept})</span>
                    <div>${data.text}</div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // 3. Load Users for Private Chat (Sidebar)
    const qUsers = query(collection(db, "users"), limit(50));
    onSnapshot(qUsers, (snapshot) => {
        userListDiv.innerHTML = '';
        snapshot.forEach(docSnap => {
            const userData = docSnap.data();
            // Don't show yourself in the DM list
            if (docSnap.id !== user.uid) {
                userListDiv.innerHTML += `
                    <div class="user-row" onclick="location.href='private.html?uid=${docSnap.id}'" 
                         style="cursor:pointer; padding:10px; border-radius:8px; margin-bottom:5px; background: rgba(255,255,255,0.05);">
                        <div style="font-size:0.85rem; font-weight:600;">${userData.name}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim);">${userData.dept}</div>
                    </div>`;
            }
        });
    });
});

// 4. Send Message Logic
sendBtn.onclick = async () => {
    const text = msgInput.value.trim();
    if (text === "" || !auth.currentUser) return;

    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userDoc.data();

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            uid: auth.currentUser.uid,
            name: userData.name,
            dept: userData.dept,
            level: userData.level,
            createdAt: serverTimestamp()
        });
        msgInput.value = "";
    } catch (e) {
        console.error("Error sending message: ", e);
    }
};

// Allow "Enter" key on phone keyboards
msgInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendBtn.click();
});
