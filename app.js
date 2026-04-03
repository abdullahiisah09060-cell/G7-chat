import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userListDiv = document.getElementById('userList');
const side = document.getElementById('sidebar'), over = document.getElementById('overlay');

let currentUserData = null;
let replyingTo = null;
let startX = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }

    const uRef = doc(db, "users", user.uid);
    const uSnap = await getDoc(uRef);
    currentUserData = uSnap.data();

    if(currentUserData?.isBanned) { alert("Your account is banned."); auth.signOut(); return; }
    if(document.getElementById('userName')) document.getElementById('userName').innerText = currentUserData.name;

    // --- USER LIST & BANNING LOGIC ---
    onSnapshot(collection(db, "users"), (snap) => {
        if(!userListDiv) return;
        userListDiv.innerHTML = '';
        snap.forEach(uDoc => {
            const u = uDoc.data();
            const isAdmin = ADMIN_EMAILS.includes(auth.currentUser.email);
            if(u.uid === user.uid) return;
            
            userListDiv.innerHTML += `
                <div class="user-item" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid #2a3942">
                    <div onclick="location.href='private.html?uid=${u.uid}'" style="cursor:pointer">
                        <span style="display:block; font-size:0.9rem; font-weight:bold;">${u.name}</span>
                        <span style="font-size:0.7rem; color:#8696a0">${u.dept} | ${u.level}</span>
                    </div>
                    ${isAdmin ? `<button class="btn-ban" onclick="window.toggleBan('${u.uid}', ${u.isBanned || false})">${u.isBanned ? 'UNBAN' : 'BAN'}</button>` : ''}
                </div>`;
        });
    });

    // --- MESSAGE LISTENER (SPEED OPTIMIZED) ---
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    // Limit to 50 for speed, removed complex filters
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(50));
    
    onSnapshot(q, (snapshot) => {
        msgDiv.innerHTML = '';
        const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isMsgAdmin = ADMIN_EMAILS.includes(m.email);

            msgDiv.innerHTML += `
                <div class="msg-container" oncontextmenu="window.showEmojis(event, '${m.id}')">
                    <div class="reaction-bar" id="react-${m.id}">
                        <span onclick="window.react('${m.id}', '👍', '${path}')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️', '${path}')">❤️</span>
                        <span onclick="window.react('${m.id}', '😂', '${path}')">😂</span>
                        <span onclick="window.react('${m.id}', '🔥', '${path}')">🔥</span>
                    </div>
                    <div class="msg ${isMe ? 'me' : 'them'}">
                        <span class="sender-name ${isMsgAdmin ? 'admin-name' : ''}">${m.name} ${isMsgAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</span>
                        <span class="sender-dept">${m.dept} | ${m.level}</span>
                        ${m.replyTo ? `<div style="background:rgba(0,0,0,0.1); border-left:3px solid gold; padding:5px; margin-bottom:5px; font-size:0.7rem;">${m.replyTo.text}</div>` : ''}
                        <div>${m.text}</div>
                        ${m.reaction ? `<div class="reaction-tag" style="position:absolute; bottom:-8px; right:5px; background:#233138; padding:2px 5px; border-radius:10px; font-size:0.7rem;">${m.reaction}</div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
        if(document.getElementById('onlineCount')) document.getElementById('onlineCount').innerText = "● SYSTEM ACTIVE";
    });
});

// --- CORE UTILITIES ---
window.toggleBan = async (uid, currentStatus) => {
    if(!confirm(`Are you sure you want to ${currentStatus ? 'Unban' : 'Ban'} this user?`)) return;
    await updateDoc(doc(db, "users", uid), { isBanned: !currentStatus });
    alert("User status updated.");
};

window.showEmojis = (e, id) => {
    e.preventDefault();
    document.querySelectorAll('.reaction-bar').forEach(b => b.classList.remove('active'));
    document.getElementById(`react-${id}`).classList.add('active');
};

window.react = async (id, emoji, path) => {
    await updateDoc(doc(db, path, id), { reaction: emoji });
    document.getElementById(`react-${id}`).classList.remove('active');
};

window.sendMessage = async () => {
    const text = msgInput.value.trim();
    if(!text) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;

    await addDoc(collection(db, path), {
        uid: auth.currentUser.uid,
        name: currentUserData.name,
        email: auth.currentUser.email,
        dept: currentUserData.dept,
        level: currentUserData.level,
        text: text,
        createdAt: serverTimestamp(),
        replyTo: replyingTo || null
    });
    msgInput.value = '';
    replyingTo = null;
    document.getElementById('replyPreview').style.display = 'none';
};

document.getElementById('logoutBtn').onclick = () => { if(confirm("Logout?")) auth.signOut(); };
sendBtn.onclick = window.sendMessage;
document.getElementById('openSidebar').onclick = () => { side.classList.add('active'); over.classList.add('active'); };
over.onclick = () => { side.classList.remove('active'); over.classList.remove('active'); };
