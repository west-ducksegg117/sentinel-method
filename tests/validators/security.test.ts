import { SecurityValidator } from '../../src/validators/security';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('SecurityValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-security');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    config = {
      testingThreshold: 80,
      securityLevel: 'strict',
      performanceTarget: 'optimal',
      maintainabilityScore: 75,
    };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('deve inicializar com configuração válida', () => {
    const validator = new SecurityValidator(config);
    expect(validator).toBeDefined();
    expect(validator.getSecurityLevel()).toBe('strict');
  });

  test('deve passar quando não há vulnerabilidades', () => {
    const safeFile = path.join(testDir, 'safe.ts');
    fs.writeFileSync(safeFile, `
      export function greet(name: string): string {
        return \`Hello, \${name}\`;
      }

      export function add(a: number, b: number): number {
        return a + b;
      }
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Security Scanning');
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.details.securityScore).toBe(100);
  });

  // ── Detecção de injeção de código ──

  test('deve detectar eval() como risco de injeção', () => {
    const file = path.join(testDir, 'injection.ts');
    fs.writeFileSync(file, `
      const userInput = "2 + 2";
      const result = eval(userInput);
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'INJECTION_RISK')).toBe(true);
    expect(result.details.injectionRisks).toBeGreaterThan(0);
  });

  test('deve detectar new Function() como risco de injeção', () => {
    const file = path.join(testDir, 'function-constructor.ts');
    fs.writeFileSync(file, `
      const dynamicFn = new Function("x", "return x * 2");
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'INJECTION_RISK')).toBe(true);
  });

  test('deve detectar innerHTML como risco de XSS', () => {
    const file = path.join(testDir, 'xss.ts');
    fs.writeFileSync(file, `
      document.getElementById('app').innerHTML = userInput;
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    // innerHTML aparece tanto em injectionPatterns quanto xssPatterns
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('deve detectar dangerouslySetInnerHTML (React)', () => {
    const file = path.join(testDir, 'react-xss.ts');
    fs.writeFileSync(file, `
      const props = { dangerouslySetInnerHTML: { __html: userInput } };
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'INJECTION_RISK')).toBe(true);
  });

  test('deve detectar document.write como XSS', () => {
    const file = path.join(testDir, 'doc-write.ts');
    fs.writeFileSync(file, `
      document.write("<h1>" + userInput + "</h1>");
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'XSS_RISK')).toBe(true);
  });

  test('deve detectar insertAdjacentHTML como XSS', () => {
    const file = path.join(testDir, 'adjacent-html.ts');
    fs.writeFileSync(file, `
      element.insertAdjacentHTML('beforeend', userContent);
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'XSS_RISK')).toBe(true);
  });

  // ── Detecção de secrets hardcoded ──

  test('deve detectar password hardcoded', () => {
    const file = path.join(testDir, 'secrets.ts');
    fs.writeFileSync(file, `
      const dbConfig = {
        host: 'localhost',
        password = "super_secret_123"
      };
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'HARDCODED_SECRET')).toBe(true);
    expect(result.details.hardcodedSecrets).toBeGreaterThan(0);
  });

  test('deve detectar API key hardcoded', () => {
    const file = path.join(testDir, 'api-key.ts');
    fs.writeFileSync(file, `
      const api_key = "sk-1234567890abcdef";
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'HARDCODED_SECRET')).toBe(true);
  });

  test('deve detectar token hardcoded', () => {
    const file = path.join(testDir, 'token.ts');
    fs.writeFileSync(file, `
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'HARDCODED_SECRET')).toBe(true);
  });

  test('deve detectar private key hardcoded', () => {
    const file = path.join(testDir, 'privkey.ts');
    fs.writeFileSync(file, `
      const private_key = "-----BEGIN RSA PRIVATE KEY-----";
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'HARDCODED_SECRET')).toBe(true);
  });

  // ── Múltiplas vulnerabilidades ──

  test('deve detectar múltiplas vulnerabilidades no mesmo arquivo', () => {
    const file = path.join(testDir, 'multi-vuln.ts');
    fs.writeFileSync(file, `
      const password = "admin123";
      const result = eval(userInput);
      document.write("<p>" + data + "</p>");
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.details.securityScore).toBeLessThan(50);
  });

  // ── Score calculation ──

  test('deve calcular score proporcional ao número de issues', () => {
    const file = path.join(testDir, 'one-issue.ts');
    fs.writeFileSync(file, `
      const secret = "my-secret-value";
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    // 1 hardcoded secret = -30 pontos → score 70
    expect(result.details.securityScore).toBeLessThanOrEqual(70);
    expect(result.details.securityScore).toBeGreaterThan(0);
  });

  // ── Edge cases ──

  test('deve ignorar diretórios ocultos e node_modules', () => {
    const hiddenDir = path.join(testDir, '.hidden');
    const nodeModulesDir = path.join(testDir, 'node_modules', 'lib');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    // Vulnerabilidades em diretórios que devem ser ignorados
    fs.writeFileSync(path.join(hiddenDir, 'bad.ts'), 'const x = eval("1+1");');
    fs.writeFileSync(path.join(nodeModulesDir, 'bad.ts'), 'const token = "leaked_token";');

    // Arquivo limpo no diretório principal
    const cleanFile = path.join(testDir, 'clean.ts');
    fs.writeFileSync(cleanFile, 'export const x = 42;');

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('deve lidar com diretório vazio sem erros', () => {
    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.details.securityScore).toBe(100);
  });

  test('deve incluir CWE reference nas issues de injeção', () => {
    const file = path.join(testDir, 'cwe.ts');
    fs.writeFileSync(file, `
      const result = eval(input);
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const injectionIssue = result.issues.find(i => i.code === 'INJECTION_RISK');
    expect(injectionIssue).toBeDefined();
    // CWE field existe na SecurityIssue
    expect((injectionIssue as any).cwe).toBe('CWE-95');
  });

  test('deve incluir sugestão de correção em cada issue', () => {
    const file = path.join(testDir, 'suggestions.ts');
    fs.writeFileSync(file, `
      eval("code");
      const password = "123";
      document.write("<p>xss</p>");
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    for (const issue of result.issues) {
      expect(issue.suggestion).toBeDefined();
      expect(issue.suggestion!.length).toBeGreaterThan(0);
    }
  });

  test('deve reportar número de linhas correto', () => {
    const file = path.join(testDir, 'lines.ts');
    fs.writeFileSync(file, [
      'const a = 1;',
      'const b = 2;',
      'const c = eval("3");',  // linha 3
      'const d = 4;',
    ].join('\n'));

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const issue = result.issues.find(i => i.code === 'INJECTION_RISK');
    expect(issue).toBeDefined();
    expect(issue!.line).toBe(3);
  });
});
