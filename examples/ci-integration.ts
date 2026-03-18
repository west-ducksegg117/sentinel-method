import { Sentinel } from '../src/sentinel';
import * as fs from 'fs';

async function ciIntegration(): Promise<void> {
  const sentinel = new Sentinel({
    testingThreshold: 85,
    securityLevel: 'strict',
    performanceTarget: 'good',
    maintainabilityScore: 80,
    reporters: ['json', 'markdown'],
    failOnWarnings: true,
  });

  try {
    const sourceDir = process.argv[2] || './src';
    console.log('Sentinel Validation - CI Integration Pipeline');
    console.log('============================================\n');

    const result = await sentinel.validate(sourceDir);

    if (!fs.existsSync('./reports')) {
      fs.mkdirSync('./reports');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonReportPath = `./reports/sentinel-report-${timestamp}.json`;
    const mdReportPath = `./reports/sentinel-report-${timestamp}.md`;

    fs.writeFileSync(jsonReportPath, sentinel['reporter'].generateJSON(result));
    fs.writeFileSync(mdReportPath, sentinel['reporter'].generateMarkdown(result));

    console.log(result.report);

    console.log('\nReports generated:');
    console.log(`  JSON: ${jsonReportPath}`);
    console.log(`  Markdown: ${mdReportPath}`);

    if (!result.success) {
      console.error('\nValidation FAILED - blocking deployment');
      process.exit(result.exitCode);
    }

    console.log('\nValidation PASSED - deployment approved');
    process.exit(0);
  } catch (error) {
    console.error('CI Integration error:', error);
    process.exit(1);
  }
}

ciIntegration();
