
(() => {
  const section = document.querySelector('.career');
  const toggle = section && section.querySelector('[data-marquee-toggle]');
  if (!toggle) return;
  const track = section.querySelector('.career__track');
  const list = section.querySelector('.career__list');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userChose = false;

  const clone = list.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  clone.classList.add('career__list--clone');
  clone.querySelectorAll('img').forEach((img) => { img.alt = ''; img.loading = 'eager'; });
  track.appendChild(clone);
  track.removeAttribute('tabindex'); // not a scroll area any more; the control is the interaction
  section.classList.add('career--marquee');

  const setPlaying = (playing) => {
    section.classList.toggle('is-paused', !playing);
    const label = playing ? 'Pausar animação' : 'Reproduzir animação';
    toggle.dataset.state = playing ? 'playing' : 'paused';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  };

  toggle.addEventListener('click', () => {
    userChose = true;
    setPlaying(section.classList.contains('is-paused'));
  });
  reduceMotion.addEventListener('change', () => { if (!userChose) setPlaying(!reduceMotion.matches); });

  setPlaying(!reduceMotion.matches);
  section.querySelector('.career__controls').hidden = false;
})();
