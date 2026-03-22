import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, SecurityIssue, SecurityMetrics, SentinelConfig } from '../types';
import { BaseValidator } from './base';

/**
 * Mapeamento OWASP Top 10 → CWE para categorização de vulnerabilidades.
 *
 * Referências:
 * - OWASP Top 10 2021: https://owasp.org/Top10/
 * - CWE/SANS Top 25: https://cwe.mitre.org/top25/
 */
interface CweMapping {
  cwe: string;
  owasp: string;
  severity: 'error' | 'warning';
  description: string;
}

const CWE_DATABASE: Record<string, CweMapping> = {
  // A03:2021 – Injection
  'CWE-94': { cwe: 'CWE-94', owasp: 'A03:2021', severity: 'error', description: 'Improper Control of Generation of Code (Code Injection)' },
  'CWE-95': { cwe: 'CWE-95', owasp: 'A03:2021', severity: 'error', description: 'Improper Neutralization of Directives in Dynamically Evaluated Code (Eval Injection)' },
  'CWE-89': { cwe: 'CWE-89', owasp: 'A03:2021', severity: 'error', description: 'Improper Neutralization of Special Elements used in an SQL Command' },
  'CWE-78': { cwe: 'CWE-78', owasp: 'A03:2021', severity: 'error', description: 'Improper Neutralization of Special Elements used in an OS Command' },
  'CWE-77': { cwe: 'CWE-77', owasp: 'A03:2021', severity: 'error', description: 'Improper Neutralization of Special Elements used in a Command' },

  // A07:2021 – Cross-Site Scripting (XSS)
  'CWE-79': { cwe: 'CWE-79', owasp: 'A07:2021', severity: 'warning', description: 'Improper Neutralization of Input During Web Page Generation (XSS)' },

  // A02:2021 – Cryptographic Failures
  'CWE-798': { cwe: 'CWE-798', owasp: 'A02:2021', severity: 'error', description: 'Use of Hard-coded Credentials' },
  'CWE-321': { cwe: 'CWE-321', owasp: 'A02:2021', severity: 'error', description: 'Use of Hard-coded Cryptographic Key' },
  'CWE-327': { cwe: 'CWE-327', owasp: 'A02:2021', severity: 'warning', description: 'Use of a Broken or Risky Cryptographic Algorithm' },

  // A01:2021 – Broken Access Control
  'CWE-22': { cwe: 'CWE-22', owasp: 'A01:2021', severity: 'error', description: 'Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)' },

  // A04:2021 – Insecure Design
  'CWE-502': { cwe: 'CWE-502', owasp: 'A04:2021', severity: 'error', description: 'Deserialization of Untrusted Data' },

  // A05:2021 – Security Misconfiguration
  'CWE-209': { cwe: 'CWE-209', owasp: 'A05:2021', severity: 'warning', description: 'Generation of Error Message Containing Sensitive Information' },
};

/** Regra de detecção com padrão, CWE associado e metadados */
interface DetectionRule {
  pattern: RegExp;
  code: string;
  cweId: string;
  message: string;
  type: SecurityIssue['type'];
  suggestion: string;
}

export class SecurityValidator extends BaseValidator {
  readonly name = 'Security Scanning';

  /** Regras de detecção com mapeamento CWE/OWASP */
  private readonly detectionRules: DetectionRule[] = [
    // ── Injection (A03:2021) ──
    { pattern: /eval\s*\(/gi, code: 'INJECTION_EVAL', cweId: 'CWE-95', message: 'eval() usage detected — potential code injection', type: 'injection', suggestion: 'Replace eval() with JSON.parse(), Function constructors, or safe parsers.' },
    { pattern: /Function\s*\(/gi, code: 'INJECTION_FUNC', cweId: 'CWE-94', message: 'Dynamic Function constructor detected', type: 'injection', suggestion: 'Avoid new Function(). Use static function definitions.' },
    { pattern: /\.query\s*\(\s*['"`].*\$\{/gi, code: 'SQL_INJECTION', cweId: 'CWE-89', message: 'Potential SQL injection via template literal in query', type: 'injection', suggestion: 'Use parameterized queries or an ORM with prepared statements.' },
    { pattern: /child_process.*exec\s*\(/gi, code: 'CMD_INJECTION', cweId: 'CWE-78', message: 'Command injection risk via child_process.exec()', type: 'injection', suggestion: 'Use execFile() or spawn() with argument arrays instead of exec().' },
    { pattern: /execSync\s*\(/gi, code: 'CMD_INJECTION_SYNC', cweId: 'CWE-78', message: 'Synchronous command execution detected', type: 'injection', suggestion: 'Use execFileSync() with argument arrays. Avoid string interpolation in commands.' },

    // ── XSS (A07:2021) ──
    { pattern: /innerHTML\s*=/gi, code: 'XSS_INNERHTML', cweId: 'CWE-79', message: 'innerHTML assignment detected — potential XSS', type: 'vulnerability', suggestion: 'Use textContent or a sanitization library like DOMPurify.' },
    { pattern: /dangerouslySetInnerHTML/gi, code: 'XSS_REACT', cweId: 'CWE-79', message: 'dangerouslySetInnerHTML in React — potential XSS', type: 'vulnerability', suggestion: 'Sanitize HTML before using dangerouslySetInnerHTML. Consider alternatives.' },
    { pattern: /insertAdjacentHTML/gi, code: 'XSS_ADJACENT', cweId: 'CWE-79', message: 'insertAdjacentHTML detected — potential XSS', type: 'vulnerability', suggestion: 'Use DOM APIs (createElement, textContent) instead of raw HTML insertion.' },
    { pattern: /document\.write\s*\(/gi, code: 'XSS_DOCWRITE', cweId: 'CWE-79', message: 'document.write() detected — potential XSS', type: 'vulnerability', suggestion: 'Use DOM manipulation methods instead of document.write().' },

    // ── Hardcoded Secrets (A02:2021) ──
    { pattern: /password\s*=\s*['"][^'"]*['"]/gi, code: 'SECRET_PASSWORD', cweId: 'CWE-798', message: 'Hardcoded password detected', type: 'hardcoded-secret', suggestion: 'Use environment variables (process.env) or a secrets manager.' },
    { pattern: /api[_-]?key\s*=\s*['"][^'"]*['"]/gi, code: 'SECRET_APIKEY', cweId: 'CWE-321', message: 'Hardcoded API key detected', type: 'hardcoded-secret', suggestion: 'Store API keys in environment variables or .env files (add to .gitignore).' },
    { pattern: /token\s*=\s*['"][^'"]*['"]/gi, code: 'SECRET_TOKEN', cweId: 'CWE-798', message: 'Hardcoded token detected', type: 'hardcoded-secret', suggestion: 'Move tokens to environment variables or secure vault.' },
    { pattern: /secret\s*=\s*['"][^'"]*['"]/gi, code: 'SECRET_GENERIC', cweId: 'CWE-798', message: 'Hardcoded secret value detected', type: 'hardcoded-secret', suggestion: 'Use environment variables or a secrets management service.' },
    { pattern: /private[_-]?key\s*=\s*['"][^'"]*['"]/gi, code: 'SECRET_PRIVKEY', cweId: 'CWE-321', message: 'Hardcoded private key detected', type: 'hardcoded-secret', suggestion: 'Store private keys in secure file storage. Never commit to VCS.' },

    // ── Path Traversal (A01:2021) ──
    { pattern: /\.\.\//g, code: 'PATH_TRAVERSAL', cweId: 'CWE-22', message: 'Path traversal pattern detected (../)', type: 'vulnerability', suggestion: 'Validate and sanitize file paths. Use path.resolve() and check against base directory.' },

    // ── Deserialization (A04:2021) ──
    { pattern: /JSON\.parse\s*\(\s*req\./gi, code: 'UNSAFE_DESER', cweId: 'CWE-502', message: 'Parsing untrusted request data without validation', type: 'vulnerability', suggestion: 'Validate parsed data with a schema validator (Joi, Zod, etc.).' },

    // ── Weak Crypto (A02:2021) ──
    { pattern: /createHash\s*\(\s*['"]md5['"]\s*\)/gi, code: 'WEAK_CRYPTO_MD5', cweId: 'CWE-327', message: 'MD5 hash function detected — cryptographically broken', type: 'vulnerability', suggestion: 'Use SHA-256 or SHA-3 for hashing. Use bcrypt/argon2 for passwords.' },
    { pattern: /createHash\s*\(\s*['"]sha1['"]\s*\)/gi, code: 'WEAK_CRYPTO_SHA1', cweId: 'CWE-327', message: 'SHA-1 hash function detected — deprecated', type: 'vulnerability', suggestion: 'Upgrade to SHA-256 or SHA-3.' },
  ];

  constructor(config: SentinelConfig) {
    super(config);
  }

  /** Retorna o nível de segurança configurado */
  getSecurityLevel(): string {
    return this.config.securityLevel;
  }

  /** Retorna o mapeamento CWE/OWASP para um ID */
  static getCweInfo(cweId: string): CweMapping | undefined {
    return CWE_DATABASE[cweId];
  }

  /** Retorna todas as regras de detecção */
  getDetectionRules(): DetectionRule[] {
    return [...this.detectionRules];
  }

  validate(sourceDir: string): ValidatorResult {
    const issues: SecurityIssue[] = [];
    const metrics = this.scanSecurity(sourceDir, issues);

    // Em modo permissive, só falha com injection risks
    const passed = this.config.securityLevel === 'permissive'
      ? metrics.injectionRisks === 0
      : metrics.vulnerabilitiesFound === 0 && metrics.injectionRisks === 0 && metrics.hardcodedSecrets === 0;

    return this.buildResult(passed, issues as any, {
      ...metrics,
      owaspCategories: this.categorizeByOwasp(issues),
    });
  }

  /** Categoriza issues por OWASP Top 10 */
  private categorizeByOwasp(issues: SecurityIssue[]): Record<string, number> {
    const categories: Record<string, number> = {};

    for (const issue of issues) {
      if (issue.cwe) {
        const mapping = CWE_DATABASE[issue.cwe];
        if (mapping) {
          const key = mapping.owasp;
          categories[key] = (categories[key] || 0) + 1;
        }
      }
    }

    return categories;
  }

  private scanSecurity(sourceDir: string, issues: SecurityIssue[]): SecurityMetrics {
    let vulnerabilitiesFound = 0;
    let injectionRisks = 0;
    let hardcodedSecrets = 0;
    let dependencyIssues = 0;

    try {
      const files = this.getAllFiles(sourceDir);
      const isStrict = this.config.securityLevel === 'strict';

      for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.js'))) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          for (const rule of this.detectionRules) {
            // Em modo não-strict, pular path traversal (muito ruidoso)
            if (!isStrict && rule.code === 'PATH_TRAVERSAL') continue;

            // Reset do regex global
            rule.pattern.lastIndex = 0;

            if (rule.pattern.test(line)) {
              const cweInfo = CWE_DATABASE[rule.cweId];
              const severity = cweInfo?.severity ?? 'warning';

              if (rule.type === 'injection') injectionRisks++;
              else if (rule.type === 'hardcoded-secret') hardcodedSecrets++;
              else vulnerabilitiesFound++;

              issues.push({
                severity,
                code: rule.code,
                message: `${rule.message} [${rule.cweId}]`,
                file,
                line: lineNum + 1,
                type: rule.type,
                cwe: rule.cweId,
                suggestion: rule.suggestion,
              });
            }
          }
        }
      }

      // Análise de dependências
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
}
