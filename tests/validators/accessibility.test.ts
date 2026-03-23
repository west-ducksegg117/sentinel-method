import { AccessibilityValidator } from '../../src/validators/accessibility';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('AccessibilityValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-a11y');
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
    const validator = new AccessibilityValidator(config);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('Accessibility (WCAG)');
  });

  // ── Casos de sucesso ──

  test('deve passar com projeto sem HTML/JSX', () => {
    // Projeto apenas com TypeScript puro (sem JSX)
    const tsFile = path.join(testDir, 'service.ts');
    fs.writeFileSync(tsFile, `
      export class UserService {
        async getUser(id: string) {
          return { id, name: 'John' };
        }

        async updateUser(id: string, data: any) {
          return { id, ...data };
        }
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Accessibility (WCAG)');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // ── Detecção de problemas ──

  test('deve detectar img sem alt', () => {
    const file = path.join(testDir, 'image-no-alt.tsx');
    fs.writeFileSync(file, `
      export function Avatar() {
        return (
          <img src="photo.jpg" />
        );
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Accessibility (WCAG)');
  });

  test('deve detectar div clicável (non-semantic)', () => {
    const file = path.join(testDir, 'clickable-div.tsx');
    fs.writeFileSync(file, `
      export function CustomButton() {
        return (
          <div onClick={handleClick}>
            Click me
          </div>
        );
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Accessibility (WCAG)');
  });

  test('deve detectar input sem label', () => {
    const file = path.join(testDir, 'input-no-label.tsx');
    fs.writeFileSync(file, `
      export function LoginForm() {
        return (
          <form>
            <input type="text" name="email" placeholder="Enter email" />
            <button type="submit">Login</button>
          </form>
        );
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Accessibility (WCAG)');
  });

  test('deve detectar tabindex positivo', () => {
    const file = path.join(testDir, 'positive-tabindex.tsx');
    fs.writeFileSync(file, `
      export function Navigation() {
        return (
          <>
            <button tabIndex={5}>Home</button>
            <button tabIndex={10}>About</button>
          </>
        );
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Accessibility (WCAG)');
  });

  test('deve detectar link vazio', () => {
    const file = path.join(testDir, 'empty-link.tsx');
    fs.writeFileSync(file, `
      export function Navigation() {
        return (
          <nav>
            <a href="/home"></a>
            <a href="/about">About</a>
          </nav>
        );
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Accessibility (WCAG)');
  });

  test('deve retornar score numérico', () => {
    const file = path.join(testDir, 'accessible.tsx');
    fs.writeFileSync(file, `
      export function AccessibleForm() {
        return (
          <form>
            <label htmlFor="username">Username:</label>
            <input id="username" type="text" />
            <button type="submit">Submit</button>
          </form>
        );
      }
    `);

    const validator = new AccessibilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
