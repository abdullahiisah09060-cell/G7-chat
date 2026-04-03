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
let pressTimer; 

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

    // --- 2. MESSAGE LISTENER ---
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
            
            // Feature 6: Local Deletion Check (Delete for Me)
            const localDeleted = localStorage.getItem(`deleted_${msgId}`);
            if (localDeleted) return;

            const isMe = data.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(user.email);

            // Feature 8: Date Separator
            const timestamp = data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date();
            const dateStr = timestamp.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
            if (dateStr !== lastDate) {
                msgDiv.innerHTML += `<div class="date-separator"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }

            const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Feature 1 & 5: Global Deletion Logic
            let contentHtml = "";
            if (data.isDeleted) {
                const label = data.deletedByAdmin ? "Message deleted by Admin" : "This message was deleted";
                contentHtml = `<div class="text-content" style="font-style:italic; opacity:0.6;">🚫 ${label}</div>`;
            } else {
                contentHtml = `
                    ${data.replyTo ? `<div class="reply-content" onclick="document.getElementById('cont-${data.replyTo.id}').scrollIntoView({behavior:'smooth'})"><b>${data.replyTo.name}:</b> ${data.replyTo.text}</div>` : ''}
                    <div class="text-content">${data.text}</div>
                    ${data.fileUrl ? `<img src="${data.fileUrl}" class="chat-img" onclick="window.open('${data.fileUrl}')">` : ''}
                `;
            }

            // Feature 2: Reactions
            let reactHtml = "";
            if (data.reactions) {
                const emojis = Object.keys(data.reactions).join(' ');
                reactHtml = `<div class="reaction-tag">${emojis}</div>`;
            }

            msgDiv.innerHTML += `
                <div class="msg-container" id="cont-${msgId}" 
                     ontouchstart="window.handleTouchStart(event, '${msgId}', \`${data.text}\`, '${data.name}')" 
                     ontouchend="window.handleTouchEnd(event, '${msgId}', \`${data.text}\`, '${name}')">
                    <div class="msg ${isMe ? 'me' : ''} ${data.isDeleted ? 'deleted' : ''}">
                        <span class="msg-info">${data.name} ${isMe && !data.isDeleted ? `<i class="fas fa-pen edit-icon" onclick="window.editMsg('${path}','${msgId}', \`${data.text}\`)"></i>` : ''}</span>
                        ${contentHtml}
                        ${reactHtml}
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                            <span class="msg-timestamp">${timeStr}</span>
                            <div class="msg-actions">
                                ${(isMe || isAdmin) && !data.isDeleted ? `<i class="fas fa-trash-alt" title="Delete for Everyone" onclick="window.deleteMsg('${path}', '${msgId}', ${isAdmin && !isMe})"></i>` : ''}
                                <i class="fas fa-eye-slash" title="Delete for Me" onclick="window.deleteForMe('${msgId}')"></i>
                                <i class="fas fa-share" title="Forward" onclick="window.forwardMsg(\`${data.text}\`)"></i>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
});

// --- 3. WHATSAPP FEATURES ---

// Feature 3: Swipe to Reply
let startX = 0;
window.handleTouchStart = (e) => { startX = e.touches[0].clientX; };
window.handleTouchEnd = (e, id, text, name) => {
    let endX = e.changedTouches[0].clientX;
    if (startX - endX > 80) { // Swipe Left
        window.setReply(id, text, name);
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

// Feature 2: Long Press Reactions
window.handleLongPressStart = (path, msgId) => {
    pressTimer = setTimeout(() => {
        const emoji = prompt("React: 👍, ❤️, 😂, 🔥, 😮, 😢");
        if (emoji) {
            const ref = doc(db, path, msgId);
            updateDoc(ref, { [`reactions.${emoji}`]: true });
        }
    }, 600);
};

// Feature 4: Forwarding
window.forwardMsg = (text) => {
    const confirmFwd = confirm("Forward this message to Global Hub?");
    if(confirmFwd) window.sendMessage(`[Forwarded]: ${text}`);
};

// Feature 6: Delete for Me (Local Only)
window.deleteForMe = (msgId) => {
    if(confirm("Remove this message from your view?")) {
        localStorage.setItem(`deleted_${msgId}`, "true");
        location.reload(); // Refresh to hide
    }
};

window.deleteMsg = async (path, msgId, isAdmin) => {
    if (!confirm("Delete for everyone?")) return;
    await updateDoc(doc(db, path, msgId), {
        isDeleted: true,
        deletedByAdmin: isAdmin,
        text: "deleted",
        fileUrl: null
    });
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
