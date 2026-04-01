import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');

// CLOUDINARY CONFIG
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/YOUR_CLOUDINARY_NAME/auto/upload";
const CLOUDINARY_PRESET = "ml_default"; 

let currentUserData = null;

// 1. Handle Auth & Profile
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
        currentUserData = userDoc.data();
        document.getElementById('userName').innerText = currentUserData.name;
        document.getElementById('userDept').innerText = `${currentUserData.dept} | ${currentUserData.level}`;
        
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtn = document.getElementById('adminBtn');
            if(adminBtn) adminBtn.style.display = 'block';
        }
        
        // Request Notification Permission
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    }

    // 2. Load Group Messages (Now showing Dept & Level)
    const qMessages = query(collection(db, "messages"), orderBy("createdAt"), limit(100));
    onSnapshot(qMessages, (snapshot) => {
        msgDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const isMe = data.uid === user.uid;
            
            // Check if message is a file/image
            let content = data.fileUrl ? 
                (data.fileType.includes('image') ? `<img src="${data.fileUrl}" class="chat-img" onclick="window.open('${data.fileUrl}')">` : 
                `<a href="${data.fileUrl}" target="_blank" class="file-link"><i class="fas fa-file"></i> View Document</a>`) 
                : `<div>${data.text}</div>`;

            msgDiv.innerHTML += `
                <div class="msg ${isMe ? 'me' : ''}">
                    <span class="msg-info">${data.name} • ${data.dept} (${data.level})</span>
                    ${content}
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
        
        // Simple Notification if tab is hidden
        if (document.hidden && snapshot.docChanges().some(c => c.type === "added")) {
            new Notification("G7 Hitech Hub", { body: "New message in group chat!" });
        }
    });

    // 3. Load Users for Sidebar
    const qUsers = query(collection(db, "users"), limit(50));
    onSnapshot(qUsers, (snapshot) => {
        userListDiv.innerHTML = '';
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            if (docSnap.id !== user.uid) {
                userListDiv.innerHTML += `
                    <div class="user-row" onclick="location.href='private.html?uid=${docSnap.id}'">
                        <div style="font-size:0.85rem; font-weight:600;">${u.name}</div>
                        <div style="font-size:0.65rem; color:var(--text-dim);">${u.dept} | ${u.level}</div>
                    </div>`;
            }
        });
    });
});

// 4. Send Message Logic (Supports Files)
async function sendMessage(text = "", fileData = null) {
    if (!currentUserData) return;

    const payload = {
        uid: auth.currentUser.uid,
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
        if (text === "") return;
        payload.text = text;
    }

    await addDoc(collection(db, "messages"), payload);
    msgInput.value = "";
}

sendBtn.onclick = () => sendMessage(msgInput.value.trim());

// 5. THE ENTER KEY FIX
// On Mobile: Enter sends. Shift+Enter creates new line.
msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // Stop new line
        sendMessage(msgInput.value.trim());
    }
});

// 6. File Upload Function (Cloudinary)
window.uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;

    try {
        const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
        const data = await res.json();
        await sendMessage("", { url: data.secure_url, type: file.type });
    } catch (err) {
        alert("Upload failed. Check internet.");
    } finally {
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.disabled = false;
    }
};
