import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { DiffAnalyzer } from '../src/diff';

describe('DiffAnalyzer', () => {
  let tmpDir: string;
  let analyzer: DiffAnalyzer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-diff-'));

    // Inicializar repositório git
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Commit inicial
    fs.writeFileSync(path.join(tmpDir, 'initial.ts'), 'const x = 1;\n');
    execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tmpDir, stdio: 'pipe' });

    analyzer = new DiffAnalyzer(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── isGitRepo ──

  test('deve detectar repositório git', () => {
    expect(analyzer.isGitRepo()).toBe(true);
  });

  test('deve retornar false para diretório sem git', () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
    const nonGitAnalyzer = new DiffAnalyzer(nonGit);
    expect(nonGitAnalyzer.isGitRepo()).toBe(false);
    fs.rmSync(nonGit, { recursive: true });
  });

  // ── getCurrentBranch ──

  test('deve retornar branch atual', () => {
    const branch = analyzer.getCurrentBranch();
    // Git init pode criar 'main' ou 'master' dependendo da config
    expect(branch).toBeTruthy();
  });

  // ── getModifiedFiles ──

  test('deve detectar arquivos modificados', () => {
    fs.writeFileSync(path.join(tmpDir, 'initial.ts'), 'const x = 2;\n');

    const modified = analyzer.getModifiedFiles();
    expect(modified).toContain('initial.ts');
  });

  test('deve retornar vazio quando não há modificações', () => {
    const modified = analyzer.getModifiedFiles();
    expect(modified).toHaveLength(0);
  });

  // ── getStagedFiles ──

  test('deve detectar arquivos staged', () => {
    fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'export const y = 1;\n');
    execSync('git add new.ts', { cwd: tmpDir, stdio: 'pipe' });

    const staged = analyzer.getStagedFiles();
    expect(staged).toContain('new.ts');
  });

  // ── getChangedFiles ──

  test('deve combinar staged e unstaged sem duplicatas', () => {
    // Arquivo staged
    fs.writeFileSync(path.join(tmpDir, 'staged.ts'), 'const a = 1;\n');
    execSync('git add staged.ts', { cwd: tmpDir, stdio: 'pipe' });

    // Arquivo modificado (unstaged)
    fs.writeFileSync(path.join(tmpDir, 'initial.ts'), 'const x = 999;\n');

    const changed = analyzer.getChangedFiles();
    expect(changed).toContain('staged.ts');
    expect(changed).toContain('initial.ts');
  });

  // ── getLastCommitFiles ──

  test('deve retornar arquivos do último commit', () => {
    fs.writeFileSync(path.join(tmpDir, 'feature.ts'), 'export const f = true;\n');
    execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "add feature"', { cwd: tmpDir, stdio: 'pipe' });

    const lastCommit = analyzer.getLastCommitFiles();
    expect(lastCommit).toContain('feature.ts');
  });

  // ── filterCodeFiles ──

  test('deve filtrar apenas arquivos .ts e .js', () => {
    const files = [
      'src/app.ts',
      'src/utils.js',
      'README.md',
      'package.json',
      'src/types.d.ts',
      'node_modules/lib/index.js',
    ];

    const code = analyzer.filterCodeFiles(files);
    expect(code).toEqual(['src/app.ts', 'src/utils.js']);
  });

  // ── toAbsolutePaths ──

  test('deve converter caminhos relativos para absolutos', () => {
    const relative = ['src/app.ts', 'tests/app.test.ts'];
    const absolute = analyzer.toAbsolutePaths(relative);

    expect(absolute[0]).toBe(path.resolve(tmpDir, 'src/app.ts'));
    expect(absolute[1]).toBe(path.resolve(tmpDir, 'tests/app.test.ts'));
  });

  // ── getDiffAgainst ──

  test('deve retornar diff contra uma branch base', () => {
    // Criar branch feature
    execSync('git checkout -b feature', { cwd: tmpDir, stdio: 'pipe' });

    // Adicionar arquivo na feature
    fs.writeFileSync(path.join(tmpDir, 'feature.ts'), 'export const f = 1;\n');
    execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "feature"', { cwd: tmpDir, stdio: 'pipe' });

    // Obter branch padrão (main ou master)
    const defaultBranch = (() => {
      try {
        execSync('git rev-parse --verify main', { cwd: tmpDir, stdio: 'pipe' });
        return 'main';
      } catch {
        return 'master';
      }
    })();

    const diff = analyzer.getDiffAgainst(defaultBranch);
    expect(diff).toContain('feature.ts');
  });

  // ── Edge: diretório sem git ──

  test('deve retornar arrays vazios em diretório sem git', () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
    const nonGitAnalyzer = new DiffAnalyzer(nonGit);

    expect(nonGitAnalyzer.getStagedFiles()).toEqual([]);
    expect(nonGitAnalyzer.getModifiedFiles()).toEqual([]);
    expect(nonGitAnalyzer.getChangedFiles()).toEqual([]);
    expect(nonGitAnalyzer.getLastCommitFiles()).toEqual([]);

    fs.rmSync(nonGit, { recursive: true });
  });
});
