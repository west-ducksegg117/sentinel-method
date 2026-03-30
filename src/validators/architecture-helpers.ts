/**
 * Nó de dependência para construção do grafo.
 * Armazena o caminho do arquivo e suas dependências locais.
 */
export interface DependencyNode {
  path: string;
  dependencies: Set<string>;
  visited: boolean;
  visiting: boolean;
}

/**
 * DFS recursiva para detecção de ciclos em grafo.
 * Rastreia nós visitados e em processamento.
 */
export function dfsDetectCycles(
  nodePath: string,
  graph: Map<string, DependencyNode>,
  cycles: Set<string>,
  path_: string[],
): void {
  const node = graph.get(nodePath);
  if (!node) return;

  node.visiting = true;
  path_.push(nodePath);

  for (const dep of node.dependencies) {
    if (!graph.has(dep)) continue;

    const depNode = graph.get(dep)!;
    const depIndex = path_.indexOf(dep);

    if (depIndex !== -1) {
      const cycle = path_.slice(depIndex).concat(nodePath);
      cycles.add(cycle.join(' → '));
    } else if (!depNode.visited && !depNode.visiting) {
      dfsDetectCycles(dep, graph, cycles, [...path_]);
    }
  }

  node.visiting = false;
  node.visited = true;
}

/**
 * Extrai caminhos de import/require de um arquivo.
 * Suporta: import ... from '...', require('...')
 */
export function extractImportPaths(content: string): string[] {
  const paths: string[] = [];

  const importMatches = content.matchAll(/(?:import|from)\s+['"`]([^'"`]+)['"`]/g);
  for (const match of importMatches) {
    paths.push(match[1]);
  }

  const requireMatches = content.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
  for (const match of requireMatches) {
    paths.push(match[1]);
  }

  return paths;
}

/**
 * Determina a camada de um arquivo baseado no caminho.
 */
export function determineLayer(filePath: string, layerHierarchy: Record<string, string[]>): string | null {
  const normalizedPath = filePath.toLowerCase();

  for (const [layer, patterns] of Object.entries(layerHierarchy)) {
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
 */
export function isLayerViolation(fileLayer: string, importedLayer: string): boolean {
  const layerOrder = ['top', 'high', 'mid', 'low'];
  const fileIndex = layerOrder.indexOf(fileLayer);
  const importedIndex = layerOrder.indexOf(importedLayer);

  return fileIndex < importedIndex;
}

/**
 * Conta métodos/funções em um arquivo.
 */
export function countMethods(content: string, file: string): number {
  let count = 0;

  if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
    count += (content.match(/^\s*(public\s+|private\s+|protected\s+)?async\s+(\w+)\s*\(/gm) || []).length;
    count += (content.match(/^\s*(public\s+|private\s+|protected\s+)?(\w+)\s*\([^)]*\)\s*[:=]/gm) || []).length;
    count += (content.match(/^\s*(?:function|async\s+function)\s+\w+/gm) || []).length;
  } else if (file.endsWith('.py')) {
    count += (content.match(/^\s*(?:async\s+)?def\s+\w+/gm) || []).length;
  } else if (file.endsWith('.go')) {
    count += (content.match(/^func\s+\(|^func\s+\w+/gm) || []).length;
  } else if (file.endsWith('.java')) {
    count += (content.match(/(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?\w+\s+\w+\s*\(/gm) || []).length;
  } else if (file.endsWith('.rb')) {
    count += (content.match(/^\s*def\s+\w+/gm) || []).length;
  } else if (file.endsWith('.php')) {
    count += (content.match(/(?:public|private|protected)?\s*function\s+\w+/gm) || []).length;
  } else if (file.endsWith('.dart')) {
    count += (content.match(/(?:void|\w+)\s+\w+\s*\([^)]*\)\s*\{/gm) || []).length;
  }

  return count;
}
