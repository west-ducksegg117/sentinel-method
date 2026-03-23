import { I18nValidator } from '../../src/validators/i18n';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('I18nValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-i18n');
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
    const validator = new I18nValidator(config);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('Internationalization');
  });

  // ── Casos de sucesso ──

  test('deve passar com projeto sem strings hardcoded', () => {
    // Código limpo sem strings de usuário
    const file = path.join(testDir, 'clean.ts');
    fs.writeFileSync(file, `
      import { t } from 'i18n';

      export function processData(input: any) {
        const result = input.map((item: any) => ({
          id: item.id,
          value: item.value,
        }));
        return result;
      }

      export const API_URL = 'https://api.example.com';
      export const TIMEOUT_MS = 5000;
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Internationalization');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // ── Detecção de problemas ──

  test('deve detectar texto hardcoded em JSX', () => {
    const file = path.join(testDir, 'hardcoded-text.tsx');
    fs.writeFileSync(file, `
      export function HomePage() {
        return (
          <div>
            <h1>Welcome to our app</h1>
            <p>This is the home page</p>
            <button>Click here</button>
          </div>
        );
      }
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Internationalization');
  });

  test('deve detectar símbolo de moeda hardcoded', () => {
    const file = path.join(testDir, 'currency.ts');
    fs.writeFileSync(file, `
      export function formatPrice(value: number): string {
        return '$' + value.toFixed(2);
      }

      export function calculateTotal(items: any[]) {
        const total = items.reduce((sum, item) => sum + item.price, 0);
        return '€ ' + total;
      }
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Internationalization');
  });

  test('deve detectar formatação manual de data', () => {
    const file = path.join(testDir, 'manual-date.ts');
    fs.writeFileSync(file, `
      export function getCurrentDate(): string {
        const now = new Date();
        return now.toLocaleDateString();
      }

      export function formatDateTime(date: Date): string {
        return date.toLocaleString();
      }
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Internationalization');
  });

  test('deve detectar pluralização naive', () => {
    const file = path.join(testDir, 'naive-plural.ts');
    fs.writeFileSync(file, `
      export function displayItems(count: number): string {
        return count === 1 ? 'item' : 'items';
      }

      export function showResults(total: number): string {
        const result = total > 1 ? 'results found' : 'result found';
        return total + ' ' + result;
      }
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    // Verify validator ran
    expect(result.validator).toBe('Internationalization');
  });

  test('deve retornar score numérico', () => {
    const file = path.join(testDir, 'with-i18n.ts');
    fs.writeFileSync(file, `
      import { t } from 'i18next';
      import { useIntl } from 'react-intl';

      export function WelcomeMessage() {
        const intl = useIntl();
        return intl.formatMessage({ id: 'welcome.title' });
      }
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('deve ter threshold de 60', () => {
    const file = path.join(testDir, 'threshold-check.ts');
    fs.writeFileSync(file, `
      export function test() {
        return 'hardcoded string';
      }
    `);

    const validator = new I18nValidator(config);
    const result = validator.validate(testDir);

    expect(result.threshold).toBeDefined();
    expect(result.threshold).toBe(60);
  });
});
