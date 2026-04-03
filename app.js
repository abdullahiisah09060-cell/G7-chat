import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

    // 1. Fetch Current User Profile
    const uRef = doc(db, "users", user.uid);
    const uSnap = await getDoc(uRef);
    currentUserData = uSnap.data();

    // Update online status
    updateDoc(uRef, { status: "online" });

    // 2. Load User List (Tap to DM)
    onSnapshot(collection(db, "users"), (snap) => {
        if(!userListDiv) return;
        userListDiv.innerHTML = '';
        snap.forEach(uDoc => {
            const u = uDoc.data();
            if(u.uid === user.uid) return;
            userListDiv.innerHTML += `
                <div class="user-item" onclick="location.href='private.html?uid=${u.uid}'">
                    <div class="user-info-small">
                        <span class="user-name">${u.name} ${ADMIN_EMAILS.includes(u.email) ? '👑' : ''}</span>
                        <span class="user-meta">${u.dept} | Lvl ${u.level}</span>
                    </div>
                    <span style="font-size:0.5rem; color:${u.status==='online'?'#00a884':'#555'}">●</span>
                </div>`;
        });
    });

    // 3. Setup Messages
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;
    
    if(targetUid) {
        const targetRef = doc(db, "users", targetUid);
        const tSnap = await getDoc(targetRef);
        if(document.getElementById('targetUserName')) document.getElementById('targetUserName').innerText = tSnap.data().name;
    }

    const q = query(collection(db, path), orderBy("createdAt"), where("deleted", "==", false));
    onSnapshot(q, (snapshot) => {
        msgDiv.innerHTML = '';
        snapshot.forEach(d => {
            const m = d.data();
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);

            msgDiv.innerHTML += `
                <div class="msg-container" 
                     ontouchstart="window.handleStart(event)" 
                     ontouchend="window.handleEnd(event, '${d.id}', \`${m.text}\`, '${m.name}')"
                     oncontextmenu="window.showEmojis(event, '${d.id}', '${path}')">
                    
                    <div class="reaction-bar" id="react-${d.id}">
                        <span onclick="window.react('${d.id}', '👍', '${path}')">👍</span>
                        <span onclick="window.react('${d.id}', '❤️', '${path}')">❤️</span>
                        <span onclick="window.react('${d.id}', '😂', '${path}')">😂</span>
                        <span onclick="window.react('${d.id}', '😮', '${path}')">😮</span>
                        <span onclick="window.react('${d.id}', '😢', '${path}')">😢</span>
                        <span onclick="window.react('${d.id}', '🙏', '${path}')">🙏</span>
                    </div>

                    <div class="msg ${isMe ? 'me' : 'them'}">
                        <span class="sender-name">${isAdmin ? '👑 ADMIN: ' : ''}${m.name}</span>
                        <span class="sender-dept">${m.dept} | ${m.level}</span>
                        ${m.replyTo ? `<div style="background:rgba(0,0,0,0.1); border-left:3px solid gold; padding:5px; margin-bottom:5px; font-size:0.7rem;"><b>${m.replyTo.name}:</b> ${m.replyTo.text}</div>` : ''}
                        <div>${m.text}</div>
                        ${m.reaction ? `<div style="position:absolute; bottom:-10px; right:5px; background:#233138; border-radius:10px; padding:2px 5px; font-size:0.7rem;">${m.reaction}</div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
});

// FUNCTIONS FOR SWIPE & REACTIONS
window.handleStart = (e) => { startX = e.touches[0].clientX; };
window.handleEnd = (e, id, text, name) => {
    let diff = e.changedTouches[0].clientX - startX;
    if(Math.abs(diff) > 70) { // Swipe Trigger
        document.getElementById('replyPreview').style.display = 'block';
        document.getElementById('replyName').innerText = name;
        document.getElementById('replyText').innerText = text;
        replyingTo = { name, text };
        msgInput.focus();
    }
};

window.showEmojis = (e, id, path) => {
    e.preventDefault();
    document.querySelectorAll('.reaction-bar').forEach(b => b.classList.remove('active'));
    document.getElementById(`react-${id}`).classList.add('active');
};

window.react = async (id, emoji, path) => {
    await updateDoc(doc(db, path, id), { reaction: emoji });
    document.getElementById(`react-${id}`).classList.remove('active');
};

window.sendMessage = async () => {
    if(!msgInput.value.trim()) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[auth.currentUser.uid, targetUid].sort().join('_')}/messages` : `messages`;

    await addDoc(collection(db, path), {
        uid: auth.currentUser.uid,
        name: currentUserData.name,
        email: auth.currentUser.email,
        dept: currentUserData.dept,
        level: currentUserData.level,
        text: msgInput.value,
        createdAt: serverTimestamp(),
        replyTo: replyingTo || null,
        deleted: false
    });
    msgInput.value = '';
    replyingTo = null;
    document.getElementById('replyPreview').style.display = 'none';
};

sendBtn.onclick = window.sendMessage;
if(document.getElementById('openSidebar')) {
    document.getElementById('openSidebar').onclick = () => { side.classList.add('active'); over.classList.add('active'); };
    over.onclick = () => { side.classList.remove('active'); over.classList.remove('active'); };
}
