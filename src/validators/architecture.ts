import * as fs from 'fs';
import * as path from 'path';
import { ValidatorResult, ValidationIssue, SentinelConfig } from '../types';
import { BaseValidator } from './base';

/**
 * Métricas de arquitetura coletadas durante a análise.
 * Inclui contadores de problemas detectados e score final.
 */
export interface ArchitectureMetrics {
  totalFiles: number;
  circularDependencies: number;
  layerViolations: number;
  godClasses: number;
  deepNesting: number;
  missingBarrels: number;
  architectureScore: number;
}

/**
 * Nó de dependência para construção do grafo.
 * Armazena o caminho do arquivo e suas dependências locais.
 */
interface DependencyNode {
  path: string;
  dependencies: Set<string>;
  visited: boolean;
  visiting: boolean;
}

/**
 * Validator de arquitetura para detecção de problemas estruturais.
 *
 * Análises realizadas:
 * 1. Dependências circulares (A → B → A)
 * 2. Violações de camadas (camadas inferiores importando de superiores)
 * 3. God classes (muitos exports, métodos ou linhas)
 * 4. Aninhamento profundo de diretórios (>5 níveis)
 * 5. Falta de barrel exports (>3 arquivos sem index.ts/index.js)
 *
 * Suporta múltiplas linguagens: .ts, .js, .tsx, .jsx, .py, .go, .java, .rb, .php, .dart
 */
export class ArchitectureValidator extends BaseValidator {
  readonly name = 'Architecture Analysis';

  /** Mapeamento de camadas por padrão de diretório */
  private readonly layerHierarchy = {
    top: ['controller', 'route', 'handler'],
    high: ['service', 'usecase'],
    mid: ['repository', 'model', 'entity'],
    low: ['util', 'helper', 'lib'],
  };

  /** Extensões de arquivo suportadas */
  private readonly supportedExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.rb', '.php', '.dart'];

  constructor(config: SentinelConfig) {
    super(config);
  }

  /**
   * Executa a validação completa de arquitetura.
   * Retorna resultado padronizado com score 0-100 e threshold de 70.
   */
  validate(sourceDir: string): ValidatorResult {
    const issues: ValidationIssue[] = [];
    const metrics = this.analyzeArchitecture(sourceDir, issues);

    const score = metrics.architectureScore;
    const threshold = 70;
    const passed = score >= threshold && issues.filter(i => i.severity === 'error').length === 0;

    return this.buildResult(passed, issues, metrics as any, score, threshold);
  }

  /**
   * Realiza análise completa da arquitetura do projeto.
   * Coordena todas as verificações e coleta métricas.
   */
  private analyzeArchitecture(sourceDir: string, issues: ValidationIssue[]): ArchitectureMetrics {
    let circularDependencies = 0;
    let layerViolations = 0;
    let godClasses = 0;
    let deepNesting = 0;
    let missingBarrels = 0;

    try {
      const sourceFiles = this.getSupportedSourceFiles(sourceDir);

      // Análise 1: Dependências circulares
      const circularIssues = this.detectCircularDependencies(sourceDir, sourceFiles);
      circularDependencies = circularIssues.length;
      issues.push(...circularIssues);

      // Análise 2: Violações de camadas
      const layerIssues = this.detectLayerViolations(sourceDir, sourceFiles);
      layerViolations = layerIssues.length;
      issues.push(...layerIssues);

      // Análise 3: God classes
      const godClassIssues = this.detectGodClasses(sourceDir, sourceFiles);
      godClasses = godClassIssues.length;
      issues.push(...godClassIssues);

      // Análise 4: Aninhamento profundo
      const nestingIssues = this.detectDeepNesting(sourceDir);
      deepNesting = nestingIssues.length;
      issues.push(...nestingIssues);

      // Análise 5: Falta de barrel exports
      const barrelIssues = this.detectMissingBarrels(sourceDir, sourceFiles);
      missingBarrels = barrelIssues.length;
      issues.push(...barrelIssues);
    } catch (error) {
      issues.push(this.createIssue('error', 'ANALYSIS_ERROR',
        `Error analyzing architecture: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ));
    }

    return this.buildMetrics(
      this.getSupportedSourceFiles(sourceDir).length,
      circularDependencies,
      layerViolations,
      godClasses,
      deepNesting,
      missingBarrels,
    );
  }

  /**
   * Detecta dependências circulares usando busca em profundidade (DFS).
   * Constrói grafo de dependências e identifica ciclos.
   */
  private detectCircularDependencies(sourceDir: string, sourceFiles: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    try {
      // Construir grafo de dependências
      const graph = new Map<string, DependencyNode>();
      for (const file of sourceFiles) {
        const relativePath = path.relative(sourceDir, file);
        graph.set(relativePath, {
          path: relativePath,
          dependencies: this.extractLocalDependencies(sourceDir, file),
          visited: false,
          visiting: false,
        });
      }

      // Detectar ciclos usando DFS
      const cycles = new Set<string>();
      for (const [nodePath, node] of graph.entries()) {
        if (!node.visited) {
          this.dfsDetectCycles(nodePath, graph, cycles, []);
        }
      }

      // Criar issues para ciclos detectados
      cycles.forEach(cycle => {
        issues.push(this.createIssue('error', 'CIRCULAR_DEPENDENCY',
          `Circular dependency detected: ${cycle}`,
          { suggestion: 'Refactor code to break the circular dependency chain' },
        ));
      });
    } catch (error) {
      // Falhas em análise individual não devem interromper
    }

    return issues;
  }

  /**
   * DFS recursiva para detecção de ciclos em grafo.
   * Rastreia nós visitados e em processamento.
   */
  private dfsDetectCycles(
    nodePath: string,
    graph: Map<string, DependencyNode>,
    cycles: Set<string>,
    path: string[],
  ): void {
    const node = graph.get(nodePath);
    if (!node) return;

    node.visiting = true;
    path.push(nodePath);

    for (const dep of node.dependencies) {
      if (!graph.has(dep)) continue;

      const depNode = graph.get(dep)!;
      const depIndex = path.indexOf(dep);

      if (depIndex !== -1) {
        // Ciclo encontrado
        const cycle = path.slice(depIndex).concat(nodePath);
        cycles.add(cycle.join(' → '));
      } else if (!depNode.visited && !depNode.visiting) {
        this.dfsDetectCycles(dep, graph, cycles, [...path]);
      }
    }

    node.visiting = false;
    node.visited = true;
  }

  /**
   * Detecta violações de camadas (import de camadas inferiores).
   * Define hierarquia: controller > service > repository > util
   */
  private detectLayerViolations(sourceDir: string, sourceFiles: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const file of sourceFiles) {
      const relativePath = path.relative(sourceDir, file);
      const fileLayer = this.determineLayer(relativePath);

      if (!fileLayer) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const imports = this.extractImportPaths(content);

        for (const importPath of imports) {
          if (importPath.startsWith('.')) {
            const importedPath = path.normalize(path.join(path.dirname(relativePath), importPath));
            const importedLayer = this.determineLayer(importedPath);

            // Verificar violação: camada superior importando de inferior
            if (importedLayer && this.isLayerViolation(fileLayer, importedLayer)) {
              issues.push(this.createIssue('warning', 'LAYER_VIOLATION',
                `Layer violation: '${fileLayer}' layer imports from '${importedLayer}' layer (${importedPath}). Refactor to respect layer boundaries.`,
                { file: relativePath },
              ));
            }
          }
        }
      } catch {
        // Ignorar erros de leitura em arquivos individuais
      }
    }

    return issues;
  }

  /**
   * Detecta god classes: muitos exports, muitos métodos ou muitas linhas.
   * Limites: >15 exports, >20 métodos, >500 linhas
   */
  private detectGodClasses(sourceDir: string, sourceFiles: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const file of sourceFiles) {
      const relativePath = path.relative(sourceDir, file);

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const lineCount = lines.length;

        // Verificar linhas
        if (lineCount > 500) {
          issues.push(this.createIssue('warning', 'GOD_CLASS_LINES',
            `File '${relativePath}' has too many lines (${lineCount} > 500). Split file into smaller modules.`,
            { file: relativePath },
          ));
        }

        // Verificar exports (apenas para .ts, .js)
        if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx')) {
          const exportCount = (content.match(/export\s+(class|function|interface|type|const)/g) || []).length;
          if (exportCount > 15) {
            issues.push(this.createIssue('warning', 'GOD_CLASS_EXPORTS',
              `File '${relativePath}' exports too many items (${exportCount} > 15). Group related exports into separate modules.`,
              { file: relativePath },
            ));
          }
        }

        // Verificar métodos/funções
        const methodCount = this.countMethods(content, file);
        if (methodCount > 20) {
          issues.push(this.createIssue('warning', 'GOD_CLASS_METHODS',
            `File '${relativePath}' has too many methods/functions (${methodCount} > 20). Extract methods into separate classes or modules.`,
            { file: relativePath },
          ));
        }
      } catch {
        // Ignorar erros de leitura
      }
    }

    return issues;
  }

  /**
   * Detecta aninhamento profundo: diretórios com >5 níveis.
   */
  private detectDeepNesting(sourceDir: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const maxDepth = 5;

    const checkDepth = (dir: string, depth: number): void => {
      if (depth > maxDepth) {
        const relativePath = path.relative(sourceDir, dir);
        issues.push(this.createIssue('warning', 'DEEP_NESTING',
          `Directory '${relativePath}' exceeds maximum nesting depth (${depth} > ${maxDepth}). Reorganize directory structure to be flatter.`,
          { file: relativePath },
        ));
        return;
      }

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            checkDepth(path.join(dir, entry.name), depth + 1);
          }
        }
      } catch {
        // Ignorar erros de leitura
      }
    };

    checkDepth(sourceDir, 1);
    return issues;
  }

  /**
   * Detecta falta de barrel exports: diretórios com >3 arquivos sem index.
   */
  private detectMissingBarrels(sourceDir: string, sourceFiles: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const directoryFileCount = new Map<string, number>();

    // Contar arquivos por diretório
    for (const file of sourceFiles) {
      const dir = path.dirname(file);
      directoryFileCount.set(dir, (directoryFileCount.get(dir) || 0) + 1);
    }

    // Verificar ausência de index em diretórios com >3 arquivos
    for (const [dir, count] of directoryFileCount.entries()) {
      if (count > 3) {
        const hasBarrel = fs.existsSync(path.join(dir, 'index.ts')) ||
                         fs.existsSync(path.join(dir, 'index.js')) ||
                         fs.existsSync(path.join(dir, 'index.tsx')) ||
                         fs.existsSync(path.join(dir, 'index.jsx'));

        if (!hasBarrel) {
          const relativePath = path.relative(sourceDir, dir);
          issues.push(this.createIssue('info', 'MISSING_BARREL',
            `Directory '${relativePath}' has ${count} files but no barrel export (index.ts/index.js). Create index.ts to export public API from directory.`,
            { file: relativePath },
          ));
        }
      }
    }

    return issues;
  }

  /**
   * Extrai dependências locais (relativas) de um arquivo.
   * Retorna caminhos normalizados relativos ao sourceDir.
   */
  private extractLocalDependencies(sourceDir: string, file: string): Set<string> {
    const dependencies = new Set<string>();

    try {
      const content = fs.readFileSync(file, 'utf-8');
      const imports = this.extractImportPaths(content);

      const fileDir = path.dirname(path.relative(sourceDir, file));

      for (const imp of imports) {
        if (imp.startsWith('.')) {
          // Normalizar caminho relativo
          const resolved = path.normalize(path.join(fileDir, imp));
          // Adicionar sem extensão (resolve pode encontrar .ts, .js, etc)
          dependencies.add(resolved.replace(/\.(ts|js|tsx|jsx)$/, ''));
        }
      }
    } catch {
      // Ignorar erros
    }

    return dependencies;
  }

  /**
   * Extrai caminhos de import/require de um arquivo.
   * Suporta: import ... from '...', require('...')
   */
  private extractImportPaths(content: string): string[] {
    const paths: string[] = [];

    // import ... from '...'
    const importMatches = content.matchAll(/(?:import|from)\s+['"`]([^'"`]+)['"`]/g);
    for (const match of importMatches) {
      paths.push(match[1]);
    }

    // require('...')
    const requireMatches = content.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
    for (const match of requireMatches) {
      paths.push(match[1]);
    }

    return paths;
  }

  /**
   * Determina a camada de um arquivo baseado no caminho.
   * Retorna: 'top', 'high', 'mid', 'low', ou null
   */
  private determineLayer(filePath: string): string | null {
    const normalizedPath = filePath.toLowerCase();

    for (const [layer, patterns] of Object.entries(this.layerHierarchy)) {
      for (const pattern of patterns) {
        if (normalizedPath.includes(`/${pattern}/`) || normalizedPath.includes(`\\${pattern}\\`)) {
          return layer;
        }
      }
    }

    return null;
  }

  /**
   * Verifica se há violação de camadas.
   * fileLayer importando de importedLayer é violação se:
   * - fileLayer está acima de importedLayer na hierarquia
   */
  private isLayerViolation(fileLayer: string, importedLayer: string): boolean {
    const layerOrder = ['top', 'high', 'mid', 'low'];
    const fileIndex = layerOrder.indexOf(fileLayer);
    const importedIndex = layerOrder.indexOf(importedLayer);

    // Violação: camada superior (índice menor) importando de inferior (índice maior)
    return fileIndex < importedIndex;
  }

  /**
   * Conta métodos/funções em um arquivo.
   * Suporta TypeScript, JavaScript, Python, Go, Java, Ruby, PHP, Dart
   */
  private countMethods(content: string, file: string): number {
    let count = 0;

    if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      // TypeScript/JavaScript: function, method, arrow function
      count += (content.match(/^\s*(public\s+|private\s+|protected\s+)?async\s+(\w+)\s*\(/gm) || []).length;
      count += (content.match(/^\s*(public\s+|private\s+|protected\s+)?(\w+)\s*\([^)]*\)\s*[:=]/gm) || []).length;
      count += (content.match(/^\s*(?:function|async\s+function)\s+\w+/gm) || []).length;
    } else if (file.endsWith('.py')) {
      // Python: def
      count += (content.match(/^\s*(?:async\s+)?def\s+\w+/gm) || []).length;
    } else if (file.endsWith('.go')) {
      // Go: func
      count += (content.match(/^func\s+\(|^func\s+\w+/gm) || []).length;
    } else if (file.endsWith('.java')) {
      // Java: method declarations
      count += (content.match(/(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?\w+\s+\w+\s*\(/gm) || []).length;
    } else if (file.endsWith('.rb')) {
      // Ruby: def
      count += (content.match(/^\s*def\s+\w+/gm) || []).length;
    } else if (file.endsWith('.php')) {
      // PHP: function, method
      count += (content.match(/(?:public|private|protected)?\s*function\s+\w+/gm) || []).length;
    } else if (file.endsWith('.dart')) {
      // Dart: method declarations
      count += (content.match(/(?:void|\w+)\s+\w+\s*\([^)]*\)\s*\{/gm) || []).length;
    }

    return count;
  }

  /**
   * Obtém arquivos de origem suportados do diretório.
   * Filtra por extensões suportadas e exclui testes e definições.
   */
  private getSupportedSourceFiles(sourceDir: string): string[] {
    return this.getAllFiles(sourceDir).filter(file => {
      const ext = path.extname(file);
      const isSupported = this.supportedExtensions.includes(ext);
      const isTest = file.endsWith('.test.ts') || file.endsWith('.spec.ts') ||
                     file.endsWith('.test.js') || file.endsWith('.spec.js');
      const isDefinition = file.endsWith('.d.ts');

      return isSupported && !isTest && !isDefinition;
    });
  }

  /**
   * Constrói objeto de métricas com score calculado.
   * Score baseado em penalidades: cada problema reduz o score.
   */
  private buildMetrics(
    totalFiles: number,
    circularDependencies: number,
    layerViolations: number,
    godClasses: number,
    deepNesting: number,
    missingBarrels: number,
  ): ArchitectureMetrics {
    // Penalidades por tipo de problema
    const penalties =
      circularDependencies * 25 +    // Crítico
      layerViolations * 15 +         // Alto
      godClasses * 10 +              // Médio
      deepNesting * 8 +              // Baixo
      missingBarrels * 2;            // Info

    const architectureScore = Math.max(100 - penalties, 0);

    return {
      totalFiles,
      circularDependencies,
      layerViolations,
      godClasses,
      deepNesting,
      missingBarrels,
      architectureScore: Math.min(architectureScore, 100),
    };
  }
}
