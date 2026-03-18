import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, TestingMetrics, SentinelConfig } from '../types';

export class TestingValidator {
  constructor(private config: SentinelConfig) {}

  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeTestCoverage(sourceDir, issues);

    const score = metrics.qualityScore;
    const threshold = this.config.testingThreshold;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return {
      validator: 'Testing Coverage',
      passed,
      score,
      threshold,
      issues,
      details: metrics,
    };
  }

  private analyzeTestCoverage(sourceDir: string, issues: ValidationIssue[]): TestingMetrics {
    let testFiles = 0;
    let assertions = 0;
    let edgeCases = 0;
    let coverage = 0;

    try {
      const files = this.getAllFiles(sourceDir);
      const testFileCount = files.filter(f => f.endsWith('.test.ts') || f.endsWith('.spec.ts')).length;
      const sourceFileCount = files.filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')).length;

      if (sourceFileCount === 0) {
        issues.push({
          severity: 'error',
          code: 'NO_SOURCE_FILES',
          message: 'No source files found in the specified directory',
        });
        return { coverage: 0, assertions: 0, testFiles: 0, edgeCases: 0, qualityScore: 0 };
      }

      testFiles = testFileCount;

      if (testFileCount === 0) {
        issues.push({
          severity: 'error',
          code: 'NO_TESTS',
          message: 'No test files found (*.test.ts or *.spec.ts)',
        });
      }

      coverage = Math.min((testFileCount / sourceFileCount) * 100, 100);

      for (const file of files.filter(f => f.endsWith('.test.ts') || f.endsWith('.spec.ts'))) {
        const content = fs.readFileSync(file, 'utf-8');
        assertions += (content.match(/expect\(/g) || []).length;
        edgeCases += (content.match(/edge|boundary|corner|null|undefined/gi) || []).length;
      }

      if (assertions === 0) {
        issues.push({
          severity: 'warning',
          code: 'NO_ASSERTIONS',
          message: 'No assertions found in test files',
        });
      }

      if (edgeCases < assertions * 0.1) {
        issues.push({
          severity: 'warning',
          code: 'LOW_EDGE_CASES',
          message: 'Edge case coverage is low. Consider adding more edge case tests.',
          suggestion: 'Add tests for boundary conditions and null/undefined cases',
        });
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'ANALYSIS_ERROR',
        message: `Error analyzing test coverage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    const qualityScore = Math.round((coverage + (assertions > 0 ? 20 : 0) + (edgeCases > 0 ? 10 : 0)) / 1.3);

    return {
      coverage: Math.round(coverage),
      assertions,
      testFiles,
      edgeCases,
      qualityScore: Math.min(qualityScore, 100),
    };
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];

    const traverse = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };

    traverse(dir);
    return files;
  }
}
