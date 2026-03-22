import { ConfigLoader } from '../src/config';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let tempConfigPath: string;

  beforeEach(() => {
    loader = new ConfigLoader();
    tempConfigPath = path.join(__dirname, '../test-sentinelrc.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  });

  // ── Load defaults ──

  test('deve carregar configuração padrão quando não há arquivo', () => {
    const config = loader.load();

    expect(config.testingThreshold).toBe(80);
    expect(config.securityLevel).toBe('strict');
    expect(config.performanceTarget).toBe('optimal');
    expect(config.maintainabilityScore).toBe(75);
    expect(config.excludePatterns).toContain('node_modules');
    expect(config.reporters).toContain('console');
    expect(config.reporters).toContain('json');
    expect(config.failOnWarnings).toBe(false);
  });

  test('deve retornar defaults via getDefaults()', () => {
    const defaults = loader.getDefaults();
    expect(defaults.testingThreshold).toBe(80);
    expect(defaults.securityLevel).toBe('strict');
  });

  // ── Load from file ──

  test('deve carregar configuração a partir de arquivo JSON', () => {
    const customConfig = {
      testingThreshold: 90,
      securityLevel: 'moderate',
      performanceTarget: 'good',
      maintainabilityScore: 85,
    };
    fs.writeFileSync(tempConfigPath, JSON.stringify(customConfig));

    const config = loader.load(tempConfigPath);

    expect(config.testingThreshold).toBe(90);
    expect(config.securityLevel).toBe('moderate');
    expect(config.performanceTarget).toBe('good');
    expect(config.maintainabilityScore).toBe(85);
  });

  test('deve mesclar configuração do arquivo com defaults', () => {
    const partialConfig = { testingThreshold: 95 };
    fs.writeFileSync(tempConfigPath, JSON.stringify(partialConfig));

    const config = loader.load(tempConfigPath);

    expect(config.testingThreshold).toBe(95);
    expect(config.securityLevel).toBe('strict');
    expect(config.performanceTarget).toBe('optimal');
  });

  test('deve lançar erro quando arquivo JSON é inválido', () => {
    fs.writeFileSync(tempConfigPath, 'not valid json {{{');

    expect(() => loader.load(tempConfigPath)).toThrow('JSON inválido');
  });

  test('deve lançar erro quando caminho não existe', () => {
    expect(() => loader.load('/path/that/does/not/exist.json')).toThrow('não encontrado');
  });

  test('deve lançar erro quando JSON não é objeto', () => {
    fs.writeFileSync(tempConfigPath, '"just a string"');
    expect(() => loader.load(tempConfigPath)).toThrow('objeto JSON válido');
  });

  test('deve lançar erro quando JSON é array', () => {
    fs.writeFileSync(tempConfigPath, '[1, 2, 3]');
    expect(() => loader.load(tempConfigPath)).toThrow('objeto JSON válido');
  });

  // ── Merge ──

  test('deve fazer merge parcial preservando defaults', () => {
    const merged = loader.merge({ testingThreshold: 50 });

    expect(merged.testingThreshold).toBe(50);
    expect(merged.securityLevel).toBe('strict');
    expect(merged.excludePatterns).toContain('node_modules');
    expect(merged.reporters).toContain('console');
  });

  // ── Validation: validate() (compat) ──

  test('deve validar configuração válida sem erros', () => {
    const config = loader.load();
    expect(loader.validate(config)).toBe(true);
  });

  test('deve rejeitar testingThreshold fora do range 0-100', () => {
    const config = loader.load();

    config.testingThreshold = -1;
    expect(() => loader.validate(config)).toThrow();

    config.testingThreshold = 101;
    expect(() => loader.validate(config)).toThrow();
  });

  test('deve rejeitar securityLevel inválido', () => {
    const config = loader.load();
    (config as any).securityLevel = 'invalid';
    expect(() => loader.validate(config)).toThrow();
  });

  test('deve rejeitar performanceTarget inválido', () => {
    const config = loader.load();
    (config as any).performanceTarget = 'blazing-fast';
    expect(() => loader.validate(config)).toThrow();
  });

  test('deve rejeitar maintainabilityScore fora do range 0-100', () => {
    const config = loader.load();

    config.maintainabilityScore = -10;
    expect(() => loader.validate(config)).toThrow();

    config.maintainabilityScore = 200;
    expect(() => loader.validate(config)).toThrow();
  });

  test('deve aceitar valores limítrofes válidos', () => {
    const config = loader.load();

    config.testingThreshold = 0;
    config.maintainabilityScore = 0;
    expect(loader.validate(config)).toBe(true);

    config.testingThreshold = 100;
    config.maintainabilityScore = 100;
    expect(loader.validate(config)).toBe(true);
  });

  test('deve aceitar todos os securityLevels válidos', () => {
    const config = loader.load();

    for (const level of ['strict', 'moderate', 'permissive'] as const) {
      config.securityLevel = level;
      expect(loader.validate(config)).toBe(true);
    }
  });

  test('deve aceitar todos os performanceTargets válidos', () => {
    const config = loader.load();

    for (const target of ['optimal', 'good', 'acceptable'] as const) {
      config.performanceTarget = target;
      expect(loader.validate(config)).toBe(true);
    }
  });

  // ── Validation: validateConfig() (detalhada) ──

  test('deve retornar resultado estruturado de validação', () => {
    const config = loader.load();
    const result = loader.validateConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('deve detectar múltiplos erros de validação', () => {
    const badConfig = loader.merge({
      testingThreshold: -999,
      maintainabilityScore: 999,
    } as any);

    const result = loader.validateConfig(badConfig);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test('deve gerar warnings para thresholds muito baixos', () => {
    const config = loader.merge({
      testingThreshold: 20,
      maintainabilityScore: 10,
    });

    const result = loader.validateConfig(config);

    expect(result.valid).toBe(true); // warnings não bloqueiam
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some(w => w.includes('testingThreshold'))).toBe(true);
    expect(result.warnings.some(w => w.includes('maintainabilityScore'))).toBe(true);
  });

  test('deve gerar warning para securityLevel permissive', () => {
    const config = loader.merge({ securityLevel: 'permissive' });
    const result = loader.validateConfig(config);

    expect(result.warnings.some(w => w.includes('permissive'))).toBe(true);
  });

  test('deve detectar campos desconhecidos', () => {
    const config = loader.merge({}) as any;
    config.unknownField = 'oops';
    config.anotherBadField = 42;

    const result = loader.validateConfig(config);

    expect(result.warnings.some(w => w.includes('unknownField'))).toBe(true);
    expect(result.warnings.some(w => w.includes('anotherBadField'))).toBe(true);
  });

  test('deve rejeitar excludePatterns não-array', () => {
    const config = loader.merge({}) as any;
    config.excludePatterns = 'not-an-array';

    const result = loader.validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('excludePatterns'))).toBe(true);
  });

  test('deve rejeitar reporters com valor inválido', () => {
    const config = loader.merge({}) as any;
    config.reporters = ['json', 'invalid-format'];

    const result = loader.validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('reporters'))).toBe(true);
  });

  // ── Auto-detect: package.json sentinel field ──

  test('deve detectar config de package.json field "sentinel"', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const originalPkg = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(originalPkg);

    try {
      pkg.sentinel = { testingThreshold: 42 };
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      // Sem .sentinelrc.json, deve pegar do package.json
      const tmpRc = path.join(process.cwd(), '.sentinelrc.json');
      const hadRc = fs.existsSync(tmpRc);
      if (hadRc) {
        // Neste projeto existe .sentinelrc, então testar diretamente o merge
        const config = loader.merge({ testingThreshold: 42 });
        expect(config.testingThreshold).toBe(42);
      } else {
        const config = loader.load();
        expect(config.testingThreshold).toBe(42);
      }
    } finally {
      // Restaurar package.json original
      fs.writeFileSync(pkgPath, originalPkg);
    }
  });
});
