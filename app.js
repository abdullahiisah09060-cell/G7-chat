import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');

// --- CLOUDINARY CONFIG (REPLACE 'liger_cloud' with your real cloud name) ---
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/liger_cloud/auto/upload"; 
const CLOUDINARY_PRESET = "ml_default"; 

let currentUserData = null;

// 1. Auth & Real-time Security Check
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // Listen to user's own document for instant banning
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists() && snap.data().isBanned) {
            alert("Your account was just banned!");
            auth.signOut();
        }
        currentUserData = snap.data();
        if(document.getElementById('userName')) {
            document.getElementById('userName').innerText = currentUserData.name;
        }
    });

    // 2. Load Global Messages
    const qMessages = query(collection(db, "messages"), orderBy("createdAt"), limit(100));
    onSnapshot(qMessages, (snapshot) => {
        msgDiv.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const isMe = data.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(data.email);
            
            // Format Time
            const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "...";

            let content = data.fileUrl ? 
                (data.fileType.includes('image') ? `<img src="${data.fileUrl}" style="max-width:100%; border-radius:10px; margin-top:5px;" onclick="window.open('${data.fileUrl}')">` : 
                `<a href="${data.fileUrl}" target="_blank" class="file-link"><i class="fas fa-file-pdf"></i> View Attachment</a>`) 
                : `<div>${data.text}</div>`;

            msgDiv.innerHTML += `
                <div class="msg ${isMe ? 'me' : ''}">
                    <span class="msg-info">
                        ${isAdmin ? '<span class="admin-badge">Admin</span> ' : ''}
                        ${data.name} • <span style="font-size:0.6rem; opacity:0.8;">${data.dept}</span>
                    </span>
                    ${content}
                    <span class="msg-time">${time}</span>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // 3. Load Users for DM List
    onSnapshot(collection(db, "users"), (snapshot) => {
        if(!userListDiv) return;
        userListDiv.innerHTML = '<p style="font-size:0.7rem; color:var(--primary); margin:10px 0;">DIRECT MESSAGES</p>';
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            if (docSnap.id !== user.uid) {
                userListDiv.innerHTML += `
                    <div class="user-row" onclick="location.href='private.html?uid=${docSnap.id}'" style="padding:12px; background:rgba(255,255,255,0.05); border-radius:10px; margin-bottom:8px; cursor:pointer;">
                        <div style="font-size:0.9rem; font-weight:600;">${u.name} ${ADMIN_EMAILS.includes(u.email) ? '⭐' : ''}</div>
                        <div style="font-size:0.7rem; color:var(--text-dim);">${u.dept} | ${u.level}</div>
                    </div>`;
            }
        });
    });
});

// 4. Send Message Logic
window.sendMessage = async (text = "", fileData = null) => {
    if (!currentUserData || (text === "" && !fileData)) return;

    const payload = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        name: currentUserData.name,
        dept: currentUserData.dept,
        level: currentUserData.level,
        createdAt: serverTimestamp()
    };

    if (fileData) {
        payload.fileUrl = fileData.url;
        payload.fileType = fileData.type;
        payload.text = "[File Sent]";
    } else {
        payload.text = text;
    }

    try {
        await addDoc(collection(db, "messages"), payload);
        msgInput.value = "";
    } catch (e) { console.error(e); }
};

if(sendBtn) {
    sendBtn.onclick = () => window.sendMessage(msgInput.value.trim());
}

// 5. Cloudinary Upload Logic
window.uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    const originalBtn = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    sendBtn.disabled = true;

    try {
        const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
        const data = await res.json();
        if(data.secure_url) {
            await window.sendMessage("", { url: data.secure_url, type: file.type });
        }
    } catch (err) {
        alert("Upload Error. Check internet.");
    } finally {
        sendBtn.innerHTML = originalBtn;
        sendBtn.disabled = false;
    }
};

// Enter key to send
msgInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") window.sendMessage(msgInput.value.trim());
});
