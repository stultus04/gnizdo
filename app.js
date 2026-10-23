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
    event.currentTarget.classList.add('active');
    updateCategorySelects();
};

function initAppData() {
    const sections = ['plans', 'chores', 'notes'];

    sections.forEach(sec => {
        // Слушаем категории
        const catQuery = query(collection(db, `${sec}_categories`), orderBy('createdAt', 'asc'));
        onSnapshot(catQuery, (snapshot) => {
            categoriesCache[sec] = [];
            snapshot.forEach(docSnap => {
                categoriesCache[sec].push({ id: docSnap.id, ...docSnap.data() });
            });
            updateCategorySelects();
        });

        // Слушаем задачи
        const taskQuery = query(collection(db, sec), orderBy('createdAt', 'desc'));
        onSnapshot(taskQuery, (snapshot) => {
            const listEl = document.getElementById(sec + 'List');
            listEl.innerHTML = '';
            
            if (snapshot.empty) {
                listEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 14px; padding: 10px;">Пока ничего нет</p>';
                return;
            }

            // Сегодняшняя дата без учета времени для корректной проверки просрочки
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                const id = docSnap.id;
                
                // Обработка дедлайна
                let dueDateStr = '';
                let isOverdue = false;

                if (item.dueDate) {
                    const [year, month, day] = item.dueDate.split('-');
                    dueDateStr = `${day}.${month}.${year}`;
                    
                    const taskDate = new Date(item.dueDate);
                    taskDate.setHours(0, 0, 0, 0);
                    
                    // Если задача не выполнена и дата меньше сегодняшней
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
        });
    });
}

// Обновление выпадающего списка категорий
function updateCategorySelects() {
    const selectEl = document.getElementById(currentSection + 'CategorySelect');
    if (!selectEl) return;

    selectEl.innerHTML = '<option value="Общее">📦 Общее</option>';
    
    categoriesCache[currentSection].forEach(cat => {
        const opt = document.createElement('option');
        opt.value = `${cat.emoji || '📌'} ${cat.name}`;
        opt.textContent = `${cat.emoji || '📌'} ${cat.name}`;
        selectEl.appendChild(opt);
    });

    // Опция создания новой категории в самом конце списка
    const addOpt = document.createElement('option');
    addOpt.value = "__ADD_NEW__";
    addOpt.textContent = "➕ Добавить категорию...";
    selectEl.appendChild(addOpt);
}

// Обработка выбора в выпадающем списке категорий
window.handleCategoryChange = function(selectEl) {
    if (selectEl.value === "__ADD_NEW__") {
        selectEl.value = "Общее"; // сбрасываем временно
        
        const emoji = prompt('Введите эмодзи для категории (например, 🎬, 🛒, 💡):', '🏠');
        if (emoji === null) return;
        const name = prompt('Введите название новой категории:');
        if (!name || !name.trim()) return;

        createCategory(currentSection, name.trim(), emoji.trim());
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
    }
}

// Добавление новой таски
window.addTask = async function(section) {
    const inputEl = document.getElementById(section + 'Input');
    const selectEl = document.getElementById(section + 'CategorySelect');
    const dateEl = document.getElementById(section + 'DateInput');
    
    const text = inputEl.value.trim();
    if (!text) return;

    try {
        await addDoc(collection(db, section), {
            text: text,
            category: selectEl.value === "__ADD_NEW__" ? "Общее" : selectEl.value,
            dueDate: dateEl.value || null, // Сохраняем выбранную дату (YYYY-MM-DD)
            completed: false,
            createdAt: serverTimestamp(),
            authorEmail: auth.currentUser.email,
            authorName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0]
        });

        inputEl.value = '';
        dateEl.value = '';
    } catch (e) {
        console.error("Ошибка добавления таски: ", e);
    }
};

window.toggleTask = async function(section, id, status) {
    await updateDoc(doc(db, section, id), { completed: status });
};

window.deleteTask = async function(section, id) {
    await deleteDoc(doc(db, section, id));
};

function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}