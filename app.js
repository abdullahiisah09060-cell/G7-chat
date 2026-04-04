import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages'), fileInput = document.getElementById('fileInput');
let currentUser = null, activeReply = null, editId = null, startX = 0;

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
        await setDoc(doc(db, "unreads", user.uid), { [targetUid]: 0 }, { merge: true });
    }

    // SIDEBAR & UNREADS
    if(document.getElementById('userList')) {
        onSnapshot(collection(db, "users"), (uSnap) => {
            onSnapshot(doc(db, "unreads", user.uid), (unSnap) => {
                const list = document.getElementById('userList'); list.innerHTML = '';
                const unreads = unSnap.exists() ? unSnap.data() : {};
                uSnap.forEach(d => {
                    const u = d.data(); if(u.uid === user.uid) return;
                    const count = unreads[u.uid] || 0;
                    list.innerHTML += `
                        <div class="user-item" onclick="location.href='private.html?uid=${u.uid}'">
                            <b>${u.name}</b> ${count > 0 ? `<span class="unread-badge">${count}</span>` : ''}
                            <br><small>${u.dept} | ${u.level}</small>
                        </div>`;
                });
            });
        });
    }

    // MESSAGES RENDER
    onSnapshot(query(collection(db, path), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            let content = m.isDeleted ? (m.byAdmin ? "🚫 Deleted by Admin" : "🗑️ Message deleted") : m.text;

            msgDiv.innerHTML += `
                <div class="msg-wrap" ontouchstart="startX = event.touches[0].clientX" ontouchend="handleSwipe(event, \`${m.text}\`, '${m.name}')">
                    <div class="msg ${isMe ? 'me' : 'them'}">
                        <span class="meta-info ${isAdmin ? 'admin-name' : ''}">
                            ${isAdmin ? '👑 ' : ''}${m.name} (${m.dept} - ${m.level})
                        </span>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.1); padding:5px; border-left:3px solid var(--accent); font-size:0.75rem; margin-bottom:5px;">${m.reply.text}</div>` : ''}
                        ${m.fileData ? `<img src="${m.fileData}" style="max-width:100%; border-radius:8px; margin-bottom:5px;">` : ''}
                        <div>${content}</div>
                        ${(!m.isDeleted) ? `<div style="display:flex; justify-content:flex-end; gap:10px; opacity:0.3; font-size:0.6rem; margin-top:4px;">
                            ${isMe ? `<i class="fas fa-edit" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.del('${m.id}', '${path}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

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
                text: txt, fileData: img, reply: activeReply, createdAt: serverTimestamp()
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

// INTERACTION HELPERS
function handleSwipe(e, text, name) { if(e.changedTouches[0].clientX - startX > 60) { activeReply = {text, name}; document.getElementById('replyBar').style.display='block'; document.getElementById('repUser').innerText=name; document.getElementById('repText').innerText=text; msgInput.focus(); } }
window.startEdit = (id, txt) => { editId = id; msgInput.value = txt; msgInput.focus(); };
window.del = async (id, p, adm) => { if(confirm("Delete?")) await updateDoc(doc(db, p, id), { isDeleted: true, byAdmin: adm }); };
window.clearReply = () => { activeReply = null; document.getElementById('replyBar').style.display='none'; };
sendBtn.onclick = () => window.sendMessage();
document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('overlay').classList.add('active'); };
document.getElementById('overlay').onclick = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };
