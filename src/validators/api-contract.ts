import { BaseValidator } from './base';

/**
 * Métricas do validador de contrato API
 */
export interface ApiContractMetrics {
  totalRoutes: number;
  routesWithErrors: number;
  missingErrorResponses: number;
  inconsistentStatusCodes: number;
  missingInputValidation: number;
  noResponseType: number;
  hardcodedUrls: number;
  missingAuthMiddleware: number;
  restViolations: number;
  missingPagination: number;
  n1Queries: number;
  missingRateLimit: number;
}

/**
 * Validador de contrato API para detecção de problemas em endpoints REST
 * Analisa padrões de roteadores, controladores e handlers de API
 */
export class ApiContractValidator extends BaseValidator {
  readonly name = 'API Contracts';

  private metrics: ApiContractMetrics = {
    totalRoutes: 0,
    routesWithErrors: 0,
    missingErrorResponses: 0,
    inconsistentStatusCodes: 0,
    missingInputValidation: 0,
    noResponseType: 0,
    hardcodedUrls: 0,
    missingAuthMiddleware: 0,
    restViolations: 0,
    missingPagination: 0,
    n1Queries: 0,
    missingRateLimit: 0,
  };

  /**
   * Valida a arquitetura de contrato API dos handlers e rotas
   */
  validate(sourceDir: string) {
    this.metrics = this.resetMetrics();
    const issues: any[] = [];

    const sourceFiles = this.getSourceFiles(sourceDir);

    for (const file of sourceFiles) {
      const content = this.readFile(file);
      if (!content) continue;

      // Pula arquivos de teste
      if (this.isTestFile(file)) continue;

      const fileIssues = this.analyzeApiContract(file, content);
      issues.push(...fileIssues);
    }

    const score = this.calculateScore(issues.length);
    const threshold = 60;

    return this.buildResult(
      issues.length === 0,
      issues,
      this.metrics,
      score,
      threshold
    );
  }

  /**
   * Analisa contrato API de um arquivo
   */
  private analyzeApiContract(filePath: string, content: string): any[] {
    const issues: any[] = [];

    // Extrai blocos de handlers de rota
    const routeBlocks = this.extractRouteHandlers(content);

    if (routeBlocks.length === 0) {
      return issues;
    }

    this.metrics.totalRoutes += routeBlocks.length;

    for (const block of routeBlocks) {
      let blockIssues = 0;

      // 1. Verifica respostas de erro ausentes
      if (!this.hasErrorHandling(block.content)) {
        issues.push(
          this.createIssue(
            'warning',
            'MISSING_ERROR_RESPONSES',
            `Route handler missing error responses (4xx/5xx status codes) in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.missingErrorResponses++;
        blockIssues += 5;
      }

      // 2. Verifica status codes inconsistentes
      if (this.hasInconsistentStatusCodes(block.content)) {
        issues.push(
          this.createIssue(
            'info',
            'INCONSISTENT_STATUS_CODES',
            `Route uses res.send() without explicit status code in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.inconsistentStatusCodes++;
      }

      // 3. Verifica validação de entrada ausente
      if (!this.hasInputValidation(block.content)) {
        issues.push(
          this.createIssue(
            'error',
            'MISSING_INPUT_VALIDATION',
            `Route handler missing request body/params validation in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.missingInputValidation++;
        blockIssues += 5;
      }

      // 4. Verifica type/schema de resposta ausente
      if (!this.hasResponseType(block.content)) {
        issues.push(
          this.createIssue(
            'warning',
            'NO_RESPONSE_TYPE',
            `API response missing type annotation or schema definition in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.noResponseType++;
      }

      // 5. Verifica URLs hardcoded
      const hardcodedUrls = this.findHardcodedUrls(block.content);
      if (hardcodedUrls.length > 0) {
        issues.push(
          this.createIssue(
            'warning',
            'HARDCODED_URLS',
            `Found hardcoded API URLs instead of constants/config (${hardcodedUrls.length} occurrences) in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.hardcodedUrls += hardcodedUrls.length;
        blockIssues += 2 * hardcodedUrls.length;
      }

      // 6. Verifica middleware de autenticação ausente
      if (!this.hasAuthMiddleware(block.content)) {
        issues.push(
          this.createIssue(
            'info',
            'MISSING_AUTH_MIDDLEWARE',
            `Route without authentication middleware pattern in ${block.name} - flagged for review`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.missingAuthMiddleware++;
      }

      // 7. Verifica violações de REST naming
      const restViolation = this.checkRestNaming(block.route || '');
      if (restViolation) {
        issues.push(
          this.createIssue(
            'info',
            'REST_NAMING_VIOLATION',
            `Endpoint violates REST conventions (verbs in URL): ${block.route} in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.restViolations++;
      }

      // 8. Verifica paginação ausente em GET list endpoints
      if (
        this.isListEndpoint(block.route || '', block.content) &&
        !this.hasPagination(block.content)
      ) {
        issues.push(
          this.createIssue(
            'info',
            'MISSING_PAGINATION',
            `GET list endpoint missing pagination parameters in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.missingPagination++;
      }

      // 9. Verifica padrões N+1 query
      const n1Patterns = this.findN1QueryPatterns(block.content);
      if (n1Patterns.length > 0) {
        issues.push(
          this.createIssue(
            'warning',
            'N_PLUS_ONE_QUERY',
            `Detected N+1 query pattern (${n1Patterns.length} occurrences) - loops with database calls in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.n1Queries += n1Patterns.length;
        blockIssues += 8 * n1Patterns.length;
      }

      // 10. Verifica rate limiting ausente
      if (!this.hasRateLimiting(block.content)) {
        issues.push(
          this.createIssue(
            'info',
            'MISSING_RATE_LIMIT',
            `Public route without rate limit middleware in ${block.name}`,
            {
              file: filePath,
              line: block.line,
            }
          )
        );
        this.metrics.missingRateLimit++;
      }

      if (blockIssues > 0) {
        this.metrics.routesWithErrors++;
      }
    }

    return issues;
  }

  /**
   * Extrai blocos de handlers de rotas do arquivo
   * Suporta Express, Fastify, Koa, NestJS e Next.js
   */
  private extractRouteHandlers(
    content: string
  ): Array<{ name: string; route?: string; content: string; line: number }> {
    const handlers: Array<{
      name: string;
      route?: string;
      content: string;
      line: number;
    }> = [];

    // Express/Fastify: app.get/post/put/delete/patch('route', handler)
    const expressPattern = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^)]+)\)\s*\{([^}]*)\}/gs;
    let match;

    while ((match = expressPattern.exec(content)) !== null) {
      const method = match[1];
      const route = match[2];
      const handler = match[3];
      const body = match[4];
      const line = content.substring(0, match.index).split('\n').length;

      handlers.push({
        name: `${method.toUpperCase()} ${route}`,
        route,
        content: `${handler}\n${body}`,
        line,
      });
    }

    // NestJS decorators: @Get/@Post/@Put/@Delete
    const nestPattern =
      /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{([^}]*)\}/gs;

    while ((match = nestPattern.exec(content)) !== null) {
      const method = match[1];
      const route = match[2];
      const functionName = match[3];
      const body = match[4];
      const line = content.substring(0, match.index).split('\n').length;

      handlers.push({
        name: `${functionName} (${method})`,
        route,
        content: body,
        line,
      });
    }

    // Next.js: export default function handler / export async function GET/POST
    const nextPattern = /export\s+(?:default\s+)?(?:async\s+)?function\s+(?:handler|(?:GET|POST|PUT|DELETE|PATCH))\s*\([^)]*\)\s*\{([^}]*)\}/gs;

    while ((match = nextPattern.exec(content)) !== null) {
      const body = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      handlers.push({
        name: 'Next.js handler',
        content: body,
        line,
      });
    }

    return handlers;
  }

  /**
   * Verifica se o handler tem tratamento de erro
   */
  private hasErrorHandling(content: string): boolean {
    const errorPatterns = [
      /res\.status\s*\(\s*[4-5]\d{2}\s*\)/,
      /res\.send\s*\(\s*\{.*?error/,
      /throw\s+new\s+Error/,
      /catch\s*\(/,
      /return\s+res\.json\s*\(\s*\{.*?(error|message)/,
      /HTTPException|BadRequest|Unauthorized|Forbidden|NotFound/,
    ];

    return errorPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Verifica se há status codes inconsistentes
   */
  private hasInconsistentStatusCodes(content: string): boolean {
    // Detecta res.send() sem status code explícito
    const sendWithoutStatus = /res\.send\s*\([^)]*\)(?!\s*\n.*res\.status)/;
    // Mas ignora se houver status() logo antes
    const hasStatusBefore = /res\.status\s*\([^)]*\)\s*\.send/;

    return (
      sendWithoutStatus.test(content) && !hasStatusBefore.test(content)
    );
  }

  /**
   * Verifica se há validação de entrada
   */
  private hasInputValidation(content: string): boolean {
    const validationPatterns = [
      /req\.body\s*\??\./,
      /req\.params\s*\??\./,
      /req\.query\s*\??\./,
      /validate\s*\(/i,
      /joi\./i,
      /zod\./i,
      /schema/i,
      /@Body\(\)/,
      /@Param\(\)/,
      /@Query\(\)/,
      /if\s*\(!.*\)\s*return/,
      /guard\|pipe/i,
    ];

    return validationPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Verifica se há type/schema de resposta
   */
  private hasResponseType(content: string): boolean {
    const typePatterns = [
      /:\s*(?:Promise\s*<|Observable\s*<)?[A-Z]\w+(?:\[\])?(?:>)?/,
      /@ApiResponse/,
      /interface\s+\w+Response/,
      /type\s+\w+Response\s*=/,
      /as const/,
      /satisfies\s+\w+/,
      /interface\s+\/\/.*?@api/i,
    ];

    return typePatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Encontra URLs hardcoded
   */
  private findHardcodedUrls(content: string): string[] {
    const urls: string[] = [];
    // Busca strings que parecem URLs (http://, https://, ou paths com domínios)
    const urlPattern =
      /(['"`])(https?:\/\/[^'"`]+|\/api\/[a-zA-Z]+\.com[^'"`]*)\1/g;
    let match;

    while ((match = urlPattern.exec(content)) !== null) {
      urls.push(match[2]);
    }

    return urls;
  }

  /**
   * Verifica se há middleware de autenticação
   */
  private hasAuthMiddleware(content: string): boolean {
    const authPatterns = [
      /auth(?:ent|oriz)/i,
      /jwt/i,
      /bearer/i,
      /token/i,
      /isAuthenticated/i,
      /@UseGuards/,
      /middleware.*auth/i,
      /req\.user/,
    ];

    return authPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Verifica violação de naming REST (verbos em URLs)
   */
  private checkRestNaming(route: string): boolean {
    const restViolationPatterns = [
      /\/(?:get|post|put|delete|patch|create|update|remove|fetch|list|all)(?:\/|$)/i,
    ];

    return restViolationPatterns.some((pattern) => pattern.test(route));
  }

  /**
   * Verifica se é um endpoint de listagem
   */
  private isListEndpoint(route: string, content: string): boolean {
    const listPatterns = [
      /GET|\.get/i,
      /\/[^/]*(?:list|all|items|users|products)(?:\/|$)/i,
      /\[\]/,
    ];

    return listPatterns.some((pattern) => pattern.test(route || content));
  }

  /**
   * Verifica se há paginação
   */
  private hasPagination(content: string): boolean {
    const paginationPatterns = [
      /(?:limit|offset|page|take|skip)/i,
      /req\.query\.(?:limit|offset|page|take|skip)/,
      /skip\(\d+\)\.limit\(\d+\)/,
      /limit\(\d+\)\.offset\(\d+\)/,
    ];

    return paginationPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Encontra padrões N+1 query
   */
  private findN1QueryPatterns(content: string): string[] {
    const patterns: string[] = [];

    // Procura por forEach/map com .find/.query/.get dentro
    const loopPattern =
      /(?:forEach|map|for\s*\()\s*\([^)]*\)\s*(?:=>|{)[^}]*\.(?:find|query|get|findOne|findById|load)\s*\(/g;

    let match;
    while ((match = loopPattern.exec(content)) !== null) {
      patterns.push(match[0].substring(0, 50));
    }

    return patterns;
  }

  /**
   * Verifica se há rate limiting
   */
  private hasRateLimiting(content: string): boolean {
    const rateLimitPatterns = [
      /rateLimit/i,
      /throttle/i,
      /limiter/i,
      /@Throttle/,
      /express-rate-limit/i,
    ];

    return rateLimitPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Verifica se é arquivo de teste
   */
  private isTestFile(filePath: string): boolean {
    return /\.(?:test|spec)\.\w+$/.test(filePath);
  }

  /**
   * Lê conteúdo de arquivo
   */
  private readFile(filePath: string): string | null {
    try {
      const fs = require('fs');
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Calcula score baseado em penalidades
   */
  private calculateScore(issueCount: number): number {
    const basePenalty = issueCount * 3; // 3 pontos por issue
    const totalPenalty = Math.min(basePenalty, 40); // Máximo 40 pontos de penalidade
    return Math.max(0, 100 - totalPenalty);
  }

  /**
   * Reseta métricas
   */
  private resetMetrics(): ApiContractMetrics {
    return {
      totalRoutes: 0,
      routesWithErrors: 0,
      missingErrorResponses: 0,
      inconsistentStatusCodes: 0,
      missingInputValidation: 0,
      noResponseType: 0,
      hardcodedUrls: 0,
      missingAuthMiddleware: 0,
      restViolations: 0,
      missingPagination: 0,
      n1Queries: 0,
      missingRateLimit: 0,
    };
  }
}
