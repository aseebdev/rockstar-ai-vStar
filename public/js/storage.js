/**
 * Astra Local AI - Storage Engine
 * High-performance IndexedDB client for local conversation & message persistence,
 * with localStorage settings management and JSON export/import.
 */

const Storage = (function () {
  const DB_NAME = 'RockstarAIDB';
  const DB_VERSION = 1;
  let dbInstance = null;
  let syncChain = Promise.resolve();
  let cloudSyncEnabled = false;

  async function getAllLocalData() {
    const conversations = await getConversations();
    const messages = [];
    for (const conv of conversations) {
      const msgs = await getMessages(conv.id);
      messages.push(...msgs);
    }
    return { conversations, messages };
  }

  async function syncToServer() {
    if (!cloudSyncEnabled) return;
    const data = await getAllLocalData();
    const res = await fetch('/api/data', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Cloud sync failed: HTTP ${res.status}`);
    }
  }

  function queueSync() {
    if (!cloudSyncEnabled) return;
    syncChain = syncChain
      .then(() => syncToServer())
      .catch(err => console.warn('Cloud sync:', err.message));
  }

  async function syncFromServer() {
    cloudSyncEnabled = true;
    try {
      const res = await fetch('/api/data', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          cloudSyncEnabled = false;
          return false;
        }
        throw new Error(`Cloud load failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      await init();
      return new Promise((resolve, reject) => {
        const tx = dbInstance.transaction(['conversations', 'messages'], 'readwrite');
        tx.objectStore('conversations').clear();
        tx.objectStore('messages').clear();
        for (const c of (data.conversations || [])) tx.objectStore('conversations').put(c);
        for (const m of (data.messages || [])) tx.objectStore('messages').put(m);
        tx.oncomplete = () => { queueSync(); resolve(true); };
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Cloud sync load:', err.message);
      return false;
    }
  }

  const DEFAULT_SETTINGS = {
    theme: 'dark-glass',
    fontSize: 'default',
    density: 'comfortable',
    animationIntensity: 'full',
    enterToSend: true,
    autoScroll: true,
    showTimestamps: true,
    systemPrompt: '',
    selectedModel: 'gpt-5.6-luna',
    sidebarCollapsed: false,
    aiMode: 'automatic',
    voiceLanguage: 'en-US'
  };

  /**
   * Initializes IndexedDB database
   */
  function init() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store: conversations
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Store: messages
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('conversationId', 'conversationId', { unique: false });
          msgStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('Failed to open IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ==========================================
  // CONVERSATION OPERATIONS
  // ==========================================

  async function getConversations() {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const index = store.index('updatedAt');
      const request = index.getAll();

      request.onsuccess = () => {
        // Return sorted descending by updatedAt
        const result = (request.result || []).sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function getConversation(id) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function createConversation(title = 'New Conversation', model = 'gpt-5.6-luna') {
    await init();
    const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const conversation = {
      id,
      title,
      model,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('conversations', 'readwrite');
      const store = tx.objectStore('conversations');
      const request = store.add(conversation);

      request.onsuccess = () => resolve(conversation);
      request.onerror = () => reject(request.error);
    });
  }

  async function updateConversation(id, updates) {
    await init();
    const conv = await getConversation(id);
    if (!conv) throw new Error('Conversation not found');

    const updated = {
      ...conv,
      ...updates,
      updatedAt: updates.updatedAt || Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('conversations', 'readwrite');
      const store = tx.objectStore('conversations');
      const request = store.put(updated);

      request.onsuccess = () => resolve(updated);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteConversation(id) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(['conversations', 'messages'], 'readwrite');
      const convStore = tx.objectStore('conversations');
      const msgStore = tx.objectStore('messages');

      convStore.delete(id);

      // Also delete all associated messages
      const msgIndex = msgStore.index('conversationId');
      const request = msgIndex.getAllKeys(id);

      request.onsuccess = () => {
        const keys = request.result || [];
        keys.forEach(key => msgStore.delete(key));
      };

      tx.oncomplete = () => { queueSync(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearAllConversations() {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(['conversations', 'messages'], 'readwrite');
      tx.objectStore('conversations').clear();
      tx.objectStore('messages').clear();

      tx.oncomplete = () => { queueSync(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================
  // MESSAGE OPERATIONS
  // ==========================================

  async function getMessages(conversationId) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('conversationId');
      const request = index.getAll(conversationId);

      request.onsuccess = () => {
        const msgs = (request.result || []).sort((a, b) => a.createdAt - b.createdAt);
        resolve(msgs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function addMessage(message) {
    await init();
    const id = message.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    const fullMsg = {
      id,
      conversationId: message.conversationId,
      role: message.role, // 'user' | 'assistant' | 'system'
      content: message.content,
      model: message.model || null,
      createdAt: message.createdAt || Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(['messages', 'conversations'], 'readwrite');
      const msgStore = tx.objectStore('messages');
      const convStore = tx.objectStore('conversations');

      msgStore.add(fullMsg);

      // Touch parent conversation updatedAt
      const convReq = convStore.get(fullMsg.conversationId);
      convReq.onsuccess = () => {
        if (convReq.result) {
          const conv = convReq.result;
          conv.updatedAt = Date.now();
          convStore.put(conv);
        }
      };

      tx.oncomplete = () => { queueSync(); resolve(fullMsg); };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteMessage(id) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('messages', 'readwrite');
      tx.objectStore('messages').delete(id);
      tx.oncomplete = () => { queueSync(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function updateMessage(id, updates) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (!getReq.result) return reject(new Error('Message not found'));
        const updated = { ...getReq.result, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => { queueSync(); resolve(updated); };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function deleteMessagesAfter(conversationId, messageId) {
    const messages = await getMessages(conversationId);
    const targetIdx = messages.findIndex(m => m.id === messageId);
    if (targetIdx === -1) return;

    const idsToDelete = messages.slice(targetIdx + 1).map(m => m.id);
    if (idsToDelete.length === 0) return;

    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      idsToDelete.forEach(id => store.delete(id));
      tx.oncomplete = () => { queueSync(); resolve(idsToDelete.length); };
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================
  // DATA EXPORT / IMPORT
  // ==========================================

  async function exportAllData() {
    await init();
    const conversations = await getConversations();
    const allMessages = [];

    for (const conv of conversations) {
      const msgs = await getMessages(conv.id);
      allMessages.push(...msgs);
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations,
      messages: allMessages
    };
  }

  async function importAllData(data) {
    if (!data || !Array.isArray(data.conversations) || !Array.isArray(data.messages)) {
      throw new Error('Invalid backup file structure.');
    }

    await init();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(['conversations', 'messages'], 'readwrite');
      const convStore = tx.objectStore('conversations');
      const msgStore = tx.objectStore('messages');

      for (const conv of data.conversations) {
        convStore.put(conv);
      }
      for (const msg of data.messages) {
        msgStore.put(msg);
      }

      tx.oncomplete = () => {
        queueSync();
        resolve({
          conversationsCount: data.conversations.length,
          messagesCount: data.messages.length
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================
  // LOCALSTORAGE SETTINGS
  // ==========================================

  function getSettings() {
    try {
      const saved = localStorage.getItem('rockstar_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not read settings from localStorage', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  function saveSettings(updates) {
    try {
      const current = getSettings();
      const merged = { ...current, ...updates };
      localStorage.setItem('rockstar_settings', JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn('Could not save settings to localStorage', e);
      return { ...DEFAULT_SETTINGS, ...updates };
    }
  }

  return {
    init,
    getConversations,
    getConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    clearAllConversations,
    getMessages,
    addMessage,
    updateMessage,
    deleteMessage,
    deleteMessagesAfter,
    exportAllData,
    importAllData,
    getSettings,
    saveSettings,
    syncFromServer,
    syncToServer
  };
})();

// Attach to window
window.Storage = Storage;
