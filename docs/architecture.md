# 架构文档

## 1. 概述

`js-task-queue` 是一个轻量级、零依赖的异步任务队列库，核心设计目标是在保持简洁的同时提供企业级的并发控制能力。

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| **零依赖** | 不依赖任何运行时库，减少供应链攻击面 |
| **单一职责** | 每个类/模块只负责一个明确的职责 |
| **状态不可变** | 外部获取的任务信息为快照，防止外部篡改内部状态 |
| **标准优先** | 使用 Web 标准 API（`AbortController`、`crypto.randomUUID`） |
| **防御性编程** | 回调异常隔离、参数校验、竞态条件防护 |

### 1.2 技术栈

- **TypeScript 5.9** — 类型安全
- **Jest 30** — 单元测试
- **tsup 8.5** — 构建工具（输出 CJS/ESM/小程序/类型定义）
- **ESLint 10** — 代码规范

---

## 2. 模块结构

```
src/
├── types.ts          # 公共类型定义
├── PriorityQueue.ts  # 优先级队列（纯数据结构）
├── TaskQueue.ts      # 任务队列调度器（核心业务逻辑）
└── index.ts          # 入口文件，统一导出
```

### 2.1 模块依赖关系

```
index.ts
  ├── types.ts          (纯类型，无依赖)
  ├── PriorityQueue.ts  (依赖 types.ts 中的 Prioritized)
  └── TaskQueue.ts      (依赖 types.ts + PriorityQueue.ts)
```

---

## 3. 核心组件详解

### 3.1 PriorityQueue<T extends Prioritized>

**职责**：基于最大堆（Max Heap）实现的优先级队列，支持 O(log n) 的入队、出队和删除操作。

**关键设计**：
- 使用数组 `heap[]` 存储堆元素
- 使用 `Map<string, number>`（`indexMap`）维护 id 到数组索引的映射，使 `remove(id)` 从 O(n) 优化到 O(log n)
- `siftUp` / `siftDown` 维护堆性质

**时间复杂度**：

| 操作 | 时间复杂度 | 说明 |
|------|-----------|------|
| `enqueue` | O(log n) | 插入到末尾后上浮 |
| `dequeue` | O(log n) | 替换根节点后下沉 |
| `remove` | O(log n) | 通过 indexMap O(1) 定位，再下沉/上浮 |
| `size` | O(1) | 直接返回数组长度 |

### 3.2 TaskQueue

**职责**：任务生命周期管理，包括调度、执行、取消、超时和状态跟踪。

**内部状态管理**：

```typescript
private queue: PriorityQueue<Task>;           // 待执行任务的优先级队列
private tasks: Map<string, Task>;             // 所有任务（PENDING/RUNNING/COMPLETED 等）
private fns: Map<string, TaskFn<any>>;        // 任务执行函数
private controllers: Map<string, AbortController>;  // 运行中任务的 AbortController
private resolvers: Map<string, { resolve, reject }>; // Promise 的 resolve/reject
private runningCount: number;                 // 当前运行中任务数
private stats: { completed, failed, canceled, timeout }; // 统计信息
```

**为什么使用多个 Map 而不是一个综合对象？**

| 方案 | 优点 | 缺点 |
|------|------|------|
| **当前方案（多个 Map）** | 职责分离清晰，查找效率高 | 需要维护多个数据结构的一致性 |
| 替代方案（单个 Map<Task>） | 数据内聚 | Task 接口会变得臃肿，包含内部实现细节 |

当前方案在 `finishTask()` 中统一清理所有 Map，确保一致性。

### 3.3 任务状态机

```
                    +---------+
                    |  PENDING |
                    +----+----+
                         | add() 入队
                         v
                    +---------+
         +--------->| RUNNING |<---------+
         |          +----+----+          |
         |               |               |
   cancel()         正常完成         timeout
         |               |               |
         v               v               v
    +---------+    +---------+    +---------+
    | CANCELED |    |COMPLETED|    | TIMEOUT |
    +---------+    +---------+    +---------+
                         |
                    抛出异常
                         v
                    +---------+
                    |  FAILED  |
                    +---------+
```

**状态转换规则**：
- `PENDING` → `RUNNING`：队列调度，开始执行
- `RUNNING` → `COMPLETED`：任务函数正常返回
- `RUNNING` → `FAILED`：任务函数抛出异常
- `RUNNING` → `CANCELED`：调用 `cancel()` 或 `cancelAll()`
- `RUNNING` → `TIMEOUT`：任务执行超过 `timeout` 时间
- `PENDING` → `CANCELED`：取消待执行的任务

**终态**（不可再转换）：`COMPLETED`、`FAILED`、`CANCELED`、`TIMEOUT`

---

## 4. 核心流程

### 4.1 任务添加流程

```
用户调用 add(fn, options)
    │
    ├── 生成唯一 ID（crypto.randomUUID）
    ├── 创建 Task 对象（status = PENDING）
    ├── 创建 Promise 并保存 resolve/reject
    ├── 存入 tasks / fns / resolvers Map
    ├── 入队 PriorityQueue
    └── 触发 processQueue() 调度
```

### 4.2 任务调度流程

```
processQueue()
    │
    ├── while (running && runningCount < concurrency)
    │   ├── dequeue() 获取最高优先级任务
    │   └── executeTask(task) 开始执行
    └── 无任务或达到并发上限时停止
```

### 4.3 任务执行流程

```
executeTask(task)
    │
    ├── 状态设为 RUNNING，记录 startedAt
    ├── 创建 AbortController
    ├── runningCount++
    ├── 触发 onTaskStart 回调
    ├── 设置 setTimeout（如配置了 timeout）
    │
    ├── await fn(controller.signal)
    │   ├── 成功 → finishTask(COMPLETED, result)
    │   └── 失败 → finishTask(FAILED, error)
    │
    └── finally: 清理 controller
```

### 4.4 任务取消流程

```
cancel(taskId)
    │
    ├── 查找任务
    ├── PENDING 任务:
    │   ├── 从 PriorityQueue 移除
    │   └── finishTask(CANCELED)
    └── RUNNING 任务:
        ├── 调用 controller.abort()
        └── finishTask(CANCELED)
```

### 4.5 统一状态转换（finishTask）

```
finishTask(task, status, result?, error?)
    │
    ├── 幂等检查: 如果状态已是终态，直接返回
    ├── 记录 wasRunning（用于 runningCount 递减）
    ├── 更新 task.status / task.completedAt
    ├── 更新 stats（completed/failed/canceled/timeout）
    ├── 如果 wasRunning，runningCount--
    ├── 清理 fns / tasks / resolvers
    ├── resolve/reject task.promise
    ├── 触发对应回调（onTaskComplete/onTaskError/onTaskCancel/onTaskTimeout）
    └── 触发 processQueue() 调度新任务
```

---

## 5. 并发控制模型

### 5.1 并发限制机制

```typescript
while (this.running && this.runningCount < this.options.concurrency) {
  const task = this.queue.dequeue();
  if (!task) break;
  this.executeTask(task);
}
```

- `runningCount` 跟踪当前运行中的任务数
- 每次任务进入 `RUNNING` 状态时 `runningCount++`
- 每次任务到达终态时 `runningCount--`
- `finishTask()` 最后调用 `processQueue()` 触发新任务调度

### 5.2 竞态条件防护

**修复前的问题**：`runningCount` 在多个代码路径中修改（cancel、timeout、complete、error），存在竞态条件。

**修复后的方案**：
- 所有状态转换必须通过 `finishTask()`
- `finishTask()` 内部使用 `wasRunning` 标记确保 `runningCount` 只递减一次
- `finishTask()` 的幂等检查防止重复处理

---

## 6. 超时机制

```typescript
if (task.timeout) {
  timeoutId = setTimeout(() => {
    if (!this.tasks.has(task.id) || task.status !== TaskStatus.RUNNING) return;
    const err = new Error(`Task ${task.id} timed out after ${task.timeout}ms`);
    this.controllers.get(task.id)?.abort();
    this.finishTask(task, TaskStatus.TIMEOUT, undefined, err);
  }, task.timeout);
}
```

- 超时后调用 `abort()` 通知任务，然后直接调用 `finishTask(TIMEOUT)`
- 任务函数的 catch 块会检查 `task.status !== RUNNING`，如果已被标记为 TIMEOUT 则直接返回

---

## 7. 快照与不可变性

```typescript
getTask(taskId: string): Task | undefined {
  const task = this.tasks.get(taskId);
  return task ? { ...task } : undefined;
}
```

- 返回 `{ ...task }` 浅拷贝，防止外部修改内部状态
- 由于 `Task` 接口无嵌套对象，浅拷贝足够安全

---

## 8. 错误处理策略

### 8.1 回调异常隔离

```typescript
private fireCallback<T extends unknown[]>(fn: ((...args: T) => void) | undefined, ...args: T): void {
  try { fn?.(...args); } catch {}
}
```

- 所有回调（`onTaskStart`、`onTaskComplete` 等）都通过 `fireCallback` 调用
- 回调异常被静默捕获，不会破坏队列的正常运行

### 8.2 任务函数异常

- 任务函数抛出的异常被 `executeTask` 的 `catch` 块捕获
- 异常被包装为 `Error` 对象，通过 `finishTask(FAILED)` 处理
- `task.promise` 会被 reject

### 8.3 参数校验

```typescript
constructor(options: TaskQueueOptions) {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${options.concurrency}`);
  }
}
```

---

## 9. 构建输出

```
dist/
├── cjs/           # CommonJS 格式
├── esm/           # ES Module 格式
├── miniprogram/   # 微信小程序格式
└── types/         # TypeScript 类型定义
```

---

## 10. 类图

```
┌─────────────────────────────────────┐
│           <<enum>>                  │
│           TaskStatus                │
├─────────────────────────────────────┤
│ PENDING                             │
│ RUNNING                             │
│ COMPLETED                           │
│ FAILED                              │
│ CANCELED                            │
│ TIMEOUT                             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           <<interface>>             │
│           Prioritized               │
├─────────────────────────────────────┤
│ + id: string                        │
│ + priority: number                  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         PriorityQueue<T>            │
├─────────────────────────────────────┤
│ - heap: T[]                         │
│ - indexMap: Map<string, number>     │
├─────────────────────────────────────┤
│ + enqueue(task: T): void            │
│ + dequeue(): T \| undefined         │
│ + remove(taskId: string): boolean   │
│ + size(): number                    │
│ + isEmpty(): boolean                │
│ + getAll(): T[]                     │
│ - siftUp(index: number): void       │
│ - siftDown(index: number): void     │
│ - swap(i: number, j: number): void  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           <<interface>>             │
│              Task<T>                │
├─────────────────────────────────────┤
│ + id: string                        │
│ + priority: number                  │
│ + timeout?: number                  │
│ + status: TaskStatus                │
│ + result?: T                        │
│ + error?: Error                     │
│ + createdAt: number                 │
│ + startedAt?: number                │
│ + completedAt?: number              │
│ + promise: Promise<T>               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│            TaskQueue                │
├─────────────────────────────────────┤
│ - options: TaskQueueOptions         │
│ - queue: PriorityQueue<Task>        │
│ - tasks: Map<string, Task>          │
│ - fns: Map<string, TaskFn>          │
│ - controllers: Map<string, AbortCtrl│
│ - resolvers: Map<string, {...}>     │
│ - running: boolean                  │
│ - destroyed: boolean                │
│ - runningCount: number              │
│ - stats: {...}                      │
├─────────────────────────────────────┤
│ + add(fn, options?): Task<T>        │
│ + cancel(taskId): boolean           │
│ + cancelBatch(taskIds): {...}       │
│ + cancelAll(): void                 │
│ + pause(): void                     │
│ + resume(): void                    │
│ + getStatus(): TaskQueueStatus      │
│ + getTask(taskId): Task \| undefined│
│ + getAllTasks(): Task[]             │
│ + clear(): Promise<void>            │
│ + destroy(): Promise<void>          │
│ - processQueue(): void              │
│ - executeTask(task): Promise<void>  │
│ - finishTask(task, status, ...): void│
│ - drain(): Promise<void>            │
│ - resetMaps(): void                 │
│ - fireCallback(fn, ...args): void   │
└─────────────────────────────────────┘
```
