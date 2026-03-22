import { Sentinel } from '../src/sentinel';
import * as fs from 'fs';
import * as path from 'path';

describe('Sentinel', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '../test-project');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should initialize with default config', () => {
    const sentinel = new Sentinel();
    expect(sentinel).toBeDefined();
  });

  test('should initialize with custom config', () => {
    const config = {
      testingThreshold: 90,
      securityLevel: 'strict' as const,
      performanceTarget: 'optimal' as const,
      maintainabilityScore: 85,
    };
    const sentinel = new Sentinel(config);
    expect(sentinel).toBeDefined();
  });

  test('should throw error for non-existent directory', async () => {
    const sentinel = new Sentinel();
    await expect(sentinel.validate('/non/existent/path')).rejects.toThrow();
  });

  test('should run validation pipeline', async () => {
    const testFile = path.join(testDir, 'test.ts');
    fs.writeFileSync(testFile, 'const x = 1;');

    const sentinel = new Sentinel();
    const results = await sentinel.runPipeline(testDir);

    expect(results).toHaveLength(7);
    expect(results[0].validator).toBe('Testing Coverage');
    expect(results[1].validator).toBe('Security Scanning');
    expect(results[2].validator).toBe('Performance Benchmarks');
    expect(results[3].validator).toBe('Maintainability Checker');
    expect(results[4].validator).toBe('Dependency Analysis');
    expect(results[5].validator).toBe('Documentation Coverage');
    expect(results[6].validator).toBe('Code Style');
  });

  test('should generate report', async () => {
    const testFile = path.join(testDir, 'test.ts');
    fs.writeFileSync(testFile, 'const x = 1;');

    const sentinel = new Sentinel();
    const result = await sentinel.validate(testDir);

    expect(result.report).toBeDefined();
    expect(result.report.length).toBeGreaterThan(0);
  });

  test('should aggregate results correctly', async () => {
    const testFile = path.join(testDir, 'test.ts');
    fs.writeFileSync(testFile, 'const x = 1;');

    const sentinel = new Sentinel();
    const result = await sentinel.validate(testDir);

    expect(result.summary.totalFiles).toBeGreaterThanOrEqual(1);
    expect(result.summary.passedChecks).toBeGreaterThanOrEqual(0);
    expect(result.summary.failedChecks).toBeGreaterThanOrEqual(0);
    expect(result.exitCode).toBeDefined();
  });

  test('should handle validation with test files', async () => {
    const srcFile = path.join(testDir, 'src.ts');
    const testFile = path.join(testDir, 'src.test.ts');

    fs.writeFileSync(srcFile, 'export const add = (a, b) => a + b;');
    fs.writeFileSync(testFile, 'import { add } from "./src";\ntest("add works", () => expect(add(1, 1)).toBe(2));');

    const sentinel = new Sentinel();
    const result = await sentinel.validate(testDir);

    expect(result).toBeDefined();
    expect(result.results).toHaveLength(7);
  });
});
