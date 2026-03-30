import { SecurityValidator } from '../../src/validators/security';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('SecurityValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join('/tmp', 'sentinel-test-project-security');
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
    expect(result.issues.some(i => i.code === 'INJECTION_EVAL')).toBe(true);
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
    expect(result.issues.some(i => i.code === 'INJECTION_FUNC')).toBe(true);
  });

  test('deve detectar innerHTML como risco de XSS', () => {
    const file = path.join(testDir, 'xss.ts');
    fs.writeFileSync(file, `
      document.getElementById('app').innerHTML = userInput;
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'XSS_INNERHTML')).toBe(true);
  });

  test('deve detectar dangerouslySetInnerHTML (React)', () => {
    const file = path.join(testDir, 'react-xss.ts');
    fs.writeFileSync(file, `
      const props = { dangerouslySetInnerHTML: { __html: userInput } };
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'XSS_REACT')).toBe(true);
  });

  test('deve detectar document.write como XSS', () => {
    const file = path.join(testDir, 'doc-write.ts');
    fs.writeFileSync(file, `
      document.write("<h1>" + userInput + "</h1>");
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'XSS_DOCWRITE')).toBe(true);
  });

  test('deve detectar insertAdjacentHTML como XSS', () => {
    const file = path.join(testDir, 'adjacent-html.ts');
    fs.writeFileSync(file, `
      element.insertAdjacentHTML('beforeend', userContent);
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'XSS_ADJACENT')).toBe(true);
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
    expect(result.issues.some(i => i.code === 'SECRET_PASSWORD')).toBe(true);
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
    expect(result.issues.some(i => i.code === 'SECRET_APIKEY')).toBe(true);
  });

  test('deve detectar token hardcoded', () => {
    const file = path.join(testDir, 'token.ts');
    fs.writeFileSync(file, `
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'SECRET_TOKEN')).toBe(true);
  });

  test('deve detectar private key hardcoded', () => {
    const file = path.join(testDir, 'privkey.ts');
    fs.writeFileSync(file, `
      const private_key = "-----BEGIN RSA PRIVATE KEY-----";
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'SECRET_PRIVKEY')).toBe(true);
  });

  // ── OWASP CWE Mapping ──

  test('deve incluir CWE-95 para eval injection', () => {
    const file = path.join(testDir, 'cwe-eval.ts');
    fs.writeFileSync(file, 'const result = eval(input);\n');

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const issue = result.issues.find(i => i.code === 'INJECTION_EVAL');
    expect(issue).toBeDefined();
    expect((issue as any).cwe).toBe('CWE-95');
    expect(issue!.message).toContain('CWE-95');
  });

  test('deve incluir CWE-79 para XSS', () => {
    const file = path.join(testDir, 'cwe-xss.ts');
    fs.writeFileSync(file, 'element.insertAdjacentHTML("beforeend", data);\n');

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const issue = result.issues.find(i => i.code === 'XSS_ADJACENT');
    expect(issue).toBeDefined();
    expect((issue as any).cwe).toBe('CWE-79');
  });

  test('deve incluir CWE-798 para hardcoded credentials', () => {
    const file = path.join(testDir, 'cwe-secret.ts');
    fs.writeFileSync(file, 'const password = "admin123";\n');

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const issue = result.issues.find(i => i.code === 'SECRET_PASSWORD');
    expect(issue).toBeDefined();
    expect((issue as any).cwe).toBe('CWE-798');
  });

  test('deve categorizar issues por OWASP Top 10', () => {
    const file = path.join(testDir, 'owasp.ts');
    fs.writeFileSync(file, `
      const result = eval(input);
      const password = "secret";
      element.insertAdjacentHTML("beforeend", data);
    `);

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const owasp = result.details.owaspCategories;
    expect(owasp).toBeDefined();
    // A03:2021 (Injection) e A02:2021 (Crypto/Secrets) devem estar presentes
    expect(owasp['A03:2021']).toBeGreaterThan(0);
    expect(owasp['A02:2021']).toBeGreaterThan(0);
  });

  test('deve retornar info CWE estática via getCweInfo', () => {
    const info = SecurityValidator.getCweInfo('CWE-95');
    expect(info).toBeDefined();
    expect(info!.owasp).toBe('A03:2021');
    expect(info!.description).toContain('Eval Injection');
  });

  test('deve retornar undefined para CWE desconhecido', () => {
    const info = SecurityValidator.getCweInfo('CWE-99999');
    expect(info).toBeUndefined();
  });

  test('deve expor regras de detecção via getDetectionRules', () => {
    const validator = new SecurityValidator(config);
    const rules = validator.getDetectionRules();

    expect(rules.length).toBeGreaterThan(10);
    // Cada regra deve ter todos os campos
    for (const rule of rules) {
      expect(rule.pattern).toBeDefined();
      expect(rule.code).toBeDefined();
      expect(rule.cweId).toBeDefined();
      expect(rule.message).toBeDefined();
      expect(rule.suggestion).toBeDefined();
    }
  });

  // ── Novos padrões de detecção ──

  test('deve detectar MD5 como crypto fraco', () => {
    const file = path.join(testDir, 'crypto.ts');
    fs.writeFileSync(file, 'const hash = createHash("md5").update(data).digest("hex");\n');

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'WEAK_CRYPTO_MD5')).toBe(true);
    expect((result.issues.find(i => i.code === 'WEAK_CRYPTO_MD5') as any).cwe).toBe('CWE-327');
  });

  test('deve detectar SHA-1 como crypto depreciado', () => {
    const file = path.join(testDir, 'sha1.ts');
    fs.writeFileSync(file, 'const hash = createHash("sha1").update(data).digest("hex");\n');

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'WEAK_CRYPTO_SHA1')).toBe(true);
  });

  // ── Modo permissive ──

  test('deve ser mais leniente em modo permissive', () => {
    const file = path.join(testDir, 'permissive.ts');
    fs.writeFileSync(file, `
      const password = "admin123";
      element.insertAdjacentHTML("beforeend", data);
    `);

    const permissiveConfig = { ...config, securityLevel: 'permissive' as const };
    const validator = new SecurityValidator(permissiveConfig);
    const result = validator.validate(testDir);

    // Permissive só falha com injection risks, não com secrets/XSS
    expect(result.passed).toBe(true);
    // Mas as issues continuam sendo reportadas
    expect(result.issues.length).toBeGreaterThan(0);
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

    expect(result.details.securityScore).toBeLessThanOrEqual(70);
    expect(result.details.securityScore).toBeGreaterThan(0);
  });

  // ── Edge cases ──

  test('deve ignorar diretórios ocultos e node_modules', () => {
    const hiddenDir = path.join(testDir, '.hidden');
    const nodeModulesDir = path.join(testDir, 'node_modules', 'lib');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    fs.writeFileSync(path.join(hiddenDir, 'bad.ts'), 'const x = eval("1+1");');
    fs.writeFileSync(path.join(nodeModulesDir, 'bad.ts'), 'const token = "leaked_token";');

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
      'const c = eval("3");',
      'const d = 4;',
    ].join('\n'));

    const validator = new SecurityValidator(config);
    const result = validator.validate(testDir);

    const issue = result.issues.find(i => i.code === 'INJECTION_EVAL');
    expect(issue).toBeDefined();
    expect(issue!.line).toBe(3);
  });
});
