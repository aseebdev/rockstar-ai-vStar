(function () {
  const MUSIC_SRC = '/rraudio.mp3';
  const STORY = [
    { text: 'Started with an idea.', pause: 620 },
    { text: 'Turned it into something real.', pause: 620 },
    { text: 'One line of code at a time.', pause: 760 },
    { text: 'Welcome to Aseeb Dev\'s Rockstar AI.', pause: 1200 }
  ];
  let audio = null;
  let timers = [];
  let interactionBound = false;
  let musicPaused = false;
  let bootTimer = null;

  function musicStateKey() { return 'rockstar_music_paused'; }

  function isPausedPreference() {
    try { return localStorage.getItem(musicStateKey()) === '1'; } catch (_) { return false; }
  }

  function setMusicButton(paused) {
    const btn = document.getElementById('music-toggle');
    if (!btn) return;
    btn.classList.toggle('paused', paused);
    btn.setAttribute('aria-label', paused ? 'Play login music' : 'Pause login music');
    btn.title = paused ? 'Play login music' : 'Pause login music';
    const label = btn.querySelector('.music-toggle-label');
    if (label) label.textContent = paused ? 'Play' : 'Music';
  }

  function persistMusicPreference(paused) {
    try { localStorage.setItem(musicStateKey(), paused ? '1' : '0'); } catch (_) {}
  }

  function setupAudio() {
    audio = document.getElementById('login-music');
    if (!audio) return;
    audio.src = MUSIC_SRC;
    audio.loop = true;
    audio.preload = 'auto';
    musicPaused = isPausedPreference();
    setMusicButton(musicPaused);

    const tryPlay = () => {
      const authVisible = !document.getElementById('auth-screen')?.classList.contains('hidden');
      document.getElementById('music-toggle')?.classList.toggle('hidden', !authVisible);
      if (musicPaused || !authVisible || audio.paused === false) return;
      audio.play().catch(() => {});
    };

    if (!musicPaused) tryPlay();
    if (!interactionBound) {
      interactionBound = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach(type => window.addEventListener(type, tryPlay, { passive: true }));
    }

    document.getElementById('music-toggle')?.addEventListener('click', (event) => {
      event.preventDefault();
      musicPaused = !musicPaused;
      persistMusicPreference(musicPaused);
      setMusicButton(musicPaused);
      if (musicPaused) {
        audio.pause();
      } else {
        audio.play().catch(() => {});
      }
    });
  }

  function stopMusic() {
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch (_) {}
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function wait(ms) { return new Promise(resolve => timers.push(setTimeout(resolve, ms))); }

  async function typeText(el, text) {
    el.textContent = '';
    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i];
      await wait(i < 12 ? 34 : 24);
    }
  }

  async function showWelcome() {
    const musicButton = document.getElementById('music-toggle');
    musicButton?.classList.remove('hidden');
    const overlay = document.getElementById('welcome-overlay');
    const title = document.getElementById('welcome-typing');
    const motivation = document.getElementById('welcome-motivation');
    const subtitle = document.getElementById('welcome-subtitle');
    if (!overlay || !title) return;

    clearTimers();
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    if (motivation) motivation.textContent = '';
    if (subtitle) subtitle.textContent = 'Your workspace is ready.';

    for (let i = 0; i < STORY.length; i++) {
      await typeText(title, STORY[i].text);
      if (i === 2 && motivation) {
        motivation.textContent = 'Don\'t just use technology. Build it.';
        motivation.classList.add('visible');
      }
      await wait(STORY[i].pause);
    }
    await wait(500);
    hideWelcome();
  }

  function hideWelcome() {
    clearTimers();
    stopMusic();
    const overlay = document.getElementById('welcome-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.getElementById('music-toggle')?.classList.add('hidden');
  }

  function playExit() {
    const overlay = document.getElementById('exit-overlay');
    const app = document.getElementById('app-container');
    if (!overlay) return Promise.resolve();
    overlay.classList.remove('hidden');
    overlay.classList.remove('play');
    void overlay.offsetWidth;
    overlay.classList.add('play');
    app?.classList.add('exiting');
    return new Promise(resolve => setTimeout(resolve, 1050));
  }

  function boot() {
    const overlay = document.getElementById('boot-overlay');
    if (!overlay) return;
    overlay.classList.add('booting');
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => {
      overlay.classList.add('boot-done');
      setTimeout(() => overlay.remove(), 850);
    }, 1550);
  }

  function onAuthenticated() { showWelcome(); }

  document.addEventListener('DOMContentLoaded', () => {
    setupAudio();
    boot();
  });

  window.RockstarLoginExperience = {
    onAuthenticated,
    stopMusic,
    showWelcome,
    hideWelcome,
    playExit
  };
})();
