import { db } from './config.js';
import { ui } from './ui.js';

let isSignUp = false;
const authForm = document.getElementById('auth-form');
const signupToggleBtn = document.getElementById('signup-btn');

export async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        ui.showDashboardView();
        return true; 
    } else {
        ui.showAuthView();
        return false;
    }
}

export function initAuthEvents(loadFilesCallback) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        ui.showAuthMessage('Processing...');
        
        if (isSignUp) {
            const { error } = await db.auth.signUp({ email, password });
            if (error) ui.showAuthMessage(error.message, true);
            else {
                ui.showAuthMessage('Account created. Please sign in.');
                isSignUp = false;
                signupToggleBtn.textContent = 'Create Account';
            }
        } else {
            const { error } = await db.auth.signInWithPassword({ email, password });
            if (error) ui.showAuthMessage(error.message, true);
            else {
                ui.showAuthMessage('');
                ui.showDashboardView();
                loadFilesCallback();
            }
        }
    });

    signupToggleBtn.addEventListener('click', () => {
        isSignUp = !isSignUp;
        signupToggleBtn.textContent = isSignUp ? 'Cancel Sign Up' : 'Create Account';
        ui.showAuthMessage('');
    });

    ui.logoutBtn.addEventListener('click', async () => {
        await db.auth.signOut();
        ui.showAuthView();
        ui.showAuthMessage('');
    });
}
