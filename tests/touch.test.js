import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installTouchGuard } from '../src/touch.js';
function setup() {
  const handlers = {};
  installTouchGuard({ addEventListener(type, handler, options) {
    assert.equal(options.passive, false);
    handlers[type] = handler;
  }});
  return (type, overrides = {}) => {
    const event = { touches: [], changedTouches: [{clientX: 10, clientY: 20}],
      timeStamp: 1000, cancelable: true, prevented: false,
      preventDefault() { this.prevented = true; }, ...overrides };
    handlers[type](event);
    return event.prevented;
  };
}
test('首点保留，邻近连续双点阻止缩放，间隔点击保留', () => {
  const send = setup();
  assert.equal(send('touchend'), false);
  assert.equal(send('touchend', {timeStamp: 1200}), true);
  assert.equal(send('touchend', {timeStamp: 1800}), false);
});
test('不同位置点击、单指滚动保留；双指和Safari缩放手势阻止', () => {
  const send = setup();
  send('touchend');
  assert.equal(send('touchend', {timeStamp: 1100, changedTouches: [{clientX: 100, clientY: 200}]}), false);
  assert.equal(send('touchmove', {touches: [{}]}), false);
  assert.equal(send('touchmove', {touches: [{}, {}]}), true);
  assert.equal(send('gesturestart'), true);
  assert.equal(send('dblclick'), true);
});
