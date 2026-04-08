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
export class SASEngine {
    phaseEngine;
    approvalEngine;
    watchdog;
    stateMachine;
    constructor(config) {
        this.stateMachine = new StateMachine();
        this.approvalEngine = new ApprovalEngine(config.approval);
        this.phaseEngine = new PhaseEngine(config, this.approvalEngine);
        this.watchdog = new Watchdog(config.watchdog);
    }
    /**
     * 检查阶段门是否通过
     */
    async checkGate(taskId, currentPhase, nextPhase, context) {
        return this.phaseEngine.checkGate(taskId, currentPhase, nextPhase, context);
    }
    /**
     * 记录阶段切换日志
     */
    async logPhaseTransition(transition) {
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
    async watchdogCheck() {
        return this.watchdog.check();
    }
    /**
     * 获取任务当前状态
     */
    async getTaskState(taskId) {
        return this.stateMachine.getState(taskId);
    }
}
export default SASEngine;
