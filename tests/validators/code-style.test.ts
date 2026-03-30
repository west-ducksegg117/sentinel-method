import { CodeStyleValidator } from '../../src/validators/code-style';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('CodeStyleValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join('/tmp', 'sentinel-test-project-style');
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
    const validator = new CodeStyleValidator(config);
    expect(validator.name).toBe('Code Style');
  });

  test('deve passar com código limpo e consistente', () => {
    fs.writeFileSync(path.join(testDir, 'clean.ts'),
      'export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n',
    );

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.details.styleScore).toBeGreaterThanOrEqual(90);
  });

  // ── Console statements ──

  test('deve detectar console.log em código de produção', () => {
    fs.writeFileSync(path.join(testDir, 'debug.ts'),
      'export function process(): void {\n  console.log("debug output");\n}\n',
    );

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.consoleLogs).toBe(1);
    expect(result.issues.some(i => i.code === 'CONSOLE_STATEMENT')).toBe(true);
  });

  test('deve detectar console.warn e console.error também', () => {
    fs.writeFileSync(path.join(testDir, 'logging.ts'), [
      'console.warn("warning");',
      'console.error("error");',
      'console.debug("debug");',
    ].join('\n') + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.consoleLogs).toBe(3);
  });

  test('deve ignorar console em arquivos de teste', () => {
    fs.writeFileSync(path.join(testDir, 'app.test.ts'),
      'console.log("test output");\n',
    );

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.consoleLogs).toBe(0);
  });

  // ── TODO/FIXME comments ──

  test('deve detectar TODO comments', () => {
    fs.writeFileSync(path.join(testDir, 'todo.ts'),
      '// TODO: implement validation\nexport const x = 1;\n',
    );

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.todoComments).toBe(1);
    expect(result.issues.some(i => i.code === 'PENDING_COMMENT')).toBe(true);
  });

  test('deve detectar FIXME e HACK comments', () => {
    fs.writeFileSync(path.join(testDir, 'fixme.ts'), [
      '// FIXME: broken logic',
      '// HACK: workaround for issue #42',
      'export const y = 2;',
    ].join('\n') + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.todoComments).toBe(2);
  });

  // ── Linhas longas ──

  test('deve detectar linhas maiores que 120 caracteres', () => {
    const longLine = 'export const data = ' + '"x".repeat(100)'.padEnd(110, 'x') + ';';
    fs.writeFileSync(path.join(testDir, 'long.ts'), longLine + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.longLines).toBeGreaterThanOrEqual(1);
  });

  test('deve ignorar linhas longas de import', () => {
    const longImport = "import { VeryLongName1, VeryLongName2, VeryLongName3, VeryLongName4, VeryLongName5, VeryLongName6 } from 'some-very-long-module-name';";
    fs.writeFileSync(path.join(testDir, 'imports.ts'), longImport + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.longLines).toBe(0);
  });

  // ── Newline final ──

  test('deve detectar arquivo sem newline final', () => {
    fs.writeFileSync(path.join(testDir, 'no-newline.ts'), 'export const x = 1;');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'NO_FINAL_NEWLINE')).toBe(true);
  });

  test('deve aceitar arquivo com newline final', () => {
    fs.writeFileSync(path.join(testDir, 'with-newline.ts'), 'export const x = 1;\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.filter(i => i.code === 'NO_FINAL_NEWLINE')).toHaveLength(0);
  });

  // ── Indentação ──

  test('deve detectar mistura de tabs e spaces', () => {
    fs.writeFileSync(path.join(testDir, 'mixed.ts'), [
      'export function test(): void {',
      '  const a = 1;',  // spaces
      '\tconst b = 2;',  // tab
      '  const c = 3;',  // spaces
      '}',
    ].join('\n') + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.inconsistentIndentation).toBeGreaterThan(0);
    expect(result.issues.some(i => i.code === 'INCONSISTENT_INDENT')).toBe(true);
  });

  // ── Score ──

  test('deve calcular score com penalidades proporcionais', () => {
    fs.writeFileSync(path.join(testDir, 'messy.ts'), [
      'console.log("1");',
      'console.log("2");',
      '// TODO: fix this',
      '// FIXME: and this',
      'export const x = 1;',
    ].join('\n') + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    // 2 console = -10, 2 todos = -4 → score 86
    expect(result.details.styleScore).toBeLessThan(90);
    expect(result.details.styleScore).toBeGreaterThan(0);
  });

  test('score não deve ficar negativo com muitas issues', () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`console.log("debug ${i}");`);
    }
    fs.writeFileSync(path.join(testDir, 'terrible.ts'), lines.join('\n') + '\n');

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.styleScore).toBeGreaterThanOrEqual(0);
  });

  // ── Edge cases ──

  test('deve lidar com diretório vazio', () => {
    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.details.filesAnalyzed).toBe(0);
  });

  test('deve incluir sugestões em issues de estilo', () => {
    fs.writeFileSync(path.join(testDir, 'suggestions.ts'),
      'console.log("test");\n// TODO: remove\n',
    );

    const validator = new CodeStyleValidator(config);
    const result = validator.validate(testDir);

    for (const issue of result.issues) {
      expect(issue.suggestion).toBeDefined();
    }
  });
});
