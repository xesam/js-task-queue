import { PriorityQueue, Prioritized } from '../src/PriorityQueue';

function makeTask(id: string, priority: number): Prioritized {
  return { id, priority };
}

describe('PriorityQueue', () => {
  test('dequeue returns undefined on empty queue', () => {
    const q = new PriorityQueue<Prioritized>();
    expect(q.dequeue()).toBeUndefined();
    expect(q.isEmpty()).toBe(true);
    expect(q.size()).toBe(0);
  });

  test('dequeues single item correctly', () => {
    const q = new PriorityQueue<Prioritized>();
    const t = makeTask('a', 1);
    q.enqueue(t);
    expect(q.dequeue()).toBe(t);
    expect(q.isEmpty()).toBe(true);
  });

  test('always dequeues the highest-priority item', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('low', 1));
    q.enqueue(makeTask('high', 10));
    q.enqueue(makeTask('mid', 5));

    expect(q.dequeue()!.id).toBe('high');
    expect(q.dequeue()!.id).toBe('mid');
    expect(q.dequeue()!.id).toBe('low');
  });

  test('heap property holds after many enqueues', () => {
    const q = new PriorityQueue<Prioritized>();
    const priorities = [3, 1, 4, 1, 5, 9, 2, 6];
    priorities.forEach((p, i) => q.enqueue(makeTask(String(i), p)));

    const dequeued: number[] = [];
    while (!q.isEmpty()) dequeued.push(q.dequeue()!.priority);

    // must be non-increasing
    for (let i = 1; i < dequeued.length; i++) {
      expect(dequeued[i]).toBeLessThanOrEqual(dequeued[i - 1]);
    }
  });

  test('remove returns false for unknown id', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('a', 1));
    expect(q.remove('nope')).toBe(false);
    expect(q.size()).toBe(1);
  });

  test('remove the only element leaves queue empty', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('a', 5));
    expect(q.remove('a')).toBe(true);
    expect(q.isEmpty()).toBe(true);
  });

  test('remove last element in heap array directly', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('a', 10));
    q.enqueue(makeTask('b', 5));
    // 'b' is the last element in the heap array
    expect(q.remove('b')).toBe(true);
    expect(q.size()).toBe(1);
    expect(q.dequeue()!.id).toBe('a');
  });

  test('heap property holds after removing root', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('a', 10));
    q.enqueue(makeTask('b', 7));
    q.enqueue(makeTask('c', 3));
    q.enqueue(makeTask('d', 8));

    q.remove('a'); // remove root — triggers siftDown

    const dequeued: number[] = [];
    while (!q.isEmpty()) dequeued.push(q.dequeue()!.priority);

    for (let i = 1; i < dequeued.length; i++) {
      expect(dequeued[i]).toBeLessThanOrEqual(dequeued[i - 1]);
    }
  });

  test('heap property holds after removing a middle node', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('a', 10));
    q.enqueue(makeTask('b', 7));
    q.enqueue(makeTask('c', 3));
    q.enqueue(makeTask('d', 8));
    q.enqueue(makeTask('e', 1));

    q.remove('b'); // middle node — replacement may need siftUp or siftDown

    const dequeued: number[] = [];
    while (!q.isEmpty()) dequeued.push(q.dequeue()!.priority);

    for (let i = 1; i < dequeued.length; i++) {
      expect(dequeued[i]).toBeLessThanOrEqual(dequeued[i - 1]);
    }
  });

  test('getAll returns a snapshot without mutating the queue', () => {
    const q = new PriorityQueue<Prioritized>();
    q.enqueue(makeTask('a', 5));
    q.enqueue(makeTask('b', 3));

    const snapshot = q.getAll();
    snapshot.push(makeTask('injected', 99));

    expect(q.size()).toBe(2);
  });
});
