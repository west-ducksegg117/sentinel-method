/**
 * Business-Outcome Quality Gates
 *
 * Maps technical scores to business metrics:
 *   - Security score → predicted incidents/quarter
 *   - Testing score → estimated bug escape rate
 *   - Performance score → latency impact
 *   - Maintainability → team velocity impact
 *
 * Gates use dynamic thresholds based on domain context.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type BusinessDomain = "fintech" | "healthtech" | "ecommerce" | "saas" | "generic";

export interface BusinessGateConfig {
  domain: BusinessDomain;
  /** Custom gate overrides */
  gates?: Partial<Record<string, BusinessGateThreshold>>;
}

export interface BusinessGateThreshold {
  minScore: number;
  businessMetric: string;
  impactDescription: string;
}

export interface BusinessGateResult {
  passed: boolean;
  domain: BusinessDomain;
  gates: BusinessGateEvaluation[];
  riskSummary: RiskSummary;
  businessImpact: string[];
}

export interface BusinessGateEvaluation {
  name: string;
  passed: boolean;
  score: number;
  threshold: number;
  businessMetric: string;
  projectedImpact: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface RiskSummary {
  overallRisk: "critical" | "high" | "moderate" | "low";
  incidentProbability: number;
  estimatedBugEscapeRate: number;
  velocityImpact: number;
  costOfDelay: string;
}

export interface ScoreInput {
  security: number;
  testing: number;
  performance: number;
  maintainability: number;
  architecture: number;
  overall: number;
}

// ═══════════════════════════════════════════════════════════════
// DOMAIN-SPECIFIC THRESHOLDS
// ═══════════════════════════════════════════════════════════════

const DOMAIN_THRESHOLDS: Record<BusinessDomain, Record<string, BusinessGateThreshold>> = {
  fintech: {
    security: { minScore: 85, businessMetric: "incidents/quarter", impactDescription: "Regulatory breach risk — fines up to 4% of revenue (GDPR/PCI-DSS)" },
    testing: { minScore: 80, businessMetric: "bug escape rate", impactDescription: "Financial calculation errors reaching production" },
    performance: { minScore: 70, businessMetric: "p99 latency (ms)", impactDescription: "Transaction timeout causing failed payments" },
    maintainability: { minScore: 65, businessMetric: "velocity (story points/sprint)", impactDescription: "Regulatory changes take 3x longer to implement" },
    architecture: { minScore: 70, businessMetric: "change failure rate", impactDescription: "Deployments breaking downstream financial systems" },
  },
  healthtech: {
    security: { minScore: 90, businessMetric: "PHI exposure risk", impactDescription: "HIPAA violation — fines up to $1.9M per incident" },
    testing: { minScore: 85, businessMetric: "defect density", impactDescription: "Patient data integrity risk" },
    performance: { minScore: 60, businessMetric: "availability %", impactDescription: "System downtime during critical care windows" },
    maintainability: { minScore: 60, businessMetric: "MTTR (hours)", impactDescription: "Slow response to security patches" },
    architecture: { minScore: 65, businessMetric: "compliance score", impactDescription: "Audit findings delaying certification" },
  },
  ecommerce: {
    security: { minScore: 75, businessMetric: "fraud rate %", impactDescription: "Payment fraud and chargebacks" },
    testing: { minScore: 70, businessMetric: "conversion impact %", impactDescription: "Checkout bugs losing revenue" },
    performance: { minScore: 80, businessMetric: "bounce rate %", impactDescription: "Every 100ms latency = 1% conversion loss" },
    maintainability: { minScore: 60, businessMetric: "time-to-market (days)", impactDescription: "Feature releases delayed by tech debt" },
    architecture: { minScore: 65, businessMetric: "scale capacity", impactDescription: "Cannot handle peak traffic (Black Friday)" },
  },
  saas: {
    security: { minScore: 75, businessMetric: "customer churn risk", impactDescription: "Security breach = 15-25% customer churn" },
    testing: { minScore: 70, businessMetric: "NPS impact", impactDescription: "Bugs degrading user satisfaction" },
    performance: { minScore: 70, businessMetric: "SLA compliance %", impactDescription: "SLA breaches triggering credits" },
    maintainability: { minScore: 65, businessMetric: "velocity trend", impactDescription: "Feature velocity declining quarter over quarter" },
    architecture: { minScore: 60, businessMetric: "deployment frequency", impactDescription: "Architecture preventing daily deploys" },
  },
  generic: {
    security: { minScore: 70, businessMetric: "vulnerability count", impactDescription: "Known vulnerabilities in production" },
    testing: { minScore: 60, businessMetric: "defect rate", impactDescription: "Bugs reaching production" },
    performance: { minScore: 60, businessMetric: "response time (ms)", impactDescription: "Slow response time" },
    maintainability: { minScore: 55, businessMetric: "dev productivity", impactDescription: "Time spent on maintenance vs features" },
    architecture: { minScore: 55, businessMetric: "code health", impactDescription: "Technical debt accumulation" },
  },
};

// ═══════════════════════════════════════════════════════════════
// BUSINESS GATES
// ═══════════════════════════════════════════════════════════════

export class BusinessGates {
  private config: BusinessGateConfig;

  constructor(config: BusinessGateConfig) {
    this.config = config;
  }

  /**
   * Evaluate business quality gates against technical scores.
   */
  evaluate(scores: ScoreInput): BusinessGateResult {
    const thresholds = {
      ...DOMAIN_THRESHOLDS[this.config.domain],
      ...this.config.gates,
    };

    const gates: BusinessGateEvaluation[] = [];

    for (const [dimension, threshold] of Object.entries(thresholds)) {
      if (!threshold) continue;
      const score = scores[dimension as keyof ScoreInput] ?? scores.overall;
      const passed = score >= threshold.minScore;

      gates.push({
        name: dimension,
        passed,
        score,
        threshold: threshold.minScore,
        businessMetric: threshold.businessMetric,
        projectedImpact: this.projectImpact(dimension, score, threshold),
        severity: this.classifySeverity(score, threshold.minScore),
      });
    }

    const riskSummary = this.calculateRiskSummary(scores, gates);
    const businessImpact = this.generateBusinessImpact(gates, riskSummary);

    return {
      passed: gates.every(g => g.passed),
      domain: this.config.domain,
      gates,
      riskSummary,
      businessImpact,
    };
  }

  private projectImpact(dimension: string, score: number, threshold: BusinessGateThreshold): string {
    const gap = threshold.minScore - score;
    if (gap <= 0) return `On track — ${threshold.businessMetric} within targets`;

    const impact = dimension === "security"
      ? `${Math.round(gap * 0.3)} additional vulnerability exposure points`
      : dimension === "testing"
        ? `~${Math.round(gap * 0.5)}% higher bug escape rate`
        : dimension === "performance"
          ? `~${Math.round(gap * 2)}ms additional latency`
          : `${Math.round(gap * 0.4)}% reduction in team velocity`;

    return `${impact} — ${threshold.impactDescription}`;
  }

  private classifySeverity(
    score: number,
    threshold: number,
  ): BusinessGateEvaluation["severity"] {
    const gap = threshold - score;
    if (gap <= 0) return "low";
    if (gap <= 10) return "medium";
    if (gap <= 25) return "high";
    return "critical";
  }

  private calculateRiskSummary(scores: ScoreInput, gates: BusinessGateEvaluation[]): RiskSummary {
    const failedGates = gates.filter(g => !g.passed);
    const criticalFails = failedGates.filter(g => g.severity === "critical").length;
    const highFails = failedGates.filter(g => g.severity === "high").length;

    const overallRisk: RiskSummary["overallRisk"] =
      criticalFails > 0 ? "critical" :
      highFails > 1 ? "high" :
      failedGates.length > 0 ? "moderate" : "low";

    // Heuristic projections
    const securityGap = Math.max(0, 80 - scores.security);
    const incidentProbability = Math.min(1, securityGap / 100 * 1.5);

    const testingGap = Math.max(0, 70 - scores.testing);
    const bugEscapeRate = Math.round(testingGap * 0.8);

    const maintGap = Math.max(0, 65 - scores.maintainability);
    const velocityImpact = Math.round(maintGap * 0.5);

    const costOfDelay = criticalFails > 0
      ? "Immediate — deploy blocked until resolved"
      : highFails > 0
        ? "1-2 sprints of remediation before safe deployment"
        : failedGates.length > 0
          ? "Technical debt increasing — plan remediation within quarter"
          : "No significant cost — continue shipping";

    return {
      overallRisk,
      incidentProbability: Math.round(incidentProbability * 100) / 100,
      estimatedBugEscapeRate: bugEscapeRate,
      velocityImpact,
      costOfDelay,
    };
  }

  private generateBusinessImpact(
    gates: BusinessGateEvaluation[],
    risk: RiskSummary,
  ): string[] {
    const impacts: string[] = [];

    const critical = gates.filter(g => g.severity === "critical");
    if (critical.length > 0) {
      impacts.push(`BLOCKER: ${critical.map(g => g.name).join(", ")} gates failed critically — deployment not recommended`);
    }

    if (risk.incidentProbability > 0.5) {
      impacts.push(`${Math.round(risk.incidentProbability * 100)}% probability of security incident within next quarter`);
    }

    if (risk.estimatedBugEscapeRate > 10) {
      impacts.push(`~${risk.estimatedBugEscapeRate}% of defects likely escaping to production`);
    }

    if (risk.velocityImpact > 15) {
      impacts.push(`Team velocity reduced by ~${risk.velocityImpact}% due to maintenance burden`);
    }

    if (impacts.length === 0) {
      impacts.push("All business gates passed — safe to deploy");
    }

    return impacts;
  }
}
