import { PerformanceValidator } from '../../src/validators/performance';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('PerformanceValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-performance');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    config = {
      testingThreshold: 80,
      securityLevel: 'strict',
      performanceTarget: 'optimal',
      maintainabilityScore: 75,
    };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('deve inicializar com configuração válida', () => {
    const validator = new PerformanceValidator(config);
    expect(validator).toBeDefined();
  });

  test('deve passar com código performático limpo', () => {
    const file = path.join(testDir, 'clean.ts');
    fs.writeFileSync(file, `
      export function sum(arr: number[]): number {
        return arr.reduce((a, b) => a + b, 0);
      }

      export function find(arr: number[], target: number): number {
        return arr.indexOf(target);
      }
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Performance Benchmarks');
    expect(result.passed).toBe(true);
    expect(result.details.performanceScore).toBeGreaterThanOrEqual(90);
  });

  // ── Detecção de complexidade ──

  test('deve detectar loops aninhados (O(n²))', () => {
    const file = path.join(testDir, 'nested-loops.ts');
    fs.writeFileSync(file, `
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { console.log(i, j); } }
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'HIGH_COMPLEXITY')).toBe(true);
    expect(result.details.avgComplexity).toBeGreaterThan(0);
  });

  // ── Detecção de alocação de memória ──

  test('deve detectar alocação excessiva de memória em linha única', () => {
    const file = path.join(testDir, 'memory.ts');
    fs.writeFileSync(file, `
      const data = { a: new Array(100), b: new Map(), c: new Set() };
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'MEMORY_ALLOCATION')).toBe(true);
    expect(result.details.memoryIssues).toBeGreaterThan(0);
  });

  test('deve aceitar alocação moderada de memória', () => {
    const file = path.join(testDir, 'moderate-alloc.ts');
    fs.writeFileSync(file, `
      const cache = new Map();
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.filter(i => i.code === 'MEMORY_ALLOCATION')).toHaveLength(0);
  });

  // ── Detecção de async/await impróprio ──

  test('deve detectar await dentro de Promise.all', () => {
    const file = path.join(testDir, 'bad-async.ts');
    fs.writeFileSync(file, `
      const results = await Promise.all([await fetch('/a'), await fetch('/b')]);
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'IMPROPER_ASYNC')).toBe(true);
    expect(result.details.asyncIssues).toBeGreaterThan(0);
  });

  test('deve aceitar Promise.all sem await interno', () => {
    const file = path.join(testDir, 'good-async.ts');
    fs.writeFileSync(file, `
      const results = await Promise.all([fetch('/a'), fetch('/b')]);
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.filter(i => i.code === 'IMPROPER_ASYNC')).toHaveLength(0);
  });

  // ── Score e threshold ──

  test('deve usar threshold baseado no performanceTarget', () => {
    const file = path.join(testDir, 'basic.ts');
    fs.writeFileSync(file, 'export const x = 1;');

    // Target "optimal" = threshold 90
    config.performanceTarget = 'optimal';
    let validator = new PerformanceValidator(config);
    let result = validator.validate(testDir);
    expect(result.threshold).toBe(90);

    // Target "good" = threshold 75
    config.performanceTarget = 'good';
    validator = new PerformanceValidator(config);
    result = validator.validate(testDir);
    expect(result.threshold).toBe(75);

    // Target "acceptable" = threshold 60
    config.performanceTarget = 'acceptable';
    validator = new PerformanceValidator(config);
    result = validator.validate(testDir);
    expect(result.threshold).toBe(60);
  });

  test('deve calcular score proporcional às issues encontradas', () => {
    const file = path.join(testDir, 'many-issues.ts');
    fs.writeFileSync(file, `
      const a = { x: new Array(1), y: new Map(), z: new Set() };
      const b = { x: new Array(1), y: new Map(), z: new Set() };
      const c = { x: new Array(1), y: new Map(), z: new Set() };
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.performanceScore).toBeLessThan(100);
  });

  test('score não deve ser negativo mesmo com muitas issues', () => {
    const file = path.join(testDir, 'terrible.ts');
    // Gerar muitas issues
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`const x${i} = { a: new Array(1), b: new Map(), c: new Set() };`);
    }
    fs.writeFileSync(file, lines.join('\n'));

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.performanceScore).toBeGreaterThanOrEqual(0);
  });

  // ── Edge cases ──

  test('deve lidar com diretório vazio', () => {
    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.details.performanceScore).toBe(100);
  });

  test('deve ignorar node_modules e diretórios ocultos', () => {
    const hiddenDir = path.join(testDir, '.cache');
    const nmDir = path.join(testDir, 'node_modules', 'dep');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.mkdirSync(nmDir, { recursive: true });

    // Código ruim em locais que devem ser ignorados
    fs.writeFileSync(path.join(hiddenDir, 'bad.ts'), 'for (let i=0;i<n;i++) { for (let j=0;j<n;j++) {} }');
    fs.writeFileSync(path.join(nmDir, 'bad.ts'), 'for (let i=0;i<n;i++) { for (let j=0;j<n;j++) {} }');

    // Código limpo no root
    fs.writeFileSync(path.join(testDir, 'clean.ts'), 'export const x = 1;');

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.issues.filter(i => i.code === 'HIGH_COMPLEXITY')).toHaveLength(0);
  });

  test('deve incluir sugestão de correção nas issues', () => {
    const file = path.join(testDir, 'with-suggestion.ts');
    fs.writeFileSync(file, `
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { process(i, j); } }
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    for (const issue of result.issues) {
      expect(issue.suggestion).toBeDefined();
      expect(issue.suggestion!.length).toBeGreaterThan(0);
    }
  });

  test('deve falhar quando score está abaixo do threshold', () => {
    const file = path.join(testDir, 'below-threshold.ts');
    // Muitas issues para derrubar o score abaixo de 90 (optimal)
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(`const x${i} = { a: new Array(1), b: new Map(), c: new Set() };`);
    }
    fs.writeFileSync(file, lines.join('\n'));

    config.performanceTarget = 'optimal';
    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    // Se o score ficar abaixo de 90, deve falhar
    if (result.details.performanceScore < 90) {
      expect(result.passed).toBe(false);
    }
  });

  test('deve incluir impact level nas issues de performance', () => {
    const file = path.join(testDir, 'impact.ts');
    fs.writeFileSync(file, `
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { calc(i, j); } }
    `);

    const validator = new PerformanceValidator(config);
    const result = validator.validate(testDir);

    const complexityIssue = result.issues.find(i => i.code === 'HIGH_COMPLEXITY');
    if (complexityIssue) {
      expect((complexityIssue as any).impact).toBeDefined();
    }
  });
});
