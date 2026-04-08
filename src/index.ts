/**
 * SAS Engine - SAS工作准则执行引擎
 * 实现 SAS v1.5 六阶段门控流水线、自动审批、看门狗监控
 * @version 1.0.0
 * @sas_version 1.5
 */

import { PhaseEngine } from './phase-engine';
import { ApprovalEngine } from './approval-engine';
import { Watchdog } from './watchdog';
import { StateMachine } from './state-machine';

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

export class SASEngine {
  private phaseEngine: PhaseEngine;
  private approvalEngine: ApprovalEngine;
  private watchdog: Watchdog;
  private stateMachine: StateMachine;

  constructor(config: SASConfig) {
    this.stateMachine = new StateMachine();
    this.approvalEngine = new ApprovalEngine(config.approval);
    this.phaseEngine = new PhaseEngine(config, this.approvalEngine);
    this.watchdog = new Watchdog(config.watchdog);
  }

  /**
   * 检查阶段门是否通过
   */
  async checkGate(
    taskId: string,
    currentPhase: string,
    nextPhase: string,
    context: Record<string, any>
  ): Promise<{ approved: boolean; reason: string; auto: boolean }> {
    return this.phaseEngine.checkGate(taskId, currentPhase, nextPhase, context);
  }

  /**
   * 记录阶段切换日志
   */
  async logPhaseTransition(transition: PhaseTransition): Promise<void> {
    const logEntry = [
      `phase: ${transition.from} -> ${transition.to}`,
      `gate_decision: ${transition.gateDecision}`,
      `reason: ${transition.reason}`,
      `task_id: ${transition.taskId}`,
      `timestamp: ${transition.timestamp}`
    ].join('\n');
    
    await this.stateMachine.log(transition.taskId, logEntry);
  }

  /**
   * 看门狗检查
   */
  async watchdogCheck(): Promise<{
    warnings: Array<{ taskId: string; reason: string }>;
    recoveries: Array<{ taskId: string; action: string }>;
  }> {
    return this.watchdog.check();
  }

  /**
   * 获取任务当前状态
   */
  async getTaskState(taskId: string) {
    return this.stateMachine.getState(taskId);
  }
}

export default SASEngine;
