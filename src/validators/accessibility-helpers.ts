import { AccessibilityMetrics } from './accessibility';

/**
 * Verifica imagens sem atributo alt
 */
export function checkMissingAltAttributes(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const imgRegex = /<img\s+(?!.*alt=)[^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(content)) !== null) {
    const line = getLineNumber(content, match.index);
    issues.push(
      createIssue(
        'error',
        'WCAG-1.1.1',
        'Image missing alt attribute',
        { file: filePath, line, suggestion: match[0].substring(0, 80) }
      )
    );
    metrics.missingAltCount++;
  }
}

/**
 * Verifica elementos interativos sem labels ARIA
 */
export function checkMissingAriaLabels(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const patterns = [
    /<button\s+(?!.*aria-label=)(?!.*>[\s\S]*?\S)([^>]*)>\s*<\/button>/gi,
    /<a\s+(?!.*aria-label=)([^>]*)>\s*<\/a>/gi,
    /<input\s+(?!.*aria-label=)(?!.*aria-labelledby=)([^>]*?)(?:\s*\/)?>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (!/<button[^>]*>[\s\S]*?\S[\s\S]*?<\/button>/i.test(match[0])) {
        const line = getLineNumber(content, match.index);
        issues.push(
          createIssue(
            'error',
            'WCAG-1.3.1',
            'Interactive element missing ARIA label or text content',
            { file: filePath, line, suggestion: match[0].substring(0, 80) }
          )
        );
        metrics.missingAriaLabelsCount++;
      }
    }
  }
}

/**
 * Verifica elementos não-semânticos (div/span) usados como clicáveis
 */
export function checkNonSemanticClickable(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const nonSemanticRegex = /<(div|span)\s+([^>]*?)onClick([^>]*?)>/gi;
  let match;

  while ((match = nonSemanticRegex.exec(content)) !== null) {
    const line = getLineNumber(content, match.index);
    const tagName = match[1].toLowerCase();

    issues.push(
      createIssue(
        'warning',
        'WCAG-4.1.3',
        `Non-semantic element (${tagName}) used as clickable. Use button or a tag instead.`,
        { file: filePath, line, suggestion: match[0].substring(0, 80) }
      )
    );
    metrics.nonSemanticElementsCount++;
  }
}

/**
 * Verifica inputs sem label associada
 */
export function checkMissingFormLabels(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const formInputRegex = /<(input|textarea|select)\s+(?!.*aria-label=)([^>]*?)(?:\s*\/)?>/gi;
  let match;

  while ((match = formInputRegex.exec(content)) !== null) {
    const inputTag = match[0];
    const inputId = inputTag.match(/id\s*=\s*['"]([^'"]+)['"]/i);

    if (inputId) {
      const labelRegex = new RegExp(
        `<label[^>]*for\\s*=\\s*['"]${inputId[1]}['"'][^>]*>`,
        'i'
      );
      if (labelRegex.test(content)) {
        continue;
      }
    }

    const line = getLineNumber(content, match.index);
    issues.push(
      createIssue(
        'error',
        'WCAG-1.3.1',
        'Form input missing associated label or aria-label',
        { file: filePath, line, suggestion: match[0].substring(0, 80) }
      )
    );
    metrics.missingFormLabelsCount++;
  }
}

/**
 * Verifica tabindex com valores positivos que quebram a ordem natural
 */
export function checkPositiveTabindex(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const tabindexRegex = /tabindex\s*=\s*['"]([0-9]+)['"]/gi;
  let match;

  while ((match = tabindexRegex.exec(content)) !== null) {
    const tabindexValue = parseInt(match[1], 10);

    if (tabindexValue > 0) {
      const line = getLineNumber(content, match.index);
      issues.push(
        createIssue(
          'warning',
          'WCAG-2.4.3',
          `Positive tabindex value (${tabindexValue}) disrupts natural tab order`,
          { file: filePath, line }
        )
      );
      metrics.positiveTabindexCount++;
    }
  }
}

/**
 * Verifica links e buttons vazios
 */
export function checkEmptyLinksButtons(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const emptyRegex = /<(a|button)\s+([^>]*?)>\s*<\/\1>/gi;
  let match;

  while ((match = emptyRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2];

    if (!attributes.includes('aria-label')) {
      const line = getLineNumber(content, match.index);
      issues.push(
        createIssue(
          'error',
          'WCAG-1.1.1',
          `Empty ${tagName} tag without aria-label`,
          { file: filePath, line, suggestion: match[0] }
        )
      );
      metrics.emptyLinksButtonsCount++;
    }
  }
}

/**
 * Verifica mídia com autoplay sem muted
 */
export function checkAutoplayingMedia(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const mediaRegex = /<(video|audio)\s+([^>]*?)autoplay([^>]*?)>/gi;
  let match;

  while ((match = mediaRegex.exec(content)) !== null) {
    const fullTag = match[0];
    const attributes = `${match[2]}${match[3]}`;

    if (!attributes.includes('muted')) {
      const line = getLineNumber(content, match.index);
      issues.push(
        createIssue(
          'warning',
          'WCAG-1.4.2',
          `Media with autoplay should have muted attribute`,
          { file: filePath, line, suggestion: fullTag.substring(0, 80) }
        )
      );
      metrics.autoplayMediaCount++;
    }
  }
}

/**
 * Verifica hierarquia de headings
 */
export function checkHeadingHierarchy(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const headingRegex = /<h([1-6])\s*[^>]*>/gi;
  const headings: Array<{ level: number; line: number }> = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      line: getLineNumber(content, match.index),
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    const previous = i > 0 ? headings[i - 1] : null;

    if (current.level === 3 && (!previous || previous.level > 2)) {
      issues.push(
        createIssue(
          'info',
          'WCAG-1.3.1',
          'h3 heading without preceding h2',
          { file: filePath, line: current.line }
        )
      );
      metrics.headingHierarchyIssuesCount++;
    }

    if (current.level === 2 && (!previous || previous.level > 1)) {
      issues.push(
        createIssue(
          'info',
          'WCAG-1.3.1',
          'h2 heading without preceding h1',
          { file: filePath, line: current.line }
        )
      );
      metrics.headingHierarchyIssuesCount++;
    }

    if (previous && current.level - previous.level > 1) {
      issues.push(
        createIssue(
          'info',
          'WCAG-1.3.1',
          `Heading hierarchy jump from h${previous.level} to h${current.level}`,
          { file: filePath, line: current.line }
        )
      );
      metrics.headingHierarchyIssuesCount++;
    }
  }
}

/**
 * Verifica informação apenas por cor
 */
export function checkColorOnlyInformation(
  filePath: string,
  content: string,
  issues: any[],
  metrics: AccessibilityMetrics,
  createIssue: any,
  getLineNumber: any,
): void {
  const styleWithColorRegex = /style\s*=\s*['"]([^'"]*color[^'"]*)['"]/gi;
  let match;

  while ((match = styleWithColorRegex.exec(content)) !== null) {
    const styleContent = match[1];

    const hasOtherIndicators =
      /font-weight|font-style|text-decoration|border|background/.test(styleContent);

    if (!hasOtherIndicators) {
      const line = getLineNumber(content, match.index);
      issues.push(
        createIssue(
          'info',
          'WCAG-1.4.1',
          'Information conveyed using color alone. Add visual indicators.',
          { file: filePath, line }
        )
      );
      metrics.colorOnlyInfoCount++;
    }
  }
}

/**
 * Calcula o score baseado nas penalidades
 */
export function calculateScore(metrics: AccessibilityMetrics): number {
  let score = 100;

  score -= metrics.missingAltCount * 5;
  score -= metrics.missingFormLabelsCount * 5;
  score -= metrics.nonSemanticElementsCount * 3;
  score -= metrics.missingAriaLabelsCount * 4;
  score -= metrics.positiveTabindexCount * 2;
  score -= metrics.emptyLinksButtonsCount * 5;
  score -= metrics.autoplayMediaCount * 2;
  score -= metrics.missingLangAttributeCount * 2;
  score -= metrics.headingHierarchyIssuesCount * 1;
  score -= metrics.colorOnlyInfoCount * 1;

  return Math.max(0, score);
}
