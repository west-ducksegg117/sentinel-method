import { execSync } from 'child_process';
import * as path from 'path';

/**
 * DiffAnalyzer — identifica arquivos modificados via git.
 *
 * Permite ao Sentinel operar em "diff mode", validando apenas
 * os arquivos que mudaram desde o último commit, uma branch
 * base, ou um commit específico.
 *
 * Útil em CI para PRs (valida apenas o diff) e em pre-commit
 * (valida apenas staged files).
 */
export class DiffAnalyzer {
  constructor(private readonly projectDir: string) {}

  /** Retorna arquivos staged (prontos para commit) */
  getStagedFiles(): string[] {
    return this.runGitCommand('git diff --cached --name-only --diff-filter=ACMR');
  }

  /** Retorna arquivos modificados (unstaged) */
  getModifiedFiles(): string[] {
    return this.runGitCommand('git diff --name-only --diff-filter=ACMR');
  }

  /** Retorna todos os arquivos alterados (staged + unstaged) */
  getChangedFiles(): string[] {
    const staged = this.getStagedFiles();
    const modified = this.getModifiedFiles();
    return [...new Set([...staged, ...modified])];
  }

  /**
   * Retorna arquivos modificados em relação a uma branch/commit base.
   * Útil para validar PRs: `getDiffAgainst('main')` retorna todos
   * os arquivos que diferem da branch main.
   */
  getDiffAgainst(base: string): string[] {
    return this.runGitCommand(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`);
  }

  /**
   * Retorna arquivos do último commit.
   * Útil para post-commit validation.
   */
  getLastCommitFiles(): string[] {
    return this.runGitCommand('git diff --name-only --diff-filter=ACMR HEAD~1..HEAD');
  }

  /** Verifica se o diretório é um repositório git */
  isGitRepo(): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.projectDir,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Retorna a branch atual */
  getCurrentBranch(): string | null {
    try {
      const result = execSync('git branch --show-current', {
        cwd: this.projectDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  /** Filtra apenas arquivos de código-fonte (.ts, .js) */
  filterCodeFiles(files: string[]): string[] {
    return files.filter(f =>
      (f.endsWith('.ts') || f.endsWith('.js')) &&
      !f.endsWith('.d.ts') &&
      !f.includes('node_modules'),
    );
  }

  /**
   * Converte caminhos relativos para absolutos.
   * Git retorna caminhos relativos à raiz do repo.
   */
  toAbsolutePaths(files: string[]): string[] {
    return files.map(f => path.resolve(this.projectDir, f));
  }

  /** Executa um comando git e retorna linhas não-vazias */
  private runGitCommand(command: string): string[] {
    try {
      const output = execSync(command, {
        cwd: this.projectDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      return output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch {
      return [];
    }
  }
}
