(function () {
  const SLIDE_MS = 5000;
  const shell = document.getElementById('illuSlideshow');
  const dotsWrap = document.getElementById('illuDots');
  if (!shell || !dotsWrap) return;

  const slides = Array.from(shell.querySelectorAll('.illu-photo')).slice(0, 5);
  if (slides.length <= 1) return; // nothing to rotate

  let current = 0;
  let timer = null;
  // Tracks which slides have actually loaded. Remote (Unsplash) images can fail on a
  // restricted network / CSP block; a broken <img> would otherwise sit in rotation
  // showing nothing, which looked identical to "the slideshow is stuck".
  const failed = new Set();

  // build one dot per slide
  const dots = slides.map((_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', `Show photo ${i + 1} of ${slides.length}`);
    btn.addEventListener('click', () => goTo(i, true));
    dotsWrap.appendChild(btn);
    return btn;
  });

  slides.forEach((img, i) => {
    if (img.complete && img.naturalWidth === 0) failed.add(i); // already broken (e.g. cached 404)
    img.addEventListener('error', () => {
      failed.add(i);
      if (current === i) next(); // don't sit on a broken slide
    });
  });

  function render() {
    slides.forEach((img, i) => img.classList.toggle('is-active', i === current));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
  }

  function goTo(index, userInitiated) {
    current = (index + slides.length) % slides.length;
    render();
    if (userInitiated) restart();
  }

  function next() {
    // step forward, skipping any slide whose image failed to load
    let tries = 0;
    let idx = current;
    do {
      idx = (idx + 1) % slides.length;
      tries += 1;
    } while (failed.has(idx) && tries < slides.length);
    goTo(idx, false);
  }

  function restart() {
    if (timer) clearInterval(timer);
    // Note: CSS (@media prefers-reduced-motion) already strips the fade transition,
    // so we still rotate on a timer here — we just do it without animating.
    timer = setInterval(next, SLIDE_MS);
  }

  render();
  restart();

  // pause while the tab is hidden so photos don't jump when you come back
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timer) clearInterval(timer);
    } else {
      restart();
    }
  });
})();