import { db, BUCKET_NAME } from './config.js';
import { ui } from './ui.js';

const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const quickUploadBtn = document.getElementById('quick-upload');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const currentViewTitle = document.getElementById('current-view-title');

let currentView = 'all';
let currentSort = 'date-desc';
let currentFilter = 'all';
let allFilesCache = [];

// --- Favorites Logic (LocalStorage) ---
const getFavorites = () => JSON.parse(localStorage.getItem('47cloud_favorites') || '[]');
const toggleFavorite = (fileName) => {
    let favorites = getFavorites();
    if (favorites.includes(fileName)) {
        favorites = favorites.filter(f => f !== fileName);
    } else {
        favorites.push(fileName);
    }
    localStorage.setItem('47cloud_favorites', JSON.stringify(favorites));
    renderFilteredFiles();
};
window.toggleFavorite = toggleFavorite; // Expose to HTML onclick

export function initStorageEvents() {
    uploadBtn.addEventListener('click', () => fileInput.click());
    if (quickUploadBtn) quickUploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        ui.showUploadStatus('Uploading...');
        const { data: { user } } = await db.auth.getUser();
        const filePath = `${user.id}/${file.name}`;

        const { error } = await db.storage.from(BUCKET_NAME).upload(filePath, file, { upsert: true });
        
        if (error) {
            ui.showUploadStatus(`Error: ${error.message}`);
        } else {
            ui.showUploadStatus('Upload complete.');
            loadFiles();
        }
        fileInput.value = '';
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => renderFilteredFiles());
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderFilteredFiles();
        });
    }

    // Handle Filter Tabs
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderFilteredFiles();
        });
    });

    // Handle Sidebar Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            currentView = view;
            
            if (view === 'all' || view === 'files') currentViewTitle.textContent = 'All Files';
            else if (view === 'favorites') currentViewTitle.textContent = 'Favorites';
            else if (view === 'shared') currentViewTitle.textContent = 'Shared';

            renderFilteredFiles();
        });
    });

    // Event delegation for table actions (Download, Delete, Favorite)
    ui.fileList.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        const action = target.dataset.action;
        const fileName = target.dataset.name;

        if (action === 'download') await downloadFile(fileName);
        else if (action === 'delete') await deleteFile(fileName);
        else if (action === 'favorite') toggleFavorite(fileName);
    });
}

export async function loadFiles() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const { data, error } = await db.storage.from(BUCKET_NAME).list(user.id);
    
    if (error || !data) {
        allFilesCache = [];
        renderFilteredFiles();
        updateStorageOverview([]);
        return;
    }

    allFilesCache = data;
    renderFilteredFiles();
    updateStorageOverview(data);
}

function sortFiles(files) {
    const sorted = [...files];
    switch(currentSort) {
        case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
        case 'size-desc': return sorted.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
        case 'size-asc': return sorted.sort((a, b) => (a.metadata?.size || 0) - (b.metadata?.size || 0));
        case 'date-asc': return sorted.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
        case 'date-desc': 
        default: return sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
}

function renderFilteredFiles() {
    let filesToShow = [...allFilesCache];
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const favorites = getFavorites();

    // 1. Filter by View (Favorites/Shared)
    if (currentView === 'favorites') {
        filesToShow = filesToShow.filter(file => favorites.includes(file.name));
    } else if (currentView === 'shared') {
        filesToShow = []; 
    }

    // 2. Filter by Tab (Documents, Images, etc.)
    if (currentFilter !== 'all') {
        filesToShow = filesToShow.filter(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (currentFilter === 'documents') return ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'zip', 'ppt', 'pptx'].includes(ext);
            if (currentFilter === 'images') return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext);
            if (currentFilter === 'videos') return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
            if (currentFilter === 'others') return !['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'zip', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
            return true;
        });
    }

    // 3. Filter by Search
    if (searchTerm) {
        filesToShow = filesToShow.filter(file => file.name.toLowerCase().includes(searchTerm));
    }

    // 4. Sort
    filesToShow = sortFiles(filesToShow);
    
    // 5. Render
    ui.renderFiles(filesToShow, favorites);
    
    const countEl = document.getElementById('file-count');
    if (countEl) countEl.textContent = `${filesToShow.length} files`;
}

function updateStorageOverview(files) {
    let totalBytes = 0;
    const types = { Images: 0, Documents: 0, Videos: 0, Others: 0 };

    files.forEach(file => {
        totalBytes += file.metadata?.size || 0;
        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) types.Images += file.metadata?.size || 0;
        else if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'zip'].includes(ext)) types.Documents += file.metadata?.size || 0;
        else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) types.Videos += file.metadata?.size || 0;
        else types.Others += file.metadata?.size || 0;
    });

    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    document.getElementById('storage-used').textContent = `${totalMB} MB`;
    document.getElementById('storage-fill').style.width = `${Math.min((totalBytes / (1024 * 1024 * 1024)) * 100, 100)}%`;

    const statsContainer = document.getElementById('overview-stats');
    if (statsContainer) {
        statsContainer.innerHTML = Object.entries(types).map(([label, bytes]) => `
            <div class="stat-item">
                <div class="stat-value">${(bytes / (1024 * 1024)).toFixed(1)} MB</div>
                <div class="stat-label">${label}</div>
            </div>
        `).join('');
    }
}

async function downloadFile(fileName) {
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;
    const { data } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    window.open(data.publicUrl, '_blank');
}

async function deleteFile(fileName) {
    if (!confirm('Are you sure you want to delete this file?')) return;
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;
    const { error } = await db.storage.from(BUCKET_NAME).remove([filePath]);
    if (!error) {
        // Also remove from favorites if it was favorited
        let favorites = getFavorites().filter(f => f !== fileName);
        localStorage.setItem('47cloud_favorites', JSON.stringify(favorites));
        loadFiles();
    }
}
