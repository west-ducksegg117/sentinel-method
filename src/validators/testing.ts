import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, TestingMetrics, SentinelConfig } from '../types';
import { BaseValidator } from './base';

/**
 * Dados reais de cobertura extraídos de ferramentas (Jest/Istanbul/nyc/c8).
 */
interface CoverageData {
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
}

/**
 * Valida a cobertura e qualidade dos testes do projeto.
 *
 * Estratégia de cobertura (em ordem de prioridade):
 * 1. coverage-summary.json (Jest/Istanbul formato nativo)
 * 2. coverage-final.json (Istanbul detailed — calcula summary)
 * 3. lcov.info (formato universal — parser próprio)
 * 4. Heurística melhorada (ratio ponderado por assertions e edge cases)
 *
 * Métricas adicionais:
 * - Contagem de assertions (expect/assert/should)
 * - Detecção de edge cases (null, undefined, boundary, error, timeout)
 * - Ratio de testes vs arquivos fonte
 * - Qualidade geral ponderada
 */
export class TestingValidator extends BaseValidator {
  readonly name = 'Testing Coverage';

  /** Caminhos comuns de saída de cobertura */
  private readonly coveragePaths = [
    'coverage/coverage-summary.json',
    'coverage-summary.json',
    '.nyc_output/coverage-summary.json',
  ];

  private readonly coverageFinalPaths = [
    'coverage/coverage-final.json',
    '.nyc_output/coverage-final.json',
  ];

  private readonly lcovPaths = [
    'coverage/lcov.info',
    'lcov.info',
    '.nyc_output/lcov.info',
  ];

  constructor(config: SentinelConfig) {
    super(config);
  }

  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeTestCoverage(sourceDir, issues);

    const score = metrics.qualityScore;
    const threshold = this.config.testingThreshold;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return this.buildResult(passed, issues, metrics, score, threshold);
  }

  private analyzeTestCoverage(sourceDir: string, issues: ValidationIssue[]): TestingMetrics {
    let testFiles = 0;
    let assertions = 0;
    let edgeCases = 0;
    let coverage = 0;

    try {
      const files = this.getAllFiles(sourceDir);
      const testFileList = files.filter(f =>
        f.endsWith('.test.ts') || f.endsWith('.spec.ts') ||
        f.endsWith('.test.js') || f.endsWith('.spec.js') ||
        f.endsWith('.test.tsx') || f.endsWith('.spec.tsx') ||
        f.endsWith('.test.jsx') || f.endsWith('.spec.jsx'),
      );
      const sourceFileCount = files.filter(f =>
        (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')) &&
        !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') &&
        !f.endsWith('.test.js') && !f.endsWith('.spec.js') &&
        !f.endsWith('.test.tsx') && !f.endsWith('.spec.tsx') &&
        !f.endsWith('.test.jsx') && !f.endsWith('.spec.jsx') &&
        !f.endsWith('.d.ts'),
      ).length;

      if (sourceFileCount === 0) {
        issues.push(this.createIssue('error', 'NO_SOURCE_FILES',
          'No source files found in the specified directory'));
        return { coverage: 0, assertions: 0, testFiles: 0, edgeCases: 0, qualityScore: 0 };
      }

      testFiles = testFileList.length;

      if (testFiles === 0) {
        issues.push(this.createIssue('error', 'NO_TESTS',
          'No test files found (*.test.ts, *.spec.ts, etc.)'));
      }

      // Analisar conteúdo dos testes: assertions e edge cases
      for (const file of testFileList) {
        const content = fs.readFileSync(file, 'utf-8');

        // Contabilizar assertions (expect, assert, should patterns)
        const expectCount = (content.match(/expect\s*\(/g) || []).length;
        const assertCount = (content.match(/assert\s*[\.(]/g) || []).length;
        const shouldCount = (content.match(/\.should\s*[\.(]/g) || []).length;
        assertions += expectCount + assertCount + shouldCount;

        // Contabilizar edge cases com padrões mais precisos
        const edgePatterns = [
          /\bnull\b/g,
          /\bundefined\b/g,
          /\bedge\s*case/gi,
          /\bboundary/gi,
          /\bcorner\s*case/gi,
          /\bempty\s*(string|array|object|list)/gi,
          /\bnegative/gi,
          /\bzero\b/g,
          /\boverflow/gi,
          /\btimeout/gi,
          /\bthrow/g,
          /\breject/g,
          /\.catch\(/g,
          /\bNaN\b/g,
          /\bInfinity\b/g,
          /\bMAX_SAFE_INTEGER/g,
        ];
        for (const pattern of edgePatterns) {
          edgeCases += (content.match(pattern) || []).length;
        }
      }

      // Buscar dados reais de cobertura (prioridade sobre heurística)
      const projectRoot = this.findProjectRoot(sourceDir);
      const realCoverage = this.readCoverageData(projectRoot || sourceDir);

      if (realCoverage) {
        // Cobertura real: média ponderada (lines 40%, statements 30%, branches 20%, functions 10%)
        coverage = Math.round(
          realCoverage.lines.pct * 0.4 +
          realCoverage.statements.pct * 0.3 +
          realCoverage.branches.pct * 0.2 +
          realCoverage.functions.pct * 0.1,
        );

        // Issues baseadas em dados reais
        if (realCoverage.branches.pct < 50) {
          issues.push(this.createIssue('warning', 'LOW_BRANCH_COVERAGE',
            `Branch coverage is ${realCoverage.branches.pct.toFixed(1)}%`,
            { suggestion: 'Add tests covering more conditional branches (if/else, switch, ternary)' },
          ));
        }

        if (realCoverage.functions.pct < 60) {
          issues.push(this.createIssue('warning', 'LOW_FUNCTION_COVERAGE',
            `Function coverage is ${realCoverage.functions.pct.toFixed(1)}%`,
            { suggestion: 'Add tests for untested functions and methods' },
          ));
        }

        if (realCoverage.lines.pct < 50) {
          issues.push(this.createIssue('warning', 'LOW_LINE_COVERAGE',
            `Line coverage is ${realCoverage.lines.pct.toFixed(1)}%`,
            { suggestion: 'Increase test coverage to at least 50% of code lines' },
          ));
        }
      } else {
        // Sem dados reais de cobertura — NÃO inventamos números
        // Reportamos o fato e orientamos o usuário a gerar dados reais
        coverage = 0;

        issues.push(this.createIssue('error', 'NO_COVERAGE_DATA',
          'No coverage report found. Cannot determine test coverage without real data.',
          { suggestion: 'Run tests with --coverage to generate coverage data (e.g., jest --coverage, nyc mocha, c8 node)' },
        ));
      }

      if (assertions === 0 && testFiles > 0) {
        issues.push(this.createIssue('warning', 'NO_ASSERTIONS',
          'No assertions found in test files'));
      }

      if (edgeCases < assertions * 0.1 && assertions > 0) {
        issues.push(this.createIssue('warning', 'LOW_EDGE_CASES',
          'Edge case coverage is low. Consider adding more edge case tests.',
          { suggestion: 'Add tests for boundary conditions, null/undefined, error scenarios, and timeouts' },
        ));
      }

      // Verificar arquivos fonte sem teste correspondente
      if (testFiles > 0) {
        const sourceFiles = files.filter(f =>
          (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')) &&
          !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') &&
          !f.endsWith('.test.js') && !f.endsWith('.spec.js') &&
          !f.endsWith('.test.tsx') && !f.endsWith('.spec.tsx') &&
          !f.endsWith('.test.jsx') && !f.endsWith('.spec.jsx') &&
          !f.endsWith('.d.ts'),
        );

        const testBasenames = testFileList.map(f => {
          const base = path.basename(f);
          return base.replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, '');
        });

        const untestedFiles = sourceFiles.filter(f => {
          const base = path.basename(f).replace(/\.(ts|js|tsx|jsx)$/, '');
          return !testBasenames.includes(base);
        });

        if (untestedFiles.length > 0 && untestedFiles.length <= 10) {
          for (const f of untestedFiles.slice(0, 5)) {
            issues.push(this.createIssue('info', 'UNTESTED_FILE',
              `No corresponding test file for ${path.relative(sourceDir, f)}`,
              { file: path.relative(sourceDir, f), suggestion: 'Create a test file for this module' },
            ));
          }
          if (untestedFiles.length > 5) {
            issues.push(this.createIssue('info', 'UNTESTED_FILES_SUMMARY',
              `${untestedFiles.length - 5} more source files without corresponding tests`,
            ));
          }
        }
      }
    } catch (error) {
      issues.push(this.createIssue('error', 'ANALYSIS_ERROR',
        `Error analyzing test coverage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ));
    }

    // Quality score baseado exclusivamente em dados reais e mensuráveis
    // Cobertura real é o fator dominante (70% do score)
    // Assertions e edge cases complementam (dados concretos extraídos dos arquivos)
    const assertionScore = assertions > 0
      ? Math.min((assertions / Math.max(testFiles, 1)) * 1.5, 15)
      : 0;
    const edgeCaseScore = edgeCases > 0
      ? Math.min((edgeCases / Math.max(assertions, 1)) * 50, 15)
      : 0;
    const qualityScore = coverage > 0
      ? Math.round(coverage * 0.7 + assertionScore + edgeCaseScore)
      : Math.round(assertionScore + edgeCaseScore); // sem cobertura real, score reflete só o mensurável

    return {
      coverage: Math.round(coverage),
      assertions,
      testFiles,
      edgeCases,
      qualityScore: Math.min(Math.max(qualityScore, 0), 100),
    };
  }

  /**
   * Tenta localizar o root do projeto (onde está o package.json)
   * subindo a partir do sourceDir.
   */
  private findProjectRoot(sourceDir: string): string | null {
    let current = path.resolve(sourceDir);
    const root = path.parse(current).root;

    while (current !== root) {
      if (fs.existsSync(path.join(current, 'package.json'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  /**
   * Lê dados reais de cobertura de várias fontes possíveis.
   * Prioridade: coverage-summary.json > coverage-final.json > lcov.info
   */
  private readCoverageData(baseDir: string): CoverageData | null {
    // 1. Tentar coverage-summary.json (formato nativo Jest/Istanbul)
    for (const relPath of this.coveragePaths) {
      const fullPath = path.join(baseDir, relPath);
      const data = this.parseCoverageSummary(fullPath);
      if (data) return data;
    }

    // 2. Tentar coverage-final.json (detailed — calcular summary)
    for (const relPath of this.coverageFinalPaths) {
      const fullPath = path.join(baseDir, relPath);
      const data = this.parseCoverageFinal(fullPath);
      if (data) return data;
    }

    // 3. Tentar lcov.info
    for (const relPath of this.lcovPaths) {
      const fullPath = path.join(baseDir, relPath);
      const data = this.parseLcov(fullPath);
      if (data) return data;
    }

    return null;
  }

  /**
   * Parseia coverage-summary.json (Jest/Istanbul).
   * Formato: { total: { statements: { total, covered, pct }, ... } }
   */
  private parseCoverageSummary(filePath: string): CoverageData | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      if (data.total) {
        return {
          statements: this.extractMetric(data.total.statements),
          branches: this.extractMetric(data.total.branches),
          functions: this.extractMetric(data.total.functions),
          lines: this.extractMetric(data.total.lines),
        };
      }
    } catch {
      // Silenciosamente ignora erros de parsing
    }
    return null;
  }

  /**
   * Parseia coverage-final.json (Istanbul detailed format).
   * Agrega todos os arquivos para calcular totais.
   */
  private parseCoverageFinal(filePath: string): CoverageData | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      let totalStatements = 0, coveredStatements = 0;
      let totalBranches = 0, coveredBranches = 0;
      let totalFunctions = 0, coveredFunctions = 0;

      for (const fileKey of Object.keys(data)) {
        const fileData = data[fileKey];

        // Statements (s)
        if (fileData.s) {
          const vals = Object.values(fileData.s) as number[];
          totalStatements += vals.length;
          coveredStatements += vals.filter(v => v > 0).length;
        }

        // Branches (b) — array of arrays
        if (fileData.b) {
          for (const branchKey of Object.keys(fileData.b)) {
            const branchArr = fileData.b[branchKey] as number[];
            totalBranches += branchArr.length;
            coveredBranches += branchArr.filter(v => v > 0).length;
          }
        }

        // Functions (f)
        if (fileData.f) {
          const vals = Object.values(fileData.f) as number[];
          totalFunctions += vals.length;
          coveredFunctions += vals.filter(v => v > 0).length;
        }
      }

      const pct = (covered: number, total: number): number =>
        total === 0 ? 100 : parseFloat(((covered / total) * 100).toFixed(2));

      return {
        statements: { total: totalStatements, covered: coveredStatements, pct: pct(coveredStatements, totalStatements) },
        branches: { total: totalBranches, covered: coveredBranches, pct: pct(coveredBranches, totalBranches) },
        functions: { total: totalFunctions, covered: coveredFunctions, pct: pct(coveredFunctions, totalFunctions) },
        lines: { total: totalStatements, covered: coveredStatements, pct: pct(coveredStatements, totalStatements) },
      };
    } catch {
      // Silenciosamente ignora erros de parsing
    }
    return null;
  }

  /**
   * Parseia lcov.info (formato universal de cobertura).
   * Agrega LF/LH (lines), FNF/FNH (functions), BRF/BRH (branches).
   */
  private parseLcov(filePath: string): CoverageData | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');

      let linesFound = 0, linesHit = 0;
      let functionsFound = 0, functionsHit = 0;
      let branchesFound = 0, branchesHit = 0;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('LF:')) linesFound += parseInt(trimmed.slice(3), 10) || 0;
        if (trimmed.startsWith('LH:')) linesHit += parseInt(trimmed.slice(3), 10) || 0;
        if (trimmed.startsWith('FNF:')) functionsFound += parseInt(trimmed.slice(4), 10) || 0;
        if (trimmed.startsWith('FNH:')) functionsHit += parseInt(trimmed.slice(4), 10) || 0;
        if (trimmed.startsWith('BRF:')) branchesFound += parseInt(trimmed.slice(4), 10) || 0;
        if (trimmed.startsWith('BRH:')) branchesHit += parseInt(trimmed.slice(4), 10) || 0;
      }

      if (linesFound === 0 && functionsFound === 0) return null;

      const pct = (hit: number, found: number): number =>
        found === 0 ? 100 : parseFloat(((hit / found) * 100).toFixed(2));

      return {
        statements: { total: linesFound, covered: linesHit, pct: pct(linesHit, linesFound) },
        branches: { total: branchesFound, covered: branchesHit, pct: pct(branchesHit, branchesFound) },
        functions: { total: functionsFound, covered: functionsHit, pct: pct(functionsHit, functionsFound) },
        lines: { total: linesFound, covered: linesHit, pct: pct(linesHit, linesFound) },
      };
    } catch {
      // Silenciosamente ignora erros de parsing
    }
    return null;
  }

  /** Extrai métrica com valores seguros */
  private extractMetric(metric: any): { total: number; covered: number; pct: number } {
    if (!metric || typeof metric !== 'object') {
      return { total: 0, covered: 0, pct: 0 };
    }
    return {
      total: metric.total || 0,
      covered: metric.covered || 0,
      pct: typeof metric.pct === 'number' ? metric.pct : 0,
    };
  }
}
