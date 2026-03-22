import { TestingValidator } from '../../src/validators/testing';
import * as fs from 'fs';
import * as path from 'path';

describe('TestingValidator', () => {
  let testDir: string;

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
    const config = {
      testingThreshold: 80,
      securityLevel: 'strict' as const,
      performanceTarget: 'optimal' as const,
      maintainabilityScore: 75,
    };
    const validator = new TestingValidator(config);
    expect(validator).toBeDefined();
  });

  test('should detect missing test files', () => {
    const srcFile = path.join(testDir, 'app.ts');
    fs.writeFileSync(srcFile, 'export const main = () => {}');

    const config = {
      testingThreshold: 80,
      securityLevel: 'strict' as const,
      performanceTarget: 'optimal' as const,
      maintainabilityScore: 75,
    };
    const validator = new TestingValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Testing Coverage');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('should detect test files', () => {
    const srcFile = path.join(testDir, 'app.ts');
    const testFile = path.join(testDir, 'app.test.ts');

    fs.writeFileSync(srcFile, 'export const main = () => {}');
    fs.writeFileSync(testFile, 'import { main } from "./app";\ntest("main works", () => expect(main()).toBeDefined());');

    const config = {
      testingThreshold: 50,
      securityLevel: 'strict' as const,
      performanceTarget: 'optimal' as const,
      maintainabilityScore: 75,
    };
    const validator = new TestingValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Testing Coverage');
    expect(result.details.testFiles).toBeGreaterThan(0);
  });

  test('should count assertions in test files', () => {
    const srcFile = path.join(testDir, 'utils.ts');
    const testFile = path.join(testDir, 'utils.test.ts');
    fs.writeFileSync(srcFile, 'export const sum = (a: number, b: number) => a + b;');
    fs.writeFileSync(
      testFile,
      `
import { sum } from './utils';
test("multiple assertions", () => {
  expect(sum(1, 2)).toBe(3);
  expect(sum(0, 0)).toBe(0);
  expect(sum(-1, 1)).toBe(0);
});
`,
    );

    const config = {
      testingThreshold: 50,
      securityLevel: 'strict' as const,
      performanceTarget: 'optimal' as const,
      maintainabilityScore: 75,
    };
    const validator = new TestingValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.assertions).toBeGreaterThanOrEqual(3);
  });

  test('should calculate quality score', () => {
    const srcFile = path.join(testDir, 'code.ts');
    const testFile = path.join(testDir, 'code.test.ts');

    fs.writeFileSync(srcFile, 'export const fn = () => {}');
    fs.writeFileSync(testFile, 'import { fn } from "./code";\ntest("fn", () => expect(fn()).toBeDefined());');

    const config = {
      testingThreshold: 50,
      securityLevel: 'strict' as const,
      performanceTarget: 'optimal' as const,
      maintainabilityScore: 75,
    };
    const validator = new TestingValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.qualityScore).toBeDefined();
    expect(result.details.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.details.qualityScore).toBeLessThanOrEqual(100);
  });
});
