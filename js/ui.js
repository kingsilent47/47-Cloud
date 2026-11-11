const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const logoutBtn = document.getElementById('logout-btn');
const authMessage = document.getElementById('auth-message');
const fileList = document.getElementById('file-list');

export const ui = {
    authSection,
    dashboardSection,
    logoutBtn,
    authMessage,
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
    }
};
