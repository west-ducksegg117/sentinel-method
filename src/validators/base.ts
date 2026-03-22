import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, SentinelConfig } from '../types';
import { SentinelIgnore } from '../ignore';

/**
 * Classe base abstrata para todos os validators do Sentinel.
 *
 * Centraliza lógica comum: traversal de diretório, filtragem de
 * arquivos e estrutura padrão do resultado de validação.
 *
 * Respeita padrões de exclusão definidos em .sentinelignore.
 */
export abstract class BaseValidator {
  /** Nome exibido nos relatórios */
  abstract readonly name: string;

  constructor(protected config: SentinelConfig) {}

  /** Executa a validação completa e retorna o resultado padronizado */
  abstract validate(sourceDir: string): ValidatorResult;

  /**
   * Percorre recursivamente um diretório coletando caminhos de arquivos.
   * Respeita padrões definidos em .sentinelignore (estilo .gitignore).
   */
  protected getAllFiles(dir: string): string[] {
    const ignore = SentinelIgnore.fromFile(dir);
    const files: string[] = [];

    const traverse = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(dir, fullPath);

        // Respeitar .sentinelignore
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

  /**
   * Filtra apenas arquivos de código-fonte (.ts, .js).
   * Exclui arquivos de teste e de definição de tipos.
   */
  protected getSourceFiles(dir: string): string[] {
    return this.getAllFiles(dir).filter(
      f => (f.endsWith('.ts') || f.endsWith('.js')) &&
           !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') &&
           !f.endsWith('.d.ts')
    );
  }

  /** Cria uma issue padronizada com valores default */
  protected createIssue(
    severity: ValidationIssue['severity'],
    code: string,
    message: string,
    extras?: Partial<ValidationIssue>,
  ): ValidationIssue {
    return { severity, code, message, ...extras };
  }

  /** Monta o resultado final do validator */
  protected buildResult(
    passed: boolean,
    issues: ValidationIssue[],
    details: Record<string, any>,
    score?: number,
    threshold?: number,
  ): ValidatorResult {
    return {
      validator: this.name,
      passed,
      score,
      threshold,
      issues,
      details,
    };
  }
}
