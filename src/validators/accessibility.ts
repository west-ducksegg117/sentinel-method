import { BaseValidator } from './base';

/**
 * Interface para métricas de acessibilidade (WCAG)
 */
export interface AccessibilityMetrics {
  missingAltCount: number;
  missingAriaLabelsCount: number;
  nonSemanticElementsCount: number;
  missingFormLabelsCount: number;
  missingLangAttributeCount: number;
  positiveTabindexCount: number;
  emptyLinksButtonsCount: number;
  autoplayMediaCount: number;
  headingHierarchyIssuesCount: number;
  colorOnlyInfoCount: number;
}

/**
 * Validador de acessibilidade para detectar problemas WCAG 2.1
 * Analisa arquivos .tsx, .jsx, .html, .vue, .svelte
 */
export class AccessibilityValidator extends BaseValidator {
  readonly name = 'Accessibility (WCAG)';
  private readonly threshold = 70;
  private readonly supportedExtensions = ['.tsx', '.jsx', '.html', '.vue', '.svelte', '.ts', '.js'];

  /**
   * Executa a validação de acessibilidade no diretório source
   */
  public validate(sourceDir: string) {
    const files = this.getSourceFiles(sourceDir);
    const issues: any[] = [];
    const metrics: AccessibilityMetrics = {
      missingAltCount: 0,
      missingAriaLabelsCount: 0,
      nonSemanticElementsCount: 0,
      missingFormLabelsCount: 0,
      missingLangAttributeCount: 0,
      positiveTabindexCount: 0,
      emptyLinksButtonsCount: 0,
      autoplayMediaCount: 0,
      headingHierarchyIssuesCount: 0,
      colorOnlyInfoCount: 0,
    };

    // Filtrar apenas arquivos suportados
    const relevantFiles = files.filter(file =>
      this.supportedExtensions.some(ext => file.endsWith(ext))
    );

    for (const file of relevantFiles) {
      const content = this.readFile(file);
      if (!content) continue;

      // Executar validações específicas por tipo de arquivo
      if (file.endsWith('.html')) {
        this.validateHtmlFile(file, content, issues, metrics);
      } else if (file.endsWith('.vue') || file.endsWith('.svelte')) {
        this.validateFrameworkFile(file, content, issues, metrics);
      } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
        this.validateJsxFile(file, content, issues, metrics);
      } else if (file.endsWith('.ts') || file.endsWith('.js')) {
        this.validateJavaScriptFile(file, content, issues, metrics);
      }
    }

    // Calcular score baseado em penalidades
    const score = this.calculateScore(metrics);
    const passed = score >= this.threshold && issues.length === 0;

    return this.buildResult(
      passed,
      issues,
      {
        metrics,
        totalIssues: issues.length,
        filesAnalyzed: relevantFiles.length,
      },
      score,
      this.threshold
    );
  }

  /**
   * Valida arquivo HTML
   */
  private validateHtmlFile(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Verificar atributo lang
    if (!/<html[^>]*\slang=/i.test(content) && !/<html[^>]*lang=/i.test(content)) {
      issues.push(
        this.createIssue(
          'warning',
          'WCAG-2.4.1',
          'Missing lang attribute on html element',
          { file: filePath, line: 1 }
        )
      );
      metrics.missingLangAttributeCount++;
    }

    // Executar validações comuns
    this.validateCommonAccessibilityIssues(filePath, content, issues, metrics);
  }

  /**
   * Valida arquivo de framework (Vue, Svelte)
   */
  private validateFrameworkFile(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    this.validateCommonAccessibilityIssues(filePath, content, issues, metrics);
  }

  /**
   * Valida arquivo JSX/TSX
   */
  private validateJsxFile(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    this.validateCommonAccessibilityIssues(filePath, content, issues, metrics);
  }

  /**
   * Valida arquivo JavaScript/TypeScript
   */
  private validateJavaScriptFile(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Procurar por padrões de createElement que podem ter problemas de acessibilidade
    const createElementRegex = /document\.createElement\s*\(\s*['"](\w+)['"]\s*\)/g;
    let match;

    while ((match = createElementRegex.exec(content)) !== null) {
      const tagName = match[1].toLowerCase();

      // Verificar se estão criando divs clicáveis sem acessibilidade
      if (tagName === 'div') {
        const contextStart = Math.max(0, match.index - 200);
        const contextEnd = Math.min(content.length, match.index + 500);
        const context = content.substring(contextStart, contextEnd);

        if (/\.addEventListener\s*\(\s*['"]click['"]\s*,/.test(context)) {
          const line = this.getLineNumber(content, match.index);
          issues.push(
            this.createIssue(
              'warning',
              'WCAG-4.1.3',
              'Non-semantic element (div) used as clickable. Use button instead.',
              { file: filePath, line }
            )
          );
          metrics.nonSemanticElementsCount++;
        }
      }
    }

    this.validateCommonAccessibilityIssues(filePath, content, issues, metrics);
  }

  /**
   * Valida problemas de acessibilidade comuns em todos os tipos de arquivo
   */
  private validateCommonAccessibilityIssues(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // 1. Verificar imagens sem alt attribute
    this.checkMissingAltAttributes(filePath, content, issues, metrics);

    // 2. Verificar elementos interativos sem labels
    this.checkMissingAriaLabels(filePath, content, issues, metrics);

    // 3. Verificar elementos não-semânticos com onClick
    this.checkNonSemanticClickable(filePath, content, issues, metrics);

    // 4. Verificar inputs sem label associada
    this.checkMissingFormLabels(filePath, content, issues, metrics);

    // 5. Verificar tabindex > 0
    this.checkPositiveTabindex(filePath, content, issues, metrics);

    // 6. Verificar links/buttons vazios
    this.checkEmptyLinksButtons(filePath, content, issues, metrics);

    // 7. Verificar mídia autoplaying
    this.checkAutoplayingMedia(filePath, content, issues, metrics);

    // 8. Verificar hierarquia de headings
    this.checkHeadingHierarchy(filePath, content, issues, metrics);

    // 9. Verificar informação apenas por cor
    this.checkColorOnlyInformation(filePath, content, issues, metrics);
  }

  /**
   * Verifica imagens sem atributo alt
   */
  private checkMissingAltAttributes(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Padrão para img sem alt
    const imgRegex = /<img\s+(?!.*alt=)[^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      issues.push(
        this.createIssue(
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
  private checkMissingAriaLabels(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Procurar por buttons, links, inputs sem text content ou aria-label
    const patterns = [
      // Button sem conteúdo e sem aria-label
      /<button\s+(?!.*aria-label=)(?!.*>[\s\S]*?\S)([^>]*)>\s*<\/button>/gi,
      // Link vazio
      /<a\s+(?!.*aria-label=)([^>]*)>\s*<\/a>/gi,
      // Input sem aria-label e sem aria-labelledby
      /<input\s+(?!.*aria-label=)(?!.*aria-labelledby=)([^>]*?)(?:\s*\/)?>/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Verificar se realmente não tem conteúdo
        if (!/<button[^>]*>[\s\S]*?\S[\s\S]*?<\/button>/i.test(match[0])) {
          const line = this.getLineNumber(content, match.index);
          issues.push(
            this.createIssue(
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
  private checkNonSemanticClickable(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Procurar por div ou span com onClick
    const nonSemanticRegex = /<(div|span)\s+([^>]*?)onClick([^>]*?)>/gi;
    let match;

    while ((match = nonSemanticRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const tagName = match[1].toLowerCase();

      issues.push(
        this.createIssue(
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
  private checkMissingFormLabels(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Procurar por input, textarea, select sem aria-label e sem label associada
    const formInputRegex = /<(input|textarea|select)\s+(?!.*aria-label=)([^>]*?)(?:\s*\/)?>/gi;
    let match;

    while ((match = formInputRegex.exec(content)) !== null) {
      const inputTag = match[0];
      const inputId = inputTag.match(/id\s*=\s*['"]([^'"]+)['"]/i);

      // Se tem id, procurar por label associada
      if (inputId) {
        const labelRegex = new RegExp(
          `<label[^>]*for\\s*=\\s*['"]${inputId[1]}['"'][^>]*>`,
          'i'
        );
        if (labelRegex.test(content)) {
          continue; // Tem label associada, ok
        }
      }

      const line = this.getLineNumber(content, match.index);
      issues.push(
        this.createIssue(
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
  private checkPositiveTabindex(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    const tabindexRegex = /tabindex\s*=\s*['"]([0-9]+)['"]/gi;
    let match;

    while ((match = tabindexRegex.exec(content)) !== null) {
      const tabindexValue = parseInt(match[1], 10);

      if (tabindexValue > 0) {
        const line = this.getLineNumber(content, match.index);
        issues.push(
          this.createIssue(
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
  private checkEmptyLinksButtons(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Procurar por a ou button tags vazias
    const emptyRegex = /<(a|button)\s+([^>]*?)>\s*<\/\1>/gi;
    let match;

    while ((match = emptyRegex.exec(content)) !== null) {
      const tagName = match[1].toLowerCase();
      const attributes = match[2];

      // Verificar se tem aria-label
      if (!attributes.includes('aria-label')) {
        const line = this.getLineNumber(content, match.index);
        issues.push(
          this.createIssue(
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
  private checkAutoplayingMedia(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    const mediaRegex = /<(video|audio)\s+([^>]*?)autoplay([^>]*?)>/gi;
    let match;

    while ((match = mediaRegex.exec(content)) !== null) {
      const fullTag = match[0];
      const attributes = `${match[2]}${match[3]}`;

      // Verificar se tem muted
      if (!attributes.includes('muted')) {
        const line = this.getLineNumber(content, match.index);
        issues.push(
          this.createIssue(
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
  private checkHeadingHierarchy(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Extrair todos os headings e suas linhas
    const headingRegex = /<h([1-6])\s*[^>]*>/gi;
    const headings: Array<{ level: number; line: number }> = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      headings.push({
        level: parseInt(match[1], 10),
        line: this.getLineNumber(content, match.index),
      });
    }

    // Verificar hierarquia
    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      const previous = i > 0 ? headings[i - 1] : null;

      // h3 sem h2 anterior
      if (current.level === 3 && (!previous || previous.level > 2)) {
        issues.push(
          this.createIssue(
            'info',
            'WCAG-1.3.1',
            'h3 heading without preceding h2',
            { file: filePath, line: current.line }
          )
        );
        metrics.headingHierarchyIssuesCount++;
      }

      // h2 sem h1 anterior
      if (current.level === 2 && (!previous || previous.level > 1)) {
        issues.push(
          this.createIssue(
            'info',
            'WCAG-1.3.1',
            'h2 heading without preceding h1',
            { file: filePath, line: current.line }
          )
        );
        metrics.headingHierarchyIssuesCount++;
      }

      // Salto grande na hierarquia
      if (previous && current.level - previous.level > 1) {
        issues.push(
          this.createIssue(
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
  private checkColorOnlyInformation(
    filePath: string,
    content: string,
    issues: any[],
    metrics: AccessibilityMetrics
  ): void {
    // Procurar por inline styles com color mas sem outros indicadores
    const styleWithColorRegex = /style\s*=\s*['"]([^'"]*color[^'"]*)['"]/gi;
    let match;

    while ((match = styleWithColorRegex.exec(content)) !== null) {
      const styleContent = match[1];

      // Verificar se tem apenas color, sem bold, font-weight, etc.
      const hasOtherIndicators =
        /font-weight|font-style|text-decoration|border|background/.test(styleContent);

      if (!hasOtherIndicators) {
        const line = this.getLineNumber(content, match.index);
        issues.push(
          this.createIssue(
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
  private calculateScore(metrics: AccessibilityMetrics): number {
    let score = 100;

    // Penalidades por tipo de issue
    score -= metrics.missingAltCount * 5; // 5 pontos cada
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

  /**
   * Lê conteúdo do arquivo
   */
  private readFile(filePath: string): string | null {
    try {
      return require('fs').readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Obtém o número da linha de um índice no conteúdo
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }
}
