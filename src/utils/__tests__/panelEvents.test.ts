import {
  emitNodeClicked,
  onNodeClicked,
  emitNodeEditRequest,
  onNodeEditRequest,
  emitOrphanEdgeCleanup,
  onOrphanEdgeCleanup,
} from '../panelEvents';

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

describe('panelEvents edit-request pub/sub', () => {
  test('subscriber receives emitted edit-request', () => {
    const received: string[] = [];
    const unsub = onNodeEditRequest((id) => received.push(id));
    emitNodeEditRequest('n-edit-1');
    unsub();
    expect(received).toEqual(['n-edit-1']);
  });

  test('click and edit-request events are independent channels', () => {
    const clicks: string[] = [];
    const edits: string[] = [];
    const unsubClick = onNodeClicked((id) => clicks.push(id));
    const unsubEdit = onNodeEditRequest((id) => edits.push(id));
    emitNodeClicked('a');
    emitNodeEditRequest('b');
    unsubClick();
    unsubEdit();
    expect(clicks).toEqual(['a']);
    expect(edits).toEqual(['b']);
  });

  test('edit-request handler that throws does not break other subscribers', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const received: string[] = [];
    const unsubThrower = onNodeEditRequest(() => { throw new Error('boom'); });
    const unsubGood = onNodeEditRequest((id) => received.push(id));
    emitNodeEditRequest('survivor');
    unsubThrower();
    unsubGood();
    expect(received).toEqual(['survivor']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('unsubscribed edit-request handler stops receiving events', () => {
    const received: string[] = [];
    const unsub = onNodeEditRequest((id) => received.push(id));
    emitNodeEditRequest('first');
    unsub();
    emitNodeEditRequest('second');
    expect(received).toEqual(['first']);
  });
});

describe('panelEvents orphan-edge-cleanup pub/sub', () => {
  test('subscriber receives the deleted node id', () => {
    const received: string[] = [];
    const unsub = onOrphanEdgeCleanup((id) => received.push(id));
    emitOrphanEdgeCleanup('n-deleted');
    unsub();
    expect(received).toEqual(['n-deleted']);
  });

  test('all three event channels are independent', () => {
    const clicks: string[] = [];
    const edits: string[] = [];
    const cleanups: string[] = [];
    const unsubA = onNodeClicked((id) => clicks.push(id));
    const unsubB = onNodeEditRequest((id) => edits.push(id));
    const unsubC = onOrphanEdgeCleanup((id) => cleanups.push(id));
    emitNodeClicked('click');
    emitNodeEditRequest('edit');
    emitOrphanEdgeCleanup('cleanup');
    unsubA(); unsubB(); unsubC();
    expect(clicks).toEqual(['click']);
    expect(edits).toEqual(['edit']);
    expect(cleanups).toEqual(['cleanup']);
  });

  test('orphan-cleanup handler that throws does not break other subscribers', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const received: string[] = [];
    const unsubThrower = onOrphanEdgeCleanup(() => { throw new Error('boom'); });
    const unsubGood = onOrphanEdgeCleanup((id) => received.push(id));
    emitOrphanEdgeCleanup('survivor');
    unsubThrower();
    unsubGood();
    expect(received).toEqual(['survivor']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
