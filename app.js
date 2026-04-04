import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages'), fileInput = document.getElementById('fileInput');
let currentUser = null, activeReply = null, editId = null, startX = 0, pressTimer = null;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUser = snap.data();

    // Set User Online
    await updateDoc(doc(db, "users", user.uid), { status: 'online', lastSeen: serverTimestamp() });

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    if(targetUid) {
        const tSnap = await getDoc(doc(db, "users", targetUid));
        document.getElementById('targetName').innerText = tSnap.data().name;
        // Clear unreads
        await setDoc(doc(db, "unreads", user.uid), { [targetUid]: 0 }, { merge: true });
    }

    // 1. SIDEBAR & UNREADS & ONLINE COUNT
    if(document.getElementById('userList')) {
        onSnapshot(collection(db, "users"), (uS) => {
            onSnapshot(doc(db, "unreads", user.uid), (unS) => {
                const list = document.getElementById('userList'); list.innerHTML = '';
                const counts = unS.exists() ? unS.data() : {};
                let online = 0;
                uS.forEach(d => {
                    const u = d.data(); 
                    if(u.status === 'online') online++;
                    if(u.uid === user.uid) return;
                    list.innerHTML += `
                        <div class="user-item" onclick="location.href='private.html?uid=${u.uid}'">
                            <b><span class="status-dot ${u.status === 'online' ? 'status-online' : ''}"></span>${u.name}</b>
                            ${counts[u.uid] > 0 ? `<span class="unread-badge">${counts[u.uid]}</span>` : ''}
                            <small>${u.dept} | ${u.level}</small>
                        </div>`;
                });
                if(document.getElementById('onlineCount')) document.getElementById('onlineCount').innerText = `● ${online} Students Online`;
            });
        });
    }

    // 2. MESSAGE RENDERING (Reactions, Swipes, Files)
    onSnapshot(query(collection(db, path), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            let body = m.isDeleted ? (m.byAdmin ? "🚫 Removed by Admin" : "🗑️ Message deleted") : m.text;

            msgDiv.innerHTML += `
                <div class="msg-wrap" 
                    ontouchstart="window.swipeStart(event); window.longPressStart('${m.id}')" 
                    ontouchend="window.swipeEnd(event, \`${m.text}\`, '${m.name}'); window.longPressEnd()"
                    onmousedown="window.longPressStart('${m.id}')" onmouseup="window.longPressEnd()">
                    
                    <div class="react-bar" id="re-${m.id}">
                        <span onclick="window.react('${m.id}', '👍', '${path}')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️', '${path}')">❤️</span>
                        <span onclick="window.react('${m.id}', '😂', '${path}')">😂</span>
                        <span onclick="window.react('${m.id}', '🔥', '${path}')">🔥</span>
                    </div>

                    <div class="msg ${isMe ? 'me' : 'them'}">
                        <span style="font-size:0.65rem; display:block; margin-bottom:2px;" class="${isAdmin ? 'admin-name' : ''}">
                            ${isAdmin ? '👑 ' : ''}${m.name} (${m.dept || 'G7'})
                        </span>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.05); border-left:3px solid var(--accent); padding:4px; font-size:0.75rem; margin-bottom:5px;">${m.reply.text}</div>` : ''}
                        ${m.img ? `<img src="${m.img}" style="max-width:100%; border-radius:8px; display:block; margin-bottom:5px;">` : ''}
                        <div>${body}</div>
                        ${m.reaction ? `<span class="react-tag">${m.reaction}</span>` : ''}
                        ${(!m.isDeleted) ? `<div style="display:flex; justify-content:flex-end; gap:8px; opacity:0.3; font-size:0.6rem; margin-top:5px;">
                            ${isMe ? `<i class="fas fa-edit" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.del('${m.id}', '${path}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // 3. SENDING LOGIC
    window.sendMessage = async () => {
        const val = msgInput.value.trim(); const file = fileInput.files[0];
        if(!val && !file) return;

        if(file) {
            const reader = new FileReader();
            reader.onloadend = async () => await post(val, reader.result);
            reader.readAsDataURL(file);
        } else { await post(val, null); }
    };

    async function post(txt, img) {
        if(editId) {
            await updateDoc(doc(db, path, editId), { text: txt, edited: true }); editId = null;
        } else {
            await addDoc(collection(db, path), {
                uid: user.uid, email: user.email, name: currentUser.name, dept: currentUser.dept, level: currentUser.level,
                text: txt, img: img, reply: activeReply, createdAt: serverTimestamp()
            });
            if(targetUid) {
                const uDoc = doc(db, "unreads", targetUid); const uS = await getDoc(uDoc);
                let cur = (uS.exists() && uS.data()[user.uid]) ? uS.data()[user.uid] : 0;
                await setDoc(uDoc, { [user.uid]: cur + 1 }, { merge: true });
            }
        }
        msgInput.value = ''; fileInput.value = ''; window.clearReply();
    }
});

// GESTURES & HELPERS
window.swipeStart = (e) => startX = e.touches[0].clientX;
window.swipeEnd = (e, txt, name) => {
    if(e.changedTouches[0].clientX - startX > 80) {
        activeReply = {text: txt, name: name};
        document.getElementById('replyBar').style.display='block';
        document.getElementById('repUser').innerText = name;
        document.getElementById('repText').innerText = txt;
        msgInput.focus();
    }
};
window.longPressStart = (id) => pressTimer = setTimeout(() => {
    document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active'));
    document.getElementById(`re-${id}`).classList.add('active');
}, 600);
window.longPressEnd = () => clearTimeout(pressTimer);
window.react = async (id, em, p) => { await updateDoc(doc(db, p, id), { reaction: em }); document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active')); };
window.startEdit = (id, txt) => { editId = id; msgInput.value = txt; msgInput.focus(); };
window.del = async (id, p, adm) => { if(confirm("Delete?")) await updateDoc(doc(db, p, id), { isDeleted: true, byAdmin: adm }); };
window.clearReply = () => { activeReply = null; document.getElementById('replyBar').style.display='none'; };

sendBtn.onclick = () => window.sendMessage();
document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('overlay').classList.add('active'); };
document.getElementById('overlay').onclick = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };
