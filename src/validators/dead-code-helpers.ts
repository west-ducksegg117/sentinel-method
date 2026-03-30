import { ValidationIssue } from '../types';

interface DetectionResult {
  count: number;
  issues: ValidationIssue[];
}

/**
 * Detecta imports não utilizados no arquivo
 */
export function detectUnusedImports(content: string, file: string): DetectionResult {
  const issues: ValidationIssue[] = [];
  let count = 0;

  // Extrair imports nomeados
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importedNames = match[1].split(',').map(s => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts[1] || parts[0];
    });

    for (const name of importedNames) {
      const contentWithoutImport = content.replace(match[0], '');
      if (!new RegExp(`\\b${name}\\b`).test(contentWithoutImport)) {
        count++;
        issues.push({
          severity: 'warning',
          code: 'UNUSED_IMPORT',
          message: `Imported symbol '${name}' is never used in this file`,
          file,
          suggestion: `Remove unused import '${name}'`,
        });
      }
    }
  }

  // Extrair imports padrão (default imports)
  const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = defaultImportRegex.exec(content)) !== null) {
    const name = match[1];
    const contentWithoutImport = content.replace(match[0], '');

    if (!new RegExp(`\\b${name}\\b`).test(contentWithoutImport)) {
      count++;
      issues.push({
        severity: 'warning',
        code: 'UNUSED_IMPORT',
        message: `Default import '${name}' is never used in this file`,
        file,
        suggestion: `Remove unused import '${name}'`,
      });
    }
  }

  return { count, issues };
}

/**
 * Detecta blocos de código comentado (3+ linhas consecutivas)
 */
export function detectCommentedCodeBlocks(lines: string[], file: string): DetectionResult {
  const issues: ValidationIssue[] = [];
  let count = 0;
  let commentBlockStart = -1;
  let commentBlockLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const isCommented = /^\/\/|^\/\*|^\*/.test(line) || /^\s*\/\//.test(lines[i]);

    if (isCommented && !line.includes('eslint') && !line.includes('prettier') &&
        !line.includes('ts-ignore') && !line.includes('noqa')) {
      if (commentBlockStart === -1) {
        commentBlockStart = i;
        commentBlockLength = 1;
      } else if (i === commentBlockStart + commentBlockLength) {
        commentBlockLength++;
      } else {
        if (commentBlockLength >= 3) {
          count++;
          issues.push({
            severity: 'info',
            code: 'COMMENTED_CODE',
            message: `Block of ${commentBlockLength} commented lines detected (lines ${commentBlockStart + 1}-${i})`,
            file,
            line: commentBlockStart + 1,
            suggestion: 'Remove commented code or uncomment if still needed',
          });
        }
        commentBlockStart = i;
        commentBlockLength = 1;
      }
    } else {
      if (commentBlockStart !== -1 && commentBlockLength >= 3) {
        count++;
        issues.push({
          severity: 'info',
          code: 'COMMENTED_CODE',
          message: `Block of ${commentBlockLength} commented lines detected (lines ${commentBlockStart + 1}-${i})`,
          file,
          line: commentBlockStart + 1,
          suggestion: 'Remove commented code or uncomment if still needed',
        });
      }
      commentBlockStart = -1;
      commentBlockLength = 0;
    }
  }

  if (commentBlockStart !== -1 && commentBlockLength >= 3) {
    count++;
    issues.push({
      severity: 'info',
      code: 'COMMENTED_CODE',
      message: `Block of ${commentBlockLength} commented lines detected at end of file`,
      file,
      line: commentBlockStart + 1,
      suggestion: 'Remove commented code or uncomment if still needed',
    });
  }

  return { count, issues };
}

/**
 * Detecta código inacessível após return/throw/break/continue
 */
export function detectUnreachableCode(lines: string[], file: string): DetectionResult {
  const issues: ValidationIssue[] = [];
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/\b(return|throw|break|continue)\b/.test(line) && !line.trim().startsWith('//')) {
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();

        if (nextLine === '' || nextLine.startsWith('//') || nextLine === '}' ||
            nextLine === '} else' || nextLine === '} catch' || nextLine === '} finally') {
          continue;
        }

        if (!/^\s*(\/\/|\/\*|\*|else|catch|finally)/.test(lines[j])) {
          count++;
          issues.push({
            severity: 'warning',
            code: 'UNREACHABLE_CODE',
            message: `Code after '${line.match(/\b(return|throw|break|continue)\b/)?.[1]}' statement is unreachable (line ${j + 1})`,
            file,
            line: i + 1,
            suggestion: 'Remove unreachable code or restructure the logic',
          });
          break;
        }
      }
    }
  }

  return { count, issues };
}
