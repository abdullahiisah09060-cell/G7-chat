import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, updateDoc, deleteDoc, limit, getDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');
const replyPreview = document.getElementById('replyPreview');
const replyText = document.getElementById('replyText');

let currentUserData = null;
let replyingTo = null; // Store message being replied to

// --- 1. AUTH & PRESENCE ---
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    const userRef = doc(db, "users", user.uid);
    updateDoc(userRef, { status: "online", lastSeen: serverTimestamp() });

    window.addEventListener('beforeunload', () => { updateDoc(userRef, { status: "offline" }); });

    onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        if (currentUserData.isBanned) { alert("Account Suspended."); auth.signOut(); return; }
        if(document.getElementById('userName')) {
            document.getElementById('userName').innerText = currentUserData.name;
            document.getElementById('userDept').innerText = `${currentUserData.dept} | ${currentUserData.level}`;
        }
        if (ADMIN_EMAILS.includes(user.email)) {
            const adminBtn = document.getElementById('adminBtn');
            if(adminBtn) adminBtn.style.display = 'block';
        }
    });

    // --- 2. MESSAGE LISTENER (WITH REPLIES & REACTIONS) ---
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;
    const q = query(collection(db, path), orderBy("createdAt"), limit(100));

    onSnapshot(q, (snapshot) => {
        if (!msgDiv) return;
        msgDiv.innerHTML = '';
        let lastDateLabel = "";

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isMe = data.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(user.email);

            // Date & Day Logic
            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
            const dateLabel = timestamp.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
            if (dateLabel !== lastDateLabel) {
                msgDiv.innerHTML += `<div class="date-separator"><span>${dateLabel}</span></div>`;
                lastDateLabel = dateLabel;
            }

            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Deleted Content Logic
            let contentHtml = '';
            if (data.isDeleted) {
                const label = data.deletedByAdmin ? "Deleted by Admin" : "You deleted this message";
                contentHtml = `<div class="text-content"><i>🚫 ${label}</i></div>`;
            } else {
                contentHtml = `
                    ${data.replyTo ? `<div class="reply-content"><b>${data.replyTo.name}:</b> ${data.replyTo.text}</div>` : ''}
                    <div class="text-content">${data.text}</div>
                    ${data.fileUrl ? `<img src="${data.fileUrl}" class="chat-img" onclick="window.open('${data.fileUrl}')">` : ''}
                `;
            }

            // Reactions UI
            let reactionHtml = '';
            if (data.reactions && Object.keys(data.reactions).length > 0) {
                reactionHtml = `<div class="reaction-tag">${Object.keys(data.reactions).join(' ')}</div>`;
            }

            // Message Actions
            let actionIcons = `<i class="fas fa-reply" onclick="window.setReply('${msgId}', \`${data.text}\`, '${data.name}')"></i> `;
            if (!data.isDeleted) {
                if (isMe || isAdmin) {
                    actionIcons += `<i class="fas fa-trash" onclick="window.deleteMsg('${path}', '${msgId}', ${isAdmin && !isMe})"></i> `;
                }
                actionIcons += `<i class="far fa-smile" onclick="window.reactMsg('${path}', '${msgId}')"></i> `;
            }

            msgDiv.innerHTML += `
                <div class="msg-container" id="cont-${msgId}">
                    <div class="msg ${isMe ? 'me' : ''} ${data.isDeleted ? 'deleted' : ''}">
                        <span class="msg-info">${data.name} <span class="action-tray">${actionIcons}</span></span>
                        ${contentHtml}
                        ${reactionHtml}
                        <span class="msg-timestamp">${timeStr} ${data.edited ? '(edited)' : ''}</span>
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
});

// --- 3. CORE FUNCTIONS ---

window.setReply = (id, text, name) => {
    replyingTo = { id, text, name };
    replyText.innerText = `Replying to ${name}: ${text.substring(0, 30)}...`;
    replyPreview.style.display = 'flex';
    msgInput.focus();
};

window.cancelReply = () => {
    replyingTo = null;
    replyPreview.style.display = 'none';
};

window.deleteMsg = async (path, msgId, byAdmin) => {
    if (!confirm("Delete this message?")) return;
    await updateDoc(doc(db, path, msgId), {
        isDeleted: true,
        deletedByAdmin: byAdmin,
        text: "deleted",
        fileUrl: null,
        replyTo: null
    });
};

window.reactMsg = async (path, msgId) => {
    const emoji = prompt("React with an emoji (👍, ❤️, 😂, 🔥):");
    if (!emoji) return;
    const msgRef = doc(db, path, msgId);
    await updateDoc(msgRef, { [`reactions.${emoji}`]: true });
};

window.sendMessage = async (text = "", fileData = null) => {
    if (!text && !fileData) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;

    const payload = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        name: currentUserData.name,
        text: text,
        createdAt: serverTimestamp(),
        replyTo: replyingTo
    };
    if (fileData) { payload.fileUrl = fileData.url; payload.fileType = fileData.type; }

    await addDoc(collection(db, path), payload);
    window.cancelReply();
    msgInput.value = "";
};

// Listeners
sendBtn.onclick = () => window.sendMessage(msgInput.value.trim());
msgInput.onkeypress = (e) => { if(e.key === "Enter") window.sendMessage(msgInput.value.trim()); };
