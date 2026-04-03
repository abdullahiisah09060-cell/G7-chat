import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, getDoc, limit, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');

// --- CLOUDINARY CONFIG ---
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/liger_cloud/auto/upload"; 
const CLOUDINARY_PRESET = "ml_default"; 

let currentUserData = null;

// 1. AUTH & SESSION LOGIC
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // Real-time listener for current user data (Safety Check)
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        
        if (currentUserData.isBanned) {
            alert("You have been banned by the Admin.");
            auth.signOut();
            return;
        }

        // Update Header UI
        if(document.getElementById('userName')) {
            document.getElementById('userName').innerText = currentUserData.name;
            document.getElementById('userDept').innerText = `${currentUserData.dept} | ${currentUserData.level}`;
        }
        
        // Show Admin Button if authorized
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtn = document.getElementById('adminBtn');
            if(adminBtn) adminBtn.style.display = 'block';
        }
    });

    // 2. LOAD MESSAGES (GLOBAL OR PRIVATE)
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid'); // If this exists, we are in private.html

    let q;
    if (targetUid) {
        // Private DM Logic
        const chatId = [user.uid, targetUid].sort().join('_');
        q = query(collection(db, "private_messages", chatId, "messages"), orderBy("createdAt"), limit(50));
    } else {
        // Global Chat Logic
        q = query(collection(db, "messages"), orderBy("createdAt"), limit(100));
    }

    onSnapshot(q, (snapshot) => {
        if (!msgDiv) return;
        msgDiv.innerHTML = targetUid ? `<div style="text-align:center; color:gray; font-size:0.7rem; margin-bottom:15px;">Secure Private Session</div>` : '';
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const isMe = data.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(data.email);
            
            // Format Date & Time
            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
            const formattedDate = timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const fullStamp = `${formattedDate}, ${formattedTime}`;

            // Handle Files (Images vs Docs)
            let content = data.fileUrl ? 
                (data.fileType.includes('image') ? 
                `<img src="${data.fileUrl}" style="max-width:100%; border-radius:12px; margin-top:8px; cursor:pointer;" onclick="window.open('${data.fileUrl}')">` : 
                `<a href="${data.fileUrl}" target="_blank" class="file-link"><i class="fas fa-file-pdf"></i> View Document</a>`) 
                : `<div>${data.text}</div>`;

            msgDiv.innerHTML += `
                <div class="msg ${isMe ? 'me' : ''}">
                    <span class="msg-info">
                        ${isAdmin ? '<span class="admin-badge">Admin</span> ' : ''}
                        ${data.name} ${!targetUid ? `• <small>${data.dept}</small>` : ''}
                    </span>
                    ${content}
                    <span class="msg-timestamp">${fullStamp}</span>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // 3. LOAD SIDEBAR USER LIST (With Admin at Top)
    if (userListDiv) {
        onSnapshot(collection(db, "users"), (snapshot) => {
            userListDiv.innerHTML = '<p style="font-size:0.65rem; color:var(--primary); font-weight:bold; margin-bottom:10px; letter-spacing:1px;">STUDENTS & FACULTY</p>';
            let usersArray = [];
            snapshot.forEach(d => usersArray.push({id: d.id, ...d.data()}));

            // Sort so Admins appear first
            usersArray.sort((a, b) => (ADMIN_EMAILS.includes(b.email) ? 1 : -1));

            usersArray.forEach(u => {
                if (u.id === user.uid) return; // Skip myself
                const isOnlineAdmin = ADMIN_EMAILS.includes(u.email);
                
                userListDiv.innerHTML += `
                    <div class="user-row" onclick="location.href='private.html?uid=${u.id}'" style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px; margin-bottom:8px; cursor:pointer;">
                        <div>
                            <div style="font-size:0.85rem; font-weight:600; color:${isOnlineAdmin ? 'var(--admin-gold)' : 'white'}">
                                ${u.name} ${isOnlineAdmin ? '⭐' : ''}
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-dim)">${u.dept} | ${u.level}</div>
                        </div>
                        ${u.unreadCount > 0 ? `<span class="unread-dot">${u.unreadCount}</span>` : ''}
                    </div>`;
            });
        });
    }
});

// 4. SEND MESSAGE FUNCTION
window.sendMessage = async (text = "", fileData = null) => {
    if (!currentUserData) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');

    const payload = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        name: currentUserData.name,
        dept: currentUserData.dept,
        level: currentUserData.level,
        text: fileData ? "[File Sent]" : text,
        createdAt: serverTimestamp()
    };

    if (fileData) {
        payload.fileUrl = fileData.url;
        payload.fileType = fileData.type;
    }

    try {
        if (targetUid) {
            const chatId = [auth.currentUser.uid, targetUid].sort().join('_');
            await addDoc(collection(db, "private_messages", chatId, "messages"), payload);
        } else {
            await addDoc(collection(db, "messages"), payload);
        }
        msgInput.value = "";
    } catch (e) { console.error("Send Error:", e); }
};

// 5. CLOUDINARY UPLOADER
window.uploadFile = async (file) => {
    if (file.size > 10 * 1024 * 1024) return alert("File too big (Max 10MB)");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;

    try {
        const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
        const data = await res.json();
        if(data.secure_url) {
            await window.sendMessage("", { url: data.secure_url, type: file.type });
        }
    } catch (err) {
        alert("Upload failed. Check internet.");
    } finally {
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.disabled = false;
    }
};

// Event Listeners
if(sendBtn) sendBtn.onclick = () => window.sendMessage(msgInput.value.trim());
msgInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") window.sendMessage(msgInput.value.trim());
});
