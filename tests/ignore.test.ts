import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SentinelIgnore } from '../src/ignore';

describe('SentinelIgnore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ignore-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Construtor e padrões básicos ──

  test('deve criar instância com padrões via construtor', () => {
    const ignore = new SentinelIgnore(['*.log', 'dist/']);
    expect(ignore.getPatterns()).toEqual(['*.log', 'dist/']);
  });

  test('deve criar instância vazia sem parâmetros', () => {
    const ignore = new SentinelIgnore();
    expect(ignore.getPatterns()).toEqual([]);
  });

  // ── Padrões default via fromFile ──

  test('deve incluir padrões default ao carregar de diretório', () => {
    const ignore = SentinelIgnore.fromFile(tmpDir);
    const patterns = ignore.getPatterns();

    expect(patterns).toContain('node_modules/');
    expect(patterns).toContain('.git/');
    expect(patterns).toContain('dist/');
    expect(patterns).toContain('coverage/');
  });

  test('deve ignorar node_modules por default', () => {
    const ignore = SentinelIgnore.fromFile(tmpDir);
    expect(ignore.isIgnored('node_modules')).toBe(true);
    expect(ignore.isIgnored('node_modules/package/index.js')).toBe(true);
  });

  test('deve ignorar .git por default', () => {
    const ignore = SentinelIgnore.fromFile(tmpDir);
    expect(ignore.isIgnored('.git')).toBe(true);
    expect(ignore.isIgnored('.git/HEAD')).toBe(true);
  });

  test('deve ignorar dist e coverage por default', () => {
    const ignore = SentinelIgnore.fromFile(tmpDir);
    expect(ignore.isIgnored('dist')).toBe(true);
    expect(ignore.isIgnored('coverage')).toBe(true);
  });

  // ── Carregar .sentinelignore ──

  test('deve carregar padrões de arquivo .sentinelignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.sentinelignore'), '*.log\nbuild/\ntemp/\n');
    const ignore = SentinelIgnore.fromFile(tmpDir);
    const patterns = ignore.getPatterns();

    expect(patterns).toContain('*.log');
    expect(patterns).toContain('build/');
    expect(patterns).toContain('temp/');
  });

  test('deve ignorar comentários no .sentinelignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.sentinelignore'), '# Este é um comentário\n*.log\n# Outro comentário\nbuild/\n');
    const ignore = SentinelIgnore.fromFile(tmpDir);

    // Não deve conter comentários como padrões
    const patterns = ignore.getPatterns();
    expect(patterns.some(p => p.startsWith('#'))).toBe(false);
    expect(patterns).toContain('*.log');
  });

  test('deve ignorar linhas em branco no .sentinelignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.sentinelignore'), '\n*.log\n\n\nbuild/\n\n');
    const ignore = SentinelIgnore.fromFile(tmpDir);
    const patterns = ignore.getPatterns();

    // Deve conter apenas os defaults + *.log + build/
    expect(patterns).toContain('*.log');
    expect(patterns).toContain('build/');
  });

  test('deve funcionar sem arquivo .sentinelignore', () => {
    const ignore = SentinelIgnore.fromFile(tmpDir);
    // Deve conter apenas os padrões default (node_modules, .git, dist, coverage, .nyc_output, .*)
    expect(ignore.getPatterns()).toHaveLength(6);
  });

  test('deve ignorar diretórios ocultos (.*) por default', () => {
    const ignore = SentinelIgnore.fromFile(tmpDir);
    expect(ignore.isIgnored('.hidden')).toBe(true);
    expect(ignore.isIgnored('.env')).toBe(true);
    expect(ignore.isIgnored('.vscode')).toBe(true);
  });

  // ── Glob patterns ──

  test('deve fazer match de glob wildcard simples *.ext', () => {
    const ignore = new SentinelIgnore(['*.log']);

    expect(ignore.isIgnored('error.log')).toBe(true);
    expect(ignore.isIgnored('debug.log')).toBe(true);
    expect(ignore.isIgnored('src/app.log')).toBe(true);
    expect(ignore.isIgnored('app.ts')).toBe(false);
  });

  test('deve fazer match de diretórios com trailing /', () => {
    const ignore = new SentinelIgnore(['build/']);

    expect(ignore.isIgnored('build')).toBe(true);
    expect(ignore.isIgnored('build/output.js')).toBe(true);
    expect(ignore.isIgnored('src/build')).toBe(true);
  });

  test('deve fazer match de globstar **', () => {
    const ignore = new SentinelIgnore(['src/**/test']);

    expect(ignore.isIgnored('src/test')).toBe(true);
    expect(ignore.isIgnored('src/deep/nested/test')).toBe(true);
  });

  test('deve fazer match case-insensitive', () => {
    const ignore = new SentinelIgnore(['*.LOG']);

    expect(ignore.isIgnored('error.log')).toBe(true);
    expect(ignore.isIgnored('ERROR.LOG')).toBe(true);
  });

  test('deve fazer match de ? para caractere único', () => {
    const ignore = new SentinelIgnore(['file?.ts']);

    expect(ignore.isIgnored('file1.ts')).toBe(true);
    expect(ignore.isIgnored('fileA.ts')).toBe(true);
    expect(ignore.isIgnored('file12.ts')).toBe(false);
  });

  // ── Negação ──

  test('deve suportar negação com !', () => {
    const ignore = new SentinelIgnore(['*.log', '!important.log']);

    expect(ignore.isIgnored('error.log')).toBe(true);
    expect(ignore.isIgnored('important.log')).toBe(false);
  });

  test('negação deve re-incluir arquivo previamente ignorado', () => {
    const ignore = new SentinelIgnore(['dist/', '!dist/keep.js']);

    expect(ignore.isIgnored('dist/bundle.js')).toBe(true);
    expect(ignore.isIgnored('dist/keep.js')).toBe(false);
  });

  // ── addPatterns ──

  test('deve adicionar padrões incrementalmente', () => {
    const ignore = new SentinelIgnore();
    ignore.addPatterns(['*.log']);
    ignore.addPatterns(['*.tmp']);

    expect(ignore.getPatterns()).toContain('*.log');
    expect(ignore.getPatterns()).toContain('*.tmp');
  });

  test('deve ignorar comentários no addPatterns', () => {
    const ignore = new SentinelIgnore();
    ignore.addPatterns(['# comment', '*.log', '', '  ']);

    expect(ignore.getPatterns()).toEqual(['*.log']);
  });

  // ── filter ──

  test('deve filtrar lista de caminhos removendo ignorados', () => {
    const ignore = new SentinelIgnore(['*.log', 'dist/']);
    const files = [
      path.join(tmpDir, 'src/app.ts'),
      path.join(tmpDir, 'error.log'),
      path.join(tmpDir, 'dist/bundle.js'),
      path.join(tmpDir, 'src/utils.ts'),
    ];

    const filtered = ignore.filter(files, tmpDir);

    expect(filtered).toHaveLength(2);
    expect(filtered.some(f => f.endsWith('app.ts'))).toBe(true);
    expect(filtered.some(f => f.endsWith('utils.ts'))).toBe(true);
    expect(filtered.some(f => f.endsWith('error.log'))).toBe(false);
    expect(filtered.some(f => f.endsWith('bundle.js'))).toBe(false);
  });

  test('deve retornar todos os arquivos se nenhum padrão definido', () => {
    const ignore = new SentinelIgnore();
    const files = [
      path.join(tmpDir, 'src/app.ts'),
      path.join(tmpDir, 'src/utils.ts'),
    ];

    const filtered = ignore.filter(files, tmpDir);
    expect(filtered).toHaveLength(2);
  });

  // ── isIgnored com caminhos relativos complexos ──

  test('deve verificar match no basename quando padrão não tem /', () => {
    const ignore = new SentinelIgnore(['*.log']);
    expect(ignore.isIgnored('deep/nested/dir/error.log')).toBe(true);
  });

  test('não deve ignorar arquivos que não matcham nenhum padrão', () => {
    const ignore = new SentinelIgnore(['*.log', 'dist/']);

    expect(ignore.isIgnored('src/index.ts')).toBe(false);
    expect(ignore.isIgnored('package.json')).toBe(false);
    expect(ignore.isIgnored('tsconfig.json')).toBe(false);
  });

  // ── getPatterns ──

  test('deve retornar padrões raw incluindo negações', () => {
    const ignore = new SentinelIgnore(['*.log', '!important.log', 'dist/']);
    const patterns = ignore.getPatterns();

    expect(patterns).toEqual(['*.log', '!important.log', 'dist/']);
  });
});
