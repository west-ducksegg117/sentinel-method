import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HookManager } from '../src/hooks';

describe('HookManager', () => {
  let tmpDir: string;
  let manager: HookManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-hooks-'));
    // Simular repositório git
    fs.mkdirSync(path.join(tmpDir, '.git', 'hooks'), { recursive: true });
    manager = new HookManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── isGitRepo ──

  test('deve detectar repositório git', () => {
    expect(manager.isGitRepo()).toBe(true);
  });

  test('deve retornar false para diretório sem .git', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
    const nonGitManager = new HookManager(nonGitDir);
    expect(nonGitManager.isGitRepo()).toBe(false);
    fs.rmSync(nonGitDir, { recursive: true });
  });

  // ── installPreCommit ──

  test('deve instalar pre-commit hook', () => {
    const result = manager.installPreCommit();

    expect(result.success).toBe(true);
    expect(result.message).toContain('pre-commit');

    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    expect(fs.existsSync(hookPath)).toBe(true);

    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('sentinel');
    expect(content).toContain('#!/bin/sh');
  });

  test('deve respeitar opções customizadas no pre-commit', () => {
    manager.installPreCommit({ testingThreshold: 90, securityLevel: 'moderate' });

    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const content = fs.readFileSync(hookPath, 'utf-8');

    expect(content).toContain('-t 90');
    expect(content).toContain('-s moderate');
  });

  // ── installPrePush ──

  test('deve instalar pre-push hook', () => {
    const result = manager.installPrePush();

    expect(result.success).toBe(true);

    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-push');
    expect(fs.existsSync(hookPath)).toBe(true);

    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('sentinel');
    expect(content).toContain('pre-push');
  });

  // ── installAll ──

  test('deve instalar ambos os hooks', () => {
    const results = manager.installAll();

    expect(results.preCommit.success).toBe(true);
    expect(results.prePush.success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.git', 'hooks', 'pre-push'))).toBe(true);
  });

  // ── Conflito com hooks existentes ──

  test('não deve sobrescrever hook existente não-sentinel', () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom hook"\n');

    const result = manager.installPreCommit();
    expect(result.success).toBe(false);
    expect(result.message).toContain('já existe');
  });

  test('deve sobrescrever hook sentinel existente', () => {
    // Primeira instalação
    manager.installPreCommit();

    // Segunda instalação (update)
    const result = manager.installPreCommit({ testingThreshold: 95 });
    expect(result.success).toBe(true);

    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('-t 95');
  });

  // ── Falha em diretório sem .git ──

  test('deve falhar ao instalar em diretório sem .git', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
    const nonGitManager = new HookManager(nonGitDir);

    const result = nonGitManager.installPreCommit();
    expect(result.success).toBe(false);
    expect(result.message).toContain('repositório git');

    fs.rmSync(nonGitDir, { recursive: true });
  });

  // ── remove ──

  test('deve remover hook sentinel', () => {
    manager.installPreCommit();
    expect(manager.isInstalled('pre-commit')).toBe(true);

    const removed = manager.remove('pre-commit');
    expect(removed).toBe(true);
    expect(manager.isInstalled('pre-commit')).toBe(false);
  });

  test('não deve remover hook não-sentinel', () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom"\n');

    const removed = manager.remove('pre-commit');
    expect(removed).toBe(false);
    expect(fs.existsSync(hookPath)).toBe(true);
  });

  test('deve retornar false ao remover hook inexistente', () => {
    const removed = manager.remove('pre-commit');
    expect(removed).toBe(false);
  });

  // ── removeAll ──

  test('deve remover todos os hooks sentinel', () => {
    manager.installAll();
    const removed = manager.removeAll();
    expect(removed.preCommit).toBe(true);
    expect(removed.prePush).toBe(true);
  });

  // ── isInstalled ──

  test('deve verificar se hook está instalado', () => {
    expect(manager.isInstalled('pre-commit')).toBe(false);

    manager.installPreCommit();
    expect(manager.isInstalled('pre-commit')).toBe(true);
  });

  // ── listInstalled ──

  test('deve listar hooks instalados', () => {
    expect(manager.listInstalled()).toEqual([]);

    manager.installAll();
    const installed = manager.listInstalled();
    expect(installed).toContain('pre-commit');
    expect(installed).toContain('pre-push');
  });

  // ── Permissões ──

  test('hook deve ser executável (modo 755)', () => {
    manager.installPreCommit();

    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const stats = fs.statSync(hookPath);
    // Verificar que tem bit de execução
    expect(stats.mode & 0o111).toBeGreaterThan(0);
  });
});
