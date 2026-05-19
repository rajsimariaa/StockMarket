// Authentication Logic - "Ghost Session" Repair Version

async function initAuth() {
    ui.auth.btn.addEventListener('click', handleAuth);
    ui.auth.toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const isLogin = ui.auth.btn.innerText === 'SIGN IN';
        ui.auth.btn.innerText = isLogin ? 'REGISTER' : 'SIGN IN';
        ui.auth.toggle.innerText = isLogin ? 'Back to Sign In' : 'Create Account';
    });

    document.getElementById('logout-btn').addEventListener('click', logout);

    const savedUser = localStorage.getItem('game_user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        
        // 🚨 CRITICAL: Verify if this session is still valid in the new database
        const { data: validUser, error } = await sb
            .from('game_users')
            .select('id')
            .eq('id', user.id)
            .single();

        if (error || !validUser) {
            console.warn('Broken session detected. Auto-repairing...');
            logout(); // Clear ghost session
            return;
        }

        await ensureProfileExists(user.id, user.username);
        onAuthenticated(user);
    }
}

function logout() {
    localStorage.removeItem('game_user');
    location.reload();
}

async function handleAuth() {
    const username = ui.auth.username.value.trim();
    const password = ui.auth.password.value;
    const isLogin = ui.auth.btn.innerText === 'SIGN IN';

    if (!username || !password) return showToast('Please fill all fields', 'error');

    ui.auth.btn.disabled = true;
    ui.auth.btn.innerText = 'PROCESSING...';

    try {
        if (isLogin) {
            const { data: user, error } = await sb
                .from('game_users')
                .select('*')
                .eq('username', username)
                .eq('password_text', password)
                .single();

            if (error || !user) throw new Error('Invalid username or password');
            
            await ensureProfileExists(user.id, user.username);
            saveAndAuth(user);
        } else {
            const { data: newUser, error } = await sb
                .from('game_users')
                .insert([{ username, password_text: password }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') throw new Error('Username already exists');
                throw error;
            }
            
            await ensureProfileExists(newUser.id, username);
            showToast('Account created successfully!');
            saveAndAuth(newUser);
        }
    } catch (error) {
        console.error('Auth error:', error);
        showToast(error.message || 'Authentication failed', 'error');
        ui.auth.btn.disabled = false;
        ui.auth.btn.innerText = isLogin ? 'SIGN IN' : 'REGISTER';
    }
}

async function ensureProfileExists(id, username) {
    // This function guarantees that the profiles table has a record for this user
    const { error } = await sb.from('profiles').upsert([{ id, username }], { onConflict: 'id' });
    if (error) {
        console.error('ensureProfileExists error:', error);
        if (error.code === '23503') {
            // Stale user token in local storage from a reset database
            localStorage.removeItem('game_user');
            showToast('Stale session detected (database reset). Refreshing...', 'error');
            setTimeout(() => location.reload(), 1500);
            throw error;
        }
        showToast(`Profile sync failed: ${error.message}`, 'error');
        throw error;
    }
}

function saveAndAuth(user) {
    localStorage.setItem('game_user', JSON.stringify(user));
    onAuthenticated(user);
}

async function onAuthenticated(user) {
    gameData.user = user;
    
    ui.lobby.displayName.innerText = user.username;
    ui.lobby.avatar.innerText = user.username[0].toUpperCase();
    
    ui.screens.auth.classList.add('hidden');
    ui.screens.lobby.classList.remove('hidden');
    
    if (typeof initLobby === 'function') {
        initLobby();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
});
