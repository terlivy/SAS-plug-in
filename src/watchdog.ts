/**
 * 看门狗监控 - 监控任务状态，检测异常并自动恢复
 * 
 * 监控规则：
 * - pendingWarnThreshold: 7200 (2小时pending→告警)
 * - pendingRecoverThreshold: 21600 (6小时pending→自动恢复/升级)
 * - idleSnapshotThreshold: 100 (快照数>100)
 * - idleTokenThreshold: 0 (Token=0)
 * - idleDurationThreshold: 10800 (空转>3小时)
 */

export interface WatchdogConfig {
  pendingWarnThreshold: number;    // 秒，pending状态警告阈值
  pendingRecoverThreshold: number; // 秒，pending状态恢复阈值
  idleSnapshotThreshold: number;   // 快照数阈值
  idleTokenThreshold: number;      // Token使用阈值
  idleDurationThreshold: number;   // 秒，空转持续时间阈值
}

export interface TaskMonitorData {
  taskId: string;
  state: string;
  startTime: string;
  lastUpdateTime: string;
  snapshotCount: number;
  tokenUsed: number;
  durationSeconds: number;
  metadata?: Record<string, any>;
}

export interface WatchdogResult {
  warnings: Array<{ taskId: string; reason: string }>;
  recoveries: Array<{ taskId: string; action: string }>;
}

export interface RecoveryAction {
  taskId: string;
  action: 'restart' | 'escalate' | 'notify' | 'mark_failed';
  reason: string;
  timestamp: string;
}

export class Watchdog {
  private config: WatchdogConfig;
  private monitoredTasks: Map<string, TaskMonitorData> = new Map();
  private recoveryHistory: RecoveryAction[] = [];

  constructor(config: WatchdogConfig) {
    this.config = config;
  }

  /**
   * 注册监控任务
   */
  registerTask(taskData: TaskMonitorData): void {
    this.monitoredTasks.set(taskData.taskId, taskData);
    console.log(`[SAS-Engine] Watchdog registered task: ${taskData.taskId}`);
  }

  /**
   * 更新任务监控数据
   */
  updateTask(taskId: string, updates: Partial<TaskMonitorData>): boolean {
    const task = this.monitoredTasks.get(taskId);
    if (!task) {
      console.warn(`[SAS-Engine] Watchdog cannot update unknown task: ${taskId}`);
      return false;
    }

    Object.assign(task, updates, { lastUpdateTime: new Date().toISOString() });
    return true;
  }

  /**
   * 移除监控任务
   */
  removeTask(taskId: string): boolean {
    return this.monitoredTasks.delete(taskId);
  }

  /**
   * 执行看门狗检查
   */
  async check(): Promise<WatchdogResult> {
    const warnings: Array<{ taskId: string; reason: string }> = [];
    const recoveries: Array<{ taskId: string; action: string }> = [];
    const now = Date.now();

    for (const [taskId, task] of this.monitoredTasks.entries()) {
      // 计算任务持续时间
      const startTime = new Date(task.startTime).getTime();
      const durationSeconds = Math.floor((now - startTime) / 1000);
      
      // 更新持续时间
      task.durationSeconds = durationSeconds;

      // 1. 检查pending状态超时
      const pendingCheck = this.checkPendingTimeout(taskId, task, durationSeconds);
      if (pendingCheck.warning) {
        warnings.push({ taskId, reason: pendingCheck.warning });
      }
      if (pendingCheck.recovery) {
        const recoveryAction = this.handlePendingRecovery(taskId, task);
        recoveries.push({ taskId, action: recoveryAction });
      }

      // 2. 检查空转状态
      const idleCheck = this.checkIdleState(taskId, task);
      if (idleCheck) {
        warnings.push({ taskId, reason: idleCheck });
        
        // 空转超过阈值触发恢复
        if (task.durationSeconds > this.config.idleDurationThreshold) {
          const recoveryAction = this.handleIdleRecovery(taskId, task);
          recoveries.push({ taskId, action: recoveryAction });
        }
      }

      // 3. 检查其他异常状态
      const otherChecks = this.checkOtherAnomalies(taskId, task);
      otherChecks.forEach(check => {
        warnings.push({ taskId, reason: check });
      });
    }

    // 记录检查结果
    if (warnings.length > 0 || recoveries.length > 0) {
      console.log(`[SAS-Engine] Watchdog check completed: ${warnings.length} warnings, ${recoveries.length} recoveries`);
    }

    return { warnings, recoveries };
  }

  /**
   * 检查pending状态超时
   */
  private checkPendingTimeout(taskId: string, task: TaskMonitorData, durationSeconds: number): 
    { warning: string | null; recovery: boolean } {
    
    if (task.state !== 'PENDING' && task.state !== 'WAITING_APPROVAL') {
      return { warning: null, recovery: false };
    }

    // 检查警告阈值
    if (durationSeconds >= this.config.pendingWarnThreshold && 
        durationSeconds < this.config.pendingRecoverThreshold) {
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      return {
        warning: `任务 ${taskId} 处于 ${task.state} 状态超过 ${hours}小时${minutes}分钟`,
        recovery: false
      };
    }

    // 检查恢复阈值
    if (durationSeconds >= this.config.pendingRecoverThreshold) {
      return {
        warning: null,
        recovery: true
      };
    }

    return { warning: null, recovery: false };
  }

  /**
   * 检查空转状态
   */
  private checkIdleState(taskId: string, task: TaskMonitorData): string | null {
    // 空转检测逻辑：
    // 如果 (snapshotCount > idleSnapshotThreshold) AND (tokenUsed == idleTokenThreshold)
    //   AND (duration > idleDurationThreshold)
    // → 判定为空转
    
    const isIdle = 
      task.snapshotCount > this.config.idleSnapshotThreshold &&
      task.tokenUsed <= this.config.idleTokenThreshold &&
      task.durationSeconds > this.config.idleDurationThreshold;

    if (isIdle) {
      const hours = Math.floor(task.durationSeconds / 3600);
      return `任务 ${taskId} 可能空转: ${task.snapshotCount}快照, ${task.tokenUsed}Token, 持续${hours}小时`;
    }

    return null;
  }

  /**
   * 检查其他异常
   */
  private checkOtherAnomalies(taskId: string, task: TaskMonitorData): string[] {
    const anomalies: string[] = [];

    // 检查状态异常
    const validStates = ['PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'BLOCKED'];
    if (!validStates.includes(task.state)) {
      anomalies.push(`任务 ${taskId} 处于未知状态: ${task.state}`);
    }

    // 检查时间异常（未来时间）
    const startTime = new Date(task.startTime).getTime();
    if (startTime > Date.now()) {
      anomalies.push(`任务 ${taskId} 开始时间在未来: ${task.startTime}`);
    }

    // 检查快照数异常增长
    if (task.snapshotCount > 1000) {
      anomalies.push(`任务 ${taskId} 快照数异常高: ${task.snapshotCount}`);
    }

    return anomalies;
  }

  /**
   * 处理pending状态恢复
   */
  private handlePendingRecovery(taskId: string, task: TaskMonitorData): string {
    const hours = Math.floor(task.durationSeconds / 3600);
    let action: string;
    
    if (task.state === 'WAITING_APPROVAL') {
      // 等待审批超时，升级通知
      action = `escalate: 等待审批超过${hours}小时，已升级通知负责人`;
      this.logRecovery(taskId, 'escalate', `等待审批超时: ${hours}小时`);
    } else {
      // PENDING状态超时，尝试重启
      action = `restart: PENDING状态超过${hours}小时，尝试重启任务`;
      this.logRecovery(taskId, 'restart', `PENDING超时: ${hours}小时`);
    }
    
    return action;
  }

  /**
   * 处理空转恢复
   */
  private handleIdleRecovery(taskId: string, task: TaskMonitorData): string {
    const hours = Math.floor(task.durationSeconds / 3600);
    const action = `mark_failed: 空转超过${hours}小时，标记为失败`;
    
    this.logRecovery(taskId, 'mark_failed', `空转超时: ${hours}小时, ${task.snapshotCount}快照, ${task.tokenUsed}Token`);
    
    // 更新任务状态为失败
    task.state = 'FAILED';
    task.metadata = {
      ...task.metadata,
      watchdog_marked_failed: new Date().toISOString(),
      reason: '空转超时'
    };
    
    return action;
  }

  /**
   * 记录恢复操作
   */
  private logRecovery(taskId: string, action: RecoveryAction['action'], reason: string): void {
    const recovery: RecoveryAction = {
      taskId,
      action,
      reason,
      timestamp: new Date().toISOString()
    };
    
    this.recoveryHistory.push(recovery);
    console.log(`[SAS-Engine] Watchdog recovery: ${taskId} -> ${action} (${reason})`);
  }

  /**
   * 获取监控中的任务列表
   */
  getMonitoredTasks(): TaskMonitorData[] {
    return Array.from(this.monitoredTasks.values());
  }

  /**
   * 获取任务监控数据
   */
  getTaskData(taskId: string): TaskMonitorData | null {
    return this.monitoredTasks.get(taskId) || null;
  }

  /**
   * 获取恢复历史
   */
  getRecoveryHistory(limit: number = 50): RecoveryAction[] {
    return this.recoveryHistory.slice(-limit);
  }

  /**
   * 清理旧数据
   */
  cleanupOldData(maxAgeHours: number = 168): { removed: number } {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 3600 * 1000;
    let removed = 0;

    // 清理监控任务
    for (const [taskId, task] of this.monitoredTasks.entries()) {
      const lastUpdateTime = new Date(task.lastUpdateTime).getTime();
      if (now - lastUpdateTime > maxAgeMs && 
          (task.state === 'COMPLETED' || task.state === 'FAILED')) {
        this.monitoredTasks.delete(taskId);
        removed++;
      }
    }

    // 清理恢复历史
    const cutoffTime = now - maxAgeMs;
    this.recoveryHistory = this.recoveryHistory.filter(
      recovery => new Date(recovery.timestamp).getTime() > cutoffTime
    );

    if (removed > 0) {
      console.log(`[SAS-Engine] Watchdog cleaned up ${removed} old tasks`);
    }

    return { removed };
  }

  /**
   * 获取配置
   */
  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<WatchdogConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`[SAS-Engine] Watchdog config updated`);
  }

  /**
   * 生成监控报告
   */
  async generateReport(): Promise<{
    totalMonitored: number;
    byState: Record<string, number>;
    warnings: number;
    recoveries: number;
    recentRecoveries: RecoveryAction[];
  }> {
    const byState: Record<string, number> = {};
    
    for (const task of this.monitoredTasks.values()) {
      byState[task.state] = (byState[task.state] || 0) + 1;
    }

    const recentCheck = await this.check();
    
    return {
      totalMonitored: this.monitoredTasks.size,
      byState,
      warnings: recentCheck.warnings.length,
      recoveries: recentCheck.recoveries.length,
      recentRecoveries: this.recoveryHistory.slice(-10)
    };
  }
}

export default Watchdog;