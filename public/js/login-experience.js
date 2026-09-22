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


  function setupApiHelp() {
    const layout = document.querySelector('.auth-layout');
    const open = document.getElementById('open-api-help');
    const close = document.getElementById('close-api-help');
    const panel = document.getElementById('auth-help-panel');
    const card = document.querySelector('.auth-card');
    const person = document.getElementById('liquid-person');
    if (!layout || !open || !close || !panel || !card) return;

    const setOpen = (isOpen) => {
      layout.classList.toggle('api-help-open', isOpen);
      panel.setAttribute('aria-hidden', String(!isOpen));
      if ('inert' in panel) panel.inert = !isOpen;
      if ('inert' in card) card.inert = isOpen;
      if (isOpen) {
        close.focus({ preventScroll: true });
      } else {
        open.focus({ preventScroll: true });
      }
    };

    open.addEventListener('click', () => setOpen(true));
    close.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && layout.classList.contains('api-help-open')) setOpen(false);
    });

    // A slow, spring-like liquid-glass figure follows the pointer.
    if (person && window.matchMedia('(pointer:fine)').matches) {
      let targetX = 0, targetY = 0, currentX = 0, currentY = 0, raf = 0;
      const move = (event) => {
        targetX = (event.clientX / window.innerWidth - .5) * 34;
        targetY = (event.clientY / window.innerHeight - .5) * 22;
        if (!raf) raf = requestAnimationFrame(tick);
      };
      const tick = () => {
        currentX += (targetX - currentX) * .045;
        currentY += (targetY - currentY) * .045;
        person.style.transform = `translate3d(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px), 0)`;
        if (Math.abs(targetX-currentX) > .05 || Math.abs(targetY-currentY) > .05) raf = requestAnimationFrame(tick);
        else raf = 0;
      };
      window.addEventListener('pointermove', move, { passive: true });
      window.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupAudio();
    setupApiHelp();
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
