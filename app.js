import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy } from "./firebase-config.js";

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailDiv = document.getElementById('userEmail');

let currentSection = 'plans';
let categoriesCache = { plans: [], chores: [], notes: [] };

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
    currentSection = tabName;
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tabName).style.display = 'block';
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    updateCategorySelects();
};

function initAppData() {
    const sections = ['plans', 'chores', 'notes'];

    sections.forEach(sec => {
        // 1. Слушаем категории
        const catQuery = query(collection(db, `${sec}_categories`), orderBy('createdAt', 'asc'));
        onSnapshot(catQuery, (snapshot) => {
            categoriesCache[sec] = [];
            snapshot.forEach(docSnap => {
                categoriesCache[sec].push({ id: docSnap.id, ...docSnap.data() });
            });
            updateCategorySelects();
        }, (err) => console.error(`Ошибка загрузки категорий (${sec}):`, err));

        // 2. Слушаем задачи
        const taskQuery = query(collection(db, sec), orderBy('createdAt', 'desc'));
        onSnapshot(taskQuery, (snapshot) => {
            const listEl = document.getElementById(sec + 'List');
            if (!listEl) return;
            
            listEl.innerHTML = '';
            
            if (snapshot.empty) {
                listEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 14px; padding: 10px;">Пока ничего нет</p>';
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const id = docSnap.id;
                
                let dueDateStr = '';
                let isOverdue = false;

                if (item.dueDate) {
                    const [year, month, day] = item.dueDate.split('-');
                    dueDateStr = `${day}.${month}.${year}`;
                    
                    const taskDate = new Date(item.dueDate);
                    taskDate.setHours(0, 0, 0, 0);
                    
                    if (!item.completed && taskDate < today) {
                        isOverdue = true;
                    }
                }

                const li = document.createElement('li');
                li.className = 'item-row';
                li.innerHTML = `
                    <input type="checkbox" ${item.completed ? 'checked' : ''} onclick="toggleTask('${sec}', '${id}', ${!item.completed})" style="width: 20px; height: 20px; cursor: pointer; margin-top: 2px;">
                    <div style="flex: 1; margin-left: 12px;">
                        <div class="item-text ${item.completed ? 'completed' : ''}">${escapeHtml(item.text)}</div>
                        <div class="item-meta">
                            <span class="category-badge">${escapeHtml(item.category || '📦 Общее')}</span> • 
                            <span>${escapeHtml(item.authorName || 'Кто-то')}</span>
                            ${dueDateStr ? ` • <span class="${isOverdue ? 'overdue-date' : ''}">📅 ${dueDateStr}</span>` : ''}
                        </div>
                    </div>
                    <button class="delete-btn" onclick="deleteTask('${sec}', '${id}')">×</button>
                `;
                listEl.appendChild(li);
            });
        }, (err) => console.error(`Ошибка загрузки задач (${sec}):`, err));
    });
}

// Обновление списка категорий
function updateCategorySelects(selectedValueToSet = null) {
    const selectEl = document.getElementById(currentSection + 'CategorySelect');
    if (!selectEl) return;

    const previousVal = selectedValueToSet || selectEl.value;

    selectEl.innerHTML = '<option value="📦 Общее">📦 Общее</option>';
    
    categoriesCache[currentSection].forEach(cat => {
        const catVal = `${cat.emoji || '📌'} ${cat.name}`;
        const opt = document.createElement('option');
        opt.value = catVal;
        opt.textContent = catVal;
        selectEl.appendChild(opt);
    });

    const addOpt = document.createElement('option');
    addOpt.value = "__ADD_NEW__";
    addOpt.textContent = "➕ Добавить категорию...";
    selectEl.appendChild(addOpt);

    if (previousVal && previousVal !== "__ADD_NEW__") {
        selectEl.value = previousVal;
    }
}

// Выбор категории в списки
window.handleCategoryChange = async function(selectEl) {
    if (selectEl.value === "__ADD_NEW__") {
        selectEl.value = "📦 Общее"; 
        
        const emoji = prompt('Введите эмодзи для категории:', '🏠');
        if (emoji === null) return;
        const name = prompt('Введите название новой категории:');
        if (!name || !name.trim()) return;

        const newCatName = `${emoji.trim() || '📌'} ${name.trim()}`;
        await createCategory(currentSection, name.trim(), emoji.trim() || '📌');
        
        // Автоматически выставляем новую категорию после добавления
        updateCategorySelects(newCatName);
    }
};

async function createCategory(section, name, emoji) {
    try {
        await addDoc(collection(db, `${section}_categories`), {
            name: name,
            emoji: emoji,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Ошибка создания категории:", e);
        alert("Не удалось создать категорию: " + e.message);
    }
}

// Добавление новой таски
window.addTask = async function(section) {
    const inputEl = document.getElementById(section + 'Input');
    const selectEl = document.getElementById(section + 'CategorySelect');
    const dateEl = document.getElementById(section + 'DateInput');
    
    if (!inputEl) return;

    const text = inputEl.value.trim();
    if (!text) return;

    let selectedCategory = selectEl ? selectEl.value : '📦 Общее';
    if (selectedCategory === "__ADD_NEW__") {
        selectedCategory = '📦 Общее';
    }

    try {
        await addDoc(collection(db, section), {
            text: text,
            category: selectedCategory,
            dueDate: (dateEl && dateEl.value) ? dateEl.value : "",
            completed: false,
            createdAt: serverTimestamp(),
            authorEmail: auth.currentUser ? auth.currentUser.email : "",
            authorName: auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Пользователь"
        });

        inputEl.value = '';
        if (dateEl) dateEl.value = '';
    } catch (e) {
        console.error("Ошибка добавления задачи: ", e);
        alert("Ошибка сохранения задачи: " + e.message);
    }
};

window.toggleTask = async function(section, id, status) {
    try {
        await updateDoc(doc(db, section, id), { completed: status });
    } catch (e) {
        console.error("Ошибка обновления задачи:", e);
    }
};

window.deleteTask = async function(section, id) {
    try {
        await deleteDoc(doc(db, section, id));
    } catch (e) {
        console.error("Ошибка удаления задачи:", e);
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}