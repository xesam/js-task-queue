# js-task-queue

一个轻量级的任务队列库，支持并发控制、任务超时、取消任务和任务优先级。

## 特性

- 支持设定可同时执行的任务数量上限
- 支持配置任务超时时间
- 支持取消单个、批量或全部任务
- 支持任务优先级调度
- 支持自定义优先级比较器
- 支持暂停/恢复队列
- 支持 AbortSignal 优雅取消
- 零运行时依赖

## 安装

```bash
npm install js-task-queue
```

或者使用 pnpm:

```bash
pnpm add js-task-queue
```

## 基本用法

```typescript
import { TaskQueue, TaskStatus } from 'js-task-queue';

const queue = new TaskQueue({
  concurrency: 2,
  defaultTimeout: 5000,
  onTaskComplete: (task) => {
    console.log(`任务 ${task.id} 完成，结果:`, task.result);
  }
});

const task = queue.add(async () => {
  return '任务结果';
});

await task.promise;
```

## API 文档

### `new TaskQueue(options)`

创建一个新的任务队列实例。

#### 选项

| 选项 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `concurrency` | `number` | 是 | 最大并发任务数（必须为正整数） |
| `defaultTimeout` | `number` | 否 | 默认任务超时时间（毫秒） |
| `autoStart` | `boolean` | 否 | 是否自动开始执行队列（默认：`true`） |
| `compare` | `(a: Task, b: Task) => number` | 否 | 自定义优先级比较函数 |
| `onTaskStart` | `(task: Task) => void` | 否 | 任务开始回调 |
| `onTaskComplete` | `(task: Task) => void` | 否 | 任务完成回调 |
| `onTaskError` | `(task: Task) => void` | 否 | 任务错误回调（错误信息从 `task.error` 获取） |
| `onTaskCancel` | `(task: Task) => void` | 否 | 任务取消回调 |
| `onTaskTimeout` | `(task: Task) => void` | 否 | 任务超时回调 |

### `queue.add(fn, options?)`

添加任务到队列。

- `fn`: `(signal: AbortSignal) => Promise<T>` — 任务执行函数
- `options`:
  - `priority`: `number` — 任务优先级（默认 `0`，具体排序取决于 `compare` 函数）
  - `timeout`: `number` — 任务超时时间（毫秒），`0` 表示不超时
- 返回: `Task<T>` 对象，包含 `id`、`status`、`promise` 等字段

### `queue.cancel(taskId)`

取消单个任务。

- `taskId`: `string` — 任务 ID
- 返回: `boolean` — 是否成功取消

### `queue.cancelBatch(taskIds)`

批量取消任务。

- `taskIds`: `string[]` — 任务 ID 数组
- 返回: `{ [taskId: string]: boolean }` — 每个任务的取消结果

### `queue.cancelAll()`

取消所有待执行和正在执行的任务。

### `queue.pause()`

暂停队列执行。已运行的任务不受影响，新任务不再被调度。

### `queue.resume()`

恢复队列执行。

### `queue.getStatus()`

获取队列状态。

- 返回: `TaskQueueStatus`
  - `active`: `boolean` — 队列是否活跃
  - `pendingCount`: `number` — 待执行任务数
  - `runningCount`: `number` — 正在执行任务数
  - `completedCount`: `number` — 已完成任务数
  - `failedCount`: `number` — 失败任务数
  - `canceledCount`: `number` — 已取消任务数
  - `timeoutCount`: `number` — 超时任务数

### `queue.getTask(taskId)`

获取单个任务信息（返回快照，非引用）。

- `taskId`: `string`
- 返回: `Task | undefined`

### `queue.getAllTasks()`

获取所有任务信息（返回快照数组）。

- 返回: `Task[]`

### `queue.clear()`

清空队列并重置为初始状态。这是一个异步操作，会等待所有运行中任务结束后再重置。

- 返回: `Promise<void>`

### `queue.destroy()`

销毁队列。销毁后无法添加新任务，需调用 `clear()` 恢复。这是一个异步操作，会等待所有运行中任务结束。

- 返回: `Promise<void>`

## 任务状态

| 状态 | 说明 |
|------|------|
| `PENDING` | 等待执行 |
| `RUNNING` | 正在执行 |
| `COMPLETED` | 执行完成 |
| `FAILED` | 执行失败 |
| `CANCELED` | 已取消 |
| `TIMEOUT` | 执行超时 |

## 错误类型

```typescript
import { DestroyedError, ConcurrencyError } from 'js-task-queue';

// 并发数非法
try {
  new TaskQueue({ concurrency: 0 });
} catch (e) {
  if (e instanceof ConcurrencyError) {
    console.log(e.message); // concurrency must be a positive integer, got 0
  }
}

// 队列已销毁
const queue = new TaskQueue({ concurrency: 1 });
await queue.destroy();
try {
  queue.add(async () => 'done');
} catch (e) {
  if (e instanceof DestroyedError) {
    console.log(e.message); // TaskQueue has been destroyed
  }
}
```

## 示例

### 并发控制

```typescript
const queue = new TaskQueue({ concurrency: 2 });

for (let i = 0; i < 10; i++) {
  queue.add(async () => {
    await fetch(`https://api.example.com/item/${i}`);
  });
}
```

### 任务优先级

```typescript
queue.add(async () => lowPriorityOperation(), { priority: 1 });
queue.add(async () => highPriorityOperation(), { priority: 10 });
```

### 自定义优先级比较器

```typescript
// 数字越小优先级越高，相同优先级时先创建的先执行
const queue = new TaskQueue({
  concurrency: 2,
  compare: (a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.createdAt - b.createdAt;
  }
});
```

### 任务超时

```typescript
queue.add(async () => longRunningOperation(), { timeout: 5000 });
```

### 使用 AbortSignal 响应取消

```typescript
const task = queue.add(async (signal) => {
  return fetch('/api/data', { signal });
});

// 稍后取消
queue.cancel(task.id);
```

### 暂停与恢复

```typescript
queue.pause();
// ... 添加更多任务
queue.resume();
```
