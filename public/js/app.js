/**
 * Astra Local AI - Application Orchestrator
 * Coordinates state, conversations, messaging, streaming lifecycle, and keyboard shortcuts.
 */

(function () {
  let activeConversationId = null;
  let currentStream = null;
  let isStreaming = false;
  const richMessagePayloads = new Map();

  // DOM Elements
  let sidebarEl = null;
  let sidebarOverlay = null;
  let conversationListEl = null;
  let searchInput = null;
  let mobileTitle = null;

  async function init() {
    // Authentication gate: the public app never sends AI requests anonymously.
    const existingUser = await Auth.init();

    Auth.setup(async () => {
      await bootApplication();
    });

    if (existingUser) {
      await bootApplication();
    }
  }

  async function bootApplication() {
    if (window.__rockstarBooted) return;
    window.__rockstarBooted = true;

    await Storage.init();
    await Storage.syncFromServer();
    UI.init();

    sidebarEl = document.getElementById('sidebar');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    conversationListEl = document.getElementById('conversation-list');
    searchInput = document.getElementById('search-conversations');
    mobileTitle = document.getElementById('mobile-active-title');

    Settings.init({
      onDataChanged: async () => {
        await loadConversations();
        if (activeConversationId) {
          const msgs = await Storage.getMessages(activeConversationId);
          UI.renderMessages(msgs);
        }
      }
    });

    window.RockstarTools?.init?.();

    Composer.init({
      onSubmit: handleSendMessage,
      onStop: handleStopGeneration,
      onAttachmentsChanged: updateKeyRequiredUI
    });

    bindEvents();
    await loadConversations();

    const convs = await Storage.getConversations();
    if (convs.length > 0) {
      await selectConversation(convs[0].id);
    } else {
      startNewChat();
    }

    checkApiConfiguration();
    updateKeyRequiredUI();
    Auth.updateAccountUI();
    window.addEventListener('rockstar-key-changed', updateKeyRequiredUI);
    window.addEventListener('rockstar-mode-changed', updateKeyRequiredUI);
  }

  function bindEvents() {
    // New Chat buttons
    document.querySelectorAll('[data-action="new-chat"]').forEach(btn => {
      btn.addEventListener('click', () => startNewChat());
    });

    // Sidebar Toggle buttons
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach(btn => {
      btn.addEventListener('click', toggleSidebar);
    });

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }

    const keyBanner = document.getElementById('key-required-banner');
    const keyBannerClose = document.querySelector('.key-banner-close');
    keyBannerClose?.addEventListener('click', () => keyBanner?.classList.add('dismissed'));

    // Settings open button
    document.querySelectorAll('[data-action="open-settings"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.getAttribute('data-tab') || 'appearance';
        Settings.open(tab);
      });
    });

    // About Dialog
    const aboutDialog = document.getElementById('about-dialog');
    document.querySelectorAll('[data-action="open-about"]').forEach(btn => {
      btn.addEventListener('click', () => aboutDialog?.showModal());
    });
    document.querySelectorAll('[data-action="close-about"]').forEach(btn => {
      btn.addEventListener('click', () => aboutDialog?.close());
    });

    // Rename Dialog
    const renameDialog = document.getElementById('rename-dialog');
    const renameInput = document.getElementById('rename-input');
    const btnSaveRename = document.getElementById('btn-save-rename');

    document.querySelectorAll('[data-action="close-rename"]').forEach(btn => {
      btn.addEventListener('click', () => renameDialog?.close());
    });

    if (btnSaveRename) {
      btnSaveRename.addEventListener('click', async () => {
        const convId = renameDialog.getAttribute('data-id');
        const newTitle = renameInput.value.trim();
        if (convId && newTitle) {
          await Storage.updateConversation(convId, { title: newTitle });
          await loadConversations();
          if (activeConversationId === convId && mobileTitle) {
            mobileTitle.textContent = newTitle;
          }
          renameDialog.close();
          UI.showToast('Conversation renamed', 'success');
        }
      });
    }

    // Search filter
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          filterConversations(e.target.value.trim().toLowerCase());
        }, 150);
      });

      const clearSearchBtn = document.getElementById('clear-search-btn');
      if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
          searchInput.value = '';
          filterConversations('');
        });
      }
    }

    // Suggestion Prompt Cards (Empty state)
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const promptText = card.getAttribute('data-prompt');
        if (promptText) {
          Composer.setValue(promptText);
          handleSendMessage(promptText);
        }
      });
    });

    // Global Action Delegation for Messages (Edit & Regenerate)
    document.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-action="edit-message"]');
      if (editBtn) {
        const msgId = editBtn.getAttribute('data-id');
        await handleEditMessage(msgId);
        return;
      }

      const regenBtn = e.target.closest('[data-action="regenerate-message"]');
      if (regenBtn) {
        const msgId = regenBtn.getAttribute('data-id');
        await handleRegenerateMessage(msgId);
        return;
      }
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+N: New Chat
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        startNewChat();
      }
      // Ctrl+K: Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchInput) searchInput.focus();
      }
      // Escape: Close modals or abort generation
      if (e.key === 'Escape') {
        if (isStreaming) {
          handleStopGeneration();
        }
      }
    });
  }

  function updateKeyRequiredUI() {
    const hasKey = Auth.hasAstraKey();
    const effectiveMode = getEffectiveMode();
    const banner = document.getElementById('key-required-banner');
    const bannerTitle = banner?.querySelector('[data-key-banner-title]');
    const bannerText = banner?.querySelector('[data-key-banner-text]');
    const textarea = document.getElementById('composer-textarea');
    const attachBtn = document.getElementById('btn-attach-file');
    const statusDot = document.getElementById('connection-status-dot');
    const sidebarModel = document.getElementById('sidebar-model-name');

    if (banner) { banner.dataset.mode = effectiveMode.cloud ? 'astra' : 'core'; if (!banner.classList.contains('dismissed')) banner.classList.remove('hidden'); }
    if (bannerTitle) bannerTitle.textContent = effectiveMode.cloud ? 'Astra AI model mode active' : 'Rockstar Core is active';
    if (bannerText) bannerText.textContent = effectiveMode.cloud
      ? `Configured ${effectiveMode.model} cloud mode. The provider is verified when a request completes successfully.`
      : (Storage.getSettings().aiMode === 'offline' ? 'Offline mode is selected. Cloud requests are disabled.' : 'Rockstar Core is active because no Astra key is connected.');
    if (textarea) textarea.placeholder = effectiveMode.cloud ? 'Message Rockstar...' : 'Ask Rockstar Core anything...';
    if (attachBtn) attachBtn.title = hasKey ? 'Attach image or text/code file' : 'Attach a file for offline text analysis';
    if (statusDot) {
      statusDot.classList.toggle('unconfigured', !effectiveMode.cloud);
      statusDot.title = effectiveMode.cloud ? `Astra AI model mode — ${effectiveMode.model}` : 'Rockstar Core offline mode';
    }
    if (sidebarModel) sidebarModel.textContent = effectiveMode.cloud ? effectiveMode.model : 'Rockstar Core';
    Composer.refreshKeyState?.();
  }

  function getLocalNoKeyResponse(text, attachments = []) {
    return window.RockstarCore?.generate(text, attachments) || 'Rockstar Core is ready. Add an Astra key for full model access.';
  }

  function buildApiContent(userText, attachments) {
    const parts = [];
    if (userText) parts.push({ type: 'text', text: userText });
    for (const att of attachments || []) {
      if (att.kind === 'image' && att.dataUrl) {
        parts.push({ type: 'text', text: `Attached image: ${att.name}` });
        parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      } else if (att.kind === 'text') {
        parts.push({ type: 'text', text: `\n\n[Attached file: ${att.name}]\n${att.text}` });
      }
    }
    return parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts;
  }

  function buildStoredUserContent(userText, attachments) {
    const lines = [];
    if (userText) lines.push(userText);
    for (const att of attachments || []) {
      if (att.kind === 'image') lines.push(`🖼️ Attached image: ${att.name}`);
      else lines.push(`📄 Attached file: ${att.name}`);
    }
    return lines.join('\n\n') || 'Attachment';
  }

  async function checkApiConfiguration() {
    try {
      await AstraClient.getHealth();
    } catch (e) {
      console.warn('Could not reach backend health check', e);
    }
  }

  async function fallbackToRockstarCore(userText, attachments, notice) {
    await Auth.clearAstraKey();
    updateKeyRequiredUI();
    if (notice) UI.showToast(notice, 'warning', 7000);

    const localResponse = getLocalNoKeyResponse(userText, attachments);
    const localAssistant = await Storage.addMessage({
      conversationId: activeConversationId,
      role: 'assistant',
      content: localResponse,
      model: 'rockstar-core'
    });
    UI.appendMessage(localAssistant, true);
    await loadConversations();
  }

  function toggleSidebar() {
    if (!sidebarEl) return;
    if (window.innerWidth <= 768) {
      sidebarEl.classList.toggle('open');
      sidebarOverlay?.classList.toggle('active');
    } else {
      sidebarEl.classList.toggle('collapsed');
      const isCollapsed = sidebarEl.classList.contains('collapsed');
      Storage.saveSettings({ sidebarCollapsed: isCollapsed });
    }
  }

  function closeMobileSidebar() {
    if (sidebarEl) sidebarEl.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }

  function startNewChat() {
    if (isStreaming) handleStopGeneration();
    activeConversationId = null;
    UI.renderMessages([]);
    Composer.clear();
    Composer.focus();
    if (mobileTitle) mobileTitle.textContent = 'New Chat';
    updateActiveSidebarItem(null);
    closeMobileSidebar();
  }

  async function loadConversations() {
    const convs = await Storage.getConversations();
    renderConversationList(convs);
  }

  function renderConversationList(conversations) {
    if (!conversationListEl) return;
    conversationListEl.innerHTML = '';

    if (conversations.length === 0) {
      conversationListEl.innerHTML = '<div class="empty-history-text">No conversations yet.<br>Start a new chat!</div>';
      return;
    }

    // Group conversations by date: Today, Yesterday, Previous 7 Days, Older
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const pastWeek = today - (86400000 * 7);

    const groups = {
      today: [],
      yesterday: [],
      week: [],
      older: []
    };

    conversations.forEach(c => {
      const time = c.updatedAt || c.createdAt;
      if (time >= today) groups.today.push(c);
      else if (time >= yesterday) groups.yesterday.push(c);
      else if (time >= pastWeek) groups.week.push(c);
      else groups.older.push(c);
    });

    const renderGroup = (title, list) => {
      if (list.length === 0) return;
      const titleEl = document.createElement('div');
      titleEl.className = 'history-group-title';
      titleEl.textContent = title;
      conversationListEl.appendChild(titleEl);

      list.forEach(c => {
        const item = document.createElement('div');
        item.className = `chat-item ${c.id === activeConversationId ? 'active' : ''}`;
        item.setAttribute('data-id', c.id);

        item.innerHTML = `
          <span class="chat-item-title">${MarkdownRenderer.escapeHtml(c.title || 'Untitled')}</span>
          <div class="chat-item-actions">
            <button type="button" class="chat-item-action-btn edit" data-action="rename-chat" data-id="${c.id}" title="Rename">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button type="button" class="chat-item-action-btn delete" data-action="delete-chat" data-id="${c.id}" title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        `;

        // Click to select
        item.addEventListener('click', (e) => {
          if (e.target.closest('.chat-item-action-btn')) return;
          selectConversation(c.id);
          closeMobileSidebar();
        });

        // Rename click
        item.querySelector('[data-action="rename-chat"]').addEventListener('click', (e) => {
          e.stopPropagation();
          openRenameDialog(c.id, c.title);
        });

        // Delete click
        item.querySelector('[data-action="delete-chat"]').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Delete conversation "${c.title}"?`)) {
            await Storage.deleteConversation(c.id);
            UI.showToast('Conversation deleted', 'info');
            if (activeConversationId === c.id) {
              startNewChat();
            }
            await loadConversations();
          }
        });

        conversationListEl.appendChild(item);
      });
    };

    renderGroup('Today', groups.today);
    renderGroup('Yesterday', groups.yesterday);
    renderGroup('Previous 7 Days', groups.week);
    renderGroup('Older', groups.older);
  }

  function filterConversations(query) {
    if (!conversationListEl) return;
    const items = conversationListEl.querySelectorAll('.chat-item');
    items.forEach(item => {
      const title = item.querySelector('.chat-item-title')?.textContent.toLowerCase() || '';
      if (!query || title.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function updateActiveSidebarItem(id) {
    if (!conversationListEl) return;
    conversationListEl.querySelectorAll('.chat-item').forEach(item => {
      if (item.getAttribute('data-id') === id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  async function selectConversation(id) {
    if (isStreaming) handleStopGeneration();
    activeConversationId = id;
    updateActiveSidebarItem(id);

    const conv = await Storage.getConversation(id);
    if (conv && mobileTitle) {
      mobileTitle.textContent = conv.title || 'Chat';
    }

    const messages = await Storage.getMessages(id);
    UI.renderMessages(messages);
    Composer.focus();
  }

  function openRenameDialog(id, currentTitle) {
    const dialog = document.getElementById('rename-dialog');
    const input = document.getElementById('rename-input');
    if (dialog && input) {
      dialog.setAttribute('data-id', id);
      input.value = currentTitle || '';
      dialog.showModal();
      input.focus();
      input.select();
    }
  }

  function getEffectiveMode() {
    const settings = Storage.getSettings();
    const requested = settings.aiMode || 'automatic';
    const hasKey = Auth.hasAstraKey();
    if (requested === 'offline') return { id: 'offline', cloud: false, model: 'rockstar-core' };
    if (requested === 'local') return { id: 'offline', cloud: false, model: 'rockstar-core', note: 'Local AI is not configured.' };
    if (hasKey) return { id: 'cloud', cloud: true, model: settings.selectedModel || 'gpt-5.6-luna' };
    return { id: 'offline', cloud: false, model: 'rockstar-core' };
  }

  // Astra currently rejects oversized message histories. Keep the newest turns,
  // while retaining the opening user request so long chats remain coherent.
  function compactContext(messages, maxMessages = 36) {
    const list = Array.isArray(messages) ? messages : [];
    if (list.length <= maxMessages) return { messages: list, compacted: false };
    const first = list.find(m => m.role === 'user');
    const tail = list.slice(-(maxMessages - (first ? 1 : 0)));
    const result = first && !tail.includes(first) ? [first, ...tail] : tail;
    return { messages: result.slice(-maxMessages), compacted: true };
  }

  function looksLikeImageGeneration(text) {
    const q = String(text || '').trim();
    if (!q) return false;
    return /\b(generate|create|draw|make|render|design|produce|show me)\b[\s\S]{0,140}\b(image|picture|photo|illustration|artwork|poster|wallpaper|logo|icon)\b/i.test(q)
      || /\b(image|picture|photo|illustration|artwork|poster|wallpaper|logo|icon)\b[\s\S]{0,80}\b(of|for|showing)\b/i.test(q);
  }

  async function handleImageToolMessage(userText, attachments) {
    const title = String(userText || 'Generated image').trim().slice(0, 35) || 'Generated image';
    if (!activeConversationId) {
      const conv = await Storage.createConversation(title, 'image-generation');
      activeConversationId = conv.id;
      if (mobileTitle) mobileTitle.textContent = title;
      await loadConversations();
    }
    const userMsg = await Storage.addMessage({ conversationId: activeConversationId, role: 'user', content: userText });
    UI.appendMessage(userMsg, true);
    Composer.clear();
    UI.showToast('Generating your image…', 'info', 2500);
    try {
      const img = attachments?.find(a => a.kind === 'image' && a.dataUrl);
      const endpoint = img ? '/api/tools/image/edit' : '/api/tools/image/generate';
      const payload = img ? { image: img.dataUrl, prompt: userText, conversationId: activeConversationId } : { prompt: userText, conversationId: activeConversationId };
      const response = await fetch(endpoint, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data?.error?.message || 'Image generation failed.'), { status: response.status });
      const files = Array.isArray(data.images) ? data.images : [];
      if (!files.length) throw new Error('The image provider returned no image.');
      const markdown = files.map((f,i) => `![Rockstar AI generated image ${i+1}](${f.inlineUrl})`).join('\n\n') + '\n\n[Download image](' + files[0].downloadUrl + ')';
      const assistant = await Storage.addMessage({ conversationId: activeConversationId, role:'assistant', content:markdown, model:'image-generation' });
      UI.appendMessage(assistant, true);
      await loadConversations();
    } catch (err) {
      const message = err?.status === 503
        ? 'Image generation is not connected yet. Add OPENAI_API_KEY to the server environment, then retry. Rockstar will never fake an image result.'
        : (err.message || 'Image generation failed.');
      const assistant = await Storage.addMessage({ conversationId: activeConversationId, role:'assistant', content:`**Image tool:** ${message}`, model:'tool-error' });
      UI.appendMessage(assistant, true);
      UI.showToast(message, 'error', 6000);
    }
  }

  async function handleSendMessage(userText, attachments = []) {
    if ((!userText || !userText.trim()) && (!attachments || attachments.length === 0)) return;
    if (isStreaming) return;

    // Tool-first routing: image requests are handled by the real image provider,
    // not sent to the text model where it could incorrectly claim no image tool exists.
    if (looksLikeImageGeneration(userText)) {
      await handleImageToolMessage(userText, attachments);
      return;
    }

    const effectiveMode = getEffectiveMode();
    if (!effectiveMode.cloud) {
      const localResponse = getLocalNoKeyResponse(userText, attachments);
      const title = (userText || attachments[0]?.name || 'Rockstar Core').slice(0, 35).replace(/\n/g, ' ');
      if (!activeConversationId) {
        const conv = await Storage.createConversation(title || 'Rockstar Core', 'rockstar-core');
        activeConversationId = conv.id;
        if (mobileTitle) mobileTitle.textContent = title || 'Rockstar Core';
        await loadConversations();
      }
      const localUser = await Storage.addMessage({ conversationId: activeConversationId, role: 'user', content: buildStoredUserContent(userText, attachments) });
      UI.appendMessage(localUser, true);
      const localAssistant = await Storage.addMessage({ conversationId: activeConversationId, role: 'assistant', content: localResponse, model: 'rockstar-core' });
      UI.appendMessage(localAssistant, true);
      Composer.clear();
      return;
    }

    const apiContent = buildApiContent(userText, attachments);
    const storedContent = buildStoredUserContent(userText, attachments);
    Composer.clear();

    if (!activeConversationId) {
      let autoTitle = (userText || attachments[0]?.name || 'Attachment').trim().replace(/\n/g, ' ');
      if (autoTitle.length > 35) autoTitle = autoTitle.slice(0, 35).trim() + '...';
      const settings = Storage.getSettings();
      const newConv = await Storage.createConversation(autoTitle, settings.selectedModel);
      activeConversationId = newConv.id;
      if (mobileTitle) mobileTitle.textContent = autoTitle;
      await loadConversations();
    }

    const userMsg = await Storage.addMessage({
      conversationId: activeConversationId,
      role: 'user',
      content: storedContent
    });
    richMessagePayloads.set(userMsg.id, apiContent);
    UI.appendMessage(userMsg, true);

    const history = await Storage.getMessages(activeConversationId);
    const context = compactContext(history, 36);
    const apiMessages = context.messages.map(m => ({
      role: m.role,
      content: richMessagePayloads.has(m.id) ? richMessagePayloads.get(m.id) : m.content
    }));
    if (context.compacted) UI.showToast('Long chat: older messages were trimmed to keep the provider context within its limit.', 'info', 3500);

    const assistantMsgId = 'temp_' + Date.now();
    UI.startStreamingAssistantMessage(assistantMsgId);
    Composer.setGenerating(true);
    isStreaming = true;

    const settings = Storage.getSettings();
    let accumulatedContent = '';

    // Automatic live-web orchestration for explicitly current/search-oriented requests.
    let enrichedMessages = apiMessages;
    if (/\b(search the web|web search|latest|today|current|recent|breaking news|news about)\b/i.test(userText || '')) {
      try {
        const sr = await fetch('/api/tools/web-search', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: userText, maxResults: 6 }) });
        const sd = await sr.json();
        if (sr.ok && Array.isArray(sd.results)) {
          const sourceText = sd.results.map(r => `[${r.rank}] ${r.title}\nURL: ${r.url}\nPublished: ${r.publishedDate || 'unknown'}\n${r.content || ''}`).join('\n\n');
          enrichedMessages = [...apiMessages, { role: 'system', content: `LIVE WEB SEARCH RESULTS. Use these sources for current claims, cite them by URL/title, and clearly distinguish retrieved facts from your own knowledge. Do not invent sources.\n\n${sourceText}` }];
        }
      } catch (_) { enrichedMessages = [...apiMessages, { role: 'system', content: 'The live web-search tool is unavailable for this request. Do not claim that you searched the web or verified current information.' }]; }
    }

    currentStream = AstraClient.streamChat({
      messages: enrichedMessages,
      model: settings.selectedModel,
      systemPrompt: [
        `RUNTIME MODE: VERIFIED ASTRA CLOUD MODE. The application verified the user's Astra key and selected model before this request. If asked which mode is active, state the selected Astra model. Never call this offline or Rockstar Core.`,
        settings.systemPrompt
      ].filter(Boolean).join('\n\n'),
      onChunk: (delta) => {
        accumulatedContent += delta;
        UI.updateStreamingAssistantMessage(assistantMsgId, accumulatedContent);
      },
      onDone: async ({ fullText, model, aborted }) => {
        isStreaming = false;
        currentStream = null;
        Composer.setGenerating(false);
        const finalText = fullText || accumulatedContent;
        UI.finishStreamingAssistantMessage(assistantMsgId, finalText);
        if (finalText.trim().length > 0) {
          await Storage.addMessage({ conversationId: activeConversationId, role: 'assistant', content: finalText, model: model || settings.selectedModel });
          await loadConversations();
        }
        if (aborted) UI.showToast('Generation stopped', 'info');
      },
      onError: async (err) => {
        isStreaming = false;
        currentStream = null;
        Composer.setGenerating(false);
        UI.removeMessage(assistantMsgId);

        const authFailure = err?.status === 401 || /authentication failed|invalid.*api key|api key.*invalid|expired.*api key/i.test(err?.message || '');
        if (authFailure) {
          await fallbackToRockstarCore(
            userText,
            attachments,
            'Astra key was rejected. Switched to Rockstar Core. Add a valid Astra key anytime to use the external model.'
          );
          return;
        }

        UI.showToast(err.message || 'Could not generate a response.', 'error', 6000);
      }
    });
  }

  function handleStopGeneration() {
    if (currentStream && isStreaming) {
      currentStream.abort();
      isStreaming = false;
      currentStream = null;
      Composer.setGenerating(false);
    }
  }

  async function handleEditMessage(msgId) {
    if (isStreaming) handleStopGeneration();
    const messages = await Storage.getMessages(activeConversationId);
    const targetMsg = messages.find(m => m.id === msgId);
    if (!targetMsg) return;

    Composer.setValue(targetMsg.content);

    // Delete this message and subsequent messages
    await Storage.deleteMessagesAfter(activeConversationId, msgId);
    await Storage.deleteMessage(msgId);

    const remaining = await Storage.getMessages(activeConversationId);
    UI.renderMessages(remaining);
  }

  async function handleRegenerateMessage(msgId) {
    if (isStreaming) handleStopGeneration();
    const messages = await Storage.getMessages(activeConversationId);
    const targetIdx = messages.findIndex(m => m.id === msgId);
    if (targetIdx === -1) return;

    // Delete this assistant message and any subsequent messages
    await Storage.deleteMessagesAfter(activeConversationId, msgId);
    await Storage.deleteMessage(msgId);

    const remaining = await Storage.getMessages(activeConversationId);
    UI.renderMessages(remaining);

    // Find the preceding user message to re-trigger
    const lastUserMsg = remaining.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      if (!getEffectiveMode().cloud) {
        const localResponse = RockstarCore.generate(lastUserMsg.content, []);
        const localAssistant = await Storage.addMessage({ conversationId: activeConversationId, role: 'assistant', content: localResponse, model: 'rockstar-core' });
        UI.appendMessage(localAssistant, true);
        return;
      }
      const context = compactContext(remaining, 36);
      const apiMessages = context.messages.map(m => ({ role: m.role, content: richMessagePayloads.has(m.id) ? richMessagePayloads.get(m.id) : m.content }));
      if (context.compacted) UI.showToast('Long chat context trimmed for regeneration.', 'info', 3000);
      const assistantMsgId = 'temp_' + Date.now();
      UI.startStreamingAssistantMessage(assistantMsgId);
      Composer.setGenerating(true);
      isStreaming = true;

      const settings = Storage.getSettings();
      let accumulatedContent = '';

      currentStream = AstraClient.streamChat({
        messages: apiMessages,
        model: settings.selectedModel,
        systemPrompt: [
        `RUNTIME MODE: VERIFIED ASTRA CLOUD MODE. The application verified the user's Astra key and selected model before this request. If asked which mode is active, state the selected Astra model. Never call this offline or Rockstar Core.`,
        settings.systemPrompt
      ].filter(Boolean).join('\n\n'),
        onChunk: (delta) => {
          accumulatedContent += delta;
          UI.updateStreamingAssistantMessage(assistantMsgId, accumulatedContent);
        },
        onDone: async ({ fullText, model }) => {
          isStreaming = false;
          currentStream = null;
          Composer.setGenerating(false);
          const finalText = fullText || accumulatedContent;
          UI.finishStreamingAssistantMessage(assistantMsgId, finalText);
          if (finalText) {
            await Storage.addMessage({
              conversationId: activeConversationId,
              role: 'assistant',
              content: finalText,
              model: model || settings.selectedModel
            });
            await loadConversations();
          }
        },
        onError: async (err) => {
          isStreaming = false;
          currentStream = null;
          Composer.setGenerating(false);
          UI.removeMessage(assistantMsgId);
          const authFailure = err?.status === 401 || /authentication failed|invalid.*api key|api key.*invalid|expired.*api key/i.test(err?.message || '');
          if (authFailure) {
            await Auth.clearAstraKey();
            updateKeyRequiredUI();
            const localResponse = getLocalNoKeyResponse(lastUserMsg.content, []);
            const localAssistant = await Storage.addMessage({ conversationId: activeConversationId, role: 'assistant', content: localResponse, model: 'rockstar-core' });
            UI.appendMessage(localAssistant, true);
            UI.showToast('Astra key was rejected. Switched to Rockstar Core.', 'warning', 6000);
            return;
          }
          UI.showToast(err.message || 'Could not generate a response.', 'error', 6000);
        }
      });
    }
  }

  window.RockstarAI = window.RockstarAI || {};
  window.RockstarAI.getActiveAttachments = () => Composer.getAttachments?.() || [];
  window.RockstarAI.getActiveConversationData = async () => {
    if (!activeConversationId) return null;
    const conv = await Storage.getConversation(activeConversationId);
    const messages = await Storage.getMessages(activeConversationId);
    return { id: activeConversationId, title: conv?.title || 'Rockstar Chat', messages };
  };

  // Boot on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
