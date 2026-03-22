import { Reporter } from '../src/reporter';
import { ValidationResult } from '../src/types';

describe('Reporter', () => {
  let reporter: Reporter;
  let sampleResult: ValidationResult;

  beforeEach(() => {
    reporter = new Reporter();
    sampleResult = {
      success: true,
      timestamp: '2026-03-22T10:00:00.000Z',
      sourceDirectory: '/project/src',
      summary: {
        totalFiles: 15,
        passedChecks: 3,
        failedChecks: 1,
        warnings: 2,
      },
      results: [
        {
          validator: 'Testing Coverage',
          passed: true,
          score: 85,
          threshold: 80,
          issues: [],
          details: { coverage: 85, testFiles: 10, assertions: 45 },
        },
        {
          validator: 'Security Scanning',
          passed: false,
          issues: [
            {
              severity: 'error',
              code: 'INJECTION_RISK',
              message: 'Potential eval() usage detected',
              file: '/project/src/utils.ts',
              line: 42,
              suggestion: 'Avoid eval()',
            },
            {
              severity: 'warning',
              code: 'XSS_RISK',
              message: 'innerHTML usage detected',
              file: '/project/src/render.ts',
              line: 15,
            },
          ],
          details: { vulnerabilitiesFound: 1, injectionRisks: 1, securityScore: 50 },
        },
      ],
      report: '',
      exitCode: 1,
    };
  });

  // ── JSON Reporter ──

  test('deve gerar relatório JSON válido', () => {
    const json = reporter.generateJSON(sampleResult);
    const parsed = JSON.parse(json);

    expect(parsed.success).toBe(true);
    expect(parsed.timestamp).toBe('2026-03-22T10:00:00.000Z');
    expect(parsed.summary.totalFiles).toBe(15);
    expect(parsed.results).toHaveLength(2);
  });

  test('deve preservar todas as propriedades no JSON', () => {
    const json = reporter.generateJSON(sampleResult);
    const parsed = JSON.parse(json);

    expect(parsed.sourceDirectory).toBe('/project/src');
    expect(parsed.summary.passedChecks).toBe(3);
    expect(parsed.summary.failedChecks).toBe(1);
    expect(parsed.exitCode).toBe(1);
  });

  // ── Markdown Reporter ──

  test('deve gerar relatório Markdown com header correto', () => {
    const md = reporter.generateMarkdown(sampleResult);

    expect(md).toContain('# Sentinel Validation Report');
    expect(md).toContain('**Timestamp**');
    expect(md).toContain('**Source Directory**');
  });

  test('deve incluir resumo no Markdown', () => {
    const md = reporter.generateMarkdown(sampleResult);

    expect(md).toContain('## Summary');
    expect(md).toContain('Total Files Analyzed: 15');
    expect(md).toContain('Passed Checks: 3');
    expect(md).toContain('Failed Checks: 1');
    expect(md).toContain('Warnings: 2');
    expect(md).toContain('Overall Status: PASSED');
  });

  test('deve incluir resultados de cada validator no Markdown', () => {
    const md = reporter.generateMarkdown(sampleResult);

    expect(md).toContain('### Testing Coverage');
    expect(md).toContain('### Security Scanning');
    expect(md).toContain('Status: PASSED');
    expect(md).toContain('Status: FAILED');
  });

  test('deve incluir issues com localização no Markdown', () => {
    const md = reporter.generateMarkdown(sampleResult);

    expect(md).toContain('[ERROR] Potential eval() usage detected');
    expect(md).toContain('/project/src/utils.ts:42');
    expect(md).toContain('[WARNING] innerHTML usage detected');
  });

  test('deve incluir sugestões quando disponíveis', () => {
    const md = reporter.generateMarkdown(sampleResult);

    expect(md).toContain('Suggestion: Avoid eval()');
  });

  test('deve incluir scores quando disponíveis', () => {
    const md = reporter.generateMarkdown(sampleResult);

    expect(md).toContain('Score: 85/80');
  });

  // ── Console Reporter ──

  test('deve gerar relatório para console com formato adequado', () => {
    const console = reporter.generateConsole(sampleResult);

    expect(console).toContain('===== Sentinel Validation Report =====');
    expect(console).toContain('Status: PASSED');
    expect(console).toContain('Files Analyzed: 15');
  });

  test('deve listar validators no console com status', () => {
    const output = reporter.generateConsole(sampleResult);

    expect(output).toContain('Testing Coverage: PASS');
    expect(output).toContain('Security Scanning: FAIL');
  });

  test('deve incluir issues no console', () => {
    const output = reporter.generateConsole(sampleResult);

    expect(output).toContain('[error] Potential eval() usage detected');
    expect(output).toContain('[warning] innerHTML usage detected');
  });

  // ── Format dispatcher ──

  test('deve despachar para JSON quando formato é json', () => {
    const report = reporter.format(sampleResult, 'json');

    expect(report.type).toBe('json');
    expect(() => JSON.parse(report.content)).not.toThrow();
    expect(report.timestamp).toBeDefined();
  });

  test('deve despachar para Markdown quando formato é markdown', () => {
    const report = reporter.format(sampleResult, 'markdown');

    expect(report.type).toBe('markdown');
    expect(report.content).toContain('# Sentinel Validation Report');
  });

  test('deve despachar para Console quando formato é console', () => {
    const report = reporter.format(sampleResult, 'console');

    expect(report.type).toBe('console');
    expect(report.content).toContain('=====');
  });

  test('deve usar JSON como fallback para formato desconhecido', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = reporter.format(sampleResult, 'unknown' as any);

    expect(() => JSON.parse(report.content)).not.toThrow();
  });

  // ── HTML Reporter ──

  test('deve gerar HTML com doctype e estrutura completa', () => {
    const html = reporter.generateHTML(sampleResult);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('Sentinel Method');
  });

  test('deve incluir status badge no HTML', () => {
    const html = reporter.generateHTML(sampleResult);
    expect(html).toContain('PASSED');

    sampleResult.success = false;
    const htmlFailed = reporter.generateHTML(sampleResult);
    expect(htmlFailed).toContain('FAILED');
  });

  test('deve incluir gráfico SVG de scores', () => {
    const html = reporter.generateHTML(sampleResult);

    expect(html).toContain('<svg');
    expect(html).toContain('</svg>');
    expect(html).toContain('Score Breakdown');
  });

  test('deve incluir tabela de issues no HTML', () => {
    const html = reporter.generateHTML(sampleResult);

    expect(html).toContain('<table');
    expect(html).toContain('Issues');
    expect(html).toContain('INJECTION_RISK');
    expect(html).toContain('XSS_RISK');
  });

  test('deve incluir overview stats no HTML', () => {
    const html = reporter.generateHTML(sampleResult);

    expect(html).toContain('15'); // totalFiles
    expect(html).toContain('Files'); // stat label
    expect(html).toContain('Score Breakdown');
  });

  test('deve despachar para HTML quando formato é html', () => {
    const report = reporter.format(sampleResult, 'html');

    expect(report.type).toBe('html');
    expect(report.content).toContain('<!DOCTYPE html>');
  });

  test('deve gerar HTML sem issues quando resultado limpo', () => {
    sampleResult.results = [{
      validator: 'Clean Check',
      passed: true,
      score: 100,
      threshold: 80,
      issues: [],
      details: {},
    }];

    const html = reporter.generateHTML(sampleResult);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('<table');
  });

  // ── Edge cases ──

  test('deve lidar com resultado sem issues', () => {
    sampleResult.results = [{
      validator: 'Clean Check',
      passed: true,
      issues: [],
      details: {},
    }];

    const md = reporter.generateMarkdown(sampleResult);
    expect(md).toContain('### Clean Check');
    expect(md).not.toContain('#### Issues');
  });

  test('deve lidar com resultado com resultado vazio', () => {
    sampleResult.results = [];

    const json = reporter.generateJSON(sampleResult);
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(0);

    const md = reporter.generateMarkdown(sampleResult);
    expect(md).toContain('## Summary');
  });
});
