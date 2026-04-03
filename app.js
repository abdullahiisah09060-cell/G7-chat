import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, updateDoc, deleteDoc, limit, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');
const replyPreview = document.getElementById('replyPreview');

let currentUserData = null;
let replyingTo = null;
let pressTimer; // For Long Press

// --- 1. AUTH & PRESENCE ---
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    const userRef = doc(db, "users", user.uid);
    updateDoc(userRef, { status: "online", lastSeen: serverTimestamp() });

    window.addEventListener('beforeunload', () => { updateDoc(userRef, { status: "offline" }); });

    onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        if (currentUserData.isBanned) { alert("Banned."); auth.signOut(); return; }
        
        if(document.getElementById('userName')) {
            document.getElementById('userName').innerText = currentUserData.name;
            document.getElementById('userDept').innerText = `${currentUserData.dept} | ${currentUserData.level}`;
        }
        if (ADMIN_EMAILS.includes(user.email)) {
            if(document.getElementById('adminBtn')) document.getElementById('adminBtn').style.display = 'block';
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
        let lastDate = "";

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const msgId = docSnap.id;
            const isMe = data.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(user.email);

            // Date Separator Logic
            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
            const dateStr = timestamp.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
            if (dateStr !== lastDate) {
                msgDiv.innerHTML += `<div class="date-separator"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }

            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Deletion & Content Logic
            let contentHtml = "";
            if (data.isDeleted) {
                const label = data.deletedByAdmin ? "Message deleted by Admin" : "This message was deleted";
                contentHtml = `<div class="text-content" style="font-style:italic; opacity:0.6;">🚫 ${label}</div>`;
            } else {
                contentHtml = `
                    ${data.replyTo ? `<div class="reply-content"><b>${data.replyTo.name}:</b> ${data.replyTo.text}</div>` : ''}
                    <div class="text-content">${data.text}</div>
                    ${data.fileUrl ? `<img src="${data.fileUrl}" class="chat-img" onclick="window.open('${data.fileUrl}')">` : ''}
                `;
            }

            // Reactions UI
            let reactHtml = "";
            if (data.reactions) {
                const emojis = Object.keys(data.reactions).join(' ');
                reactHtml = `<div class="reaction-tag">${emojis}</div>`;
            }

            msgDiv.innerHTML += `
                <div class="msg-container" id="cont-${msgId}" 
                     ontouchstart="window.handleTouchStart(event, '${msgId}', \`${data.text}\`, '${data.name}')" 
                     ontouchend="window.handleTouchEnd()"
                     onmousedown="window.handleLongPressStart('${path}', '${msgId}')" 
                     onmouseup="window.handleLongPressEnd()">
                    <div class="msg ${isMe ? 'me' : ''} ${data.isDeleted ? 'deleted' : ''}">
                        <span class="msg-info">${data.name} ${isMe && !data.isDeleted ? `<i class="fas fa-pen edit-icon" onclick="window.editMsg('${path}','${msgId}', \`${data.text}\`)"></i>` : ''}</span>
                        ${contentHtml}
                        ${reactHtml}
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="msg-timestamp">${timeStr}</span>
                            ${(isMe || isAdmin) && !data.isDeleted ? `<i class="fas fa-trash" style="font-size:0.7rem; opacity:0.5; cursor:pointer;" onclick="window.deleteMsg('${path}', '${msgId}', ${isAdmin && !isMe})"></i>` : ''}
                        </div>
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
});

// --- 3. WHATSAPP FEATURES LOGIC ---

// Swipe to Reply
let startX = 0;
window.handleTouchStart = (e, id, text, name) => {
    startX = e.touches[0].clientX;
    // Long press detection for mobile
    pressTimer = setTimeout(() => window.reactMsg(id), 600);
};

window.handleTouchEnd = (e) => {
    clearTimeout(pressTimer);
    let endX = event.changedTouches[0].clientX;
    if (startX - endX > 100) { // Swipe Left
        // Trigger Reply
        console.log("Swiped Left");
    }
};

window.setReply = (id, text, name) => {
    replyingTo = { id, text, name };
    document.getElementById('replyName').innerText = name;
    document.getElementById('replyText').innerText = text;
    replyPreview.style.display = 'flex';
    msgInput.focus();
};

window.cancelReply = () => {
    replyingTo = null;
    replyPreview.style.display = 'none';
};

// Long Press for Emoji Reactions
window.handleLongPressStart = (path, msgId) => {
    pressTimer = setTimeout(() => {
        const emoji = prompt("React: 👍, ❤️, 😂, 🔥, 😮, 😢");
        if (emoji) {
            const ref = doc(db, path, msgId);
            updateDoc(ref, { [`reactions.${emoji}`]: true });
        }
    }, 600);
};
window.handleLongPressEnd = () => clearTimeout(pressTimer);

// Deletion Logic
window.deleteMsg = async (path, msgId, isAdmin) => {
    if (!confirm("Delete this message?")) return;
    await updateDoc(doc(db, path, msgId), {
        isDeleted: true,
        deletedByAdmin: isAdmin,
        text: "deleted",
        fileUrl: null
    });
};

// Global Functions
window.editMsg = async (path, msgId, oldText) => {
    const newText = prompt("Edit message:", oldText);
    if (newText && newText !== oldText) await updateDoc(doc(db, path, msgId), { text: newText, edited: true });
};

window.sendMessage = async (text = "") => {
    if (!text && !replyingTo) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;

    await addDoc(collection(db, path), {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        name: currentUserData.name,
        text: text,
        createdAt: serverTimestamp(),
        replyTo: replyingTo
    });
    window.cancelReply();
    msgInput.value = "";
};

sendBtn.onclick = () => window.sendMessage(msgInput.value.trim());
msgInput.onkeypress = (e) => { if(e.key === "Enter") window.sendMessage(msgInput.value.trim()); };
