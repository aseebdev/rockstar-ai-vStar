/**
 * Rockstar AI Tools layer.
 * Only exposes actions that the browser/application can actually perform.
 */
const RockstarTools = (() => {
  let dialog;
  let modeTitle;
  let modeDescription;
  let note;

  function init() {
    dialog = document.getElementById('tools-dialog');
    modeTitle = document.getElementById('tool-mode-title');
    modeDescription = document.getElementById('tool-mode-description');
    note = document.getElementById('tool-capability-note');
    document.getElementById('btn-tools')?.addEventListener('click', open);
    document.getElementById('close-tools')?.addEventListener('click', close);
    document.querySelectorAll('[data-tool-action]').forEach(btn => btn.addEventListener('click', () => run(btn.dataset.toolAction)));
    document.getElementById('btn-voice')?.addEventListener('click', toggleVoice);
    updateMode();
  }

  function currentMode() {
    const settings = Storage.getSettings();
    const hasKey = Auth.hasAstraKey();
    if (settings.aiMode === 'offline') return { id: 'offline', title: 'Rockstar Core • Offline', description: 'Cloud calls are disabled by your selected mode.' };
    if (settings.aiMode === 'cloud' && hasKey) return { id: 'cloud', title: `Astra AI • ${settings.selectedModel || 'selected model'}`, description: 'Configured cloud route using your connected Astra API key.' };
    if (settings.aiMode === 'automatic' && hasKey) return { id: 'cloud', title: `Astra AI • ${settings.selectedModel || 'selected model'}`, description: 'Automatic mode selected your configured Astra model.' };
    return { id: 'offline', title: 'Rockstar Core • Offline', description: 'No Astra key is connected, so Automatic mode stays offline.' };
  }

  function updateMode() {
    const mode = currentMode();
    if (modeTitle) modeTitle.textContent = mode.title;
    if (modeDescription) modeDescription.textContent = mode.description;
    const dot = document.getElementById('tool-mode-dot');
    dot?.classList.toggle('cloud', mode.id === 'cloud');
  }

  async function open() {
    updateMode();
    if (dialog && !dialog.open) dialog.showModal();
    await loadCapabilities();
  }

  function close() { dialog?.close(); }

  async function loadCapabilities() {
    try {
      const res = await fetch('/api/capabilities', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      note.textContent = `Ready: file analysis, document export and browser voice. Not connected: web search, image generation and server-side code sandbox.`;
    } catch (err) {
      note.textContent = `Capability check failed: ${err.message}. No unavailable tool will be simulated.`;
    }
  }

  async function getCurrentData() {
    const workspace = window.RockstarAI?.getActiveConversationData?.();
    if (!workspace) throw new Error('Open a conversation before exporting it.');
    return workspace;
  }

  function download(text, name, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function markdown(data) {
    return data.messages.map(m => `## ${m.role === 'user' ? 'User' : 'Rockstar AI'}\n\n${m.content || ''}`).join('\n\n');
  }

  function html(data) {
    const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6}article{margin:28px 0;padding:18px;border:1px solid #ddd;border-radius:12px}h1{margin-bottom:30px}pre{white-space:pre-wrap}</style></head><body><h1>${esc(data.title)}</h1>${data.messages.map(m => `<article><strong>${m.role === 'user' ? 'User' : 'Rockstar AI'}</strong><pre>${esc(m.content)}</pre></article>`).join('')}</body></html>`;
  }

  async function run(action) {
    try {
      if (action === 'capabilities') { await loadCapabilities(); return; }
      const data = await getCurrentData();
      const safe = data.title.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'rockstar-chat';
      if (action === 'export-txt') download(data.messages.map(m => `[${m.role.toUpperCase()}]\n${m.content || ''}`).join('\n\n'), `${safe}.txt`, 'text/plain');
      if (action === 'export-md') download(`# ${data.title}\n\n${markdown(data)}`, `${safe}.md`, 'text/markdown');
      if (action === 'export-html') download(html(data), `${safe}.html`, 'text/html');
      if (action === 'export-json') download(JSON.stringify(data, null, 2), `${safe}.json`, 'application/json');
      if (action === 'print-pdf') {
        const w = window.open('', '_blank', 'noopener,noreferrer');
        if (!w) throw new Error('Your browser blocked the print window. Allow pop-ups for Rockstar AI.');
        w.document.write(html(data)); w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
      }
      UI.showToast('Tool completed successfully.', 'success');
    } catch (err) {
      UI.showToast(err.message || 'Tool could not complete.', 'error', 5000);
    }
  }

  let recognition = null;
  function toggleVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { UI.showToast('Voice input is not supported by this browser.', 'warning'); return; }
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRecognition();
    recognition.lang = Storage.getSettings().voiceLanguage || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    const button = document.getElementById('btn-voice');
    button?.classList.add('recording');
    recognition.onresult = e => {
      let text = ''; for (const r of e.results) text += r[0].transcript;
      const ta = document.getElementById('composer-textarea');
      if (ta) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    recognition.onerror = e => UI.showToast(`Voice input: ${e.error}`, 'warning');
    recognition.onend = () => { recognition = null; button?.classList.remove('recording'); };
    recognition.start();
  }

  return { init, updateMode };
})();
window.RockstarTools = RockstarTools;
