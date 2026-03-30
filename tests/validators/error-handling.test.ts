import { ErrorHandlingValidator } from '../../src/validators/error-handling';
import { SentinelConfig } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('ErrorHandlingValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join('/tmp', 'sentinel-test-project-errhandling');
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

  // ── Inicialização ──

  test('deve inicializar corretamente', () => {
    const validator = new ErrorHandlingValidator(config);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('Error Handling');
  });

  // ── Error handling correto ──

  test('deve passar com error handling correto', () => {
    const file = path.join(testDir, 'proper-handling.ts');
    fs.writeFileSync(file, `
      export async function processData(data: unknown) {
        try {
          if (!data) {
            throw new Error('Data is required');
          }
          return JSON.parse(String(data));
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(\`Failed to process: \${error.message}\`);
          }
          throw error;
        }
      }
    `);

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Error Handling');
    expect(result.passed).toBe(true);
  });

  // ── Catch vazio ──

  test('deve detectar catch vazio', () => {
    const file = path.join(testDir, 'empty-catch.ts');
    fs.writeFileSync(file, `
      try {
        doSomething();
      } catch(e) {
      }
    `);

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    // Should find the empty catch block issue
    // Note: The validator has the issue codes as code samples due to extras override
    // So we check the message instead
    expect(result.issues.some(i => i.message.includes('Empty catch block'))).toBe(true);
  });

  // ── Throw de string literal ──

  test('deve detectar throw de string literal', () => {
    const file = path.join(testDir, 'string-throw.ts');
    fs.writeFileSync(file, `
      export function badThrow() {
        if (!isValid) {
          throw 'something went wrong';
        }
      }
    `);

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    // Should find the throw string literal issue
    expect(result.issues.some(i => i.message.includes('Throwing string literals'))).toBe(true);
  });

  // ── Promise sem catch ──

  test('deve detectar promise sem catch', () => {
    const file = path.join(testDir, 'promise-no-catch.ts');
    fs.writeFileSync(file, `
      export function fetchData() {
        return fetchFromApi()
          .then(data => processData(data));
      }
    `);

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    // Should find the unhandled promise rejection issue
    expect(result.issues.some(i => i.message.includes('Promise .then() chain without corresponding .catch()'))).toBe(true);
  });

  // ── Console-only error handling ──

  test('deve detectar console-only error handling', () => {
    const file = path.join(testDir, 'console-only.ts');
    fs.writeFileSync(file, `
      export function handleError() {
        try {
          doSomething();
        } catch (error) {
          console.error('An error occurred:', error);
        }
      }
    `);

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    // Should find the console-only handling issue
    expect(result.issues.some(i => i.message.includes('Error is only logged to console'))).toBe(true);
  });

  // ── Métricas adequadas ──

  test('deve retornar metrics adequadas', () => {
    const file = path.join(testDir, 'test.ts');
    fs.writeFileSync(file, `
      export function code() {
        try {
          doSomething();
        } catch(e) {
          console.log(e);
        }
      }
    `);

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    expect(result.details).toBeDefined();
    expect(result.details.metrics).toBeDefined();
    expect(result.details.metrics.emptyCatchBlocks).toBeDefined();
    expect(result.details.metrics.throwStringLiterals).toBeDefined();
    expect(result.details.metrics.missingErrorHandling).toBeDefined();
    expect(result.details.metrics.totalIssuesFound).toBeDefined();
  });

  // ── Score numérico ──

  test('deve retornar score numérico', () => {
    const file = path.join(testDir, 'clean.ts');
    fs.writeFileSync(file, 'export const x = 1;');

    const validator = new ErrorHandlingValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
