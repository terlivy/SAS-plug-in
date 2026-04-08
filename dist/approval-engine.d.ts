/**
 * 自动审批引擎 - 根据配置规则自动审批任务
 *
 * 实现自动审批规则：
 * - autoApproveTokenBudget: 0.2 (Token消耗≤20%预算自动通过)
 * - autoApproveSubtaskImpact: 2 (影响≤2子任务自动通过)
 * - autoApproveFixTime: 3600 (修复时间≤1小时自动通过)
 * - maxRetries: 3 (超过3次回退→人工审批)
 */
export interface ApprovalConfig {
    autoApproveTokenBudget: number;
    autoApproveSubtaskImpact: number;
    autoApproveFixTime: number;
    maxRetries: number;
}
export interface ApprovalContext {
    taskId: string;
    complexity: 'L1' | 'L2' | 'L3';
    estimatedTokens: number;
    actualTokens: number;
    subtaskCount: number;
    rollbackCount: number;
    hasUserApproval: boolean;
    hasPlan: boolean;
    hasRiskAssessment: boolean;
    affectedSubtasks?: number;
    fixTimeSeconds?: number;
    tokenBudgetRatio?: number;
}
export interface ApprovalResult {
    approved: boolean;
    reason: string;
    needsHumanReview: boolean;
    autoApproved?: boolean;
}
export declare class ApprovalEngine {
    private config;
    constructor(config: ApprovalConfig);
    /**
     * 自动审批检查
     */
    autoApprovalCheck(context: ApprovalContext): ApprovalResult;
    /**
     * 检查是否需要人工审批
     */
    private needsHumanReview;
    /**
     * 检查自动审批条件
     */
    private checkAutoApprovalConditions;
    /**
     * 触发人工审批流程
     */
    manualApprovalRequest(taskId: string, context: ApprovalContext): {
        requested: boolean;
        message: string;
    };
    /**
     * 生成人工审批消息
     */
    private generateApprovalMessage;
    /**
     * 获取配置
     */
    getConfig(): ApprovalConfig;
    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<ApprovalConfig>): void;
}
export default ApprovalEngine;
//# sourceMappingURL=approval-engine.d.ts.map