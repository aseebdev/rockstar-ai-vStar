/**
 * Astra Local AI - Settings & Preferences Controller
 * Manages theme switching, diagnostics, system prompts, and data export/import.
 */

const Settings = (function () {
  let modal = null;
  let onDataChangedCallback = null;

  function init({ onDataChanged }) {
    onDataChangedCallback = onDataChanged;
    modal = document.getElementById('settings-dialog');

    // Apply saved theme immediately
    const saved = Storage.getSettings();
    applyTheme(saved.theme || 'dark-glass');
    applyFontSize(saved.fontSize || 'default');

    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');
        switchTab(tabTarget);
      });
    });

    // Theme selector (sidebar & settings modal)
    const sidebarThemeSelect = document.getElementById('sidebar-theme-select');
    const settingsThemeSelect = document.getElementById('settings-theme');

    if (sidebarThemeSelect) {
      sidebarThemeSelect.value = saved.theme || 'dark-glass';
      sidebarThemeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
        if (settingsThemeSelect) settingsThemeSelect.value = e.target.value;
      });
    }

    if (settingsThemeSelect) {
      settingsThemeSelect.value = saved.theme || 'dark-glass';
      settingsThemeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
        if (sidebarThemeSelect) sidebarThemeSelect.value = e.target.value;
      });
    }

    // Font size selector
    const fontSelect = document.getElementById('settings-font-size');
    if (fontSelect) {
      fontSelect.value = saved.fontSize || 'default';
      fontSelect.addEventListener('change', (e) => {
        applyFontSize(e.target.value);
      });
    }

    // Chat toggles
    const enterToggle = document.getElementById('settings-enter-send');
    const autoScrollToggle = document.getElementById('settings-auto-scroll');
    const timestampsToggle = document.getElementById('settings-timestamps');
    const systemPromptInput = document.getElementById('settings-system-prompt');
    const aiModeSelect = document.getElementById('settings-ai-mode');
    const aiModeDesc = document.getElementById('settings-ai-mode-desc');
    if (aiModeSelect) aiModeSelect.value = saved.aiMode || 'automatic';
    const updateModeDesc = () => {
      const value = aiModeSelect?.value || 'automatic';
      if (!aiModeDesc) return;
      aiModeDesc.textContent = value === 'offline'
        ? 'Offline mode disables cloud requests and uses Rockstar Core only.'
        : value === 'cloud'
          ? 'Cloud mode requires a valid saved Astra API key. If unavailable, Rockstar safely falls back instead of pretending.'
          : 'Automatic uses Astra when your key is configured; otherwise it stays offline.';
    };
    aiModeSelect?.addEventListener('change', updateModeDesc);
    updateModeDesc();

    if (enterToggle) enterToggle.checked = saved.enterToSend !== false;
    if (autoScrollToggle) autoScrollToggle.checked = saved.autoScroll !== false;
    if (timestampsToggle) timestampsToggle.checked = saved.showTimestamps !== false;
    if (systemPromptInput) systemPromptInput.value = saved.systemPrompt || '';

    // Save button
    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        Storage.saveSettings({
          theme: settingsThemeSelect ? settingsThemeSelect.value : saved.theme,
          fontSize: fontSelect ? fontSelect.value : saved.fontSize,
          enterToSend: enterToggle ? enterToggle.checked : true,
          autoScroll: autoScrollToggle ? autoScrollToggle.checked : true,
          showTimestamps: timestampsToggle ? timestampsToggle.checked : true,
          systemPrompt: systemPromptInput ? systemPromptInput.value.trim() : '',
          aiMode: aiModeSelect ? aiModeSelect.value : 'automatic'
        });
        if (apiKeyInput && apiKeyInput.value.trim()) {
          try {
            await Auth.setAstraKey(apiKeyInput.value);
            apiKeyInput.value = '';
            updateAstraKeyUI();
          } catch (err) {
            UI.showToast(err.message || 'Could not save Astra API key.', 'error', 6000);
            return;
          }
        }
        close();
        loadModelsIntoDropdown();
        Auth.refreshUsage();
        window.RockstarTools?.updateMode?.();
        window.dispatchEvent(new Event('rockstar-mode-changed'));
        UI.showToast('Settings saved successfully', 'success');
        if (onDataChangedCallback) onDataChangedCallback();
      });
    }

    // Per-user Astra API key. The actual key is never returned to the browser after save.
    const apiKeyInput = document.getElementById('settings-astra-key');
    const apiKeyToggle = document.getElementById('toggle-astra-key');
    const keyStatus = document.getElementById('astra-key-status');
    const removeKeyBtn = document.getElementById('btn-remove-astra-key');
    function updateAstraKeyUI() {
      const configured = Auth.hasAstraKey();
      if (keyStatus) keyStatus.textContent = configured ? '✓ Astra key securely saved to your account' : 'No Astra key saved yet';
      if (keyStatus) keyStatus.classList.toggle('success', configured);
      if (removeKeyBtn) removeKeyBtn.disabled = !configured;
      if (apiKeyInput) { apiKeyInput.value = ''; apiKeyInput.placeholder = configured ? 'Enter a new key to replace the saved key' : 'Paste your own Astra key'; }
    }
    updateAstraKeyUI();
    if (removeKeyBtn) {
      removeKeyBtn.addEventListener('click', async () => {
        try {
          await Auth.clearAstraKey();
          updateAstraKeyUI();
          loadModelsIntoDropdown();
          UI.showToast('Astra API key removed from your account.', 'success');
        } catch (err) {
          UI.showToast(err.message || 'Could not remove Astra API key.', 'error');
        }
      });
    }
    if (apiKeyToggle && apiKeyInput) {
      apiKeyToggle.addEventListener('click', () => {
        apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyToggle.textContent = apiKeyInput.type === 'password' ? 'Show' : 'Hide';
      });
    }

    // Close buttons
    const closeBtns = document.querySelectorAll('[data-action="close-settings"]');
    closeBtns.forEach(btn => btn.addEventListener('click', close));

    // Test Connection Button in API Tab
    const testBtn = document.getElementById('btn-test-connection');
    if (testBtn) {
      testBtn.addEventListener('click', runConnectionTest);
    }

    // Export Data Button
    const exportBtn = document.getElementById('btn-export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', handleExport);
    }

    // Import Data Button & File Input
    const importBtn = document.getElementById('btn-import-data');
    const importFileInput = document.getElementById('import-file-input');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', handleImport);
    }

    // Clear All Conversations
    const clearAllBtn = document.getElementById('btn-clear-all-data');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', handleClearAll);
    }

    // Populate models only after a valid Rockstar session exists.
    // This prevents an unauthenticated /api/models request on the login screen.
    if (Auth.getUser()) loadModelsIntoDropdown();
  }

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    Storage.saveSettings({ theme: themeName });
  }

  function applyFontSize(size) {
    let fontBase = '15px';
    if (size === 'compact') fontBase = '13.5px';
    if (size === 'large') fontBase = '16.5px';
    document.documentElement.style.fontSize = fontBase;
    Storage.saveSettings({ fontSize: size });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
  }

  async function loadModelsIntoDropdown() {
    const modelSelect = document.getElementById('settings-model');
    const modelSearch = document.getElementById('model-search');
    const modelDesc = document.getElementById('model-select-desc');
    const sidebarModelPill = document.getElementById('sidebar-model-name');
    const statusDot = document.getElementById('connection-status-dot');
    let allModels = [];

    if (!Auth.getUser()) {
      if (modelDesc) modelDesc.textContent = 'Sign in to load your Astra models.';
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Sign in first</option>';
        modelSelect.disabled = true;
      }
      return;
    }

    if (!Auth.hasAstraKey()) {
      if (modelDesc) modelDesc.textContent = 'Add your own Astra API key below. Models are loaded from that key.';
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Enter your Astra key first</option>';
        modelSelect.disabled = true;
      }
      return;
    }

    try {
      const health = await AstraClient.getHealth();
      if (statusDot) {
        const hasKey = Auth.hasAstraKey();
        statusDot.classList.toggle('unconfigured', !hasKey);
        statusDot.title = hasKey
          ? 'Your Astra API key is configured for this session'
          : 'Add your own Astra API key in Settings';
      }

      const modelData = await AstraClient.getModels();
      allModels = Array.isArray(modelData.models) ? modelData.models : [];
      const currentSettings = Storage.getSettings();
      const preferred = currentSettings.selectedModel || health.model || 'gpt-5.6-luna';

      function renderModels(filter = '') {
        const q = filter.trim().toLowerCase();
        const visible = allModels.filter(m => (m.id || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q));
        if (!modelSelect) return;
        modelSelect.innerHTML = '';
        if (!visible.length) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No matching models';
          modelSelect.appendChild(opt);
          modelSelect.disabled = true;
          return;
        }
        modelSelect.disabled = false;
        visible.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          modelSelect.appendChild(opt);
        });
        if (visible.some(m => m.id === preferred)) modelSelect.value = preferred;
        else if (visible[0]) modelSelect.value = visible[0].id;
        // Repair stale localStorage values from older versions (for example a
        // purchase-locked model) so chat never sends that invalid selection.
        if (modelSelect.value) Storage.saveSettings({ selectedModel: modelSelect.value });
        if (sidebarModelPill) sidebarModelPill.textContent = modelSelect.value;
      }

      renderModels();
      if (modelSearch) {
        modelSearch.addEventListener('input', () => renderModels(modelSearch.value));
      }
      if (modelSelect) {
        modelSelect.addEventListener('change', (e) => {
          if (!e.target.value) return;
          Storage.saveSettings({ selectedModel: e.target.value });
          if (sidebarModelPill) sidebarModelPill.textContent = e.target.value;
        });
      }

      if (modelDesc) {
        if (modelData.filtered) {
          modelDesc.textContent = `${allModels.length} enabled models. Locked/purchase-required catalog models are hidden.`;
        } else if (modelData.supported) {
          modelDesc.textContent = `${allModels.length} models returned by your authenticated Astra endpoint.`;
        } else {
          modelDesc.textContent = modelData.error || 'Using the configured Astra model.';
        }
      }
    } catch (err) {
      console.warn('Could not load models into settings dropdown', err);
      if (modelDesc) modelDesc.textContent = `Could not load models: ${err.message}`;
    }
  }

  async function runConnectionTest() {
    const testBtn = document.getElementById('btn-test-connection');
    const statusBox = document.getElementById('connection-diagnostic-box');
    const statusText = document.getElementById('diagnostic-result-text');

    if (!testBtn || !statusBox || !statusText) return;

    testBtn.disabled = true;
    testBtn.innerHTML = 'Testing connection...';
    statusBox.classList.remove('hidden');
    statusText.textContent = 'Contacting Astra API gateway...';

    try {
      const result = await AstraClient.testConnection();
      if (result.ok) {
        statusText.textContent = `✔ ${result.message}`;
        statusText.className = 'diagnostic-result success';
        UI.showToast('Connection verified successfully!', 'success');
      } else {
        statusText.textContent = `✖ ${result.message}`;
        statusText.className = 'diagnostic-result error';
        UI.showToast('Astra API connection test failed', 'error');
      }
    } catch (err) {
      statusText.textContent = `Network failure: ${err.message}`;
      statusText.className = 'diagnostic-result error';
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = 'Test Connection';
    }
  }

  async function handleExport() {
    try {
      const data = await Storage.exportAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `astra-chat-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.showToast('Chat backup exported successfully', 'success');
    } catch (err) {
      UI.showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await Storage.importAllData(parsed);
      UI.showToast(`Imported ${result.conversationsCount} conversations and ${result.messagesCount} messages!`, 'success');
      if (onDataChangedCallback) onDataChangedCallback();
      close();
    } catch (err) {
      UI.showToast(`Import failed: ${err.message}`, 'error');
    } finally {
      event.target.value = '';
    }
  }

  async function handleClearAll() {
    if (confirm('Are you sure you want to delete ALL conversations and messages? This action cannot be undone.')) {
      await Storage.clearAllConversations();
      UI.showToast('All conversations cleared', 'info');
      if (onDataChangedCallback) onDataChangedCallback();
      close();
    }
  }

  function open(tab = 'appearance') {
    if (modal) {
      switchTab(tab);
      modal.showModal();
    }
  }

  function close() {
    if (modal) modal.close();
  }

  return {
    init,
    open,
    close,
    applyTheme
  };
})();

// Attach to window
window.Settings = Settings;
