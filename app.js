import { auth, db, ADMIN_EMAILS, storage } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages'), fileInput = document.getElementById('fileInput');
let currentUser = null, activeReply = null, editId = null, pressTimer = null, startX = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUser = snap.data();

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    if(targetUid) {
        const tSnap = await getDoc(doc(db, "users", targetUid));
        document.getElementById('targetName').innerText = tSnap.data().name;
        document.getElementById('targetImg').src = `https://ui-avatars.com/api/?name=${tSnap.data().name}&background=random`;
        // Clear Unreads for this chat
        await setDoc(doc(db, "unreads", user.uid), { [targetUid]: 0 }, { merge: true });
    }

    // Sidebar & Unread Logic
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

    // Message Rendering with Admin Controls
    onSnapshot(query(collection(db, path), orderBy("createdAt", "desc"), limit(60)), (snapshot) => {
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            let body = m.isDeleted ? (m.byAdmin ? "🚫 Message deleted by Admin" : "🗑️ Message deleted") : (m.fileUrl ? `<a href="${m.fileUrl}" target="_blank" style="color:var(--accent); text-decoration:none;">📂 View File</a><br>${m.text}` : m.text);

            msgDiv.innerHTML += `
                <div class="msg-wrap" onmousedown="window.pStart('${m.id}')" onmouseup="window.pEnd()" ontouchstart="window.swipeS(event); window.pStart('${m.id}')" ontouchend="window.swipeE(event, '${m.id}', \`${m.text}\`, '${m.name}'); window.pEnd()">
                    <div class="react-bar" id="re-${m.id}">
                        <span onclick="window.react('${m.id}', '👍', '${path}')">👍</span><span onclick="window.react('${m.id}', '❤️', '${path}')">❤️</span><span onclick="window.react('${m.id}', '😂', '${path}')">😂</span><span onclick="msgInput.focus()">➕</span>
                    </div>
                    <div class="msg ${isMe ? 'me' : 'them'} ${m.isDeleted ? 'deleted-msg' : ''}">
                        <span class="${isAdmin ? 'admin-name' : ''}">${isAdmin ? '👑 ' : ''}${m.name}</span>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.05); border-left:3px solid var(--accent); padding:5px; margin-bottom:5px; font-size:0.8rem;">${m.reply.text}</div>` : ''}
                        <div>${body} ${m.edited ? '<small>(edited)</small>' : ''}</div>
                        ${(!m.isDeleted) ? `<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:5px; opacity:0.4; font-size:0.7rem;">
                            ${isMe ? `<i class="fas fa-edit" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.del('${m.id}', '${path}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                        ${m.reaction ? `<div style="position:absolute; bottom:-12px; right:5px; background:var(--header); padding:2px 6px; border-radius:12px; font-size:0.75rem; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${m.reaction}</div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    window.sendMessage = async () => {
        const val = msgInput.value.trim(); const file = fileInput.files[0];
        if(!val && !file) return;
        let fileUrl = null;
        if(file) {
            const fRef = ref(storage, `chat/${Date.now()}_${file.name}`);
            await uploadBytes(fRef, file); fileUrl = await getDownloadURL(fRef);
        }
        if(editId) {
            await updateDoc(doc(db, path, editId), { text: val, edited: true }); editId = null;
        } else {
            await addDoc(collection(db, path), { uid: user.uid, email: user.email, name: currentUser.name, text: val, fileUrl: fileUrl, reply: activeReply, createdAt: serverTimestamp() });
            if(targetUid) {
                const uDoc = doc(db, "unreads", targetUid); const uSnap = await getDoc(uDoc);
                let current = (uSnap.exists() && uSnap.data()[user.uid]) ? uSnap.data()[user.uid] : 0;
                await setDoc(uDoc, { [user.uid]: current + 1 }, { merge: true });
            }
        }
        msgInput.value = ''; fileInput.value = ''; window.clearReply();
    };
});

// INTERACTION LOGIC
window.pStart = (id) => pressTimer = setTimeout(() => { document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active')); document.getElementById(`re-${id}`).classList.add('active'); }, 600);
window.pEnd = () => clearTimeout(pressTimer);
window.swipeS = (e) => startX = e.touches[0].clientX;
window.swipeE = (e, id, text, name) => { if(Math.abs(e.changedTouches[0].clientX - startX) > 70) { activeReply = { text, name }; document.getElementById('replyBar').style.display='block'; document.getElementById('repUser').innerText=name; document.getElementById('repText').innerText=text; msgInput.focus(); } };
window.react = async (id, em, p) => { await updateDoc(doc(db, p, id), { reaction: em }); document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active')); };
window.del = async (id, p, adm) => { if(confirm("Delete?")) await updateDoc(doc(db, p, id), { isDeleted: true, byAdmin: adm }); };
window.startEdit = (id, txt) => { editId = id; msgInput.value = txt; msgInput.focus(); };
window.clearReply = () => { activeReply = null; document.getElementById('replyBar').style.display='none'; };

sendBtn.onclick = () => window.sendMessage();
if(document.getElementById('menuBtn')) document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('overlay').classList.add('active'); };
document.getElementById('overlay').onclick = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };
