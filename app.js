import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, collection, addDoc, deleteDoc, doc, updateDoc, getDoc, onSnapshot, serverTimestamp, query, orderBy } from "./firebase-config.js";

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmailDiv = document.getElementById('userEmail');

const savedTheme = localStorage.getItem('gnizdo-theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = savedTheme;

let currentSection = 'plans';
let categoriesCache = [];
let observedCategories = { plans: [], chores: [], notes: [] };
let categoryFilterBySection = { plans: 'all', chores: 'all', notes: 'all' };

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContent.style.display = 'block';
        userEmailDiv.textContent = user.displayName ? user.displayName.split(' ')[0] : user.email;
        initAppData();
        migrateLegacyCategories();
    } else {
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    }
});

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider).catch(err => alert("Ошибка входа: " + err.message));
});

logoutBtn.addEventListener('click', () => signOut(auth));

window.toggleSideMenu = function(open) {
    const menu = document.getElementById('sideMenuOverlay');
    if (menu) menu.classList.toggle('open', open);
};

const brandButton = document.getElementById('brandButton');
if (brandButton) {
    brandButton.addEventListener('click', () => toggleSideMenu(true));
}

window.handleSideMenuOutsideClick = function(event) {
    if (event.target.id === 'sideMenuOverlay') toggleSideMenu(false);
};

// Переключение вкладок
window.switchTab = function(tabName, clickedButton) {
    currentSection = tabName;
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active', 'tab-drop');
    });

    const activeButton = clickedButton || document.querySelector(`.tab-btn[onclick*="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
        void activeButton.offsetWidth;
        activeButton.classList.add('tab-drop');
        activeButton.addEventListener('animationend', () => {
            activeButton.classList.remove('tab-drop');
        }, { once: true });
    }

    updateCategorySelects();
    renderCategoryFilter();
    initAppData();
};

const tabSwipeContent = document.getElementById('tab-content-area');
const tabNames = ['plans', 'chores', 'notes'];
let swipeStartX = 0;
let swipeStartY = 0;

if (tabSwipeContent) {
    tabSwipeContent.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches[0];
        swipeStartX = touch.clientX;
        swipeStartY = touch.clientY;
    }, { passive: true });

    tabSwipeContent.addEventListener('touchend', (event) => {
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - swipeStartX;
        const deltaY = touch.clientY - swipeStartY;

        if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;

        const currentIndex = tabNames.indexOf(currentSection);
        const nextIndex = deltaX < 0
            ? Math.min(currentIndex + 1, tabNames.length - 1)
            : Math.max(currentIndex - 1, 0);

        if (nextIndex !== currentIndex) {
            const nextButton = document.querySelectorAll('.tab-btn')[nextIndex];
            switchTab(tabNames[nextIndex], nextButton);
        }
    }, { passive: true });
}

const migratingCategoryNames = new Set();

function migrateLegacyCategories() {
    ['plans', 'chores', 'notes'].forEach(section => {
        onSnapshot(collection(db, `${section}_categories`), snapshot => {
            snapshot.forEach(categoryDoc => {
                const name = categoryDoc.data().name?.trim();
                if (!name || migratingCategoryNames.has(name)) return;
                migratingCategoryNames.add(name);
                const exists = categoriesCache.some(category => category.name === name);
                if (!exists) {
                    addDoc(collection(db, 'categories'), {
                        name,
                        createdAt: serverTimestamp()
                    }).catch(error => console.error('Ошибка переноса категории:', error));
                }
            });
        }, error => console.error('Ошибка чтения старых категорий:', error));
    });
}

function initAppData() {
    const sec = currentSection;

    // 1. Слушаем общие категории
    const catQuery = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));
    onSnapshot(catQuery, (snapshot) => {
        categoriesCache = [];
        snapshot.forEach(docSnap => {
            categoriesCache.push({ id: docSnap.id, ...docSnap.data() });
        });
        updateCategorySelects();
        renderCategoryFilter();
    }, (err) => console.error(`Ошибка категорий:`, err));

    // 2. Слушаем задачи
    const taskQuery = query(collection(db, sec), orderBy('createdAt', 'desc'));
    onSnapshot(taskQuery, (snapshot) => {
        const activeListEl = document.getElementById('activeTasksList');
        const completedListEl = document.getElementById('completedTasksList');
        const completedCountEl = document.getElementById('completedCount');
        
        if (!activeListEl) return;

        observedCategories[sec] = [];
        snapshot.forEach(docSnap => {
            const itemCategory = docSnap.data().category || '📦 Общее';
            if (!observedCategories[sec].includes(itemCategory)) {
                observedCategories[sec].push(itemCategory);
            }
        });
        renderCategoryFilter();
        
        activeListEl.innerHTML = '';
        completedListEl.innerHTML = '';
        
        let activeCount = 0;
        let completedCount = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            const id = docSnap.id;
            const itemCategory = item.category || '📦 Общее';
            const selectedCategory = categoryFilterBySection[sec];
            if (selectedCategory !== 'all' && itemCategory !== selectedCategory) return;
            
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

            // Метка ответственного
            let assigneeLabel = '';
            if (item.assignee === 'maxim') assigneeLabel = '👤 Максим';
            else if (item.assignee === 'katya') assigneeLabel = '👤 Катя';
            else if (item.assignee === 'both') assigneeLabel = '👥 Оба';

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
                    <input type="checkbox" checked onchange="restoreTask('${sec}', '${id}')" style="width: 22px; height: 22px; cursor: pointer; margin-right: 10px; flex-shrink: 0;">
                    <span style="flex: 1;">${escapeHtml(item.text)} (${escapeHtml(item.category || 'Общее')})</span>
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
                            ${assigneeLabel ? ` • <span class="category-badge">${assigneeLabel}</span>` : ''}
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
    document.getElementById('modalRecurrenceSelect').value = 'none';
    document.getElementById('modalAssigneeSelect').value = 'none';
};

window.handleModalOutsideClick = function(event) {
    if (event.target.id === 'taskModal') {
        closeTaskModal();
    }
};

function renderCategoryFilter() {
    const filterEl = document.getElementById('categoryFilter');
    if (!filterEl) return;

    const sectionCategories = [];
    categoriesCache.forEach(cat => {
        if (!sectionCategories.includes(cat.name)) sectionCategories.push(cat.name);
    });
    observedCategories[currentSection].forEach(cat => {
        if (!sectionCategories.includes(cat)) sectionCategories.push(cat);
    });

    if (sectionCategories.length === 0) {
        filterEl.classList.remove('visible');
        filterEl.innerHTML = '';
        return;
    }

    if (categoryFilterBySection[currentSection] !== 'all' && !sectionCategories.includes(categoryFilterBySection[currentSection])) {
        categoryFilterBySection[currentSection] = 'all';
    }

    const categories = ['all', ...sectionCategories];
    filterEl.innerHTML = categories.map(category => {
        const isActive = categoryFilterBySection[currentSection] === category;
        const label = category === 'all' ? 'Все' : category;
        return `<button type="button" class="category-filter-btn${isActive ? ' active' : ''}" onclick="setCategoryFilter('${escapeHtml(category)}', this)">${escapeHtml(label)}</button>`;
    }).join('');
    filterEl.classList.add('visible');
}

window.setCategoryFilter = function(category, clickedButton) {
    if (category === "all") {
        categoryFilterBySection[currentSection] = 'all';
    } else {
        categoryFilterBySection[currentSection] = category;
    }

    document.querySelectorAll('.category-filter-btn').forEach(button => button.classList.remove('active'));
    if (clickedButton) clickedButton.classList.add('active');

    initAppData();
};

function updateCategorySelects() {
    const selectEl = document.getElementById('modalCategorySelect');
    if (!selectEl) return;

    selectEl.innerHTML = '<option value="📦 Общее">📦 Общее</option>';
    
    categoriesCache.forEach(cat => {
        const catVal = cat.name;
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
        
        const name = prompt('Введите название категории (можно с эмодзи, например: 🪴 Цветы):');
        if (!name || !name.trim()) return;

        const newCatName = name.trim();
        await createCategory(newCatName);
        updateCategorySelects();
        selectEl.value = newCatName;
    }
};

async function createCategory(name) {
    try {
        await addDoc(collection(db, 'categories'), {
            name: name,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Ошибка создания категории:", e);
    }
}

// Сохранение задачи из модалки с учетом ответственного
window.saveTaskFromModal = async function() {
    const inputEl = document.getElementById('modalTaskInput');
    const selectEl = document.getElementById('modalCategorySelect');
    const dateEl = document.getElementById('modalDateInput');
    const recurrenceEl = document.getElementById('modalRecurrenceSelect');
    const assigneeEl = document.getElementById('modalAssigneeSelect');
    
    const text = inputEl.value.trim();
    if (!text) return;

    try {
        await addDoc(collection(db, currentSection), {
            text: text,
            category: selectEl.value === "__ADD_NEW__" ? "📦 Общее" : selectEl.value,
            dueDate: dateEl.value || "",
            recurrence: recurrenceEl.value,
            assignee: assigneeEl ? assigneeEl.value : "none",
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

// Выполнение задачи + авто-создание следующей цикличной с сохранением ответственного
window.completeTaskWithRecurrence = async function(section, id) {
    try {
        const taskRef = doc(db, section, id);
        const taskSnap = await getDoc(taskRef);

        if (!taskSnap.exists()) return;
        const taskData = taskSnap.data();

        await updateDoc(taskRef, { completed: true });

        if (taskData.recurrence && taskData.recurrence !== 'none') {
            let nextDueDate = "";

            if (taskData.dueDate) {
                const baseDate = new Date(taskData.dueDate);
                
                if (taskData.recurrence === 'daily') {
                    baseDate.setDate(baseDate.getDate() + 1);
                } else if (taskData.recurrence === 'weekly') {
                    baseDate.setDate(baseDate.getDate() + 7);
                } else if (taskData.recurrence === 'monthly') {
                    baseDate.setMonth(baseDate.getMonth() + 1);
                }

                const yyyy = baseDate.getFullYear();
                const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
                const dd = String(baseDate.getDate()).padStart(2, '0');
                nextDueDate = `${yyyy}-${mm}-${dd}`;
            }

            await addDoc(collection(db, section), {
                text: taskData.text,
                category: taskData.category || "📦 Общее",
                dueDate: nextDueDate,
                recurrence: taskData.recurrence,
                assignee: taskData.assignee || "none",
                completed: false,
                createdAt: serverTimestamp(),
                authorEmail: auth.currentUser ? auth.currentUser.email : "",
                authorName: auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Пользователь"
            });
        }
    } catch (e) {
        console.error("Ошибка при закрытии и пересоздании задачи:", e);
    }
};

window.restoreTask = async function(section, id) {
    try {
        await updateDoc(doc(db, section, id), { completed: false });
    } catch (e) {
        console.error('Ошибка возврата задачи:', e);
        alert('Не удалось вернуть задачу в актуальный список');
    }
};

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