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
export class PhaseEngine {
    config;
    approvalEngine;
    phaseOrder = ['Receive', 'Plan', 'Design', 'Implement', 'QA', 'Deliver'];
    phaseTransitions = new Map();
    constructor(config, approvalEngine) {
        this.config = config;
        this.approvalEngine = approvalEngine;
    }
    /**
     * 检查阶段门是否通过
     */
    async checkGate(taskId, currentPhase, nextPhase, context) {
        // 验证阶段名称
        if (!this.isValidPhase(currentPhase) || !this.isValidPhase(nextPhase)) {
            return {
                approved: false,
                reason: `无效的阶段名称: ${currentPhase} → ${nextPhase}`,
                auto: false
            };
        }
        const fromPhase = currentPhase;
        const toPhase = nextPhase;
        // 验证阶段顺序
        if (!this.isValidPhaseTransition(fromPhase, toPhase)) {
            return {
                approved: false,
                reason: `无效的阶段流转: ${fromPhase} → ${toPhase}`,
                auto: false
            };
        }
        // 构建审批上下文
        const approvalContext = {
            taskId,
            complexity: context.complexity || 'L2',
            estimatedTokens: context.estimatedTokens || 0,
            actualTokens: context.actualTokens || 0,
            subtaskCount: context.subtaskCount || 0,
            rollbackCount: context.rollbackCount || 0,
            hasUserApproval: context.hasUserApproval || false,
            hasPlan: context.hasPlan || false,
            hasRiskAssessment: context.hasRiskAssessment || false,
            affectedSubtasks: context.affectedSubtasks,
            fixTimeSeconds: context.fixTimeSeconds,
            tokenBudgetRatio: context.estimatedTokens > 0 ? context.actualTokens / context.estimatedTokens : undefined
        };
        // 检查入口条件
        const entryCheck = this.checkEntryCriteria(toPhase, approvalContext);
        if (!entryCheck.approved) {
            return {
                approved: false,
                reason: `入口条件不满足: ${entryCheck.reason}`,
                auto: false
            };
        }
        // 检查退出条件
        const exitCheck = this.checkExitCriteria(fromPhase, approvalContext);
        if (!exitCheck.approved) {
            return {
                approved: false,
                reason: `退出条件不满足: ${exitCheck.reason}`,
                auto: false
            };
        }
        // 根据复杂度分级进行门控决策
        const gateDecision = this.determineGateDecision(fromPhase, toPhase, approvalContext);
        if (gateDecision.auto) {
            // 自动审批
            const approvalResult = this.approvalEngine.autoApprovalCheck(approvalContext);
            if (approvalResult.approved) {
                this.logPhaseTransition(taskId, fromPhase, toPhase, true, '自动审批通过', 'auto', approvalContext.complexity);
                return {
                    approved: true,
                    reason: approvalResult.reason,
                    auto: true
                };
            }
            else {
                this.logPhaseTransition(taskId, fromPhase, toPhase, false, approvalResult.reason, 'manual', approvalContext.complexity);
                return {
                    approved: false,
                    reason: approvalResult.reason,
                    auto: false,
                    needsApproval: approvalResult.needsHumanReview
                };
            }
        }
        else {
            // 需要人工审批
            this.logPhaseTransition(taskId, fromPhase, toPhase, false, '需要人工审批', 'manual', approvalContext.complexity);
            return {
                approved: false,
                reason: '需要人工审批',
                auto: false,
                needsApproval: true
            };
        }
    }
    /**
     * 检查入口条件
     */
    checkEntryCriteria(phase, context) {
        switch (phase) {
            case 'Receive':
                // 接收阶段总是可以进入
                return { approved: true, reason: '接收阶段无条件进入' };
            case 'Plan':
                // 计划阶段：L2/L3任务必须有用户确认
                if ((context.complexity === 'L2' || context.complexity === 'L3') && !context.hasUserApproval) {
                    return { approved: false, reason: 'L2/L3任务需要用户确认才能进入计划阶段' };
                }
                return { approved: true, reason: '计划阶段入口条件满足' };
            case 'Design':
                // 设计阶段：必须有计划
                if (!context.hasPlan) {
                    return { approved: false, reason: '进入设计阶段前必须有计划' };
                }
                return { approved: true, reason: '设计阶段入口条件满足' };
            case 'Implement':
                // 实施阶段：必须有设计方案
                if (context.complexity === 'L3' && !context.hasRiskAssessment) {
                    return { approved: false, reason: 'L3任务进入实施阶段前必须有风险评估' };
                }
                return { approved: true, reason: '实施阶段入口条件满足' };
            case 'QA':
                // 质量检查阶段：必须完成实施
                if (context.rollbackCount >= this.config.approval.maxRetries) {
                    return { approved: false, reason: `回退次数超过限制 (${context.rollbackCount} >= ${this.config.approval.maxRetries})` };
                }
                return { approved: true, reason: '质量检查阶段入口条件满足' };
            case 'Deliver':
                // 交付阶段：必须通过质量检查
                return { approved: true, reason: '交付阶段入口条件满足' };
            default:
                return { approved: false, reason: `未知阶段: ${phase}` };
        }
    }
    /**
     * 检查退出条件
     */
    checkExitCriteria(phase, context) {
        switch (phase) {
            case 'Receive':
                // 接收阶段退出：必须明确复杂度
                if (!context.complexity) {
                    return { approved: false, reason: '接收阶段退出前必须确定任务复杂度' };
                }
                return { approved: true, reason: '接收阶段退出条件满足' };
            case 'Plan':
                // 计划阶段退出：必须有完整的计划
                if (!context.hasPlan) {
                    return { approved: false, reason: '计划阶段退出前必须有完整的计划' };
                }
                return { approved: true, reason: '计划阶段退出条件满足' };
            case 'Design':
                // 设计阶段退出：必须有设计方案
                if (context.complexity === 'L3' && !context.hasRiskAssessment) {
                    return { approved: false, reason: 'L3任务设计阶段退出前必须有风险评估' };
                }
                return { approved: true, reason: '设计阶段退出条件满足' };
            case 'Implement':
                // 实施阶段退出：必须完成实施工作
                return { approved: true, reason: '实施阶段退出条件满足' };
            case 'QA':
                // 质量检查阶段退出：必须通过自检
                return { approved: true, reason: '质量检查阶段退出条件满足' };
            case 'Deliver':
                // 交付阶段是最终阶段，不退出
                return { approved: false, reason: '交付阶段是最终阶段，不能退出' };
            default:
                return { approved: false, reason: `未知阶段: ${phase}` };
        }
    }
    /**
     * 确定门控决策（自动/手动）
     */
    determineGateDecision(fromPhase, toPhase, context) {
        const complexity = context.complexity;
        // L1任务：计划通过后自动通过所有后续门控（快速通道）
        if (complexity === 'L1') {
            if (fromPhase === 'Receive' && toPhase === 'Plan') {
                return { auto: false, reason: 'L1任务计划阶段需要审批' };
            }
            return { auto: true, reason: 'L1任务快速通道自动通过' };
        }
        // L2任务：计划→需审批，设计→需审批，其他自动
        if (complexity === 'L2') {
            if ((fromPhase === 'Receive' && toPhase === 'Plan') ||
                (fromPhase === 'Plan' && toPhase === 'Design')) {
                return { auto: false, reason: 'L2任务关键阶段需要审批' };
            }
            return { auto: true, reason: 'L2任务非关键阶段自动通过' };
        }
        // L3任务：每个阶段门控都需要审批
        if (complexity === 'L3') {
            return { auto: false, reason: 'L3任务所有阶段都需要审批' };
        }
        return { auto: false, reason: '未知复杂度，需要审批' };
    }
    /**
     * 验证阶段名称是否有效
     */
    isValidPhase(phase) {
        return this.phaseOrder.includes(phase);
    }
    /**
     * 验证阶段流转是否有效
     */
    isValidPhaseTransition(fromPhase, toPhase) {
        const fromIndex = this.phaseOrder.indexOf(fromPhase);
        const toIndex = this.phaseOrder.indexOf(toPhase);
        // 允许前进到下一阶段，或回退到上一阶段
        return Math.abs(toIndex - fromIndex) === 1;
    }
    /**
     * 回退机制（测试失败可回退到实施/设计）
     */
    rollbackPhase(taskId, currentPhase, reason) {
        const currentIndex = this.phaseOrder.indexOf(currentPhase);
        // 不能回退接收阶段
        if (currentIndex <= 0) {
            return {
                success: false,
                targetPhase: null,
                message: '无法回退接收阶段'
            };
        }
        // 确定回退目标
        let targetPhase;
        let message;
        if (currentPhase === 'QA') {
            // QA失败可回退到实施或设计
            targetPhase = 'Implement';
            message = `质量检查失败，回退到实施阶段: ${reason}`;
        }
        else if (currentPhase === 'Implement') {
            // 实施失败可回退到设计
            targetPhase = 'Design';
            message = `实施失败，回退到设计阶段: ${reason}`;
        }
        else {
            // 其他阶段回退到上一阶段
            targetPhase = this.phaseOrder[currentIndex - 1];
            message = `回退到上一阶段: ${reason}`;
        }
        this.logPhaseTransition(taskId, currentPhase, targetPhase, true, message, 'auto', 'L2');
        return {
            success: true,
            targetPhase,
            message
        };
    }
    /**
     * 记录阶段切换日志
     */
    logPhaseTransition(taskId, fromPhase, toPhase, approved, reason, gateDecision, complexity) {
        const log = {
            taskId,
            fromPhase,
            toPhase,
            timestamp: new Date().toISOString(),
            approved,
            reason,
            gateDecision,
            complexity
        };
        const logs = this.phaseTransitions.get(taskId) || [];
        logs.push(log);
        this.phaseTransitions.set(taskId, logs);
        console.log(`[SAS-Engine] Phase transition: ${taskId} ${fromPhase} → ${toPhase} (${approved ? 'approved' : 'rejected'}) - ${reason}`);
    }
    /**
     * 获取阶段切换历史
     */
    getPhaseHistory(taskId) {
        return this.phaseTransitions.get(taskId) || [];
    }
    /**
     * 获取下一阶段
     */
    getNextPhase(currentPhase) {
        const currentIndex = this.phaseOrder.indexOf(currentPhase);
        if (currentIndex < 0 || currentIndex >= this.phaseOrder.length - 1) {
            return null;
        }
        return this.phaseOrder[currentIndex + 1];
    }
    /**
     * 获取上一阶段
     */
    getPreviousPhase(currentPhase) {
        const currentIndex = this.phaseOrder.indexOf(currentPhase);
        if (currentIndex <= 0) {
            return null;
        }
        return this.phaseOrder[currentIndex - 1];
    }
    /**
     * 检查是否超过3次回退
     */
    checkRollbackLimit(taskId, rollbackCount) {
        if (rollbackCount >= 3) {
            return {
                exceeded: true,
                message: `任务 ${taskId} 回退次数超过3次，强制标记为失败`
            };
        }
        return {
            exceeded: false,
            message: `回退次数: ${rollbackCount}/3`
        };
    }
}
export default PhaseEngine;
