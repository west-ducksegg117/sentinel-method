#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { Sentinel } from './sentinel';
import { ValidationResult, ValidatorResult } from './types';

// ── Cores e símbolos ──
const PASS = chalk.green('✓');
const FAIL = chalk.red('✗');
const WARN = chalk.yellow('⚠');
const INFO = chalk.cyan('ℹ');
const BULLET = chalk.gray('›');

/**
 * Formata uma barra de progresso visual.
 * Ex: [████████████░░░░░░░░] 65%
 */
function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let colorFn: (s: string) => string;
  if (score >= 80) colorFn = chalk.green;
  else if (score >= 60) colorFn = chalk.yellow;
  else colorFn = chalk.red;

  return `[${colorFn(bar)}] ${colorFn(`${score}%`)}`;
}

/** Retorna a grade baseada no score */
function scoreGrade(score: number): string {
  if (score >= 90) return chalk.green.bold('A');
  if (score >= 80) return chalk.green('B');
  if (score >= 70) return chalk.yellow('C');
  if (score >= 60) return chalk.yellow('D');
  return chalk.red('F');
}

/** Formata o header do relatório */
function printHeader(): void {
  console.log('');
  console.log(chalk.bold.cyan('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('  ║') + chalk.bold.white('   🛡️  Sentinel Method v2.0              ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('  ║') + chalk.gray('   Production-Grade Quality Gate          ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('  ╚══════════════════════════════════════════╝'));
  console.log('');
}

/** Formata os resultados de um validator */
function printValidatorResult(result: ValidatorResult): void {
  const status = result.passed ? PASS : FAIL;
  const scorePart = result.score !== undefined
    ? ` ${scoreBar(result.score, 15)} ${scoreGrade(result.score)}`
    : '';

  console.log(`  ${status} ${chalk.bold(result.validator)}${scorePart}`);

  // Issues resumidas (máximo 3 por validator)
  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  if (errors.length > 0) {
    const shown = errors.slice(0, 3);
    for (const issue of shown) {
      const location = issue.file ? chalk.gray(` (${path.basename(issue.file)}:${issue.line || 0})`) : '';
      console.log(`    ${FAIL} ${issue.message}${location}`);
    }
    if (errors.length > 3) {
      console.log(chalk.gray(`    ... +${errors.length - 3} more errors`));
    }
  }

  if (warnings.length > 0) {
    const shown = warnings.slice(0, 2);
    for (const issue of shown) {
      const location = issue.file ? chalk.gray(` (${path.basename(issue.file)}:${issue.line || 0})`) : '';
      console.log(`    ${WARN} ${issue.message}${location}`);
    }
    if (warnings.length > 2) {
      console.log(chalk.gray(`    ... +${warnings.length - 2} more warnings`));
    }
  }

  if (infos.length > 0 && errors.length === 0 && warnings.length === 0) {
    console.log(chalk.gray(`    ${INFO} ${infos.length} info(s)`));
  }
}

/** Formata tabela de scores dos validators */
function printScoreTable(results: ValidatorResult[]): void {
  const scored = results.filter(r => r.score !== undefined);
  if (scored.length === 0) return;

  console.log('');
  console.log(chalk.bold('  ─── Score Breakdown ──────────────────────'));
  console.log('');
  console.log(chalk.gray('  Validator               Score  Threshold  Status'));
  console.log(chalk.gray('  ───────────────────────  ─────  ─────────  ──────'));

  for (const r of scored) {
    const name = r.validator.padEnd(23);
    const score = String(r.score ?? 0).padStart(3) + '%';
    const threshold = r.threshold !== undefined ? String(r.threshold).padStart(5) + '%' : '    —';
    const status = r.passed ? chalk.green('PASS') : chalk.red('FAIL');

    let scoreColor: (s: string) => string;
    if ((r.score ?? 0) >= 80) scoreColor = chalk.green;
    else if ((r.score ?? 0) >= 60) scoreColor = chalk.yellow;
    else scoreColor = chalk.red;

    console.log(`  ${chalk.white(name)}  ${scoreColor(score)}    ${chalk.gray(threshold)}  ${status}`);
  }
}

/** Calcula e exibe o score agregado */
function printAggregateScore(results: ValidatorResult[]): void {
  const scored = results.filter(r => r.score !== undefined);
  if (scored.length === 0) return;

  const avgScore = Math.round(scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length);
  const minScore = Math.min(...scored.map(r => r.score ?? 0));
  const maxScore = Math.max(...scored.map(r => r.score ?? 0));

  console.log('');
  console.log(`  ${BULLET} Aggregate score: ${scoreBar(avgScore, 20)} ${scoreGrade(avgScore)}`);
  console.log(chalk.gray(`    min: ${minScore}%  max: ${maxScore}%  validators: ${scored.length}`));
}

/** Mostra detalhes relevantes de cada validator */
function printValidatorDetails(results: ValidatorResult[]): void {
  const detailEntries: string[] = [];

  for (const r of results) {
    const d = r.details;
    if (!d || Object.keys(d).length === 0) continue;

    // Extrair métricas-chave de cada validator
    if (r.validator === 'Testing Quality' && d.testFiles !== undefined) {
      detailEntries.push(`  ${INFO} Testing: ${d.testFiles} test files, ${d.assertions ?? 0} assertions, ${d.edgeCases ?? 0} edge cases`);
    }
    if (r.validator === 'Security Scanning' && d.vulnerabilitiesFound !== undefined) {
      detailEntries.push(`  ${INFO} Security: ${d.vulnerabilitiesFound} vulns, ${d.injectionRisks ?? 0} injection risks, ${d.hardcodedSecrets ?? 0} secrets`);
    }
    if (r.validator === 'Performance Analysis') {
      if (d.avgComplexity !== undefined) {
        detailEntries.push(`  ${INFO} Performance: avg complexity ${d.avgComplexity}, ${d.memoryIssues ?? 0} memory issues`);
      }
    }
    if (r.validator === 'Maintainability Index') {
      if (d.maintainabilityIndex !== undefined) {
        detailEntries.push(`  ${INFO} Maintainability: index ${d.maintainabilityIndex}, ${d.cyclomaticComplexity ?? 0} cyclomatic complexity`);
      }
    }
    if (r.validator === 'Dependency Health') {
      if (d.totalDeps !== undefined) {
        detailEntries.push(`  ${INFO} Dependencies: ${d.totalDeps} total, ${d.unusedDeps ?? 0} unused, ${d.wildcardVersions ?? 0} wildcard`);
      }
    }
  }

  if (detailEntries.length > 0) {
    console.log('');
    console.log(chalk.bold('  ─── Details ──────────────────────────────'));
    console.log('');
    for (const entry of detailEntries) {
      console.log(entry);
    }
  }
}

/** Formata o summary final */
function printSummary(result: ValidationResult): void {
  // Tabela de scores
  printScoreTable(result.results);

  // Detalhes dos validators
  printValidatorDetails(result.results);

  console.log('');
  console.log(chalk.bold('  ─── Summary ──────────────────────────────'));
  console.log('');

  const { totalFiles, passedChecks, failedChecks, warnings } = result.summary;

  console.log(`  ${BULLET} Files analyzed:  ${chalk.bold(String(totalFiles))}`);
  console.log(`  ${BULLET} Validators:      ${chalk.green.bold(String(passedChecks))} passed  ${failedChecks > 0 ? chalk.red.bold(String(failedChecks)) + ' failed' : ''}`);

  if (warnings > 0) {
    console.log(`  ${BULLET} Warnings:        ${chalk.yellow.bold(String(warnings))}`);
  }

  // Score agregado
  printAggregateScore(result.results);

  console.log('');
  console.log(`  ${BULLET} Duration:        ${chalk.bold(result.timestamp)}`);

  console.log('');

  if (result.success) {
    console.log(chalk.green.bold('  ✓ Quality gate PASSED'));
  } else {
    console.log(chalk.red.bold('  ✗ Quality gate FAILED'));
  }

  console.log('');
}

// ── Watch mode helper ──

/** Debounce para evitar execuções múltiplas em batch de saves */
function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Filtra issues por severidade mínima */
function filterBySeverity(result: ValidationResult, minSeverity: string): ValidationResult {
  const severityOrder: Record<string, number> = { error: 3, warning: 2, info: 1 };
  const minLevel = severityOrder[minSeverity] ?? 0;

  if (minLevel === 0) return result;

  const filteredResults = result.results.map(vr => ({
    ...vr,
    issues: vr.issues.filter(i => (severityOrder[i.severity] ?? 0) >= minLevel),
  }));

  return { ...result, results: filteredResults };
}

/** Executa validação e exibe resultados (reutilizado por run e watch) */
async function runValidation(
  sentinel: Sentinel,
  sourceDir: string,
  options: Record<string, any>,
): Promise<number> {
  const result = await sentinel.validate(sourceDir);
  const filtered = options.minSeverity ? filterBySeverity(result, options.minSeverity) : result;

  if (options.json || options.format === 'json') {
    console.log(JSON.stringify(filtered, null, 2));
  } else if (options.format === 'markdown') {
    console.log(filtered.report);
  } else {
    printHeader();

    console.log(chalk.bold('  ─── Validators ───────────────────────────'));
    console.log('');

    for (const validatorResult of filtered.results) {
      printValidatorResult(validatorResult);
    }

    printSummary(filtered);
  }

  return result.exitCode;
}

// ── CLI Program ──

const program = new Command();

program
  .name('sentinel')
  .description('Sentinel Method — Production-Grade Quality Gate for AI-Generated Code')
  .version('2.0.0');

program
  .command('validate')
  .alias('v')
  .description('Run the full validation pipeline on a source directory')
  .argument('[directory]', 'Source directory to validate', '.')
  .option('-f, --format <format>', 'Report format: json, markdown, console', 'console')
  .option('-t, --testing-threshold <n>', 'Minimum testing score (0-100)', '80')
  .option('-s, --security-level <level>', 'Security level: strict, moderate, permissive', 'strict')
  .option('-p, --performance-target <target>', 'Performance target: optimal, good, acceptable', 'optimal')
  .option('-m, --maintainability-score <n>', 'Minimum maintainability score (0-100)', '75')
  .option('--fail-on-warnings', 'Treat warnings as failures', false)
  .option('--json', 'Output raw JSON (shorthand for -f json)')
  .option('--min-severity <level>', 'Filter issues by minimum severity: error, warning, info')
  .option('-w, --watch', 'Watch mode — re-run validation on file changes', false)
  .action(async (directory: string, options: Record<string, any>) => {
    const sourceDir = path.resolve(directory);

    const sentinel = new Sentinel({
      testingThreshold: parseInt(options.testingThreshold, 10),
      securityLevel: options.securityLevel,
      performanceTarget: options.performanceTarget,
      maintainabilityScore: parseInt(options.maintainabilityScore, 10),
      failOnWarnings: options.failOnWarnings,
      reporters: [options.json ? 'json' : options.format],
    });

    try {
      // ── Watch mode ──
      if (options.watch) {
        console.log(chalk.cyan(`\n  👁  Watch mode — monitoring ${sourceDir}\n`));
        console.log(chalk.gray('  Press Ctrl+C to stop\n'));

        // Primeira execução
        await runValidation(sentinel, sourceDir, options);

        // Observar mudanças com debounce de 500ms
        const rerun = debounce(async () => {
          console.clear();
          console.log(chalk.gray(`  ⟳ Re-validating at ${new Date().toLocaleTimeString()}...\n`));
          try {
            await runValidation(sentinel, sourceDir, options);
          } catch (err) {
            console.error(chalk.red(`  Watch error: ${err instanceof Error ? err.message : err}`));
          }
        }, 500);

        const fs = await import('fs');
        fs.watch(sourceDir, { recursive: true }, (_event, filename) => {
          // Ignorar arquivos gerados / ocultos
          if (!filename) return;
          if (filename.includes('node_modules')) return;
          if (filename.includes('.git')) return;
          if (filename.includes('dist/')) return;
          if (filename.includes('coverage/')) return;
          rerun();
        });

        // Manter processo vivo
        await new Promise(() => {});
        return;
      }

      // ── Execução normal ──
      const exitCode = await runValidation(sentinel, sourceDir, options);
      process.exit(exitCode);
    } catch (error) {
      console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
      process.exit(2);
    }
  });

program
  .command('list')
  .alias('ls')
  .description('List all available validators')
  .action(() => {
    printHeader();
    console.log(chalk.bold('  Available Validators:'));
    console.log('');

    const sentinel = new Sentinel();
    const validators = sentinel.getValidators();

    for (const v of validators) {
      console.log(`  ${chalk.cyan('●')} ${v.name}`);
    }

    console.log('');
    console.log(chalk.gray(`  Total: ${validators.length} validators`));
    console.log('');
  });

program.parse();
