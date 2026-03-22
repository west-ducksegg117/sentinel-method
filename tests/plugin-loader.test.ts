import { PluginLoader, SentinelPlugin } from '../src/plugin-loader';
import { BaseValidator } from '../src/validators/base';
import { ValidatorResult, SentinelConfig } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

// Mock de um validator customizado para testes
class MockValidator extends BaseValidator {
  readonly name = 'Mock Validator';

  validate(_sourceDir: string): ValidatorResult {
    return this.buildResult(true, [], { status: 'ok' }, 100, 70);
  }
}

// Factory de plugin válido
const createMockPlugin = (name: string = 'mock-plugin'): SentinelPlugin => ({
  name,
  version: '1.0.0',
  createValidator: (config: SentinelConfig) => new MockValidator(config),
});

describe('PluginLoader', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  // ── Registro programático ──

  test('deve registrar um plugin válido', () => {
    const plugin = createMockPlugin();
    loader.register(plugin);

    expect(loader.has('mock-plugin')).toBe(true);
    expect(loader.getRegistered()).toHaveLength(1);
  });

  test('deve rejeitar plugin sem nome', () => {
    const plugin = { name: '', version: '1.0.0', createValidator: () => new MockValidator({} as any) };
    expect(() => loader.register(plugin)).toThrow('valid name');
  });

  test('deve rejeitar plugin sem versão', () => {
    const plugin = { name: 'test', version: '', createValidator: () => new MockValidator({} as any) };
    expect(() => loader.register(plugin)).toThrow('valid version');
  });

  test('deve rejeitar plugin sem createValidator', () => {
    const plugin = { name: 'test', version: '1.0.0' } as any;
    expect(() => loader.register(plugin)).toThrow('createValidator');
  });

  test('deve rejeitar plugin com nome duplicado', () => {
    loader.register(createMockPlugin('unique'));
    expect(() => loader.register(createMockPlugin('unique'))).toThrow('already registered');
  });

  // ── Remoção ──

  test('deve remover um plugin registrado', () => {
    loader.register(createMockPlugin());
    expect(loader.unregister('mock-plugin')).toBe(true);
    expect(loader.has('mock-plugin')).toBe(false);
  });

  test('deve retornar false ao remover plugin inexistente', () => {
    expect(loader.unregister('nonexistent')).toBe(false);
  });

  // ── Consulta ──

  test('deve retornar plugin pelo nome', () => {
    const plugin = createMockPlugin('my-plugin');
    loader.register(plugin);

    const retrieved = loader.get('my-plugin');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('my-plugin');
    expect(retrieved!.version).toBe('1.0.0');
  });

  test('deve retornar undefined para plugin inexistente', () => {
    expect(loader.get('ghost')).toBeUndefined();
  });

  test('deve listar todos os plugins registrados', () => {
    loader.register(createMockPlugin('plugin-a'));
    loader.register(createMockPlugin('plugin-b'));
    loader.register(createMockPlugin('plugin-c'));

    expect(loader.getRegistered()).toHaveLength(3);
  });

  // ── Criação de validators ──

  test('deve criar validators a partir dos plugins registrados', () => {
    loader.register(createMockPlugin('v1'));
    loader.register(createMockPlugin('v2'));

    const config: SentinelConfig = {
      testingThreshold: 80,
      securityLevel: 'strict',
      performanceTarget: 'optimal',
      maintainabilityScore: 75,
    };

    const validators = loader.createValidators(config);
    expect(validators).toHaveLength(2);
    expect(validators[0]).toBeInstanceOf(BaseValidator);
  });

  test('deve continuar mesmo se um plugin falhar ao criar validator', () => {
    const badPlugin: SentinelPlugin = {
      name: 'bad-plugin',
      version: '1.0.0',
      createValidator: () => { throw new Error('factory error'); },
    };

    loader.register(createMockPlugin('good'));
    loader.register(badPlugin);

    const config: SentinelConfig = {
      testingThreshold: 80,
      securityLevel: 'strict',
      performanceTarget: 'optimal',
      maintainabilityScore: 75,
    };

    const validators = loader.createValidators(config);
    expect(validators).toHaveLength(1); // só o bom
  });

  // ── Limpar registro ──

  test('deve limpar todos os plugins', () => {
    loader.register(createMockPlugin('a'));
    loader.register(createMockPlugin('b'));
    loader.clear();

    expect(loader.getRegistered()).toHaveLength(0);
    expect(loader.has('a')).toBe(false);
  });

  // ── Carregamento por diretório ──

  test('deve retornar 0 para diretório inexistente', () => {
    const count = loader.loadFromDirectory('/path/that/does/not/exist');
    expect(count).toBe(0);
  });

  test('deve carregar plugins de um diretório', () => {
    const pluginDir = path.join(__dirname, '../test-plugins');
    fs.mkdirSync(pluginDir, { recursive: true });

    // Criar um plugin JS válido
    const pluginCode = `
      module.exports = {
        name: 'file-plugin',
        version: '1.0.0',
        createValidator: function(config) {
          return {
            name: 'File Plugin',
            config: config,
            validate: function() { return { validator: 'File Plugin', passed: true, issues: [], details: {} }; },
            getAllFiles: function() { return []; },
            getSourceFiles: function() { return []; },
            createIssue: function() { return {}; },
            buildResult: function() { return {}; },
          };
        }
      };
    `;
    fs.writeFileSync(path.join(pluginDir, 'test-plugin.js'), pluginCode);

    const loaded = loader.loadFromDirectory(pluginDir);
    expect(loaded).toBe(1);
    expect(loader.has('file-plugin')).toBe(true);

    // Cleanup
    fs.rmSync(pluginDir, { recursive: true });
  });

  test('deve ignorar arquivos não-JS no diretório de plugins', () => {
    const pluginDir = path.join(__dirname, '../test-plugins-ignore');
    fs.mkdirSync(pluginDir, { recursive: true });

    fs.writeFileSync(path.join(pluginDir, 'readme.md'), '# Plugins');
    fs.writeFileSync(path.join(pluginDir, 'config.json'), '{}');

    const loaded = loader.loadFromDirectory(pluginDir);
    expect(loaded).toBe(0);

    fs.rmSync(pluginDir, { recursive: true });
  });
});
