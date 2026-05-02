import { TaskQueue, TaskStatus, DestroyedError, ConcurrencyError } from '../src';

describe('TaskQueue', () => {
  const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

  describe('task.promise', () => {
    test('resolves with the return value when task completes', async () => {
      const queue = new TaskQueue({ concurrency: 1 });
      const task = queue.add(async () => 42);
      await expect(task.promise).resolves.toBe(42);
    });

    test('rejects with the thrown error when task fails', async () => {
      const queue = new TaskQueue({ concurrency: 1 });
      const boom = new Error('boom');
      const task = queue.add(async () => { throw boom; });
      await expect(task.promise).rejects.toBe(boom);
    });

    test('rejects when a pending task is canceled', async () => {
      const queue = new TaskQueue({ concurrency: 1 });
      queue.add(async () => delay(500));
      const task = queue.add(async () => 'never runs');
      queue.cancel(task.id);
      await expect(task.promise).rejects.toThrow();
    });

    test('rejects when a running task is canceled', async () => {
      const queue = new TaskQueue({ concurrency: 1 });
      let started: () => void;
      const startedPromise = new Promise<void>(r => { started = r; });
      const task = queue.add(async (signal) => {
        started();
        await new Promise<void>((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        );
      });
      await startedPromise;
      queue.cancel(task.id);
      await expect(task.promise).rejects.toThrow();
    });

    test('rejects when task times out', async () => {
      const queue = new TaskQueue({ concurrency: 1, defaultTimeout: 50 });
      const task = queue.add(async (signal) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => resolve(), 500);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('timeout'));
          });
        });
      });
      await expect(task.promise).rejects.toThrow();
    });
  });

  test('running task does not expose AbortController on the task object', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    let started: () => void;
    const startedPromise = new Promise<void>(r => { started = r; });

    const task = queue.add(async (signal) => {
      started();
      await new Promise<void>(r => signal.addEventListener('abort', () => r()));
    });

    await startedPromise;
    expect('controller' in task).toBe(false);
    queue.cancel(task.id);
  });

  test('getStatus reflects active state through pause and resume', () => {
    const queue = new TaskQueue({ concurrency: 1 });
    expect(queue.getStatus().active).toBe(true);
    queue.pause();
    expect(queue.getStatus().active).toBe(false);
    queue.resume();
    expect(queue.getStatus().active).toBe(true);
  });

  test('completed task is removed from getAllTasks after it finishes', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    queue.add(async () => 'done');
    await delay(50);
    expect(queue.getAllTasks().length).toBe(0);
  });

  test('failed task is removed from getAllTasks', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    queue.add(async () => { throw new Error('boom'); });
    await delay(50);
    expect(queue.getAllTasks().length).toBe(0);
  });

  test('canceled task is removed from getAllTasks', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    queue.add(async () => delay(500));
    const task = queue.add(async () => 'pending');
    queue.cancel(task.id);
    await delay(10);
    expect(queue.getAllTasks().some(t => t.id === task.id)).toBe(false);
  });

  test('timed-out task is removed from getAllTasks', async () => {
    const queue = new TaskQueue({ concurrency: 1, defaultTimeout: 30 });
    queue.add(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 200);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('timeout')); });
      });
    });
    await delay(80);
    expect(queue.getAllTasks().length).toBe(0);
  });

  test('add() throws after destroy()', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    await queue.destroy();
    expect(() => queue.add(async () => 'done')).toThrow(DestroyedError);
  });

  test('a throwing onTaskStart callback does not break the queue', async () => {
    const queue = new TaskQueue({
      concurrency: 1,
      onTaskStart: () => { throw new Error('callback error'); },
    });
    queue.add(async () => 'first');
    const second = queue.add(async () => 'second');
    await expect(second.promise).resolves.toBe('second');
  });

  test('a throwing onTaskComplete callback does not break the queue', async () => {
    const queue = new TaskQueue({
      concurrency: 1,
      onTaskComplete: () => { throw new Error('callback error'); },
    });
    queue.add(async () => 'first');
    const second = queue.add(async () => 'second');
    await expect(second.promise).resolves.toBe('second');
  });

  test('a throwing onTaskError callback does not break the queue', async () => {
    const queue = new TaskQueue({
      concurrency: 1,
      onTaskError: () => { throw new Error('callback error'); },
    });
    queue.add(async () => { throw new Error('task failed'); });
    const second = queue.add(async () => 'second');
    await expect(second.promise).resolves.toBe('second');
  });

  test('throws ConcurrencyError when concurrency is zero', () => {
    expect(() => new TaskQueue({ concurrency: 0 })).toThrow(ConcurrencyError);
  });

  test('throws ConcurrencyError when concurrency is negative', () => {
    expect(() => new TaskQueue({ concurrency: -1 })).toThrow(ConcurrencyError);
  });

  test('throws ConcurrencyError when concurrency is not an integer', () => {
    expect(() => new TaskQueue({ concurrency: 1.5 })).toThrow(ConcurrencyError);
  });

  test('task object does not expose the fn field', () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const task = queue.add(async () => 'done');
    expect('fn' in task).toBe(false);
  });

  test('should create a task queue with default options', () => {
    const queue = new TaskQueue({ concurrency: 2 });
    expect(queue).toBeInstanceOf(TaskQueue);

    const status = queue.getStatus();
    expect(status.active).toBe(true);
    expect(status.pendingCount).toBe(0);
    expect(status.runningCount).toBe(0);
  });

  test('should execute tasks concurrently with respect to concurrency limit', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const executionOrder: number[] = [];

    queue.add(async () => {
      await delay(100);
      executionOrder.push(1);
      return 'task1';
    });

    queue.add(async () => {
      await delay(50);
      executionOrder.push(2);
      return 'task2';
    });

    queue.add(async () => {
      await delay(10);
      executionOrder.push(3);
      return 'task3';
    });

    await delay(200);

    expect(executionOrder).toEqual([2, 3, 1]);

    const status = queue.getStatus();
    expect(status.completedCount).toBe(3);
    expect(status.pendingCount).toBe(0);
    expect(status.runningCount).toBe(0);
  });

  test('executes higher-priority queued tasks before lower-priority ones when a slot opens', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const executionOrder: number[] = [];

    queue.add(async () => {
      await delay(50);
      executionOrder.push(1);
      return 'low priority';
    }, { priority: 1 });

    queue.add(async () => {
      executionOrder.push(2);
      return 'medium priority';
    }, { priority: 2 });

    queue.add(async () => {
      executionOrder.push(3);
      return 'high priority';
    }, { priority: 3 });

    await delay(200);

    expect(executionOrder).toEqual([1, 3, 2]);
  });

  test('timeout:0 on a task overrides the queue defaultTimeout and runs without timeout', async () => {
    const onTaskTimeout = jest.fn();
    const queue = new TaskQueue({
      concurrency: 1,
      defaultTimeout: 50,
      onTaskTimeout,
    });

    const task = queue.add(async () => {
      await delay(100);
      return 'done';
    }, { timeout: 0 });

    await delay(200);

    expect(task.status).toBe(TaskStatus.COMPLETED);
    expect(onTaskTimeout).not.toHaveBeenCalled();
  });

  test('should handle task timeout', async () => {
    const onTaskTimeout = jest.fn();
    const queue = new TaskQueue({
      concurrency: 1,
      defaultTimeout: 50,
      onTaskTimeout
    });

    const task = queue.add(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 200);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('timeout')); });
      });
      return 'this should timeout';
    });

    await delay(100);

    expect(task.status).toBe(TaskStatus.TIMEOUT);
    expect(onTaskTimeout).toHaveBeenCalledTimes(1);

    const status = queue.getStatus();
    expect(status.timeoutCount).toBe(1);
  });

  test('passes an AbortSignal to the task fn that is aborted when the task is canceled', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    let receivedSignal: AbortSignal | undefined;
    let taskStarted: () => void;
    const started = new Promise<void>(r => { taskStarted = r; });

    const task = queue.add(async (signal) => {
      receivedSignal = signal;
      taskStarted();
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        };
        signal.addEventListener('abort', onAbort);
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, 1000);
      });
    });

    await started;
    queue.cancel(task.id);

    await delay(20);
    expect(receivedSignal?.aborted).toBe(true);
    expect(task.status).toBe(TaskStatus.CANCELED);
  });

  test('passes an AbortSignal to the task fn that is aborted when the task times out', async () => {
    const queue = new TaskQueue({ concurrency: 1, defaultTimeout: 50 });

    let receivedSignal: AbortSignal | undefined;

    queue.add(async (signal) => {
      receivedSignal = signal;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 200);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('timeout')); });
      });
    });

    await delay(100);
    expect(receivedSignal?.aborted).toBe(true);
  });

  test('should cancel a running task', async () => {
    const onTaskCancel = jest.fn();
    const queue = new TaskQueue({
      concurrency: 1,
      onTaskCancel
    });

    let taskStarted: (value: void) => void;
    const taskStartedPromise = new Promise<void>(resolve => {
      taskStarted = resolve;
    });

    const task = queue.add(async (signal) => {
      taskStarted();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 500);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('canceled'));
        });
      });
      return 'completed';
    });

    await taskStartedPromise;
    await delay(10);

    const result = queue.cancel(task.id);
    expect(result).toBe(true);

    await delay(50);
    expect(task.status).toBe(TaskStatus.CANCELED);
    expect(onTaskCancel).toHaveBeenCalledTimes(1);

    const status = queue.getStatus();
    expect(status.canceledCount).toBe(1);
  });

  test('should cancel multiple tasks in batch', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    const task1 = queue.add(async () => {
      await delay(100);
      return 'task1';
    });

    const task2 = queue.add(async () => {
      await delay(100);
      return 'task2';
    });

    const task3 = queue.add(async () => {
      await delay(100);
      return 'task3';
    });

    await delay(10);

    const results = queue.cancelBatch([task2.id, task3.id]);

    expect(results[task2.id]).toBe(true);
    expect(results[task3.id]).toBe(true);

    expect(task1.status).toBe(TaskStatus.RUNNING);
    expect(task2.status).toBe(TaskStatus.CANCELED);
    expect(task3.status).toBe(TaskStatus.CANCELED);

    await delay(100);

    const status = queue.getStatus();
    expect(status.completedCount).toBe(1);
    expect(status.canceledCount).toBe(2);
  });

  test('should cancel all tasks', async () => {
    const queue = new TaskQueue({ concurrency: 2 });

    const t1 = queue.add(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 100);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('canceled')); });
      });
      return 'task1';
    });
    const t2 = queue.add(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 100);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('canceled')); });
      });
      return 'task2';
    });
    const t3 = queue.add(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 100);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('canceled')); });
      });
      return 'task3';
    });
    const t4 = queue.add(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 100);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('canceled')); });
      });
      return 'task4';
    });

    await delay(10);
    queue.cancelAll();
    await delay(50);

    expect([t1, t2, t3, t4].every(t => t.status === TaskStatus.CANCELED)).toBe(true);

    const status = queue.getStatus();
    expect(status.canceledCount).toBe(4);
  });

  test('should pause and resume queue processing', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const executionOrder: number[] = [];

    queue.add(async () => {
      await delay(20);
      executionOrder.push(1);
      return 'task1';
    });

    queue.add(async () => {
      await delay(20);
      executionOrder.push(2);
      return 'task2';
    });

    queue.add(async () => {
      await delay(20);
      executionOrder.push(3);
      return 'task3';
    });

    await delay(10);

    queue.pause();

    await delay(50);

    expect(executionOrder.length).toBe(1);
    expect(executionOrder[0]).toBe(1);

    queue.resume();

    await delay(50);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  test('should clear the queue', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    queue.add(async () => delay(100).then(() => 'task1'));
    queue.add(async () => delay(100).then(() => 'task2'));
    queue.add(async () => delay(100).then(() => 'task3'));

    await delay(10);

    await queue.clear();

    const status = queue.getStatus();
    expect(status.pendingCount).toBe(0);
    expect(status.runningCount).toBe(0);
    expect(status.completedCount).toBe(0);
    expect(status.canceledCount).toBe(0);

    expect(queue.getAllTasks().length).toBe(0);
  });

  test('clear() resets destroyed state', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    await queue.destroy();
    expect(() => queue.add(async () => 'done')).toThrow(DestroyedError);

    await queue.clear();
    expect(() => queue.add(async () => 'done')).not.toThrow();
  });

  test('getTask returns a snapshot, not a reference', async () => {
    const queue = new TaskQueue({ concurrency: 1, autoStart: false });
    const task = queue.add(async () => 'done');
    const snapshot = queue.getTask(task.id);
    expect(snapshot).toBeDefined();
    (snapshot as any).status = 'tampered';
    const refetch = queue.getTask(task.id);
    expect(refetch!.status).toBe(TaskStatus.PENDING);
  });

  test('getAllTasks returns snapshots', async () => {
    const queue = new TaskQueue({ concurrency: 1, autoStart: false });
    queue.add(async () => 'done');
    const tasks = queue.getAllTasks();
    expect(tasks.length).toBe(1);
    (tasks[0] as any).status = 'tampered';
    const refetch = queue.getAllTasks();
    expect(refetch[0].status).toBe(TaskStatus.PENDING);
  });

  describe('error types', () => {
    test('DestroyedError has correct name and message', () => {
      const err = new DestroyedError();
      expect(err.name).toBe('DestroyedError');
      expect(err.message).toBe('TaskQueue has been destroyed');
      expect(err).toBeInstanceOf(Error);
    });

    test('ConcurrencyError has correct name and message', () => {
      const err = new ConcurrencyError(0);
      expect(err.name).toBe('ConcurrencyError');
      expect(err.message).toBe('concurrency must be a positive integer, got 0');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('protected extension points', () => {
    test('can extend TaskQueue and override executeTask', async () => {
      class CustomQueue extends TaskQueue {
        protected async executeTask(task: any): Promise<void> {
          await super.executeTask(task);
        }
      }

      const queue = new CustomQueue({ concurrency: 1 });
      const task = queue.add(async () => 'custom');
      await expect(task.promise).resolves.toBe('custom');
    });

    test('can extend TaskQueue and access finishTask', async () => {
      class CustomQueue extends TaskQueue {
        customFinish(task: any) {
          this.finishTask(task, 'completed' as any);
        }
      }

      const queue = new CustomQueue({ concurrency: 1, autoStart: false });
      const task = queue.add(async () => 'done');
      expect(() => queue.customFinish(task)).not.toThrow();
    });
  });

  describe('custom compare', () => {
    test('uses custom compare function for priority', async () => {
      const queue = new TaskQueue({
        concurrency: 1,
        compare: (a, b) => b.priority - a.priority, // 数字越小优先级越高（反转）
      });
      const executionOrder: number[] = [];

      queue.add(async () => {
        await delay(50);
        executionOrder.push(1);
        return 'high priority';
      }, { priority: 10 });

      queue.add(async () => {
        executionOrder.push(2);
        return 'low priority';
      }, { priority: 1 });

      await delay(200);

      // 由于 compare 反转，priority=1 的先执行
      expect(executionOrder).toEqual([1, 2]);
    });
  });
});
