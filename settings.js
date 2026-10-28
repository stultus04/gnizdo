import { auth, db, onAuthStateChanged, collection, addDoc, deleteDoc, doc, updateDoc, getDocs, where, onSnapshot, serverTimestamp, query, orderBy } from './firebase-config.js';

const themeButtons = document.querySelectorAll('[data-theme-choice]');
const categoryInput = document.getElementById('categoryInput');
const addCategoryButton = document.getElementById('addCategoryButton');
const categoryList = document.getElementById('categoryList');

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('gnizdo-theme', theme);
    themeButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.themeChoice === theme);
    });
}

applyTheme(localStorage.getItem('gnizdo-theme') === 'dark' ? 'dark' : 'light');
themeButtons.forEach(button => {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
});

function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character] || character);
}

async function addCategory() {
    const name = categoryInput.value.trim();
    if (!name) return;
    try {
        await addDoc(collection(db, 'categories'), { name, createdAt: serverTimestamp() });
        categoryInput.value = '';
        categoryInput.focus();
    } catch (error) {
        console.error('Ошибка добавления категории:', error);
        alert('Не удалось добавить категорию');
    }
}

addCategoryButton.addEventListener('click', addCategory);
categoryInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') addCategory();
});

async function updateTasksCategory(oldName, newName) {
    for (const section of ['plans', 'chores', 'notes']) {
        const tasksQuery = query(collection(db, section), where('category', '==', oldName));
        const snapshot = await getDocs(tasksQuery);
        await Promise.all(snapshot.docs.map(taskDoc => updateDoc(taskDoc.ref, { category: newName })));
    }
}

window.editCategory = async function(id, currentName) {
    const name = prompt('Новое название категории', currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    const newName = name.trim();
    try {
        await updateTasksCategory(currentName, newName);
        await updateDoc(doc(db, 'categories', id), { name: newName });
    } catch (error) {
        console.error('Ошибка редактирования категории:', error);
        alert('Не удалось изменить категорию');
    }
};

window.deleteCategory = async function(id, name) {
    if (!confirm(`Удалить категорию «${name}»?`)) return;
    try {
        await updateTasksCategory(name, '📦 Общее');
        await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
        console.error('Ошибка удаления категории:', error);
        alert('Не удалось удалить категорию');
    }
};

onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const categoriesQuery = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));
    onSnapshot(categoriesQuery, snapshot => {
        categoryList.innerHTML = '';
        if (snapshot.empty) {
            categoryList.innerHTML = '<li class="empty-state">Категории пока не добавлены</li>';
            return;
        }
        snapshot.forEach(categoryDoc => {
            const category = categoryDoc.data();
            const row = document.createElement('li');
            row.className = 'category-row';
            row.innerHTML = `
                <span class="category-name">${escapeHtml(category.name)}</span>
                <button class="category-action" type="button" data-edit-id="${categoryDoc.id}" data-edit-name="${escapeHtml(category.name)}">Изменить</button>
                <button class="category-action delete" type="button" data-delete-id="${categoryDoc.id}" data-delete-name="${escapeHtml(category.name)}">Удалить</button>
            `;
            categoryList.appendChild(row);
        });

        categoryList.querySelectorAll('[data-edit-id]').forEach(button => {
            button.addEventListener('click', () => editCategory(button.dataset.editId, button.dataset.editName));
        });
        categoryList.querySelectorAll('[data-delete-id]').forEach(button => {
            button.addEventListener('click', () => deleteCategory(button.dataset.deleteId, button.dataset.deleteName));
        });
    }, error => {
        console.error('Ошибка загрузки категорий:', error);
    });
});
