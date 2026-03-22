import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from './types';
import { BaseValidator } from './validators/base';

/**
 * Interface que um plugin do Sentinel deve implementar.
 *
 * Plugins são módulos que exportam uma factory function que recebe
 * a configuração e retorna uma instância de BaseValidator.
 */
export interface SentinelPlugin {
  /** Nome do plugin para identificação */
  name: string;
  /** Versão semver do plugin */
  version: string;
  /** Factory que cria a instância do validator */
  createValidator: (config: SentinelConfig) => BaseValidator;
}

/**
 * Registro de plugins disponíveis.
 * Cada entrada mapeia o nome do plugin para sua definição.
 */
export interface PluginRegistry {
  [pluginName: string]: SentinelPlugin;
}

/**
 * Carregador de plugins do Sentinel.
 *
 * Suporta duas formas de registro:
 * 1. Programático: via register() com uma instância de SentinelPlugin
 * 2. Diretório: via loadFromDirectory() carregando arquivos .js/.ts de um diretório
 *
 * Plugins registrados são instanciados como validators e podem ser
 * adicionados ao pipeline do Sentinel.
 */
export class PluginLoader {
  private registry: PluginRegistry = {};

  /** Registra um plugin programaticamente */
  register(plugin: SentinelPlugin): void {
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a valid name');
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error(`Plugin '${plugin.name}' must have a valid version`);
    }
    if (typeof plugin.createValidator !== 'function') {
      throw new Error(`Plugin '${plugin.name}' must implement createValidator()`);
    }
    if (this.registry[plugin.name]) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }
    this.registry[plugin.name] = plugin;
  }

  /** Remove um plugin do registro */
  unregister(pluginName: string): boolean {
    if (this.registry[pluginName]) {
      delete this.registry[pluginName];
      return true;
    }
    return false;
  }

  /** Retorna todos os plugins registrados */
  getRegistered(): SentinelPlugin[] {
    return Object.values(this.registry);
  }

  /** Verifica se um plugin está registrado */
  has(pluginName: string): boolean {
    return pluginName in this.registry;
  }

  /** Retorna um plugin pelo nome */
  get(pluginName: string): SentinelPlugin | undefined {
    return this.registry[pluginName];
  }

  /** Cria instâncias de validators a partir dos plugins registrados */
  createValidators(config: SentinelConfig): BaseValidator[] {
    const validators: BaseValidator[] = [];

    for (const plugin of Object.values(this.registry)) {
      try {
        const validator = plugin.createValidator(config);
        validators.push(validator);
      } catch (error) {
        console.warn(
          `Failed to create validator from plugin '${plugin.name}': ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return validators;
  }

  /**
   * Carrega plugins de um diretório.
   * Cada arquivo .js no diretório deve exportar um SentinelPlugin.
   */
  loadFromDirectory(dirPath: string): number {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let loaded = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

      const pluginPath = path.join(dirPath, entry.name);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const module = require(pluginPath);
        const plugin: SentinelPlugin = module.default || module;

        if (plugin.name && typeof plugin.createValidator === 'function') {
          this.register(plugin);
          loaded++;
        }
      } catch (error) {
        console.warn(
          `Failed to load plugin from '${pluginPath}': ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return loaded;
  }

  /** Limpa todos os plugins registrados */
  clear(): void {
    this.registry = {};
  }
}
