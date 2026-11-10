import { db, BUCKET_NAME } from './config.js';
import { ui } from './ui.js';
import { notifications } from './notifications.js';

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
let selectedFileName = null;
let sharedFilesCache = [];

export function initStorageEvents() {
    notifications.init();

    uploadBtn.addEventListener('click', () => fileInput.click());
    if (quickUploadBtn) quickUploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        notifications.showLoading(`Uploading ${file.name}...`);
        const { data: { user } } = await db.auth.getUser();
        const filePath = `${user.id}/${file.name}`;

        const { error } = await db.storage.from(BUCKET_NAME).upload(filePath, file, { upsert: true });
        
        notifications.hideLoading();
        
        if (error) {
            notifications.add(`Failed to upload ${file.name}: ${error.message}`, 'error');
        } else {
            notifications.add(`${file.name} uploaded successfully.`, 'success');
            loadFiles();
        }
        fileInput.value = '';
    });

    if (searchInput) searchInput.addEventListener('input', () => renderFilteredFiles());
    if (sortSelect) sortSelect.addEventListener('change', (e) => { currentSort = e.target.value; renderFilteredFiles(); });

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderFilteredFiles();
        });
    });

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            currentView = view;
            
            if (view === 'all' || view === 'files') {
                currentViewTitle.textContent = 'All Files';
                renderFilteredFiles();
            } else if (view === 'favorites') {
                currentViewTitle.textContent = 'Favorites';
                renderFilteredFiles();
            } else if (view === 'shared') {
                currentViewTitle.textContent = 'Shared with Me';
                await loadSharedFiles();
            }
        });
    });

    // Context Menu Logic
    ui.fileList.addEventListener('contextmenu', (e) => {
        if (currentView === 'shared') return; // Disable context menu on shared view for simplicity
        const row = e.target.closest('tr');
        if (!row) return;
        e.preventDefault();
        selectedFileName = row.querySelector('td:first-child').textContent.trim();
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    });

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

    ui.fileList.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        const fileName = target.dataset.name;
        if (action === 'download') await downloadFile(fileName);
        else if (action === 'delete') await deleteFile(fileName);
    });

    // Clear notifications
    const clearBtn = document.getElementById('clear-notifications');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('notification-list').innerHTML = '<div class="notification-empty">No new notifications</div>';
            document.getElementById('notification-badge').classList.add('hidden');
        });
    }
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

async function loadSharedFiles() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const { data, error } = await db.from('shared_files').select('*').eq('shared_with_email', user.email);
    if (error || !data) {
        sharedFilesCache = [];
    } else {
        sharedFilesCache = data;
    }
    renderSharedFiles();
}

function renderSharedFiles() {
    if (!ui.fileList) return;
    ui.fileList.innerHTML = '';
    
    if (!sharedFilesCache || sharedFilesCache.length === 0) {
        ui.fileList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted-color); padding: 32px;">No files have been shared with you.</td></tr>';
        document.getElementById('file-count').textContent = '0 files';
        return;
    }

    sharedFilesCache.forEach(file => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 500;">${file.file_name} <span style="font-size:12px; color:var(--muted-color); font-weight:400;">(Shared by ${file.owner_id.slice(0,8)}...)</span></td>
            <td>-</td>
            <td style="color: var(--muted-color);">${new Date(file.created_at).toLocaleDateString()}</td>
            <td>
                <button class="action-link" onclick="window.downloadSharedFile('${file.file_path}', '${file.file_name}')">Download</button>
            </td>
        `;
        ui.fileList.appendChild(row);
    });
    document.getElementById('file-count').textContent = `${sharedFilesCache.length} files`;
}

window.downloadSharedFile = async (filePath, fileName) => {
    notifications.showLoading(`Downloading ${fileName}...`);
    const { data } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    window.open(data.publicUrl, '_blank');
    notifications.hideLoading();
    notifications.add(`Downloaded ${fileName}`, 'success');
    
    // Log access (Optional: requires backend function for true security, but UI notification works)
    notifications.add(`File accessed: ${fileName}`, 'info');
};

function sortFiles(files) {
    const sorted = [...files];
    switch(currentSort) {
        case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
        case 'size-desc': return sorted.sort((a, b) => (b.metadata?.size || 0) - (a.metadata?.size || 0));
        case 'size-asc': return sorted.sort((a, b) => (a.metadata?.size || 0) - (b.metadata?.size || 0));
        case 'date-asc': return sorted.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
        case 'date-desc': default: return sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
}

function renderFilteredFiles() {
    let filesToShow = [...allFilesCache];
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    if (currentView === 'favorites') {
        const favorites = JSON.parse(localStorage.getItem('47cloud_favorites') || '[]');
        filesToShow = filesToShow.filter(file => favorites.includes(file.name));
    }

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
    document.getElementById('file-count').textContent = `${filesToShow.length} files`;
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
    notifications.showLoading(`Preparing download for ${fileName}...`);
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;
    const { data } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    window.open(data.publicUrl, '_blank');
    notifications.hideLoading();
    notifications.add(`Downloaded ${fileName}`, 'success');
}

async function deleteFile(fileName) {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;
    notifications.showLoading(`Deleting ${fileName}...`);
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;
    const { error } = await db.storage.from(BUCKET_NAME).remove([filePath]);
    notifications.hideLoading();
    if (!error) {
        notifications.add(`${fileName} deleted.`, 'success');
        loadFiles();
    }
}

async function shareFile(fileName) {
    const targetEmail = prompt(`Enter the email address to share "${fileName}" with:`);
    if (!targetEmail || !targetEmail.includes('@')) {
        notifications.add('Invalid email address. Share cancelled.', 'error');
        return;
    }

    notifications.showLoading('Sharing file...');
    const { data: { user } } = await db.auth.getUser();
    const filePath = `${user.id}/${fileName}`;

    const { error } = await db.from('shared_files').insert({
        owner_id: user.id,
        shared_with_email: targetEmail,
        file_name: fileName,
        file_path: filePath
    });

    notifications.hideLoading();
    if (error) {
        notifications.add(`Failed to share: ${error.message}`, 'error');
    } else {
        notifications.add(`Successfully shared ${fileName} with ${targetEmail}`, 'success');
    }
}

async function renameFile(oldName) {
    const newName = prompt('Enter new file name:', oldName);
    if (!newName || newName === oldName) return;

    notifications.showLoading('Renaming file...');
    const { data: { user } } = await db.auth.getUser();
    const oldPath = `${user.id}/${oldName}`;
    const newPath = `${user.id}/${newName}`;

    const { data: fileData } = await db.storage.from(BUCKET_NAME).download(oldPath);
    if (!fileData) {
        notifications.hideLoading();
        notifications.add('Error fetching file for rename.', 'error');
        return;
    }

    const { error: uploadError } = await db.storage.from(BUCKET_NAME).upload(newPath, fileData, { upsert: true });
    if (uploadError) {
        notifications.hideLoading();
        notifications.add(`Rename error: ${uploadError.message}`, 'error');
        return;
    }

    const { error: deleteError } = await db.storage.from(BUCKET_NAME).remove([oldPath]);
    notifications.hideLoading();
    
    if (!deleteError) {
        notifications.add(`Renamed to ${newName}`, 'success');
        loadFiles();
    }
}
