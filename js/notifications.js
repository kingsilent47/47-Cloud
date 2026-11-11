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
        document.addEventListener('click', (e) => {
            if (notifications.dropdown && !notifications.dropdown.contains(e.target) && e.target.id !== 'notification-bell') {
                notifications.dropdown.classList.add('hidden');
            }
        });

        // Clear All Button Logic
        const clearBtn = document.getElementById('clear-notifications');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (notifications.list) {
                    notifications.list.innerHTML = '<div class="notification-empty">No new notifications</div>';
                }
                if (notifications.badge) {
                    notifications.badge.classList.add('hidden');
                    notifications.badge.textContent = '0';
                }
            });
        }
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

        // Remove "empty" message if it exists
        const emptyMsg = notifications.list.querySelector('.notification-empty');
        if (emptyMsg) emptyMsg.remove();

        const item = document.createElement('div');
        item.className = `notification-item ${type}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        item.innerHTML = `<p>${message}</p><span class="notification-time">${time}</span>`;
        
        notifications.list.prepend(item);
        
        // Update badge count
        const count = notifications.list.children.length;
        if (notifications.badge) {
            notifications.badge.textContent = count;
            notifications.badge.classList.remove('hidden');
        }
        
        // NO AUTO-DISMISS: Notifications stay until cleared manually.
    }
};
