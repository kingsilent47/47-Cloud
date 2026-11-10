import { db } from './config.js';
import { checkSession, initAuthEvents } from './auth.js';
import { initStorageEvents, loadFiles } from './storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    initStorageEvents();
    initAuthEvents(loadFiles);
    
    const isLoggedIn = await checkSession();
    if (isLoggedIn) {
        loadFiles();
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
                passwordMessage.style.color = '#16a34a';
                passwordForm.reset();
            }
        });
    }

    // Mobile Menu Toggle Logic
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuToggle && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
        });
    }

    if (sidebarOverlay && sidebar) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Close menu when a nav item is clicked on mobile
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            }
        });
    });
});

async function loadUserSettings() {
    const { data: { user } } = await db.auth.getUser();
    const emailInput = document.getElementById('settings-email');
    if (user && emailInput) {
        emailInput.value = user.email;
    }
}
