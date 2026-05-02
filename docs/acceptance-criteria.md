# 验收用例

本文档定义了 `js-task-queue` 库的所有功能验收标准，用于指导开发、测试和发布前的验证。

---

## 1. 功能验收用例

### UC-01: 任务队列创建

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-01 |
| **用例名称** | 创建任务队列 |
| **前置条件** | 无 |
| **触发条件** | 调用 `new TaskQueue(options)` |
| **验收标准** | |

#### 验收标准

- [x] **AC-01-01**: 使用有效的 `concurrency`（正整数）可以成功创建队列
- [x] **AC-01-02**: `concurrency` 为 0 时抛出 `RangeError`
- [x] **AC-01-03**: `concurrency` 为负数时抛出 `RangeError`
- [x] **AC-01-04**: `concurrency` 为非整数时抛出 `RangeError`
- [x] **AC-01-05**: 默认 `autoStart` 为 `true`，队列创建后立即可调度任务
- [x] **AC-01-06**: `autoStart: false` 时，队列创建后处于暂停状态
- [x] **AC-01-07**: 创建后 `getStatus()` 返回 `active: true`（默认）、`pendingCount: 0`、`runningCount: 0`

---

### UC-02: 添加任务

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-02 |
| **用例名称** | 添加任务到队列 |
| **前置条件** | 队列已创建 |
| **触发条件** | 调用 `queue.add(fn, options)` |
| **验收标准** | |

#### 验收标准

- [x] **AC-02-01**: 添加任务后返回 `Task` 对象，包含 `id`、`status: PENDING`、`promise`
- [x] **AC-02-02**: 任务 `id` 是全局唯一的字符串（UUID）
- [x] **AC-02-03**: 默认 `priority` 为 0
- [x] **AC-02-04**: 可指定 `priority`，数字越大优先级越高
- [x] **AC-02-05**: 默认 `timeout` 继承 `defaultTimeout`
- [x] **AC-02-06**: 可指定 `timeout` 覆盖默认值，`timeout: 0` 表示不超时
- [x] **AC-02-07**: 添加任务后自动触发调度（如果队列处于 active 状态且未达到并发上限）
- [x] **AC-02-08**: 在 `destroy()` 后调用 `add()` 抛出 `Error: TaskQueue has been destroyed`
- [x] **AC-02-09**: 返回的 `Task` 对象不包含内部字段（如 `fn`、`controller`）

---

### UC-03: 任务执行

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-03 |
| **用例名称** | 任务执行与并发控制 |
| **前置条件** | 队列已创建，有任务待执行 |
| **触发条件** | 队列自动调度或调用 `resume()` |
| **验收标准** | |

#### 验收标准

- [x] **AC-03-01**: 任务函数接收 `AbortSignal` 参数
- [x] **AC-03-02**: 任务函数返回值通过 `task.promise` 的 resolve 传递
- [x] **AC-03-03**: 任务函数抛出异常时，`task.promise` 被 reject
- [x] **AC-03-04**: 同时运行的任务数不超过 `concurrency`
- [x] **AC-03-05**: 任务完成后自动调度下一个待执行任务
- [x] **AC-03-06**: 高优先级任务优先于低优先级任务执行
- [x] **AC-03-07**: 相同优先级的任务按 FIFO 顺序执行
- [x] **AC-03-08**: 任务状态从 `PENDING` → `RUNNING` → `COMPLETED`/`FAILED`
- [x] **AC-03-09**: `onTaskStart` 回调在任务开始执行时触发
- [x] **AC-03-10**: `onTaskComplete` 回调在任务成功完成时触发
- [x] **AC-03-11**: `onTaskError` 回调在任务失败时触发
- [x] **AC-03-12**: 回调异常不影响队列正常运行

---

### UC-04: 任务取消

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-04 |
| **用例名称** | 取消任务 |
| **前置条件** | 队列中有 PENDING 或 RUNNING 状态的任务 |
| **触发条件** | 调用 `cancel(taskId)` |
| **验收标准** | |

#### 验收标准

- [x] **AC-04-01**: 取消 PENDING 任务时，任务从队列中移除，状态变为 `CANCELED`
- [x] **AC-04-02**: 取消 RUNNING 任务时，发送 `AbortSignal`，状态变为 `CANCELED`
- [x] **AC-04-03**: 取消 RUNNING 任务后，任务函数应响应 `AbortSignal` 并结束
- [x] **AC-04-04**: 取消已完成的终态任务返回 `false`
- [x] **AC-04-05**: 取消不存在的任务返回 `false`
- [x] **AC-04-06**: 取消后 `task.promise` 被 reject
- [x] **AC-04-07**: `onTaskCancel` 回调在任务取消时触发
- [x] **AC-04-08**: `cancelBatch(taskIds)` 返回每个任务的取消结果
- [x] **AC-04-09**: `cancelAll()` 取消所有 PENDING 和 RUNNING 任务
- [x] **AC-04-10**: 取消后 `runningCount` 正确递减

---

### UC-05: 任务超时

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-05 |
| **用例名称** | 任务超时处理 |
| **前置条件** | 队列已创建，任务配置了 `timeout` |
| **触发条件** | 任务执行时间超过 `timeout` |
| **验收标准** | |

#### 验收标准

- [x] **AC-05-01**: 任务执行超过 `timeout` 时间后状态变为 `TIMEOUT`
- [x] **AC-05-02**: 超时后发送 `AbortSignal` 通知任务函数
- [x] **AC-05-03**: 超时后 `task.promise` 被 reject
- [x] **AC-05-04**: `onTaskTimeout` 回调在超时时触发
- [x] **AC-05-05**: `timeout: 0` 表示不超时
- [x] **AC-05-06**: 任务级别的 `timeout` 覆盖队列级别的 `defaultTimeout`
- [x] **AC-05-07**: 超时后 `runningCount` 正确递减
- [x] **AC-05-08**: 超时后自动调度下一个任务

---

### UC-06: 队列控制

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-06 |
| **用例名称** | 暂停、恢复、清空和销毁队列 |
| **前置条件** | 队列已创建 |
| **触发条件** | 调用 `pause()` / `resume()` / `clear()` / `destroy()` |
| **验收标准** | |

#### 验收标准

- [x] **AC-06-01**: `pause()` 后队列不再调度新任务，已运行任务不受影响
- [x] **AC-06-02**: `pause()` 后 `getStatus().active` 为 `false`
- [x] **AC-06-03**: `resume()` 后恢复任务调度
- [x] **AC-06-04**: `resume()` 后 `getStatus().active` 为 `true`
- [x] **AC-06-05**: `clear()` 取消所有任务并重置队列状态
- [x] **AC-06-06**: `clear()` 后 `getStatus()` 所有计数器为 0
- [x] **AC-06-07**: `clear()` 后 `destroyed` 状态被重置，可继续添加任务
- [x] **AC-06-08**: `destroy()` 取消所有任务并标记队列已销毁
- [x] **AC-06-09**: `destroy()` 后 `add()` 抛出异常
- [x] **AC-06-10**: `destroy()` 后 `clear()` 可恢复队列

---

### UC-07: 状态查询

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-07 |
| **用例名称** | 查询任务和队列状态 |
| **前置条件** | 队列已创建 |
| **触发条件** | 调用 `getStatus()` / `getTask()` / `getAllTasks()` |
| **验收标准** | |

#### 验收标准

- [x] **AC-07-01**: `getStatus()` 返回准确的队列状态信息
- [x] **AC-07-02**: `getStatus().pendingCount` 等于 PriorityQueue 中的任务数
- [x] **AC-07-03**: `getStatus().runningCount` 等于实际运行中的任务数
- [x] **AC-07-04**: `getTask(taskId)` 返回任务快照（非引用）
- [x] **AC-07-05**: 修改 `getTask()` 返回的对象不影响内部状态
- [x] **AC-07-06**: `getAllTasks()` 返回所有任务的快照数组
- [x] **AC-07-07**: 任务完成后自动从 `getAllTasks()` 中移除
- [x] **AC-07-08**: 任务取消后自动从 `getAllTasks()` 中移除
- [x] **AC-07-09**: 任务超时后自动从 `getAllTasks()` 中移除

---

## 2. 非功能验收用例

### UC-NF-01: 性能

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-NF-01 |
| **用例名称** | 性能要求 |
| **验收标准** | |

#### 验收标准

- [x] **AC-NF-01-01**: `PriorityQueue.enqueue()` 时间复杂度为 O(log n)
- [x] **AC-NF-01-02**: `PriorityQueue.dequeue()` 时间复杂度为 O(log n)
- [x] **AC-NF-01-03**: `PriorityQueue.remove()` 时间复杂度为 O(log n)
- [x] **AC-NF-01-04**: 1000 个任务的入队/出队操作在 10ms 内完成

### UC-NF-02: 兼容性

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-NF-02 |
| **用例名称** | 平台兼容性 |
| **验收标准** | |

#### 验收标准

- [x] **AC-NF-02-01**: 支持 Node.js 18+
- [x] **AC-NF-02-02**: 支持现代浏览器（Chrome、Firefox、Safari、Edge）
- [x] **AC-NF-02-03**: 支持微信小程序环境
- [x] **AC-NF-02-04**: 输出 CJS、ESM、小程序三种格式

### UC-NF-03: 可靠性

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-NF-03 |
| **用例名称** | 可靠性要求 |
| **验收标准** | |

#### 验收标准

- [x] **AC-NF-03-01**: 零运行时依赖
- [x] **AC-NF-03-02**: 回调异常不破坏队列运行
- [x] **AC-NF-03-03**: `runningCount` 不会出现负数
- [x] **AC-NF-03-04**: 并发数始终不超过 `concurrency` 限制
- [x] **AC-NF-03-05**: 任务状态转换幂等，同一任务不会被重复处理

### UC-NF-04: 可测试性

| 项目 | 内容 |
|------|------|
| **用例编号** | UC-NF-04 |
| **用例名称** | 测试覆盖率要求 |
| **验收标准** | |

#### 验收标准

- [x] **AC-NF-04-01**: 语句覆盖率 >= 95%
- [x] **AC-NF-04-02**: 分支覆盖率 >= 85%
- [x] **AC-NF-04-03**: 函数覆盖率 >= 95%
- [x] **AC-NF-04-04**: 行覆盖率 >= 97%
- [x] **AC-NF-04-05**: 测试无资源泄漏（`--detectOpenHandles` 通过）

---

## 3. 验收检查清单

### 发布前检查

- [ ] 所有功能验收用例（UC-01 ~ UC-07）通过
- [ ] 所有非功能验收用例（UC-NF-01 ~ UC-NF-04）通过
- [ ] TypeScript 类型检查通过（`tsc --noEmit`）
- [ ] ESLint 检查通过（`eslint src test`）
- [ ] 测试覆盖率达标
- [ ] 无 open handles（`jest --detectOpenHandles`）
- [ ] 构建成功（`pnpm run build`）
- [ ] README 文档完整
- [ ] CHANGELOG 已更新
