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

/** Formata o summary final */
function printSummary(result: ValidationResult): void {
  console.log('');
  console.log(chalk.bold('  ─── Summary ──────────────────────────────'));
  console.log('');

  const { totalFiles, passedChecks, failedChecks, warnings } = result.summary;

  console.log(`  ${BULLET} Files analyzed:  ${chalk.bold(String(totalFiles))}`);
  console.log(`  ${BULLET} Validators:      ${chalk.green.bold(String(passedChecks))} passed  ${failedChecks > 0 ? chalk.red.bold(String(failedChecks)) + ' failed' : ''}`);

  if (warnings > 0) {
    console.log(`  ${BULLET} Warnings:        ${chalk.yellow.bold(String(warnings))}`);
  }

  console.log('');

  if (result.success) {
    console.log(chalk.green.bold('  ✓ Quality gate PASSED'));
  } else {
    console.log(chalk.red.bold('  ✗ Quality gate FAILED'));
  }

  console.log('');
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
      const result = await sentinel.validate(sourceDir);

      if (options.json || options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else if (options.format === 'markdown') {
        console.log(result.report);
      } else {
        printHeader();

        console.log(chalk.bold('  ─── Validators ───────────────────────────'));
        console.log('');

        for (const validatorResult of result.results) {
          printValidatorResult(validatorResult);
        }

        printSummary(result);
      }

      process.exit(result.exitCode);
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
