/**
 * SecurityVerifier — Adversarial verifier para segurança.
 *
 * Usa heurísticas DIFERENTES do SecurityValidator:
 * - Validator usa regex pattern matching (detecção direta)
 * - Verifier usa análise de fluxo de dados (taint analysis simplificada)
 *   e análise contextual (funções expostas, endpoints, sanitização ausente)
 *
 * Foco: detectar o que o Primary PODE ter perdido.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../types';
import { VerifierIssue, VerifierResult } from '../types-verifier';
import { BaseVerifier } from './base-verifier';

// ═══════════════════════════════════════════════════════════════
// HEURISTICS — Different from SecurityValidator's DetectionRules
// ═══════════════════════════════════════════════════════════════

interface TaintSource {
  pattern: RegExp;
  name: string;
  /** Dados de entrada do usuário */
  description: string;
}

interface DangerousSink {
  pattern: RegExp;
  code: string;
  message: string;
  severity: VerifierIssue['severity'];
}

// Note: MissingSanitization heuristic patterns are applied inline in analyzeMissingControls()

// Sources of untrusted data (user input, request data, external)
const TAINT_SOURCES: TaintSource[] = [
  { pattern: /req\.(body|query|params|headers|cookies)\b/g, name: 'http_input', description: 'HTTP request data' },
  { pattern: /process\.env\b/g, name: 'env_var', description: 'Environment variable' },
  { pattern: /\.readFileSync\s*\(/g, name: 'file_read', description: 'File system read' },
  { pattern: /JSON\.parse\s*\(/g, name: 'json_parse', description: 'JSON parsing' },
  { pattern: /\.toString\s*\(\s*\)/g, name: 'to_string', description: 'Type coercion' },
  { pattern: /window\.location|document\.URL|document\.referrer/g, name: 'browser_input', description: 'Browser-sourced data' },
  { pattern: /localStorage|sessionStorage/g, name: 'storage', description: 'Client-side storage' },
];

// Dangerous operations where tainted data shouldn't reach unsanitized
const DANGEROUS_SINKS: DangerousSink[] = [
  { pattern: /\.execute\s*\(/g, code: 'TAINT_DB_EXECUTE', message: 'Tainted data may reach database execute()', severity: 'error' },
  { pattern: /\.raw\s*\(\s*`/g, code: 'TAINT_RAW_QUERY', message: 'Raw query with potential template literal injection', severity: 'error' },
  { pattern: /child_process/g, code: 'TAINT_SUBPROCESS', message: 'Tainted data may reach subprocess execution', severity: 'error' },
  { pattern: /\.redirect\s*\(/g, code: 'TAINT_REDIRECT', message: 'Open redirect risk — user input may control redirect URL', severity: 'warning' },
  { pattern: /res\.(send|write|json)\s*\(/g, code: 'TAINT_RESPONSE', message: 'Unsanitized data in HTTP response', severity: 'warning' },
  { pattern: /\.createReadStream\s*\(/g, code: 'TAINT_FILE_ACCESS', message: 'Tainted data may control file access path', severity: 'error' },
  { pattern: /new\s+RegExp\s*\(/g, code: 'TAINT_REGEX', message: 'User input in RegExp constructor — ReDoS risk', severity: 'warning' },
];

// Note: Missing controls are detected inline in analyzeMissingControls() via direct pattern matching

export class SecurityVerifier extends BaseVerifier {
  readonly name = 'Security Verifier (Adversarial)';
  readonly domain = 'security';

  constructor(config: SentinelConfig) {
    super(config);
  }

  verify(sourceDir: string): VerifierResult {
    const start = Date.now();
    const issues: VerifierIssue[] = [];

    try {
      const files = this.getSourceFiles(sourceDir);

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(sourceDir, file);

        // Heuristic 1: Taint flow analysis (source → sink in same function)
        this.analyzeTaintFlow(content, lines, relativePath, file, issues);

        // Heuristic 2: Missing security controls
        this.analyzeMissingControls(content, lines, relativePath, file, issues);

        // Heuristic 3: Cryptographic weakness patterns
        this.analyzeCryptoWeakness(content, lines, relativePath, file, issues);

        // Heuristic 4: Sensitive data exposure in logs
        this.analyzeLogExposure(content, lines, relativePath, file, issues);

        // Heuristic 5: Unsafe deserialization patterns
        this.analyzeDeserialization(content, lines, relativePath, file, issues);
      }

      // Heuristic 6: Configuration analysis
      this.analyzeConfiguration(sourceDir, issues);

    } catch (error) {
      issues.push(this.createVerifierIssue(
        'error', 'VERIFIER_ERROR',
        `Verifier error: ${error instanceof Error ? error.message : 'Unknown'}`,
        'error_handler', 'low',
      ));
    }

    const score = this.calculateScore(issues);
    const duration = Date.now() - start;

    return this.buildResult(issues, {
      taintFlows: issues.filter(i => i.heuristic === 'taint_flow').length,
      missingControls: issues.filter(i => i.heuristic === 'missing_control').length,
      cryptoWeaknesses: issues.filter(i => i.heuristic === 'crypto_weakness').length,
      logExposures: issues.filter(i => i.heuristic === 'log_exposure').length,
      configIssues: issues.filter(i => i.heuristic === 'config_analysis').length,
      verifierScore: score,
    }, score, duration);
  }

  // ── Heuristic 1: Simplified taint flow ──

  private analyzeTaintFlow(
    content: string,
    lines: string[],
    _relativePath: string,
    file: string,
    issues: VerifierIssue[],
  ): void {
    // For each function/block, check if taint sources exist near dangerous sinks
    const functionBlocks = this.extractFunctionBlocks(content);

    for (const block of functionBlocks) {
      const hasTaint = TAINT_SOURCES.some(s => {
        s.pattern.lastIndex = 0;
        return s.pattern.test(block.body);
      });

      if (!hasTaint) continue;

      for (const sink of DANGEROUS_SINKS) {
        sink.pattern.lastIndex = 0;
        if (sink.pattern.test(block.body)) {
          // Check if sanitization exists between source and sink
          const hasSanitization = /sanitize|escape|encode|validate|clean|purify|strip|filter/i.test(block.body);

          if (!hasSanitization) {
            const lineNum = this.findLineInBlock(lines, block.startLine, sink.pattern);
            issues.push(this.createVerifierIssue(
              sink.severity,
              sink.code,
              `${sink.message} in function '${block.name}'`,
              'taint_flow',
              hasTaint ? 'medium' : 'low',
              { file, line: lineNum, suggestion: 'Add input validation/sanitization between data source and dangerous operation.' },
            ));
          }
        }
      }
    }
  }

  // ── Heuristic 2: Missing security controls ──

  private analyzeMissingControls(
    content: string,
    lines: string[],
    _relativePath: string,
    file: string,
    issues: VerifierIssue[],
  ): void {
    // Check for Express routes without auth/validation
    const routePattern = /app\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]+['"`]/g;
    let match: RegExpExecArray | null;

    while ((match = routePattern.exec(content)) !== null) {
      const routeLine = content.substring(0, match.index).split('\n').length;
      // Get the full route handler (next ~10 lines)
      const handlerBlock = lines.slice(routeLine - 1, routeLine + 10).join('\n');

      const hasAuth = /auth|middleware|protect|guard|verify|session|jwt|token|passport/i.test(handlerBlock);
      const hasValidation = /validate|sanitize|check|schema|zod|joi|yup|celebrate/i.test(handlerBlock);

      if (!hasAuth) {
        issues.push(this.createVerifierIssue(
          'warning', 'NO_AUTH_MIDDLEWARE',
          `Route handler at line ${routeLine} appears to lack authentication middleware`,
          'missing_control', 'medium',
          { file, line: routeLine, suggestion: 'Add authentication middleware to protect this endpoint.' },
        ));
      }

      if (!hasValidation && /post|put|patch/i.test(match[1]!)) {
        issues.push(this.createVerifierIssue(
          'warning', 'NO_INPUT_VALIDATION',
          `Write endpoint at line ${routeLine} appears to lack input validation`,
          'missing_control', 'medium',
          { file, line: routeLine, suggestion: 'Add schema validation (Zod, Joi, etc.) for request body.' },
        ));
      }
    }

    // Check for CORS misconfiguration
    if (/cors\(\s*\)/.test(content)) {
      const corsLine = content.substring(0, content.search(/cors\(\s*\)/)).split('\n').length;
      issues.push(this.createVerifierIssue(
        'warning', 'CORS_WIDE_OPEN',
        'CORS configured without origin restrictions',
        'missing_control', 'high',
        { file, line: corsLine, suggestion: 'Specify allowed origins: cors({ origin: ["https://your-domain.com"] })' },
      ));
    }
  }

  // ── Heuristic 3: Cryptographic weaknesses ──

  private analyzeCryptoWeakness(
    content: string,
    lines: string[],
    _relativePath: string,
    file: string,
    issues: VerifierIssue[],
  ): void {
    // Detect weak random number generation for security-sensitive contexts
    if (/Math\.random\s*\(\s*\)/.test(content) &&
        /token|secret|key|session|nonce|csrf|salt/i.test(content)) {
      const line = lines.findIndex(l => /Math\.random/.test(l)) + 1;
      issues.push(this.createVerifierIssue(
        'error', 'WEAK_RANDOM',
        'Math.random() used in security-sensitive context — not cryptographically secure',
        'crypto_weakness', 'high',
        { file, line, suggestion: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive randomness.' },
      ));
    }

    // Detect JWT without expiration
    if (/jwt\.sign\s*\(/.test(content) && !/expiresIn|exp\s*:/i.test(content)) {
      const line = lines.findIndex(l => /jwt\.sign/.test(l)) + 1;
      issues.push(this.createVerifierIssue(
        'warning', 'JWT_NO_EXPIRY',
        'JWT signed without expiration — tokens valid forever',
        'crypto_weakness', 'high',
        { file, line, suggestion: 'Add expiresIn option: jwt.sign(payload, secret, { expiresIn: "1h" })' },
      ));
    }

    // Detect hardcoded JWT secrets
    if (/jwt\.sign\s*\([^,]+,\s*['"][^'"]{1,30}['"]/i.test(content)) {
      const line = lines.findIndex(l => /jwt\.sign/.test(l)) + 1;
      issues.push(this.createVerifierIssue(
        'error', 'JWT_HARDCODED_SECRET',
        'JWT signed with hardcoded secret string',
        'crypto_weakness', 'high',
        { file, line, suggestion: 'Use process.env.JWT_SECRET or a key management service.' },
      ));
    }
  }

  // ── Heuristic 4: Sensitive data in logs ──

  private analyzeLogExposure(
    content: string,
    lines: string[],
    _relativePath: string,
    file: string,
    issues: VerifierIssue[],
  ): void {
    const logPatterns = /console\.(log|error|warn|info|debug)\s*\(|logger\.(log|error|warn|info|debug)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = logPatterns.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      const logLine = lines[lineNum - 1] || '';

      if (/password|secret|token|key|credential|authorization|cookie/i.test(logLine)) {
        issues.push(this.createVerifierIssue(
          'warning', 'LOG_SENSITIVE_DATA',
          `Potential sensitive data in log statement at line ${lineNum}`,
          'log_exposure', 'medium',
          { file, line: lineNum, suggestion: 'Remove sensitive data from log statements or use structured logging with redaction.' },
        ));
      }
    }
  }

  // ── Heuristic 5: Unsafe deserialization ──

  private analyzeDeserialization(
    content: string,
    lines: string[],
    _relativePath: string,
    file: string,
    issues: VerifierIssue[],
  ): void {
    // Prototype pollution via Object.assign / spread from external data
    const assignPattern = /Object\.assign\s*\(\s*\{\s*\}\s*,\s*(req\.|params|body|query|input)/g;
    let match: RegExpExecArray | null;

    while ((match = assignPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      issues.push(this.createVerifierIssue(
        'warning', 'PROTOTYPE_POLLUTION',
        'Object.assign with untrusted source — prototype pollution risk',
        'deserialization', 'medium',
        { file, line: lineNum, suggestion: 'Validate and sanitize input before Object.assign. Consider using a safe merge utility.' },
      ));
    }

    // Unsafe YAML parsing
    if (/yaml\.load\s*\(/.test(content) && !/yaml\.safeLoad|yaml\.load\s*\([^,]+,\s*\{[^}]*schema/i.test(content)) {
      const line = lines.findIndex(l => /yaml\.load/.test(l)) + 1;
      issues.push(this.createVerifierIssue(
        'error', 'UNSAFE_YAML',
        'yaml.load() without safe schema — arbitrary code execution risk',
        'deserialization', 'high',
        { file, line, suggestion: 'Use yaml.load(content, { schema: SAFE_SCHEMA }) or yaml.safeLoad().' },
      ));
    }
  }

  // ── Heuristic 6: Configuration analysis ──

  private analyzeConfiguration(sourceDir: string, issues: VerifierIssue[]): void {
    // Check package.json for known vulnerable dependency patterns
    const pkgPath = path.join(sourceDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Check for wildcard versions
        for (const [name, version] of Object.entries(allDeps)) {
          if (version === '*' || version === 'latest') {
            issues.push(this.createVerifierIssue(
              'warning', 'UNPINNED_DEPENDENCY',
              `Dependency '${name}' uses unpinned version '${version}'`,
              'config_analysis', 'high',
              { suggestion: `Pin ${name} to a specific version range.` },
            ));
          }
        }

        // Check for missing security-relevant packages
        const securityPackages = ['helmet', 'cors', 'express-rate-limit', 'csurf', 'hpp'];
        if (allDeps['express']) {
          const missing = securityPackages.filter(p => !allDeps[p]);
          if (missing.length >= 3) {
            issues.push(this.createVerifierIssue(
              'info', 'MISSING_SECURITY_DEPS',
              `Express app missing security packages: ${missing.join(', ')}`,
              'config_analysis', 'medium',
              { suggestion: 'Consider adding helmet, cors, and express-rate-limit for defense in depth.' },
            ));
          }
        }
      } catch {
        // Invalid package.json, skip
      }
    }

    // Check for .env file committed (should be in .gitignore)
    const envPath = path.join(sourceDir, '.env');
    if (fs.existsSync(envPath)) {
      const gitignorePath = path.join(sourceDir, '.gitignore');
      if (!fs.existsSync(gitignorePath) || !fs.readFileSync(gitignorePath, 'utf-8').includes('.env')) {
        issues.push(this.createVerifierIssue(
          'error', 'ENV_NOT_IGNORED',
          '.env file exists but is not in .gitignore — secrets may be committed',
          'config_analysis', 'high',
          { suggestion: 'Add .env to .gitignore immediately.' },
        ));
      }
    }
  }

  // ── Utility ──

  private extractFunctionBlocks(content: string): Array<{ name: string; body: string; startLine: number }> {
    const blocks: Array<{ name: string; body: string; startLine: number }> = [];
    // Match function declarations, named arrow functions, methods, AND callback arrow functions
    const patterns: RegExp[] = [
      // function declarations: function foo(...)
      /(?:async\s+)?function\s+(\w+)\s*\(/g,
      // named arrow functions: const foo = (...) =>
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      // method definitions: foo(...) {
      /(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/g,
      // callback arrow functions: (req, res) => { or async (req, res) => {
      /(?:async\s+)?\(\s*(\w+(?:\s*,\s*\w+)*)\s*\)\s*=>\s*\{/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1] || 'callback';
        const startIdx = match.index;
        const startLine = content.substring(0, startIdx).split('\n').length;

        // Get ~50 lines of body
        const bodyLines = content.substring(startIdx).split('\n').slice(0, 50);
        blocks.push({ name, body: bodyLines.join('\n'), startLine });
      }
    }

    return blocks;
  }

  private findLineInBlock(lines: string[], blockStart: number, pattern: RegExp): number {
    for (let i = blockStart; i < Math.min(blockStart + 50, lines.length); i++) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[i] || '')) return i + 1;
    }
    return blockStart;
  }

  private calculateScore(issues: VerifierIssue[]): number {
    let penalty = 0;
    for (const issue of issues) {
      if (issue.severity === 'error') penalty += 20;
      else if (issue.severity === 'warning') penalty += 8;
      else penalty += 2;
    }
    return Math.max(100 - penalty, 0);
  }
}
