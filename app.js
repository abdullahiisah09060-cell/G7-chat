import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const side = document.getElementById('sidebar'), over = document.getElementById('overlay');

let userData = null;
let activeReply = null;
let editId = null;
let pressTimer;
let startX = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    const snap = await getDoc(doc(db, "users", user.uid));
    userData = snap.data();

    // 1. Sidebar & Story Circles (Facebook Style)
    onSnapshot(collection(db, "users"), (s) => {
        const uList = document.getElementById('userList'), sTray = document.getElementById('storyTray');
        uList.innerHTML = ''; sTray.innerHTML = '';
        s.forEach(d => {
            const u = d.data();
            if(u.uid === user.uid) return;
            sTray.innerHTML += `<div class="story-circle" onclick="location.href='private.html?uid=${u.uid}'"><img src="https://ui-avatars.com/api/?name=${u.name}&background=random"></div>`;
            uList.innerHTML += `<div onclick="location.href='private.html?uid=${u.uid}'" style="padding:15px; border-bottom:1px solid var(--border); cursor:pointer;"><b>${u.name}</b><br><small>${u.dept} | ${u.level}</small></div>`;
        });
        document.getElementById('userCount').innerText = s.size + " Students";
    });

    // 2. Real-Time Messages (Fast Load)
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(40));
    onSnapshot(q, (snapshot) => {
        msgDiv.innerHTML = '';
        const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            
            let body = m.text;
            let cls = `msg ${isMe ? 'me' : 'them'}`;
            if(m.isDeleted) { cls += " deleted-text"; body = m.byAdmin ? "🚫 Message deleted by Admin" : "🗑️ Message deleted"; }

            msgDiv.innerHTML += `
                <div class="msg-row" 
                     onmousedown="window.pStart('${m.id}')" onmouseup="window.pEnd()" 
                     ontouchstart="window.swipeS(event); window.pStart('${m.id}')" ontouchend="window.swipeE(event, '${m.id}', \`${m.text}\`, '${m.name}'); window.pEnd()">
                    
                    <div class="react-popup" id="pop-${m.id}">
                        <span onclick="window.react('${m.id}', '👍')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️')">❤️</span>
                        <span onclick="window.react('${m.id}', '😂')">😂</span>
                        <span onclick="window.react('${m.id}', '🔥')">🔥</span>
                        <span onclick="msgInput.focus()">➕</span>
                    </div>

                    <div class="${cls}">
                        <span class="sender-tag ${isAdmin ? 'admin-name' : ''}">${isAdmin ? '👑 ' : ''}${m.name} | ${m.dept}</span>
                        ${m.reply ? `<div class="inner-reply"><b>${m.reply.name}:</b> ${m.reply.text}</div>` : ''}
                        <div>${body}</div>
                        ${!m.isDeleted ? `
                        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:6px; font-size:0.65rem; opacity:0.4;">
                            ${isMe ? `<i class="fas fa-edit" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.deleteM('${m.id}', ${userIsAdmin && !isMe})"></i>` : ''}
                            <i class="fas fa-share" onclick="window.forwardM(\`${m.text}\`)"></i>
                        </div>` : ''}
                        ${m.reaction ? `<div style="position:absolute; bottom:-12px; right:8px; background:var(--header); padding:2px 6px; border-radius:10px; font-size:0.75rem;">${m.reaction}</div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
});

// FEATURE LOGIC
window.pStart = (id) => pressTimer = setTimeout(() => {
    document.querySelectorAll('.react-popup').forEach(p => p.classList.remove('active'));
    document.getElementById(`pop-${id}`).classList.add('active');
}, 600);
window.pEnd = () => clearTimeout(pressTimer);

window.swipeS = (e) => startX = e.touches[0].clientX;
window.swipeE = (e, id, text, name) => {
    if(Math.abs(e.changedTouches[0].clientX - startX) > 70) {
        activeReply = { text, name };
        document.getElementById('replyArea').style.display = 'block';
        document.getElementById('replyUser').innerText = name;
        document.getElementById('replyText').innerText = text;
        msgInput.focus();
    }
};

window.react = async (id, emoji) => {
    await updateDoc(doc(db, "messages", id), { reaction: emoji });
    document.querySelectorAll('.react-popup').forEach(p => p.classList.remove('active'));
};

window.deleteM = async (id, byAdmin) => { if(confirm("Delete?")) await updateDoc(doc(db, "messages", id), { isDeleted: true, byAdmin }); };
window.startEdit = (id, text) => { editId = id; msgInput.value = text; msgInput.focus(); };
window.clearReply = () => { activeReply = null; document.getElementById('replyArea').style.display = 'none'; };

window.sendMessage = async () => {
    const val = msgInput.value.trim(); if(!val) return;
    if(editId) { await updateDoc(doc(db, "messages", editId), { text: val }); editId = null; }
    else {
        await addDoc(collection(db, "messages"), {
            uid: auth.currentUser.uid, email: auth.currentUser.email,
            name: userData.name, dept: userData.dept, level: userData.level,
            text: val, reply: activeReply, createdAt: serverTimestamp()
        });
    }
    msgInput.value = ''; window.clearReply();
};

window.forwardM = (text) => {
    const to = prompt("Type 'group' or paste a User ID:");
    if(!to) return;
    const path = to === 'group' ? 'messages' : `private_messages/${[auth.currentUser.uid, to].sort().join('_')}/messages`;
    addDoc(collection(db, path), { uid: auth.currentUser.uid, name: userData.name, email: auth.currentUser.email, dept: userData.dept, level: userData.level, text: `[Forwarded]: ${text}`, createdAt: serverTimestamp() });
    alert("Forwarded!");
};

sendBtn.onclick = window.sendMessage;
document.getElementById('menuBtn').onclick = () => { side.classList.add('active'); over.classList.add('active'); };
over.onclick = () => { side.classList.remove('active'); over.classList.remove('active'); };
document.getElementById('logoutBtn').onclick = () => auth.signOut();
