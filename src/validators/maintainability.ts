import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, MaintainabilityMetrics, SentinelConfig } from '../types';

export class MaintainabilityValidator {
  private readonly maxFunctionLength = 50;
  private readonly maxCyclomaticComplexity = 10;

  constructor(private config: SentinelConfig) {}

  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeMaintainability(sourceDir, issues);

    const score = metrics.maintainabilityIndex;
    const threshold = this.config.maintainabilityScore;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return {
      validator: 'Maintainability Checker',
      passed,
      score,
      threshold,
      issues,
      details: metrics,
    };
  }

  private analyzeMaintainability(sourceDir: string, issues: ValidationIssue[]): MaintainabilityMetrics {
    let totalCyclomaticComplexity = 0;
    let complexFunctions = 0;
    let longFunctions = 0;
    let namingIssues = 0;
    let missingDocs = 0;
    let functionCount = 0;
    let duplicationPercentage = 0;

    try {
      const files = this.getAllFiles(sourceDir);
      const fileContents = new Map<string, string>();

      for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.js'))) {
        const content = fs.readFileSync(file, 'utf-8');
        fileContents.set(file, content);
      }

      for (const [file, content] of fileContents) {
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          // Check for function definitions
          if (/^\s*(export\s+)?(async\s+)?function\s+|^\s*const\s+\w+\s*=\s*(\(|async\s*\()/g.test(line)) {
            functionCount++;

            // Calculate cyclomatic complexity
            const complexity = this.calculateComplexity(line);
            totalCyclomaticComplexity += complexity;

            if (complexity > this.maxCyclomaticComplexity) {
              complexFunctions++;
              issues.push({
                severity: 'warning',
                code: 'HIGH_COMPLEXITY',
                message: `Function has cyclomatic complexity of ${complexity} (threshold: ${this.maxCyclomaticComplexity})`,
                file,
                line: lineNum + 1,
                suggestion: 'Consider breaking down this function into smaller, more focused functions',
              });
            }

            // Check function length
            const funcLength = this.getFunctionLength(lines, lineNum);
            if (funcLength > this.maxFunctionLength) {
              longFunctions++;
              issues.push({
                severity: 'warning',
                code: 'LONG_FUNCTION',
                message: `Function is ${funcLength} lines long (threshold: ${this.maxFunctionLength})`,
                file,
                line: lineNum + 1,
                suggestion: 'Consider refactoring into smaller functions with single responsibility',
              });
            }

            // Check for documentation
            if (lineNum > 0 && !/^\s*\/\//g.test(lines[lineNum - 1]) && !/^\s*\/\*/g.test(lines[lineNum - 1])) {
              missingDocs++;
              issues.push({
                severity: 'info',
                code: 'MISSING_DOCS',
                message: 'Function lacks documentation comment',
                file,
                line: lineNum + 1,
                suggestion: 'Add JSDoc or inline comments explaining function purpose and parameters',
              });
            }
          }

          // Check naming conventions
          const varMatch = line.match(/const\s+([a-z_$][a-z0-9_$]*)|let\s+([a-z_$][a-z0-9_$]*)/gi);
          if (varMatch) {
            for (const match of varMatch) {
              const varName = match.split(/\s+/)[1];
              if (varName.length < 2 || /[A-Z]/.test(varName)) {
                namingIssues++;
                issues.push({
                  severity: 'info',
                  code: 'NAMING_CONVENTION',
                  message: `Variable name '${varName}' doesn't follow conventions`,
                  file,
                  line: lineNum + 1,
                  suggestion: 'Use camelCase for variables and descriptive names',
                });
              }
            }
          }
        }
      }

      // Calculate code duplication
      duplicationPercentage = this.calculateDuplication(fileContents);

      if (functionCount === 0) functionCount = 1;
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'ANALYSIS_ERROR',
        message: `Error analyzing maintainability: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      functionCount,
      totalCyclomaticComplexity,
      missingDocs,
      duplicationPercentage,
    );

    return {
      cyclomaticComplexity: Math.round(totalCyclomaticComplexity / Math.max(functionCount, 1)),
      functionLength: this.maxFunctionLength,
      namingQuality: Math.max(100 - namingIssues * 5, 0),
      documentationCoverage: Math.round(((functionCount - missingDocs) / Math.max(functionCount, 1)) * 100),
      duplicationPercentage,
      maintainabilityIndex,
    };
  }

  private calculateComplexity(line: string): number {
    let complexity = 1;
    complexity += (line.match(/if\s*\(/gi) || []).length;
    complexity += (line.match(/else\s*if\s*\(/gi) || []).length;
    complexity += (line.match(/\?.*:/g) || []).length;
    complexity += (line.match(/for\s*\(|foreach|while\s*\(/gi) || []).length;
    complexity += (line.match(/catch\s*\(/gi) || []).length;
    complexity += (line.match(/&&|\|\|/g) || []).length * 0.5;
    return Math.max(complexity, 1);
  }

  private getFunctionLength(lines: string[], startLine: number): number {
    let braceCount = 0;
    let isInFunction = false;
    let length = 0;

    for (let i = startLine; i < lines.length && i < startLine + 200; i++) {
      const line = lines[i];
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      length++;

      if (braceCount > 0) isInFunction = true;
      if (isInFunction && braceCount === 0) break;
    }

    return length;
  }

  private calculateDuplication(fileContents: Map<string, string>): number {
    let totalLines = 0;
    let duplicateLines = 0;
    const lineMap = new Map<string, number>();

    for (const content of fileContents.values()) {
      const lines = content.split('\n').filter(l => l.trim().length > 10);
      totalLines += lines.length;

      for (const line of lines) {
        const normalized = line.trim();
        lineMap.set(normalized, (lineMap.get(normalized) || 0) + 1);
      }
    }

    for (const count of lineMap.values()) {
      if (count > 1) {
        duplicateLines += count - 1;
      }
    }

    return totalLines > 0 ? Math.round((duplicateLines / totalLines) * 100) : 0;
  }

  private calculateMaintainabilityIndex(
    functionCount: number,
    totalComplexity: number,
    missingDocs: number,
    duplication: number,
  ): number {
    const avgComplexity = Math.max(totalComplexity / Math.max(functionCount, 1), 1);
    const docCoverage = Math.max(100 - (missingDocs / Math.max(functionCount, 1)) * 100, 0);
    const duplicationScore = Math.max(100 - duplication, 0);
    const complexityScore = Math.max(100 - avgComplexity * 5, 0);

    const index = (docCoverage * 0.3 + duplicationScore * 0.3 + complexityScore * 0.4) / 1;
    return Math.round(Math.min(index, 100));
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
