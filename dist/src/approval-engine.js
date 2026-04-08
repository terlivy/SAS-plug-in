/**
 * 自动审批引擎 - 根据配置规则自动审批任务
 *
 * 实现自动审批规则：
 * - autoApproveTokenBudget: 0.2 (Token消耗≤20%预算自动通过)
 * - autoApproveSubtaskImpact: 2 (影响≤2子任务自动通过)
 * - autoApproveFixTime: 3600 (修复时间≤1小时自动通过)
 * - maxRetries: 3 (超过3次回退→人工审批)
 */
export class ApprovalEngine {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * 自动审批检查
     */
    autoApprovalCheck(context) {
        // 检查是否需要人工审批
        if (this.needsHumanReview(context)) {
            return {
                approved: false,
                reason: '需要人工审批',
                needsHumanReview: true
            };
        }
        // 检查自动审批条件
        const autoApprovalResult = this.checkAutoApprovalConditions(context);
        if (autoApprovalResult.approved) {
            return {
                approved: true,
                reason: autoApprovalResult.reason,
                needsHumanReview: false,
                autoApproved: true
            };
        }
        // 默认需要人工审批
        return {
            approved: false,
            reason: '未满足自动审批条件',
            needsHumanReview: true
        };
    }
    /**
     * 检查是否需要人工审批
     */
    needsHumanReview(context) {
        // 1. 超过最大回退次数
        if (context.rollbackCount >= this.config.maxRetries) {
            console.log(`[SAS-Engine] Task ${context.taskId} needs human review: exceeded max retries (${context.rollbackCount} >= ${this.config.maxRetries})`);
            return true;
        }
        // 2. L3复杂度任务总是需要人工审批
        if (context.complexity === 'L3') {
            console.log(`[SAS-Engine] Task ${context.taskId} needs human review: L3 complexity`);
            return true;
        }
        // 3. 没有计划（L2任务必须有计划）
        if (context.complexity === 'L2' && !context.hasPlan) {
            console.log(`[SAS-Engine] Task ${context.taskId} needs human review: L2 task without plan`);
            return true;
        }
        // 4. 没有风险评估（L2/L3任务必须有风险评估）
        if (context.complexity === 'L2' && !context.hasRiskAssessment) {
            console.log(`[SAS-Engine] Task ${context.taskId} needs human review: missing risk assessment`);
            return true;
        }
        return false;
    }
    /**
     * 检查自动审批条件
     */
    checkAutoApprovalConditions(context) {
        const conditions = [];
        // 1. Token消耗预算检查
        if (context.estimatedTokens > 0) {
            const tokenBudgetRatio = context.actualTokens / context.estimatedTokens;
            const tokenCondition = tokenBudgetRatio <= this.config.autoApproveTokenBudget;
            conditions.push({
                met: tokenCondition,
                reason: tokenCondition
                    ? `Token消耗在预算内 (${(tokenBudgetRatio * 100).toFixed(1)}% ≤ ${this.config.autoApproveTokenBudget * 100}%)`
                    : `Token消耗超出预算 (${(tokenBudgetRatio * 100).toFixed(1)}% > ${this.config.autoApproveTokenBudget * 100}%)`
            });
        }
        // 2. 子任务影响检查
        const subtaskCondition = (context.affectedSubtasks || 0) <= this.config.autoApproveSubtaskImpact;
        conditions.push({
            met: subtaskCondition,
            reason: subtaskCondition
                ? `影响子任务数在阈值内 (${context.affectedSubtasks || 0} ≤ ${this.config.autoApproveSubtaskImpact})`
                : `影响子任务数超出阈值 (${context.affectedSubtasks || 0} > ${this.config.autoApproveSubtaskImpact})`
        });
        // 3. 修复时间检查
        const fixTimeCondition = (context.fixTimeSeconds || 0) <= this.config.autoApproveFixTime;
        conditions.push({
            met: fixTimeCondition,
            reason: fixTimeCondition
                ? `修复时间在阈值内 (${context.fixTimeSeconds || 0}s ≤ ${this.config.autoApproveFixTime}s)`
                : `修复时间超出阈值 (${context.fixTimeSeconds || 0}s > ${this.config.autoApproveFixTime}s)`
        });
        // 4. L1任务自动通过（快速通道）
        if (context.complexity === 'L1') {
            conditions.push({
                met: true,
                reason: 'L1任务自动通过快速通道'
            });
        }
        // 检查所有条件是否都满足
        const allConditionsMet = conditions.every(c => c.met);
        const metConditions = conditions.filter(c => c.met);
        const failedConditions = conditions.filter(c => !c.met);
        if (allConditionsMet) {
            return {
                approved: true,
                reason: `自动审批通过: ${metConditions.map(c => c.reason).join('; ')}`
            };
        }
        else {
            return {
                approved: false,
                reason: `自动审批失败: ${failedConditions.map(c => c.reason).join('; ')}`
            };
        }
    }
    /**
     * 触发人工审批流程
     */
    manualApprovalRequest(taskId, context) {
        console.log(`[SAS-Engine] Manual approval requested for task ${taskId}`);
        // 这里可以集成到通知系统（如飞书、钉钉、邮件等）
        // 目前先记录日志
        const approvalMessage = this.generateApprovalMessage(taskId, context);
        // 在实际实现中，这里应该发送通知
        // 例如：sendNotification('manual_approval', approvalMessage);
        return {
            requested: true,
            message: approvalMessage
        };
    }
    /**
     * 生成人工审批消息
     */
    generateApprovalMessage(taskId, context) {
        return `
【人工审批请求】
任务ID: ${taskId}
复杂度: ${context.complexity}
Token预算: ${context.estimatedTokens} (已用: ${context.actualTokens})
子任务数: ${context.subtaskCount}
回退次数: ${context.rollbackCount}
是否有计划: ${context.hasPlan ? '是' : '否'}
是否有风险评估: ${context.hasRiskAssessment ? '是' : '否'}

请审批是否继续执行。
    `.trim();
    }
    /**
     * 获取配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log(`[SAS-Engine] Approval engine config updated`);
    }
}
export default ApprovalEngine;
