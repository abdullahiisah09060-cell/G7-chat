import { auth, db, ADMIN_EMAILS } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');
const userList = document.getElementById('userList');
const storyDiv = document.getElementById('stories');

let currentProfile = null;
let replyData = null;
let editId = null;
let swipeStartX = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
    // 1. Get User Profile once
    const snap = await getDoc(doc(db, "users", user.uid));
    currentProfile = snap.data();

    // 2. Load Sidebar & Stories (Facebook Style)
    onSnapshot(collection(db, "users"), (snap) => {
        userList.innerHTML = ''; storyDiv.innerHTML = '';
        snap.forEach(d => {
            const u = d.data();
            if(u.uid === user.uid) return;
            // Stories
            storyDiv.innerHTML += `<div class="story-circle" onclick="location.href='private.html?uid=${u.uid}'"><img src="https://ui-avatars.com/api/?name=${u.name}&background=random"></div>`;
            // List
            userList.innerHTML += `
                <div class="user-item" onclick="location.href='private.html?uid=${u.uid}'" style="padding:15px; border-bottom:1px solid var(--border); display:flex; align-items:center; cursor:pointer;">
                    <img src="https://ui-avatars.com/api/?name=${u.name}" style="width:40px; border-radius:50%; margin-right:12px;">
                    <div>
                        <div style="font-weight:bold;">${u.name} ${ADMIN_EMAILS.includes(u.email) ? '👑' : ''}</div>
                        <div style="font-size:0.7rem; color:var(--dim)">${u.dept} | Lvl ${u.level}</div>
                    </div>
                </div>`;
        });
    });

    // 3. Optimized Real-time Messages (Last 30 for speed)
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(30));
    onSnapshot(q, (snapshot) => {
        msgDiv.innerHTML = '';
        const msgs = [];
        snapshot.forEach(d => msgs.push({id: d.id, ...d.data()}));
        
        msgs.reverse().forEach(m => {
            const isMe = m.uid === user.uid;
            const isAdmin = ADMIN_EMAILS.includes(m.email);
            const userIsAdmin = ADMIN_EMAILS.includes(user.email);
            
            let msgBody = m.text;
            let bubbleClass = `msg ${isMe ? 'me' : 'them'}`;
            if(m.isDeleted) {
                bubbleClass += " deleted";
                msgBody = m.byAdmin ? "🚫 Deleted by Admin" : "🗑️ Message deleted";
            }

            msgDiv.innerHTML += `
                <div class="msg-wrap" 
                    ontouchstart="window.swipeStartX = event.touches[0].clientX"
                    ontouchend="window.handleSwipe(event, '${m.id}', \`${m.text}\`, '${m.name}')"
                    oncontextmenu="window.openReact(event, '${m.id}')">
                    
                    <div class="react-bar" id="re-${m.id}">
                        <span onclick="window.react('${m.id}', '👍')">👍</span>
                        <span onclick="window.react('${m.id}', '❤️')">❤️</span>
                        <span onclick="window.react('${m.id}', '😂')">😂</span>
                        <span onclick="window.react('${m.id}', '😮')">😮</span>
                        <span onclick="msgInput.focus()">➕</span>
                    </div>

                    <div class="${bubbleClass}">
                        <div class="meta">
                            <span class="${isAdmin ? 'admin-tag' : ''}">${m.name}</span>
                            <span style="opacity:0.5">${m.dept}</span>
                        </div>
                        ${m.reply ? `<div style="background:rgba(0,0,0,0.1); border-left:3px solid var(--accent); padding:5px; margin-bottom:5px; font-size:0.75rem;">${m.reply.text}</div>` : ''}
                        <div style="word-break:break-word;">${msgBody}</div>
                        
                        ${!m.isDeleted ? `
                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:5px; font-size:0.7rem; opacity:0.4;">
                            ${isMe ? `<i class="fas fa-pen" onclick="window.startEdit('${m.id}', \`${m.text}\`)"></i>` : ''}
                            ${(isMe || userIsAdmin) ? `<i class="fas fa-trash" onclick="window.delMsg('${m.id}', ${userIsAdmin && !isMe})"></i>` : ''}
                        </div>` : ''}
                        
                        ${m.reaction ? `<div style="position:absolute; bottom:-12px; right:10px; background:var(--header); border-radius:12px; padding:2px 6px; font-size:0.8rem; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${m.reaction}</div>` : ''}
                    </div>
                </div>`;
        });
        msgDiv.scrollTop = msgDiv.scrollHeight;
    });
});

// FUNCTIONS
window.handleSwipe = (e, id, text, name) => {
    if(Math.abs(e.changedTouches[0].clientX - window.swipeStartX) > 70) {
        replyData = { text, name };
        document.getElementById('replyBox').style.display = 'block';
        document.getElementById('replyUser').innerText = name;
        document.getElementById('replyMsg').innerText = text;
        msgInput.focus();
    }
};

window.openReact = (e, id) => {
    e.preventDefault();
    document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active'));
    document.getElementById(`re-${id}`).classList.add('active');
};

window.react = async (id, emoji) => {
    await updateDoc(doc(db, "messages", id), { reaction: emoji });
    document.querySelectorAll('.react-bar').forEach(b => b.classList.remove('active'));
};

window.delMsg = async (id, byAdmin) => {
    if(!confirm("Delete?")) return;
    await updateDoc(doc(db, "messages", id), { isDeleted: true, byAdmin: byAdmin });
};

window.startEdit = (id, text) => { editId = id; msgInput.value = text; msgInput.focus(); };

window.sendMessage = async () => {
    const text = msgInput.value.trim();
    if(!text) return;

    if(editId) {
        await updateDoc(doc(db, "messages", editId), { text: text });
        editId = null;
    } else {
        await addDoc(collection(db, "messages"), {
            uid: auth.currentUser.uid,
            name: currentProfile.name,
            email: auth.currentUser.email,
            dept: currentProfile.dept,
            level: currentProfile.level,
            text: text,
            reply: replyData,
            createdAt: serverTimestamp()
        });
    }
    msgInput.value = '';
    window.closeReply();
};

window.closeReply = () => { replyData = null; document.getElementById('replyBox').style.display = 'none'; };

sendBtn.onclick = window.sendMessage;
document.getElementById('openMenu').onclick = () => document.getElementById('sidebar').style.left = '0';
document.getElementById('overlay').onclick = () => document.getElementById('sidebar').style.left = '-300px';
