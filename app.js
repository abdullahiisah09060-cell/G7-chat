import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, updateDoc, deleteDoc, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');

let currentUserData = null;

// --- 1. AUTH & PRESENCE ENGINE ---
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const userRef = doc(db, "users", user.uid);

    // Set Online Status
    updateDoc(userRef, { status: "online", lastSeen: serverTimestamp() });

    // Handle Tab Close/Disconnect
    window.addEventListener('beforeunload', () => {
        updateDoc(userRef, { status: "offline" });
    });

    // Real-time listener for current user profile
    onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        
        if (currentUserData.isBanned) {
            alert("Your account has been suspended.");
            auth.signOut();
            return;
        }

        // Update UI Header
        if(document.getElementById('userName')) {
            document.getElementById('userName').innerText = currentUserData.name;
            document.getElementById('userDept').innerText = `${currentUserData.dept} | ${currentUserData.level}`;
        }
        
        // Admin Button Visibility
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtn = document.getElementById('adminBtn');
            if(adminBtn) adminBtn.style.display = 'block';
        }
    });

    // --- 2. MESSAGE LISTENER (GLOBAL & PRIVATE) ---
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');

    let q;
    if (targetUid) {
        const chatId = [user.uid, targetUid].sort().join('_');
        q = query(collection(db, "private_messages", chatId, "messages"), orderBy("createdAt"), limit(100));
    } else {
        q = query(collection(db, "messages"), orderBy("createdAt"), limit(100));
    }

    onSnapshot(q, (snapshot) => {
        if (!msgDiv) return;
        msgDiv.innerHTML = '';
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isMe = data.uid === user.uid;
            const msgIsAdmin = ADMIN_EMAILS.includes(data.email);
            const viewerIsAdmin = ADMIN_EMAILS.includes(user.email);

            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Action Icons (Trash for Admins, Pen for Owners)
            let actions = '';
            if (viewerIsAdmin) {
                actions += `<i class="fas fa-trash delete-icon" onclick="window.deleteMsg('${targetUid || ''}', '${msgId}')"></i>`;
            }
            if (isMe) {
                actions += `<i class="fas fa-pen edit-icon" onclick="window.editMsg('${targetUid || ''}', '${msgId}', \`${data.text}\`)"></i>`;
            }

            // Notification Trigger (if tab is hidden)
            if (document.hidden && !isMe) {
                window.showNotification(data.name, data.text);
            }

            msgDiv.innerHTML += `
                <div class="msg ${isMe ? 'me' : ''}">
                    <span class="msg-info">
                        ${msgIsAdmin ? '<span class="admin-badge">Admin</span> ' : ''}
                        ${data.name} ${actions}
                    </span>
                    <div class="text-content">${data.text}</div>
                    ${data.fileUrl ? `<img src="${data.fileUrl}" class="chat-img" onclick="window.open('${data.fileUrl}')">` : ''}
                    <span class="msg-timestamp">${timeStr} ${data.edited ? '(edited)' : ''}</span>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // --- 3. SIDEBAR (ALPHABETICAL & STATUS) ---
    if (userListDiv) {
        onSnapshot(collection(db, "users"), (snapshot) => {
            userListDiv.innerHTML = '<p style="font-size:0.6rem; color:var(--primary); font-weight:700; padding:10px;">G7 DIRECTORY</p>';
            let usersArray = [];
            snapshot.forEach(d => usersArray.push({id: d.id, ...d.data()}));

            // Sort: Admins first, then Alphabetical A-Z
            usersArray.sort((a, b) => {
                const aAdmin = ADMIN_EMAILS.includes(a.email);
                const bAdmin = ADMIN_EMAILS.includes(b.email);
                if (aAdmin && !bAdmin) return -1;
                if (!aAdmin && bAdmin) return 1;
                return a.name.localeCompare(b.name);
            });

            usersArray.forEach(u => {
                if (u.id === user.uid) return;
                const isOnline = u.status === "online";
                const isUserAdmin = ADMIN_EMAILS.includes(u.email);
                
                userListDiv.innerHTML += `
                    <div class="user-row" onclick="location.href='private.html?uid=${u.id}'" style="display:flex; align-items:center; padding:12px; cursor:pointer; gap:10px;">
                        <span class="dot ${isOnline ? 'online' : 'offline'}"></span>
                        <div>
                            <div style="font-size:0.85rem; font-weight:600; color:${isUserAdmin ? 'var(--admin-gold)' : 'white'}">
                                ${u.name} ${isUserAdmin ? '⭐' : ''}
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-dim)">${u.dept}</div>
                        </div>
                    </div>`;
            });
        });
    }
});

// --- 4. GLOBAL FUNCTIONS (DELETE / EDIT / SEND) ---

window.deleteMsg = async (targetUid, msgId) => {
    if(!confirm("Permanently delete this message?")) return;
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;
    await deleteDoc(doc(db, path, msgId));
};

window.editMsg = async (targetUid, msgId, oldText) => {
    const newText = prompt("Edit your message:", oldText);
    if (!newText || newText === oldText) return;
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;
    await updateDoc(doc(db, path, msgId), { text: newText, edited: true });
};

window.sendMessage = async (text = "", fileData = null) => {
    if (!text && !fileData) return;
    if (!currentUserData) return;

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');

    const payload = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        name: currentUserData.name,
        dept: currentUserData.dept,
        text: text,
        createdAt: serverTimestamp()
    };
    if (fileData) { payload.fileUrl = fileData.url; payload.fileType = fileData.type; }

    const colRef = targetUid ? 
        collection(db, "private_messages", [auth.currentUser.uid, targetUid].sort().join('_'), "messages") : 
        collection(db, "messages");

    await addDoc(colRef, payload);
    msgInput.value = "";
};

// --- 5. NOTIFICATIONS ---
if (Notification.permission !== "granted") Notification.requestPermission();

window.showNotification = (sender, text) => {
    if (Notification.permission === "granted") {
        new Notification(`New Message from ${sender}`, { body: text });
    }
};

// Listeners
sendBtn.onclick = () => window.sendMessage(msgInput.value.trim());
msgInput.onkeypress = (e) => { if(e.key === "Enter") window.sendMessage(msgInput.value.trim()); };
