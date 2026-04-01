import { auth, db } from './firebase-config.js';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const msgDiv = document.getElementById('messages');

// Load Messages
const q = query(collection(db, "messages"), orderBy("createdAt"));
onSnapshot(q, (snapshot) => {
    msgDiv.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const side = data.uid === auth.currentUser.uid ? 'me' : '';
        msgDiv.innerHTML += `
            <div class="msg ${side}">
                <div class="msg-info">${data.name} (${data.dept} - ${data.level})</div>
                <div>${data.text}</div>
            </div>`;
    });
    msgDiv.scrollTop = msgDiv.scrollHeight;
});

// Send Message
sendBtn.onclick = async () => {
    if(msgInput.value.trim() === "") return;
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userDoc.data();

    await addDoc(collection(db, "messages"), {
        text: msgInput.value,
        uid: auth.currentUser.uid,
        name: auth.currentUser.displayName,
        dept: userData.dept,
        level: userData.level,
        createdAt: serverTimestamp()
    });
    msgInput.value = "";
};

// Check if Admin
auth.onAuthStateChanged(async user => {
    if(user.email === 'liger4683@gmail.com') document.getElementById('adminBtn').style.display = 'block';
});