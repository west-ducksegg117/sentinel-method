/**
 * Risk Budget System — Sprint-level risk accounting for deployments
 *
 * Every deploy consumes risk points based on findings severity.
 * Each sprint has a total risk budget. When the budget is exhausted,
 * an approval workflow is triggered requiring explicit sign-off.
 *
 * Risk Points per severity:
 *   - critical: 25 pts
 *   - high: 10 pts
 *   - medium: 3 pts
 *   - low: 1 pt
 *   - info: 0 pts
 *
 * Default sprint budget: 100 points
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface RiskBudgetConfig {
  /** Total risk points allowed per sprint (default: 100) */
  sprintBudget: number;
  /** Points per severity level */
  severityWeights?: Partial<Record<Severity, number>>;
  /** Auto-approve deploys under this threshold (default: 30) */
  autoApproveThreshold?: number;
  /** Maximum risk points a single deploy can consume (default: 50) */
  maxDeployRisk?: number;
  /** Roles allowed to approve over-budget deploys */
  approverRoles?: string[];
}

export interface DeployRiskAssessment {
  deployId: string;
  timestamp: string;
  findings: FindingSummary[];
  riskPoints: number;
  autoApproved: boolean;
  requiresApproval: boolean;
  approvalReason?: string;
}

export interface FindingSummary {
  id: string;
  severity: Severity;
  category: string;
  riskPoints: number;
}

export interface SprintBudgetStatus {
  sprintId: string;
  totalBudget: number;
  consumed: number;
  remaining: number;
  utilizationPercent: number;
  deploys: DeployRiskAssessment[];
  status: "healthy" | "warning" | "critical" | "exhausted";
  projectedOverrun: boolean;
}

export interface ApprovalRequest {
  deployId: string;
  sprintId: string;
  requestedBy: string;
  requestedAt: string;
  riskPoints: number;
  budgetRemaining: number;
  overdraftAmount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface RiskTrend {
  sprintId: string;
  consumed: number;
  budget: number;
  deployCount: number;
  avgRiskPerDeploy: number;
  topCategories: { category: string; points: number }[];
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 25,
  high: 10,
  medium: 3,
  low: 1,
  info: 0,
};

const DEFAULT_CONFIG: Required<RiskBudgetConfig> = {
  sprintBudget: 100,
  severityWeights: DEFAULT_SEVERITY_WEIGHTS,
  autoApproveThreshold: 30,
  maxDeployRisk: 50,
  approverRoles: ["tech-lead", "cto", "security-lead"],
};

// ═══════════════════════════════════════════════════════════════
// RISK BUDGET ENGINE
// ═══════════════════════════════════════════════════════════════

export class RiskBudget {
  private config: Required<RiskBudgetConfig>;
  private sprints: Map<string, SprintBudgetStatus> = new Map();
  private approvalQueue: Map<string, ApprovalRequest> = new Map();
  private history: RiskTrend[] = [];

  constructor(config?: Partial<RiskBudgetConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      severityWeights: {
        ...DEFAULT_SEVERITY_WEIGHTS,
        ...config?.severityWeights,
      },
    };
  }

  /**
   * Initialize a new sprint budget period.
   */
  initSprint(sprintId: string, budgetOverride?: number): SprintBudgetStatus {
    const budget = budgetOverride ?? this.config.sprintBudget;
    const status: SprintBudgetStatus = {
      sprintId,
      totalBudget: budget,
      consumed: 0,
      remaining: budget,
      utilizationPercent: 0,
      deploys: [],
      status: "healthy",
      projectedOverrun: false,
    };
    this.sprints.set(sprintId, status);
    return status;
  }

  /**
   * Assess a deployment's risk cost against the sprint budget.
   */
  assessDeploy(
    sprintId: string,
    deployId: string,
    findings: { id: string; severity: Severity; category: string }[],
  ): DeployRiskAssessment {
    const sprint = this.getSprint(sprintId);
    const weights = this.config.severityWeights as Record<Severity, number>;

    // Calculate risk points per finding
    const findingSummaries: FindingSummary[] = findings.map(f => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      riskPoints: weights[f.severity] ?? 0,
    }));

    const totalRisk = findingSummaries.reduce((sum, f) => sum + f.riskPoints, 0);

    // Determine approval requirements
    const exceedsBudget = totalRisk > sprint.remaining;
    const exceedsMaxDeploy = totalRisk > this.config.maxDeployRisk;
    const hasCritical = findings.some(f => f.severity === "critical");
    const isLowRisk = totalRisk <= this.config.autoApproveThreshold && !hasCritical;

    let requiresApproval = false;
    let approvalReason: string | undefined;

    if (exceedsBudget) {
      requiresApproval = true;
      approvalReason = `Deploy risk (${totalRisk} pts) exceeds remaining budget (${sprint.remaining} pts)`;
    } else if (exceedsMaxDeploy) {
      requiresApproval = true;
      approvalReason = `Deploy risk (${totalRisk} pts) exceeds max deploy threshold (${this.config.maxDeployRisk} pts)`;
    } else if (hasCritical) {
      requiresApproval = true;
      approvalReason = `Deploy contains ${findings.filter(f => f.severity === "critical").length} critical finding(s)`;
    }

    const assessment: DeployRiskAssessment = {
      deployId,
      timestamp: new Date().toISOString(),
      findings: findingSummaries,
      riskPoints: totalRisk,
      autoApproved: isLowRisk && !requiresApproval,
      requiresApproval,
      approvalReason,
    };

    // Auto-approve low-risk deploys and consume budget
    if (assessment.autoApproved) {
      this.consumeBudget(sprint, assessment);
    }

    return assessment;
  }

  /**
   * Record an approved deploy, consuming the sprint budget.
   */
  recordDeploy(sprintId: string, assessment: DeployRiskAssessment): SprintBudgetStatus {
    const sprint = this.getSprint(sprintId);
    this.consumeBudget(sprint, assessment);
    return { ...sprint };
  }

  /**
   * Request approval for an over-budget deploy.
   */
  requestApproval(
    sprintId: string,
    deployId: string,
    requestedBy: string,
    riskPoints: number,
    reason: string,
  ): ApprovalRequest {
    const sprint = this.getSprint(sprintId);
    const overdraft = Math.max(0, riskPoints - sprint.remaining);

    const request: ApprovalRequest = {
      deployId,
      sprintId,
      requestedBy,
      requestedAt: new Date().toISOString(),
      riskPoints,
      budgetRemaining: sprint.remaining,
      overdraftAmount: overdraft,
      reason,
      status: "pending",
    };

    this.approvalQueue.set(deployId, request);
    return request;
  }

  /**
   * Review (approve/reject) an approval request.
   */
  reviewApproval(
    deployId: string,
    decision: "approved" | "rejected",
    reviewedBy: string,
    notes?: string,
  ): ApprovalRequest {
    const request = this.approvalQueue.get(deployId);
    if (!request) {
      throw new Error(`No pending approval for deploy '${deployId}'`);
    }
    if (request.status !== "pending") {
      throw new Error(`Approval for '${deployId}' already ${request.status}`);
    }

    request.status = decision;
    request.reviewedBy = reviewedBy;
    request.reviewedAt = new Date().toISOString();
    request.reviewNotes = notes;

    return { ...request };
  }

  /**
   * Get current sprint budget status.
   */
  getSprintStatus(sprintId: string): SprintBudgetStatus {
    return { ...this.getSprint(sprintId) };
  }

  /**
   * Get all pending approval requests for a sprint.
   */
  getPendingApprovals(sprintId?: string): ApprovalRequest[] {
    const pending = Array.from(this.approvalQueue.values())
      .filter(r => r.status === "pending");
    if (sprintId) {
      return pending.filter(r => r.sprintId === sprintId);
    }
    return pending;
  }

  /**
   * Close a sprint and archive its trend data.
   */
  closeSprint(sprintId: string): RiskTrend {
    const sprint = this.getSprint(sprintId);

    // Calculate top risk categories
    const categoryPoints = new Map<string, number>();
    for (const deploy of sprint.deploys) {
      for (const finding of deploy.findings) {
        const current = categoryPoints.get(finding.category) ?? 0;
        categoryPoints.set(finding.category, current + finding.riskPoints);
      }
    }

    const topCategories = Array.from(categoryPoints.entries())
      .map(([category, points]) => ({ category, points }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);

    const trend: RiskTrend = {
      sprintId,
      consumed: sprint.consumed,
      budget: sprint.totalBudget,
      deployCount: sprint.deploys.length,
      avgRiskPerDeploy: sprint.deploys.length > 0
        ? Math.round(sprint.consumed / sprint.deploys.length)
        : 0,
      topCategories,
    };

    this.history.push(trend);
    return trend;
  }

  /**
   * Get historical risk trends across sprints.
   */
  getTrends(): RiskTrend[] {
    return [...this.history];
  }

  /**
   * Project whether the current sprint will exceed its budget
   * based on current velocity.
   */
  projectBudget(sprintId: string, remainingDays: number, totalSprintDays: number): {
    projectedTotal: number;
    willExceed: boolean;
    projectedOverdraft: number;
    recommendation: string;
  } {
    const sprint = this.getSprint(sprintId);
    const elapsedDays = totalSprintDays - remainingDays;

    if (elapsedDays <= 0 || sprint.deploys.length === 0) {
      return {
        projectedTotal: sprint.consumed,
        willExceed: false,
        projectedOverdraft: 0,
        recommendation: "Insufficient data for projection",
      };
    }

    const dailyRate = sprint.consumed / elapsedDays;
    const projectedTotal = Math.round(dailyRate * totalSprintDays);
    const willExceed = projectedTotal > sprint.totalBudget;
    const projectedOverdraft = Math.max(0, projectedTotal - sprint.totalBudget);

    let recommendation: string;
    if (!willExceed) {
      recommendation = "On track — budget sufficient for projected deploys";
    } else if (projectedOverdraft <= sprint.totalBudget * 0.2) {
      recommendation = "Moderate risk — consider deferring non-critical deploys";
    } else {
      recommendation = "High risk — pause non-essential deploys, prioritize remediation";
    }

    // Update sprint projection flag
    sprint.projectedOverrun = willExceed;

    return { projectedTotal, willExceed, projectedOverdraft, recommendation };
  }

  // ─── Private ────────────────────────────────────────────────

  private getSprint(sprintId: string): SprintBudgetStatus {
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint '${sprintId}' not found. Call initSprint() first.`);
    }
    return sprint;
  }

  private consumeBudget(sprint: SprintBudgetStatus, assessment: DeployRiskAssessment): void {
    sprint.consumed += assessment.riskPoints;
    sprint.remaining = Math.max(0, sprint.totalBudget - sprint.consumed);
    sprint.utilizationPercent = Math.round((sprint.consumed / sprint.totalBudget) * 100);
    sprint.deploys.push(assessment);
    sprint.status = this.classifyBudgetStatus(sprint);
  }

  private classifyBudgetStatus(sprint: SprintBudgetStatus): SprintBudgetStatus["status"] {
    const utilization = sprint.consumed / sprint.totalBudget;
    if (utilization >= 1.0) return "exhausted";
    if (utilization >= 0.8) return "critical";
    if (utilization >= 0.6) return "warning";
    return "healthy";
  }
}
