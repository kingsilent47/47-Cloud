import { db } from './config.js';
import { checkSession, initAuthEvents } from './auth.js';
import { initStorageEvents, loadDirectory } from './storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    initStorageEvents();
    initAuthEvents(loadDirectory);
    
    const isLoggedIn = await checkSession();
    if (isLoggedIn) {
        loadDirectory();
        loadUserSettings();
    }

    // Settings Navigation Logic
    const navSettings = document.getElementById('nav-settings');
    const backToDashboard = document.getElementById('back-to-dashboard');
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const settingsView = document.getElementById('settings-view');

    if (navSettings) {
        navSettings.addEventListener('click', (e) => {
            e.preventDefault();
            if (dashboardGrid) dashboardGrid.classList.add('hidden');
            if (settingsView) settingsView.classList.remove('hidden');
            loadUserSettings();
        });
    }

    if (backToDashboard) {
        backToDashboard.addEventListener('click', () => {
            if (settingsView) settingsView.classList.add('hidden');
            if (dashboardGrid) dashboardGrid.classList.remove('hidden');
        });
    }

    // Password Update Logic
    const passwordForm = document.getElementById('password-form');
    const passwordMessage = document.getElementById('password-message');

    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;

            if (newPass !== confirmPass) {
                passwordMessage.textContent = 'Passwords do not match.';
                passwordMessage.style.color = '#dc2626';
                return;
            }

            passwordMessage.textContent = 'Updating...';
            passwordMessage.style.color = 'var(--muted-color)';

            const { error } = await db.auth.updateUser({ password: newPass });

            if (error) {
                passwordMessage.textContent = error.message;
                passwordMessage.style.color = '#dc2626';
            } else {
                passwordMessage.textContent = 'Password updated successfully.';
