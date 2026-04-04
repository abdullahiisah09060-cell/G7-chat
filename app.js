import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages');
const fileInput = document.getElementById('fileInput');
let currentUser = null, activeReply = null, editId = null, pressTimer = null;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUser = snap.data();

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    // 1. Sidebar Logic (FIXED)
    if(document.getElementById('userList')) {
        onSnapshot(collection(db, "users"), (s) => {
            onSnapshot(doc(db, "unreads", user.uid), (uSnap) => {
                const list = document.getElementById('userList'); list.innerHTML = '';
                const unreads = uSnap.exists() ? uSnap.data() : {};
                s.forEach(d => {
                    const u = d.data(); if(u.uid === user.uid) return;
                    const count = unreads[u.uid] || 0;
                    list.innerHTML += `<div onclick="location.href='private.html?uid=${u.uid}'" style="padding:15px; border-bottom:1px solid var(--border); cursor:pointer;">
                        <b>${u.name}</b> ${count > 0 ? `<span class="unread-badge">${count}</span>` : ''}<br>
                        <small>${u.dept} | ${u.level}</small></div>`;
                });
            });
        });
    }

    // 2. Message Rendering (Dept, Level, Admin Power & Files)
    onSnapshot(query(collection(db, path), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            let body = m.isDeleted ? (m.byAdmin ? "🚫 Deleted by Admin" : "🗑️ Message deleted") : m.text;

            msgDiv.innerHTML += `
                <div class="msg-wrap" onmousedown="window.pStart('${m.id}')" onmouseup="window.pEnd()">
                    <div class="react-bar" id="re-${m.id}">
                        <span onclick="window.react('${m.id}', '👍', '${path}')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️', '${path}')">❤️</span>
                    </div>
                    <div class="msg ${isMe ? 'me' : 'them'} ${m.isDeleted ? 'deleted-msg' : ''}">
                        <span class="${isAdmin ? 'admin-name' : ''}" style="font-size:0.7rem; display:block;">
                            ${isAdmin ? '👑 ' : ''}${m.name} (${m.dept || 'G7'} - ${m.level || 'Lvl'})
                        </span>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.05); border-left:3px solid var(--accent); padding:4px; font-size:0.75rem;">${m.reply.text}</div>` : ''}
                        ${m.fileData ? `<img src="${m.fileData}" style="max-width:100%; border-radius:5px; margin-top:5px;">` : ''}
                        <div>${body}</div>
                        ${(!m.isDeleted) ? `<div style="display:flex; justify-content:flex-end; gap:8px; opacity:0.4; font-size:0.65rem; margin-top:5px;">
                            ${isMe ? `<i class="fas fa-edit" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.del('${m.id}', '${path}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    window.sendMessage = async () => {
        const val = msgInput.value.trim();
        const file = fileInput.files[0];
        let fileBase64 = null;

        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                fileBase64 = reader.result;
                await commitMessage(val, fileBase64);
            };
            reader.readAsDataURL(file);
        } else {
            await commitMessage(val, null);
        }
    };

    async function commitMessage(text, fileData) {
        if(!text && !fileData) return;
        if(editId) {
            await updateDoc(doc(db, path, editId), { text: text, edited: true }); editId = null;
        } else {
            await addDoc(collection(db, path), { 
                uid: user.uid, email: user.email, name: currentUser.name, 
                dept: currentUser.dept, level: currentUser.level, 
                text: text, fileData: fileData, reply: activeReply, createdAt: serverTimestamp() 
            });
        }
        msgInput.value = ''; fileInput.value = ''; window.clearReply();
    }
});

// Sidebar & Interaction Helpers
window.pStart = (id) => pressTimer = setTimeout(() => document.getElementById(`re-${id}`).classList.add('active'), 600);
window.pEnd = () => { clearTimeout(pressTimer); setTimeout(() => document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active')), 2000); };
window.del = async (id, p, adm) => { if(confirm("Delete?")) await updateDoc(doc(db, p, id), { isDeleted: true, byAdmin: adm }); };
window.startEdit = (id, txt) => { editId = id; msgInput.value = txt; msgInput.focus(); };
window.clearReply = () => { activeReply = null; document.getElementById('replyBar').style.display='none'; };
sendBtn.onclick = () => window.sendMessage();

document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('overlay').classList.add('active'); };
document.getElementById('overlay').onclick = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };
