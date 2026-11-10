import { db, BUCKET_NAME } from './config.js';
import { ui } from './ui.js';

const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const quickUploadBtn = document.getElementById('quick-upload');

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
        ui.renderFiles([]);
        updateStorageOverview([]);
        return;
    }

    ui.renderFiles(data);
    updateStorageOverview(data);
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

    const countEl = document.getElementById('file-count');
    if (countEl) countEl.textContent = `${files.length} files`;
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
    if (!error) loadFiles();
}
