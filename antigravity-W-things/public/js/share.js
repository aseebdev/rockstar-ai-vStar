(() => {
  const app = document.getElementById('app');
  const token = window.location.pathname.split('/').filter(Boolean).pop() || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch('/api/tools/share/' + encodeURIComponent(token), { credentials: 'omit', cache: 'no-store' })
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error?.message || 'Share unavailable');
      return d;
    })
    .then((d) => {
      document.title = 'Rockstar AI • ' + (d.conversation?.title || 'Shared conversation');
      const messages = Array.isArray(d.conversation?.messages) ? d.conversation.messages : [];
      app.innerHTML = '<h1>' + esc(d.conversation?.title || 'Shared conversation') + '</h1>' + messages.map(m => '<section class="card"><strong>' + esc(m.role) + '</strong><pre>' + esc(m.content) + '</pre></section>').join('');
    })
    .catch((e) => {
      app.innerHTML = '<div class="card"><h1>Share unavailable</h1><p>' + esc(e.message) + '</p></div>';
    });
})();
