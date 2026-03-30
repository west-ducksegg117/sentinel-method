/**
 * BaseVerifier — Abstract base class for adversarial verifiers.
 *
 * Espelha BaseValidator mas com propósito diferente:
 * - Validators são o Primary scan (detecção direta)
 * - Verifiers são o Adversarial scan (verificação independente)
 *
 * O Verifier NUNCA recebe o resultado do Validator.
 * Ele analisa o mesmo código com heurísticas DIFERENTES
 * para maximizar a chance de detectar falsos negativos.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../types';
import { VerifierResult, VerifierIssue, ConfidenceLevel } from '../types-verifier';
import { SentinelIgnore } from '../ignore';

export abstract class BaseVerifier {
  /** Nome do verifier exibido nos relatórios */
  abstract readonly name: string;

  /** Domínio que este verifier cobre (ex: "security", "testing") */
  abstract readonly domain: string;

  constructor(protected config: SentinelConfig) {}

  /**
   * Executa a verificação adversarial independente.
   * NÃO recebe o resultado do Primary Validator.
   */
  abstract verify(sourceDir: string): VerifierResult;

  // ── Protected utilities (espelhando BaseValidator) ──

  protected getAllFiles(dir: string): string[] {
    const ignore = SentinelIgnore.fromFile(dir);

    if (this.config.excludePatterns && this.config.excludePatterns.length > 0) {
      ignore.addPatterns(this.config.excludePatterns);
    }

    const files: string[] = [];

    const traverse = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(dir, fullPath);

        if (ignore.isIgnored(relativePath)) continue;

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

  protected getSourceFiles(dir: string): string[] {
    return this.getAllFiles(dir).filter(
      f => (f.endsWith('.ts') || f.endsWith('.js')) &&
           !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') &&
           !f.endsWith('.d.ts')
    );
  }

  protected createVerifierIssue(
    severity: VerifierIssue['severity'],
    code: string,
    message: string,
    heuristic: string,
    confidence: ConfidenceLevel,
    extras?: Partial<VerifierIssue>,
  ): VerifierIssue {
    return { severity, code, message, heuristic, confidence, ...extras };
  }

  protected buildResult(
    issues: VerifierIssue[],
    details: Record<string, unknown>,
    score: number,
    duration: number,
  ): VerifierResult {
    return {
      verifier: this.name,
      issues,
      score,
      details,
      duration,
    };
  }
}
