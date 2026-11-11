import { db } from './config.js';
import { ui } from './ui.js';
import { notifications } from './notifications.js';

const MAX_BYTES = 5 * 1024 * 1024 * 1024;

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
let currentFolderId = null;
let folderPathCache = [];
let currentUserId = null;
let favoritesCache = [];

let allFilesCache = [];
let allFoldersCache = [];
let sharedFilesCache = [];
let selectedFile = null;

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function api(path, body) {
    const { data: { session } } = await db.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
}

async function r2Error(res) {
    const text = await res.text().catch(() => '');
    const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1];
    const message = (text.match(/<Message>([^<]+)<\/Message>/) || [])[1];
    return new Error(`R2 ${res.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`);
}

const favKey = () => `47cloud_favorites_${currentUserId}`;
const loadFavorites = () => {
    try { favoritesCache = JSON.parse(localStorage.getItem(favKey()) || '[]'); }
    catch { favoritesCache = []; }
};
const saveFavorites = () => localStorage.setItem(favKey(), JSON.stringify(favoritesCache));

function toggleFavorite(name) {
    if (favoritesCache.includes(name)) favoritesCache = favoritesCache.filter(f => f !== name);
    else favoritesCache.push(name);
    saveFavorites();
    renderFilteredFiles();
}

export function initStorageEvents() {
    notifications.init();

    uploadBtn.addEventListener('click', () => fileInput.click());
    if (quickUploadBtn) quickUploadBtn.addEventListener('click', () => fileInput.click());
    if (newFolderBtn) newFolderBtn.addEventListener('click', () => createFolder());
    if (quickNewFolderBtn) quickNewFolderBtn.addEventListener('click', () => createFolder());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        if (file.size > MAX_BYTES) {
            notifications.add(`${file.name} is larger than the 5 GB single-upload limit.`, 'error');
            fileInput.value = '';
            return;
        }

        notifications.showLoading(`Uploading ${file.name}...`);
        try {
            const { data: { user } } = await db.auth.getUser();
            const { url } = await api('/.netlify/functions/r2-presign', {
                action: 'upload',
                fileName: file.name,
                userId: user.id,
                folderId: currentFolderId
            });

            const uploadRes = await fetch(url, { method: 'PUT', body: file });
            if (!uploadRes.ok) throw await r2Error(uploadRes);

            notifications.hideLoading();
            notifications.add(`${file.name} uploaded successfully.`, 'success');
            loadDirectory();
        } catch (error) {
            notifications.hideLoading();
            notifications.add(`Failed to upload ${file.name}: ${error.message}`, 'error');
        }
        fileInput.value = '';
    });

    if (searchInput) searchInput.addEventListener('input', () => renderFilteredFiles());
    if (sortSelect) sortSelect.addEventListener('change', (e) => { currentSort = e.target.value; renderFilteredFiles(); });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderFilteredFiles();
        });
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            if (!view) return;
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            currentView = view;
            currentFolderId = null;
            folderPathCache = [];
            renderBreadcrumbs();

            if (view === 'shared') {
                currentViewTitle.textContent = 'Shared with Me';
                await loadSharedFiles();
            } else {
                currentViewTitle.textContent = view === 'favorites' ? 'Favorites' : 'All Files';
                await loadDirectory();
            }
        });
    });

    ui.fileList.addEventListener('contextmenu', (e) => {
        if (currentView === 'shared') return;
        const row = e.target.closest('tr');
        if (!row || !row.dataset.type) return;
        e.preventDefault();

        selectedFile = { name: row.dataset.name, type: row.dataset.type, id: row.dataset.id };
        const isFolder = selectedFile.type === 'folder';

        contextMenu.querySelector('[data-action="open"]').style.display = isFolder ? 'block' : 'none';
        contextMenu.querySelector('[data-action="download"]').style.display = isFolder ? 'none' : 'block';
        contextMenu.querySelector('[data-action="share"]').style.display = isFolder ? 'none' : 'block';
        contextMenu.querySelector('[data-action="favorite"]').style.display = isFolder ? 'none' : 'block';
        contextMenu.querySelector('[data-action="favorite"]').textContent =
            favoritesCache.includes(selectedFile.name) ? 'Remove from Favorites' : 'Add to Favorites';

        contextMenu.classList.remove('hidden');
        const rect = contextMenu.getBoundingClientRect();
        const x = Math.min(e.clientX, window.innerWidth - rect.width - 8);
        const y = Math.min(e.clientY, window.innerHeight - rect.height - 8);
        contextMenu.style.left = `${Math.max(8, x)}px`;
        contextMenu.style.top = `${Math.max(8, y)}px`;
    });

    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    });

    contextMenu.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn || !selectedFile) return;
        const action = btn.dataset.action;
        contextMenu.classList.add('hidden');

        if (action === 'open' && selectedFile.type === 'folder') navigateToFolder(selectedFile.id, selectedFile.name);
        else if (action === 'download') await downloadFile(selectedFile.name);
        else if (action === 'favorite') toggleFavorite(selectedFile.name);
        else if (action === 'share') await shareFile(selectedFile.name);
        else if (action === 'rename') {
            if (selectedFile.type === 'folder') await renameFolder(selectedFile.id, selectedFile.name);
            else await renameFile(selectedFile.name);
        } else if (action === 'delete') {
            if (selectedFile.type === 'folder') await deleteFolder(selectedFile.id, selectedFile.name);
            else await deleteFile(selectedFile.name);
        }
    });

    ui.fileList.addEventListener('dblclick', (e) => {
        const row = e.target.closest('tr');
        if (!row || row.dataset.type !== 'folder') return;
        navigateToFolder(row.dataset.id, row.dataset.name);
    });

    ui.fileList.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'download-shared') {
            await downloadShared(btn.dataset.name, btn.dataset.owner, btn.dataset.folder || null);
            return;
        }

        const row = btn.closest('tr');
        const name = btn.dataset.name;
        if (action === 'favorite') toggleFavorite(name);
        else if (action === 'download') await downloadFile(name);
        else if (action === 'delete') {
            if (row && row.dataset.type === 'folder') await deleteFolder(row.dataset.id, name);
            else await deleteFile(name);
        }
    });
}

export async function loadDirectory() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    currentUserId = user.id;
    loadFavorites();

    notifications.showLoading('Loading files...');
    try {
        let folderQuery = db.from('folders').select('*').eq('user_id', user.id);
        folderQuery = currentFolderId === null
            ? folderQuery.is('parent_id', null)
            : folderQuery.eq('parent_id', currentFolderId);
        const { data: folders } = await folderQuery;
        allFoldersCache = folders || [];

        const prefix = currentFolderId ? `${user.id}/${currentFolderId}/` : `${user.id}/`;
        const { contents } = await api('/.netlify/functions/r2-list', { prefix });
        allFilesCache = contents || [];

        notifications.hideLoading();
        renderFilteredFiles();
        await refreshUsage();
    } catch (error) {
        notifications.hideLoading();
        notifications.add(`Failed to load files: ${error.message}`, 'error');
    }
}

async function refreshUsage() {
    try {
        const { objects } = await api('/.netlify/functions/r2-presign', { action: 'usage', userId: currentUserId });
        updateStorageOverview(objects || []);
    } catch {
        updateStorageOverview(allFilesCache);
    }
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
    if (currentView === 'shared') {
        breadcrumbsContainer.classList.add('hidden');
        return;
    }
    breadcrumbsContainer.classList.remove('hidden');

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
        user_id: user.id, name: name.trim(), parent_id: currentFolderId
    });
    notifications.hideLoading();
    if (error) notifications.add(`Failed to create folder: ${error.message}`, 'error');
    else { notifications.add(`Folder "${name}" created.`, 'success'); loadDirectory(); }
}

async function deleteFolder(folderId, folderName) {
    if (!confirm(`Delete folder "${folderName}" and all files inside it?`)) return;
    notifications.showLoading('Deleting folder...');
    try {
        const { data: { user } } = await db.auth.getUser();
        await api('/.netlify/functions/r2-presign', { action: 'delete-folder', userId: user.id, folderId });
        const { error } = await db.from('folders').delete().eq('id', folderId).eq('user_id', user.id);
        if (error) throw new Error(error.message);
        notifications.hideLoading();
        notifications.add(`Folder "${folderName}" deleted.`, 'success');
        loadDirectory();
    } catch (error) {
        notifications.hideLoading();
        notifications.add(`Failed to delete folder: ${error.message}`, 'error');
    }
}

async function renameFolder(folderId, oldName) {
    const newName = prompt('Enter new folder name:', oldName);
    if (!newName || newName === oldName) return;

    notifications.showLoading('Renaming folder...');
    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from('folders').update({ name: newName }).eq('id', folderId).eq('user_id', user.id);
    notifications.hideLoading();
    if (error) notifications.add(`Failed to rename folder: ${error.message}`, 'error');
    else { notifications.add(`Folder renamed to "${newName}".`, 'success'); loadDirectory(); }
}

async function loadSharedFiles() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    currentUserId = user.id;

    notifications.showLoading('Loading shared files...');
    const { data, error } = await db.from('shared_files').select('*').eq('shared_with_email', user.email);
    notifications.hideLoading();
    if (error) {
        notifications.add(`Failed to load shared files: ${error.message}`, 'error');
        sharedFilesCache = [];
    } else {
        sharedFilesCache = data || [];
    }
    renderSharedFiles();
}

function renderSharedFiles() {
    if (!ui.fileList) return;
    ui.fileList.innerHTML = '';

    if (!sharedFilesCache.length) {
        ui.fileList.innerHTML = '<tr><td colspan="4" class="empty-cell">No files have been shared with you.</td></tr>';
        document.getElementById('file-count').textContent = '0 files';
        return;
    }

    sharedFilesCache.forEach(file => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="name-cell">${escapeHtml(file.file_name)}</td>
            <td>-</td>
            <td class="muted-cell">${new Date(file.created_at).toLocaleDateString()}</td>
            <td>
                <button class="action-link" data-action="download-shared"
                    data-name="${escapeHtml(file.file_name)}"
                    data-owner="${escapeHtml(file.owner_id)}"
                    data-folder="${escapeHtml(file.folder_id || '')}">Download</button>
            </td>`;
        ui.fileList.appendChild(row);
    });
    document.getElementById('file-count').textContent = `${sharedFilesCache.length} files`;
}

async function downloadShared(fileName, ownerId, folderId) {
    notifications.showLoading(`Preparing download for ${fileName}...`);
    try {
        const { url } = await api('/.netlify/functions/r2-presign', {
            action: 'download', fileName, userId: ownerId, folderId: folderId || null
        });
        window.open(url, '_blank');
        notifications.hideLoading();
        notifications.add(`Downloaded ${fileName}`, 'success');
    } catch (error) {
        notifications.hideLoading();
        notifications.add(`Failed to download ${fileName}: ${error.message}`, 'error');
    }
}

function sortFiles(files) {
    const sorted = [...files];
    switch (currentSort) {
        case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
        case 'size-desc': return sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
        case 'size-asc': return sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
        case 'date-asc': return sorted.sort((a, b) => new Date(a.lastModified) - new Date(b.lastModified));
        default: return sorted.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    }
}

function renderFilteredFiles() {
    let filesToShow = [...allFilesCache];
    let foldersToShow = [...allFoldersCache];
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    if (currentView === 'favorites') {
        filesToShow = filesToShow.filter(file => favoritesCache.includes(file.name));
        foldersToShow = [];
    }

    if (currentFilter !== 'all') {
        filesToShow = filesToShow.filter(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (currentFilter === 'documents') return ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'zip', 'ppt', 'pptx'].includes(ext);
            if (currentFilter === 'images') return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext);
            if (currentFilter === 'videos') return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
            return !['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'zip', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
        });
    }

    if (searchTerm) {
        filesToShow = filesToShow.filter(file => file.name.toLowerCase().includes(searchTerm));
        foldersToShow = foldersToShow.filter(folder => folder.name.toLowerCase().includes(searchTerm));
    }

    filesToShow = sortFiles(filesToShow);
    foldersToShow.sort((a, b) => a.name.localeCompare(b.name));

    if (!ui.fileList) return;
    ui.fileList.innerHTML = '';

    if (!foldersToShow.length && !filesToShow.length) {
        ui.fileList.innerHTML = '<tr><td colspan="4" class="empty-cell">This folder is empty.</td></tr>';
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
            <td class="name-cell">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>${escapeHtml(folder.name)}</span>
            </td>
            <td class="muted-cell">-</td>
            <td class="muted-cell">${new Date(folder.created_at).toLocaleDateString()}</td>
            <td><button class="action-link danger" data-action="delete" data-name="${escapeHtml(folder.name)}">Delete</button></td>`;
        ui.fileList.appendChild(row);
    });

    filesToShow.forEach(file => {
        const row = document.createElement('tr');
        row.dataset.type = 'file';
        row.dataset.name = file.name;
        const isFav = favoritesCache.includes(file.name);
        const sizeKB = file.size ? (file.size / 1024).toFixed(1) : '0.0';
        const date = file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Unknown';
        row.innerHTML = `
            <td class="name-cell">
                <button class="fav-btn ${isFav ? 'active' : ''}" data-action="favorite" data-name="${escapeHtml(file.name)}" aria-label="Toggle favorite">${isFav ? '★' : '☆'}</button>
                <span>${escapeHtml(file.name)}</span>
            </td>
            <td>${sizeKB} KB</td>
            <td class="muted-cell">${date}</td>
            <td>
                <button class="action-link" data-action="download" data-name="${escapeHtml(file.name)}">Download</button>
                <button class="action-link danger" data-action="delete" data-name="${escapeHtml(file.name)}">Delete</button>
            </td>`;
        ui.fileList.appendChild(row);
    });

    document.getElementById('file-count').textContent = `${foldersToShow.length + filesToShow.length} items`;
}

function updateStorageOverview(files) {
    let totalBytes = 0;
    const types = { Images: 0, Documents: 0, Videos: 0, Others: 0 };
    files.forEach(file => {
        const size = file.size || 0;
        totalBytes += size;
        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) types.Images += size;
        else if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'zip', 'ppt', 'pptx'].includes(ext)) types.Documents += size;
        else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) types.Videos += size;
        else types.Others += size;
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
            </div>`).join('');
    }
}

async function downloadFile(fileName) {
    notifications.showLoading(`Preparing download for ${fileName}...`);
    try {
        const { data: { user } } = await db.auth.getUser();
        const { url } = await api('/.netlify/functions/r2-presign', {
            action: 'download', fileName, userId: user.id, folderId: currentFolderId
        });
        window.open(url, '_blank');
        notifications.hideLoading();
        notifications.add(`Downloaded ${fileName}`, 'success');
    } catch (error) {
        notifications.hideLoading();
        notifications.add(`Failed to download ${fileName}: ${error.message}`, 'error');
    }
}

async function deleteFile(fileName) {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;
    notifications.showLoading(`Deleting ${fileName}...`);
    try {
        const { data: { user } } = await db.auth.getUser();
        await api('/.netlify/functions/r2-presign', {
            action: 'delete', fileName, userId: user.id, folderId: currentFolderId
        });
        notifications.hideLoading();
        notifications.add(`${fileName} deleted.`, 'success');
        loadDirectory();
    } catch (error) {
        notifications.hideLoading();
        notifications.add(`Failed to delete ${fileName}: ${error.message}`, 'error');
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
    const filePath = currentFolderId ? `${user.id}/${currentFolderId}/${fileName}` : `${user.id}/${fileName}`;
    const { error } = await db.from('shared_files').insert({
        owner_id: user.id,
        shared_with_email: targetEmail.trim().toLowerCase(),
        file_name: fileName,
        file_path: filePath,
        folder_id: currentFolderId
    });
    notifications.hideLoading();
    if (error) notifications.add(`Failed to share: ${error.message}`, 'error');
    else notifications.add(`Successfully shared ${fileName} with ${targetEmail}`, 'success');
}

async function renameFile(oldName) {
    const newName = prompt('Enter new file name:', oldName);
    if (!newName || newName === oldName || newName.includes('/')) return;

    notifications.showLoading('Renaming file...');
    try {
        const { data: { user } } = await db.auth.getUser();
        await api('/.netlify/functions/r2-presign', {
            action: 'rename', fileName: oldName, newName, userId: user.id, folderId: currentFolderId
        });
        if (favoritesCache.includes(oldName)) {
            favoritesCache = favoritesCache.map(f => f === oldName ? newName : f);
            saveFavorites();
        }
        notifications.hideLoading();
        notifications.add(`Renamed to ${newName}`, 'success');
        loadDirectory();
    } catch (error) {
        notifications.hideLoading();
        notifications.add(`Failed to rename: ${error.message}`, 'error');
    }
}
