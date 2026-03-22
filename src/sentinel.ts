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
import { FileCollector } from './file-collector';
import { Reporter } from './reporter';
import { ConfigLoader } from './config';

/**
 * Motor principal do Sentinel Method.
 *
 * Orquestra o pipeline de validação com suporte a:
 * - 7 validators nativos (testing, security, performance, maintainability,
 *   dependency, documentation, code-style)
 * - Execução paralela via Promise.all
 * - Validators customizados via registerValidator()
 * - FileCollector centralizado para I/O otimizado
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

    const results = await this.runPipeline(sourceDir);
    const validationResult = this.aggregateResults(sourceDir, results);
    const report = this.generateReport(validationResult);

    return {
      ...validationResult,
      report,
    };
  }

  /**
   * Executa todos os validators em paralelo.
   * Cada validator é wrappado em uma Promise para execução concorrente.
   */
  async runPipeline(sourceDir: string): Promise<ValidatorResult[]> {
    const validatorPromises = this.validators.map(
      (validator) => Promise.resolve(validator.validate(sourceDir)),
    );

    return Promise.all(validatorPromises);
  }

  private aggregateResults(sourceDir: string, results: ValidatorResult[]): ValidationResult {
    let passedChecks = 0;
    let failedChecks = 0;
    let warnings = 0;

    const collector = new FileCollector(sourceDir);
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
