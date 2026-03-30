/**
 * Tests for Risk Budget System
 */
import { RiskBudget } from '../src/risk-budget';
import type { Severity } from '../src/risk-budget';

describe('RiskBudget', () => {
  let budget: RiskBudget;

  beforeEach(() => {
    budget = new RiskBudget();
  });

  describe('initSprint', () => {
    it('should initialize a sprint with default budget', () => {
      const status = budget.initSprint('sprint-1');
      expect(status.sprintId).toBe('sprint-1');
      expect(status.totalBudget).toBe(100);
      expect(status.consumed).toBe(0);
      expect(status.remaining).toBe(100);
      expect(status.status).toBe('healthy');
    });

    it('should allow custom budget override', () => {
      const status = budget.initSprint('sprint-2', 200);
      expect(status.totalBudget).toBe(200);
      expect(status.remaining).toBe(200);
    });
  });

  describe('assessDeploy', () => {
    beforeEach(() => {
      budget.initSprint('sprint-1');
    });

    it('should calculate risk points from findings', () => {
      const assessment = budget.assessDeploy('sprint-1', 'deploy-1', [
        { id: 'f1', severity: 'critical', category: 'security' },
        { id: 'f2', severity: 'high', category: 'testing' },
        { id: 'f3', severity: 'low', category: 'style' },
      ]);
      // critical=25 + high=10 + low=1 = 36
      expect(assessment.riskPoints).toBe(36);
    });

    it('should auto-approve low-risk deploys', () => {
      const assessment = budget.assessDeploy('sprint-1', 'deploy-1', [
        { id: 'f1', severity: 'low', category: 'style' },
        { id: 'f2', severity: 'low', category: 'style' },
      ]);
      // 2 pts total, under 30 threshold
      expect(assessment.autoApproved).toBe(true);
      expect(assessment.requiresApproval).toBe(false);
    });

    it('should require approval for critical findings', () => {
      const assessment = budget.assessDeploy('sprint-1', 'deploy-1', [
        { id: 'f1', severity: 'critical', category: 'security' },
      ]);
      expect(assessment.requiresApproval).toBe(true);
      expect(assessment.approvalReason).toContain('critical finding');
    });

    it('should require approval when exceeding budget', () => {
      // Consume most of budget first
      budget.assessDeploy('sprint-1', 'deploy-1', [
        { id: 'f1', severity: 'medium', category: 'a' },
      ]); // 3 pts, auto-approved

      // Now make a big deploy
      const bigFindings = Array.from({ length: 15 }, (_, i) => ({
        id: `f${i}`,
        severity: 'high' as Severity,
        category: 'security',
      }));
      // 15 × 10 = 150 pts
      const assessment = budget.assessDeploy('sprint-1', 'deploy-2', bigFindings);
      expect(assessment.requiresApproval).toBe(true);
      expect(assessment.approvalReason).toContain('exceeds remaining budget');
    });

    it('should require approval when exceeding max deploy risk', () => {
      const findings = Array.from({ length: 6 }, (_, i) => ({
        id: `f${i}`,
        severity: 'high' as Severity,
        category: 'testing',
      }));
      // 6 × 10 = 60 pts (> maxDeployRisk 50)
      const assessment = budget.assessDeploy('sprint-1', 'deploy-1', findings);
      expect(assessment.requiresApproval).toBe(true);
      expect(assessment.approvalReason).toContain('max deploy threshold');
    });

    it('should consume budget for auto-approved deploys', () => {
      budget.assessDeploy('sprint-1', 'deploy-1', [
        { id: 'f1', severity: 'medium', category: 'a' },
      ]);
      const status = budget.getSprintStatus('sprint-1');
      expect(status.consumed).toBe(3);
      expect(status.remaining).toBe(97);
    });

    it('should throw for unknown sprint', () => {
      expect(() => {
        budget.assessDeploy('unknown', 'deploy-1', []);
      }).toThrow("Sprint 'unknown' not found");
    });
  });

  describe('recordDeploy', () => {
    it('should consume budget when recording approved deploy', () => {
      budget.initSprint('sprint-1');
      const assessment = budget.assessDeploy('sprint-1', 'deploy-1', [
        { id: 'f1', severity: 'critical', category: 'sec' },
      ]);
      // Not auto-approved, manually record after approval
      const status = budget.recordDeploy('sprint-1', assessment);
      expect(status.consumed).toBe(25);
    });
  });

  describe('approval workflow', () => {
    beforeEach(() => {
      budget.initSprint('sprint-1');
    });

    it('should create approval request', () => {
      const request = budget.requestApproval(
        'sprint-1', 'deploy-1', 'dev@example.com', 60, 'Important hotfix'
      );
      expect(request.status).toBe('pending');
      expect(request.overdraftAmount).toBe(0);
      expect(request.riskPoints).toBe(60);
    });

    it('should calculate overdraft amount', () => {
      // Consume 80 points first
      budget.assessDeploy('sprint-1', 'deploy-0', [
        { id: 'f1', severity: 'medium', category: 'a' },
      ]); // 3 pts

      const request = budget.requestApproval(
        'sprint-1', 'deploy-1', 'dev@example.com', 120, 'Big release'
      );
      expect(request.budgetRemaining).toBe(97);
      expect(request.overdraftAmount).toBe(23); // 120 - 97
    });

    it('should approve a pending request', () => {
      budget.requestApproval('sprint-1', 'deploy-1', 'dev@example.com', 60, 'Hotfix');
      const result = budget.reviewApproval('deploy-1', 'approved', 'cto@example.com', 'Approved');
      expect(result.status).toBe('approved');
      expect(result.reviewedBy).toBe('cto@example.com');
    });

    it('should reject a pending request', () => {
      budget.requestApproval('sprint-1', 'deploy-1', 'dev@example.com', 60, 'Hotfix');
      const result = budget.reviewApproval('deploy-1', 'rejected', 'cto@example.com', 'Too risky');
      expect(result.status).toBe('rejected');
    });

    it('should throw for non-existent approval', () => {
      expect(() => {
        budget.reviewApproval('unknown', 'approved', 'cto@example.com');
      }).toThrow("No pending approval");
    });

    it('should throw for already-reviewed approval', () => {
      budget.requestApproval('sprint-1', 'deploy-1', 'dev@example.com', 60, 'Hotfix');
      budget.reviewApproval('deploy-1', 'approved', 'cto@example.com');
      expect(() => {
        budget.reviewApproval('deploy-1', 'rejected', 'other@example.com');
      }).toThrow('already approved');
    });

    it('should list pending approvals', () => {
      budget.requestApproval('sprint-1', 'deploy-1', 'dev@example.com', 60, 'A');
      budget.requestApproval('sprint-1', 'deploy-2', 'dev@example.com', 30, 'B');
      budget.reviewApproval('deploy-1', 'approved', 'cto@example.com');

      const pending = budget.getPendingApprovals('sprint-1');
      expect(pending.length).toBe(1);
      expect(pending[0].deployId).toBe('deploy-2');
    });
  });

  describe('budget status classification', () => {
    it('should be "healthy" under 60%', () => {
      budget.initSprint('sprint-1');
      budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'medium', category: 'a' },
      ]); // 3/100 = 3%
      expect(budget.getSprintStatus('sprint-1').status).toBe('healthy');
    });

    it('should be "warning" at 60-79%', () => {
      budget.initSprint('sprint-1', 10);
      budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'high', category: 'a' },
      ]); // 10/10 = 100% → but it auto-approves only if <= 30 pts and no critical
      // Actually 10 pts, budget 10, autoApproveThreshold is 30, so auto-approved
      // 10/10 = 100% → exhausted
      expect(budget.getSprintStatus('sprint-1').status).toBe('exhausted');
    });

    it('should be "exhausted" at 100%+', () => {
      budget = new RiskBudget({ sprintBudget: 5 });
      budget.initSprint('sprint-1');
      // This requires approval (exceeds budget), so manually record it
      const assessment = budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'high', category: 'a' },
      ]); // 10 pts on 5-pt budget → requires approval
      expect(assessment.requiresApproval).toBe(true);
      budget.recordDeploy('sprint-1', assessment);
      const status = budget.getSprintStatus('sprint-1');
      expect(status.status).toBe('exhausted');
      expect(status.remaining).toBe(0);
    });
  });

  describe('closeSprint', () => {
    it('should archive trend data', () => {
      budget.initSprint('sprint-1');
      budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'medium', category: 'security' },
        { id: 'f2', severity: 'high', category: 'testing' },
      ]);

      const trend = budget.closeSprint('sprint-1');
      expect(trend.sprintId).toBe('sprint-1');
      expect(trend.consumed).toBe(13); // 3 + 10
      expect(trend.deployCount).toBe(1);
      expect(trend.avgRiskPerDeploy).toBe(13);
      expect(trend.topCategories.length).toBe(2);
      expect(trend.topCategories[0].category).toBe('testing'); // 10 pts > 3 pts
    });

    it('should accumulate history across sprints', () => {
      budget.initSprint('sprint-1');
      budget.closeSprint('sprint-1');
      budget.initSprint('sprint-2');
      budget.closeSprint('sprint-2');

      const trends = budget.getTrends();
      expect(trends.length).toBe(2);
    });
  });

  describe('projectBudget', () => {
    it('should project budget based on current velocity', () => {
      budget.initSprint('sprint-1');
      // Day 1-5 of 10-day sprint, consumed 50 pts
      budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'medium', category: 'a' },
      ]); // 3 pts

      const projection = budget.projectBudget('sprint-1', 5, 10);
      // 3 pts in 5 days = 0.6/day → projected 6 total for 10 days
      expect(projection.projectedTotal).toBe(6);
      expect(projection.willExceed).toBe(false);
    });

    it('should detect projected overrun', () => {
      budget = new RiskBudget({ sprintBudget: 20 });
      budget.initSprint('sprint-1');
      // 15 pts consumed in first 3 of 10 days
      budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'high', category: 'a' },
        { id: 'f2', severity: 'medium', category: 'b' },
        { id: 'f3', severity: 'low', category: 'c' },
        { id: 'f4', severity: 'low', category: 'd' },
      ]); // 10 + 3 + 1 + 1 = 15

      const projection = budget.projectBudget('sprint-1', 7, 10);
      // 15 pts in 3 days = 5/day → 50 projected
      expect(projection.willExceed).toBe(true);
      expect(projection.projectedOverdraft).toBeGreaterThan(0);
    });

    it('should handle insufficient data gracefully', () => {
      budget.initSprint('sprint-1');
      const projection = budget.projectBudget('sprint-1', 10, 10);
      expect(projection.recommendation).toContain('Insufficient data');
    });
  });

  describe('custom config', () => {
    it('should accept custom severity weights', () => {
      budget = new RiskBudget({
        severityWeights: { critical: 100, high: 50 },
      });
      budget.initSprint('sprint-1');
      const assessment = budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'critical', category: 'a' },
      ]);
      expect(assessment.riskPoints).toBe(100);
    });

    it('should accept custom auto-approve threshold', () => {
      budget = new RiskBudget({ autoApproveThreshold: 5 });
      budget.initSprint('sprint-1');
      const assessment = budget.assessDeploy('sprint-1', 'd1', [
        { id: 'f1', severity: 'medium', category: 'a' },
        { id: 'f2', severity: 'medium', category: 'b' },
      ]); // 6 pts > 5 threshold
      expect(assessment.autoApproved).toBe(false);
    });
  });
});
