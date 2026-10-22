/** jsdom 之外的最小事件目标。 */
export class FakeTarget extends EventTarget {}

/**
 * 构造一个真正的 Event（Node 的 EventTarget 只收 Event），
 * 把 code / repeat / preventDefault 挂上去，模拟 KeyboardEvent 的最小表面。
 */
function keyEvent(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    code: { value: code, enumerable: true },
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
): void {
  target.dispatchEvent(keyEvent(type, code, repeat));
}
