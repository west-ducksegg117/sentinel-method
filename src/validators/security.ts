import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, SecurityIssue, SecurityMetrics, SentinelConfig } from '../types';

export class SecurityValidator {
  private readonly injectionPatterns = [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /innerHTML\s*=/gi,
    /dangerouslySetInnerHTML/gi,
    /\.query\s*\(\s*['"`].*\$\{/gi,
  ];

  private readonly secretPatterns = [
    /password\s*=\s*['"][^'"]*['"]/gi,
    /api[_-]?key\s*=\s*['"][^'"]*['"]/gi,
    /token\s*=\s*['"][^'"]*['"]/gi,
    /secret\s*=\s*['"][^'"]*['"]/gi,
    /private[_-]?key\s*=\s*['"][^'"]*['"]/gi,
  ];

  private readonly xssPatterns = [
    /innerHTML/gi,
    /insertAdjacentHTML/gi,
    /document\.write\s*\(/gi,
  ];

  constructor(private config: SentinelConfig) {}

  validate(sourceDir: string): ValidatorResult {
    const issues: SecurityIssue[] = [];
    const metrics = this.scanSecurity(sourceDir, issues);

    const passed = metrics.vulnerabilitiesFound === 0 && metrics.injectionRisks === 0 && metrics.hardcodedSecrets === 0;

    return {
      validator: 'Security Scanning',
      passed,
      issues: issues as any,
      details: metrics,
    };
  }

  private scanSecurity(sourceDir: string, issues: SecurityIssue[]): SecurityMetrics {
    let vulnerabilitiesFound = 0;
    let injectionRisks = 0;
    let hardcodedSecrets = 0;
    let dependencyIssues = 0;

    try {
      const files = this.getAllFiles(sourceDir);

      for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.js'))) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          for (const pattern of this.injectionPatterns) {
            if (pattern.test(line)) {
              injectionRisks++;
              issues.push({
                severity: 'error',
                code: 'INJECTION_RISK',
                message: 'Potential code injection vulnerability detected',
                file,
                line: lineNum + 1,
                type: 'injection',
                cwe: 'CWE-95',
                suggestion: 'Avoid eval() and dynamically executing code. Use safe alternatives.',
              });
            }
          }

          for (const pattern of this.secretPatterns) {
            if (pattern.test(line)) {
              hardcodedSecrets++;
              issues.push({
                severity: 'error',
                code: 'HARDCODED_SECRET',
                message: 'Hardcoded secret or credential detected',
                file,
                line: lineNum + 1,
                type: 'hardcoded-secret',
                suggestion: 'Move secrets to environment variables or secure vault',
              });
            }
          }

          for (const pattern of this.xssPatterns) {
            if (pattern.test(line)) {
              vulnerabilitiesFound++;
              issues.push({
                severity: 'warning',
                code: 'XSS_RISK',
                message: 'Potential XSS vulnerability pattern detected',
                file,
                line: lineNum + 1,
                type: 'vulnerability',
                cwe: 'CWE-79',
                suggestion: 'Use textContent instead of innerHTML. Sanitize user input.',
              });
            }
          }
        }
      }

      const depFile = path.join(sourceDir, 'package.json');
      if (fs.existsSync(depFile)) {
        const depContent = fs.readFileSync(depFile, 'utf-8');
        const potentialIssues = (depContent.match(/vulnerable|deprecated|outdated/gi) || []).length;
        dependencyIssues = potentialIssues;
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'ANALYSIS_ERROR',
        message: `Error during security analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'exposure',
      });
    }

    const securityScore = Math.max(100 - (vulnerabilitiesFound * 10 + injectionRisks * 20 + hardcodedSecrets * 30), 0);

    return {
      vulnerabilitiesFound,
      injectionRisks,
      hardcodedSecrets,
      dependencyIssues,
      securityScore,
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
