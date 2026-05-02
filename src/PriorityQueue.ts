export interface Prioritized {
  id: string;
  priority: number;
}

export class PriorityQueue<T extends Prioritized> {
  private heap: T[] = [];
  private indexMap: Map<string, number> = new Map();
  private compare: (a: T, b: T) => number;

  constructor(compare?: (a: T, b: T) => number) {
    this.compare = compare ?? ((a, b) => a.priority - b.priority);
  }

  enqueue(task: T): void {
    this.heap.push(task);
    this.indexMap.set(task.id, this.heap.length - 1);
    this.siftUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;

    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    this.indexMap.delete(top.id);

    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.indexMap.set(bottom.id, 0);
      this.siftDown(0);
    }

    return top;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  size(): number {
    return this.heap.length;
  }

  remove(taskId: string): boolean {
    const index = this.indexMap.get(taskId);
    if (index === undefined) return false;

    this.indexMap.delete(taskId);

    if (index === this.heap.length - 1) {
      this.heap.pop();
      return true;
    }

    const bottom = this.heap.pop()!;
    this.heap[index] = bottom;
    this.indexMap.set(bottom.id, index);

    const parent = Math.floor((index - 1) / 2);
    if (index > 0 && this.compare(this.heap[index], this.heap[parent]) > 0) {
      this.siftUp(index);
    } else {
      this.siftDown(index);
    }

    return true;
  }

  getAll(): T[] {
    return [...this.heap];
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.indexMap.set(this.heap[i].id, i);
    this.indexMap.set(this.heap[j].id, j);
  }

  private siftUp(index: number): void {
    let current = index;
    let parent = Math.floor((current - 1) / 2);

    while (current > 0 && this.compare(this.heap[current], this.heap[parent]) > 0) {
      this.swap(current, parent);
      current = parent;
      parent = Math.floor((current - 1) / 2);
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const size = this.heap.length;

    while (true) {
      const left = 2 * current + 1;
      const right = 2 * current + 2;
      let largest = current;

      if (left < size && this.compare(this.heap[left], this.heap[largest]) > 0) {
        largest = left;
      }
      if (right < size && this.compare(this.heap[right], this.heap[largest]) > 0) {
        largest = right;
      }
      if (largest === current) break;

      this.swap(current, largest);
      current = largest;
    }
  }
}
