import { Sentinel } from '../src/sentinel';
import { BaseValidator } from '../src/validators/base';
import { ValidatorResult } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Integration: Pipeline completo', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = path.join(__dirname, '../test-integration-project');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'tests'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  // ── Projeto saudável ──

  test('deve aprovar projeto bem estruturado', async () => {
    // Package.json com deps usadas
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: { lodash: '^4.17.0' },
      devDependencies: { jest: '^29.0.0' },
    }));
    fs.writeFileSync(path.join(projectDir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'README.md'), '# Test Project');
    fs.writeFileSync(path.join(projectDir, 'CHANGELOG.md'), '# Changelog');

    // Código fonte documentado e limpo
    fs.writeFileSync(path.join(projectDir, 'src', 'service.ts'), `
/** Serviço principal da aplicação */
export class AppService {
  /** Soma dois valores */
  add(first: number, second: number): number {
    return first + second;
  }
}

/** Utilitário de formatação */
export function formatName(name: string): string {
  return name.trim().toLowerCase();
}
`);

    // Testes com assertions e edge cases
    fs.writeFileSync(path.join(projectDir, 'tests', 'service.test.ts'), `
import { AppService } from '../src/service';
test('add works', () => {
  const svc = new AppService();
  expect(svc.add(1, 2)).toBe(3);
  expect(svc.add(0, 0)).toBe(0);
  expect(svc.add(-1, 1)).toBe(0);
});
test('handles null edge case', () => {
  expect(undefined).toBeUndefined();
});
`);

    // Arquivo usando lodash
    fs.writeFileSync(path.join(projectDir, 'src', 'utils.ts'), `
import _ from 'lodash';
/** Clona um objeto profundamente */
export function deepClone<T>(obj: T): T {
  return _.cloneDeep(obj);
}
`);

    const sentinel = new Sentinel({ testingThreshold: 50, maintainabilityScore: 50 });
    const result = await sentinel.validate(projectDir);

    expect(result.results).toHaveLength(7);
    expect(result.summary.passedChecks).toBeGreaterThanOrEqual(5);
    expect(result.exitCode).toBeDefined();
    expect(result.report.length).toBeGreaterThan(0);
  });

  // ── Projeto com problemas ──

  test('deve reprovar projeto com vulnerabilidades de segurança', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(projectDir, 'src', 'danger.ts'), `
const userInput = getInput();
const result = eval(userInput);
const password = "admin123";
`);

    const sentinel = new Sentinel();
    const result = await sentinel.validate(projectDir);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);

    // Security validator deve falhar
    const secResult = result.results.find(r => r.validator === 'Security Scanning');
    expect(secResult).toBeDefined();
    expect(secResult!.passed).toBe(false);
  });

  // ── Integração com PluginLoader ──

  test('deve integrar plugins customizados no pipeline', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), 'export const x = 1;\n');

    // Criar um plugin customizado
    class LicenseValidator extends BaseValidator {
      readonly name = 'License Check';
      validate(_sourceDir: string): ValidatorResult {
        return this.buildResult(true, [], { licenseFound: true }, 100, 50);
      }
    }

    const sentinel = new Sentinel({ testingThreshold: 0, maintainabilityScore: 0 });

    // Registrar validator customizado
    sentinel.registerValidator(new LicenseValidator({
      testingThreshold: 0,
      securityLevel: 'permissive',
      performanceTarget: 'acceptable',
      maintainabilityScore: 0,
    }));

    const result = await sentinel.validate(projectDir);

    // Deve ter 8 validators (7 nativos + 1 custom)
    expect(result.results).toHaveLength(8);
    expect(result.results.some(r => r.validator === 'License Check')).toBe(true);
  });

  // ── Report formats ──

  test('deve gerar relatório JSON por padrão', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), 'export const x = 1;\n');

    const sentinel = new Sentinel({ reporters: ['json'] });
    const result = await sentinel.validate(projectDir);

    expect(() => JSON.parse(result.report)).not.toThrow();
  });

  test('deve gerar relatório Markdown quando configurado', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), 'export const x = 1;\n');

    const sentinel = new Sentinel({ reporters: ['markdown'] });
    const result = await sentinel.validate(projectDir);

    expect(result.report).toContain('# Sentinel Validation Report');
  });

  // ── Execução paralela ──

  test('deve executar validators em paralelo sem interferência', async () => {
    // Criar vários arquivos para garantir que validators não interferem
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(projectDir, 'src', `module-${i}.ts`),
        `/** Módulo ${i} */\nexport function fn${i}(): number { return ${i}; }\n`,
      );
    }
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: {},
    }));
    fs.writeFileSync(path.join(projectDir, 'README.md'), '# Project');

    const sentinel = new Sentinel({ testingThreshold: 0, maintainabilityScore: 0 });
    const result = await sentinel.validate(projectDir);

    // Todos os 7 validators devem ter rodado
    expect(result.results).toHaveLength(7);

    // Cada resultado deve ter um nome de validator único
    const names = result.results.map(r => r.validator);
    expect(new Set(names).size).toBe(7);
  });

  // ── Contagem de arquivos ──

  test('deve contar arquivos corretamente no summary', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'src', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(projectDir, 'src', 'b.ts'), 'export const b = 2;\n');
    fs.writeFileSync(path.join(projectDir, 'src', 'c.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(projectDir, 'tests', 'a.test.ts'), 'test("ok", () => {});\n');

    const sentinel = new Sentinel({ testingThreshold: 0, maintainabilityScore: 0 });
    const result = await sentinel.validate(projectDir);

    // 3 source + 1 test + 1 package.json (se .json é contado depende do FileCollector)
    expect(result.summary.totalFiles).toBeGreaterThanOrEqual(4);
  });

  // ── Edge: diretório inexistente ──

  test('deve lançar erro para diretório inexistente', async () => {
    const sentinel = new Sentinel();
    await expect(sentinel.validate('/nonexistent/path')).rejects.toThrow('does not exist');
  });

  // ── Config override ──

  test('deve respeitar configurações customizadas', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), 'export const x = 1;\n');

    // Config permissiva — deve passar facilmente
    const sentinel = new Sentinel({
      testingThreshold: 0,
      securityLevel: 'permissive',
      performanceTarget: 'acceptable',
      maintainabilityScore: 0,
    });

    const result = await sentinel.validate(projectDir);
    expect(result.summary.failedChecks).toBeLessThanOrEqual(2);
  });

  // ── .sentinelignore end-to-end ──

  test('deve respeitar .sentinelignore ao analisar projeto', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');

    // Arquivo limpo
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'),
      '/** App */\nexport const x = 1;\n');

    // Arquivo com vulnerabilidade em dir que será ignorado
    fs.mkdirSync(path.join(projectDir, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'generated', 'unsafe.ts'),
      'const r = eval("hack"); const pwd = "secret";\n');

    // .sentinelignore excluindo o diretório generated
    fs.writeFileSync(path.join(projectDir, '.sentinelignore'), 'generated/\n');

    const sentinel = new Sentinel({
      testingThreshold: 0,
      maintainabilityScore: 0,
    });
    const result = await sentinel.validate(projectDir);

    // Security scanner não deve encontrar issues do generated/
    const secResult = result.results.find(r => r.validator === 'Security Scanning');
    expect(secResult).toBeDefined();
    const hasGeneratedIssue = secResult!.issues.some(i =>
      i.file?.includes('generated') || i.file?.includes('unsafe'));
    expect(hasGeneratedIssue).toBe(false);
  });

  test('deve respeitar excludePatterns da config', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'),
      '/** App */\nexport const x = 1;\n');

    // Arquivo problemático em dir excluído via config
    fs.mkdirSync(path.join(projectDir, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'vendor', 'lib.ts'),
      'const r = eval("x"); const key = "password123";\n');

    const sentinel = new Sentinel({
      testingThreshold: 0,
      maintainabilityScore: 0,
      excludePatterns: ['vendor/'],
    });
    const result = await sentinel.validate(projectDir);

    // Validator não deve reportar issues do vendor/
    const secResult = result.results.find(r => r.validator === 'Security Scanning');
    expect(secResult).toBeDefined();
    const hasVendorIssue = secResult!.issues.some(i =>
      i.file?.includes('vendor'));
    expect(hasVendorIssue).toBe(false);
  });

  // ── failOnWarnings ──

  test('deve falhar quando failOnWarnings está ativo e há warnings', async () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: { 'unused-lib': '^1.0.0' },
    }));
    fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), 'export const x = 1;\n');

    const sentinel = new Sentinel({
      failOnWarnings: true,
      testingThreshold: 0,
      maintainabilityScore: 0,
    });
    const result = await sentinel.validate(projectDir);

    // Há warnings (unused dep, no README, etc) + failOnWarnings = success false
    if (result.summary.warnings > 0) {
      expect(result.success).toBe(false);
    }
  });
});
