/**
 * 阶段门控引擎 - 管理SAS六阶段工作流
 * 
 * 六阶段（顺序固定）：
 * 接收任务(receive) → 制定计划(plan) → 实施工作(execute) → 质量检查(check) → 交付(deliver) → 归档(archive)
 * 
 * 复杂度分级：
 * - L1：单步、无风险 → 直接执行，快速通道
 * - L2：多步骤、一定风险 → 标准 SAS 流程，需计划
 * - L3：多方协调、高风险 → 完整 CEO 模式，需详细方案
 */

import { ApprovalEngine, ApprovalContext } from './approval-engine';
import { SASConfig } from './index';

export type Phase = 'receive' | 'plan' | 'execute' | 'check' | 'deliver' | 'archive';
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

export class PhaseEngine {
  private config: SASConfig;
  private approvalEngine: ApprovalEngine;
  private phaseOrder: Phase[] = ['receive', 'plan', 'execute', 'check', 'deliver', 'archive'];
  private phaseTransitions: Map<string, PhaseTransitionLog[]> = new Map();

  constructor(config: SASConfig, approvalEngine: ApprovalEngine) {
    this.config = config;
    this.approvalEngine = approvalEngine;
  }

  /**
   * 检查阶段门是否通过
   */
  async checkGate(
    taskId: string,
    currentPhase: string,
    nextPhase: string,
    context: Record<string, any>
  ): Promise<GateCheckResult> {
    // 验证阶段名称
    if (!this.isValidPhase(currentPhase) || !this.isValidPhase(nextPhase)) {
      return {
        approved: false,
        reason: `无效的阶段名称: ${currentPhase} → ${nextPhase}`,
        auto: false
      };
    }

    const fromPhase = currentPhase as Phase;
    const toPhase = nextPhase as Phase;
    
    // 验证阶段顺序
    if (!this.isValidPhaseTransition(fromPhase, toPhase)) {
      return {
        approved: false,
        reason: `无效的阶段流转: ${fromPhase} → ${toPhase}`,
        auto: false
      };
    }

    // 构建审批上下文
    const approvalContext: ApprovalContext = {
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
      } else {
        this.logPhaseTransition(taskId, fromPhase, toPhase, false, approvalResult.reason, 'manual', approvalContext.complexity);
        return {
          approved: false,
          reason: approvalResult.reason,
          auto: false,
          needsApproval: approvalResult.needsHumanReview
        };
      }
    } else {
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
  private checkEntryCriteria(phase: Phase, context: ApprovalContext): { approved: boolean; reason: string } {
    switch (phase) {
      case 'receive':
        // 接收阶段总是可以进入
        return { approved: true, reason: '接收阶段无条件进入' };
        
      case 'plan':
        // 计划阶段：L2/L3任务必须有用户确认
        if ((context.complexity === 'L2' || context.complexity === 'L3') && !context.hasUserApproval) {
          return { approved: false, reason: 'L2/L3任务需要用户确认才能进入计划阶段' };
        }
        return { approved: true, reason: '计划阶段入口条件满足' };
        
      case 'execute':
        // 实施阶段：必须有计划
        if (!context.hasPlan) {
          return { approved: false, reason: '进入实施阶段前必须有计划' };
        }
        if (context.complexity === 'L3' && !context.hasRiskAssessment) {
          return { approved: false, reason: 'L3任务进入实施阶段前必须有风险评估' };
        }
        return { approved: true, reason: '实施阶段入口条件满足' };
        
      case 'check':
        // 质量检查阶段：必须完成实施
        if (context.rollbackCount >= this.config.approval.maxRetries) {
          return { approved: false, reason: `回退次数超过限制 (${context.rollbackCount} >= ${this.config.approval.maxRetries})` };
        }
        return { approved: true, reason: '质量检查阶段入口条件满足' };
        
      case 'deliver':
        // 交付阶段：必须通过质量检查
        return { approved: true, reason: '交付阶段入口条件满足' };
        
      case 'archive':
        // 归档阶段：必须完成交付
        return { approved: true, reason: '归档阶段入口条件满足' };
        
      default:
        return { approved: false, reason: `未知阶段: ${phase}` };
    }
  }

  /**
   * 检查退出条件
   */
  private checkExitCriteria(phase: Phase, context: ApprovalContext): { approved: boolean; reason: string } {
    switch (phase) {
      case 'receive':
        // 接收阶段退出：必须明确复杂度
        if (!context.complexity) {
          return { approved: false, reason: '接收阶段退出前必须确定任务复杂度' };
        }
        return { approved: true, reason: '接收阶段退出条件满足' };
        
      case 'plan':
        // 计划阶段退出：必须有完整的计划
        if (!context.hasPlan) {
          return { approved: false, reason: '计划阶段退出前必须有完整的计划' };
        }
        return { approved: true, reason: '计划阶段退出条件满足' };
        
      case 'execute':
        // 实施阶段退出：必须完成实施工作
        return { approved: true, reason: '实施阶段退出条件满足' };
        
      case 'check':
        // 质量检查阶段退出：必须通过自检
        return { approved: true, reason: '质量检查阶段退出条件满足' };
        
      case 'deliver':
        // 交付阶段退出：记录完成
        return { approved: true, reason: '交付阶段退出条件满足' };
        
      case 'archive':
        // 归档阶段是最终阶段，不退出
        return { approved: false, reason: '归档阶段是最终阶段，不能退出' };
        
      default:
        return { approved: false, reason: `未知阶段: ${phase}` };
    }
  }

  /**
   * 确定门控决策（自动/手动）
   */
  private determineGateDecision(fromPhase: Phase, toPhase: Phase, context: ApprovalContext): { auto: boolean; reason: string } {
    const complexity = context.complexity;
    
    // L1任务：计划通过后自动通过所有后续门控（快速通道）
    if (complexity === 'L1') {
      if (fromPhase === 'receive' && toPhase === 'plan') {
        return { auto: false, reason: 'L1任务计划阶段需要审批' };
      }
      return { auto: true, reason: 'L1任务快速通道自动通过' };
    }
    
    // L2任务：计划→需审批，执行→需审批，其他自动
    if (complexity === 'L2') {
      if ((fromPhase === 'receive' && toPhase === 'plan') || 
          (fromPhase === 'plan' && toPhase === 'execute')) {
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
  private isValidPhase(phase: string): boolean {
    return this.phaseOrder.includes(phase as Phase);
  }

  /**
   * 验证阶段流转是否有效
   */
  private isValidPhaseTransition(fromPhase: Phase, toPhase: Phase): boolean {
    const fromIndex = this.phaseOrder.indexOf(fromPhase);
    const toIndex = this.phaseOrder.indexOf(toPhase);
    
    // 允许前进到下一阶段，或回退到上一阶段
    return Math.abs(toIndex - fromIndex) === 1;
  }

  /**
   * 回退机制（测试失败可回退到实施/设计）
   */
  rollbackPhase(taskId: string, currentPhase: Phase, reason: string): { success: boolean; targetPhase: Phase | null; message: string } {
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
    let targetPhase: Phase;
    let message: string;
    
    if (currentPhase === 'check') {
      // check失败可回退到execute
      targetPhase = 'execute';
      message = `质量检查失败，回退到实施阶段: ${reason}`;
    } else if (currentPhase === 'execute') {
      // 实施失败可回退到plan
      targetPhase = 'plan';
      message = `实施失败，回退到计划阶段: ${reason}`;
    } else {
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
  private logPhaseTransition(
    taskId: string,
    fromPhase: Phase,
    toPhase: Phase,
    approved: boolean,
    reason: string,
    gateDecision: 'auto' | 'manual',
    complexity: Complexity
  ): void {
    const log: PhaseTransitionLog = {
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
  getPhaseHistory(taskId: string): PhaseTransitionLog[] {
    return this.phaseTransitions.get(taskId) || [];
  }

  /**
   * 获取下一阶段
   */
  getNextPhase(currentPhase: Phase): Phase | null {
    const currentIndex = this.phaseOrder.indexOf(currentPhase);
    if (currentIndex < 0 || currentIndex >= this.phaseOrder.length - 1) {
      return null;
    }
    return this.phaseOrder[currentIndex + 1];
  }

  /**
   * 获取上一阶段
   */
  getPreviousPhase(currentPhase: Phase): Phase | null {
    const currentIndex = this.phaseOrder.indexOf(currentPhase);
    if (currentIndex <= 0) {
      return null;
    }
    return this.phaseOrder[currentIndex - 1];
  }

  /**
   * 检查是否超过3次回退
   */
  checkRollbackLimit(taskId: string, rollbackCount: number): { exceeded: boolean; message: string } {
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