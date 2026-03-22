import * as fs from 'fs';
import * as path from 'path';

/**
 * Centraliza toda a operação de I/O do Sentinel.
 *
 * Responsável por:
 * - Coletar arquivos de um diretório recursivamente
 * - Cachear conteúdo de arquivos para evitar leituras duplicadas
 * - Filtrar por extensão e padrões de exclusão
 * - Contar arquivos por tipo (source, test, config)
 */
export class FileCollector {
  /** Cache de conteúdo de arquivos já lidos */
  private contentCache = new Map<string, string>();

  /** Lista de arquivos coletados */
  private collectedFiles: string[] = [];

  /** Padrões de diretórios a serem ignorados */
  private readonly excludeDirs = ['node_modules', 'dist', 'coverage', '.nyc_output'];

  constructor(private readonly sourceDir: string) {}

  /**
   * Coleta todos os arquivos do diretório raiz.
   * Chamado uma única vez — as chamadas subsequentes retornam do cache.
   */
  collect(): string[] {
    if (this.collectedFiles.length > 0) {
      return this.collectedFiles;
    }

    this.collectedFiles = this.traverse(this.sourceDir);
    return this.collectedFiles;
  }

  /** Retorna apenas arquivos de código-fonte (.ts, .js) */
  getSourceFiles(): string[] {
    return this.collect().filter(
      f => (f.endsWith('.ts') || f.endsWith('.js')) &&
           !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') &&
           !f.endsWith('.d.ts'),
    );
  }

  /** Retorna apenas arquivos de teste (.test.ts, .spec.ts) */
  getTestFiles(): string[] {
    return this.collect().filter(
      f => f.endsWith('.test.ts') || f.endsWith('.spec.ts'),
    );
  }

  /** Retorna todos os arquivos .ts e .js (source + test) */
  getCodeFiles(): string[] {
    return this.collect().filter(
      f => f.endsWith('.ts') || f.endsWith('.js'),
    );
  }

  /**
   * Lê o conteúdo de um arquivo com cache.
   * Se o arquivo já foi lido, retorna do cache.
   */
  readFile(filePath: string): string {
    const cached = this.contentCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    this.contentCache.set(filePath, content);
    return content;
  }

  /**
   * Lê o conteúdo de um arquivo e retorna as linhas.
   * Conveniência para análise linha-a-linha.
   */
  readLines(filePath: string): string[] {
    return this.readFile(filePath).split('\n');
  }

  /** Retorna o número total de arquivos coletados */
  get totalFiles(): number {
    return this.collect().length;
  }

  /** Retorna o número de arquivos de código-fonte */
  get sourceFileCount(): number {
    return this.getSourceFiles().length;
  }

  /** Retorna o número de arquivos de teste */
  get testFileCount(): number {
    return this.getTestFiles().length;
  }

  /** Limpa o cache de conteúdo para liberar memória */
  clearCache(): void {
    this.contentCache.clear();
  }

  /** Verifica se um arquivo específico existe no diretório coletado */
  hasFile(filename: string): boolean {
    const fullPath = path.join(this.sourceDir, filename);
    return fs.existsSync(fullPath);
  }

  /** Lê um arquivo relativo ao diretório raiz */
  readRelative(relativePath: string): string | null {
    const fullPath = path.join(this.sourceDir, relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return this.readFile(fullPath);
  }

  /** Traversal recursivo do diretório */
  private traverse(dir: string): string[] {
    const files: string[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || this.excludeDirs.includes(entry.name)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.traverse(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }
}
