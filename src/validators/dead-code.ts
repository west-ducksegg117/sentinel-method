import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, SentinelConfig } from '../types';
import { BaseValidator } from './base';

/**
 * Métricas de detecção de código morto
 */
export interface DeadCodeMetrics {
  filesAnalyzed: number;
  unusedImports: number;
  commentedCode: number;
  unreachableCode: number;
  emptyFunctions: number;
  unusedExportedFunctions: number;
  deadFeatureFlags: number;
  redundantElseAfterReturn: number;
  unusedVariables: number;
  deadCodeScore: number;
}

/**
 * Valida e detecta código morto (dead code) no projeto.
 *
 * Detecções:
 * - Imports não utilizados — símbolos importados nunca referenciados no arquivo
 * - Blocos de código comentado — 3+ linhas consecutivas comentadas
 * - Código inacessível — código após return/throw/break/continue
 * - Funções vazias — funções com corpo vazio
 * - Funções exportadas não importadas — exported functions não usadas em outro arquivo
 * - Dead feature flags — if(false), if(0), if(true) sempre verdadeiro/falso
 * - Redundant else após return — if block termina com return mas tem else
 * - Variáveis não utilizadas — declaradas mas nunca referenciadas
 */
export class DeadCodeValidator extends BaseValidator {
  readonly name = 'Dead Code Detection';

  constructor(config: SentinelConfig) {
    super(config);
  }

  /**
   * Executa a análise completa de código morto
   */
  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeDeadCode(sourceDir, issues);

    const score = metrics.deadCodeScore;
    const threshold = 70;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return this.buildResult(passed, issues, metrics as any, score, threshold);
  }

  /**
   * Análise principal de código morto
   */
  private analyzeDeadCode(sourceDir: string, issues: ValidationIssue[]): DeadCodeMetrics {
    let filesAnalyzed = 0;
    let unusedImports = 0;
    let commentedCode = 0;
    let unreachableCode = 0;
    let emptyFunctions = 0;
    let unusedExportedFunctions = 0;
    let deadFeatureFlags = 0;
    let redundantElseAfterReturn = 0;
    let unusedVariables = 0;

    try {
      const sourceFiles = this.getSourceFiles(sourceDir);

      // Coletar todas as funções/constantes exportadas
      const exportedSymbols = new Map<string, { file: string; name: string }>();
      const allImportedSymbols = new Set<string>();

      // Primeira passagem: coletar exports
      for (const file of sourceFiles) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const relativeFile = path.relative(sourceDir, file);

          // Coletar funções/constantes exportadas
          const exportMatches = content.matchAll(/export\s+(?:function|class|const|let|var)\s+(\w+)/g);
          for (const match of exportMatches) {
            const name = match[1];
            if (!exportedSymbols.has(name)) {
              exportedSymbols.set(name, { file: relativeFile, name });
            }
          }

          // Coletar todos os imports (segunda passagem depois)
          const importMatches = content.matchAll(/import\s+(?:\{[^}]+\}|[\w$]+)\s+from\s+['"][^'"]+['"]/g);
          for (const match of importMatches) {
            const importStr = match[0];
            const namedImports = importStr.match(/\{([^}]+)\}/);
            if (namedImports) {
              const names = namedImports[1].split(',').map(s => s.trim().split(/\s+as\s+/)[1] || s.trim().split(/\s+as\s+/)[0]);
              names.forEach(n => allImportedSymbols.add(n));
            } else {
              const defaultMatch = importStr.match(/import\s+(\w+)\s+from/);
              if (defaultMatch) allImportedSymbols.add(defaultMatch[1]);
            }
          }
        } catch {
          // Ignorar erros de leitura
        }
      }

      // Segunda passagem: analisar cada arquivo
      for (const file of sourceFiles) {
        filesAnalyzed++;
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          const relativeFile = path.relative(sourceDir, file);

          // 1. Detectar imports não utilizados
          const localUnusedImports = this.detectUnusedImports(content, relativeFile, issues);
          unusedImports += localUnusedImports;

          // 2. Detectar blocos de código comentado (3+ linhas)
          const localCommentedCode = this.detectCommentedCodeBlocks(lines, relativeFile, issues);
          commentedCode += localCommentedCode;

          // 3. Detectar código inacessível
          const localUnreachable = this.detectUnreachableCode(lines, relativeFile, issues);
          unreachableCode += localUnreachable;

          // 4. Detectar funções vazias
          const localEmptyFunctions = this.detectEmptyFunctions(content, lines, relativeFile, issues);
          emptyFunctions += localEmptyFunctions;

          // 5. Detectar dead feature flags
          const localDeadFlags = this.detectDeadFeatureFlags(lines, relativeFile, issues);
          deadFeatureFlags += localDeadFlags;

          // 6. Detectar redundant else após return
          const localRedundantElse = this.detectRedundantElse(lines, relativeFile, issues);
          redundantElseAfterReturn += localRedundantElse;

          // 7. Detectar variáveis não utilizadas
          const localUnusedVars = this.detectUnusedVariables(content, lines, relativeFile, issues);
          unusedVariables += localUnusedVars;

        } catch (error) {
          // Ignorar erros em arquivos individuais
        }
      }

      // 8. Detectar funções exportadas não importadas por ninguém
      for (const [name, { file: exportFile }] of exportedSymbols) {
        // Se nenhum arquivo importa esse símbolo
        if (!allImportedSymbols.has(name)) {
          unusedExportedFunctions++;
          issues.push(this.createIssue('info', 'UNUSED_EXPORT',
            `Exported function/constant '${name}' is not imported by any other file`,
            {
              file: exportFile,
              suggestion: `Remove '${name}' from exports if no longer needed or verify if it's re-exported`,
            },
          ));
        }
      }

    } catch (error) {
      issues.push(this.createIssue('error', 'ANALYSIS_ERROR',
        `Error analyzing dead code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ));
    }

    return this.buildMetrics(
      filesAnalyzed,
      unusedImports,
      commentedCode,
      unreachableCode,
      emptyFunctions,
      unusedExportedFunctions,
      deadFeatureFlags,
      redundantElseAfterReturn,
      unusedVariables,
    );
  }

  /**
   * Detecta imports não utilizados no arquivo
   * Retorna contagem de issues criadas
   */
  private detectUnusedImports(content: string, file: string, issues: ValidationIssue[]): number {
    let count = 0;

    // Extrair imports nomeados
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importedNames = match[1].split(',').map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[1] || parts[0];
      });

      for (const name of importedNames) {
        // Verificar se o nome está presente no resto do arquivo (excluindo a própria declaração)
        const contentWithoutImport = content.replace(match[0], '');
        // Usar word boundaries para evitar false positives (ex: 'test' matching 'testing')
        if (!new RegExp(`\\b${name}\\b`).test(contentWithoutImport)) {
          count++;
          issues.push(this.createIssue('warning', 'UNUSED_IMPORT',
            `Imported symbol '${name}' is never used in this file`,
            { file, suggestion: `Remove unused import '${name}'` },
          ));
        }
      }
    }

    // Extrair imports padrão (default imports)
    const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = defaultImportRegex.exec(content)) !== null) {
      const name = match[1];
      const contentWithoutImport = content.replace(match[0], '');

      if (!new RegExp(`\\b${name}\\b`).test(contentWithoutImport)) {
        count++;
        issues.push(this.createIssue('warning', 'UNUSED_IMPORT',
          `Default import '${name}' is never used in this file`,
          { file, suggestion: `Remove unused import '${name}'` },
        ));
      }
    }

    return count;
  }

  /**
   * Detecta blocos de código comentado (3+ linhas consecutivas)
   */
  private detectCommentedCodeBlocks(lines: string[], file: string, issues: ValidationIssue[]): number {
    let count = 0;
    let commentBlockStart = -1;
    let commentBlockLength = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Verificar se é uma linha comentada (// ou /* */)
      const isCommented = /^\/\/|^\/\*|^\*/.test(line) || /^\s*\/\//.test(lines[i]);

      if (isCommented && !line.includes('eslint') && !line.includes('prettier') &&
          !line.includes('ts-ignore') && !line.includes('noqa')) {
        if (commentBlockStart === -1) {
          commentBlockStart = i;
          commentBlockLength = 1;
        } else if (i === commentBlockStart + commentBlockLength) {
          commentBlockLength++;
        } else {
          // Bloco foi interrompido
          if (commentBlockLength >= 3) {
            count++;
            issues.push(this.createIssue('info', 'COMMENTED_CODE',
              `Block of ${commentBlockLength} commented lines detected (lines ${commentBlockStart + 1}-${i})`,
              { file, line: commentBlockStart + 1, suggestion: 'Remove commented code or uncomment if still needed' },
            ));
          }
          commentBlockStart = i;
          commentBlockLength = 1;
        }
      } else {
        if (commentBlockStart !== -1 && commentBlockLength >= 3) {
          count++;
          issues.push(this.createIssue('info', 'COMMENTED_CODE',
            `Block of ${commentBlockLength} commented lines detected (lines ${commentBlockStart + 1}-${i})`,
            { file, line: commentBlockStart + 1, suggestion: 'Remove commented code or uncomment if still needed' },
          ));
        }
        commentBlockStart = -1;
        commentBlockLength = 0;
      }
    }

    // Verificar último bloco
    if (commentBlockStart !== -1 && commentBlockLength >= 3) {
      count++;
      issues.push(this.createIssue('info', 'COMMENTED_CODE',
        `Block of ${commentBlockLength} commented lines detected at end of file`,
        { file, line: commentBlockStart + 1, suggestion: 'Remove commented code or uncomment if still needed' },
      ));
    }

    return count;
  }

  /**
   * Detecta código inacessível após return/throw/break/continue
   */
  private detectUnreachableCode(lines: string[], file: string, issues: ValidationIssue[]): number {
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Procurar por return, throw, break, continue (não em comentários)
      if (/\b(return|throw|break|continue)\b/.test(line) && !line.trim().startsWith('//')) {
        // Verificar próximas linhas que não são comentários nem chaves de fechamento
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();

          // Ignorar linhas vazias, comentários, chaves de fechamento
          if (nextLine === '' || nextLine.startsWith('//') || nextLine === '}' ||
              nextLine === '} else' || nextLine === '} catch' || nextLine === '} finally') {
            continue;
          }

          // Se encontrou código real após return/throw
          if (!/^\s*(\/\/|\/\*|\*|else|catch|finally)/.test(lines[j])) {
            count++;
            issues.push(this.createIssue('warning', 'UNREACHABLE_CODE',
              `Code after '${line.match(/\b(return|throw|break|continue)\b/)?.[1]}' statement is unreachable (line ${j + 1})`,
              { file, line: i + 1, suggestion: 'Remove unreachable code or restructure the logic' },
            ));
            break; // Um issue por bloco é suficiente
          }
        }
      }
    }

    return count;
  }

  /**
   * Detecta funções vazias (corpo vazio ou apenas comentários)
   */
  private detectEmptyFunctions(_content: string, lines: string[], file: string, issues: ValidationIssue[]): number {
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detectar assinatura de função/método
      if (/(?:function\s+\w+|(?:async\s+)?[a-zA-Z_]\w*\s*)\s*\([^)]*\)\s*[:{]/.test(line)) {
        // Procurar pelo corpo da função
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        let bodyStartLine = i;
        let hasContent = false;

        // Checar se há código no corpo
        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          const bodyLine = lines[j].trim();
          braceCount += (bodyLine.match(/{/g) || []).length - (bodyLine.match(/}/g) || []).length;

          // Ignorar linhas vazias e comentários
          if (bodyLine !== '' && !bodyLine.startsWith('//') && !bodyLine.startsWith('*')) {
            hasContent = true;
          }

          if (braceCount === 0) {
            if (!hasContent) {
              count++;
              issues.push(this.createIssue('warning', 'EMPTY_FUNCTION',
                `Function/method has empty body (lines ${bodyStartLine + 1}-${j + 1})`,
                { file, line: bodyStartLine + 1, suggestion: 'Implement function body or remove if no longer needed' },
              ));
            }
            break;
          }
        }
      }
    }

    return count;
  }

  /**
   * Detecta dead feature flags: if(false), if(0), if(true)
   */
  private detectDeadFeatureFlags(lines: string[], file: string, issues: ValidationIssue[]): number {
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Procurar por if(false), if(0), if(true), if(1)
      if (/\bif\s*\(\s*(false|0|true|1)\s*\)/.test(line)) {
        const match = line.match(/\bif\s*\(\s*(false|0|true|1)\s*\)/);
        const value = match?.[1];

        count++;
        const severity = (value === 'false' || value === '0') ? 'warning' : 'warning';
        const message = (value === 'false' || value === '0')
          ? `Dead feature flag: 'if(${value})' condition is always false, code will never execute`
          : `Always-true condition: 'if(${value})' always executes`;

        issues.push(this.createIssue(severity, 'DEAD_FEATURE_FLAG',
          message,
          { file, line: i + 1, suggestion: 'Remove dead code or replace with proper feature flag logic' },
        ));
      }
    }

    return count;
  }

  /**
   * Detecta redundant else após return
   */
  private detectRedundantElse(lines: string[], file: string, issues: ValidationIssue[]): number {
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Procurar por 'return' seguido de 'else'
      if (/\breturn\b/.test(line) && !line.trim().startsWith('//')) {
        // Procurar próximo 'else'
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();

          if (nextLine === '' || nextLine.startsWith('//')) continue;

          if (/^\}\s*else/.test(lines[j])) {
            count++;
            issues.push(this.createIssue('info', 'REDUNDANT_ELSE',
              `Redundant 'else' after 'return' statement — else is unreachable`,
              { file, line: j + 1, suggestion: 'Remove the "else" keyword and unindent the else block' },
            ));
            break;
          }

          if (nextLine === '}') break;
        }
      }
    }

    return count;
  }

  /**
   * Detecta variáveis não utilizadas (declaradas mas não referenciadas)
   * Detecção básica via regex
   */
  private detectUnusedVariables(content: string, _lines: string[], file: string, issues: ValidationIssue[]): number {
    let count = 0;

    // Regex para declarações: const/let/var name = ...
    const declarationRegex = /\b(?:const|let|var)\s+(\w+)\s*=/g;
    let match;
    const declaredVars = new Map<string, number>();

    while ((match = declarationRegex.exec(content)) !== null) {
      const varName = match[1];
      declaredVars.set(varName, content.indexOf(match[0]));
    }

    // Para cada variável, verificar se é referenciada
    for (const [varName, declPos] of declaredVars) {
      // Ignorar variáveis que começam com '_' (convenção para ignoradas)
      if (varName.startsWith('_')) continue;

      // Ignorar variáveis muito curtas ou comuns
      if (['i', 'j', 'k', 'x', 'y', 'z', 'e', 'err'].includes(varName)) continue;

      // Criar regex para referências (word boundary)
      const refRegex = new RegExp(`\\b${varName}\\b`, 'g');
      const matches = content.match(refRegex) || [];

      // Se encontrado apenas uma vez (a declaração), é não utilizada
      if (matches.length === 1) {
        count++;
        // Encontrar linha da declaração
        const declLineNum = content.substring(0, declPos).split('\n').length;

        issues.push(this.createIssue('warning', 'UNUSED_VARIABLE',
          `Variable '${varName}' is declared but never used`,
          { file, line: declLineNum, suggestion: `Remove unused variable '${varName}' or prefix with '_' if intentional` },
        ));
      }
    }

    return count;
  }

  /**
   * Constrói as métricas finais com scoring
   */
  private buildMetrics(
    filesAnalyzed: number,
    unusedImports: number,
    commentedCode: number,
    unreachableCode: number,
    emptyFunctions: number,
    unusedExportedFunctions: number,
    deadFeatureFlags: number,
    redundantElseAfterReturn: number,
    unusedVariables: number,
  ): DeadCodeMetrics {
    // Calcular penalidades
    const penalties =
      unusedImports * 2 +
      commentedCode * 1 +
      unreachableCode * 5 +
      emptyFunctions * 3 +
      unusedExportedFunctions * 4 +
      deadFeatureFlags * 5 +
      redundantElseAfterReturn * 2 +
      unusedVariables * 3;

    const deadCodeScore = Math.max(100 - penalties, 0);

    return {
      filesAnalyzed,
      unusedImports,
      commentedCode,
      unreachableCode,
      emptyFunctions,
      unusedExportedFunctions,
      deadFeatureFlags,
      redundantElseAfterReturn,
      unusedVariables,
      deadCodeScore: Math.min(deadCodeScore, 100),
    };
  }
}
