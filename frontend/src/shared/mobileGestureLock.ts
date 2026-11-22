const MAP_SELECTOR = '.map-interaction-active .property-map';

function isActiveMapTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(MAP_SELECTOR));
}

/** Prevent iOS Safari's page-level pinch zoom while preserving Leaflet/Neshan gestures on an activated map. */
export function installMobileGestureLock(): () => void {
  const blockPageGesture = (event: Event) => {
    if (!isActiveMapTarget(event.target)) event.preventDefault();
  };
  const blockMultiTouchPageMove = (event: TouchEvent) => {
    if (event.touches.length > 1 && !isActiveMapTarget(event.target)) event.preventDefault();
  };

  document.addEventListener('gesturestart', blockPageGesture, {capture: true, passive: false} as AddEventListenerOptions);
  document.addEventListener('gesturechange', blockPageGesture, {capture: true, passive: false} as AddEventListenerOptions);
  document.addEventListener('gestureend', blockPageGesture, {capture: true, passive: false} as AddEventListenerOptions);
  document.addEventListener('touchmove', blockMultiTouchPageMove, {capture: true, passive: false});

  return () => {
    document.removeEventListener('gesturestart', blockPageGesture, true);
    document.removeEventListener('gesturechange', blockPageGesture, true);
    document.removeEventListener('gestureend', blockPageGesture, true);
    document.removeEventListener('touchmove', blockMultiTouchPageMove, true);
  };
}
