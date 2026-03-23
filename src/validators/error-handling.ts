import { BaseValidator } from './base';

/**
 * Métricas de análise de tratamento de erros
 */
export interface ErrorHandlingMetrics {
  emptyCatchBlocks: number;
  errorSwallowing: number;
  missingErrorHandling: number;
  genericCatches: number;
  consoleOnlyHandling: number;
  unhandledPromiseRejections: number;
  missingFinallyBlocks: number;
  throwStringLiterals: number;
  totalIssuesFound: number;
}

/**
 * Validator for error handling patterns in TypeScript/JavaScript code.
 * Detects common error handling anti-patterns and issues related to exception management.
 */
export class ErrorHandlingValidator extends BaseValidator {
  readonly name = 'Error Handling';
  private metrics: ErrorHandlingMetrics = {
    emptyCatchBlocks: 0,
    errorSwallowing: 0,
    missingErrorHandling: 0,
    genericCatches: 0,
    consoleOnlyHandling: 0,
    unhandledPromiseRejections: 0,
    missingFinallyBlocks: 0,
    throwStringLiterals: 0,
    totalIssuesFound: 0,
  };

  /**
   * Valida o tratamento de erros em arquivos TypeScript/JavaScript
   * @param sourceDir Diretório raiz do projeto
   * @returns Resultado da validação
   */
  validate(sourceDir: string) {
    this.metrics = {
      emptyCatchBlocks: 0,
      errorSwallowing: 0,
      missingErrorHandling: 0,
      genericCatches: 0,
      consoleOnlyHandling: 0,
      unhandledPromiseRejections: 0,
      missingFinallyBlocks: 0,
      throwStringLiterals: 0,
      totalIssuesFound: 0,
    };

    const files = this.getSourceFiles(sourceDir);
    const issues = [];

    for (const file of files) {
      try {
        const content = this.readFile(file);
        if (!content) continue;
        const fileIssues = this.analyzeFile(content, file);
        issues.push(...fileIssues);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }

    this.metrics.totalIssuesFound = issues.length;
    const score = this.calculateScore();

    return this.buildResult(
      score >= 70,
      issues,
      {
        metrics: this.metrics,
        score,
      },
      score,
      70,
    );
  }

  /**
   * Analisa um arquivo para detectar problemas de tratamento de erros
   * @param content Conteúdo do arquivo
   * @param filePath Caminho do arquivo
   * @returns Lista de problemas encontrados
   */
  private analyzeFile(content: string, filePath: string) {
    const issues = [];
    const lines = content.split('\n');

    // Verifica throw com string literal
    issues.push(...this.detectThrowStringLiterals(content, filePath, lines));

    // Verifica catch blocks vazios
    issues.push(...this.detectEmptyCatchBlocks(content, filePath, lines));

    // Verifica error swallowing
    issues.push(...this.detectErrorSwallowing(content, filePath, lines));

    // Verifica generic catch
    issues.push(...this.detectGenericCatches(content, filePath, lines));

    // Verifica console-only error handling
    issues.push(...this.detectConsoleOnlyHandling(content, filePath, lines));

    // Verifica unhandled promise rejections
    issues.push(...this.detectUnhandledPromiseRejections(content, filePath, lines));

    // Verifica missing finally blocks
    issues.push(...this.detectMissingFinallyBlocks(content, filePath, lines));

    // Verifica missing error handling em async functions
    issues.push(...this.detectMissingAsyncErrorHandling(content, filePath, lines));

    return issues;
  }

  /**
   * Detecta throw com string literal em vez de Error objects
   */
  private detectThrowStringLiterals(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const throwStringRegex = /throw\s+['"`][^'"`]*['"`]/g;
    let match;

    while ((match = throwStringRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      this.metrics.throwStringLiterals++;

      issues.push(
        this.createIssue(
          'error',
          'THROW_STRING_LITERAL',
          'Throwing string literals instead of Error objects. Use throw new Error(message) instead.',
          {
            line: lineNumber,
            file: filePath,
            code: lines[lineNumber - 1].trim(),
            suggestion: `Replace "${match[0]}" with "throw new Error(...)"`,
          },
        ),
      );
    }

    return issues;
  }

  /**
   * Detecta catch blocks vazios
   */
  private detectEmptyCatchBlocks(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const emptyCatchRegex = /catch\s*\(\s*\w*\s*\)\s*\{[\s\n]*\}/g;
    const emptyCatchNoParamRegex = /catch\s*\{[\s\n]*\}/g;

    let match = emptyCatchRegex.exec(content);
    while (match) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      this.metrics.emptyCatchBlocks++;

      issues.push(
        this.createIssue(
          'error',
          'EMPTY_CATCH_BLOCK',
          'Empty catch block detected. Add proper error handling logic.',
          {
            line: lineNumber,
            file: filePath,
            code: lines[lineNumber - 1].trim(),
            suggestion: 'Add logging, error handling, or rethrow the error in catch block',
          },
        ),
      );

      match = emptyCatchRegex.exec(content);
    }

    match = emptyCatchNoParamRegex.exec(content);
    while (match) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      this.metrics.emptyCatchBlocks++;

      issues.push(
        this.createIssue(
          'error',
          'EMPTY_CATCH_BLOCK',
          'Empty catch block detected. Add proper error handling logic.',
          {
            line: lineNumber,
            file: filePath,
            code: lines[lineNumber - 1].trim(),
            suggestion: 'Add logging, error handling, or rethrow the error in catch block',
          },
        ),
      );

      match = emptyCatchNoParamRegex.exec(content);
    }

    return issues;
  }

  /**
   * Detecta error swallowing - catch blocks que não fazem nada útil com o erro
   */
  private detectErrorSwallowing(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const catchBlockRegex = /catch\s*\(\s*(\w+)\s*\)\s*\{([^}]*)\}/gs;

    let match;
    while ((match = catchBlockRegex.exec(content)) !== null) {
      const catchContent = match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      // Verifica se o bloco catch está vazio ou contém apenas comentários/whitespace
      const trimmedContent = catchContent.trim();

      if (
        !trimmedContent ||
        (trimmedContent.startsWith('//') && !catchContent.includes('throw') && !catchContent.includes('log'))
      ) {
        this.metrics.errorSwallowing++;

        issues.push(
          this.createIssue(
            'warning',
            'ERROR_SWALLOWING',
            'Catch block does not properly handle the error. Consider logging, rethrowing, or proper error handling.',
            {
              line: lineNumber,
              file: filePath,
              code: lines[lineNumber - 1].trim(),
              suggestion: 'Implement proper error handling: log, rethrow, or handle meaningfully',
            },
          ),
        );
      }
    }

    return issues;
  }

  /**
   * Detecta generic catch de Error sem tratamento específico
   */
  private detectGenericCatches(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const genericErrorRegex = /catch\s*\(\s*(e|err|error)\s*\)\s*\{/g;

    let match;
    while ((match = genericErrorRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;

      // Verifica se há discriminação de tipos de erro
      const contextStart = Math.max(0, match.index - 200);
      const contextEnd = Math.min(content.length, match.index + 500);
      const context = content.substring(contextStart, contextEnd);

      if (
        !context.includes('instanceof') &&
        !context.includes('error.code') &&
        !context.includes('error.name')
      ) {
        this.metrics.genericCatches++;

        issues.push(
          this.createIssue(
            'warning',
            'GENERIC_CATCH',
            'Catching generic Error without specific error type discrimination. Consider catching specific error types.',
            {
              line: lineNumber,
              file: filePath,
              code: lines[lineNumber - 1].trim(),
              suggestion: 'Use instanceof checks or check error.code/error.name for specific error handling',
            },
          ),
        );
      }
    }

    return issues;
  }

  /**
   * Detecta console-only error handling
   */
  private detectConsoleOnlyHandling(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const catchBlockRegex = /catch\s*\(\s*\w+\s*\)\s*\{([^}]*)\}/gs;

    let match;
    while ((match = catchBlockRegex.exec(content)) !== null) {
      const catchContent = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      const hasConsoleOnly =
        (catchContent.includes('console.log') || catchContent.includes('console.error')) &&
        !catchContent.includes('throw') &&
        !catchContent.includes('logger') &&
        !catchContent.includes('next(error)') &&
        !catchContent.includes('res.status');

      if (hasConsoleOnly && catchContent.trim().length > 0) {
        this.metrics.consoleOnlyHandling++;

        issues.push(
          this.createIssue(
            'warning',
            'CONSOLE_ONLY_HANDLING',
            'Error is only logged to console without proper error handling or propagation.',
            {
              line: lineNumber,
              file: filePath,
              code: lines[lineNumber - 1].trim(),
              suggestion:
                'Use proper logging infrastructure, handle error appropriately, or rethrow to caller',
            },
          ),
        );
      }
    }

    return issues;
  }

  /**
   * Detecta .then() chains sem .catch()
   */
  private detectUnhandledPromiseRejections(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const thenWithoutCatchRegex = /\.then\s*\(\s*([^)]+)\s*\)\s*(?![\s\n]*\.catch)/g;

    let match;
    while ((match = thenWithoutCatchRegex.exec(content)) !== null) {
      // Verifica se é realmente um .then() sem .catch()
      const afterMatch = content.substring(match.index + match[0].length, match.index + match[0].length + 100);

      if (!afterMatch.trim().startsWith('.catch')) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        this.metrics.unhandledPromiseRejections++;

        issues.push(
          this.createIssue(
            'warning',
            'UNHANDLED_PROMISE_REJECTION',
            'Promise .then() chain without corresponding .catch() handler.',
            {
              line: lineNumber,
              file: filePath,
              code: lines[lineNumber - 1].trim(),
              suggestion: 'Add .catch(error => {}) at the end of the promise chain',
            },
          ),
        );
      }
    }

    return issues;
  }

  /**
   * Detecta try/catch sem finally para padrões de limpeza de recursos
   */
  private detectMissingFinallyBlocks(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const tryWithoutFinallyRegex = /try\s*\{([^}]*\n[^}]*)\}\s*catch\s*\(\w+\)\s*\{[^}]*\}(?!\s*finally)/g;

    let match;
    while ((match = tryWithoutFinallyRegex.exec(content)) !== null) {
      const tryContent = match[1];

      // Verifica se há operações que precisam de cleanup
      if (
        tryContent.includes('fs.open') ||
        tryContent.includes('connection') ||
        tryContent.includes('createReadStream') ||
        tryContent.includes('createWriteStream') ||
        tryContent.includes('lock') ||
        tryContent.includes('acquire')
      ) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        this.metrics.missingFinallyBlocks++;

        issues.push(
          this.createIssue(
            'warning',
            'MISSING_FINALLY_BLOCK',
            'Try/catch without finally block for resource cleanup pattern detected.',
            {
              line: lineNumber,
              file: filePath,
              code: lines[lineNumber - 1].trim(),
              suggestion: 'Add finally block to ensure resource cleanup (close files, connections, etc.)',
            },
          ),
        );
      }
    }

    return issues;
  }

  /**
   * Detecta async functions sem try/catch ou .catch()
   */
  private detectMissingAsyncErrorHandling(content: string, filePath: string, lines: string[]) {
    const issues = [];
    const asyncFunctionRegex = /async\s+(function\s+\w+|(\w+)\s*\(|[^{]*\{)/g;

    let match;
    while ((match = asyncFunctionRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;

      // Extrai o corpo da função
      const startIdx = content.indexOf('{', match.index);
      if (startIdx === -1) continue;

      const functionBody = this.extractFunctionBody(content, startIdx);

      // Verifica se há await sem try/catch envolvente
      if (
        functionBody.includes('await') &&
        !functionBody.includes('try') &&
        !functionBody.includes('.catch')
      ) {
        this.metrics.missingErrorHandling++;

        issues.push(
          this.createIssue(
            'warning',
            'MISSING_ASYNC_ERROR_HANDLING',
            'Async function with await expression but no try/catch or .catch() handler.',
            {
              line: lineNumber,
              file: filePath,
              code: lines[lineNumber - 1].trim(),
              suggestion: 'Wrap await expressions in try/catch block or add .catch() handler',
            },
          ),
        );
      }
    }

    return issues;
  }

  /**
   * Extrai o corpo de uma função a partir do índice de abertura de chave
   */
  private extractFunctionBody(content: string, startIdx: number): string {
    let braceCount = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startIdx; i < content.length && i < startIdx + 500; i++) {
      const char = content[i];

      if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return content.substring(startIdx, i);
          }
        }
      }
    }

    return content.substring(startIdx, startIdx + 500);
  }

  /**
   * Calcula o score da validação
   * Penalidades: empty catch = 10, error swallowing = 8, throw string = 5, console-only = 3, etc.
   */
  private calculateScore(): number {
    const maxScore = 100;
    let penalties = 0;

    penalties += this.metrics.emptyCatchBlocks * 10;
    penalties += this.metrics.errorSwallowing * 8;
    penalties += this.metrics.throwStringLiterals * 5;
    penalties += this.metrics.consoleOnlyHandling * 3;
    penalties += this.metrics.genericCatches * 4;
    penalties += this.metrics.unhandledPromiseRejections * 6;
    penalties += this.metrics.missingFinallyBlocks * 5;
    penalties += this.metrics.missingErrorHandling * 7;

    return Math.max(0, maxScore - penalties);
  }

  /**
   * Lê o conteúdo de um arquivo
   */
  private readFile(filePath: string): string | null {
    try {
      const fs = require('fs');
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
