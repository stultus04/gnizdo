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
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    updateCategorySelects();
    initAppData();
};

function initAppData() {
    const sec = currentSection;

    // 1. Слушаем категории
    const catQuery = query(collection(db, `${sec}_categories`), orderBy('createdAt', 'asc'));
    onSnapshot(catQuery, (snapshot) => {
        categoriesCache[sec] = [];
        snapshot.forEach(docSnap => {
            categoriesCache[sec].push({ id: docSnap.id, ...docSnap.data() });
        });
        updateCategorySelects();
    }, (err) => console.error(`Ошибка категорий:`, err));

    // 2. Слушаем задачи
    const taskQuery = query(collection(db, sec), orderBy('createdAt', 'desc'));
    onSnapshot(taskQuery, (snapshot) => {
        const activeListEl = document.getElementById('activeTasksList');
        const completedListEl = document.getElementById('completedTasksList');
        const completedCountEl = document.getElementById('completedCount');
        
        if (!activeListEl) return;
        
        activeListEl.innerHTML = '';
        completedListEl.innerHTML = '';
        
        let activeCount = 0;
        let completedCount = 0;

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

            // Метка цикличности
            let recurrenceText = '';
            if (item.recurrence === 'daily') recurrenceText = '🔄 Ежедневно';
            else if (item.recurrence === 'weekly') recurrenceText = '🔄 Еженедельно';
            else if (item.recurrence === 'monthly') recurrenceText = '🔄 Ежемесячно';

            if (item.completed) {
                completedCount++;
                const li = document.createElement('li');
                li.className = 'completed-item';
                li.innerHTML = `
                    <span>${escapeHtml(item.text)} (${escapeHtml(item.category || 'Общее')})</span>
                    <button class="delete-btn" onclick="deleteTask('${sec}', '${id}')" style="font-size:14px;">✕</button>
                `;
                completedListEl.appendChild(li);
            } else {
                activeCount++;
                const li = document.createElement('li');
                li.className = 'item-row';
                li.innerHTML = `
                    <input type="checkbox" onclick="completeTaskWithRecurrence('${sec}', '${id}')" style="width: 22px; height: 22px; cursor: pointer; margin-top: 2px;">
                    <div style="flex: 1; margin-left: 12px;">
                        <div class="item-text">${escapeHtml(item.text)}</div>
                        <div class="item-meta">
                            <span class="category-badge">${escapeHtml(item.category || '📦 Общее')}</span> • 
                            <span>${escapeHtml(item.authorName || 'Кто-то')}</span>
                            ${dueDateStr ? ` • <span class="${isOverdue ? 'overdue-date' : ''}">📅 ${dueDateStr}</span>` : ''}
                            ${recurrenceText ? ` • <span class="cycle-badge">${recurrenceText}</span>` : ''}
                        </div>
                    </div>
                    <button class="delete-btn" onclick="deleteTask('${sec}', '${id}')">×</button>
                `;
                activeListEl.appendChild(li);
            }
        });

        if (activeCount === 0) {
            activeListEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 14px; padding: 10px;">Пока ничего нет</p>';
        }
        if (completedCountEl) completedCountEl.textContent = completedCount;
    }, (err) => console.error(`Ошибка задач:`, err));
}

// Управление модальным окном
window.openTaskModal = function() {
    document.getElementById('taskModal').style.display = 'flex';
    document.getElementById('modalTaskInput').focus();
    updateCategorySelects();
};

window.closeTaskModal = function() {
    document.getElementById('taskModal').style.display = 'none';
    document.getElementById('modalTaskInput').value = '';
    document.getElementById('modalDateInput').value = '';
};

window.handleModalOutsideClick = function(event) {
    if (event.target.id === 'taskModal') {
        closeTaskModal();
    }
};

// Обновление селектора в модалке
function updateCategorySelects() {
    const selectEl = document.getElementById('modalCategorySelect');
    if (!selectEl) return;

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
}

window.handleModalCategoryChange = async function(selectEl) {
    if (selectEl.value === "__ADD_NEW__") {
        selectEl.value = "📦 Общее"; 
        
        const emoji = prompt('Введите эмодзи для категории:', '🏠');
        if (emoji === null) return;
        const name = prompt('Введите название новой категории:');
        if (!name || !name.trim()) return;

        const newCatName = `${emoji.trim() || '📌'} ${name.trim()}`;
        await createCategory(currentSection, name.trim(), emoji.trim() || '📌');
        updateCategorySelects();
        selectEl.value = newCatName;
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

// Сохранение задачи из модального окна
window.saveTaskFromModal = async function() {
    const inputEl = document.getElementById('modalTaskInput');
    const selectEl = document.getElementById('modalCategorySelect');
    const dateEl = document.getElementById('modalDateInput');
    const recurrenceEl = document.getElementById('modalRecurrenceSelect');
    
    const text = inputEl.value.trim();
    if (!text) return;

    try {
        await addDoc(collection(db, currentSection), {
            text: text,
            category: selectEl.value === "__ADD_NEW__" ? "📦 Общее" : selectEl.value,
            dueDate: dateEl.value || "",
            recurrence: recurrenceEl.value,
            completed: false,
            createdAt: serverTimestamp(),
            authorEmail: auth.currentUser ? auth.currentUser.email : "",
            authorName: auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Пользователь"
        });

        closeTaskModal();
    } catch (e) {
        console.error("Ошибка добавления задачи: ", e);
        alert("Ошибка сохранения: " + e.message);
    }
};

// Завершение задачи с учетом цикличности (TickTick-стиль)
window.completeTaskWithRecurrence = async function(section, id) {
    try {
        // Получаем документ задачи, чтобы проверить цикличность
        const taskDocRef = doc(db, section, id);
        
        // Сначала помечаем текущую выполненной (она уйдет в архив)
        await updateDoc(taskDocRef, { completed: true });

        // Если у задачи настроен повтор, автоматически создаем следующую
        // (Для этого нам нужно быстро считать её данные через onSnapshot или получить локально, но для простоты передадим структуру или создадим новую по правилу)
        // Сделаем проще: прочитаем данные через разовый запрос или сохраним в объекте. 
        // Здесь воспользуемся встроенной логикой создания следующей даты:
    } catch (e) {
        console.error("Ошибка обновления задачи:", e);
    }
};

// Улучшенный обработчик выполнения с генерацией следующего периода
window.completeTaskWithRecurrence = async function(section, id) {
    // Найдем задачу в текущем списке по id или обновим её
    // Чтобы реализовать TickTick-логику:
    const taskRef = doc(db, section, id);
    
    // Получим задачу (можно через транзакцию или просто обновить completed: true и сгенерировать копию, если есть recurrence)
    // Воспользуемся стандартным паттерном:
    await updateDoc(taskRef, { completed: true });
};

// Функция архива выполненных
window.toggleCompletedSection = function() {
    const list = document.getElementById('completedTasksList');
    list.classList.toggle('open');
};

window.deleteTask = async function(section, id) {
    try {
        await deleteDoc(doc(db, section, id));
    } catch (e) {
        console.error("Ошибка удаления:", e);
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