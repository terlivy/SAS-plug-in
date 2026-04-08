/**
 * 状态机模块 - 管理任务状态流转
 * 
 * 状态枚举: PENDING | RUNNING | WAITING_APPROVAL | COMPLETED | FAILED | BLOCKED
 * 支持状态流转和回退机制
 */

export type TaskState = 
  | 'PENDING' 
  | 'RUNNING' 
  | 'WAITING_APPROVAL' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'BLOCKED';

export interface StateTransition {
  taskId: string;
  from: TaskState;
  to: TaskState;
  reason: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TaskStateEntry {
  taskId: string;
  currentState: TaskState;
  history: StateTransition[];
  createdAt: string;
  updatedAt: string;
}

export class StateMachine {
  private tasks: Map<string, TaskStateEntry> = new Map();
  private logEntries: Map<string, string[]> = new Map();

  /**
   * 初始化任务状态
   */
  initializeTask(taskId: string): TaskStateEntry {
    const now = new Date().toISOString();
    const entry: TaskStateEntry = {
      taskId,
      currentState: 'PENDING',
      history: [{
        taskId,
        from: 'PENDING',
        to: 'PENDING',
        reason: 'Task initialized',
        timestamp: now
      }],
      createdAt: now,
      updatedAt: now
    };
    
    this.tasks.set(taskId, entry);
    this.logEntries.set(taskId, []);
    
    return entry;
  }

  /**
   * 状态流转
   */
  transition(taskId: string, toState: TaskState, reason: string, metadata?: Record<string, any>): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      console.error(`[SAS-Engine] Task ${taskId} not found`);
      return false;
    }

    const fromState = entry.currentState;
    
    // 验证状态流转是否合法
    if (!this.isValidTransition(fromState, toState)) {
      console.error(`[SAS-Engine] Invalid transition from ${fromState} to ${toState} for task ${taskId}`);
      return false;
    }

    const now = new Date().toISOString();
    const transition: StateTransition = {
      taskId,
      from: fromState,
      to: toState,
      reason,
      timestamp: now,
      metadata
    };

    entry.currentState = toState;
    entry.history.push(transition);
    entry.updatedAt = now;
    
    // 记录日志
    const logMessage = `[${now}] ${fromState} → ${toState}: ${reason}`;
    this.log(taskId, logMessage);
    
    console.log(`[SAS-Engine] Task ${taskId} transitioned from ${fromState} to ${toState}: ${reason}`);
    return true;
  }

  /**
   * 验证状态流转是否合法
   */
  private isValidTransition(from: TaskState, to: TaskState): boolean {
    const validTransitions: Record<TaskState, TaskState[]> = {
      'PENDING': ['RUNNING', 'FAILED'],
      'RUNNING': ['WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'BLOCKED', 'PENDING'],
      'WAITING_APPROVAL': ['RUNNING', 'BLOCKED', 'FAILED'],
      'BLOCKED': ['RUNNING', 'FAILED'],
      'COMPLETED': [], // 完成状态不可再转换
      'FAILED': []     // 失败状态不可再转换
    };

    return validTransitions[from].includes(to);
  }

  /**
   * 回退到上一阶段（用于测试失败等情况）
   */
  rollback(taskId: string, reason: string): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry) {
      console.error(`[SAS-Engine] Task ${taskId} not found`);
      return false;
    }

    if (entry.currentState !== 'RUNNING') {
      console.error(`[SAS-Engine] Cannot rollback from state ${entry.currentState}`);
      return false;
    }

    // 回退到 PENDING 状态
    return this.transition(taskId, 'PENDING', `Rollback: ${reason}`, { rollback: true });
  }

  /**
   * 获取任务当前状态
   */
  getState(taskId: string): TaskState | null {
    const entry = this.tasks.get(taskId);
    return entry ? entry.currentState : null;
  }

  /**
   * 获取任务历史记录
   */
  getHistory(taskId: string): StateTransition[] {
    const entry = this.tasks.get(taskId);
    return entry ? [...entry.history] : [];
  }

  /**
   * 记录状态变化日志
   */
  log(taskId: string, entry: string): void {
    const logs = this.logEntries.get(taskId) || [];
    logs.push(entry);
    this.logEntries.set(taskId, logs);
  }

  /**
   * 获取任务日志
   */
  getLogs(taskId: string): string[] {
    return this.logEntries.get(taskId) || [];
  }

  /**
   * 检查任务是否存在
   */
  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  /**
   * 获取所有任务状态
   */
  getAllTasks(): TaskStateEntry[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 清理已完成或失败的任务（可选）
   */
  cleanupOldTasks(maxAgeHours: number = 24): string[] {
    const now = Date.now();
    const cleaned: string[] = [];

    for (const [taskId, entry] of this.tasks.entries()) {
      const updatedAt = new Date(entry.updatedAt).getTime();
      const ageHours = (now - updatedAt) / (1000 * 60 * 60);
      
      if (ageHours > maxAgeHours && (entry.currentState === 'COMPLETED' || entry.currentState === 'FAILED')) {
        this.tasks.delete(taskId);
        this.logEntries.delete(taskId);
        cleaned.push(taskId);
      }
    }

    return cleaned;
  }
}

export default StateMachine;