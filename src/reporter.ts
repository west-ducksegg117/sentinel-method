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
   * Gera relatório HTML profissional — design futurista, dark mode,
   * radar chart SVG, tabela interativa, otimizado para print/PDF.
   * Self-contained: zero dependências externas.
   */
  generateHTML(result: ValidationResult): string {
    const scored = result.results.filter(r => r.score !== undefined);
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length)
      : 0;

    const statusText = result.success ? 'PASSED' : 'FAILED';
    const statusColor = result.success ? '#00e5a0' : '#ff4757';
    const errorCount = result.results.reduce((s, r) => s + r.issues.filter(i => i.severity === 'error').length, 0);
    const warnCount = result.summary.warnings;
    const infoCount = result.results.reduce((s, r) => s + r.issues.filter(i => i.severity === 'info').length, 0);
    const durationStr = result.duration !== undefined
      ? (result.duration >= 1000 ? `${(result.duration / 1000).toFixed(2)}s` : `${result.duration}ms`)
      : '—';

    // Grade do score agregado
    const gradeMap = (s: number) => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';
    const grade = gradeMap(avgScore);
    const gradeColor = avgScore >= 80 ? '#00e5a0' : avgScore >= 60 ? '#ffa502' : '#ff4757';

    // ── Radar Chart SVG ──
    const radarSize = 200;
    const radarCenter = radarSize;
    const radarRadius = radarSize * 0.75;
    const radarData = scored.map(r => (r.score ?? 0) / 100);
    const radarLabels = scored.map(r => {
      const short: Record<string, string> = {
        'Testing Coverage': 'Testing',
        'Security Scanning': 'Security',
        'Performance Benchmarks': 'Performance',
        'Maintainability Checker': 'Maintainability',
        'Dependency Analysis': 'Dependencies',
        'Documentation Coverage': 'Documentation',
        'Code Style': 'Style',
      };
      return short[r.validator] || r.validator;
    });
    const n = radarData.length;

    // Grids intermediários (25%, 50%, 75%, 100%)
    const gridLevels = [0.25, 0.5, 0.75, 1.0];
    const gridPolygons = gridLevels.map(level => {
      const pts = Array.from({ length: n }, (_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return `${radarCenter + radarRadius * level * Math.cos(angle)},${radarCenter + radarRadius * level * Math.sin(angle)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="#2a2f3a" stroke-width="1"/>`;
    }).join('');

    // Eixos
    const axisLines = Array.from({ length: n }, (_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x2 = radarCenter + radarRadius * Math.cos(angle);
      const y2 = radarCenter + radarRadius * Math.sin(angle);
      return `<line x1="${radarCenter}" y1="${radarCenter}" x2="${x2}" y2="${y2}" stroke="#2a2f3a" stroke-width="1"/>`;
    }).join('');

    // Polígono de dados
    const dataPoints = radarData.map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return `${radarCenter + radarRadius * v * Math.cos(angle)},${radarCenter + radarRadius * v * Math.sin(angle)}`;
    }).join(' ');

    // Labels
    const radarLabelsSvg = radarLabels.map((label, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const lx = radarCenter + (radarRadius + 28) * Math.cos(angle);
      const ly = radarCenter + (radarRadius + 28) * Math.sin(angle);
      const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
      return `<text x="${lx}" y="${ly + 4}" text-anchor="${anchor}" font-size="11" fill="#8b95a5">${label}</text>`;
    }).join('');

    // Pontos nos vértices do polígono de dados
    const dataDots = radarData.map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const cx = radarCenter + radarRadius * v * Math.cos(angle);
      const cy = radarCenter + radarRadius * v * Math.sin(angle);
      return `<circle cx="${cx}" cy="${cy}" r="4" fill="#00e5a0" stroke="#0a0e17" stroke-width="2"/>`;
    }).join('');

    // ── Bar chart horizontal ──
    const barHeight = 28;
    const barGap = 10;
    const barChartHeight = scored.length * (barHeight + barGap) + 16;
    const barMaxWidth = 320;
    const barBars = scored.map((r, i) => {
      const y = i * (barHeight + barGap) + 8;
      const score = r.score ?? 0;
      const barWidth = Math.max((score / 100) * barMaxWidth, 2);
      const color = score >= 80 ? '#00e5a0' : score >= 60 ? '#ffa502' : '#ff4757';
      const label = radarLabels[i] || r.validator;
      return `
        <text x="0" y="${y + 18}" font-size="12" fill="#8b95a5">${label}</text>
        <rect x="130" y="${y + 2}" width="${barWidth}" height="${barHeight - 4}" rx="4" fill="${color}" opacity="0.9"/>
        <rect x="130" y="${y + 2}" width="${barMaxWidth}" height="${barHeight - 4}" rx="4" fill="#1e2330" opacity="0.3"/>
        <rect x="130" y="${y + 2}" width="${barWidth}" height="${barHeight - 4}" rx="4" fill="${color}" opacity="0.9"/>
        <text x="${130 + barMaxWidth + 12}" y="${y + 18}" font-size="12" fill="${color}" font-weight="700">${score}%</text>
        <text x="${130 + barMaxWidth + 50}" y="${y + 18}" font-size="11" fill="#555e6e">${gradeMap(score)}</text>`;
    }).join('');

    // ── Validator cards ──
    const validatorCards = result.results.map(vr => {
      const score = vr.score;
      const icon = vr.passed ? '✅' : '❌';
      const errors = vr.issues.filter(i => i.severity === 'error').length;
      const warns = vr.issues.filter(i => i.severity === 'warning').length;
      const infos = vr.issues.filter(i => i.severity === 'info').length;

      const topIssues = vr.issues.slice(0, 5).map(issue => {
        const sevClass = issue.severity === 'error' ? 'sev-error' : issue.severity === 'warning' ? 'sev-warn' : 'sev-info';
        const loc = issue.file ? `<span class="issue-loc">${issue.file.split('/').pop()}${issue.line ? ':' + issue.line : ''}</span>` : '';
        return `<div class="issue-row"><span class="sev-badge ${sevClass}">${issue.severity.toUpperCase()}</span><span class="issue-msg">${issue.message}</span>${loc}</div>`;
      }).join('');

      const moreCount = vr.issues.length - 5;
      const moreLabel = moreCount > 0 ? `<div class="issue-more">+ ${moreCount} more issues</div>` : '';

      return `
      <div class="validator-card ${vr.passed ? '' : 'failed'}">
        <div class="vc-header">
          <div class="vc-title">${icon} ${vr.validator}</div>
          <div class="vc-score">${score !== undefined ? `<span style="color:${(score ?? 0) >= 80 ? '#00e5a0' : (score ?? 0) >= 60 ? '#ffa502' : '#ff4757'}">${score}%</span>` : '—'}</div>
        </div>
        <div class="vc-meta">
          ${errors > 0 ? `<span class="meta-error">${errors} errors</span>` : ''}
          ${warns > 0 ? `<span class="meta-warn">${warns} warnings</span>` : ''}
          ${infos > 0 ? `<span class="meta-info">${infos} info</span>` : ''}
          ${vr.issues.length === 0 ? '<span class="meta-clean">No issues found</span>' : ''}
        </div>
        ${topIssues ? `<div class="vc-issues">${topIssues}${moreLabel}</div>` : ''}
      </div>`;
    }).join('');

    // ── Issues grouped by validator (with pagination + prompt gen) ──
    const allIssues = result.results.flatMap(vr =>
      vr.issues.map(issue => ({ ...issue, validatorName: vr.validator })),
    );
    const PAGE_SIZE = 15;
    const issueGroups = result.results
      .filter(vr => vr.issues.length > 0)
      .map((vr, groupIdx) => {
        const issues = vr.issues;
        const totalPages = Math.ceil(issues.length / PAGE_SIZE);
        const rows = issues.map((issue, i) => {
          const sevClass = issue.severity === 'error' ? 'sev-error' : issue.severity === 'warning' ? 'sev-warn' : 'sev-info';
          const file = issue.file ? issue.file.split('/').pop() : '—';
          const page = Math.floor(i / PAGE_SIZE);
          return `<tr class="ig-row" data-group="${groupIdx}" data-page="${page}"${page > 0 ? ' style="display:none"' : ''}>
            <td><span class="sev-badge ${sevClass}">${issue.severity.toUpperCase()}</span></td>
            <td><code>${issue.code}</code></td>
            <td class="td-msg">${issue.message}</td>
            <td class="td-loc">${file}${issue.line ? ':' + issue.line : ''}</td>
          </tr>`;
        }).join('');

        const errors = issues.filter(i => i.severity === 'error').length;
        const warns = issues.filter(i => i.severity === 'warning').length;
        const infos = issues.filter(i => i.severity === 'info').length;
        const badges = [
          errors > 0 ? `<span class="sev-badge sev-error">${errors} errors</span>` : '',
          warns > 0 ? `<span class="sev-badge sev-warn">${warns} warnings</span>` : '',
          infos > 0 ? `<span class="sev-badge sev-info">${infos} info</span>` : '',
        ].filter(Boolean).join(' ');

        // Prompt data embedded as JSON for JS to build the prompt
        const promptData = issues.map(iss => ({
          sev: iss.severity,
          code: iss.code,
          msg: iss.message,
          file: iss.file ? iss.file.split('/').pop() : null,
          line: iss.line ?? null,
          suggestion: iss.suggestion ?? null,
        }));
        const promptJson = JSON.stringify(promptData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

        return `
        <div class="issue-group">
          <div class="ig-header" onclick="toggleGroup(${groupIdx})">
            <div class="ig-left">
              <span class="ig-arrow" id="arrow-${groupIdx}">▶</span>
              <strong>${vr.validator}</strong>
              <span class="ig-count">${issues.length} issues</span>
              ${badges}
            </div>
            <div class="ig-actions">
              <button class="btn-prompt" onclick="event.stopPropagation();genPrompt(${groupIdx},'${vr.validator.replace(/'/g, "\\'")}')">📋 Gerar Prompt</button>
            </div>
          </div>
          <div class="ig-body" id="igb-${groupIdx}" style="display:none">
            <table class="issues-table">
              <thead><tr><th>Severity</th><th>Code</th><th>Message</th><th>Location</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            ${totalPages > 1 ? `<div class="ig-pagination" id="igp-${groupIdx}"></div>` : ''}
          </div>
          <script type="application/json" id="pd-${groupIdx}">${promptJson}</script>
        </div>`;
      }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sentinel Report — ${statusText}</title>
<style>
  :root { --bg: #0a0e17; --surface: #111827; --surface2: #1a1f2e; --border: #1e2736; --text: #e2e8f0; --text2: #8b95a5; --accent: #00e5a0; --danger: #ff4757; --warn: #ffa502; --info: #3b82f6; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .page { max-width: 1100px; margin: 0 auto; padding: 40px 32px; }

  /* ── Header ── */
  .hero { text-align: center; padding: 48px 0 40px; position: relative; }
  .hero::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 600px; height: 300px; background: radial-gradient(ellipse, ${result.success ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)'} 0%, transparent 70%); pointer-events: none; }
  .hero-logo { font-size: 14px; letter-spacing: 4px; text-transform: uppercase; color: var(--text2); margin-bottom: 16px; }
  .hero h1 { font-size: 42px; font-weight: 800; letter-spacing: -1px; margin-bottom: 12px; background: linear-gradient(135deg, #fff 0%, #8b95a5 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .hero-status { display: inline-flex; align-items: center; gap: 10px; padding: 10px 28px; border-radius: 50px; font-weight: 700; font-size: 15px; letter-spacing: 1px; color: ${statusColor}; border: 2px solid ${statusColor}; background: ${result.success ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)'}; }
  .hero-status .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 12px ${statusColor}; }
  .hero-meta { margin-top: 20px; color: var(--text2); font-size: 13px; }

  /* ── Stats Grid ── */
  .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 32px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 16px; text-align: center; transition: border-color 0.2s; }
  .stat-card:hover { border-color: var(--accent); }
  .stat-val { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); margin-top: 6px; }

  /* ── Charts Row ── */
  .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
  .card-title { font-size: 16px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .card-title::before { content: ''; display: inline-block; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); }

  /* ── Grade Circle ── */
  .grade-section { display: flex; align-items: center; justify-content: center; gap: 32px; margin-bottom: 32px; }
  .grade-ring { position: relative; width: 140px; height: 140px; }
  .grade-ring svg { transform: rotate(-90deg); }
  .grade-ring .grade-letter { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; font-weight: 900; color: ${gradeColor}; }
  .grade-info { text-align: left; }
  .grade-info .score-big { font-size: 48px; font-weight: 800; color: ${gradeColor}; }
  .grade-info .score-label { font-size: 13px; color: var(--text2); }

  /* ── Validator Cards ── */
  .validators-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 32px; }
  .validator-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; }
  .validator-card.failed { border-left: 3px solid var(--danger); }
  .vc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .vc-title { font-weight: 700; font-size: 15px; }
  .vc-score { font-size: 20px; font-weight: 800; }
  .vc-meta { display: flex; gap: 12px; margin-bottom: 12px; font-size: 12px; }
  .meta-error { color: var(--danger); } .meta-warn { color: var(--warn); } .meta-info { color: var(--info); } .meta-clean { color: var(--accent); }
  .vc-issues { border-top: 1px solid var(--border); padding-top: 12px; }
  .issue-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 12px; }
  .issue-msg { flex: 1; color: var(--text2); }
  .issue-loc { color: #555e6e; font-family: monospace; font-size: 11px; }
  .issue-more { color: #555e6e; font-size: 11px; padding-top: 8px; }

  /* ── Severity Badges ── */
  .sev-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
  .sev-error { background: rgba(255,71,87,0.15); color: var(--danger); }
  .sev-warn { background: rgba(255,165,2,0.15); color: var(--warn); }
  .sev-info { background: rgba(59,130,246,0.15); color: var(--info); }

  /* ── Issues Table ── */
  .issues-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .issues-table th { text-align: left; padding: 12px 10px; border-bottom: 2px solid var(--border); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); }
  .issues-table td { padding: 10px; border-bottom: 1px solid var(--border); }
  .issues-table tr:hover { background: rgba(0,229,160,0.03); }
  .td-validator { color: var(--text2); white-space: nowrap; }
  .td-msg { max-width: 400px; }
  .td-loc { font-family: monospace; font-size: 11px; color: #555e6e; white-space: nowrap; }
  code { background: var(--surface2); padding: 2px 8px; border-radius: 4px; font-size: 11px; color: var(--accent); }

  /* ── Issue Groups ── */
  .issue-group { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
  .ig-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; cursor: pointer; background: var(--surface2); transition: background 0.2s; }
  .ig-header:hover { background: rgba(0,229,160,0.05); }
  .ig-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .ig-arrow { font-size: 10px; color: var(--text2); transition: transform 0.2s; display: inline-block; }
  .ig-arrow.open { transform: rotate(90deg); }
  .ig-count { background: var(--surface); padding: 2px 10px; border-radius: 20px; font-size: 11px; color: var(--text2); }
  .ig-body { padding: 0 16px 16px; }
  .ig-actions { display: flex; gap: 8px; }
  .btn-prompt { background: linear-gradient(135deg, rgba(0,229,160,0.12), rgba(0,229,160,0.05)); border: 1px solid rgba(0,229,160,0.3); color: var(--accent); padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-prompt:hover { background: rgba(0,229,160,0.2); border-color: var(--accent); }

  /* ── Pagination ── */
  .ig-pagination { display: flex; gap: 4px; justify-content: center; padding-top: 12px; }
  .pg-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .pg-btn:hover { border-color: var(--accent); color: var(--accent); }
  .pg-btn.active { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 700; }

  /* ── Prompt Modal ── */
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 1000; justify-content: center; align-items: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 90%; max-width: 800px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border); }
  .modal-title { font-weight: 700; font-size: 16px; }
  .modal-close { background: none; border: none; color: var(--text2); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
  .modal-close:hover { background: var(--surface2); color: var(--text); }
  .modal-sub { padding: 12px 24px 0; font-size: 13px; color: var(--text2); }
  .modal-text { flex: 1; margin: 12px 24px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; line-height: 1.6; resize: none; min-height: 300px; }
  .modal-actions { display: flex; gap: 12px; align-items: center; padding: 16px 24px; border-top: 1px solid var(--border); }
  .btn-copy { background: var(--accent); color: var(--bg); border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: opacity 0.2s; }
  .btn-copy:hover { opacity: 0.85; }
  .copy-feedback { font-size: 13px; color: var(--accent); font-weight: 600; }

  /* ── Footer ── */
  .footer { text-align: center; padding: 40px 0 20px; color: #3d4555; font-size: 12px; border-top: 1px solid var(--border); margin-top: 40px; }
  .footer a { color: var(--accent); text-decoration: none; }

  /* ── Print / PDF ── */
  @media print {
    body { background: #fff; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px; max-width: 100%; }
    .hero::before { display: none; }
    .card, .stat-card, .validator-card { border-color: #ddd; background: #fafafa; break-inside: avoid; }
    .hero h1 { background: none; -webkit-text-fill-color: #111; color: #111; }
    .hero-status { border-color: ${statusColor}; }
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
    .charts-row { grid-template-columns: 1fr 1fr; }
  }

  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
    .charts-row { grid-template-columns: 1fr; }
    .hero h1 { font-size: 28px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-logo">Sentinel Method</div>
    <h1>Quality Gate Report</h1>
    <div class="hero-status"><span class="dot"></span> QUALITY GATE ${statusText}</div>
    <div class="hero-meta">${result.sourceDirectory} &middot; ${result.timestamp} &middot; ${durationStr}</div>
  </div>

  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-val">${result.summary.totalFiles}</div><div class="stat-label">Files</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--accent)">${result.summary.passedChecks}</div><div class="stat-label">Passed</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--danger)">${result.summary.failedChecks}</div><div class="stat-label">Failed</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--danger)">${errorCount}</div><div class="stat-label">Errors</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--warn)">${warnCount}</div><div class="stat-label">Warnings</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--info)">${infoCount}</div><div class="stat-label">Info</div></div>
  </div>

  <!-- Grade + Charts -->
  <div class="charts-row">
    <div class="card">
      <div class="card-title">Aggregate Score</div>
      <div class="grade-section">
        <div class="grade-ring">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="60" fill="none" stroke="var(--surface2)" stroke-width="10"/>
            <circle cx="70" cy="70" r="60" fill="none" stroke="${gradeColor}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${Math.round(377 * avgScore / 100)} 377"/>
          </svg>
          <div class="grade-letter">${grade}</div>
        </div>
        <div class="grade-info">
          <div class="score-big">${avgScore}%</div>
          <div class="score-label">Average across ${scored.length} validators</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Radar Overview</div>
      <svg width="${radarSize * 2}" height="${radarSize * 2}" viewBox="0 0 ${radarSize * 2} ${radarSize * 2}">
        ${gridPolygons}
        ${axisLines}
        <polygon points="${dataPoints}" fill="rgba(0,229,160,0.15)" stroke="#00e5a0" stroke-width="2"/>
        ${dataDots}
        ${radarLabelsSvg}
      </svg>
    </div>
  </div>

  <!-- Bar Chart -->
  <div class="card" style="margin-bottom:32px">
    <div class="card-title">Score Breakdown</div>
    <svg width="100%" height="${barChartHeight}" viewBox="0 0 520 ${barChartHeight}">
      ${barBars}
    </svg>
  </div>

  <!-- Validator Details -->
  <div class="card" style="margin-bottom:32px">
    <div class="card-title">Validator Details</div>
    <div class="validators-grid">
      ${validatorCards}
    </div>
  </div>

  <!-- Issues by Validator (grouped + paginated) -->
  ${allIssues.length > 0 ? `
  <div class="card">
    <div class="card-title">All Issues (${allIssues.length})</div>
    ${issueGroups}
  </div>` : ''}

  <!-- Prompt Modal -->
  <div class="modal-overlay" id="promptModal" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">📋 Prompt de Correção</span>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-sub" id="modalSub"></div>
      <textarea class="modal-text" id="modalText" readonly></textarea>
      <div class="modal-actions">
        <button class="btn-copy" onclick="copyPrompt()">📋 Copiar Prompt</button>
        <span class="copy-feedback" id="copyFeedback"></span>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Generated by <strong>Sentinel Method v2.0</strong> &mdash; Girardelli Tecnologia</p>
    <p style="margin-top:4px">Print this page (Ctrl+P / Cmd+P) to export as PDF</p>
  </div>

</div>
<script>
/* ── Toggle issue groups ── */
function toggleGroup(g){
  var b=document.getElementById('igb-'+g),a=document.getElementById('arrow-'+g);
  if(b.style.display==='none'){b.style.display='block';a.classList.add('open');initPagination(g);}
  else{b.style.display='none';a.classList.remove('open');}
}

/* ── Pagination ── */
function initPagination(g){
  var rows=document.querySelectorAll('.ig-row[data-group="'+g+'"]');
  var pages=new Set();rows.forEach(function(r){pages.add(r.dataset.page);});
  var total=pages.size;if(total<=1)return;
  var c=document.getElementById('igp-'+g);if(!c||c.children.length>0)return;
  for(var p=0;p<total;p++){
    var btn=document.createElement('button');btn.className='pg-btn'+(p===0?' active':'');
    btn.textContent=''+(p+1);btn.dataset.group=g;btn.dataset.page=p;
    btn.onclick=function(){goPage(parseInt(this.dataset.group),parseInt(this.dataset.page));};
    c.appendChild(btn);
  }
}
function goPage(g,p){
  document.querySelectorAll('.ig-row[data-group="'+g+'"]').forEach(function(r){
    r.style.display=parseInt(r.dataset.page)===p?'':'none';
  });
  var btns=document.getElementById('igp-'+g);if(!btns)return;
  Array.from(btns.children).forEach(function(b,i){b.className='pg-btn'+(i===p?' active':'');});
}

/* ── Prompt Generator ── */
function genPrompt(g,validator){
  var data=JSON.parse(document.getElementById('pd-'+g).textContent);
  var byFile={};
  data.forEach(function(d){var k=d.file||'general';if(!byFile[k])byFile[k]=[];byFile[k].push(d);});
  var lines=[];
  lines.push('Corrija os seguintes problemas encontrados pelo Sentinel Method (validator: '+validator+'):');
  lines.push('');
  Object.keys(byFile).forEach(function(f){
    lines.push('## '+f);
    byFile[f].forEach(function(d){
      var loc=d.line?'linha '+d.line:'';
      lines.push('- ['+d.sev.toUpperCase()+'] '+d.code+': '+d.msg+(loc?' ('+loc+')':''));
      if(d.suggestion)lines.push('  Sugestão: '+d.suggestion);
    });
    lines.push('');
  });
  lines.push('---');
  lines.push('Instruções:');
  lines.push('1. Analise cada issue e aplique a correção adequada');
  lines.push('2. Mantenha o estilo do código existente');
  lines.push('3. Não quebre funcionalidades existentes');
  lines.push('4. Adicione comentários explicativos quando a correção não for óbvia');
  lines.push('5. Se uma issue for falso positivo, explique o motivo');
  document.getElementById('modalSub').textContent=validator+' — '+data.length+' issues';
  document.getElementById('modalText').value=lines.join('\\n');
  document.getElementById('promptModal').classList.add('show');
}
function closeModal(){document.getElementById('promptModal').classList.remove('show');}
function copyPrompt(){
  var t=document.getElementById('modalText');t.select();
  navigator.clipboard.writeText(t.value).then(function(){
    document.getElementById('copyFeedback').textContent='✓ Copiado!';
    setTimeout(function(){document.getElementById('copyFeedback').textContent='';},2000);
  });
}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});
</script>
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
