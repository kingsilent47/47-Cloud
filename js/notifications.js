export const notifications = {
    overlay: null,
    dropdown: null,
    list: null,
    badge: null,

    init: () => {
        notifications.overlay = document.getElementById('loading-overlay');
        notifications.dropdown = document.getElementById('notification-dropdown');
        notifications.list = document.getElementById('notification-list');
        notifications.badge = document.getElementById('notification-badge');
        
        // Toggle dropdown
        const bellBtn = document.getElementById('notification-bell');
        if (bellBtn) {
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notifications.dropdown.classList.toggle('hidden');
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            if (notifications.dropdown) notifications.dropdown.classList.add('hidden');
        });
    },

    showLoading: (message = 'Processing...') => {
        if (notifications.overlay) {
            document.getElementById('loading-message').textContent = message;
            notifications.overlay.classList.remove('hidden');
        }
    },

    hideLoading: () => {
        if (notifications.overlay) {
            notifications.overlay.classList.add('hidden');
        }
    },

    add: (message, type = 'info') => {
        if (!notifications.list) return;

        const item = document.createElement('div');
        item.className = `notification-item ${type}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        item.innerHTML = `<p>${message}</p><span class="notification-time">${time}</span>`;
        
        notifications.list.prepend(item);
        
        // Update badge
        const count = notifications.list.children.length;
        if (notifications.badge) {
            notifications.badge.textContent = count;
            notifications.badge.classList.remove('hidden');
        }

        // Auto-hide after 5 seconds
        setTimeout(() => {
            item.remove();
            if (notifications.list.children.length === 0 && notifications.badge) {
                notifications.badge.classList.add('hidden');
            }
        }, 5000);
    }
};
