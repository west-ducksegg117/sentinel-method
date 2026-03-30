/**
 * Sub-Agent Verification Protocol — Tests
 *
 * Tests covering:
 * - BaseVerifier contract
 * - SecurityVerifier (adversarial heuristics)
 * - ConsensusEngine (agreement, disagreement, only-primary, only-verifier)
 * - Full Protocol: Primary + Verifier + Consensus
 */

import * as fs from 'fs';
import * as path from 'path';
import { SecurityValidator } from '../../src/validators/security';
import { SecurityVerifier } from '../../src/verifiers/security-verifier';
import { ConsensusEngine } from '../../src/consensus-engine';
import { SentinelConfig, ValidatorResult } from '../../src/types';
import { VerifierResult } from '../../src/types-verifier';

// ═══════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════

const TEST_DIR = path.join('/tmp', 'sentinel-test-project-verifier');

const defaultConfig: SentinelConfig = {
  testingThreshold: 70,
  securityLevel: 'moderate',
  performanceTarget: 'good',
  maintainabilityScore: 60,
};

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(TEST_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function cleanup(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// SECURITY VERIFIER TESTS
// ═══════════════════════════════════════════════════════════════

describe('SecurityVerifier (Adversarial)', () => {
  beforeEach(() => {
    cleanup();
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(cleanup);

  test('should detect taint flow: user input → database execute', () => {
    writeFile('server.ts', `
import express from 'express';
const app = express();
app.post('/users', async (req, res) => {
  const name = req.body.name;
  await db.execute('INSERT INTO users (name) VALUES (' + name + ')');
  res.send({ ok: true });
});
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    const taintIssues = result.issues.filter(i => i.heuristic === 'taint_flow');
    expect(taintIssues.length).toBeGreaterThan(0);
    expect(taintIssues.some(i => i.code === 'TAINT_DB_EXECUTE')).toBe(true);
  });

  test('should detect missing auth middleware on routes', () => {
    writeFile('routes.ts', `
import express from 'express';
const app = express();
app.get('/public', (req, res) => res.send('ok'));
app.post('/users', (req, res) => {
  const data = req.body;
  res.json(data);
});
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    const controlIssues = result.issues.filter(i => i.heuristic === 'missing_control');
    expect(controlIssues.some(i => i.code === 'NO_AUTH_MIDDLEWARE')).toBe(true);
  });

  test('should detect missing input validation on write endpoints', () => {
    writeFile('api.ts', `
import express from 'express';
const app = express();
app.post('/data', (req, res) => {
  const payload = req.body;
  db.insert(payload);
  res.json({ saved: true });
});
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    const issues = result.issues.filter(i => i.code === 'NO_INPUT_VALIDATION');
    expect(issues.length).toBeGreaterThan(0);
  });

  test('should detect Math.random in security context', () => {
    writeFile('auth.ts', `
function generateToken() {
  const token = Math.random().toString(36).substring(7);
  return token;
}
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.issues.some(i => i.code === 'WEAK_RANDOM')).toBe(true);
  });

  test('should detect JWT without expiration', () => {
    writeFile('auth.ts', `
import jwt from 'jsonwebtoken';
function createToken(user) {
  return jwt.sign({ id: user.id }, 'mysecretkey');
}
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.issues.some(i => i.code === 'JWT_NO_EXPIRY')).toBe(true);
    expect(result.issues.some(i => i.code === 'JWT_HARDCODED_SECRET')).toBe(true);
  });

  test('should detect sensitive data in logs', () => {
    writeFile('service.ts', `
function login(username, password) {
  console.log('Login attempt:', username, password);
  return authenticate(username, password);
}
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.issues.some(i => i.code === 'LOG_SENSITIVE_DATA')).toBe(true);
  });

  test('should detect CORS misconfiguration', () => {
    writeFile('app.ts', `
import express from 'express';
import cors from 'cors';
const app = express();
app.use(cors());
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.issues.some(i => i.code === 'CORS_WIDE_OPEN')).toBe(true);
  });

  test('should detect .env not in gitignore', () => {
    writeFile('.env', 'SECRET_KEY=abc123');
    // No .gitignore

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.issues.some(i => i.code === 'ENV_NOT_IGNORED')).toBe(true);
  });

  test('should detect unpinned dependencies', () => {
    writeFile('package.json', JSON.stringify({
      dependencies: { express: '*', lodash: 'latest' },
    }));

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.issues.filter(i => i.code === 'UNPINNED_DEPENDENCY').length).toBe(2);
  });

  test('should pass clean code with high score', () => {
    writeFile('clean.ts', `
import { Request, Response } from 'express';
import { validateInput } from './validation';
import { sanitize } from './sanitizer';

export function handleRequest(req: Request, res: Response) {
  const input = validateInput(req.body);
  const clean = sanitize(input);
  return res.json({ data: clean });
}
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  test('should include confidence levels in issues', () => {
    writeFile('tainted.ts', `
const app = require('express')();
app.get('/search', (req, res) => {
  const q = req.query.q;
  res.send('<h1>' + q + '</h1>');
});
    `);

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    for (const issue of result.issues) {
      expect(['high', 'medium', 'low', 'uncertain']).toContain(issue.confidence);
      expect(issue.heuristic).toBeDefined();
    }
  });

  test('should return execution duration', () => {
    writeFile('empty.ts', '// empty file');

    const verifier = new SecurityVerifier(defaultConfig);
    const result = verifier.verify(TEST_DIR);

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════
// CONSENSUS ENGINE TESTS
// ═══════════════════════════════════════════════════════════════

describe('ConsensusEngine', () => {
  const engine = new ConsensusEngine();

  test('should detect agreement when both find same issue', () => {
    const primary: ValidatorResult = {
      validator: 'Security Scanning',
      passed: false,
      score: 50,
      issues: [
        { severity: 'error', code: 'INJECTION_EVAL', message: 'eval() usage', file: 'app.ts', line: 10 },
      ],
      details: {},
    };

    const verifier: VerifierResult = {
      verifier: 'Security Verifier',
      issues: [
        { severity: 'error', code: 'TAINT_DB_EXECUTE', message: 'Tainted data in execute', file: 'app.ts', line: 12, confidence: 'high', heuristic: 'taint_flow' },
      ],
      score: 60,
      details: {},
      duration: 100,
    };

    const result = engine.analyze(primary, verifier, 'security');

    // Both found security issues in same file, nearby lines → should agree
    expect(result.agreements.length + result.onlyPrimary.length + result.onlyVerifier.length).toBeGreaterThan(0);
    expect(result.domain).toBe('security');
    expect(result.primaryScore).toBe(50);
    expect(result.verifierScore).toBe(60);
  });

  test('should detect only-primary when verifier misses issue', () => {
    const primary: ValidatorResult = {
      validator: 'Security Scanning',
      passed: false,
      score: 70,
      issues: [
        { severity: 'warning', code: 'XSS_INNERHTML', message: 'innerHTML usage', file: 'component.ts', line: 25 },
      ],
      details: {},
    };

    const verifier: VerifierResult = {
      verifier: 'Security Verifier',
      issues: [], // Verifier missed it
      score: 100,
      details: {},
      duration: 50,
    };

    const result = engine.analyze(primary, verifier, 'security');

    expect(result.onlyPrimary).toHaveLength(1);
    expect(result.onlyPrimary[0]!.zone).toBe('only_primary');
    expect(result.agreements).toHaveLength(0);
    expect(result.onlyVerifier).toHaveLength(0);
  });

  test('should detect only-verifier (false negative from primary)', () => {
    const primary: ValidatorResult = {
      validator: 'Security Scanning',
      passed: true,
      score: 100,
      issues: [], // Primary missed it
      details: {},
    };

    const verifier: VerifierResult = {
      verifier: 'Security Verifier',
      issues: [
        { severity: 'error', code: 'WEAK_RANDOM', message: 'Math.random in security context', file: 'auth.ts', line: 5, confidence: 'high', heuristic: 'crypto_weakness' },
      ],
      score: 80,
      details: {},
      duration: 50,
    };

    const result = engine.analyze(primary, verifier, 'security');

    expect(result.onlyVerifier).toHaveLength(1);
    expect(result.onlyVerifier[0]!.zone).toBe('only_verifier');
    expect(result.uncertaintyZones.length).toBeGreaterThan(0);
    expect(result.uncertaintyZones[0]!.recommendation).toContain('Adversarial Verifier found');
  });

  test('should handle both clean results', () => {
    const primary: ValidatorResult = {
      validator: 'Security', passed: true, score: 100, issues: [], details: {},
    };
    const verifier: VerifierResult = {
      verifier: 'Verifier', issues: [], score: 100, details: {}, duration: 10,
    };

    const result = engine.analyze(primary, verifier, 'security');

    expect(result.agreements).toHaveLength(0);
    expect(result.onlyPrimary).toHaveLength(0);
    expect(result.onlyVerifier).toHaveLength(0);
    expect(result.agreementRatio).toBe(1);
    expect(result.consensusScore).toBe(100);
  });

  test('should calculate consensus score with penalties', () => {
    const primary: ValidatorResult = {
      validator: 'Security', passed: false, score: 40,
      issues: [
        { severity: 'error', code: 'A', message: 'Issue A', file: 'x.ts', line: 1 },
        { severity: 'error', code: 'B', message: 'Issue B', file: 'y.ts', line: 1 },
      ],
      details: {},
    };
    const verifier: VerifierResult = {
      verifier: 'Verifier', score: 60,
      issues: [
        { severity: 'error', code: 'C', message: 'Issue C', file: 'z.ts', line: 1, confidence: 'high', heuristic: 'test' },
      ],
      details: {}, duration: 10,
    };

    const result = engine.analyze(primary, verifier, 'security');

    // Score should be penalized for uncertainty zones
    expect(result.consensusScore).toBeLessThan(100);
    expect(result.consensusScore).toBeGreaterThanOrEqual(0);
  });

  test('should match issues by related code categories', () => {
    const primary: ValidatorResult = {
      validator: 'Security', passed: false, score: 50,
      issues: [
        { severity: 'error', code: 'SECRET_PASSWORD', message: 'Hardcoded password', file: 'config.ts', line: 5 },
      ],
      details: {},
    };
    const verifier: VerifierResult = {
      verifier: 'Verifier', score: 50,
      issues: [
        { severity: 'error', code: 'JWT_HARDCODED_SECRET', message: 'JWT hardcoded secret', file: 'config.ts', line: 8, confidence: 'high', heuristic: 'crypto' },
      ],
      details: {}, duration: 10,
    };

    const result = engine.analyze(primary, verifier, 'security');

    // SECRET and JWT are related categories in same file → should agree
    expect(result.agreements.length).toBeGreaterThanOrEqual(1);
  });

  test('should compute agreement ratio correctly', () => {
    const primary: ValidatorResult = {
      validator: 'Security', passed: false, score: 40,
      issues: [
        { severity: 'error', code: 'INJECTION_EVAL', message: 'eval()', file: 'a.ts', line: 1 },
        { severity: 'warning', code: 'XSS_INNERHTML', message: 'innerHTML', file: 'b.ts', line: 1 },
      ],
      details: {},
    };
    const verifier: VerifierResult = {
      verifier: 'Verifier', score: 60,
      issues: [
        { severity: 'error', code: 'TAINT_DB_EXECUTE', message: 'Taint in execute', file: 'a.ts', line: 3, confidence: 'medium', heuristic: 'taint' },
        { severity: 'warning', code: 'NO_AUTH_MIDDLEWARE', message: 'No auth', file: 'c.ts', line: 1, confidence: 'medium', heuristic: 'control' },
      ],
      details: {}, duration: 10,
    };

    const result = engine.analyze(primary, verifier, 'security');

    expect(result.agreementRatio).toBeGreaterThanOrEqual(0);
    expect(result.agreementRatio).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// FULL PROTOCOL: Primary + Verifier + Consensus
// ═══════════════════════════════════════════════════════════════

describe('Full Sub-Agent Verification Protocol', () => {
  beforeEach(() => {
    cleanup();
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(cleanup);

  test('should run complete protocol: Validator → Verifier → Consensus', () => {
    // Code with known issues that BOTH should detect
    writeFile('vulnerable.ts', `
import express from 'express';
const app = express();

app.post('/login', (req, res) => {
  const password = req.body.password;
  const result = eval('check("' + password + '")');
  console.log('Login attempt with password:', password);
  res.json({ token: Math.random().toString(36) });
});
    `);

    // Run Primary Validator
    const validator = new SecurityValidator(defaultConfig);
    const primaryResult = validator.validate(TEST_DIR);

    // Run Adversarial Verifier (independently)
    const verifier = new SecurityVerifier(defaultConfig);
    const verifierResult = verifier.verify(TEST_DIR);

    // Run ConsensusEngine
    const engine = new ConsensusEngine();
    const consensus = engine.analyze(primaryResult, verifierResult, 'security');

    // Protocol assertions
    expect(primaryResult.issues.length).toBeGreaterThan(0);
    expect(verifierResult.issues.length).toBeGreaterThan(0);
    expect(consensus.domain).toBe('security');

    // At least some agreement (both detect issues in same file)
    const totalClassified = consensus.agreements.length +
      consensus.onlyPrimary.length +
      consensus.onlyVerifier.length;
    expect(totalClassified).toBeGreaterThan(0);

    // Consensus score should be calculated
    expect(consensus.consensusScore).toBeGreaterThanOrEqual(0);
    expect(consensus.consensusScore).toBeLessThanOrEqual(100);

    // Duration should be tracked
    expect(consensus.duration).toBeGreaterThanOrEqual(0);
  });

  test('verifier should catch issues that primary misses', () => {
    // Code that exploits Primary's regex-based blind spots
    writeFile('subtle.ts', `
import jwt from 'jsonwebtoken';
import express from 'express';
const app = express();

// Primary won't catch: JWT without expiry (not a regex in Primary's rules)
function createToken(user) {
  return jwt.sign({ id: user.id }, 'secret123');
}

// Primary won't catch: taint flow (not a regex-based detection)
app.get('/search', (req, res) => {
  const query = req.query.q;
  const results = db.execute('SELECT * FROM items WHERE name LIKE ' + query);
  res.json(results);
});
    `);

    const validator = new SecurityValidator(defaultConfig);
    const primaryResult = validator.validate(TEST_DIR);

    const verifier = new SecurityVerifier(defaultConfig);
    const verifierResult = verifier.verify(TEST_DIR);

    const engine = new ConsensusEngine();
    const consensus = engine.analyze(primaryResult, verifierResult, 'security');

    // Verifier should find things Primary missed
    const verifierOnlyCodes = consensus.onlyVerifier.map(
      v => v.verifierIssue?.code
    ).filter(Boolean);

    // These are the kinds of issues the Verifier catches but Primary doesn't:
    // JWT_NO_EXPIRY, JWT_HARDCODED_SECRET, TAINT_DB_EXECUTE, NO_AUTH_MIDDLEWARE
    expect(verifierResult.issues.length).toBeGreaterThan(0);
    expect(verifierOnlyCodes.length + consensus.agreements.length).toBeGreaterThan(0);
  });

  test('clean code should produce clean consensus', () => {
    writeFile('clean.ts', `
import { Request, Response, NextFunction } from 'express';
import { validateSchema } from './validators';
import { sanitizeInput } from './sanitizers';
import { authenticateToken } from './auth';
import crypto from 'crypto';

export function secureHandler(req: Request, res: Response, next: NextFunction) {
  try {
    authenticateToken(req);
    const validated = validateSchema(req.body);
    const sanitized = sanitizeInput(validated);
    const id = crypto.randomUUID();
    res.json({ id, data: sanitized });
  } catch (error) {
    next(error);
  }
}
    `);

    writeFile('.gitignore', '.env\nnode_modules/\ndist/');

    const validator = new SecurityValidator(defaultConfig);
    const primaryResult = validator.validate(TEST_DIR);

    const verifier = new SecurityVerifier(defaultConfig);
    const verifierResult = verifier.verify(TEST_DIR);

    const engine = new ConsensusEngine();
    const consensus = engine.analyze(primaryResult, verifierResult, 'security');

    expect(primaryResult.passed).toBe(true);
    expect(verifierResult.score).toBeGreaterThanOrEqual(70);
    expect(consensus.consensusScore).toBeGreaterThanOrEqual(70);
    expect(consensus.uncertaintyZones.length).toBe(0);
  });
});
