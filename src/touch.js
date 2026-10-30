// Safari may ignore viewport scale limits. Cancel zoom gestures explicitly,
// without cancelling the first tap or single-finger scrolling.
export function installTouchGuard(target) {
  let previous = null;
  target.addEventListener('touchend', (event) => {
    if (event.touches.length || event.changedTouches.length !== 1) {
      previous = null;
      return;
    }
    const touch = event.changedTouches[0];
    const now = event.timeStamp;
    const doubleTap = previous && now - previous.time < 350 &&
      Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) < 40;
    previous = { time: now, x: touch.clientX, y: touch.clientY };
    if (doubleTap && event.cancelable) event.preventDefault();
  }, { passive: false });
  target.addEventListener('gesturestart', (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  target.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { passive: false });
  target.addEventListener('dblclick', (event) => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
}
