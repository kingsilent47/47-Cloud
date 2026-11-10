import { db, BUCKET_NAME } from './config.js';
import { ui } from './ui.js';

const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const quickUploadBtn = document.getElementById('quick-upload');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const currentViewTitle = document.getElementById('current-view-title');
const contextMenu = document.getElementById('context-menu');

let currentView = 'all';
let currentSort = 'date-desc';
let currentFilter = 'all';
let allFilesCache = [];
let selectedFileName = null; // Tracks the file right-clicked

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

    if (searchInput) searchInput.addEventListener('input', () => renderFilteredFiles());
    if (sortSelect) sortSelect.addEventListener('change', (e) => { currentSort = e.target.value; renderFilteredFiles(); });

    // Filter Tabs Logic
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderFilteredFiles();
        });
    });

    // Sidebar Navigation Logic
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

    // --- CONTEXT MENU LOGIC ---
    // 1. Intercept Right-Click on Table Rows
    ui.fileList.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        
        e.preventDefault(); // Stop default browser menu
        selectedFileName = row.querySelector('td:first-child').textContent.trim();
        
        // Position menu
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.classList.remove('hidden');
    });

    // 2. Hide menu on outside click
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.add('hidden');
        }
    });

    // 3. Handle Context Menu Actions
    contextMenu.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const action = btn.dataset.action;
        contextMenu.classList.add('hidden');

        if (action === 'download') await downloadFile(selectedFileName);
        else if (action === 'delete') await deleteFile(selectedFileName);
        else if (action === 'share') await shareFile(selectedFileName);
        else if (action === 'rename') await renameFile(selectedFileName);
    });

    // Standard Left-Click Actions (Fallback)
    ui.fileList.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        const fileName = target.dataset.name;
        if (action === 'download') await downloadFile(fileName);
        else if (action === 'delete') await deleteFile(fileName);
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

    if (currentView === 'favorites') filesToShow = []; 
    else if (currentView === 'shared') filesToShow = [];

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

    if (searchTerm) filesToShow = filesToShow.filter(file => file.name.toLowerCase().includes(searchTerm));

    filesToShow = sortFiles(filesToShow);
    ui.renderFiles(filesToShow);
    
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
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;
    const { error } = await db.storage.from(BUCKET_NAME).remove([filePath]);
    if (!error) loadFiles();
}

async function shareFile(fileName) {
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;
    const { data } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    
    try {
        await navigator.clipboard.writeText(data.publicUrl);
        ui.showUploadStatus('Link copied to clipboard!');
        setTimeout(() => ui.showUploadStatus(''), 3000);
    } catch (err) {
        ui.showUploadStatus('Failed to copy link.');
    }
}

async function renameFile(oldName) {
    const newName = prompt('Enter new file name:', oldName);
    if (!newName || newName === oldName) return;

    const { data: { user } } = await db.auth.getUser();
    const oldPath = `${user.id}/${oldName}`;
    const newPath = `${user.id}/${newName}`;

    // Supabase doesn't have a direct "rename", so we copy then delete
    const { data: fileData } = await db.storage.from(BUCKET_NAME).download(oldPath);
    if (!fileData) {
        ui.showUploadStatus('Error fetching file for rename.');
        return;
    }

    const { error: uploadError } = await db.storage.from(BUCKET_NAME).upload(newPath, fileData, { upsert: true });
    if (uploadError) {
        ui.showUploadStatus(`Rename error: ${uploadError.message}`);
        return;
    }

    const { error: deleteError } = await db.storage.from(BUCKET_NAME).remove([oldPath]);
    if (!deleteError) {
        ui.showUploadStatus('File renamed successfully.');
        loadFiles();
    }
}
