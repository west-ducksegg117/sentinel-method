import { ValidationResult, ReportFormat } from './types';

export class Reporter {
  generateJSON(result: ValidationResult): string {
    return JSON.stringify(result, null, 2);
  }

  generateMarkdown(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('# Sentinel Validation Report');
    lines.push('');
    lines.push(`**Timestamp**: ${result.timestamp}`);
    lines.push(`**Source Directory**: ${result.sourceDirectory}`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total Files Analyzed: ${result.summary.totalFiles}`);
    lines.push(`- Passed Checks: ${result.summary.passedChecks}`);
    lines.push(`- Failed Checks: ${result.summary.failedChecks}`);
    lines.push(`- Warnings: ${result.summary.warnings}`);
    lines.push(`- Overall Status: ${result.success ? 'PASSED' : 'FAILED'}`);
    lines.push('');

    lines.push('## Validation Results');
    lines.push('');

    for (const validatorResult of result.results) {
      lines.push(`### ${validatorResult.validator}`);
      lines.push('');
      lines.push(`- Status: ${validatorResult.passed ? 'PASSED' : 'FAILED'}`);
      if (validatorResult.score !== undefined && validatorResult.threshold !== undefined) {
        lines.push(`- Score: ${validatorResult.score}/${validatorResult.threshold}`);
      }
      lines.push('');

      if (validatorResult.issues.length > 0) {
        lines.push('#### Issues');
        lines.push('');
        for (const issue of validatorResult.issues) {
          const location = issue.file ? ` (${issue.file}:${issue.line || 0})` : '';
          lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}${location}`);
          if (issue.suggestion) {
            lines.push(`  - Suggestion: ${issue.suggestion}`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  generateConsole(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('\n===== Sentinel Validation Report =====\n');
    lines.push(`Status: ${result.success ? 'PASSED' : 'FAILED'}`);
    lines.push(`Timestamp: ${result.timestamp}`);
    lines.push(`Directory: ${result.sourceDirectory}\n`);

    lines.push('Summary:');
    lines.push(`  Files Analyzed: ${result.summary.totalFiles}`);
    lines.push(`  Passed Checks: ${result.summary.passedChecks}`);
    lines.push(`  Failed Checks: ${result.summary.failedChecks}`);
    lines.push(`  Warnings: ${result.summary.warnings}\n`);

    for (const validatorResult of result.results) {
      const status = validatorResult.passed ? 'PASS' : 'FAIL';
      lines.push(`${validatorResult.validator}: ${status}`);
      if (validatorResult.issues.length > 0) {
        for (const issue of validatorResult.issues) {
          lines.push(`  [${issue.severity}] ${issue.message}`);
        }
      }
    }

    lines.push('\n========================================\n');
    return lines.join('\n');
  }

  format(result: ValidationResult, format: 'json' | 'markdown' | 'console' | 'html'): ReportFormat {
    let content: string;

    switch (format) {
      case 'json':
        content = this.generateJSON(result);
        break;
      case 'markdown':
        content = this.generateMarkdown(result);
        break;
      case 'console':
        content = this.generateConsole(result);
        break;
      default:
        content = this.generateJSON(result);
    }

    return {
      type: format,
      content,
      timestamp: result.timestamp,
    };
  }
}
