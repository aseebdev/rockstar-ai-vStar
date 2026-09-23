const Auth = (function () {
  let user = null;
  let usage = null;
  let initialized = false;
  let astraKeyConfigured = false;
  const LOGIN_GRACE_MS = 10 * 60 * 1000;
  const LAST_ACTIVE_KEY = 'rockstar_last_active';
  let activityTimer = null;

  function markActive() {
    try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch (_) {}
  }

  function withinLoginGrace() {
    try {
      const raw = localStorage.getItem(LAST_ACTIVE_KEY);
      if (!raw) return false;
      const last = Number(raw);
      return Number.isFinite(last) && (Date.now() - last) < LOGIN_GRACE_MS;
    } catch (_) { return false; }
  }

  async function expireIfNeeded() {
    if (!withinLoginGrace()) {
      try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch (_) {}
      await request('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
      return false;
    }
    markActive();
    return true;
  }

  function startActivityTracking() {
    markActive();
    if (activityTimer) clearInterval(activityTimer);
    activityTimer = setInterval(markActive, 30 * 1000);
    ['pointerdown','keydown','touchstart','scroll'].forEach(type => window.addEventListener(type, markActive, { passive: true }));
    window.addEventListener('pagehide', markActive);
    window.addEventListener('beforeunload', markActive);
  }

  async function request(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data?.error?.message || `Request failed: HTTP ${res.status}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function init() {
    if (initialized) return user;
    initialized = true;
    try {
      const allowed = await expireIfNeeded();
      if (!allowed) { user = null; return null; }
      const data = await request('/api/auth/me');
      user = data.user;
      startActivityTracking();
      await refreshUsage();
      await refreshAstraKeyStatus();
      return user;
    } catch {
      user = null;
      return null;
    }
  }

  async function login(email, password) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    user = data.user;
    startActivityTracking();
    await refreshUsage();
    await refreshAstraKeyStatus();
    return user;
  }

  async function register(name, email, password) {
    const data = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    user = data.user;
    startActivityTracking();
    await refreshUsage();
    await refreshAstraKeyStatus();
    return user;
  }

  async function logout() {
    await request('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    user = null;
    usage = null;
    astraKeyConfigured = false;
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    try { localStorage.removeItem(LAST_ACTIVE_KEY); } catch (_) {}
  }

  async function refreshUsage() {
    try {
      usage = await request('/api/usage');
    } catch {
      usage = null;
    }
    updateUsageUI();
    return usage;
  }

  function getUser() { return user; }
  function getUsage() { return usage; }

  function hasAstraKey() {
    return astraKeyConfigured;
  }

  async function refreshAstraKeyStatus() {
    if (!user) {
      astraKeyConfigured = false;
      return false;
    }
    try {
      const data = await request('/api/auth/astra-key');
      astraKeyConfigured = Boolean(data.configured);
    } catch {
      astraKeyConfigured = false;
    }
    window.dispatchEvent(new Event('rockstar-key-changed'));
    return astraKeyConfigured;
  }

  async function setAstraKey(key) {
    const value = String(key || '').trim();
    if (!value) return astraKeyConfigured;
    await request('/api/auth/astra-key', {
      method: 'PUT',
      body: JSON.stringify({ key: value })
    });
    astraKeyConfigured = true;
    window.dispatchEvent(new Event('rockstar-key-changed'));
    return true;
  }

  async function clearAstraKey() {
    if (!user) return false;
    await request('/api/auth/astra-key', { method: 'DELETE' });
    astraKeyConfigured = false;
    window.dispatchEvent(new Event('rockstar-key-changed'));
    return true;
  }

  function updateUsageUI() {
    const el = document.getElementById('account-usage');
    if (!el || !user) return;
    if (usage?.daily === null) {
      el.textContent = 'Owner • unlimited app limit';
    } else {
      el.textContent = `${usage?.dailyRemaining ?? usage?.daily ?? 0} AI messages left today`;
    }
    const daily = document.getElementById('account-daily-usage');
    const monthly = document.getElementById('account-monthly-usage');
    if (daily) daily.textContent = usage?.daily === null ? 'Unlimited' : `${usage?.dailyUsed || 0} / ${usage?.daily || 0}`;
    if (monthly) monthly.textContent = usage?.monthly === null ? 'Unlimited' : `${usage?.monthlyUsed || 0} / ${usage?.monthly || 0}`;
  }

  function notifyAuthenticatedExperience() {
    window.RockstarLoginExperience?.onAuthenticated?.();
  }

  function setup(onAuthenticated) {
    const screen = document.getElementById('auth-screen');
    const app = document.getElementById('app-container');
    const form = document.getElementById('auth-form');
    const nameGroup = document.getElementById('auth-name-group');
    const nameInput = document.getElementById('auth-name');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const confirmPasswordInput = document.getElementById('auth-confirm-password');
    const passwordToggle = document.getElementById('auth-password-toggle');
    const confirmPasswordToggle = document.getElementById('auth-confirm-toggle');
    const capslockStatus = document.getElementById('capslock-status');
    const confirmGroup = document.getElementById('auth-confirm-group');
    const submitBtn = document.getElementById('auth-submit');
    const switchBtn = document.getElementById('auth-switch');
    const modeTitle = document.getElementById('auth-title');
    const modeText = document.getElementById('auth-switch-text');
    const errorEl = document.getElementById('auth-error');
    const passwordTools = document.getElementById('password-tools');
    const generatePasswordBtn = document.getElementById('generate-password');
    const passwordStrength = document.getElementById('password-strength');
    const browserAutofillNote = document.getElementById('browser-autofill-note');

    let mode = 'login';

    function setPasswordVisibility(input, button, visible) {
      if (!input || !button) return;
      input.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'Hide' : 'Show';
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }

    function updateCapsLock(event) {
      if (!capslockStatus || !event) return;
      const caps = typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
      capslockStatus.textContent = caps ? '⇧ Caps Lock is ON' : '';
      capslockStatus.classList.toggle('visible', caps);
    }


    function passwordStrengthLabel(value) {
      const password = String(value || '');
      if (!password) return '';
      let score = 0;
      if (password.length >= 12) score++;
      if (password.length >= 16) score++;
      if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
      if (/\d/.test(password)) score++;
      if (/[^A-Za-z0-9]/.test(password)) score++;
      if (score >= 5) return 'Strong';
      if (score >= 3) return 'Good';
      return 'Needs improvement';
    }

    function updatePasswordStrength() {
      if (!passwordStrength) return;
      const label = mode === 'register' ? passwordStrengthLabel(passwordInput?.value) : '';
      passwordStrength.textContent = label ? `• ${label}` : '';
      passwordStrength.classList.toggle('strong', label === 'Strong');
      passwordStrength.classList.toggle('good', label === 'Good');
    }

    function generateStrongPassword() {
      const length = 20;
      const groups = [
        'ABCDEFGHJKLMNPQRSTUVWXYZ',
        'abcdefghijkmnopqrstuvwxyz',
        '23456789',
        '!@#$%^&*_-+='
      ];
      const pick = group => group[crypto.getRandomValues(new Uint32Array(1))[0] % group.length];
      const chars = groups.map(pick);
      const all = groups.join('');
      while (chars.length < length) chars.push(pick(all));
      for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      return chars.join('');
    }

    generatePasswordBtn?.addEventListener('click', () => {
      if (!passwordInput || mode !== 'register') return;
      const generated = generateStrongPassword();
      passwordInput.value = generated;
      if (confirmPasswordInput) confirmPasswordInput.value = generated;
      setPasswordVisibility(passwordInput, passwordToggle, true);
      setPasswordVisibility(confirmPasswordInput, confirmPasswordToggle, true);
      updatePasswordStrength();
      passwordInput.focus();
      passwordInput.setSelectionRange(generated.length, generated.length);
    });

    passwordInput?.addEventListener('input', updatePasswordStrength);
    confirmPasswordInput?.addEventListener('input', updatePasswordStrength);

    passwordToggle?.addEventListener('click', () => {
      const visible = passwordInput?.type === 'password';
      setPasswordVisibility(passwordInput, passwordToggle, visible);
      passwordInput?.focus();
    });

    confirmPasswordToggle?.addEventListener('click', () => {
      const visible = confirmPasswordInput?.type === 'password';
      setPasswordVisibility(confirmPasswordInput, confirmPasswordToggle, visible);
      confirmPasswordInput?.focus();
    });

    [passwordInput, confirmPasswordInput].forEach(input => {
      input?.addEventListener('keydown', updateCapsLock);
      input?.addEventListener('keyup', updateCapsLock);
      input?.addEventListener('blur', () => {
        if (capslockStatus) {
          capslockStatus.textContent = '';
          capslockStatus.classList.remove('visible');
        }
      });
    });

    if (user) {
      screen?.classList.add('hidden');
      app?.classList.remove('hidden');
      updateAccountUI();
    }

    function render() {
      const signup = mode === 'register';
      if (nameGroup) nameGroup.classList.toggle('hidden', !signup);
      if (confirmGroup) confirmGroup.classList.toggle('hidden', !signup);
      if (modeTitle) modeTitle.textContent = signup ? 'Create your account' : 'Welcome back';
      if (submitBtn) submitBtn.textContent = signup ? 'Create Account' : 'Sign In';
      if (modeText) modeText.textContent = signup ? 'Already have an account?' : 'New to Rockstar AI?';
      if (switchBtn) switchBtn.textContent = signup ? 'Sign in' : 'Create account';
      setPasswordVisibility(passwordInput, passwordToggle, false);
      setPasswordVisibility(confirmPasswordInput, confirmPasswordToggle, false);
      if (passwordTools) passwordTools.classList.toggle('hidden', !signup);
      if (browserAutofillNote) browserAutofillNote.classList.toggle('hidden', !signup);
      if (passwordInput) passwordInput.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
      updatePasswordStrength();
      if (capslockStatus) {
        capslockStatus.textContent = '';
        capslockStatus.classList.remove('visible');
      }
    }

    function showAuthError(message) {
      if (errorEl) errorEl.textContent = message;
    }

    switchBtn?.addEventListener('click', () => {
      mode = mode === 'login' ? 'register' : 'login';
      if (errorEl) errorEl.textContent = '';
      render();
      if (mode === 'login') passwordInput?.focus();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!submitBtn) return;

      const submittingMode = mode;
      submitBtn.disabled = true;
      submitBtn.textContent = submittingMode === 'register' ? 'Creating…' : 'Signing in…';
      if (errorEl) errorEl.textContent = '';

      try {
        if (submittingMode === 'register') {
          if (passwordInput.value !== confirmPasswordInput.value) {
            throw new Error('Passwords do not match.');
          }
          user = await register(nameInput.value, emailInput.value, passwordInput.value);
        } else {
          user = await login(emailInput.value, passwordInput.value);
        }

        if (screen) screen.classList.add('hidden');
        if (app) app.classList.remove('hidden');
        updateAccountUI();
        // Begin the welcome animation immediately after authentication succeeds.
        // Login music continues underneath the animation and is stopped when it finishes.
        notifyAuthenticatedExperience();
        if (onAuthenticated) await onAuthenticated(user);
      } catch (err) {
        if (submittingMode === 'register' && err?.status === 409) {
          const existingEmail = emailInput.value.trim();
          mode = 'login';
          render();
          emailInput.value = existingEmail;
          passwordInput.value = '';
          if (confirmPasswordInput) confirmPasswordInput.value = '';
          showAuthError('An account already exists with this email. Please sign in instead.');
          if (window.UI?.showToast) {
            window.UI.showToast('Account already exists — switched to Sign in.', 'info', 4500);
          }
          passwordInput?.focus();
        } else {
          showAuthError(err?.message || 'Something went wrong. Please try again.');
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'register' ? 'Create Account' : 'Sign In';
      }
    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      const exitAnimation = window.RockstarLoginExperience?.playExit?.();
      await logout();
      await exitAnimation;
      window.location.reload();
    });

    document.getElementById('btn-account')?.addEventListener('click', () => {
      document.getElementById('account-dialog')?.showModal();
    });

    document.querySelectorAll('[data-action="close-account"]').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById('account-dialog')?.close());
    });

    render();
  }

  function updateAccountUI() {
    const name = user?.name || 'Account';
    const email = user?.email || '';
    const nameEl = document.getElementById('account-name');
    const emailEl = document.getElementById('account-email');
    const avatarEl = document.getElementById('account-avatar');
    const largeName = document.getElementById('account-name-large');
    const largeEmail = document.getElementById('account-email-large');
    const largeAvatar = document.getElementById('account-avatar-large');
    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
    if (largeName) largeName.textContent = name;
    if (largeEmail) largeEmail.textContent = email;
    if (largeAvatar) largeAvatar.textContent = name.charAt(0).toUpperCase();
    updateUsageUI();

    const daily = document.getElementById('account-daily-usage');
    const monthly = document.getElementById('account-monthly-usage');
    if (daily) daily.textContent = usage?.daily === null ? 'Unlimited' : `${usage?.dailyUsed || 0} / ${usage?.daily || 0}`;
    if (monthly) monthly.textContent = usage?.monthly === null ? 'Unlimited' : `${usage?.monthlyUsed || 0} / ${usage?.monthly || 0}`;
  }

  return {
    init, setup, login, register, logout,
    getUser, getUsage, refreshUsage,
    hasAstraKey, refreshAstraKeyStatus, setAstraKey, clearAstraKey,
    updateAccountUI
  };
})();

window.Auth = Auth;
