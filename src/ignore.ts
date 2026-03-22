import * as fs from 'fs';
import * as path from 'path';

/**
 * SentinelIgnore — Parser de .sentinelignore no estilo .gitignore.
 *
 * Suporta:
 * - Glob patterns simples: *.log, dist/, coverage/
 * - Comentários: linhas começando com #
 * - Linhas em branco são ignoradas
 * - Negação: !important.ts (re-inclui arquivo)
 * - Diretórios: padrões terminando em / matcham apenas diretórios
 */
export class SentinelIgnore {
  private patterns: IgnorePattern[] = [];

  constructor(patterns?: string[]) {
    if (patterns) {
      this.addPatterns(patterns);
    }
  }

  /** Carrega padrões de um arquivo .sentinelignore */
  static fromFile(dir: string): SentinelIgnore {
    const ignoreFile = path.join(dir, '.sentinelignore');
    const instance = new SentinelIgnore();

    // Padrões default (sempre ignorados)
    instance.addPatterns([
      'node_modules/',
      '.git/',
      'dist/',
      'coverage/',
      '.nyc_output/',
      '.*',
    ]);

    if (fs.existsSync(ignoreFile)) {
      const content = fs.readFileSync(ignoreFile, 'utf-8');
      const lines = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));

      instance.addPatterns(lines);
    }

    return instance;
  }

  /** Adiciona padrões ao ignore */
  addPatterns(patterns: string[]): void {
    for (const raw of patterns) {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const negated = trimmed.startsWith('!');
      const pattern = negated ? trimmed.slice(1) : trimmed;

      this.patterns.push({
        raw: trimmed,
        pattern,
        negated,
        isDirectory: pattern.endsWith('/'),
        regex: this.patternToRegex(pattern),
      });
    }
  }

  /** Verifica se um caminho relativo deve ser ignorado */
  isIgnored(relativePath: string): boolean {
    let ignored = false;

    for (const p of this.patterns) {
      if (p.regex.test(relativePath) || p.regex.test(path.basename(relativePath))) {
        ignored = !p.negated;
      }
    }

    return ignored;
  }

  /** Filtra lista de caminhos, retornando apenas os não-ignorados */
  filter(paths: string[], baseDir: string): string[] {
    return paths.filter(filePath => {
      const relative = path.relative(baseDir, filePath);
      return !this.isIgnored(relative);
    });
  }

  /** Retorna os padrões carregados */
  getPatterns(): string[] {
    return this.patterns.map(p => p.raw);
  }

  /** Converte padrão glob simples para RegExp */
  private patternToRegex(pattern: string): RegExp {
    let regexStr = pattern
      // Remover trailing /
      .replace(/\/$/, '')
      // Escapar caracteres especiais (menos * e ?)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // /**/  → match zero ou mais segmentos de diretório
      .replace(/\/\*\*\//g, '{{SLASHGLOBSTARSLASH}}')
      // ** no início ou fim → match qualquer profundidade
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      // * → match qualquer coisa exceto /
      .replace(/\*/g, '[^/]*')
      // ? → match qualquer caractere exceto /
      .replace(/\?/g, '[^/]')
      // Restaurar globstar com suporte a zero profundidade
      .replace(/\{\{SLASHGLOBSTARSLASH\}\}/g, '(/.*)?/')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    // Se o padrão não começa com /, match em qualquer profundidade
    if (!pattern.startsWith('/')) {
      regexStr = `(^|/)${regexStr}`;
    }

    return new RegExp(`${regexStr}($|/)`, 'i');
  }
}

interface IgnorePattern {
  raw: string;
  pattern: string;
  negated: boolean;
  isDirectory: boolean;
  regex: RegExp;
}
