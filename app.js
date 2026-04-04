import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput'), sendBtn = document.getElementById('sendBtn'), msgDiv = document.getElementById('messages'), fileInput = document.getElementById('fileInput');
let currentUser = null, activeReply = null, editId = null;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    // Get My Data
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUser = snap.data();

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get('uid');
    const path = targetUid ? `private_messages/${[user.uid, targetUid].sort().join('_')}/messages` : `messages`;

    // Reset unreads when entering private chat
    if(targetUid) {
        const tSnap = await getDoc(doc(db, "users", targetUid));
        document.getElementById('targetName').innerText = tSnap.data().name;
        await setDoc(doc(db, "unreads", user.uid), { [targetUid]: 0 }, { merge: true });
    }

    // --- SIDEBAR & UNREAD NOTIFICATIONS ---
    if(document.getElementById('userList')) {
        // Listen to all users
        onSnapshot(collection(db, "users"), (userSnap) => {
            // Listen to my specific unread counts
            onSnapshot(doc(db, "unreads", user.uid), (unreadSnap) => {
                const list = document.getElementById('userList');
                list.innerHTML = '';
                const unreadData = unreadSnap.exists() ? unreadSnap.data() : {};

                userSnap.forEach(d => {
                    const u = d.data();
                    if(u.uid === user.uid) return; // Don't show myself

                    const count = unreadData[u.uid] || 0;
                    list.innerHTML += `
                        <div class="user-item" onclick="location.href='private.html?uid=${u.uid}'">
                            <b>${u.name}</b>
                            ${count > 0 ? `<span class="unread-badge">${count}</span>` : ''}
                            <br><small>${u.dept} | ${u.level}</small>
                        </div>`;
                });
            });
        });
    }

    // --- MESSAGE RENDERING ---
    onSnapshot(query(collection(db, path), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
        msgDiv.innerHTML = ''; const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            
            let content = m.isDeleted ? (m.byAdmin ? "🚫 Removed by Admin" : "🗑️ Deleted") : m.text;

            msgDiv.innerHTML += `
                <div class="msg-wrap">
                    <div class="msg ${isMe ? 'me' : 'them'}">
                        <span class="${isAdmin ? 'admin-name' : ''}" style="font-size:0.7rem; display:block;">
                            ${isAdmin ? '👑 ' : ''}${m.name} (${m.dept} - ${m.level})
                        </span>
                        ${m.fileData ? `<img src="${m.fileData}" style="max-width:100%; border-radius:8px; margin:5px 0;">` : ''}
                        <div>${content}</div>
                        ${(!m.isDeleted) ? `<div style="display:flex; justify-content:flex-end; gap:8px; opacity:0.3; font-size:0.6rem; margin-top:4px;">
                            ${isMe ? `<i class="fas fa-edit" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.del('${m.id}', '${path}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });

    // --- SENDING LOGIC (WITH BASE64 UPLOAD) ---
    window.sendMessage = async () => {
        const val = msgInput.value.trim();
        const file = fileInput.files[0];
        
        if(!val && !file) return;

        if(file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                await postToFirebase(val, reader.result);
            };
            reader.readAsDataURL(file);
        } else {
            await postToFirebase(val, null);
        }
    };

    async function postToFirebase(text, base64) {
        if(editId) {
            await updateDoc(doc(db, path, editId), { text: text, edited: true });
            editId = null;
        } else {
            // Send Msg
            await addDoc(collection(db, path), {
                uid: user.uid, email: user.email, name: currentUser.name,
                dept: currentUser.dept, level: currentUser.level,
                text: text, fileData: base64, createdAt: serverTimestamp()
            });

            // Update Unread for Target
            if(targetUid) {
                const uDoc = doc(db, "unreads", targetUid);
                const uSnap = await getDoc(uDoc);
                let current = (uSnap.exists() && uSnap.data()[user.uid]) ? uSnap.data()[user.uid] : 0;
                await setDoc(uDoc, { [user.uid]: current + 1 }, { merge: true });
            }
        }
        msgInput.value = ''; fileInput.value = '';
    }
});

// Sidebar Controls
document.getElementById('menuBtn').onclick = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('overlay').classList.add('active'); };
document.getElementById('overlay').onclick = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); };

window.del = async (id, p, adm) => { if(confirm("Delete?")) await updateDoc(doc(db, p, id), { isDeleted: true, byAdmin: adm }); };
window.startEdit = (id, txt) => { editId = id; msgInput.value = txt; msgInput.focus(); };
sendBtn.onclick = () => window.sendMessage();
