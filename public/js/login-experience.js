(function () {
  const MUSIC_SRC = '/rraudio.mp3';
  const STORY = [
    { text: 'Started with an idea.', pause: 650 },
    { text: 'Turned it into something real.', pause: 650 },
    { text: 'One line of code at a time.', pause: 850 },
    { text: 'Welcome to Aseeb Dev\'s Rockstar AI Model Tester.', pause: 1400 }
  ];
  let audio = null;
  let timers = [];
  let interactionBound = false;

  function setupAudio() {
    audio = document.getElementById('login-music');
    if (!audio) return;
    audio.src = MUSIC_SRC;
    audio.loop = true;
    audio.preload = 'auto';
    const tryPlay = () => {
      if (!document.getElementById('auth-screen')?.classList.contains('hidden')) audio.play().catch(() => {});
    };
    tryPlay();
    if (!interactionBound) {
      interactionBound = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach(type => window.addEventListener(type, tryPlay, { passive: true }));
    }
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
      await wait(i < 14 ? 42 : 31);
    }
  }

  async function showWelcome() {
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
    await wait(650);
    hideWelcome();
  }

  function hideWelcome() {
    clearTimers();
    stopMusic();
    const overlay = document.getElementById('welcome-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function onAuthenticated() {
    // Keep the login music playing through the entire welcome/typing animation.
    // It stops only when the welcome sequence finishes.
    showWelcome();
  }

  document.addEventListener('DOMContentLoaded', setupAudio);
  window.RockstarLoginExperience = { onAuthenticated, stopMusic, showWelcome, hideWelcome };
})();
