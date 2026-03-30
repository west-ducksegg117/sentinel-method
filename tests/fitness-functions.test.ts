/**
 * Tests for Architecture Fitness Functions
 */
import { FitnessEngine } from '../src/fitness-functions';
import type { FitnessInput, FitnessFunctionRule, DependencyEdge } from '../src/fitness-functions';

describe('FitnessEngine', () => {
  // ─── Helpers ──────────────────────────────────────────────
  function makeInput(overrides?: Partial<FitnessInput>): FitnessInput {
    return {
      files: [
        { path: 'src/service.ts', lines: 200, maxComplexity: 8, exports: 5, imports: ['src/repo.ts'], layer: 'service' },
        { path: 'src/repo.ts', lines: 100, maxComplexity: 4, exports: 3, imports: [], layer: 'data' },
        { path: 'src/controller.ts', lines: 150, maxComplexity: 6, exports: 10, imports: ['src/service.ts'], layer: 'presentation' },
      ],
      dependencies: [
        { from: 'src/controller.ts', to: 'src/service.ts' },
        { from: 'src/service.ts', to: 'src/repo.ts' },
      ],
      coverage: [
        { module: 'src/service.ts', lineCoverage: 85, branchCoverage: 75 },
        { module: 'src/repo.ts', lineCoverage: 92, branchCoverage: 88 },
      ],
      performanceMetrics: [
        { endpoint: '/api/users', p99: 120 },
        { endpoint: '/api/orders', p99: 450 },
      ],
      ...overrides,
    };
  }

  function makeRule(type: FitnessFunctionRule['type'], params: Record<string, unknown>, severity: 'error' | 'warning' = 'error'): FitnessFunctionRule {
    return { type, params, severity };
  }

  // ─── maxFileLines ─────────────────────────────────────────

  describe('maxFileLines', () => {
    it('should pass when all files are within limit', () => {
      const engine = new FitnessEngine([makeRule('maxFileLines', { max: 500 })]);
      const report = engine.evaluate(makeInput());
      expect(report.overallPassed).toBe(true);
      expect(report.evaluations[0].passed).toBe(true);
    });

    it('should fail when file exceeds limit', () => {
      const engine = new FitnessEngine([makeRule('maxFileLines', { max: 100 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
      expect(report.evaluations[0].violations.length).toBe(2); // service.ts=200, controller.ts=150
    });
  });

  // ─── maxCyclomaticComplexity ──────────────────────────────

  describe('maxCyclomaticComplexity', () => {
    it('should pass when complexity is within threshold', () => {
      const engine = new FitnessEngine([makeRule('maxCyclomaticComplexity', { max: 15 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });

    it('should fail when complexity exceeds threshold', () => {
      const engine = new FitnessEngine([makeRule('maxCyclomaticComplexity', { max: 5 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
      const violations = report.evaluations[0].violations;
      expect(violations.some(v => v.file === 'src/service.ts')).toBe(true); // complexity 8
      expect(violations.some(v => v.file === 'src/controller.ts')).toBe(true); // complexity 6
    });
  });

  // ─── noCyclicDependencies ─────────────────────────────────

  describe('noCyclicDependencies', () => {
    it('should pass for acyclic graph', () => {
      const engine = new FitnessEngine([makeRule('noCyclicDependencies', {})]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });

    it('should detect cycles', () => {
      const engine = new FitnessEngine([makeRule('noCyclicDependencies', {})]);
      const input = makeInput({
        dependencies: [
          { from: 'a.ts', to: 'b.ts' },
          { from: 'b.ts', to: 'c.ts' },
          { from: 'c.ts', to: 'a.ts' }, // cycle!
        ],
      });
      const report = engine.evaluate(input);
      expect(report.evaluations[0].passed).toBe(false);
      expect(report.evaluations[0].violations[0].message).toContain('Cyclic');
    });
  });

  // ─── layerEnforcement ─────────────────────────────────────

  describe('layerEnforcement', () => {
    it('should detect forbidden layer imports', () => {
      const engine = new FitnessEngine([
        makeRule('layerEnforcement', {
          forbidden: [{ from: 'data', to: 'presentation' }],
        }),
      ]);
      const input = makeInput({
        files: [
          { path: 'src/repo.ts', lines: 100, maxComplexity: 4, exports: 3, imports: ['src/controller.ts'], layer: 'data' },
          { path: 'src/controller.ts', lines: 150, maxComplexity: 6, exports: 10, imports: [], layer: 'presentation' },
        ],
      });
      const report = engine.evaluate(input);
      expect(report.evaluations[0].passed).toBe(false);
      expect(report.evaluations[0].violations[0].message).toContain("'data' cannot import from 'presentation'");
    });

    it('should pass for valid layer dependencies', () => {
      const engine = new FitnessEngine([
        makeRule('layerEnforcement', {
          forbidden: [{ from: 'data', to: 'presentation' }],
        }),
      ]);
      const report = engine.evaluate(makeInput()); // data (repo) doesn't import presentation
      expect(report.evaluations[0].passed).toBe(true);
    });
  });

  // ─── maxCoupling ──────────────────────────────────────────

  describe('maxCoupling', () => {
    it('should detect high afferent coupling', () => {
      const deps: DependencyEdge[] = Array.from({ length: 12 }, (_, i) => ({
        from: `module-${i}.ts`,
        to: 'shared/utils.ts',
      }));
      const engine = new FitnessEngine([makeRule('maxCoupling', { maxAfferent: 10 })]);
      const input = makeInput({ dependencies: deps });
      const report = engine.evaluate(input);
      expect(report.evaluations[0].passed).toBe(false);
      expect(report.evaluations[0].violations[0].message).toContain('Afferent coupling 12');
    });

    it('should pass within limits', () => {
      const engine = new FitnessEngine([makeRule('maxCoupling', { maxAfferent: 10, maxEfferent: 10 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });
  });

  // ─── testCoverageFloor ────────────────────────────────────

  describe('testCoverageFloor', () => {
    it('should pass when coverage meets floor', () => {
      const engine = new FitnessEngine([makeRule('testCoverageFloor', { minLineCoverage: 80, minBranchCoverage: 70 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });

    it('should fail when coverage is below floor', () => {
      const engine = new FitnessEngine([makeRule('testCoverageFloor', { minLineCoverage: 95, minBranchCoverage: 90 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
    });
  });

  // ─── dependencyBan ────────────────────────────────────────

  describe('dependencyBan', () => {
    it('should detect banned dependencies', () => {
      const engine = new FitnessEngine([makeRule('dependencyBan', { banned: ['src/repo.ts'] })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
      expect(report.evaluations[0].violations[0].file).toBe('src/service.ts');
    });

    it('should pass when no banned deps found', () => {
      const engine = new FitnessEngine([makeRule('dependencyBan', { banned: ['lodash'] })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });
  });

  // ─── maxPublicApi ─────────────────────────────────────────

  describe('maxPublicApi', () => {
    it('should fail when exports exceed max', () => {
      const engine = new FitnessEngine([makeRule('maxPublicApi', { max: 4 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
      // service.ts has 5 exports, controller.ts has 10
      expect(report.evaluations[0].violations.length).toBe(2);
    });
  });

  // ─── responseTimeP99 ──────────────────────────────────────

  describe('responseTimeP99', () => {
    it('should pass when all endpoints meet SLA', () => {
      const engine = new FitnessEngine([makeRule('responseTimeP99', { maxMs: 500 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });

    it('should fail when endpoint exceeds SLA', () => {
      const engine = new FitnessEngine([makeRule('responseTimeP99', { maxMs: 100 })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
      expect(report.evaluations[0].violations.length).toBe(2); // /api/users at 120ms and /api/orders at 450ms
    });
  });

  // ─── namingConvention ─────────────────────────────────────

  describe('namingConvention', () => {
    it('should detect files not matching pattern', () => {
      const engine = new FitnessEngine([makeRule('namingConvention', { pattern: '.*\\.test\\.ts$' })]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(false);
    });
  });

  // ─── Report aggregation ───────────────────────────────────

  describe('report', () => {
    it('should aggregate results correctly', () => {
      const engine = new FitnessEngine([
        makeRule('maxFileLines', { max: 500 }, 'error'),
        makeRule('maxCyclomaticComplexity', { max: 3 }, 'warning'),
      ]);
      const report = engine.evaluate(makeInput());
      expect(report.rules).toBe(2);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(1);
      expect(report.warnings).toBe(1);
      expect(report.errors).toBe(0);
      expect(report.overallPassed).toBe(true); // only errors block
    });

    it('should not pass overall when errors exist', () => {
      const engine = new FitnessEngine([
        makeRule('maxFileLines', { max: 50 }, 'error'),
      ]);
      const report = engine.evaluate(makeInput());
      expect(report.overallPassed).toBe(false);
    });
  });

  // ─── fromConfig ───────────────────────────────────────────

  describe('fromConfig', () => {
    it('should create engine from config object', () => {
      const engine = FitnessEngine.fromConfig({
        fitnessRules: [makeRule('maxFileLines', { max: 500 })],
      });
      const report = engine.evaluate(makeInput());
      expect(report.rules).toBe(1);
    });

    it('should handle empty config', () => {
      const engine = FitnessEngine.fromConfig({});
      const report = engine.evaluate(makeInput());
      expect(report.rules).toBe(0);
      expect(report.overallPassed).toBe(true);
    });
  });

  // ─── include/exclude filters ──────────────────────────────

  describe('file filtering', () => {
    it('should only evaluate files matching include pattern', () => {
      const rule: FitnessFunctionRule = {
        type: 'maxFileLines',
        params: { max: 100 },
        severity: 'error',
        include: ['src/repo.ts'],
      };
      const engine = new FitnessEngine([rule]);
      const report = engine.evaluate(makeInput());
      // Only repo.ts (100 lines, passes at max:100)
      expect(report.evaluations[0].passed).toBe(true);
    });

    it('should exclude files matching exclude pattern', () => {
      const rule: FitnessFunctionRule = {
        type: 'maxFileLines',
        params: { max: 100 },
        severity: 'error',
        exclude: ['src/service.ts', 'src/controller.ts'],
      };
      const engine = new FitnessEngine([rule]);
      const report = engine.evaluate(makeInput());
      expect(report.evaluations[0].passed).toBe(true);
    });
  });
});
