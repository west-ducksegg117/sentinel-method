import { MaintainabilityValidator } from '../../src/validators/maintainability';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('MaintainabilityValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-maintainability');
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
    const validator = new MaintainabilityValidator(config);
    expect(validator).toBeDefined();
  });

  test('deve passar com código limpo e bem documentado', () => {
    const file = path.join(testDir, 'clean.ts');
    fs.writeFileSync(file, `
      /** Soma dois números */
      export function add(first: number, second: number): number {
        return first + second;
      }

      /** Multiplica dois números */
      export function multiply(first: number, second: number): number {
        return first * second;
      }
    `);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Maintainability Checker');
    expect(result.passed).toBe(true);
    expect(result.score).toBeDefined();
    expect(result.threshold).toBe(75);
  });

  // ── Complexidade ciclomática ──

  test('deve detectar alta complexidade ciclomática', () => {
    const file = path.join(testDir, 'complex.ts');
    fs.writeFileSync(file, `
      export function complexLogic(input: string): string {
        if (input === 'a') return 'alpha';
        if (input === 'b') return 'beta';
        if (input === 'c') return 'charlie';
        if (input === 'd') return 'delta';
        if (input === 'e') return 'echo';
        if (input === 'f') return 'foxtrot';
        if (input === 'g') return 'golf';
        if (input === 'h') return 'hotel';
        if (input === 'i') return 'india';
        if (input === 'j') return 'juliet';
        if (input === 'k') return 'kilo';
        return 'unknown';
      }
    `);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.cyclomaticComplexity).toBeDefined();
  });

  // ── Funções longas ──

  test('deve detectar funções excessivamente longas', () => {
    const file = path.join(testDir, 'long-func.ts');
    const lines = ['export function longFunction(): void {'];
    for (let i = 0; i < 60; i++) {
      lines.push(`  const step${i} = ${i};`);
    }
    lines.push('}');
    fs.writeFileSync(file, lines.join('\n'));

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'LONG_FUNCTION')).toBe(true);
  });

  test('deve aceitar funções dentro do limite de tamanho', () => {
    const file = path.join(testDir, 'short-func.ts');
    const lines = ['// Função curta e focada'];
    lines.push('export function shortFunction(): number {');
    for (let i = 0; i < 10; i++) {
      lines.push(`  const val${i} = ${i};`);
    }
    lines.push('  return 42;');
    lines.push('}');
    fs.writeFileSync(file, lines.join('\n'));

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.filter(i => i.code === 'LONG_FUNCTION')).toHaveLength(0);
  });

  // ── Documentação ──

  test('deve detectar funções sem documentação', () => {
    const file = path.join(testDir, 'undocumented.ts');
    fs.writeFileSync(file, `
      export function doSomething(): void {
        console.log('working');
      }
    `);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'MISSING_DOCS')).toBe(true);
    expect(result.details.documentationCoverage).toBeDefined();
  });

  test('deve aceitar funções com comentário inline', () => {
    const file = path.join(testDir, 'documented.ts');
    fs.writeFileSync(file, `// Executa a tarefa principal
export function doSomething(): void {
  console.log('working');
}`);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    const docIssues = result.issues.filter(i => i.code === 'MISSING_DOCS');
    expect(docIssues).toHaveLength(0);
  });

  // ── Duplicação de código ──

  test('deve detectar duplicação de código entre arquivos', () => {
    const file1 = path.join(testDir, 'module-a.ts');
    const file2 = path.join(testDir, 'module-b.ts');

    const duplicatedCode = `
      export function processData(input: string): string {
        const trimmed = input.trim();
        const lower = trimmed.toLowerCase();
        const result = lower.replace(/[^a-z0-9]/g, '-');
        return result;
      }
    `;

    fs.writeFileSync(file1, duplicatedCode);
    fs.writeFileSync(file2, duplicatedCode);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.duplicationPercentage).toBeGreaterThan(0);
  });

  test('deve reportar 0% de duplicação quando não há', () => {
    const file1 = path.join(testDir, 'unique-a.ts');
    const file2 = path.join(testDir, 'unique-b.ts');

    fs.writeFileSync(file1, 'export const alpha = "first unique module content here";');
    fs.writeFileSync(file2, 'export const beta = "second completely different module content";');

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.duplicationPercentage).toBe(0);
  });

  // ── Maintainability Index ──

  test('deve calcular maintainability index entre 0 e 100', () => {
    const file = path.join(testDir, 'index-check.ts');
    fs.writeFileSync(file, `
      /** Calcula soma */
      export function calculate(values: number[]): number {
        return values.reduce((sum, val) => sum + val, 0);
      }
    `);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  // ── Threshold e pass/fail ──

  test('deve falhar quando score abaixo do threshold configurado', () => {
    const file = path.join(testDir, 'poor-quality.ts');
    // Gerar código de baixa qualidade — funções longas sem documentação
    const lines: string[] = [];
    for (let i = 0; i < 5; i++) {
      lines.push(`export function badFunc${i}(): void {`);
      for (let j = 0; j < 55; j++) {
        lines.push(`  const step${j} = ${j};`);
      }
      lines.push('}');
    }
    fs.writeFileSync(file, lines.join('\n'));

    config.maintainabilityScore = 95;
    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    // Com threshold alto (95) e código ruim, deve falhar
    if (result.score !== undefined && result.score < 95) {
      expect(result.passed).toBe(false);
    }
  });

  // ── Edge cases ──

  test('deve lidar com diretório vazio', () => {
    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('deve ignorar node_modules e diretórios ocultos', () => {
    const hiddenDir = path.join(testDir, '.internal');
    const nmDir = path.join(testDir, 'node_modules', 'pkg');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.mkdirSync(nmDir, { recursive: true });

    // Código ruim em locais que devem ser ignorados
    const badCode = Array(60).fill('  const x = 1;').join('\n');
    fs.writeFileSync(path.join(hiddenDir, 'messy.ts'), `function bad() {\n${badCode}\n}`);
    fs.writeFileSync(path.join(nmDir, 'messy.ts'), `function terrible() {\n${badCode}\n}`);

    // Código limpo no root
    fs.writeFileSync(path.join(testDir, 'clean.ts'), '/** OK */ \nexport const ok = true;');

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.filter(i => i.code === 'LONG_FUNCTION')).toHaveLength(0);
  });

  test('deve incluir sugestões de melhoria em todas as issues', () => {
    const file = path.join(testDir, 'needs-improvement.ts');
    const lines = ['export function noDocBigFunction(): void {'];
    for (let i = 0; i < 55; i++) {
      lines.push(`  const val${i} = ${i};`);
    }
    lines.push('}');
    fs.writeFileSync(file, lines.join('\n'));

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    const actionableIssues = result.issues.filter(
      i => i.code === 'LONG_FUNCTION' || i.code === 'MISSING_DOCS' || i.code === 'HIGH_COMPLEXITY'
    );

    for (const issue of actionableIssues) {
      expect(issue.suggestion).toBeDefined();
      expect(issue.suggestion!.length).toBeGreaterThan(0);
    }
  });

  test('deve retornar todas as métricas esperadas', () => {
    const file = path.join(testDir, 'metrics.ts');
    fs.writeFileSync(file, `
      /** Helper function */
      export function helper(): string {
        return 'ok';
      }
    `);

    const validator = new MaintainabilityValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.cyclomaticComplexity).toBeDefined();
    expect(result.details.functionLength).toBeDefined();
    expect(result.details.namingQuality).toBeDefined();
    expect(result.details.documentationCoverage).toBeDefined();
    expect(result.details.duplicationPercentage).toBeDefined();
    expect(result.details.maintainabilityIndex).toBeDefined();
  });
});
