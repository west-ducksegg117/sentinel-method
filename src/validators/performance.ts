import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, PerformanceIssue, PerformanceMetrics, SentinelConfig } from '../types';

export class PerformanceValidator {
  constructor(private config: SentinelConfig) {}

  validate(sourceDir: string): ValidatorResult {
    const issues: PerformanceIssue[] = [];
    const metrics = this.analyzePerformance(sourceDir, issues);

    const scoreMap: Record<string, number> = {
      optimal: 90,
      good: 75,
      acceptable: 60,
    };

    const threshold = scoreMap[this.config.performanceTarget];
    const score = metrics.performanceScore;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return {
      validator: 'Performance Benchmarks',
      passed,
      score,
      threshold,
      issues: issues as any,
      details: metrics,
    };
  }

  private analyzePerformance(sourceDir: string, issues: PerformanceIssue[]): PerformanceMetrics {
    let avgComplexity = 0;
    let memoryIssues = 0;
    let asyncIssues = 0;
    let queryPatterns = 0;
    let functionCount = 0;

    try {
      const files = this.getAllFiles(sourceDir);

      for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.js'))) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          // Check for complex nested loops
          const nestedLoops = (line.match(/for\s*\(|while\s*\(|forEach/g) || []).length;
          if (nestedLoops > 1) {
            avgComplexity += nestedLoops;
            functionCount++;
            issues.push({
              severity: 'warning',
              code: 'HIGH_COMPLEXITY',
              message: 'Detected nested loops that may have O(n^2) complexity',
              file,
              line: lineNum + 1,
              type: 'complexity',
              impact: 'high',
              suggestion: 'Consider optimizing nested loops or using more efficient algorithms',
            });
          }

          // Check for memory allocation patterns
          if (/new\s+Array|new\s+Object|new\s+Map|new\s+Set/gi.test(line)) {
            const allocCount = (line.match(/new\s+/g) || []).length;
            if (allocCount > 2) {
              memoryIssues++;
              issues.push({
                severity: 'warning',
                code: 'MEMORY_ALLOCATION',
                message: 'Excessive memory allocation in single statement',
                file,
                line: lineNum + 1,
                type: 'memory',
                impact: 'medium',
                suggestion: 'Review memory allocation patterns and consider object reuse',
              });
            }
          }

          // Check for N+1 query patterns (basic detection)
          if (/\.map\s*\(.*\)\s*\{.*\.query|\.find\s*\(.*\)\s*{.*\.query/gi.test(lines.slice(Math.max(0, lineNum - 2), lineNum + 3).join('\n'))) {
            queryPatterns++;
            issues.push({
              severity: 'error',
              code: 'N_PLUS_ONE_QUERY',
              message: 'Potential N+1 query pattern detected',
              file,
              line: lineNum + 1,
              type: 'query-pattern',
              impact: 'high',
              suggestion: 'Use batch queries or join operations instead of queries in loops',
            });
          }

          // Check for improper async/await usage
          if (/await\s+Promise\.all\s*\(\s*\[\s*await/gi.test(line)) {
            asyncIssues++;
            issues.push({
              severity: 'warning',
              code: 'IMPROPER_ASYNC',
              message: 'Improper async/await usage detected',
              file,
              line: lineNum + 1,
              type: 'async',
              impact: 'medium',
              suggestion: 'Use Promise.all() without nesting await inside array',
            });
          }
        }
      }

      if (functionCount === 0) functionCount = 1;
      avgComplexity = Math.round(avgComplexity / functionCount);
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'ANALYSIS_ERROR',
        message: `Error analyzing performance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'complexity',
        impact: 'high',
      });
    }

    const performanceScore = Math.max(100 - (memoryIssues * 5 + asyncIssues * 8 + queryPatterns * 15 + avgComplexity), 0);

    return {
      avgComplexity,
      memoryIssues,
      asyncIssues,
      queryPatterns,
      performanceScore: Math.min(performanceScore, 100),
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
