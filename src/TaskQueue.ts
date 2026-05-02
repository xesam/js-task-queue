import { TaskStatus } from './types';
import type { Task, TaskQueueOptions, TaskOptions, TaskQueueStatus } from './types';
import { PriorityQueue } from './PriorityQueue';
import { DestroyedError, ConcurrencyError } from './types';

type TaskFn<T> = (signal: AbortSignal) => Promise<T>;

export class TaskQueue {
  private options: TaskQueueOptions;
  private queue: PriorityQueue<Task>;
  private tasks: Map<string, Task>;
  private fns: Map<string, TaskFn<any>>;
  private controllers: Map<string, AbortController>;
  private resolvers: Map<string, { resolve: (v: any) => void; reject: (e: unknown) => void }>;
  private running: boolean;
  private destroyed: boolean;
  private runningCount: number;
  private stats: { completed: number; failed: number; canceled: number; timeout: number };

  constructor(options: TaskQueueOptions) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new ConcurrencyError(options.concurrency);
    }
    this.options = { autoStart: true, ...options };
    this.running = this.options.autoStart !== false;
    this.destroyed = false;
    this.runningCount = 0;
    this.stats = { completed: 0, failed: 0, canceled: 0, timeout: 0 };
    this.queue = new PriorityQueue<Task>(this.options.compare);
    this.tasks = new Map();
    this.fns = new Map();
    this.controllers = new Map();
    this.resolvers = new Map();
  }

  add<T>(fn: TaskFn<T>, options: TaskOptions = {}): Task<T> {
    if (this.destroyed) throw new DestroyedError();
    const id = crypto.randomUUID();
    const priority = options.priority ?? 0;
    const timeout = options.timeout ?? this.options.defaultTimeout;

    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {});

    const task: Task<T> = {
      id, priority, timeout,
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
      promise,
    };

    this.tasks.set(id, task);
    this.fns.set(id, fn);
    this.resolvers.set(id, { resolve, reject });
    this.queue.enqueue(task);
    this.processQueue();

    return task;
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELED, TaskStatus.TIMEOUT].includes(task.status)) {
      return false;
    }

    if (task.status === TaskStatus.PENDING) {
      this.queue.remove(taskId);
      this.finishTask(task, TaskStatus.CANCELED, undefined, new DOMException('Task canceled', 'AbortError'));
      return true;
    }

    if (task.status === TaskStatus.RUNNING && this.controllers.has(taskId)) {
      this.controllers.get(taskId)!.abort();
      this.finishTask(task, TaskStatus.CANCELED, undefined, new DOMException('Task canceled', 'AbortError'));
      return true;
    }

    return false;
  }

  cancelBatch(taskIds: string[]): { [taskId: string]: boolean } {
    return Object.fromEntries(taskIds.map(id => [id, this.cancel(id)]));
  }

  cancelAll(): void {
    const ids = Array.from(this.tasks.values())
      .filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
      .map(t => t.id);
    for (const id of ids) this.cancel(id);
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    if (!this.running) {
      this.running = true;
      this.processQueue();
    }
  }

  getStatus(): TaskQueueStatus {
    return {
      active: this.running,
      pendingCount: this.queue.size(),
      runningCount: this.runningCount,
      completedCount: this.stats.completed,
      failedCount: this.stats.failed,
      canceledCount: this.stats.canceled,
      timeoutCount: this.stats.timeout,
    };
  }

  getTask(taskId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : undefined;
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values()).map(t => ({ ...t }));
  }

  async clear(): Promise<void> {
    this.cancelAll();
    await this.drain();
    this.resetMaps();
    this.stats = { completed: 0, failed: 0, canceled: 0, timeout: 0 };
    this.destroyed = false;
    this.running = this.options.autoStart !== false;
  }

  async destroy(): Promise<void> {
    this.cancelAll();
    await this.drain();
    this.running = false;
    this.destroyed = true;
    this.resetMaps();
    this.stats = { completed: 0, failed: 0, canceled: 0, timeout: 0 };
  }

  private drain(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === TaskStatus.RUNNING) {
        promises.push(task.promise.catch(() => {}));
      }
    }
    return Promise.all(promises).then(() => {});
  }

  private resetMaps(): void {
    this.queue = new PriorityQueue<Task>(this.options.compare);
    this.tasks = new Map();
    this.fns = new Map();
    this.controllers = new Map();
    this.resolvers = new Map();
  }

  protected fireCallback<T extends unknown[]>(fn: ((...args: T) => void) | undefined, ...args: T): void {
    try { fn?.(...args); } catch {}
  }

  protected processQueue(): void {
    while (this.running && this.runningCount < this.options.concurrency) {
      const task = this.queue.dequeue();
      if (!task) break;
      this.executeTask(task);
    }
  }

  protected finishTask<T>(
    task: Task<T>,
    status: TaskStatus.COMPLETED | TaskStatus.FAILED | TaskStatus.CANCELED | TaskStatus.TIMEOUT,
    result?: T,
    error?: Error
  ): void {
    if (task.status !== TaskStatus.RUNNING && task.status !== TaskStatus.PENDING) {
      return;
    }

    const wasRunning = task.status === TaskStatus.RUNNING;
    task.status = status;
    task.completedAt = Date.now();

    if (status === TaskStatus.COMPLETED) {
      task.result = result;
      this.stats.completed++;
    } else if (status === TaskStatus.FAILED) {
      task.error = error;
      this.stats.failed++;
    } else if (status === TaskStatus.CANCELED) {
      this.stats.canceled++;
    } else if (status === TaskStatus.TIMEOUT) {
      task.error = error;
      this.stats.timeout++;
    }

    if (wasRunning) {
      this.runningCount--;
    }

    this.fns.delete(task.id);
    this.tasks.delete(task.id);
    const r = this.resolvers.get(task.id);
    this.resolvers.delete(task.id);

    if (status === TaskStatus.COMPLETED) {
      r?.resolve(result!);
      this.fireCallback(this.options.onTaskComplete, task);
    } else {
      r?.reject(error!);
      if (status === TaskStatus.FAILED) {
        this.fireCallback(this.options.onTaskError, task);
      } else if (status === TaskStatus.CANCELED) {
        this.fireCallback(this.options.onTaskCancel, task);
      } else if (status === TaskStatus.TIMEOUT) {
        this.fireCallback(this.options.onTaskTimeout, task);
      }
    }

    this.processQueue();
  }

  protected async executeTask<T>(task: Task<T>): Promise<void> {
    const fn = this.fns.get(task.id) as TaskFn<T> | undefined;
    if (!fn) return;

    task.status = TaskStatus.RUNNING;
    task.startedAt = Date.now();
    const controller = new AbortController();
    this.controllers.set(task.id, controller);
    this.runningCount++;

    this.fireCallback(this.options.onTaskStart, task);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (task.timeout) {
      timeoutId = setTimeout(() => {
        if (!this.tasks.has(task.id) || task.status !== TaskStatus.RUNNING) return;
        const err = new Error(`Task ${task.id} timed out after ${task.timeout}ms`);
        this.controllers.get(task.id)?.abort();
        this.finishTask(task, TaskStatus.TIMEOUT, undefined, err);
      }, task.timeout);
    }

    try {
      const result = await fn(controller.signal);

      if (task.status !== TaskStatus.RUNNING) return;

      clearTimeout(timeoutId);
      this.finishTask(task, TaskStatus.COMPLETED, result);
    } catch (error) {
      if (task.status !== TaskStatus.RUNNING) return;

      clearTimeout(timeoutId);
      const err = error instanceof Error ? error : new Error(String(error));
      this.finishTask(task, TaskStatus.FAILED, undefined, err);
    } finally {
      this.controllers.delete(task.id);
    }
  }
}

export default TaskQueue;
