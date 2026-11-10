import { checkSession, initAuthEvents } from './auth.js';
import { initStorageEvents, loadFiles } from './storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    initStorageEvents();
    initAuthEvents(loadFiles);
    
    const isLoggedIn = await checkSession();
    if (isLoggedIn) {
        loadFiles();
    }
});
