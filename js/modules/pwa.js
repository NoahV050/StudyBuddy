export async function initializePwa() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  const updateButton = document.getElementById('apply-update-btn');
  let registration;
  let activationRequested = false;

  const showUpdate = () => { banner.hidden = false; };
  const watchInstallingWorker = worker => {
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (activationRequested) window.location.reload();
  });
  updateButton.addEventListener('click', () => {
    if (!registration?.waiting) {
      registration?.update().catch(error => console.error('De app-update kon niet worden gecontroleerd.', error));
      return;
    }
    activationRequested = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), {
    updateViaCache: 'none'
  });
  registration.addEventListener('updatefound', () => watchInstallingWorker(registration.installing));
  if (registration.waiting && navigator.serviceWorker.controller) showUpdate();
}
