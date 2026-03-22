import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, SentinelConfig } from '../types';
import { BaseValidator } from './base';

export interface CodeStyleMetrics {
  filesAnalyzed: number;
  inconsistentIndentation: number;
  trailingWhitespace: number;
  consoleLogs: number;
  todoComments: number;
  longLines: number;
  styleScore: number;
}

/**
 * Valida a consistência de estilo do código-fonte.
 *
 * Verificações:
 * - Indentação inconsistente (mistura de tabs e spaces)
 * - Trailing whitespace
 * - console.log/warn/error em código de produção
 * - TODO/FIXME/HACK comments pendentes
 * - Linhas excessivamente longas (>120 caracteres)
 * - Arquivos sem newline final
 */
export class CodeStyleValidator extends BaseValidator {
  readonly name = 'Code Style';

  private readonly maxLineLength = 120;

  constructor(config: SentinelConfig) {
    super(config);
  }

  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeStyle(sourceDir, issues);

    const score = metrics.styleScore;
    const threshold = 70;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return this.buildResult(passed, issues, metrics as any, score, threshold);
  }

  private analyzeStyle(sourceDir: string, issues: ValidationIssue[]): CodeStyleMetrics {
    let filesAnalyzed = 0;
    let inconsistentIndentation = 0;
    let trailingWhitespace = 0;
    let consoleLogs = 0;
    let todoComments = 0;
    let longLines = 0;

    try {
      const files = this.getAllFiles(sourceDir);
      const codeFiles = files.filter(f =>
        (f.endsWith('.ts') || f.endsWith('.js')) &&
        !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') &&
        !f.endsWith('.d.ts'),
      );

      for (const file of codeFiles) {
        filesAnalyzed++;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const relativeFile = path.relative(sourceDir, file);

        // Detectar tipo de indentação predominante
        const indentType = this.detectIndentation(lines);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Indentação inconsistente
          if (indentType === 'spaces' && /^\t/.test(line)) {
            inconsistentIndentation++;
            if (inconsistentIndentation <= 5) { // limitar issues por arquivo
              issues.push(this.createIssue('warning', 'INCONSISTENT_INDENT',
                'Tab indentation found in a spaces-based file',
                { file: relativeFile, line: i + 1, suggestion: 'Use consistent indentation (spaces recommended)' },
              ));
            }
          } else if (indentType === 'tabs' && /^ {2,}/.test(line) && !/^\s*\*/.test(line)) {
            inconsistentIndentation++;
            if (inconsistentIndentation <= 5) {
              issues.push(this.createIssue('warning', 'INCONSISTENT_INDENT',
                'Space indentation found in a tabs-based file',
                { file: relativeFile, line: i + 1, suggestion: 'Use consistent indentation' },
              ));
            }
          }

          // Trailing whitespace
          if (/\S\s+$/.test(line)) {
            trailingWhitespace++;
            if (trailingWhitespace <= 3) {
              issues.push(this.createIssue('info', 'TRAILING_WHITESPACE',
                'Line has trailing whitespace',
                { file: relativeFile, line: i + 1, suggestion: 'Configure your editor to trim trailing whitespace' },
              ));
            }
          }

          // console.log em produção (não em test files, não em CLI/bin)
          const isCli = /cli\.|bin\.|command/.test(relativeFile.toLowerCase());
          if (!isCli && /console\.(log|warn|error|debug|info)\s*\(/.test(line)) {
            consoleLogs++;
            issues.push(this.createIssue('warning', 'CONSOLE_STATEMENT',
              `console statement found in production code`,
              { file: relativeFile, line: i + 1, suggestion: 'Use a proper logging library instead of console methods' },
            ));
          }

          // TODO/FIXME/HACK comments
          if (/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i.test(line)) {
            todoComments++;
            const match = line.match(/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i);
            issues.push(this.createIssue('info', 'PENDING_COMMENT',
              `${match?.[1]?.toUpperCase() || 'TODO'} comment found`,
              { file: relativeFile, line: i + 1, suggestion: 'Resolve pending TODOs before release' },
            ));
          }

          // Linhas longas
          if (line.length > this.maxLineLength && !line.includes('import') && !line.includes('http')) {
            longLines++;
            if (longLines <= 5) {
              issues.push(this.createIssue('info', 'LONG_LINE',
                `Line exceeds ${this.maxLineLength} characters (${line.length})`,
                { file: relativeFile, line: i + 1, suggestion: 'Break long lines for better readability' },
              ));
            }
          }
        }

        // Verificar newline final
        if (content.length > 0 && !content.endsWith('\n')) {
          issues.push(this.createIssue('info', 'NO_FINAL_NEWLINE',
            'File does not end with a newline',
            { file: relativeFile, suggestion: 'Add a final newline at the end of the file' },
          ));
        }
      }
    } catch (error) {
      issues.push(this.createIssue('error', 'ANALYSIS_ERROR',
        `Error analyzing code style: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ));
    }

    const penalties = inconsistentIndentation * 3 + trailingWhitespace * 1 +
                      consoleLogs * 5 + todoComments * 2 + longLines * 1;
    const styleScore = Math.max(100 - penalties, 0);

    return {
      filesAnalyzed,
      inconsistentIndentation,
      trailingWhitespace,
      consoleLogs,
      todoComments,
      longLines,
      styleScore: Math.min(styleScore, 100),
    };
  }

  /** Detecta se o arquivo usa predominantemente tabs ou spaces */
  private detectIndentation(lines: string[]): 'tabs' | 'spaces' | 'none' {
    let tabCount = 0;
    let spaceCount = 0;

    for (const line of lines) {
      if (/^\t/.test(line)) tabCount++;
      if (/^ {2,}/.test(line)) spaceCount++;
    }

    if (tabCount === 0 && spaceCount === 0) return 'none';
    return tabCount > spaceCount ? 'tabs' : 'spaces';
  }
}
