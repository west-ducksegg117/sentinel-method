import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ValidationResult } from './types';

/**
 * Cache de resultados do Sentinel.
 *
 * Armazena o último resultado de validação em .sentinel-cache/
 * com hash dos arquivos analisados. Permite skip de validators
 * cujos arquivos-fonte não mudaram desde a última execução.
 *
 * Estrutura do cache:
 * .sentinel-cache/
 *   last-run.json   — resultado completo + file hashes
 */
export class ResultCache {
  private readonly cacheDir: string;
  private readonly cachePath: string;

  constructor(projectDir: string) {
    this.cacheDir = path.join(projectDir, '.sentinel-cache');
    this.cachePath = path.join(this.cacheDir, 'last-run.json');
  }

  /** Salva resultado de validação no cache */
  save(result: ValidationResult, fileHashes: Record<string, string>): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      const cacheData: CacheEntry = {
        timestamp: result.timestamp,
        duration: result.duration,
        success: result.success,
        fileHashes,
        results: result.results.map(r => ({
          validator: r.validator,
          passed: r.passed,
          score: r.score,
          issueCount: r.issues.length,
        })),
      };

      fs.writeFileSync(this.cachePath, JSON.stringify(cacheData, null, 2));
    } catch {
      // Cache write failure é silencioso — não deve impactar a validação
    }
  }

  /** Carrega o último resultado do cache */
  load(): CacheEntry | null {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return null;
      }

      const content = fs.readFileSync(this.cachePath, 'utf-8');
      return JSON.parse(content) as CacheEntry;
    } catch {
      return null;
    }
  }

  /** Verifica se os arquivos mudaram desde o último cache */
  hasChanges(currentHashes: Record<string, string>): boolean {
    const cached = this.load();
    if (!cached) return true;

    const cachedKeys = Object.keys(cached.fileHashes);
    const currentKeys = Object.keys(currentHashes);

    // Número de arquivos diferente → mudou
    if (cachedKeys.length !== currentKeys.length) return true;

    // Comparar hash a hash
    for (const key of currentKeys) {
      if (cached.fileHashes[key] !== currentHashes[key]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calcula hash MD5 de uma lista de arquivos.
   * Retorna mapa { relativePath → hash }
   */
  static computeHashes(files: string[], baseDir: string): Record<string, string> {
    const hashes: Record<string, string> = {};

    for (const file of files) {
      try {
        const content = fs.readFileSync(file);
        const hash = crypto.createHash('md5').update(content).digest('hex');
        const relativePath = path.relative(baseDir, file);
        hashes[relativePath] = hash;
      } catch {
        // Arquivo inacessível — ignora
      }
    }

    return hashes;
  }

  /** Limpa o cache */
  clear(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true });
      }
    } catch {
      // Silencioso
    }
  }

  /** Verifica se existe cache válido */
  exists(): boolean {
    return fs.existsSync(this.cachePath);
  }

  /** Retorna o caminho do diretório de cache */
  getCacheDir(): string {
    return this.cacheDir;
  }
}

export interface CacheEntry {
  timestamp: string;
  duration?: number;
  success: boolean;
  fileHashes: Record<string, string>;
  results: CachedValidatorResult[];
}

export interface CachedValidatorResult {
  validator: string;
  passed: boolean;
  score?: number;
  issueCount: number;
}
