# SAS 工作准则执行引擎

> SAS v1.5 六阶段门控流水线 — OpenClaw 插件

## 概述

SAS Engine 是 SnoopyClaw 的核心任务执行引擎插件，实现了 **SAS v1.5 CEO 工作准则**的六阶段门控流水线：
- 自动审批（满足条件时）
- 阶段转换日志
- 看门狗监控（超时/阻塞检测）
- 任务状态持久化

## 六阶段定义

```
receive → plan → execute → check → deliver → archive
```

| 阶段 | 名称 | 说明 |
|------|------|------|
| `receive` | 接收任务 | 确认需求，评估复杂度（L1/L2/L3） |
| `plan` | 制定计划 | 出执行计划，用户审批后继续 |
| `execute` | 实施工作 | 执行具体任务，子 Agent 协作 |
| `check` | 质量检查 | 自检报告，强制覆盖度验证 |
| `deliver` | 交付成果 | 向用户交付，说明实际 vs 预估 |
| `archive` | 归档记忆 | 写 memory，同步 GitHub |

## 已注册工具

| 工具 | 功能 |
|------|------|
| `sas_check_gate` | 阶段门控检查 — 验证当前阶段是否能转换到下一阶段 |
| `sas_log_transition` | 记录阶段转换日志 |
| `sas_watchdog_check` | 看门狗检查 — 扫描卡住/超时的任务 |
| `sas_get_task_state` | 获取任务当前状态（阶段、历史、指标） |

## 复杂度分级

| 等级 | 判断标准 | 处理方式 |
|------|---------|---------|
| **L1** | 单步、无风险、无外部依赖 | 直接执行，快速通道（自动审批） |
| **L2** | 2-3个子Agent、4-8步、有依赖关系 | 标准 SAS 流程，需计划审批 |
| **L3** | 3+ Agent、8+步、跨系统、高风险 | 完整 CEO 模式，需详细方案审批 |

## 快速开始

### 安装

插件已注册到 OpenClaw：
```json
// ~/.openclaw/openclaw.json
{
  "plugins": {
    "allow": ["sas-engine"],
    "load": { "paths": ["/home/openclaw/.openclaw/extensions/sas-engine"] },
    "entries": {
      "sas-engine": { "enabled": true }
    }
  }
}
```

### 编译

```bash
cd /home/openclaw/.openclaw/extensions/sas-engine
npm install
npm run build
```

### 重启 OpenClaw Gateway

```bash
~/clawd/scripts/safe-gateway-restart.sh "sas-engine 安装后加载"
```

## 使用示例

### 阶段门控检查

```json
{
  "taskId": "project-alpha-001",
  "currentPhase": "receive",
  "nextPhase": "plan",
  "context": {
    "complexity": "L2",
    "hasPlan": true,
    "hasRiskAssessment": true,
    "estimatedTokens": 5000
  }
}
```

**返回示例：**
```json
{
  "approved": true,
  "reason": "自动审批通过",
  "auto": true
}
```

### 看门狗检查

```json
// 调用 sas_watchdog_check（无参数）
```

**返回示例：**
```json
{
  "warnings": [
    { "taskId": "stuck-001", "reason": "任务超过 30 分钟无进展" }
  ],
  "recoveries": [
    { "taskId": "recovered-001", "action": "已自动恢复阻塞的任务" }
  ]
}
```

## 架构

```
src/
├── index.ts          # 插件入口，SASEngine 类导出
├── phase-engine.ts   # 六阶段门控引擎（核心）
├── approval-engine.ts # 自动审批逻辑
├── watchdog.ts       # 看门狗监控
└── state-machine.ts  # 任务状态持久化

dist/                 # 编译产物（TypeScript → JavaScript）
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `PhaseEngine` | 阶段顺序验证、门控检查、Entry/Exit Criteria |
| `ApprovalEngine` | 自动审批规则（Token预算、影响范围、修复时间） |
| `Watchdog` | 超时警告、阻塞恢复、空闲快照 |
| `StateMachine` | 任务状态读写、日志持久化 |

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v1.0.0 | 2026-04-08 | **修复：阶段名升级到 SAS v1.5**（receive/plan/execute/check/deliver/archive） |
| v1.0.0-beta.1 | 2026-04-02 | 初始版本，六阶段门控引擎 + 看门狗 + 状态机 |

## 源码目录

- 插件目录：`/home/openclaw/.openclaw/extensions/sas-engine/`
- GitHub：`https://github.com/terlivy/SAS-plug-in`

## 相关项目

| 仓库 | 内容 |
|------|------|
| [SAS](https://github.com/terlivy/SAS) | SAS 工作准则文档体系 |
| [SAS-script](https://github.com/terlivy/SAS-script) | 自动化脚本 |
| [snoopyclaw-skills](https://github.com/terlivy/snoopyclaw-skills) | Skills 资产 |

---

*由 SAS Bot 自动维护（最后更新：2026-04-08）*
