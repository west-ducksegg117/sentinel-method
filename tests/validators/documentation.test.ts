import { DocumentationValidator } from '../../src/validators/documentation';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('DocumentationValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-docs');
    fs.mkdirSync(testDir, { recursive: true });
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

  test('deve inicializar corretamente', () => {
    const validator = new DocumentationValidator(config);
    expect(validator.name).toBe('Documentation Coverage');
  });

  test('deve passar com código totalmente documentado', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Project');
    fs.writeFileSync(path.join(testDir, 'CHANGELOG.md'), '# Changelog');
    fs.writeFileSync(path.join(testDir, 'service.ts'), `
/** Serviço principal da aplicação */
export class AppService {
  /** Retorna saudação */
  greet(): string { return 'hi'; }
}

/** Soma dois valores */
export function add(a: number, b: number): number {
  return a + b;
}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.details.documentationCoverage).toBe(100);
  });

  // ── Funções exportadas ──

  test('deve detectar funções exportadas sem JSDoc', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'utils.ts'), `
export function undocumented(): void {
  console.log('no docs');
}

/** Documentada */
export function documented(): void {
  console.log('has docs');
}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.exportedFunctions).toBe(2);
    expect(result.details.documentedFunctions).toBe(1);
    expect(result.issues.some(i => i.code === 'UNDOCUMENTED_EXPORT')).toBe(true);
  });

  test('deve detectar arrow functions exportadas sem docs', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'helpers.ts'), `
export const calculate = (x: number) => x * 2;
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.exportedFunctions).toBe(1);
    expect(result.issues.some(i => i.code === 'UNDOCUMENTED_EXPORT')).toBe(true);
  });

  test('deve aceitar arrow function com JSDoc', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'helpers.ts'), `
/** Duplica o valor */
export const double = (x: number) => x * 2;
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.documentedFunctions).toBe(1);
  });

  test('deve detectar async functions exportadas', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'api.ts'), `
export async function fetchData(): Promise<void> {
  await fetch('/api');
}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.exportedFunctions).toBe(1);
    expect(result.issues.some(i => i.code === 'UNDOCUMENTED_EXPORT')).toBe(true);
  });

  // ── Classes exportadas ──

  test('deve detectar classes exportadas sem documentação', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'models.ts'), `
export class UserModel {
  name: string = '';
}

/** Modelo de produto */
export class ProductModel {
  title: string = '';
}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.exportedClasses).toBe(2);
    expect(result.details.documentedClasses).toBe(1);
    expect(result.issues.some(i => i.code === 'UNDOCUMENTED_CLASS')).toBe(true);
  });

  test('deve reconhecer abstract class exportada', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'base.ts'), `
export abstract class BaseEntity {
  abstract getId(): string;
}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.exportedClasses).toBe(1);
  });

  // ── README e CHANGELOG ──

  test('deve alertar quando não há README', () => {
    fs.writeFileSync(path.join(testDir, 'app.ts'), 'export const x = 1;');

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'NO_README')).toBe(true);
    expect(result.details.hasReadme).toBe(false);
  });

  test('deve alertar quando não há CHANGELOG', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Project');
    fs.writeFileSync(path.join(testDir, 'app.ts'), 'export const x = 1;');

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'NO_CHANGELOG')).toBe(true);
    expect(result.details.hasChangelog).toBe(false);
  });

  test('deve aceitar readme.md (case insensitive)', () => {
    fs.writeFileSync(path.join(testDir, 'readme.md'), '# hi');

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.hasReadme).toBe(true);
  });

  // ── Score ──

  test('deve calcular score com peso de 70% docs, 20% README, 10% CHANGELOG', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Project');
    fs.writeFileSync(path.join(testDir, 'CHANGELOG.md'), '# Changes');
    fs.writeFileSync(path.join(testDir, 'app.ts'), `
/** Doc */
export function documented(): void {}
export function undocumented(): void {}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    // 50% coverage * 0.7 = 35 + 20 (readme) + 10 (changelog) = 65
    expect(result.details.documentationScore).toBe(65);
  });

  // ── Ignora test files ──

  test('deve ignorar arquivos de teste na análise', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'service.test.ts'), `
export function testHelper(): void {}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.exportedFunctions).toBe(0);
  });

  // ── Edge cases ──

  test('deve lidar com diretório vazio', () => {
    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.documentationCoverage).toBe(100);
  });

  test('deve lidar com comentário inline (//) como documentação', () => {
    fs.writeFileSync(path.join(testDir, 'README.md'), '# OK');
    fs.writeFileSync(path.join(testDir, 'utils.ts'), `
// Calcula a raiz quadrada
export function sqrt(n: number): number {
  return Math.sqrt(n);
}
    `);

    const validator = new DocumentationValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.documentedFunctions).toBe(1);
  });
});
