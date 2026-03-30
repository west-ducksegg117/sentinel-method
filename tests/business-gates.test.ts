/**
 * Tests for Business-Outcome Quality Gates
 */
import { BusinessGates } from '../src/business-gates';
import type { ScoreInput, BusinessDomain } from '../src/business-gates';

describe('BusinessGates', () => {
  const highScores: ScoreInput = {
    security: 90,
    testing: 85,
    performance: 80,
    maintainability: 75,
    architecture: 80,
    overall: 82,
  };

  const lowScores: ScoreInput = {
    security: 40,
    testing: 30,
    performance: 35,
    maintainability: 25,
    architecture: 30,
    overall: 32,
  };

  describe('evaluate — fintech domain', () => {
    const gates = new BusinessGates({ domain: 'fintech' });

    it('should pass all gates when scores are high', () => {
      const result = gates.evaluate(highScores);
      expect(result.passed).toBe(true);
      expect(result.domain).toBe('fintech');
      expect(result.gates.every(g => g.passed)).toBe(true);
    });

    it('should fail gates when scores are below thresholds', () => {
      const result = gates.evaluate(lowScores);
      expect(result.passed).toBe(false);
      expect(result.gates.some(g => !g.passed)).toBe(true);
    });

    it('should classify severity correctly', () => {
      const result = gates.evaluate(lowScores);
      const securityGate = result.gates.find(g => g.name === 'security')!;
      // fintech security threshold = 85, score = 40 → gap = 45 → critical
      expect(securityGate.severity).toBe('critical');
    });

    it('should produce correct risk summary', () => {
      const result = gates.evaluate(lowScores);
      expect(result.riskSummary.overallRisk).toBe('critical');
      expect(result.riskSummary.incidentProbability).toBeGreaterThan(0);
      expect(result.riskSummary.estimatedBugEscapeRate).toBeGreaterThan(0);
    });

    it('should generate business impact statements', () => {
      const result = gates.evaluate(lowScores);
      expect(result.businessImpact.length).toBeGreaterThan(0);
      expect(result.businessImpact[0]).toContain('BLOCKER');
    });
  });

  describe('evaluate — healthtech domain', () => {
    const gates = new BusinessGates({ domain: 'healthtech' });

    it('should have stricter security threshold than generic', () => {
      const borderlineScores: ScoreInput = {
        security: 75, // passes generic (70), fails healthtech (90)
        testing: 85,
        performance: 80,
        maintainability: 70,
        architecture: 70,
        overall: 76,
      };
      const result = gates.evaluate(borderlineScores);
      const securityGate = result.gates.find(g => g.name === 'security')!;
      expect(securityGate.passed).toBe(false);
    });
  });

  describe('evaluate — ecommerce domain', () => {
    const gates = new BusinessGates({ domain: 'ecommerce' });

    it('should have high performance threshold', () => {
      const scores: ScoreInput = {
        security: 80,
        testing: 75,
        performance: 60, // fails ecommerce (80)
        maintainability: 70,
        architecture: 70,
        overall: 71,
      };
      const result = gates.evaluate(scores);
      const perfGate = result.gates.find(g => g.name === 'performance')!;
      expect(perfGate.passed).toBe(false);
      expect(perfGate.businessMetric).toBe('bounce rate %');
    });
  });

  describe('evaluate — all domains', () => {
    const domains: BusinessDomain[] = ['fintech', 'healthtech', 'ecommerce', 'saas', 'generic'];

    it.each(domains)('should evaluate 5 gates for %s domain', (domain) => {
      const gates = new BusinessGates({ domain });
      const result = gates.evaluate(highScores);
      expect(result.gates.length).toBe(5);
    });

    it.each(domains)('should have riskSummary for %s domain', (domain) => {
      const gates = new BusinessGates({ domain });
      const result = gates.evaluate(highScores);
      expect(result.riskSummary).toBeDefined();
      expect(['critical', 'high', 'moderate', 'low']).toContain(result.riskSummary.overallRisk);
    });
  });

  describe('severity classification', () => {
    const gates = new BusinessGates({ domain: 'generic' });

    it('should classify "low" when score meets threshold', () => {
      const result = gates.evaluate(highScores);
      const passingGates = result.gates.filter(g => g.passed);
      passingGates.forEach(g => expect(g.severity).toBe('low'));
    });

    it('should classify "medium" for gaps ≤ 10', () => {
      const scores: ScoreInput = {
        security: 65, // generic threshold 70 → gap 5 → medium
        testing: 55, // generic threshold 60 → gap 5 → medium
        performance: 55,
        maintainability: 50,
        architecture: 50,
        overall: 55,
      };
      const result = gates.evaluate(scores);
      const secGate = result.gates.find(g => g.name === 'security')!;
      expect(secGate.severity).toBe('medium');
    });
  });

  describe('projected impact', () => {
    const gates = new BusinessGates({ domain: 'generic' });

    it('should show "On track" for passing gates', () => {
      const result = gates.evaluate(highScores);
      const passing = result.gates.filter(g => g.passed);
      passing.forEach(g => expect(g.projectedImpact).toContain('On track'));
    });

    it('should project specific impacts for failing gates', () => {
      const result = gates.evaluate(lowScores);
      const secGate = result.gates.find(g => g.name === 'security')!;
      expect(secGate.projectedImpact).toContain('vulnerability exposure');
    });
  });

  describe('risk summary details', () => {
    const gates = new BusinessGates({ domain: 'generic' });

    it('should have low risk when all gates pass', () => {
      const result = gates.evaluate(highScores);
      expect(result.riskSummary.overallRisk).toBe('low');
      expect(result.riskSummary.costOfDelay).toContain('No significant cost');
    });

    it('should project incident probability from security gap', () => {
      const result = gates.evaluate(lowScores);
      expect(result.riskSummary.incidentProbability).toBeGreaterThan(0);
      expect(result.riskSummary.incidentProbability).toBeLessThanOrEqual(1);
    });
  });

  describe('custom gate overrides', () => {
    it('should allow overriding thresholds', () => {
      const gates = new BusinessGates({
        domain: 'generic',
        gates: {
          security: {
            minScore: 99,
            businessMetric: 'custom metric',
            impactDescription: 'Custom impact',
          },
        },
      });
      const result = gates.evaluate(highScores);
      const secGate = result.gates.find(g => g.name === 'security')!;
      expect(secGate.threshold).toBe(99);
      expect(secGate.passed).toBe(false);
      expect(secGate.businessMetric).toBe('custom metric');
    });
  });
});
