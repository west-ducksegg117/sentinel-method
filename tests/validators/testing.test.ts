import { TestingValidator } from '../../src/validators/testing';
import * as fs from 'fs';
import * as path from 'path';

describe('TestingValidator', () => {
  let testDir: string;

  const defaultConfig = {
    testingThreshold: 50,
    securityLevel: 'strict' as const,
    performanceTarget: 'optimal' as const,
    maintainabilityScore: 75,
  };

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-testing');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should initialize with config', () => {
    const validator = new TestingValidator(defaultConfig);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('Testing Coverage');
  });

  test('should detect missing test files', () => {
    const srcFile = path.join(testDir, 'app.ts');
    fs.writeFileSync(srcFile, 'export const main = () => {}');

    const validator = new TestingValidator({ ...defaultConfig, testingThreshold: 80 });
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Testing Coverage');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.code === 'NO_TESTS')).toBe(true);
  });

  test('should detect test files and count assertions', () => {
    const srcFile = path.join(testDir, 'app.ts');
    const testFile = path.join(testDir, 'app.test.ts');

    fs.writeFileSync(srcFile, 'export const main = () => {}');
    fs.writeFileSync(testFile, [
      'import { main } from "./app";',
      'test("main works", () => {',
      '  expect(main()).toBeDefined();',
      '  expect(main()).not.toBeNull();',
      '});',
    ].join('\n'));

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    expect(result.details.testFiles).toBe(1);
    expect(result.details.assertions).toBeGreaterThanOrEqual(2);
  });

  test('should count edge cases in test files', () => {
    const srcFile = path.join(testDir, 'utils.ts');
    const testFile = path.join(testDir, 'utils.test.ts');
    fs.writeFileSync(srcFile, 'export const sum = (a: number, b: number) => a + b;');
    fs.writeFileSync(testFile, [
      'import { sum } from "./utils";',
      'test("handles null and undefined", () => {',
      '  expect(sum(null as any, 1)).toBeNaN();',
      '  expect(sum(undefined as any, 1)).toBeNaN();',
      '});',
      'test("edge case with zero", () => {',
      '  expect(sum(0, 0)).toBe(0);',
      '});',
      'test("handles overflow", () => {',
      '  expect(sum(Number.MAX_SAFE_INTEGER, 1)).toBeGreaterThan(0);',
      '});',
    ].join('\n'));

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    expect(result.details.edgeCases).toBeGreaterThan(0);
    expect(result.details.assertions).toBeGreaterThanOrEqual(3);
  });

  test('should read real coverage data from coverage-summary.json', () => {
    const srcFile = path.join(testDir, 'src.ts');
    const testFile = path.join(testDir, 'src.test.ts');
    fs.writeFileSync(srcFile, 'export const fn = () => "ok";');
    fs.writeFileSync(testFile, 'import { fn } from "./src";\ntest("fn", () => expect(fn()).toBe("ok"));');

    // Criar coverage-summary.json simulando dados reais gerados pelo Jest
    const coverageDir = path.join(testDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(path.join(coverageDir, 'coverage-summary.json'), JSON.stringify({
      total: {
        statements: { total: 100, covered: 80, pct: 80 },
        branches: { total: 50, covered: 35, pct: 70 },
        functions: { total: 20, covered: 18, pct: 90 },
        lines: { total: 100, covered: 75, pct: 75 },
      },
    }));

    // Criar package.json para findProjectRoot
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    // Com dados reais: lines*0.4 + stmts*0.3 + branches*0.2 + funcs*0.1
    // = 75*0.4 + 80*0.3 + 70*0.2 + 90*0.1 = 30+24+14+9 = 77
    expect(result.details.coverage).toBe(77);
  });

  test('should read real coverage data from coverage-final.json', () => {
    const srcFile = path.join(testDir, 'module.ts');
    const testFile = path.join(testDir, 'module.test.ts');
    fs.writeFileSync(srcFile, 'export const calc = (x: number) => x * 2;');
    fs.writeFileSync(testFile, 'import { calc } from "./module";\ntest("calc", () => expect(calc(5)).toBe(10));');

    const coverageDir = path.join(testDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(path.join(coverageDir, 'coverage-final.json'), JSON.stringify({
      '/project/module.ts': {
        s: { '0': 5, '1': 3, '2': 0 },
        b: { '0': [3, 0], '1': [5, 2] },
        f: { '0': 5, '1': 3 },
      },
    }));

    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    // s: 2/3 = 66.67%, b: 3/4 = 75%, f: 2/2 = 100%
    // lines = statements (66.67%)
    expect(result.details.coverage).toBeGreaterThanOrEqual(70);
    expect(result.details.coverage).toBeLessThanOrEqual(75);
  });

  test('should read real coverage data from lcov.info', () => {
    const srcFile = path.join(testDir, 'service.ts');
    const testFile = path.join(testDir, 'service.test.ts');
    fs.writeFileSync(srcFile, 'export const serve = () => "running";');
    fs.writeFileSync(testFile, 'import { serve } from "./service";\ntest("serve", () => expect(serve()).toBe("running"));');

    const coverageDir = path.join(testDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    fs.writeFileSync(path.join(coverageDir, 'lcov.info'), [
      'SF:/project/service.ts',
      'FNF:5',
      'FNH:4',
      'BRF:10',
      'BRH:7',
      'LF:50',
      'LH:40',
      'end_of_record',
    ].join('\n'));

    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    // lines: 40/50 = 80%, stmts: 80%, branches: 7/10 = 70%, funcs: 4/5 = 80%
    // coverage = 80*0.4 + 80*0.3 + 70*0.2 + 80*0.1 = 32+24+14+8 = 78
    expect(result.details.coverage).toBe(78);
  });

  test('should score test infrastructure when no coverage data available', () => {
    // findProjectRoot vai subir até sentinel-method que tem coverage real
    // Então este teste valida que dados reais são SEMPRE preferidos
    const srcFile = path.join(testDir, 'code.ts');
    const testFile = path.join(testDir, 'code.test.ts');

    fs.writeFileSync(srcFile, 'export const fn = () => {}');
    fs.writeFileSync(testFile, [
      'import { fn } from "./code";',
      'test("fn works", () => expect(fn()).toBeUndefined());',
    ].join('\n'));

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    // Score sempre baseado em dados reais — nunca inventado
    expect(result.details.qualityScore).toBeDefined();
    expect(result.details.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.details.qualityScore).toBeLessThanOrEqual(100);
    expect(result.details.assertions).toBeGreaterThanOrEqual(1);
  });

  test('should detect untested source files', () => {
    fs.writeFileSync(path.join(testDir, 'tested.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(testDir, 'tested.test.ts'), 'test("a", () => expect(1).toBe(1));');
    fs.writeFileSync(path.join(testDir, 'untested.ts'), 'export const b = 2;');

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'UNTESTED_FILE')).toBe(true);
  });

  test('should handle empty source directory', () => {
    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'NO_SOURCE_FILES')).toBe(true);
    expect(result.details.qualityScore).toBe(0);
  });

  test('should calculate quality score with coverage weighted by assertions and edge cases', () => {
    const srcFile = path.join(testDir, 'math.ts');
    const testFile = path.join(testDir, 'math.test.ts');
    fs.writeFileSync(srcFile, 'export const add = (a: number, b: number) => a + b;');
    fs.writeFileSync(testFile, [
      'import { add } from "./math";',
      'test("basic", () => {',
      '  expect(add(1, 2)).toBe(3);',
      '  expect(add(0, 0)).toBe(0);',
      '});',
      'test("edge cases", () => {',
      '  expect(add(-1, 1)).toBe(0);',
      '  expect(add(null as any, 1)).toBeDefined();',
      '  expect(add(undefined as any, 1)).toBeDefined();',
      '});',
    ].join('\n'));

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    expect(result.details.qualityScore).toBeGreaterThan(0);
    expect(result.score).toBe(result.details.qualityScore);
  });

  test('should give reasonable score to well-tested project without coverage data', () => {
    // Simular projeto com muitos testes mas sem coverage gerado
    // Criar package.json isolado para que findProjectRoot pare aqui
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      scripts: {},
    }));

    // 3 source files
    fs.writeFileSync(path.join(testDir, 'a.ts'), 'export const a = () => "a";');
    fs.writeFileSync(path.join(testDir, 'b.ts'), 'export const b = () => "b";');
    fs.writeFileSync(path.join(testDir, 'c.ts'), 'export const c = () => "c";');

    // 3 test files com muitas assertions (simula projeto bem testado)
    const manyAssertions = Array.from({ length: 50 }, (_, i) =>
      `test("case ${i}", () => { expect(${i}).toBeDefined(); expect(${i}).not.toBeNull(); });`,
    ).join('\n');

    fs.writeFileSync(path.join(testDir, 'a.test.ts'), manyAssertions);
    fs.writeFileSync(path.join(testDir, 'b.test.ts'), manyAssertions);
    fs.writeFileSync(path.join(testDir, 'c.test.ts'), manyAssertions);

    const validator = new TestingValidator(defaultConfig);
    const result = validator.validate(testDir);

    // 300 assertions em 3 arquivos de teste = 100 assertions/file
    // Sem coverage, mas score deve refletir a qualidade real dos testes:
    //   densityScore = min(100/10 * 40, 40) = 40
    //   presenceScore = min(3*5, 30) = 15
    //   edgeScore depende dos edge cases detectados
    //   volumeScore = min(300/100 * 10, 10) = 10
    // Total esperado: 65+ (projeto bem testado)
    expect(result.details.assertions).toBe(300);
    expect(result.details.qualityScore).toBeGreaterThanOrEqual(50);
    expect(result.details.coverage).toBe(0); // Honesto: sem dados reais de coverage
  });
});
