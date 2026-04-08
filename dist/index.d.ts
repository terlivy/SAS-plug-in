/**
 * SAS Engine - SAS工作准则执行引擎
 *
 * 实现 SAS v1.4.0 六阶段门控流水线、自动审批、看门狗监控
 *
 * @version 1.0.0-beta.1
 * @sas_version 1.4.0
 */
export interface SASConfig {
    phaseTimeouts: Record<string, number>;
    watchdog: {
        pendingWarnThreshold: number;
        pendingRecoverThreshold: number;
        idleSnapshotThreshold: number;
        idleTokenThreshold: number;
        idleDurationThreshold: number;
    };
    approval: {
        autoApproveTokenBudget: number;
        autoApproveSubtaskImpact: number;
        autoApproveFixTime: number;
        maxRetries: number;
    };
    maintenance: {
        defaultRequired: boolean;
    };
}
export interface PhaseTransition {
    taskId: string;
    from: string;
    to: string;
    gateDecision: 'auto' | 'manual';
    reason: string;
    timestamp: string;
    approvalConditions?: string[];
}
export declare class SASEngine {
    private phaseEngine;
    private approvalEngine;
    private watchdog;
    private stateMachine;
    constructor(config: SASConfig);
    /**
     * 检查阶段门是否通过
     */
    checkGate(taskId: string, currentPhase: string, nextPhase: string, context: Record<string, any>): Promise<{
        approved: boolean;
        reason: string;
        auto: boolean;
    }>;
    /**
     * 记录阶段切换日志
     */
    logPhaseTransition(transition: PhaseTransition): Promise<void>;
    /**
     * 看门狗检查
     */
    watchdogCheck(): Promise<{
        warnings: Array<{
            taskId: string;
            reason: string;
        }>;
        recoveries: Array<{
            taskId: string;
            action: string;
        }>;
    }>;
    /**
     * 获取任务当前状态
     */
    getTaskState(taskId: string): Promise<import("./state-machine").TaskState | null>;
}
export default SASEngine;
//# sourceMappingURL=index.d.ts.map