import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, getDoc, limit, updateDoc, deleteDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');

let currentUserData = null;

// 1. AUTH & SESSION LOGIC
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // --- FEATURE: ONLINE STATUS ---
    // Sets user to online when they load the app
    const userRef = doc(db, "users", user.uid);
    updateDoc(userRef, { status: "online", lastSeen: serverTimestamp() });

    // Handle offline status when they leave (simplified for Web)
    window.addEventListener('beforeunload', () => {
        updateDoc(userRef, { status: "offline" });
    });

    onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        if (currentUserData.isBanned) {
            alert("Account Suspended.");
            auth.signOut();
            return;
        }
        if(document.getElementById('userName')) {
            document.getElementById('userName').innerText = currentUserData.name;
            document.getElementById('userDept').innerText = `${currentUserData.dept} | ${currentUserData.level}`;
        }
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtn = document.getElementById('adminBtn');
            if(adminBtn) adminBtn.style.display = 'block';
        }
    });

    // 2. LOAD MESSAGES (WITH DELETE/EDIT POWER)
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    let q = targetUid ? 
        query(collection(db, "private_messages", [user.uid, targetUid].sort().join('_'), "messages"), orderBy("createdAt"), limit(50)) :
        query(collection(db, "messages"), orderBy("createdAt"), limit(100));

    onSnapshot(q, (snapshot) => {
        if (!msgDiv) return;
        msgDiv.innerHTML = '';
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isMe = data.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(data.email);
            const currentIsAdmin = ADMIN_EMAILS.includes(user.email);

            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // --- FEATURE: ADMIN DELETE & USER EDIT ---
            let actionIcons = '';
            if (currentIsAdmin) {
                actionIcons += `<i class="fas fa-trash delete-icon" onclick="window.deleteMsg('${targetUid}', '${msgId}')"></i>`;
            }
            if (isMe) {
                actionIcons += `<i class="fas fa-pen edit-icon" onclick="window.editMsg('${targetUid}', '${msgId}', '${data.text}')"></i>`;
            }

            msgDiv.innerHTML += `
                <div class="msg ${isMe ? 'me' : ''}" id="msg-${msgId}">
                    <span class="msg-info">
                        ${isAdmin ? '<span class="admin-badge">Admin</span> ' : ''}
                        ${data.name} ${actionIcons}
                    </span>
                    <div class="text-content">${data.text}</div>
                    ${data.fileUrl ? `<img src="${data.fileUrl}" class="chat-img" onclick="window.open('${data.fileUrl}')">` : ''}
                    <span class="msg-timestamp">${timeStr} ${data.edited ? '(edited)' : ''}</span>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // 3. LOAD SIDEBAR (ALPHABETICAL + ADMIN FIRST + ONLINE STATUS)
    if (userListDiv) {
        onSnapshot(collection(db, "users"), (snapshot) => {
            userListDiv.innerHTML = '<p class="sidebar-label">FACULTY DIRECTORY</p>';
            let usersArray = [];
            snapshot.forEach(d => usersArray.push({id: d.id, ...d.data()}));

            // --- FEATURE: ALPHABETICAL & ADMIN SORT ---
            usersArray.sort((a, b) => {
                const aAdmin = ADMIN_EMAILS.includes(a.email);
                const bAdmin = ADMIN_EMAILS.includes(b.email);
                if (aAdmin && !bAdmin) return -1;
                if (!aAdmin && bAdmin) return 1;
                return a.name.localeCompare(b.name); // A-Z sorting
            });

            usersArray.forEach(u => {
                if (u.id === user.uid) return;
                const isOnline = u.status === "online";
                const isUserAdmin = ADMIN_EMAILS.includes(u.email);
                
                userListDiv.innerHTML += `
                    <div class="user-row" onclick="location.href='private.html?uid=${u.id}'">
                        <div class="user-info">
                            <div class="name-row">
                                <span class="dot ${isOnline ? 'online' : 'offline'}"></span>
                                <span class="${isUserAdmin ? 'gold-text' : ''}">${u.name}</span>
                            </div>
                            <small>${u.dept}</small>
                        </div>
                    </div>`;
            });
        });
    }
});

// --- FEATURE: GLOBAL ACTIONS (DELETE/EDIT) ---
window.deleteMsg = async (targetUid, msgId) => {
    if(!confirm("Delete this message for everyone?")) return;
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;
    await deleteDoc(doc(db, path, msgId));
};

window.editMsg = async (targetUid, msgId, oldText) => {
    const newText = prompt("Edit your message:", oldText);
    if (!newText || newText === oldText) return;
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;
    await updateDoc(doc(db, path, msgId), { text: newText, edited: true });
};

// 4. SEND MESSAGE (UNCHANGED BUT ADDED TO GLOBAL)
window.sendMessage = async (text = "", fileData = null) => {
    if (!text && !fileData) return;
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

    const path = targetUid ? collection(db, "private_messages", [auth.currentUser.uid, targetUid].sort().join('_'), "messages") : collection(db, "messages");
    await addDoc(path, payload);
    msgInput.value = "";
};

// Event Listeners
sendBtn.onclick = () => window.sendMessage(msgInput.value.trim());
msgInput.onkeypress = (e) => { if(e.key === "Enter") window.sendMessage(msgInput.value.trim()); };
