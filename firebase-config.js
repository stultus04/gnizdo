// Импорты официальных библиотек Firebase через CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// Ваши ключи проекта (их можно вынести сюда раз и навсегда)
const firebaseConfig = {
  apiKey: "AIzaSyCqQpi4D-A9JbmoJaWeKrkHM8q_SY9NfH0",
  authDomain: "gnizdo-db.firebaseapp.com",
  projectId: "gnizdo-db",
  storageBucket: "gnizdo-db.firebasestorage.app",
  messagingSenderId: "595648318799",
  appId: "1:595648318799:web:4b88cfbaff2471d5af493a"
};

// Инициализация
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { 
    signInWithPopup, signOut, onAuthStateChanged, 
    collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy 
};