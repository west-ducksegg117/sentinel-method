import { FileCollector } from '../src/file-collector';
import * as fs from 'fs';
import * as path from 'path';

describe('FileCollector', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join('/tmp', 'sentinel-test-project-collector');
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  // ── Coleta básica ──

  test('deve coletar arquivos de um diretório', () => {
    fs.writeFileSync(path.join(testDir, 'app.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(testDir, 'utils.ts'), 'export const y = 2;');

    const collector = new FileCollector(testDir);
    const files = collector.collect();

    expect(files).toHaveLength(2);
  });

  test('deve coletar arquivos de subdiretórios recursivamente', () => {
    const subDir = path.join(testDir, 'src', 'utils');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(subDir, 'helper.ts'), 'export {};');

    const collector = new FileCollector(testDir);
    const files = collector.collect();

    expect(files).toHaveLength(2);
    expect(files.some(f => f.includes('helper.ts'))).toBe(true);
  });

  test('deve retornar cache na segunda chamada', () => {
    fs.writeFileSync(path.join(testDir, 'cached.ts'), 'const x = 1;');

    const collector = new FileCollector(testDir);
    const first = collector.collect();
    const second = collector.collect();

    expect(first).toBe(second); // mesma referência
  });

  // ── Filtragem ──

  test('deve ignorar node_modules', () => {
    const nmDir = path.join(testDir, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(testDir, 'app.ts'), 'export {};');

    const collector = new FileCollector(testDir);
    expect(collector.collect()).toHaveLength(1);
  });

  test('deve ignorar diretórios ocultos', () => {
    const hiddenDir = path.join(testDir, '.hidden');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.writeFileSync(path.join(hiddenDir, 'secret.ts'), 'const s = 1;');
    fs.writeFileSync(path.join(testDir, 'visible.ts'), 'export {};');

    const collector = new FileCollector(testDir);
    expect(collector.collect()).toHaveLength(1);
  });

  test('deve ignorar dist e coverage', () => {
    for (const dir of ['dist', 'coverage']) {
      fs.mkdirSync(path.join(testDir, dir), { recursive: true });
      fs.writeFileSync(path.join(testDir, dir, 'output.js'), '');
    }
    fs.writeFileSync(path.join(testDir, 'src.ts'), 'export {};');

    const collector = new FileCollector(testDir);
    expect(collector.collect()).toHaveLength(1);
  });

  // ── Filtros por tipo ──

  test('deve separar source files de test files', () => {
    fs.writeFileSync(path.join(testDir, 'service.ts'), 'export class Service {}');
    fs.writeFileSync(path.join(testDir, 'service.test.ts'), 'test("ok", () => {});');
    fs.writeFileSync(path.join(testDir, 'utils.spec.ts'), 'describe("utils", () => {});');
    fs.writeFileSync(path.join(testDir, 'types.d.ts'), 'declare module "x";');

    const collector = new FileCollector(testDir);

    expect(collector.getSourceFiles()).toHaveLength(1);
    expect(collector.getTestFiles()).toHaveLength(2);
    expect(collector.getCodeFiles()).toHaveLength(4); // inclui .d.ts pois é .ts
  });

  test('deve contar arquivos corretamente', () => {
    fs.writeFileSync(path.join(testDir, 'a.ts'), '');
    fs.writeFileSync(path.join(testDir, 'b.ts'), '');
    fs.writeFileSync(path.join(testDir, 'a.test.ts'), '');
    fs.writeFileSync(path.join(testDir, 'readme.md'), '');

    const collector = new FileCollector(testDir);

    expect(collector.totalFiles).toBe(4);
    expect(collector.sourceFileCount).toBe(2);
    expect(collector.testFileCount).toBe(1);
  });

  // ── Leitura com cache ──

  test('deve ler conteúdo de arquivo', () => {
    const filePath = path.join(testDir, 'content.ts');
    fs.writeFileSync(filePath, 'export const answer = 42;');

    const collector = new FileCollector(testDir);
    const content = collector.readFile(filePath);

    expect(content).toContain('answer = 42');
  });

  test('deve cachear conteúdo na segunda leitura', () => {
    const filePath = path.join(testDir, 'cached-content.ts');
    fs.writeFileSync(filePath, 'const original = true;');

    const collector = new FileCollector(testDir);
    const first = collector.readFile(filePath);

    // Mesmo que o arquivo mude no disco, retorna do cache
    fs.writeFileSync(filePath, 'const modified = true;');
    const second = collector.readFile(filePath);

    expect(first).toBe(second);
    expect(second).toContain('original');
  });

  test('deve ler linhas de um arquivo', () => {
    const filePath = path.join(testDir, 'lines.ts');
    fs.writeFileSync(filePath, 'line1\nline2\nline3');

    const collector = new FileCollector(testDir);
    const lines = collector.readLines(filePath);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('line1');
    expect(lines[2]).toBe('line3');
  });

  test('deve limpar cache quando solicitado', () => {
    const filePath = path.join(testDir, 'clearable.ts');
    fs.writeFileSync(filePath, 'version 1');

    const collector = new FileCollector(testDir);
    collector.readFile(filePath);

    // Alterar conteúdo e limpar cache
    fs.writeFileSync(filePath, 'version 2');
    collector.clearCache();

    const content = collector.readFile(filePath);
    expect(content).toContain('version 2');
  });

  // ── Utilitários ──

  test('deve verificar se arquivo existe no diretório', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

    const collector = new FileCollector(testDir);

    expect(collector.hasFile('package.json')).toBe(true);
    expect(collector.hasFile('nonexistent.json')).toBe(false);
  });

  test('deve ler arquivo relativo ao diretório raiz', () => {
    fs.writeFileSync(path.join(testDir, 'config.json'), '{"key": "value"}');

    const collector = new FileCollector(testDir);

    expect(collector.readRelative('config.json')).toContain('"key"');
    expect(collector.readRelative('missing.json')).toBeNull();
  });

  // ── Edge cases ──

  test('deve lidar com diretório vazio', () => {
    const collector = new FileCollector(testDir);

    expect(collector.collect()).toHaveLength(0);
    expect(collector.totalFiles).toBe(0);
    expect(collector.sourceFileCount).toBe(0);
  });

  test('deve lidar com arquivos não-código', () => {
    fs.writeFileSync(path.join(testDir, 'readme.md'), '# Hello');
    fs.writeFileSync(path.join(testDir, 'image.png'), 'binary');
    fs.writeFileSync(path.join(testDir, 'data.json'), '{}');

    const collector = new FileCollector(testDir);

    expect(collector.totalFiles).toBe(3);
    expect(collector.sourceFileCount).toBe(0);
    expect(collector.getCodeFiles()).toHaveLength(0);
  });
});
