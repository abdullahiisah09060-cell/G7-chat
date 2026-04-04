import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages');
let currentUser = null, activeReply = null, editId = null, pressTimer = null, startX = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUser = snap.data();

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    // Fast Listener for Sidebar Unreads
    if(document.getElementById('userList')) {
        onSnapshot(collection(db, "users"), (s) => {
            onSnapshot(doc(db, "unreads", user.uid), (uSnap) => {
                const list = document.getElementById('userList'); list.innerHTML = '';
                const unreads = uSnap.exists() ? uSnap.data() : {};
                s.forEach(d => {
                    const u = d.data(); if(u.uid === user.uid) return;
                    const count = unreads[u.uid] || 0;
                    list.innerHTML += `<div onclick="location.href='private.html?uid=${u.uid}'" style="padding:15px; border-bottom:1px solid var(--border); cursor:pointer;">
                        <b>${u.name}</b> ${count > 0 ? `<span class="unread-badge">${count}</span>` : ''}<br><small>${u.dept}</small></div>`;
                });
            });
        });
    }

    // High-Speed Message Fetch
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(40));
    onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.size === 0) return; // Skip empty cache
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            let body = m.isDeleted ? (m.byAdmin ? "🚫 Deleted by Admin" : "🗑️ Message deleted") : m.text;

            msgDiv.innerHTML += `
                <div class="msg-wrap" onmousedown="window.pStart('${m.id}')" onmouseup="window.pEnd()" ontouchstart="window.swipeS(event); window.pStart('${m.id}')" ontouchend="window.swipeE(event, '${m.id}', \`${m.text}\`, '${m.name}'); window.pEnd()">
                    <div class="react-bar" id="re-${m.id}">
                        <span onclick="window.react('${m.id}', '👍', '${path}')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️', '${path}')">❤️</span>
                        <span onclick="window.react('${m.id}', '😂', '${path}')">😂</span>
                    </div>
                    <div class="msg ${isMe ? 'me' : 'them'} ${m.isDeleted ? 'deleted-msg' : ''}">
                        <span class="${isAdmin ? 'admin-name' : ''}">${isAdmin ? '👑 ' : ''}${m.name}</span>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.05); border-left:3px solid var(--accent); padding:4px; font-size:0.75rem;">${m.reply.text}</div>` : ''}
                        <div>${body}</div>
                        ${(!m.isDeleted) ? `<div style="display:flex; justify-content:flex-end; gap:8px; opacity:0.4; font-size:0.6rem; margin-top:4px;">
                            ${isMe ? `<i class="fas fa-pen" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.del('${m.id}', '${path}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    window.sendMessage = async () => {
        const val = msgInput.value.trim(); if(!val) return;
        if(editId) {
            await updateDoc(doc(db, path, editId), { text: val, edited: true }); editId = null;
        } else {
            await addDoc(collection(db, path), { uid: user.uid, email: user.email, name: currentUser.name, text: val, reply: activeReply, createdAt: serverTimestamp() });
            if(targetUid) {
                const uDoc = doc(db, "unreads", targetUid);
                const uSnap = await getDoc(uDoc);
                let current = (uSnap.exists() && uSnap.data()[user.uid]) ? uSnap.data()[user.uid] : 0;
                await setDoc(uDoc, { [user.uid]: current + 1 }, { merge: true });
            }
        }
        msgInput.value = ''; window.clearReply();
    };
});

window.pStart = (id) => pressTimer = setTimeout(() => {
    document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active'));
    document.getElementById(`re-${id}`).classList.add('active');
}, 600);
window.pEnd = () => clearTimeout(pressTimer);
window.swipeS = (e) => startX = e.touches[0].clientX;
window.swipeE = (e, id, text, name) => {
    if(Math.abs(e.changedTouches[0].clientX - startX) > 70) {
        activeReply = { text, name };
        document.getElementById('replyBar').style.display = 'block';
        document.getElementById('repUser').innerText = name;
        document.getElementById('repText').innerText = text;
        msgInput.focus();
    }
};
window.react = async (id, em, p) => { await updateDoc(doc(db, p, id), { reaction: em }); document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active')); };
window.del = async (id, p, adm) => { if(confirm("Delete?")) await updateDoc(doc(db, p, id), { isDeleted: true, byAdmin: adm }); };
window.startEdit = (id, txt) => { editId = id; msgInput.value = txt; msgInput.focus(); };
window.clearReply = () => { activeReply = null; document.getElementById('replyBar').style.display='none'; };
sendBtn.onclick = () => window.sendMessage();
