import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ResultCache } from '../src/cache';
import { ValidationResult } from '../src/types';

describe('ResultCache', () => {
  let tmpDir: string;
  let cache: ResultCache;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-cache-'));
    cache = new ResultCache(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const mockResult: ValidationResult = {
    success: true,
    timestamp: '2026-03-22T10:00:00.000Z',
    sourceDirectory: '/tmp/test',
    duration: 150,
    summary: { totalFiles: 5, passedChecks: 7, failedChecks: 0, warnings: 2 },
    results: [
      {
        validator: 'Testing Coverage',
        passed: true,
        score: 85,
        issues: [{ severity: 'warning', code: 'LOW_COVERAGE', message: 'Coverage abaixo de 90%' }],
        details: {},
      },
      {
        validator: 'Security Scanning',
        passed: true,
        score: 100,
        issues: [],
        details: {},
      },
    ],
    report: '',
    exitCode: 0,
  };

  const mockHashes: Record<string, string> = {
    'src/app.ts': 'abc123',
    'src/utils.ts': 'def456',
  };

  // ── save / load ──

  test('deve salvar e carregar resultado do cache', () => {
    cache.save(mockResult, mockHashes);

    const loaded = cache.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.success).toBe(true);
    expect(loaded!.timestamp).toBe('2026-03-22T10:00:00.000Z');
    expect(loaded!.duration).toBe(150);
    expect(loaded!.fileHashes).toEqual(mockHashes);
    expect(loaded!.results).toHaveLength(2);
    expect(loaded!.results[0].validator).toBe('Testing Coverage');
    expect(loaded!.results[0].issueCount).toBe(1);
  });

  test('deve criar diretório .sentinel-cache automaticamente', () => {
    cache.save(mockResult, mockHashes);

    const cacheDir = path.join(tmpDir, '.sentinel-cache');
    expect(fs.existsSync(cacheDir)).toBe(true);
    expect(fs.existsSync(path.join(cacheDir, 'last-run.json'))).toBe(true);
  });

  test('deve retornar null quando cache não existe', () => {
    const loaded = cache.load();
    expect(loaded).toBeNull();
  });

  test('deve retornar null para cache corrompido', () => {
    const cacheDir = path.join(tmpDir, '.sentinel-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'last-run.json'), 'invalid json{{{');

    const loaded = cache.load();
    expect(loaded).toBeNull();
  });

  // ── hasChanges ──

  test('deve detectar que não houve mudanças', () => {
    cache.save(mockResult, mockHashes);

    const changed = cache.hasChanges(mockHashes);
    expect(changed).toBe(false);
  });

  test('deve detectar mudança em arquivo existente', () => {
    cache.save(mockResult, mockHashes);

    const modified = { ...mockHashes, 'src/app.ts': 'changed_hash' };
    expect(cache.hasChanges(modified)).toBe(true);
  });

  test('deve detectar novo arquivo adicionado', () => {
    cache.save(mockResult, mockHashes);

    const added = { ...mockHashes, 'src/new.ts': 'new_hash' };
    expect(cache.hasChanges(added)).toBe(true);
  });

  test('deve detectar arquivo removido', () => {
    cache.save(mockResult, mockHashes);

    const removed = { 'src/app.ts': 'abc123' };
    expect(cache.hasChanges(removed)).toBe(true);
  });

  test('deve retornar true quando não há cache', () => {
    expect(cache.hasChanges(mockHashes)).toBe(true);
  });

  // ── computeHashes ──

  test('deve calcular hashes de arquivos', () => {
    const file1 = path.join(tmpDir, 'file1.ts');
    const file2 = path.join(tmpDir, 'file2.ts');
    fs.writeFileSync(file1, 'const x = 1;');
    fs.writeFileSync(file2, 'const y = 2;');

    const hashes = ResultCache.computeHashes([file1, file2], tmpDir);

    expect(Object.keys(hashes)).toHaveLength(2);
    expect(hashes['file1.ts']).toBeDefined();
    expect(hashes['file2.ts']).toBeDefined();
    expect(hashes['file1.ts']).not.toBe(hashes['file2.ts']);
  });

  test('deve gerar hash consistente para mesmo conteúdo', () => {
    const file = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(file, 'hello world');

    const hashes1 = ResultCache.computeHashes([file], tmpDir);
    const hashes2 = ResultCache.computeHashes([file], tmpDir);

    expect(hashes1['test.ts']).toBe(hashes2['test.ts']);
  });

  test('deve ignorar arquivos inacessíveis', () => {
    const existing = path.join(tmpDir, 'exists.ts');
    fs.writeFileSync(existing, 'ok');

    const hashes = ResultCache.computeHashes(
      [existing, path.join(tmpDir, 'missing.ts')],
      tmpDir,
    );

    expect(Object.keys(hashes)).toHaveLength(1);
    expect(hashes['exists.ts']).toBeDefined();
  });

  // ── clear ──

  test('deve limpar o cache', () => {
    cache.save(mockResult, mockHashes);
    expect(cache.exists()).toBe(true);

    cache.clear();
    expect(cache.exists()).toBe(false);
  });

  test('deve lidar com clear quando cache não existe', () => {
    expect(() => cache.clear()).not.toThrow();
  });

  // ── exists ──

  test('deve retornar false quando cache não existe', () => {
    expect(cache.exists()).toBe(false);
  });

  test('deve retornar true quando cache existe', () => {
    cache.save(mockResult, mockHashes);
    expect(cache.exists()).toBe(true);
  });

  // ── getCacheDir ──

  test('deve retornar caminho do diretório de cache', () => {
    expect(cache.getCacheDir()).toBe(path.join(tmpDir, '.sentinel-cache'));
  });
});
