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
    pendingWarnThreshold: number;
    pendingRecoverThreshold: number;
    idleSnapshotThreshold: number;
    idleTokenThreshold: number;
    idleDurationThreshold: number;
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
    warnings: Array<{
        taskId: string;
        reason: string;
    }>;
    recoveries: Array<{
        taskId: string;
        action: string;
    }>;
}
export interface RecoveryAction {
    taskId: string;
    action: 'restart' | 'escalate' | 'notify' | 'mark_failed';
    reason: string;
    timestamp: string;
}
export declare class Watchdog {
    private config;
    private monitoredTasks;
    private recoveryHistory;
    constructor(config: WatchdogConfig);
    /**
     * 注册监控任务
     */
    registerTask(taskData: TaskMonitorData): void;
    /**
     * 更新任务监控数据
     */
    updateTask(taskId: string, updates: Partial<TaskMonitorData>): boolean;
    /**
     * 移除监控任务
     */
    removeTask(taskId: string): boolean;
    /**
     * 执行看门狗检查
     */
    check(): Promise<WatchdogResult>;
    /**
     * 检查pending状态超时
     */
    private checkPendingTimeout;
    /**
     * 检查空转状态
     */
    private checkIdleState;
    /**
     * 检查其他异常
     */
    private checkOtherAnomalies;
    /**
     * 处理pending状态恢复
     */
    private handlePendingRecovery;
    /**
     * 处理空转恢复
     */
    private handleIdleRecovery;
    /**
     * 记录恢复操作
     */
    private logRecovery;
    /**
     * 获取监控中的任务列表
     */
    getMonitoredTasks(): TaskMonitorData[];
    /**
     * 获取任务监控数据
     */
    getTaskData(taskId: string): TaskMonitorData | null;
    /**
     * 获取恢复历史
     */
    getRecoveryHistory(limit?: number): RecoveryAction[];
    /**
     * 清理旧数据
     */
    cleanupOldData(maxAgeHours?: number): {
        removed: number;
    };
    /**
     * 获取配置
     */
    getConfig(): WatchdogConfig;
    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<WatchdogConfig>): void;
    /**
     * 生成监控报告
     */
    generateReport(): Promise<{
        totalMonitored: number;
        byState: Record<string, number>;
        warnings: number;
        recoveries: number;
        recentRecoveries: RecoveryAction[];
    }>;
}
export default Watchdog;
//# sourceMappingURL=watchdog.d.ts.map