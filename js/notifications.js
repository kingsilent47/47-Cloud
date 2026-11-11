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

        const bellBtn = document.getElementById('notification-bell');
        if (bellBtn) {
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notifications.dropdown.classList.toggle('hidden');
            });
        }

        document.addEventListener('click', (e) => {
            if (notifications.dropdown && !notifications.dropdown.contains(e.target)) {
                notifications.dropdown.classList.add('hidden');
            }
        });

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
        if (notifications.overlay) notifications.overlay.classList.add('hidden');
    },

    add: (message, type = 'info') => {
        if (!notifications.list) return;

        const emptyMsg = notifications.list.querySelector('.notification-empty');
        if (emptyMsg) emptyMsg.remove();

        const item = document.createElement('div');
        item.className = `notification-item ${type}`;

        const text = document.createElement('p');
        text.textContent = message;

        const time = document.createElement('span');
        time.className = 'notification-time';
        time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.appendChild(text);
        item.appendChild(time);
        notifications.list.prepend(item);

        if (notifications.badge) {
            notifications.badge.textContent = notifications.list.children.length;
            notifications.badge.classList.remove('hidden');
        }
    }
};
