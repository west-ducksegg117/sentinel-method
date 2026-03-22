import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, SentinelConfig } from '../types';
import { BaseValidator } from './base';

export interface DependencyMetrics {
  totalDependencies: number;
  devDependencies: number;
  unusedDependencies: number;
  missingDependencies: number;
  outdatedPatterns: number;
  dependencyScore: number;
}

/**
 * Valida a saúde das dependências do projeto.
 *
 * Verificações:
 * - Dependências declaradas mas não importadas no código
 * - Imports sem dependência correspondente no package.json
 * - Padrões de versionamento arriscados (*)
 * - Dependências duplicadas entre deps e devDeps
 * - Presença de lock file (package-lock.json ou yarn.lock)
 */
export class DependencyValidator extends BaseValidator {
  readonly name = 'Dependency Analysis';

  constructor(config: SentinelConfig) {
    super(config);
  }

  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeDependencies(sourceDir, issues);

    const score = metrics.dependencyScore;
    const threshold = 70;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return this.buildResult(passed, issues, metrics as any, score, threshold);
  }

  private analyzeDependencies(sourceDir: string, issues: ValidationIssue[]): DependencyMetrics {
    let totalDependencies = 0;
    let devDependencies = 0;
    let unusedDependencies = 0;
    let missingDependencies = 0;
    let outdatedPatterns = 0;

    try {
      const pkgPath = path.join(sourceDir, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        issues.push(this.createIssue('warning', 'NO_PACKAGE_JSON',
          'No package.json found in the project root',
        ));
        return this.buildMetrics(0, 0, 0, 0, 0);
      }

      const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
      let pkg: Record<string, any>;
      try {
        pkg = JSON.parse(pkgContent);
      } catch {
        issues.push(this.createIssue('error', 'INVALID_PACKAGE_JSON',
          'package.json contains invalid JSON',
        ));
        return this.buildMetrics(0, 0, 0, 0, 0);
      }

      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      totalDependencies = Object.keys(deps).length;
      devDependencies = Object.keys(devDeps).length;

      // Coletar todos os imports usados no código
      const usedImports = this.collectImports(sourceDir);

      // Verificar dependências não utilizadas
      const allDeclared = Object.keys(deps);
      for (const dep of allDeclared) {
        if (!usedImports.has(dep)) {
          unusedDependencies++;
          issues.push(this.createIssue('warning', 'UNUSED_DEPENDENCY',
            `Dependency '${dep}' is declared but not imported in source code`,
            { suggestion: `Remove '${dep}' from dependencies or verify if it's used indirectly` },
          ));
        }
      }

      // Verificar imports sem dependência declarada (excluindo built-ins e relativos)
      const builtins = new Set(['fs', 'path', 'os', 'http', 'https', 'crypto', 'url',
        'util', 'stream', 'events', 'child_process', 'net', 'tls', 'dns', 'cluster',
        'readline', 'zlib', 'buffer', 'querystring', 'assert', 'perf_hooks',
        'worker_threads', 'timers', 'process', 'console']);

      const allDeps = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);
      for (const imp of usedImports) {
        if (!builtins.has(imp) && !allDeps.has(imp) && !imp.startsWith('.') && !imp.startsWith('@types/')) {
          // Verificar se é um subpath de uma dependência (ex: 'lodash/merge')
          const rootPkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
          if (!allDeps.has(rootPkg)) {
            missingDependencies++;
            issues.push(this.createIssue('error', 'MISSING_DEPENDENCY',
              `Import '${imp}' is used but not declared in package.json`,
              { suggestion: `Run npm install ${rootPkg} to add the missing dependency` },
            ));
          }
        }
      }

      // Verificar padrões de versionamento arriscados
      const allVersions = { ...deps, ...devDeps };
      for (const [name, version] of Object.entries(allVersions)) {
        if (typeof version === 'string' && (version === '*' || version === 'latest')) {
          outdatedPatterns++;
          issues.push(this.createIssue('warning', 'WILDCARD_VERSION',
            `Dependency '${name}' uses wildcard version '${version}'`,
            { suggestion: `Pin '${name}' to a specific version range (e.g., ^1.0.0)` },
          ));
        }
      }

      // Verificar duplicatas entre deps e devDeps
      for (const dep of Object.keys(deps)) {
        if (dep in devDeps) {
          issues.push(this.createIssue('warning', 'DUPLICATE_DEPENDENCY',
            `'${dep}' appears in both dependencies and devDependencies`,
            { suggestion: `Remove from one of them — usually keep only in dependencies` },
          ));
        }
      }

      // Verificar presença de lock file
      const hasLock = fs.existsSync(path.join(sourceDir, 'package-lock.json')) ||
                      fs.existsSync(path.join(sourceDir, 'yarn.lock')) ||
                      fs.existsSync(path.join(sourceDir, 'pnpm-lock.yaml'));
      if (!hasLock) {
        issues.push(this.createIssue('info', 'NO_LOCK_FILE',
          'No lock file found (package-lock.json, yarn.lock, or pnpm-lock.yaml)',
          { suggestion: 'Run npm install to generate a lock file for deterministic builds' },
        ));
      }
    } catch (error) {
      issues.push(this.createIssue('error', 'ANALYSIS_ERROR',
        `Error analyzing dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ));
    }

    return this.buildMetrics(totalDependencies, devDependencies, unusedDependencies, missingDependencies, outdatedPatterns);
  }

  /** Percorre source files e extrai todos os nomes de pacotes importados */
  private collectImports(sourceDir: string): Set<string> {
    const imports = new Set<string>();
    const files = this.getAllFiles(sourceDir);

    for (const file of files.filter(f => f.endsWith('.ts') || f.endsWith('.js'))) {
      try {
        const content = fs.readFileSync(file, 'utf-8');

        // import ... from 'package'
        const importMatches = content.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
          const pkg = this.extractPackageName(match[1]);
          if (pkg) imports.add(pkg);
        }

        // require('package')
        const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const match of requireMatches) {
          const pkg = this.extractPackageName(match[1]);
          if (pkg) imports.add(pkg);
        }
      } catch {
        // Ignorar erros de leitura em arquivos individuais
      }
    }

    return imports;
  }

  /** Extrai o nome do pacote raiz de um import path */
  private extractPackageName(importPath: string): string | null {
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return null; // import relativo
    }
    // Scoped packages: @scope/name
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    }
    // Regular packages: name ou name/subpath
    return importPath.split('/')[0];
  }

  private buildMetrics(
    totalDependencies: number,
    devDependencies: number,
    unusedDependencies: number,
    missingDependencies: number,
    outdatedPatterns: number,
  ): DependencyMetrics {
    const penalties = unusedDependencies * 10 + missingDependencies * 20 + outdatedPatterns * 15;
    const dependencyScore = Math.max(100 - penalties, 0);

    return {
      totalDependencies,
      devDependencies,
      unusedDependencies,
      missingDependencies,
      outdatedPatterns,
      dependencyScore: Math.min(dependencyScore, 100),
    };
  }
}
