import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy } from "./firebase-config.js";

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailDiv = document.getElementById('userEmail');

// Отслеживание авторизации
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContent.style.display = 'block';
        userEmailDiv.textContent = user.displayName ? user.displayName.split(' ')[0] : user.email;
        initAppData();
    } else {
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    }
});

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider).catch(err => alert("Ошибка входа: " + err.message));
});

logoutBtn.addEventListener('click', () => signOut(auth));

// Переключение вкладок
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tabName).style.display = 'block';
    event.currentTarget.classList.add('active');
};

// Синхронизация данных с Firestore
function initAppData() {
    const collections = ['plans', 'chores', 'notes'];
    
    collections.forEach(colName => {
        const q = query(collection(db, colName), orderBy('createdAt', 'desc'));
        
        onSnapshot(q, (snapshot) => {
            const listEl = document.getElementById(colName + 'List');
            listEl.innerHTML = '';
            
            if (snapshot.empty) {
                listEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 14px; padding: 10px;">Пока ничего нет</p>';
                return;
            }

            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const id = docSnap.id;
                
                const li = document.createElement('li');
                li.className = 'item-row';
                li.innerHTML = `
                    <input type="checkbox" ${item.completed ? 'checked' : ''} onclick="toggleItem('${colName}', '${id}', ${!item.completed})" style="width: 20px; height: 20px; cursor: pointer;">
                    <span class="item-text ${item.completed ? 'completed' : ''}">${escapeHtml(item.text)}</span>
                    <button class="delete-btn" onclick="deleteItem('${colName}', '${id}')">×</button>
                `;
                listEl.appendChild(li);
            });
        });
    });
}

window.addItem = async function(colName) {
    const inputEl = document.getElementById(colName.slice(0, -1) + 'Input') || document.getElementById(colName + 'Input');
    const text = inputEl.value.trim();
    if (!text) return;

    try {
        await addDoc(collection(db, colName), {
            text: text,
            completed: false,
            createdAt: serverTimestamp(),
            author: auth.currentUser.email
        });
        inputEl.value = '';
    } catch (e) {
        console.error("Ошибка добавления: ", e);
    }
};

window.toggleItem = async function(colName, id, status) {
    await updateDoc(doc(db, colName, id), { completed: status });
};

window.deleteItem = async function(colName, id) {
    await deleteDoc(doc(db, colName, id));
};

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Регистрация Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}