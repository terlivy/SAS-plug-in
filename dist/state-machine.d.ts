/**
 * 状态机模块 - 管理任务状态流转
 *
 * 状态枚举: PENDING | RUNNING | WAITING_APPROVAL | COMPLETED | FAILED | BLOCKED
 * 支持状态流转和回退机制
 */
export type TaskState = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
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
export declare class StateMachine {
    private tasks;
    private logEntries;
    /**
     * 初始化任务状态
     */
    initializeTask(taskId: string): TaskStateEntry;
    /**
     * 状态流转
     */
    transition(taskId: string, toState: TaskState, reason: string, metadata?: Record<string, any>): boolean;
    /**
     * 验证状态流转是否合法
     */
    private isValidTransition;
    /**
     * 回退到上一阶段（用于测试失败等情况）
     */
    rollback(taskId: string, reason: string): boolean;
    /**
     * 获取任务当前状态
     */
    getState(taskId: string): TaskState | null;
    /**
     * 获取任务历史记录
     */
    getHistory(taskId: string): StateTransition[];
    /**
     * 记录状态变化日志
     */
    log(taskId: string, entry: string): void;
    /**
     * 获取任务日志
     */
    getLogs(taskId: string): string[];
    /**
     * 检查任务是否存在
     */
    hasTask(taskId: string): boolean;
    /**
     * 获取所有任务状态
     */
    getAllTasks(): TaskStateEntry[];
    /**
     * 清理已完成或失败的任务（可选）
     */
    cleanupOldTasks(maxAgeHours?: number): string[];
}
export default StateMachine;
//# sourceMappingURL=state-machine.d.ts.map