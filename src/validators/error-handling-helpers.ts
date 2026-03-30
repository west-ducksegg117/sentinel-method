/**
 * Detecta throw com string literal em vez de Error objects
 */
export function detectThrowStringLiteralsHelper(content: string, createIssue: any, filePath: string, lines: string[]): { issues: any[], count: number } {
  const issues = [];
  let count = 0;
  const throwStringRegex = /throw\s+['"`][^'"`]*['"`]/g;
  let match;

  while ((match = throwStringRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    count++;

    issues.push(
      createIssue(
        'error',
        'THROW_STRING_LITERAL',
        'Throwing string literals instead of Error objects. Use throw new Error(message) instead.',
        {
          line: lineNumber,
          file: filePath,
          code: lines[lineNumber - 1]?.trim(),
          suggestion: `Replace "${match[0]}" with "throw new Error(...)"`,
        },
      ),
    );
  }

  return { issues, count };
}

/**
 * Detecta catch blocks vazios
 */
export function detectEmptyCatchBlocksHelper(content: string, createIssue: any, filePath: string, lines: string[]): { issues: any[], count: number } {
  const issues = [];
  let count = 0;
  const emptyCatchRegex = /catch\s*\(\s*\w*\s*\)\s*\{[\s\n]*\}/g;
  const emptyCatchNoParamRegex = /catch\s*\{[\s\n]*\}/g;

  let match = emptyCatchRegex.exec(content);
  while (match) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    count++;

    issues.push(
      createIssue(
        'error',
        'EMPTY_CATCH_BLOCK',
        'Empty catch block detected. Add proper error handling logic.',
        {
          line: lineNumber,
          file: filePath,
          code: lines[lineNumber - 1]?.trim(),
          suggestion: 'Add logging, error handling, or rethrow the error in catch block',
        },
      ),
    );

    match = emptyCatchRegex.exec(content);
  }

  match = emptyCatchNoParamRegex.exec(content);
  while (match) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    count++;

    issues.push(
      createIssue(
        'error',
        'EMPTY_CATCH_BLOCK',
        'Empty catch block detected. Add proper error handling logic.',
        {
          line: lineNumber,
          file: filePath,
          code: lines[lineNumber - 1]?.trim(),
          suggestion: 'Add logging, error handling, or rethrow the error in catch block',
        },
      ),
    );

    match = emptyCatchNoParamRegex.exec(content);
  }

  return { issues, count };
}

/**
 * Detecta error swallowing
 */
export function detectErrorSwallowingHelper(content: string, createIssue: any, filePath: string, lines: string[]): { issues: any[], count: number } {
  const issues = [];
  let count = 0;
  const catchBlockRegex = /catch\s*\(\s*(\w+)\s*\)\s*\{([^}]*)\}/gs;

  let match;
  while ((match = catchBlockRegex.exec(content)) !== null) {
    const catchContent = match[2];
    const lineNumber = content.substring(0, match.index).split('\n').length;

    const trimmedContent = catchContent.trim();

    if (
      !trimmedContent ||
      (trimmedContent.startsWith('//') && !catchContent.includes('throw') && !catchContent.includes('log'))
    ) {
      count++;

      issues.push(
        createIssue(
          'warning',
          'ERROR_SWALLOWING',
          'Catch block does not properly handle the error. Consider logging, rethrowing, or proper error handling.',
          {
            line: lineNumber,
            file: filePath,
            code: lines[lineNumber - 1]?.trim(),
            suggestion: 'Implement proper error handling: log, rethrow, or handle meaningfully',
          },
        ),
      );
    }
  }

  return { issues, count };
}

/**
 * Extrai o corpo de uma função a partir do índice de abertura de chave
 */
export function extractFunctionBody(content: string, startIdx: number): string {
  let braceCount = 0;
  let inString = false;
  let stringChar = '';

  for (let i = startIdx; i < content.length && i < startIdx + 500; i++) {
    const char = content[i];

    if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return content.substring(startIdx, i);
        }
      }
    }
  }

  return content.substring(startIdx, startIdx + 500);
}
