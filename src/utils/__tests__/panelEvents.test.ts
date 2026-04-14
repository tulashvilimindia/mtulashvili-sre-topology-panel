import { emitNodeClicked, onNodeClicked } from '../panelEvents';

describe('panelEvents pub/sub', () => {
  test('subscriber receives emitted node id', () => {
    const received: string[] = [];
    const unsub = onNodeClicked((id) => received.push(id));
    emitNodeClicked('n-1');
    emitNodeClicked('n-2');
    unsub();
    expect(received).toEqual(['n-1', 'n-2']);
  });

  test('multiple subscribers all receive events', () => {
    const a: string[] = [];
    const b: string[] = [];
    const unsubA = onNodeClicked((id) => a.push(id));
    const unsubB = onNodeClicked((id) => b.push(id));
    emitNodeClicked('shared');
    unsubA();
    unsubB();
    expect(a).toEqual(['shared']);
    expect(b).toEqual(['shared']);
  });

  test('unsubscribed handler stops receiving events', () => {
    const received: string[] = [];
    const unsub = onNodeClicked((id) => received.push(id));
    emitNodeClicked('first');
    unsub();
    emitNodeClicked('second');
    expect(received).toEqual(['first']);
  });

  test('handler that throws does not break other subscribers', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const received: string[] = [];
    const unsubThrower = onNodeClicked(() => { throw new Error('boom'); });
    const unsubGood = onNodeClicked((id) => received.push(id));
    emitNodeClicked('survivor');
    unsubThrower();
    unsubGood();
    expect(received).toEqual(['survivor']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('zero subscribers is a no-op', () => {
    expect(() => emitNodeClicked('no one listening')).not.toThrow();
  });
});
