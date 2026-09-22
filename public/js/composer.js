/**
 * Rockstar AI Composer
 * Text input, attachment handling, keyboard shortcuts and send/stop state.
 */

const Composer = (function () {
  let textarea = null;
  let sendBtn = null;
  let stopBtn = null;
  let charCountEl = null;
  let tokenCountEl = null;
  let isGenerating = false;
  let onSubmitCallback = null;
  let onStopCallback = null;
  let attachments = [];
  let onAttachmentsChanged = null;

  function init({ onSubmit, onStop, onAttachmentsChanged: attachmentsChanged }) {
    onSubmitCallback = onSubmit;
    onStopCallback = onStop;
    onAttachmentsChanged = attachmentsChanged || null;

    textarea = document.getElementById('composer-textarea');
    sendBtn = document.getElementById('btn-send');
    stopBtn = document.getElementById('btn-stop');
    charCountEl = document.getElementById('char-count');
    tokenCountEl = document.getElementById('token-count');
    const fileInput = document.getElementById('composer-file-input');
    const attachBtn = document.getElementById('btn-attach-file');

    if (!textarea) return;

    textarea.addEventListener('input', () => {
      autoResize();
      updateMeta();
    });

    textarea.addEventListener('keydown', (e) => {
      const settings = Storage.getSettings();
      if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) {
        e.preventDefault();
        submit();
      }
    });

    sendBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      submit();
    });

    stopBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      onStopCallback?.();
    });

    attachBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
      try {
        await addFiles(Array.from(e.target.files || []));
      } catch (err) {
        window.UI?.showToast(err.message || 'Could not attach file.', 'error', 5000);
      } finally {
        e.target.value = '';
      }
    });

    autoResize();
    updateMeta();
    renderAttachments();
  }

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 24), 200)}px`;
    const hasContent = textarea.value.trim().length > 0 || attachments.length > 0;
    if (sendBtn) sendBtn.disabled = !hasContent || isGenerating;
  }

  function updateMeta() {
    const text = textarea ? textarea.value : '';
    const tokenEst = Math.ceil(text.length / 4);
    if (charCountEl) charCountEl.textContent = `${text.length} chars`;
    if (tokenCountEl) tokenCountEl.textContent = `~${tokenEst} tokens`;
  }

  function submit() {
    if (isGenerating) return;
        const text = textarea ? textarea.value.trim() : '';
    if (!text && attachments.length === 0) return;
    onSubmitCallback?.(text, attachments.slice());
  }

  function setGenerating(generating) {
    isGenerating = generating;
    if (sendBtn && stopBtn) {
      sendBtn.classList.toggle('hidden', generating);
      stopBtn.classList.toggle('hidden', !generating);
    }
    autoResize();
  }

  function clear() {
    if (textarea) textarea.value = '';
    attachments = [];
    renderAttachments();
    autoResize();
    updateMeta();
  }

  function setValue(text) {
    if (!textarea) return;
    textarea.value = text || '';
    autoResize();
    updateMeta();
    textarea.focus();
  }

  function getValue() { return textarea ? textarea.value : ''; }
  function focus() { textarea?.focus(); }

  async function addFiles(files) {
    const MAX_FILES = 5;
    const MAX_SIZE = 8 * 1024 * 1024;
    if (attachments.length + files.length > MAX_FILES) {
      throw new Error(`You can attach up to ${MAX_FILES} files per message.`);
    }

    for (const file of files) {
      if (file.size > MAX_SIZE) throw new Error(`${file.name} is larger than 8 MB.`);

      if (file.type.startsWith('image/')) {
        attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mime: file.type,
          size: file.size,
          kind: 'image',
          dataUrl: await readAsDataURL(file)
        });
        continue;
      }

      if (isTextLike(file)) {
        const text = await file.text();
        if (text.length > 120000) throw new Error(`${file.name} contains too much text (120,000 characters max).`);
        attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mime: file.type || 'text/plain',
          size: file.size,
          kind: 'text',
          text
        });
        continue;
      }

      const documentExts = new Set(['pdf','docx','xlsx','xls','pptx']);
      const ext = file.name.toLowerCase().split('.').pop();
      if (documentExts.has(ext)) {
        const data = await readAsDataURL(file);
        const response = await fetch('/api/attachments/extract', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, mime: file.type, data })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error?.message || `Could not read ${file.name}.`);
        attachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: file.name, mime: file.type || 'application/octet-stream', size: file.size, kind: 'text', text: result.text || ''
        });
        continue;
      }

      throw new Error(`${file.name} is not supported. Try an image, text/code file, PDF, DOCX, XLS/XLSX or PPTX.`);
    }

    renderAttachments();
    autoResize();
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function isTextLike(file) {
    const name = file.name.toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const textExts = new Set([
      'txt','md','markdown','json','csv','tsv','js','jsx','mjs','cjs','ts','tsx',
      'html','css','scss','less','xml','yaml','yml','sql','py','java','c','cpp',
      'h','hpp','cs','php','rb','go','rs','sh','bat','ps1','env','log'
    ]);
    return file.type.startsWith('text/') || textExts.has(ext);
  }

  function renderAttachments() {
    const wrap = document.getElementById('composer-attachments');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.classList.toggle('hidden', attachments.length === 0);

    attachments.forEach(att => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      const icon = att.kind === 'image' ? '🖼️' : '📄';
      chip.innerHTML = `<span class="attachment-icon">${icon}</span><span class="attachment-name"></span><button type="button" class="attachment-remove" aria-label="Remove attachment">×</button>`;
      chip.querySelector('.attachment-name').textContent = att.name;
      chip.querySelector('.attachment-remove').addEventListener('click', () => {
        attachments = attachments.filter(item => item.id !== att.id);
        renderAttachments();
        autoResize();
      });
      wrap.appendChild(chip);
    });
    onAttachmentsChanged?.(attachments.slice());
  }

  function getAttachments() { return attachments.slice(); }
  function hasAttachments() { return attachments.length > 0; }

  return {
    init,
    setGenerating,
    clear,
    setValue,
    getValue,
    focus,
    addFiles,
    getAttachments,
    hasAttachments,
    renderAttachments,
    refreshKeyState: autoResize
  };
})();

window.Composer = Composer;
