import { Sentinel } from '../src/sentinel';

async function basicValidation(): Promise<void> {
  const sentinel = new Sentinel({
    testingThreshold: 80,
    securityLevel: 'strict',
    performanceTarget: 'optimal',
    maintainabilityScore: 75,
  });

  try {
    const sourceDir = process.argv[2] || './src';
    console.log(`Validating code in: ${sourceDir}\n`);

    const result = await sentinel.validate(sourceDir);

    console.log(result.report);

    console.log('\nValidation completed');
    console.log(`Status: ${result.success ? 'PASSED' : 'FAILED'}`);
    console.log(`Exit code: ${result.exitCode}`);

    process.exit(result.exitCode);
  } catch (error) {
    console.error('Validation error:', error);
    process.exit(1);
  }
}

basicValidation();
