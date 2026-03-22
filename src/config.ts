import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from './types';

/**
 * Regra de validação para um campo de configuração.
 * Cada regra define field, condição de invalidade, e mensagem de erro.
 */
interface ValidationRule {
  field: string;
  check: (value: any, config: SentinelConfig) => boolean;
  message: string;
}

/** Resultado da validação com lista de erros e warnings */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * ConfigLoader — Carrega, valida e normaliza configurações do Sentinel.
 *
 * Suporta:
 * - .sentinelrc.json (padrão)
 * - .sentinelrc (JSON sem extensão)
 * - sentinel.config.json
 * - Campo "sentinel" no package.json
 * - Arquivo passado por parâmetro
 */
export class ConfigLoader {
  private readonly defaultConfig: SentinelConfig = {
    testingThreshold: 80,
    securityLevel: 'strict',
    performanceTarget: 'optimal',
    maintainabilityScore: 75,
    excludePatterns: ['node_modules', 'dist', 'coverage'],
    reporters: ['console', 'json'],
    failOnWarnings: false,
  };

  /** Nomes de arquivo de configuração reconhecidos, em ordem de prioridade */
  private readonly configFileNames = [
    '.sentinelrc.json',
    '.sentinelrc',
    'sentinel.config.json',
  ];

  /** Regras de validação do schema */
  private readonly validationRules: ValidationRule[] = [
    {
      field: 'testingThreshold',
      check: (v) => typeof v === 'number' && v >= 0 && v <= 100,
      message: 'testingThreshold deve ser um número entre 0 e 100',
    },
    {
      field: 'securityLevel',
      check: (v) => ['strict', 'moderate', 'permissive'].includes(v),
      message: 'securityLevel deve ser: strict, moderate ou permissive',
    },
    {
      field: 'performanceTarget',
      check: (v) => ['optimal', 'good', 'acceptable'].includes(v),
      message: 'performanceTarget deve ser: optimal, good ou acceptable',
    },
    {
      field: 'maintainabilityScore',
      check: (v) => typeof v === 'number' && v >= 0 && v <= 100,
      message: 'maintainabilityScore deve ser um número entre 0 e 100',
    },
    {
      field: 'excludePatterns',
      check: (v) => !v || (Array.isArray(v) && v.every((p: any) => typeof p === 'string')),
      message: 'excludePatterns deve ser um array de strings',
    },
    {
      field: 'reporters',
      check: (v) => !v || (Array.isArray(v) && v.every((r: any) => ['json', 'markdown', 'console'].includes(r))),
      message: 'reporters deve ser um array de: json, markdown, console',
    },
    {
      field: 'failOnWarnings',
      check: (v) => v === undefined || typeof v === 'boolean',
      message: 'failOnWarnings deve ser um boolean',
    },
  ];

  /** Retorna a configuração padrão */
  getDefaults(): SentinelConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Carrega configuração de arquivo específico ou auto-detecta.
   * Sempre valida e mergeia com defaults.
   */
  load(configPath?: string): SentinelConfig {
    let rawConfig: Partial<SentinelConfig> = {};

    if (configPath) {
      rawConfig = this.loadFromFile(configPath);
    } else {
      rawConfig = this.autoDetect();
    }

    const merged = this.merge(rawConfig);
    const validation = this.validateConfig(merged);

    if (!validation.valid) {
      throw new Error(
        `Configuração inválida:\n${validation.errors.map(e => `  • ${e}`).join('\n')}`,
      );
    }

    return merged;
  }

  /**
   * Valida uma configuração completa e retorna resultado detalhado.
   * Mantém compatibilidade com o método validate() anterior (throws).
   */
  validate(config: SentinelConfig): boolean {
    const result = this.validateConfig(config);
    if (!result.valid) {
      throw new Error(result.errors[0]);
    }
    return true;
  }

  /** Validação detalhada sem throw — retorna resultado estruturado */
  validateConfig(config: SentinelConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of this.validationRules) {
      const value = (config as any)[rule.field];

      // Campo obrigatório presente no default
      if (value === undefined && rule.field in this.defaultConfig) {
        continue; // será preenchido pelo merge
      }

      if (value !== undefined && !rule.check(value, config)) {
        errors.push(`${rule.field}: ${rule.message} (recebido: ${JSON.stringify(value)})`);
      }
    }

    // Warnings (não bloqueiam, mas avisam)
    if (config.testingThreshold !== undefined && config.testingThreshold < 50) {
      warnings.push('testingThreshold abaixo de 50% — cobertura de testes pode ser insuficiente');
    }

    if (config.maintainabilityScore !== undefined && config.maintainabilityScore < 40) {
      warnings.push('maintainabilityScore abaixo de 40% — limiar de qualidade muito baixo');
    }

    if (config.securityLevel === 'permissive') {
      warnings.push('securityLevel "permissive" — apenas injection risks serão bloqueados');
    }

    // Detectar campos desconhecidos
    const knownFields = new Set([
      'testingThreshold', 'securityLevel', 'performanceTarget',
      'maintainabilityScore', 'excludePatterns', 'reporters', 'failOnWarnings',
    ]);
    for (const key of Object.keys(config)) {
      if (!knownFields.has(key)) {
        warnings.push(`Campo desconhecido: "${key}" — será ignorado`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /** Merge parcial com defaults, garantindo todos os campos */
  merge(partial: Partial<SentinelConfig>): SentinelConfig {
    return {
      ...this.defaultConfig,
      ...partial,
      // Garantir que arrays tenham fallback
      excludePatterns: partial.excludePatterns ?? this.defaultConfig.excludePatterns,
      reporters: partial.reporters ?? this.defaultConfig.reporters,
    };
  }

  /** Auto-detecta arquivo de configuração no cwd */
  private autoDetect(): Partial<SentinelConfig> {
    const cwd = process.cwd();

    // Tentar cada nome de arquivo, em ordem de prioridade
    for (const fileName of this.configFileNames) {
      const filePath = path.join(cwd, fileName);
      if (fs.existsSync(filePath)) {
        return this.loadFromFile(filePath);
      }
    }

    // Tentar campo "sentinel" no package.json
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.sentinel && typeof pkg.sentinel === 'object') {
          return pkg.sentinel as Partial<SentinelConfig>;
        }
      } catch {
        // package.json malformado — ignorar
      }
    }

    return {};
  }

  /** Carrega JSON de arquivo com tratamento de erro */
  private loadFromFile(filePath: string): Partial<SentinelConfig> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo de configuração não encontrado: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Configuração deve ser um objeto JSON válido: ${filePath}`);
      }

      return parsed as Partial<SentinelConfig>;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`JSON inválido em ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }
}
