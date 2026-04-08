/**
 * 阶段门控引擎 - 管理SAS六阶段工作流
 *
 * 六阶段（顺序固定）：
 * 接收任务(Receive) → 制定计划(Plan) → 方案设计(Design) → 实施工作(Implement) → 质量检查(QA) → 交付归档(Deliver)
 *
 * 复杂度分级：
 * - L1：单步、无风险 → 直接执行，快速通道
 * - L2：多步骤、一定风险 → 标准 SAS 流程，需计划
 * - L3：多方协调、高风险 → 完整 CEO 模式，需详细方案
 */
import { ApprovalEngine } from './approval-engine';
import { SASConfig } from './index';
export type Phase = 'Receive' | 'Plan' | 'Design' | 'Implement' | 'QA' | 'Deliver';
export type Complexity = 'L1' | 'L2' | 'L3';
export interface PhaseContext {
    taskId: string;
    complexity: Complexity;
    estimatedTokens: number;
    actualTokens: number;
    subtaskCount: number;
    rollbackCount: number;
    hasUserApproval: boolean;
    hasPlan: boolean;
    hasRiskAssessment: boolean;
    currentPhase: Phase;
    nextPhase: Phase;
    metadata?: Record<string, any>;
}
export interface GateCheckResult {
    approved: boolean;
    reason: string;
    auto: boolean;
    needsApproval?: boolean;
}
export interface PhaseTransitionLog {
    taskId: string;
    fromPhase: Phase;
    toPhase: Phase;
    timestamp: string;
    approved: boolean;
    reason: string;
    gateDecision: 'auto' | 'manual';
    complexity: Complexity;
}
export declare class PhaseEngine {
    private config;
    private approvalEngine;
    private phaseOrder;
    private phaseTransitions;
    constructor(config: SASConfig, approvalEngine: ApprovalEngine);
    /**
     * 检查阶段门是否通过
     */
    checkGate(taskId: string, currentPhase: string, nextPhase: string, context: Record<string, any>): Promise<GateCheckResult>;
    /**
     * 检查入口条件
     */
    private checkEntryCriteria;
    /**
     * 检查退出条件
     */
    private checkExitCriteria;
    /**
     * 确定门控决策（自动/手动）
     */
    private determineGateDecision;
    /**
     * 验证阶段名称是否有效
     */
    private isValidPhase;
    /**
     * 验证阶段流转是否有效
     */
    private isValidPhaseTransition;
    /**
     * 回退机制（测试失败可回退到实施/设计）
     */
    rollbackPhase(taskId: string, currentPhase: Phase, reason: string): {
        success: boolean;
        targetPhase: Phase | null;
        message: string;
    };
    /**
     * 记录阶段切换日志
     */
    private logPhaseTransition;
    /**
     * 获取阶段切换历史
     */
    getPhaseHistory(taskId: string): PhaseTransitionLog[];
    /**
     * 获取下一阶段
     */
    getNextPhase(currentPhase: Phase): Phase | null;
    /**
     * 获取上一阶段
     */
    getPreviousPhase(currentPhase: Phase): Phase | null;
    /**
     * 检查是否超过3次回退
     */
    checkRollbackLimit(taskId: string, rollbackCount: number): {
        exceeded: boolean;
        message: string;
    };
}
export default PhaseEngine;
//# sourceMappingURL=phase-engine.d.ts.map