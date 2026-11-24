(() => {
  const section = document.querySelector('[data-reviews]');
  if (!section || section.dataset.ready) return;
  const track = section.querySelector('.reviews-track');
  const group = section.querySelector('.reviews-group');
  const toggle = section.querySelector('.reviews-toggle');
  if (!track || !group || !toggle) return;
  const copy = group.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.classList.add('reviews-copy');
  track.append(copy);
  section.dataset.ready = 'true';
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const paused = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? 'Resume scrolling' : 'Pause scrolling';
    section.dataset.paused = String(paused);
  });
})();
