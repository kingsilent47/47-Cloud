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
const breadcrumbsContainer = document.getElementById('breadcrumbs');
const newFolderBtn = document.getElementById('new-folder-btn');
const quickNewFolderBtn = document.getElementById('quick-new-folder');

let currentView = 'all';
let currentSort = 'date-desc';
let currentFilter = 'all';
let currentFolderId = null; // null means root directory
let folderPathCache = []; // Stores folder history for breadcrumbs

let allFilesCache = [];
let allFoldersCache = [];
let selectedFile = null; // { name, type: 'file' | 'folder', id }
let sharedFilesCache = [];

export function initStorageEvents() {
    notifications.init();

    uploadBtn.addEventListener('click', () => fileInput.click());
    if (quickUploadBtn) quickUploadBtn.addEventListener('click', () => fileInput.click());
    if (newFolderBtn) newFolderBtn.addEventListener('click', () => createFolder());
    if (quickNewFolderBtn) quickNewFolderBtn.addEventListener('click', () => createFolder());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        notifications.showLoading(`Uploading ${file.name}...`);
        const { data: { user } } = await db.auth.getUser();
        
        // Construct path: user_id/folder_id/file_name (or user_id/file_name if root)
        let filePath = `${user.id}/`;
        if (currentFolderId) filePath += `${currentFolderId}/`;
        filePath += file.name;

        const { error } = await db.storage.from(BUCKET_NAME).upload(filePath, file, { upsert: true });
        
        notifications.hideLoading();
        
        if (error) {
            notifications.add(`Failed to upload ${file.name}: ${error.message}`, 'error');
        } else {
            notifications.add(`${file.name} uploaded successfully.`, 'success');
            loadDirectory();
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
            
            // Reset folder state when switching main views
            currentFolderId = null;
            folderPathCache = [];
            renderBreadcrumbs();

            if (view === 'all' || view === 'files') {
                currentViewTitle.textContent = 'All Files';
                await loadDirectory();
            } else if (view === 'favorites') {
                currentViewTitle.textContent = 'Favorites';
                await loadDirectory();
            } else if (view === 'shared') {
                currentViewTitle.textContent = 'Shared with Me';
                await loadSharedFiles();
            }
        });
    });

    // Context Menu Logic
    ui.fileList.addEventListener('contextmenu', (e) => {
        if (currentView === 'shared') return;
        const row = e.target.closest('tr');
        if (!row) return;
        e.preventDefault();
        
        const name = row.dataset.name;
        const type = row.dataset.type;
        const id = row.dataset.id;
        selectedFile = { name, type, id };

        // Update context menu text based on type
        const openBtn = contextMenu.querySelector('[data-action="open"]');
        if (type === 'folder') {
            openBtn.textContent = 'Open Folder';
            openBtn.style.display = 'block';
        } else {
            openBtn.textContent = 'Download'; // Repurpose open for files as download
            openBtn.style.display = 'none'; // Hide open for files, use download btn instead
        }

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

        if (!selectedFile) return;

        if (action === 'open' && selectedFile.type === 'folder') {
            navigateToFolder(selectedFile.id, selectedFile.name);
        } else if (action === 'download' && selectedFile.type === 'file') {
            await downloadFile(selectedFile.name);
        } else if (action === 'delete') {
            if (selectedFile.type === 'folder') await deleteFolder(selectedFile.id, selectedFile.name);
            else await deleteFile(selectedFile.name);
        } else if (action === 'share' && selectedFile.type === 'file') {
            await shareFile(selectedFile.name);
        } else if (action === 'rename') {
            if (selectedFile.type === 'folder') await renameFolder(selectedFile.id, selectedFile.name);
            else await renameFile(selectedFile.name);
        }
    });

    // Double click to open folder
    ui.fileList.addEventListener('dblclick', (e) => {
        const row = e.target.closest('tr');
        if (!row || row.dataset.type !== 'folder') return;
        navigateToFolder(row.dataset.id, row.dataset.name);
    });

    ui.fileList.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        const fileName = target.dataset.name;
        if (action === 'download') await downloadFile(fileName);
        else if (action === 'delete') await deleteFile(fileName);
    });

    const clearBtn = document.getElementById('clear-notifications');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('notification-list').innerHTML = '<div class="notification-empty">No new notifications</div>';
            document.getElementById('notification-badge').classList.add('hidden');
        });
    }
}

export async function loadDirectory() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    notifications.showLoading('Loading files...');

    // 1. Fetch Folders
    let folderQuery = db.from('folders').select('*').eq('user_id', user.id);
    if (currentFolderId === null) {
        folderQuery = folderQuery.is('parent_id', null);
    } else {
        folderQuery = folderQuery.eq('parent_id', currentFolderId);
    }
    const { data: folders, error: folderError } = await folderQuery;
    allFoldersCache = folderError ? [] : folders;

    // 2. Fetch Files
    let pathPrefix = `${user.id}/`;
    if (currentFolderId) pathPrefix += `${currentFolderId}/`;
    
    const { data: files, error: fileError } = await db.storage.from(BUCKET_NAME).list(pathPrefix, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'updated_at', order: 'desc' }
    });
    
    // Filter out "empty" folder placeholders if any, and ensure they are files
    allFilesCache = fileError ? [] : (files || []).filter(f => !f.name.endsWith('/') && f.id !== 'folder_placeholder');

    notifications.hideLoading();
    renderFilteredFiles();
    updateStorageOverview(allFilesCache); // Simplified storage calc
}

function navigateToFolder(folderId, folderName) {
    currentFolderId = folderId;
    folderPathCache.push({ id: folderId, name: folderName });
    renderBreadcrumbs();
    loadDirectory();
}

function navigateToBreadcrumb(index) {
    if (index === -1) {
        currentFolderId = null;
        folderPathCache = [];
    } else {
        currentFolderId = folderPathCache[index].id;
        folderPathCache = folderPathCache.slice(0, index + 1);
    }
    renderBreadcrumbs();
    loadDirectory();
}

function renderBreadcrumbs() {
    if (!breadcrumbsContainer) return;
    breadcrumbsContainer.innerHTML = '';
    
    if (currentView !== 'all' && currentView !== 'files' && currentView !== 'favorites') {
        breadcrumbsContainer.classList.add('hidden');
        return;
    }
    
    breadcrumbsContainer.classList.remove('hidden');

    // Root button
    const rootBtn = document.createElement('button');
    rootBtn.className = `breadcrumb-item ${currentFolderId === null ? 'active' : ''}`;
    rootBtn.textContent = 'Root';
    rootBtn.onclick = () => navigateToBreadcrumb(-1);
    breadcrumbsContainer.appendChild(rootBtn);

    folderPathCache.forEach((folder, index) => {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '/';
        breadcrumbsContainer.appendChild(sep);

        const btn = document.createElement('button');
        btn.className = `breadcrumb-item ${index === folderPathCache.length - 1 ? 'active' : ''}`;
        btn.textContent = folder.name;
        btn.onclick = () => navigateToBreadcrumb(index);
        breadcrumbsContainer.appendChild(btn);
    });
}

async function createFolder() {
    const name = prompt('Enter folder name:');
    if (!name || !name.trim()) return;

    notifications.showLoading('Creating folder...');
    const { data: { user } } = await db.auth.getUser();

    const { error } = await db.from('folders').insert({
        user_id: user.id,
        name: name.trim(),
        parent_id: currentFolderId
    });

    notifications.hideLoading();
    if (error) {
        notifications.add(`Failed to create folder: ${error.message}`, 'error');
    } else {
        notifications.add(`Folder "${name}" created.`, 'success');
        loadDirectory();
    }
}

async function deleteFolder(folderId, folderName) {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}" and all its contents?`)) return;
    
    notifications.showLoading('Deleting folder...');
    const { data: { user } } = await db.auth.getUser();
    
    // Note: In a production app, you would recursively delete files in storage here.
    // For this iteration, we delete the folder record.
    const { error } = await db.from('folders').delete().eq('id', folderId).eq('user_id', user.id);
    
    notifications.hideLoading();
    if (error) {
        notifications.add(`Failed to delete folder: ${error.message}`, 'error');
    } else {
        notifications.add(`Folder "${folderName}" deleted.`, 'success');
        loadDirectory();
    }
}

async function renameFolder(folderId, oldName) {
    const newName = prompt('Enter new folder name:', oldName);
    if (!newName || newName === oldName) return;

    notifications.showLoading('Renaming folder...');
    const { data: { user } } = await db.auth.getUser();

    const { error } = await db.from('folders').update({ name: newName }).eq('id', folderId).eq('user_id', user.id);
    
    notifications.hideLoading();
    if (error) {
        notifications.add(`Failed to rename folder: ${error.message}`, 'error');
    } else {
        notifications.add(`Folder renamed to "${newName}".`, 'success');
        loadDirectory();
    }
}

async function loadSharedFiles() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    notifications.showLoading('Loading shared files...');
    const { data, error } = await db.from('shared_files').select('*').eq('shared_with_email', user.email);
    notifications.hideLoading();

    if (error || !data) sharedFilesCache = [];
    else sharedFilesCache = data;
    
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
    let foldersToShow = [...allFoldersCache];
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    if (currentView === 'favorites') {
        const favorites = JSON.parse(localStorage.getItem('47cloud_favorites') || '[]');
        filesToShow = filesToShow.filter(file => favorites.includes(file.name));
        foldersToShow = []; // Don't show folders in favorites for simplicity
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

    if (searchTerm) {
        filesToShow = filesToShow.filter(file => file.name.toLowerCase().includes(searchTerm));
        foldersToShow = foldersToShow.filter(folder => folder.name.toLowerCase().includes(searchTerm));
    }

    filesToShow = sortFiles(filesToShow);
    foldersToShow.sort((a, b) => a.name.localeCompare(b.name));

    // Render Folders first, then Files
    if (!ui.fileList) return;
    ui.fileList.innerHTML = '';

    if (foldersToShow.length === 0 && filesToShow.length === 0) {
        ui.fileList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted-color); padding: 32px;">This folder is empty.</td></tr>';
        document.getElementById('file-count').textContent = '0 items';
        return;
    }

    foldersToShow.forEach(folder => {
        const row = document.createElement('tr');
        row.className = 'folder-row';
        row.dataset.type = 'folder';
        row.dataset.id = folder.id;
        row.dataset.name = folder.name;
        row.innerHTML = `
            <td style="font-weight: 500; display: flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                ${folder.name}
            </td>
            <td style="color: var(--muted-color);">-</td>
            <td style="color: var(--muted-color);">${new Date(folder.created_at).toLocaleDateString()}</td>
            <td>
                <button class="action-link danger" data-action="delete" data-name="${folder.name}" onclick="event.stopPropagation()">Delete</button>
            </td>
        `;
        ui.fileList.appendChild(row);
    });

    filesToShow.forEach(file => {
        const row = document.createElement('tr');
        row.dataset.type = 'file';
        row.dataset.name = file.name;
        const sizeKB = file.metadata ? (file.metadata.size / 1024).toFixed(1) : '0.0';
        const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString() : 'Unknown';
        
        row.innerHTML = `
            <td style="font-weight: 500;">${file.name}</td>
            <td>${sizeKB} KB</td>
            <td style="color: var(--muted-color);">${date}</td>
            <td>
                <button class="action-link" data-action="download" data-name="${file.name}">Download</button>
                <button class="action-link danger" data-action="delete" data-name="${file.name}">Delete</button>
            </td>
        `;
        ui.fileList.appendChild(row);
    });

    document.getElementById('file-count').textContent = `${foldersToShow.length + filesToShow.length} items`;
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
    
    let filePath = `${user.id}/`;
    if (currentFolderId) filePath += `${currentFolderId}/`;
    filePath += fileName;

    const { data } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    window.open(data.publicUrl, '_blank');
    notifications.hideLoading();
    notifications.add(`Downloaded ${fileName}`, 'success');
}

async function deleteFile(fileName) {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;
    notifications.showLoading(`Deleting ${fileName}...`);
    const { data: { user } } = await db.auth.getUser();
    
    let filePath = `${user.id}/`;
    if (currentFolderId) filePath += `${currentFolderId}/`;
    filePath += fileName;

    const { error } = await db.storage.from(BUCKET_NAME).remove([filePath]);
    notifications.hideLoading();
    if (!error) {
        notifications.add(`${fileName} deleted.`, 'success');
        loadDirectory();
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
    
    let filePath = `${user.id}/`;
    if (currentFolderId) filePath += `${currentFolderId}/`;
    filePath += fileName;

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
    
    let oldPath = `${user.id}/`;
    let newPath = `${user.id}/`;
    if (currentFolderId) { oldPath += `${currentFolderId}/`; newPath += `${currentFolderId}/`; }
    oldPath += oldName;
    newPath += newName;

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
        loadDirectory();
    }
}
