/**
 * Astra Local AI - UI Renderer & Interaction Engine
 * Manages message rendering, token streaming DOM updates, auto-scroll, toasts, and dialogs.
 */

const UI = (function () {
  let isUserScrolledUp = false;
  let chatWindowEl = null;
  let messagesInnerEl = null;
  let emptyStateEl = null;
  let scrollBottomBtn = null;
  let toastContainer = null;

  function init() {
    chatWindowEl = document.getElementById('chat-window');
    messagesInnerEl = document.getElementById('messages-inner');
    emptyStateEl = document.getElementById('empty-state');
    scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    toastContainer = document.getElementById('toast-container');

    // Setup scroll watcher
    if (chatWindowEl) {
      chatWindowEl.addEventListener('scroll', () => {
        const threshold = 120;
        const distFromBottom = chatWindowEl.scrollHeight - chatWindowEl.scrollTop - chatWindowEl.clientHeight;
        isUserScrolledUp = distFromBottom > threshold;

        if (scrollBottomBtn) {
          if (isUserScrolledUp) {
            scrollBottomBtn.classList.remove('hidden');
          } else {
            scrollBottomBtn.classList.add('hidden');
          }
        }
      });
    }

    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', () => {
        scrollToBottom(true);
      });
    }

    // Global copy button handler (event delegation)
    document.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('.code-copy-btn');
      if (copyBtn) {
        const code = copyBtn.getAttribute('data-code') || '';
        try {
          await navigator.clipboard.writeText(code);
          const origText = copyBtn.innerHTML;
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
          `;
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = origText;
          }, 2000);
        } catch (err) {
          showToast('Failed to copy code to clipboard', 'error');
        }
        return;
      }

      const msgCopyBtn = e.target.closest('[data-action="copy-message"]');
      if (msgCopyBtn) {
        const row = msgCopyBtn.closest('.message-row');
        const contentEl = row?.querySelector('.message-bubble');
        if (contentEl) {
          try {
            await navigator.clipboard.writeText(contentEl.innerText);
            showToast('Message copied to clipboard', 'success');
          } catch (err) {
            showToast('Could not copy message', 'error');
          }
        }
      }
    });
  }

  function scrollToBottom(force = false) {
    if (!chatWindowEl) return;
    const settings = Storage.getSettings();
    if (!settings.autoScroll && !force) return;

    if (!isUserScrolledUp || force) {
      chatWindowEl.scrollTop = chatWindowEl.scrollHeight;
      if (force && scrollBottomBtn) {
        scrollBottomBtn.classList.add('hidden');
        isUserScrolledUp = false;
      }
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function toggleEmptyState(show) {
    if (!emptyStateEl) return;
    if (show) {
      emptyStateEl.classList.remove('hidden');
    } else {
      emptyStateEl.classList.add('hidden');
    }
  }

  function renderMessages(messages) {
    if (!messagesInnerEl) return;
    messagesInnerEl.innerHTML = '';

    if (!messages || messages.length === 0) {
      toggleEmptyState(true);
      return;
    }

    toggleEmptyState(false);
    messages.forEach(msg => {
      appendMessage(msg, false);
    });
    scrollToBottom(true);
  }

  function appendMessage(msg, shouldScroll = true) {
    toggleEmptyState(false);

    const row = document.createElement('div');
    row.className = `message-row message-${msg.role}`;
    row.id = `msg-${msg.id}`;

    const isUser = msg.role === 'user';
    const senderName = isUser ? 'You' : 'Astra AI';
    const avatar = isUser
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

    const timeStr = formatTime(msg.createdAt);
    const settings = Storage.getSettings();
    const showTimestamp = settings.showTimestamps;

    const renderedContent = isUser
      ? `<div class="user-text">${MarkdownRenderer.escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>`
      : `<div class="markdown-body">${MarkdownRenderer.render(msg.content)}</div>`;

    row.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${avatar}</div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">${senderName}</span>
          ${showTimestamp ? `<span class="message-timestamp">${timeStr}</span>` : ''}
        </div>
        <div class="message-bubble">${renderedContent}</div>
        <div class="message-actions">
          <button type="button" class="action-pill-btn" data-action="copy-message" title="Copy text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
          ${isUser ? `
            <button type="button" class="action-pill-btn" data-action="edit-message" data-id="${msg.id}" title="Edit message">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              <span>Edit</span>
            </button>
          ` : `
            <button type="button" class="action-pill-btn" data-action="regenerate-message" data-id="${msg.id}" title="Regenerate response">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              <span>Regenerate</span>
            </button>
          `}
        </div>
      </div>
    `;

    messagesInnerEl.appendChild(row);
    if (shouldScroll) scrollToBottom();
  }

  function startStreamingAssistantMessage(messageId) {
    toggleEmptyState(false);

    const row = document.createElement('div');
    row.className = 'message-row message-assistant streaming';
    row.id = `msg-${messageId}`;

    const avatar = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
    const timeStr = formatTime(Date.now());
    const settings = Storage.getSettings();

    row.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${avatar}</div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-sender">Astra AI</span>
          ${settings.showTimestamps ? `<span class="message-timestamp">${timeStr}</span>` : ''}
        </div>
        <div class="message-bubble">
          <div class="typing-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
          <div class="markdown-body"></div>
        </div>
        <div class="message-actions hidden">
          <button type="button" class="action-pill-btn" data-action="copy-message">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
          <button type="button" class="action-pill-btn" data-action="regenerate-message" data-id="${messageId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            <span>Regenerate</span>
          </button>
        </div>
      </div>
    `;

    messagesInnerEl.appendChild(row);
    scrollToBottom();
  }

  function updateStreamingAssistantMessage(messageId, fullText) {
    const row = document.getElementById(`msg-${messageId}`);
    if (!row) return;

    const typingEl = row.querySelector('.typing-indicator');
    if (typingEl) typingEl.style.display = 'none';

    const mdEl = row.querySelector('.markdown-body');
    if (mdEl) {
      mdEl.innerHTML = MarkdownRenderer.render(fullText);
    }
    scrollToBottom();
  }

  function finishStreamingAssistantMessage(messageId, fullText) {
    const row = document.getElementById(`msg-${messageId}`);
    if (!row) return;

    row.classList.remove('streaming');
    const typingEl = row.querySelector('.typing-indicator');
    if (typingEl) typingEl.remove();

    const mdEl = row.querySelector('.markdown-body');
    if (mdEl) {
      mdEl.innerHTML = MarkdownRenderer.render(fullText);
    }

    const actionsEl = row.querySelector('.message-actions');
    if (actionsEl) {
      actionsEl.classList.remove('hidden');
    }
    scrollToBottom();
  }

  function removeMessage(messageId) {
    const row = document.getElementById(`msg-${messageId}`);
    if (row) row.remove();
  }

  function showToast(message, type = 'info', duration = 3500) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message">${MarkdownRenderer.escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return {
    init,
    scrollToBottom,
    renderMessages,
    appendMessage,
    startStreamingAssistantMessage,
    updateStreamingAssistantMessage,
    finishStreamingAssistantMessage,
    removeMessage,
    showToast
  };
})();

// Attach to window
window.UI = UI;
