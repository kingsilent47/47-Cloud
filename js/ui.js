const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const logoutBtn = document.getElementById('logout-btn');
const authMessage = document.getElementById('auth-message');
const uploadStatus = document.getElementById('upload-status');
const fileList = document.getElementById('file-list');

export const ui = {
    authSection,
    dashboardSection,
    logoutBtn,
    authMessage,
    uploadStatus,
    fileList,
    
    showAuthView: () => {
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    },
    
    showDashboardView: () => {
        authSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
    },
    
    showAuthMessage: (text, isError = false) => {
        authMessage.textContent = text;
        authMessage.style.color = isError ? '#dc2626' : '#737373';
    },
    
    showUploadStatus: (text) => {
        if (uploadStatus) uploadStatus.textContent = text;
    },
    
    renderFiles: (files) => {
        if (!fileList) return;
        fileList.innerHTML = '';
        
        if (!files || files.length === 0) {
            fileList.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted); padding: 32px;">No files uploaded yet.</td></tr>';
            return;
        }

        files.forEach(file => {
            const row = document.createElement('tr');
            const sizeKB = file.metadata ? (file.metadata.size / 1024).toFixed(1) : '0.0';
            const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString() : 'Unknown';
            
            row.innerHTML = `
                <td style="font-weight: 500;">${file.name}</td>
                <td>${sizeKB} KB</td>
                <td style="color: var(--muted);">${date}</td>
                <td>
                    <button class="action-link" data-action="download" data-name="${file.name}">Download</button>
                    <button class="action-link danger" data-action="delete" data-name="${file.name}">Delete</button>
                </td>
            `;
            fileList.appendChild(row);
        });
    }
};
