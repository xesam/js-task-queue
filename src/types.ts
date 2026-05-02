export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
  TIMEOUT = 'timeout',
}

export interface Task<T = any> {
  id: string;
  priority: number;
  timeout?: number;
  status: TaskStatus;
  result?: T;
  error?: Error;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  readonly promise: Promise<T>;
}

export interface TaskQueueOptions {
  concurrency: number;
  defaultTimeout?: number;
  autoStart?: boolean;
  compare?: (a: Task, b: Task) => number;
  onTaskStart?: (task: Task) => void;
  onTaskComplete?: (task: Task) => void;
  onTaskError?: (task: Task) => void;
  onTaskCancel?: (task: Task) => void;
  onTaskTimeout?: (task: Task) => void;
}

export interface TaskOptions {
  priority?: number;
  timeout?: number;
}

export interface TaskQueueStatus {
  active: boolean;
  pendingCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  canceledCount: number;
  timeoutCount: number;
}

export class TaskQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskQueueError';
  }
}

export class DestroyedError extends TaskQueueError {
  constructor() {
    super('TaskQueue has been destroyed');
    this.name = 'DestroyedError';
  }
}

export class ConcurrencyError extends TaskQueueError {
  constructor(concurrency: number) {
    super(`concurrency must be a positive integer, got ${concurrency}`);
    this.name = 'ConcurrencyError';
  }
}
