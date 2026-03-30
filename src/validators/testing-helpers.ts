import * as fs from 'fs';
import * as path from 'path';

/**
 * Dados reais de cobertura extraídos de ferramentas (Jest/Istanbul/nyc/c8).
 */
export interface CoverageData {
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
}

/** Informações do test runner detectado */
export interface TestRunnerInfo {
  runner: 'jest' | 'vitest' | 'mocha' | 'c8' | 'karma' | 'ava';
  command: string;
  coverageDir: string;
}

/** Caminhos comuns de saída de cobertura */
const coveragePaths = [
  'coverage/coverage-summary.json',
  'coverage-summary.json',
  '.nyc_output/coverage-summary.json',
];

const coverageFinalPaths = [
  'coverage/coverage-final.json',
  '.nyc_output/coverage-final.json',
];

const lcovPaths = [
  'coverage/lcov.info',
  'lcov.info',
  '.nyc_output/lcov.info',
];

/**
 * Tenta localizar o root do projeto (onde está o package.json)
 * subindo a partir do sourceDir.
 */
export function findProjectRoot(sourceDir: string): string | null {
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
 * Detecta o test runner do projeto analisando package.json e dependências.
 */
export function detectTestRunner(projectRoot: string): TestRunnerInfo | null {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const scripts = pkg.scripts || {};
    const testScript = scripts.test || '';

    // Jest (mais comum)
    if (allDeps['jest'] || allDeps['@jest/core'] || allDeps['ts-jest'] ||
        testScript.includes('jest') ||
        fs.existsSync(path.join(projectRoot, 'jest.config.js')) ||
        fs.existsSync(path.join(projectRoot, 'jest.config.ts')) ||
        fs.existsSync(path.join(projectRoot, 'jest.config.mjs'))) {
      return {
        runner: 'jest',
        command: 'npx jest --coverage --coverageReporters=json-summary --coverageReporters=json --silent 2>/dev/null',
        coverageDir: path.join(projectRoot, 'coverage'),
      };
    }

    // Vitest
    if (allDeps['vitest'] || testScript.includes('vitest') ||
        fs.existsSync(path.join(projectRoot, 'vitest.config.ts')) ||
        fs.existsSync(path.join(projectRoot, 'vitest.config.js'))) {
      return {
        runner: 'vitest',
        command: 'npx vitest run --coverage --reporter=json 2>/dev/null',
        coverageDir: path.join(projectRoot, 'coverage'),
      };
    }

    // Mocha + nyc/istanbul
    if (allDeps['mocha'] || testScript.includes('mocha')) {
      if (allDeps['nyc'] || allDeps['c8']) {
        const tool = allDeps['c8'] ? 'c8' : 'nyc';
        return {
          runner: 'mocha',
          command: `npx ${tool} --reporter=json-summary npx mocha 2>/dev/null`,
          coverageDir: path.join(projectRoot, tool === 'nyc' ? '.nyc_output' : 'coverage'),
        };
      }
    }

    // c8 standalone
    if (allDeps['c8'] || testScript.includes('c8')) {
      return {
        runner: 'c8',
        command: 'npx c8 --reporter=json-summary npm test 2>/dev/null',
        coverageDir: path.join(projectRoot, 'coverage'),
      };
    }

    // AVA
    if (allDeps['ava'] || testScript.includes('ava')) {
      return {
        runner: 'ava',
        command: 'npx c8 --reporter=json-summary npx ava 2>/dev/null',
        coverageDir: path.join(projectRoot, 'coverage'),
      };
    }

    // Fallback: se tem script "test" e "coverage" no package.json
    if (scripts['test:coverage'] || scripts['coverage']) {
      const coverageScript = scripts['test:coverage'] ? 'test:coverage' : 'coverage';
      return {
        runner: 'jest', // genérico
        command: `npm run ${coverageScript} 2>/dev/null`,
        coverageDir: path.join(projectRoot, 'coverage'),
      };
    }

    // Último fallback: npm test com flag de coverage
    if (scripts.test) {
      return {
        runner: 'jest',
        command: 'npm test -- --coverage --coverageReporters=json-summary 2>/dev/null',
        coverageDir: path.join(projectRoot, 'coverage'),
      };
    }
  } catch {
    // Silenciosamente ignora erros
  }
  return null;
}

/**
 * Parseia coverage-summary.json (Jest/Istanbul).
 * Formato: { total: { statements: { total, covered, pct }, ... } }
 */
export function parseCoverageSummary(filePath: string): CoverageData | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (data.total) {
      return {
        statements: extractMetric(data.total.statements),
        branches: extractMetric(data.total.branches),
        functions: extractMetric(data.total.functions),
        lines: extractMetric(data.total.lines),
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
export function parseCoverageFinal(filePath: string): CoverageData | null {
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
export function parseLcov(filePath: string): CoverageData | null {
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
export function extractMetric(metric: any): { total: number; covered: number; pct: number } {
  if (!metric || typeof metric !== 'object') {
    return { total: 0, covered: 0, pct: 0 };
  }
  return {
    total: metric.total || 0,
    covered: metric.covered || 0,
    pct: typeof metric.pct === 'number' ? metric.pct : 0,
  };
}

/**
 * Lê dados reais de cobertura de várias fontes possíveis.
 * Prioridade: coverage-summary.json > coverage-final.json > lcov.info
 */
export function readCoverageData(baseDir: string): CoverageData | null {
  // 1. Tentar coverage-summary.json (formato nativo Jest/Istanbul)
  for (const relPath of coveragePaths) {
    const fullPath = path.join(baseDir, relPath);
    const data = parseCoverageSummary(fullPath);
    if (data) return data;
  }

  // 2. Tentar coverage-final.json (detailed — calcular summary)
  for (const relPath of coverageFinalPaths) {
    const fullPath = path.join(baseDir, relPath);
    const data = parseCoverageFinal(fullPath);
    if (data) return data;
  }

  // 3. Tentar lcov.info
  for (const relPath of lcovPaths) {
    const fullPath = path.join(baseDir, relPath);
    const data = parseLcov(fullPath);
    if (data) return data;
  }

  return null;
}
