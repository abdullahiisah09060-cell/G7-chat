import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages');
let currentUser = null, activeReply = null, pressTimer = null, startX = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUser = snap.data();

    // Determine if Global or Private
    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    if(targetUid) {
        const tSnap = await getDoc(doc(db, "users", targetUid));
        document.getElementById('targetName').innerText = tSnap.data().name;
        document.getElementById('targetImg').src = `https://ui-avatars.com/api/?name=${tSnap.data().name}&background=random`;
    }

    // Load User List in Sidebar (If on Global)
    if(document.getElementById('userList')) {
        onSnapshot(collection(db, "users"), (s) => {
            const list = document.getElementById('userList'); list.innerHTML = '';
            s.forEach(d => {
                const u = d.data(); if(u.uid === user.uid) return;
                list.innerHTML += `<div onclick="location.href='private.html?uid=${u.uid}'" style="padding:12px; border-bottom:1px solid var(--border); cursor:pointer;"><b>${u.name}</b><br><small>${u.dept}</small></div>`;
            });
        });
    }

    // Messages Logic
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(40));
    onSnapshot(q, (snapshot) => {
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            msgDiv.innerHTML += `
                <div class="msg-wrap" 
                    onmousedown="window.pStart('${m.id}')" onmouseup="window.pEnd()" 
                    ontouchstart="window.swipeS(event); window.pStart('${m.id}')" ontouchend="window.swipeE(event, '${m.id}', \`${m.text}\`, '${m.name}'); window.pEnd()">
                    <div class="react-bar" id="re-${m.id}">
                        <span onclick="window.react('${m.id}', '👍', '${path}')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️', '${path}')">❤️</span>
                        <span onclick="window.react('${m.id}', '😂', '${path}')">😂</span>
                        <span onclick="msgInput.focus()">➕</span>
                    </div>
                    <div class="msg ${isMe ? 'me' : 'them'} ${m.isDeleted ? 'deleted-msg' : ''}">
                        <span class="${isAdmin ? 'admin-name' : ''}" style="font-size:0.65rem; display:block;">${isAdmin ? '👑 ' : ''}${m.name}</span>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.05); border-left:2px solid var(--accent); padding:4px; margin-bottom:4px; font-size:0.75rem;">${m.reply.text}</div>` : ''}
                        <div>${m.isDeleted ? '🗑️ Message deleted' : m.text}</div>
                        ${m.reaction ? `<div style="position:absolute; bottom:-12px; right:5px; background:var(--header); padding:2px 5px; border-radius:10px; font-size:0.7rem; box-shadow:0 1px 3px rgba(0,0,0,0.2);">${m.reaction}</div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    window.sendMessage = async () => {
        const val = msgInput.value.trim(); if(!val) return;
        await addDoc(collection(db, path), { uid: user.uid, email: user.email, name: currentUser.name, dept: currentUser.dept, text: val, reply: activeReply, createdAt: serverTimestamp() });
        msgInput.value = ''; window.clearReply();
    };
});

// INTERACTION HELPERS
window.pStart = (id) => pressTimer = setTimeout(() => {
    document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active'));
    document.getElementById(`re-${id}`).classList.add('active');
}, 600);
window.pEnd = () => clearTimeout(pressTimer);
window.swipeS = (e) => startX = e.touches[0].clientX;
window.swipeE = (e, id, text, name) => {
    if(Math.abs(e.changedTouches[0].clientX - startX) > 70) {
        activeReply = { text, name };
        const rb = document.getElementById('replyBar'); if(rb){ rb.style.display='block'; document.getElementById('repUser').innerText=name; document.getElementById('repText').innerText=text; }
        msgInput.focus();
    }
};
window.react = async (id, emoji, path) => { await updateDoc(doc(db, path, id), { reaction: emoji }); document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active')); };
window.clearReply = () => { activeReply = null; const rb = document.getElementById('replyBar'); if(rb) rb.style.display='none'; };

sendBtn.onclick = () => window.sendMessage();
if(document.getElementById('menuBtn')) {
    document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('overlay').classList.add('active'); };
    document.getElementById('overlay').onclick = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };
}
if(document.getElementById('logoutBtn')) document.getElementById('logoutBtn').onclick = () => auth.signOut();
