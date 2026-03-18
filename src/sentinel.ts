import * as fs from 'fs';
import { SentinelConfig, ValidationResult, ValidatorResult } from './types';
import { TestingValidator } from './validators/testing';
import { SecurityValidator } from './validators/security';
import { PerformanceValidator } from './validators/performance';
import { MaintainabilityValidator } from './validators/maintainability';
import { Reporter } from './reporter';
import { ConfigLoader } from './config';

export class Sentinel {
  private config: SentinelConfig;
  private reporter: Reporter;
  private configLoader: ConfigLoader;
  private testingValidator: TestingValidator;
  private securityValidator: SecurityValidator;
  private performanceValidator: PerformanceValidator;
  private maintainabilityValidator: MaintainabilityValidator;

  constructor(config?: Partial<SentinelConfig>) {
    this.configLoader = new ConfigLoader();
    this.config = { ...this.configLoader.load(), ...config };
    this.configLoader.validate(this.config);
    this.reporter = new Reporter();

    this.testingValidator = new TestingValidator(this.config);
    this.securityValidator = new SecurityValidator(this.config);
    this.performanceValidator = new PerformanceValidator(this.config);
    this.maintainabilityValidator = new MaintainabilityValidator(this.config);
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

  async runPipeline(sourceDir: string): Promise<ValidatorResult[]> {
    const results: ValidatorResult[] = [];

    results.push(this.testingValidator.validate(sourceDir));
    results.push(this.securityValidator.validate(sourceDir));
    results.push(this.performanceValidator.validate(sourceDir));
    results.push(this.maintainabilityValidator.validate(sourceDir));

    return results;
  }

  private aggregateResults(sourceDir: string, results: ValidatorResult[]): ValidationResult {
    let passedChecks = 0;
    let failedChecks = 0;
    let warnings = 0;
    const totalFiles = this.countFiles(sourceDir);

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

  private countFiles(sourceDir: string): number {
    let count = 0;

    const traverse = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullPath = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          count++;
        }
      }
    };

    traverse(sourceDir);
    return count;
  }
}
