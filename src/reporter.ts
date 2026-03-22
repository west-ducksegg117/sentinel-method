import { ValidationResult, ReportFormat } from './types';

export class Reporter {
  generateJSON(result: ValidationResult): string {
    return JSON.stringify(result, null, 2);
  }

  generateMarkdown(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('# Sentinel Validation Report');
    lines.push('');
    lines.push(`**Timestamp**: ${result.timestamp}`);
    lines.push(`**Source Directory**: ${result.sourceDirectory}`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total Files Analyzed: ${result.summary.totalFiles}`);
    lines.push(`- Passed Checks: ${result.summary.passedChecks}`);
    lines.push(`- Failed Checks: ${result.summary.failedChecks}`);
    lines.push(`- Warnings: ${result.summary.warnings}`);
    lines.push(`- Overall Status: ${result.success ? 'PASSED' : 'FAILED'}`);
    lines.push('');

    lines.push('## Validation Results');
    lines.push('');

    for (const validatorResult of result.results) {
      lines.push(`### ${validatorResult.validator}`);
      lines.push('');
      lines.push(`- Status: ${validatorResult.passed ? 'PASSED' : 'FAILED'}`);
      if (validatorResult.score !== undefined && validatorResult.threshold !== undefined) {
        lines.push(`- Score: ${validatorResult.score}/${validatorResult.threshold}`);
      }
      lines.push('');

      if (validatorResult.issues.length > 0) {
        lines.push('#### Issues');
        lines.push('');
        for (const issue of validatorResult.issues) {
          const location = issue.file ? ` (${issue.file}:${issue.line || 0})` : '';
          lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}${location}`);
          if (issue.suggestion) {
            lines.push(`  - Suggestion: ${issue.suggestion}`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  generateConsole(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('\n===== Sentinel Validation Report =====\n');
    lines.push(`Status: ${result.success ? 'PASSED' : 'FAILED'}`);
    lines.push(`Timestamp: ${result.timestamp}`);
    lines.push(`Directory: ${result.sourceDirectory}\n`);

    lines.push('Summary:');
    lines.push(`  Files Analyzed: ${result.summary.totalFiles}`);
    lines.push(`  Passed Checks: ${result.summary.passedChecks}`);
    lines.push(`  Failed Checks: ${result.summary.failedChecks}`);
    lines.push(`  Warnings: ${result.summary.warnings}\n`);

    for (const validatorResult of result.results) {
      const status = validatorResult.passed ? 'PASS' : 'FAIL';
      lines.push(`${validatorResult.validator}: ${status}`);
      if (validatorResult.issues.length > 0) {
        for (const issue of validatorResult.issues) {
          lines.push(`  [${issue.severity}] ${issue.message}`);
        }
      }
    }

    lines.push('\n========================================\n');
    return lines.join('\n');
  }

  /**
   * Gera relatório HTML autossuficiente com CSS e gráfico SVG inline.
   * Abre em qualquer navegador — sem dependências externas.
   */
  generateHTML(result: ValidationResult): string {
    const scored = result.results.filter(r => r.score !== undefined);
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length)
      : 0;

    // Gerar barras SVG para o gráfico de scores
    const barHeight = 32;
    const barGap = 8;
    const chartHeight = scored.length * (barHeight + barGap) + 20;
    const svgBars = scored.map((r, i) => {
      const y = i * (barHeight + barGap) + 10;
      const score = r.score ?? 0;
      const barWidth = Math.max(score * 3.6, 1); // max 360px para 100%
      const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
      const label = r.validator.length > 20 ? r.validator.substring(0, 20) + '…' : r.validator;
      return `
        <text x="0" y="${y + 20}" font-size="13" fill="#374151">${label}</text>
        <rect x="180" y="${y + 4}" width="${barWidth}" height="${barHeight - 8}" rx="4" fill="${color}" opacity="0.85"/>
        <text x="${180 + barWidth + 8}" y="${y + 20}" font-size="13" fill="#374151" font-weight="600">${score}%</text>`;
    }).join('');

    // Tabela de issues agrupadas
    const issueRows = result.results.flatMap(vr =>
      vr.issues.map(issue => {
        const sevColor = issue.severity === 'error' ? '#ef4444' : issue.severity === 'warning' ? '#f59e0b' : '#6b7280';
        const file = issue.file ? issue.file.split('/').pop() : '—';
        return `<tr>
          <td><span style="color:${sevColor};font-weight:600">${issue.severity.toUpperCase()}</span></td>
          <td>${vr.validator}</td>
          <td><code>${issue.code}</code></td>
          <td>${issue.message}</td>
          <td>${file}${issue.line ? ':' + issue.line : ''}</td>
        </tr>`;
      }),
    );

    const statusColor = result.success ? '#10b981' : '#ef4444';
    const statusText = result.success ? 'PASSED' : 'FAILED';
    const errorCount = result.results.reduce((s, r) => s + r.issues.filter(i => i.severity === 'error').length, 0);
    const warnCount = result.summary.warnings;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sentinel Report — ${statusText}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #1f2937; padding: 24px; }
  .container { max-width: 960px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 32px; }
  .header h1 { font-size: 28px; margin-bottom: 8px; }
  .header .badge { display: inline-block; padding: 6px 20px; border-radius: 20px; color: white; font-weight: 700; font-size: 14px; background: ${statusColor}; }
  .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card h2 { font-size: 18px; margin-bottom: 16px; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .stat { text-align: center; padding: 16px; background: #f3f4f6; border-radius: 8px; }
  .stat .value { font-size: 28px; font-weight: 700; }
  .stat .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 8px; background: #f3f4f6; font-size: 12px; color: #6b7280; text-transform: uppercase; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; }
  svg { display: block; margin: 0 auto; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🛡️ Sentinel Method Report</h1>
    <p style="color:#6b7280;margin-bottom:12px">${result.sourceDirectory} — ${result.timestamp}</p>
    <span class="badge">${statusText}</span>
  </div>

  <div class="card">
    <h2>Overview</h2>
    <div class="stats">
      <div class="stat"><div class="value">${result.summary.totalFiles}</div><div class="label">Files Analyzed</div></div>
      <div class="stat"><div class="value" style="color:#10b981">${result.summary.passedChecks}</div><div class="label">Passed</div></div>
      <div class="stat"><div class="value" style="color:#ef4444">${result.summary.failedChecks}</div><div class="label">Failed</div></div>
      <div class="stat"><div class="value" style="color:#f59e0b">${warnCount}</div><div class="label">Warnings</div></div>
      <div class="stat"><div class="value">${avgScore}%</div><div class="label">Avg Score</div></div>
      <div class="stat"><div class="value" style="color:#ef4444">${errorCount}</div><div class="label">Errors</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Score Breakdown</h2>
    <svg width="560" height="${chartHeight}" viewBox="0 0 560 ${chartHeight}">
      ${svgBars}
    </svg>
  </div>

  ${issueRows.length > 0 ? `
  <div class="card">
    <h2>Issues (${issueRows.length})</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Severity</th><th>Validator</th><th>Code</th><th>Message</th><th>Location</th></tr></thead>
      <tbody>${issueRows.join('')}</tbody>
    </table>
    </div>
  </div>` : ''}

  <div class="footer">
    <p>Generated by Sentinel Method v2.0 — ${new Date().toISOString()}</p>
  </div>
</div>
</body>
</html>`;
  }

  format(result: ValidationResult, format: 'json' | 'markdown' | 'console' | 'html'): ReportFormat {
    let content: string;

    switch (format) {
      case 'json':
        content = this.generateJSON(result);
        break;
      case 'markdown':
        content = this.generateMarkdown(result);
        break;
      case 'console':
        content = this.generateConsole(result);
        break;
      case 'html':
        content = this.generateHTML(result);
        break;
      default:
        content = this.generateJSON(result);
    }

    return {
      type: format,
      content,
      timestamp: result.timestamp,
    };
  }
}
