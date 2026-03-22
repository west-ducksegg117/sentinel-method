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
    // Defaults devem prevalecer para campos não especificados
    expect(config.securityLevel).toBe('strict');
    expect(config.performanceTarget).toBe('optimal');
  });

  test('deve usar defaults quando arquivo JSON é inválido', () => {
    fs.writeFileSync(tempConfigPath, 'not valid json {{{');

    const config = loader.load(tempConfigPath);

    // Deve fazer fallback para defaults sem lançar erro
    expect(config.testingThreshold).toBe(80);
    expect(config.securityLevel).toBe('strict');
  });

  test('deve usar defaults quando caminho não existe', () => {
    const config = loader.load('/path/that/does/not/exist.json');

    expect(config.testingThreshold).toBe(80);
  });

  // ── Validation ──

  test('deve validar configuração válida sem erros', () => {
    const config = loader.load();
    expect(loader.validate(config)).toBe(true);
  });

  test('deve rejeitar testingThreshold fora do range 0-100', () => {
    const config = loader.load();

    config.testingThreshold = -1;
    expect(() => loader.validate(config)).toThrow('testingThreshold must be between 0 and 100');

    config.testingThreshold = 101;
    expect(() => loader.validate(config)).toThrow('testingThreshold must be between 0 and 100');
  });

  test('deve rejeitar testingThreshold não inteiro', () => {
    const config = loader.load();
    config.testingThreshold = 80.5;
    expect(() => loader.validate(config)).toThrow('testingThreshold must be between 0 and 100');
  });

  test('deve rejeitar securityLevel inválido', () => {
    const config = loader.load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).securityLevel = 'invalid';
    expect(() => loader.validate(config)).toThrow('securityLevel must be strict, moderate, or permissive');
  });

  test('deve rejeitar performanceTarget inválido', () => {
    const config = loader.load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).performanceTarget = 'blazing-fast';
    expect(() => loader.validate(config)).toThrow('performanceTarget must be optimal, good, or acceptable');
  });

  test('deve rejeitar maintainabilityScore fora do range 0-100', () => {
    const config = loader.load();

    config.maintainabilityScore = -10;
    expect(() => loader.validate(config)).toThrow('maintainabilityScore must be between 0 and 100');

    config.maintainabilityScore = 200;
    expect(() => loader.validate(config)).toThrow('maintainabilityScore must be between 0 and 100');
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
});
