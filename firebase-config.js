import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAYOaONlk9G1B4A6P0Xk_ynQ_Kd390fwDY",
  authDomain: "g7-group-chat.firebaseapp.com",
  projectId: "g7-group-chat",
  storageBucket: "g7-group-chat.firebasestorage.app",
  messagingSenderId: "484018348918",
  appId: "1:484018348918:web:4e517aec495d1d36f45057"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
export const ADMIN_EMAIL = "liger4683@gmail.com";