import * as fs from 'fs';
import { SentinelConfig, ValidationResult, ValidatorResult } from './types';
import { BaseValidator } from './validators/base';
import { TestingValidator } from './validators/testing';
import { SecurityValidator } from './validators/security';
import { PerformanceValidator } from './validators/performance';
import { MaintainabilityValidator } from './validators/maintainability';
import { DependencyValidator } from './validators/dependency';
import { DocumentationValidator } from './validators/documentation';
import { CodeStyleValidator } from './validators/code-style';
import { ArchitectureValidator } from './validators/architecture';
import { ApiContractValidator } from './validators/api-contract';
import { AccessibilityValidator } from './validators/accessibility';
import { I18nValidator } from './validators/i18n';
import { ErrorHandlingValidator } from './validators/error-handling';
import { TypeSafetyValidator } from './validators/type-safety';
import { DeadCodeValidator } from './validators/dead-code';
import { FileCollector } from './file-collector';
import { Reporter } from './reporter';
import { ConfigLoader } from './config';

/**
 * Motor principal do Sentinel Method.
 *
 * Orquestra o pipeline de validação com suporte a:
 * - 14 validators nativos (testing, security, performance, maintainability,
 *   dependency, documentation, code-style, architecture, api-contract,
 *   accessibility, i18n, error-handling, type-safety, dead-code)
 * - Execução paralela via Promise.all
 * - Error recovery por validator (um erro não interrompe os demais)
 * - Validators customizados via registerValidator()
 * - FileCollector centralizado para I/O otimizado
 * - Timing de execução (duration em ms)
 */
export class Sentinel {
  private config: SentinelConfig;
  private reporter: Reporter;
  private configLoader: ConfigLoader;
  private validators: BaseValidator[] = [];

  constructor(config?: Partial<SentinelConfig>) {
    this.configLoader = new ConfigLoader();
    this.config = { ...this.configLoader.load(), ...config };
    this.configLoader.validate(this.config);
    this.reporter = new Reporter();

    // Registrar validators nativos
    this.validators = [
      new TestingValidator(this.config),
      new SecurityValidator(this.config),
      new PerformanceValidator(this.config),
      new MaintainabilityValidator(this.config),
      new DependencyValidator(this.config),
      new DocumentationValidator(this.config),
      new CodeStyleValidator(this.config),
      new ArchitectureValidator(this.config),
      new ApiContractValidator(this.config),
      new AccessibilityValidator(this.config),
      new I18nValidator(this.config),
      new ErrorHandlingValidator(this.config),
      new TypeSafetyValidator(this.config),
      new DeadCodeValidator(this.config),
    ];
  }

  /** Registra um validator customizado no pipeline */
  registerValidator(validator: BaseValidator): void {
    this.validators.push(validator);
  }

  /** Retorna a lista de validators registrados */
  getValidators(): BaseValidator[] {
    return [...this.validators];
  }

  async validate(sourceDir: string): Promise<ValidationResult> {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    const startTime = Date.now();
    const results = await this.runPipeline(sourceDir);
    const duration = Date.now() - startTime;

    const validationResult = this.aggregateResults(sourceDir, results, duration);
    const report = this.generateReport(validationResult);

    return {
      ...validationResult,
      report,
    };
  }

  /**
   * Executa todos os validators em paralelo.
   * Cada validator é wrappado com error recovery — se um validator
   * falhar com exceção, gera um resultado de erro sem interromper os demais.
   */
  async runPipeline(sourceDir: string): Promise<ValidatorResult[]> {
    const validatorPromises = this.validators.map(
      (validator) => Promise.resolve().then(() => {
        try {
          return validator.validate(sourceDir);
        } catch (error) {
          // Error recovery: gera resultado de falha para o validator
          return {
            validator: validator.name,
            passed: false,
            issues: [{
              severity: 'error' as const,
              code: 'VALIDATOR_ERROR',
              message: `Validator falhou: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
            }],
            details: {
              error: true,
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }),
    );

    return Promise.all(validatorPromises);
  }

  private aggregateResults(
    sourceDir: string,
    results: ValidatorResult[],
    duration: number,
  ): ValidationResult {
    let passedChecks = 0;
    let failedChecks = 0;
    let warnings = 0;

    const collector = new FileCollector(sourceDir, this.config.excludePatterns);
    const totalFiles = collector.getCodeFiles().length;

    for (const result of results) {
      if (result.passed) {
        passedChecks++;
      } else {
        failedChecks++;
      }

      for (const issue of result.issues) {
        if (issue.severity === 'warning') {
          warnings++;
        }
      }
    }

    const success = failedChecks === 0 && (!this.config.failOnWarnings || warnings === 0);
    const exitCode = success ? 0 : 1;

    return {
      success,
      timestamp: new Date().toISOString(),
      sourceDirectory: sourceDir,
      duration,
      summary: {
        totalFiles,
        passedChecks,
        failedChecks,
        warnings,
      },
      results,
      report: '',
      exitCode,
    };
  }

  generateReport(result: ValidationResult): string {
    const format = this.config.reporters?.includes('markdown') ? 'markdown' : 'json';
    const reportObj = this.reporter.format(result, format as any);
    return reportObj.content;
  }
}
