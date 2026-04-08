/**
 * SAS Engine Plugin for OpenClaw - v1.1.0
 * Implements SAS v1.5 phase gate pipeline as OpenClaw tools
 *
 * Fixed: adapted to OpenClaw AgentTool interface
 *   - inputSchema → parameters (TSchema)
 *   - handler → execute(toolCallId, params)
 *   - added label field
 *   - returns AgentToolResult format
 */

// Engine singleton - lazy loaded inside register()
let _engine: any = null;
let _engineReady: Promise<any> | null = null;

async function getEngine(api: any): Promise<any> {
  if (_engine) return _engine;
  if (!_engineReady) {
    _engineReady = (async () => {
      try {
        const dist: any = await import('./dist/index.js');
        const SASEngine = dist.SASEngine || dist.default;
        const DEFAULT_CONFIG = {
          phaseTimeouts: {
            receive: 300000, plan: 600000, execute: 1800000,
            check: 300000, deliver: 300000, archive: 60000
          },
          watchdog: {
            pendingWarnThreshold: 1800000,
            pendingRecoverThreshold: 3600000,
            idleSnapshotThreshold: 86400000,
            idleTokenThreshold: 120000,
            idleDurationThreshold: 604800000
          },
          approval: {
            autoApproveTokenBudget: 0.2,
            autoApproveSubtaskImpact: 0.1,
            autoApproveFixTime: 3600000,
            maxRetries: 3
          },
          maintenance: { defaultRequired: false }
        };
        _engine = new (SASEngine as any)(DEFAULT_CONFIG);
        api.logger.info('[sas-engine] SASEngine initialized');
        return _engine;
      } catch (err: any) {
        api.logger.error('[sas-engine] Init failed: ' + err.message);
        return null;
      }
    })();
  }
  return _engineReady;
}

/** Helper: wrap result into AgentToolResult format */
function textResult(text: string, details?: any) {
  return { content: [{ type: 'text' as const, text }], details: details ?? null };
}

// ─── Tool parameter schemas (JSON Schema / TSchema compatible) ──────────

const CHECK_GATE_PARAMS = {
  type: 'object' as const,
  properties: {
    taskId: { type: 'string', description: 'Task ID to check gate for' },
    currentPhase: {
      type: 'string',
      enum: ['receive', 'plan', 'execute', 'check', 'deliver', 'archive'],
      description: 'Current SAS phase'
    },
    nextPhase: {
      type: 'string',
      enum: ['receive', 'plan', 'execute', 'check', 'deliver', 'archive'],
      description: 'Target phase to transition to'
    },
    context: {
      type: 'object',
      properties: {
        complexity: { type: 'string', enum: ['L1', 'L2', 'L3'] },
        hasPlan: { type: 'boolean' },
        hasRiskAssessment: { type: 'boolean' },
        tokenBudgetUsed: { type: 'number' },
        subtaskImpact: { type: 'number' }
      },
      required: ['complexity'] as const,
      description: 'Gate check context'
    }
  },
  required: ['taskId', 'currentPhase', 'nextPhase', 'context'] as const,
  additionalProperties: false
};

const LOG_TRANSITION_PARAMS = {
  type: 'object' as const,
  properties: {
    taskId: { type: 'string', description: 'Task ID' },
    from: { type: 'string', description: 'Source phase' },
    to: { type: 'string', description: 'Target phase' },
    gateDecision: { type: 'string', enum: ['auto', 'manual'], description: 'Who approved' },
    reason: { type: 'string', description: 'Transition reason' }
  },
  required: ['taskId', 'from', 'to', 'gateDecision', 'reason'] as const,
  additionalProperties: false
};

const WATCHDOG_PARAMS = {
  type: 'object' as const,
  properties: {},
  additionalProperties: false
};

const GET_TASK_STATE_PARAMS = {
  type: 'object' as const,
  properties: {
    taskId: { type: 'string', description: 'Task ID to query' }
  },
  required: ['taskId'] as const,
  additionalProperties: false
};

// ─── Plugin registration ────────────────────────────────────────────────

export async function register(api: any) {
  api.logger.info('[sas-engine] SAS Engine plugin v1.1.0 loading...');

  // Tool 1: Phase Gate Checker
  api.registerTool({
    name: 'sas_check_gate',
    label: 'SAS Phase Gate Checker',
    description: 'SAS phase gate checker — validates transitions between SAS workflow phases (receive → plan → execute → check → deliver → archive)',
    parameters: CHECK_GATE_PARAMS,
    async execute(_toolCallId: string, params: any) {
      const eng = await getEngine(api);
      if (!eng) return textResult('Engine init failed', { approved: false, reason: 'Engine not initialized', auto: false });
      try {
        const result = await eng.checkGate(params.taskId, params.currentPhase, params.nextPhase, params.context);
        return textResult(JSON.stringify(result, null, 2), result);
      } catch (e: any) {
        return textResult(`Gate check error: ${e.message}`, { approved: false, reason: e.message, auto: false });
      }
    }
  });

  // Tool 2: Phase Transition Logger
  api.registerTool({
    name: 'sas_log_transition',
    label: 'SAS Phase Transition Logger',
    description: 'Log a SAS phase transition event with gate decision and reason',
    parameters: LOG_TRANSITION_PARAMS,
    async execute(_toolCallId: string, params: any) {
      const eng = await getEngine(api);
      if (!eng) return textResult('Engine init failed', { success: false, error: 'Engine not initialized' });
      try {
        await eng.logPhaseTransition({
          taskId: params.taskId,
          from: params.from,
          to: params.to,
          gateDecision: params.gateDecision,
          reason: params.reason,
          timestamp: new Date().toISOString()
        });
        return textResult(`Transition logged: ${params.taskId} ${params.from} → ${params.to}`, { success: true });
      } catch (e: any) {
        return textResult(`Log error: ${e.message}`, { success: false, error: e.message });
      }
    }
  });

  // Tool 3: Watchdog Check
  api.registerTool({
    name: 'sas_watchdog_check',
    label: 'SAS Watchdog',
    description: 'SAS watchdog — scan all tracked tasks for stuck/abandoned/timeout conditions',
    parameters: WATCHDOG_PARAMS,
    async execute(_toolCallId: string, _params: any) {
      const eng = await getEngine(api);
      if (!eng) return textResult('Engine init failed', { warnings: [], recoveries: [] });
      try {
        const result = await eng.watchdogCheck();
        return textResult(JSON.stringify(result, null, 2), result);
      } catch (e: any) {
        return textResult(`Watchdog error: ${e.message}`, { warnings: [], recoveries: [], error: e.message });
      }
    }
  });

  // Tool 4: Get Task State
  api.registerTool({
    name: 'sas_get_task_state',
    label: 'SAS Task State',
    description: 'Get the current SAS state (phase, history, metrics) for a tracked task',
    parameters: GET_TASK_STATE_PARAMS,
    async execute(_toolCallId: string, params: any) {
      const eng = await getEngine(api);
      if (!eng) return textResult('Engine not initialized', { error: 'Engine not initialized' });
      try {
        const result = await eng.getTaskState(params.taskId);
        return textResult(JSON.stringify(result, null, 2), result);
      } catch (e: any) {
        return textResult(`State error: ${e.message}`, { error: e.message });
      }
    }
  });

  api.logger.info('[sas-engine] 4 SAS tools registered: sas_check_gate, sas_log_transition, sas_watchdog_check, sas_get_task_state');
}
