
class Carousel {
  constructor(root) {
    this.root = root;
    this.viewport = root.querySelector('[data-carousel-viewport]');
    this.track = this.viewport.firstElementChild;
    this.originals = [...this.track.children];
    this.n = this.originals.length;
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.interval = Number(root.dataset.interval) || 4500;
    this.resumeDelay = 3000;
    this.holds = new Set();
    this.userPaused = this.reduce.matches;
    this.timer = 0;
    this.travel = 0; // px moved by the last pointer gesture (lets cards tell a tap from a drag)
    if (this.n < 2) return;
    if (root.hasAttribute('data-defer-images')) this.deferImages();

    this.originals.forEach((slide, i) => {
      slide.dataset.index = i;
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'card');
      slide.setAttribute('aria-label', `${i + 1} de ${this.n}`);
    });
    this.buildClones();
    if (!this.originals[0].querySelector('a, button, [tabindex]')) this.viewport.tabIndex = 0;
    this.buildNav();
    this.measure();
    this.jump(this.base);
    this.bind();
    this.root.classList.add('is-ready');
    this.update();
    this.schedule();
  }

  deferImages() {
    const imgs = [...this.track.querySelectorAll('img')].filter((img) => !(img.complete && img.naturalWidth));
    imgs.forEach((img) => {
      if (img.hasAttribute('srcset')) { img.dataset.srcset = img.getAttribute('srcset'); img.removeAttribute('srcset'); }
      img.dataset.src = img.getAttribute('src');
      img.removeAttribute('src');
    });
    const restore = () => this.track.querySelectorAll('img[data-src]').forEach((img) => {
      if (img.dataset.srcset) img.setAttribute('srcset', img.dataset.srcset);
      img.setAttribute('src', img.dataset.src);
      delete img.dataset.src;
      delete img.dataset.srcset;
    });
    if (!('IntersectionObserver' in window)) { restore(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); restore(); }
    }, { rootMargin: '600px 0px' });
    io.observe(this.root);
  }

  buildClones() {
    const cloneOf = (slide) => {
      const c = slide.cloneNode(true);
      c.classList.add('is-clone');
      c.setAttribute('aria-hidden', 'true');
      c.removeAttribute('role');
      c.removeAttribute('aria-roledescription');
      c.removeAttribute('aria-label');
      c.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      c.querySelectorAll('a, button, [tabindex]').forEach((el) => { el.tabIndex = -1; });
      c.querySelectorAll('img').forEach((img) => { img.alt = ''; });
      return c;
    };
    const before = this.originals.map(cloneOf);
    const after = this.originals.map(cloneOf);
    this.track.prepend(...before);
    this.track.append(...after);
  }

  buildNav() {
    this.nav = this.root.querySelector('[data-carousel-nav]');
    if (!this.nav) return;
    this.dots = this.originals.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'carousel__dot';
      b.setAttribute('aria-label', `Ir para o card ${i + 1} de ${this.n}`);
      b.addEventListener('click', () => this.goTo(i));
      return b;
    });
    this.nav.querySelector('[data-carousel-dots]').append(...this.dots);
    this.nav.querySelector('[data-carousel-prev]').addEventListener('click', () => this.go(-1));
    this.nav.querySelector('[data-carousel-next]').addEventListener('click', () => this.go(1));
    this.toggle = this.nav.querySelector('[data-carousel-toggle]');
    this.toggle.addEventListener('click', () => {
      this.userPaused = !this.userPaused;
      this.syncToggle();
      this.schedule();
    });
    this.syncToggle();
    this.nav.hidden = false;
  }

  syncToggle() {
    if (!this.toggle) return;
    const label = this.userPaused ? 'Retomar rolagem automática' : 'Pausar rolagem automática';
    this.toggle.dataset.state = this.userPaused ? 'paused' : 'playing';
    this.toggle.setAttribute('aria-label', label);
    this.toggle.title = label;
  }

  measure() {
    const pad = parseFloat(getComputedStyle(this.track).paddingLeft) || 0;
    this.base = this.originals[0].offsetLeft - pad;
    this.step = this.originals[1].offsetLeft - this.originals[0].offsetLeft;
    this.setWidth = this.step * this.n;
  }

  get behavior() { return this.reduce.matches ? 'auto' : 'smooth'; }
  jump(left) { this.viewport.scrollTo({ left, behavior: 'auto' }); }
  index() {
    const i = Math.round((this.viewport.scrollLeft - this.base) / this.step);
    return ((i % this.n) + this.n) % this.n;
  }

  normalize() {
    const x = this.viewport.scrollLeft;
    if (x < this.base - this.step / 2) this.jump(x + this.setWidth);
    else if (x >= this.base + this.setWidth - this.step / 2) this.jump(x - this.setWidth);
  }

  go(delta) {
    this.normalize();
    this.viewport.scrollBy({ left: delta * this.step, behavior: this.behavior });
  }

  goTo(i) {
    this.normalize();
    this.viewport.scrollTo({ left: this.base + i * this.step, behavior: this.behavior });
  }

  update() {
    if (!this.dots) return;
    const active = this.index();
    this.dots.forEach((d, i) => d.setAttribute('aria-current', i === active ? 'true' : 'false'));
  }

  canPlay() { return !this.userPaused && this.holds.size === 0 && !document.hidden; }

  schedule(delay = this.interval) {
    clearTimeout(this.timer);
    if (!this.canPlay()) return;
    this.timer = setTimeout(() => {
      if (this.canPlay()) this.go(1);
      this.schedule();
    }, delay);
  }

  hold(reason) { this.holds.add(reason); clearTimeout(this.timer); }
  release(reason, delay = this.resumeDelay) {
    if (!this.holds.delete(reason)) return;
    this.schedule(Math.max(delay, 600));
  }
  lock(on) { if (on) this.hold('lock'); else this.release('lock'); }

  bind() {
    const vp = this.viewport;
    let settleTimer = 0;
    let frame = 0;
    const settle = () => { if (!this.dragging) { this.normalize(); this.update(); } };
    vp.addEventListener('scroll', () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; this.update(); });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 140);
    }, { passive: true });
    vp.addEventListener('scrollend', () => { clearTimeout(settleTimer); settle(); });

    this.root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.hold('hover'); });
    this.root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.release('hover'); });
    this.root.addEventListener('focusin', () => this.hold('focus'));
    this.root.addEventListener('focusout', (e) => { if (!this.root.contains(e.relatedTarget)) this.release('focus'); });
    document.addEventListener('visibilitychange', () => this.schedule());
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) this.release('offscreen', this.interval); else this.hold('offscreen');
      }, { threshold: 0.25 }).observe(this.root);
    }

    let start = null;
    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.hold('press');
      this.travel = 0;
      start = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, id: e.pointerId, mouse: e.pointerType === 'mouse' };
    });
    vp.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      this.travel = Math.max(this.travel, Math.hypot(dx, e.clientY - start.y));
      if (!start.mouse) return;
      if (!this.dragging && Math.abs(dx) > 5) {
        this.dragging = true;
        this.root.classList.add('is-dragging');
        vp.setPointerCapture(e.pointerId);
      }
      if (this.dragging) vp.scrollLeft = start.left - dx;
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (this.dragging) {
        this.dragging = false;
        this.root.classList.remove('is-dragging');
        const i = Math.round((vp.scrollLeft - this.base) / this.step);
        vp.scrollTo({ left: this.base + i * this.step, behavior: this.behavior });
      }
      this.release('press');
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('click', (e) => {
      if (this.travel > 10) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    vp.addEventListener('dragstart', (e) => e.preventDefault());

    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!vp.contains(document.activeElement)) return;
      e.preventDefault();
      this.go(e.key === 'ArrowRight' ? 1 : -1);
    });

    if ('ResizeObserver' in window) {
      let last = vp.clientWidth;
      new ResizeObserver(() => {
        if (vp.clientWidth === last) return;
        last = vp.clientWidth;
        const i = this.index();
        this.measure();
        this.jump(this.base + i * this.step);
      }).observe(vp);
    }
    this.reduce.addEventListener('change', () => {
      this.userPaused = this.reduce.matches;
      this.syncToggle();
      this.schedule();
    });
  }
}

const carousels = new Map();
document.querySelectorAll('[data-carousel]').forEach((root) => carousels.set(root, new Carousel(root)));

const CAREER = [
  { club: 'Corinthians', period: '2005–2017', text: 'Comecei no Corinthians aos 5 anos e passei mais de 12 anos nas categorias de base do clube, encerrando esse ciclo com a conquista da Copa São Paulo de Futebol Júnior.' },
  { club: 'Atlético-MG', period: '2017–2019', text: 'Depois da base, foi no Atlético-MG que fiz minha estreia como jogador profissional. Foram 2 anos no clube.' },
  { club: 'Joinville', period: '2019–2021', text: 'No Joinville, disputei a Série D do Brasileiro e somei mais 2 anos de experiência no futebol profissional.' },
  { club: 'Bahia', period: '2021', text: 'No Bahia, joguei Série A, Sul-Americana e Copa do Brasil, e fui campeão da Copa do Nordeste.' },
  { club: 'Sheriff Tiraspol', period: '2022–2023', text: 'Minha carreira chegou à Europa no Sheriff Tiraspol, onde disputei competições internacionais e vivi por uma temporada e meia a rotina do futebol europeu em alto nível.' },
  { club: 'NK Osijek', period: '2023–2026', text: 'Depois, foram três anos na Croácia, ampliando ainda mais minha experiência dentro do futebol europeu.' },
];

(() => {
  const root = document.querySelector('.carousel--career');
  const carousel = root && carousels.get(root);
  if (!carousel || !carousel.originals) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DURATION = 600;
  const EASE = 'cubic-bezier(.2,.7,.2,1)';

  const zoom = document.createElement('div');
  zoom.className = 'card-zoom';
  zoom.hidden = true;
  zoom.innerHTML = `
    <div class="card-zoom__backdrop"></div>
    <div class="card-zoom__card" role="dialog" aria-modal="true" tabindex="0" aria-labelledby="card-zoom-club" aria-describedby="card-zoom-period card-zoom-text">
      <div class="card-zoom__inner">
        <div class="card-zoom__face card-zoom__front"><img alt="" width="400" height="600"></div>
        <div class="card-zoom__face card-zoom__back">
          <p class="card-zoom__club" id="card-zoom-club"></p>
          <p class="card-zoom__period" id="card-zoom-period"></p>
          <p class="card-zoom__text" id="card-zoom-text"></p>
        </div>
      </div>
    </div>`;
  document.body.append(zoom);
  const backdrop = zoom.querySelector('.card-zoom__backdrop');
  const card = zoom.querySelector('.card-zoom__card');
  const inner = zoom.querySelector('.card-zoom__inner');
  const frontImg = zoom.querySelector('.card-zoom__front img');

  let state = 'closed'; // closed | opening | open | closing
  let source = null;    // the card element (original or clone) the zoom came from
  let original = null;  // the original card (keeps aria-expanded and gets focus back)

  root.querySelectorAll('.career-card').forEach((el) => {
    const slide = el.closest('.carousel__slide');
    const isClone = slide.classList.contains('is-clone');
    const src = el.querySelector('img').getAttribute('src');
    const i = carousel.originals.findIndex((o) => o.querySelector('img').getAttribute('src') === src);
    el.dataset.career = i;
    if (!isClone) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-haspopup', 'dialog');
      el.setAttribute('aria-expanded', 'false');
      el.setAttribute('aria-label', `${CAREER[i].club}, ${CAREER[i].period}: ver a história no clube`);
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        carousel.travel = 0;
        open(el);
      });
    }
    el.addEventListener('click', () => open(el));
  });

  const fromSource = () => {
    const s = source.getBoundingClientRect();
    const f = card.getBoundingClientRect();
    const scale = s.width / f.width;
    const dx = s.left + s.width / 2 - (f.left + f.width / 2);
    const dy = s.top + s.height / 2 - (f.top + f.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  };

  const lockPage = (on) => {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = on ? 'hidden' : '';
    document.body.style.paddingRight = on && gap > 0 ? `${gap}px` : '';
  };

  function open(el) {
    if (state !== 'closed') return;
    if (carousel.travel > 10) return; // it was a drag, not a tap
    const i = Number(el.dataset.career);
    const data = CAREER[i];
    if (!data) return;
    state = 'opening';
    source = el;
    original = carousel.originals[i].querySelector('.career-card');
    carousel.lock(true);

    frontImg.src = el.querySelector('img').getAttribute('src').replace(/-400\.jpg$/, '-640.jpg');
    zoom.querySelector('.card-zoom__club').textContent = data.club;
    zoom.querySelector('.card-zoom__period').textContent = data.period;
    zoom.querySelector('.card-zoom__text').textContent = data.text;

    lockPage(true);
    zoom.hidden = false;
    original.setAttribute('aria-expanded', 'true');
    card.focus({ preventScroll: true });

    if (reduce.matches) { source.classList.add('is-source'); state = 'open'; return; }
    const from = fromSource();
    source.classList.add('is-source');
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION * 0.8, easing: 'ease' });
    inner.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: DURATION, easing: EASE });
    card.animate([{ transform: from }, { transform: 'none' }], { duration: DURATION, easing: EASE })
      .finished.then(() => { state = 'open'; }, () => { state = 'open'; });
  }

  function close() {
    if (state !== 'open') return;
    state = 'closing';
    const done = () => {
      zoom.hidden = true;
      source.classList.remove('is-source');
      lockPage(false);
      original.setAttribute('aria-expanded', 'false');
      original.focus({ preventScroll: true });
      carousel.lock(false);
      state = 'closed';
    };
    if (reduce.matches) { done(); return; }
    const to = fromSource();
    const opts = { duration: DURATION, easing: EASE, fill: 'forwards' };
    const anims = [
      backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION * 0.8, easing: 'ease', fill: 'forwards' }),
      inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], opts),
      card.animate([{ transform: 'none' }, { transform: to }], opts),
    ];
    anims[2].finished.then(() => { done(); anims.forEach((a) => a.cancel()); });
  }

  card.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    if (e.key === 'Tab') e.preventDefault(); // focus stays on the open card
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
