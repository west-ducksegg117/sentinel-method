import { TypeSafetyValidator } from '../../src/validators/type-safety';
import { SentinelConfig } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('TypeSafetyValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-typesafety');
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
    const validator = new TypeSafetyValidator(config);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('Type Safety');
  });

  // ── Código type-safe ──

  test('deve passar com código type-safe', () => {
    const file = path.join(testDir, 'typed.ts');
    fs.writeFileSync(file, `
      interface User {
        id: number;
        name: string;
      }

      export function getUser(id: number): User | null {
        if (id < 0) return null;
        return { id, name: 'John' };
      }

      export const users: User[] = [];
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Type Safety');
    expect(result.passed).toBe(true);
  });

  // ── Uso de any ──

  test('deve detectar uso de any', () => {
    const file = path.join(testDir, 'with-any.ts');
    fs.writeFileSync(file, `
      export function getData() {
        const data: any = getValue();
        return data.property;
      }
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'EXPLICIT_ANY')).toBe(true);
  });

  // ── As any ──

  test('deve detectar as any', () => {
    const file = path.join(testDir, 'as-any.ts');
    fs.writeFileSync(file, `
      export function process(value: unknown) {
        const result = value as any;
        return result.method();
      }
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    // TYPE_ASSERTION_ANY is not a valid code - check for both as any patterns
    // The validator creates EXPLICIT_ANY for 'as any' patterns
    expect(result.issues.some(i => i.code === 'EXPLICIT_ANY' || i.code === 'TYPE_ASSERTION')).toBe(true);
  });

  // ── Non-null assertion ──

  test('deve detectar non-null assertion', () => {
    const file = path.join(testDir, 'non-null.ts');
    fs.writeFileSync(file, `
      interface User {
        name: string;
      }

      export function getName(user: User | null) {
        return user!.name;
      }
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'NON_NULL_ASSERTION')).toBe(true);
  });

  // ── @ts-ignore ──

  test('deve detectar @ts-ignore', () => {
    const file = path.join(testDir, 'ts-ignore.ts');
    fs.writeFileSync(file, `
      export function bypass() {
        // @ts-ignore
        const value = someUndefinedFunction();
        return value;
      }
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'TS_IGNORE_DIRECTIVE')).toBe(true);
  });

  // ── == ao invés de === ──

  test('deve detectar == ao invés de ===', () => {
    const file = path.join(testDir, 'loose-equality.ts');
    fs.writeFileSync(file, `
      export function compare(a: unknown, b: unknown) {
        if (a == b) {
          return true;
        }
        return false;
      }
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'LOOSE_EQUALITY')).toBe(true);
  });

  // ── Ignorar arquivos .js ──

  test('deve ignorar arquivos .js', () => {
    const jsFile = path.join(testDir, 'untyped.js');
    fs.writeFileSync(jsFile, `
      const data = getValue();
      const casted = data as any;
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    // JavaScript files should be ignored by TypeSafetyValidator
    expect(result.passed).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  // ── Score numérico ──

  test('deve retornar score numérico', () => {
    const file = path.join(testDir, 'clean.ts');
    fs.writeFileSync(file, `
      interface Item {
        id: string;
      }

      export function getId(item: Item): string {
        return item.id;
      }
    `);

    const validator = new TypeSafetyValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.threshold).toBeDefined();
    expect(result.threshold).toBe(70);
  });
});
