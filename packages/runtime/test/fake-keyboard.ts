/** jsdom 之外的最小事件目标。 */
export class FakeTarget extends EventTarget {}

/**
 * 造一个键盘 Event。Node 的 EventTarget 只认 Event，所以
 * code / key / repeat / preventDefault 都手动挂上去，模拟 KeyboardEvent 的最小子集。
 */
function keyEvent(type: 'keydown' | 'keyup', code: string, repeat = false, key = code): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    code: { value: code, enumerable: true },
    key: { value: key, enumerable: true },
    repeat: { value: repeat, enumerable: true },
    preventDefault: { value: () => {}, enumerable: false },
  });
  return event;
}

export function dispatchKey(
  target: EventTarget,
  type: 'keydown' | 'keyup',
  code: string,
  repeat = false,
  key = code,
): void {
  target.dispatchEvent(keyEvent(type, code, repeat, key));
}
