import { DependencyValidator } from '../../src/validators/dependency';
import * as fs from 'fs';
import * as path from 'path';
import { SentinelConfig } from '../../src/types';

describe('DependencyValidator', () => {
  let testDir: string;
  let config: SentinelConfig;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-project-dependency');
    fs.mkdirSync(testDir, { recursive: true });
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
    const validator = new DependencyValidator(config);
    expect(validator).toBeDefined();
    expect(validator.name).toBe('Dependency Analysis');
  });

  test('deve passar com projeto saudável', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { lodash: '^4.17.0' },
      devDependencies: { jest: '^29.0.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import _ from 'lodash';");
    fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{}');

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.validator).toBe('Dependency Analysis');
    expect(result.passed).toBe(true);
    expect(result.details.totalDependencies).toBe(1);
    expect(result.details.devDependencies).toBe(1);
  });

  // ── Dependências não utilizadas ──

  test('deve detectar dependências declaradas mas não importadas', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { lodash: '^4.17.0', axios: '^1.0.0', moment: '^2.0.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import _ from 'lodash';");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.unusedDependencies).toBe(2);
    expect(result.issues.filter(i => i.code === 'UNUSED_DEPENDENCY')).toHaveLength(2);
  });

  // ── Dependências faltantes ──

  test('deve detectar imports sem dependência no package.json', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: {},
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import express from 'express';
      import cors from 'cors';
    `);

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.missingDependencies).toBe(2);
    expect(result.issues.filter(i => i.code === 'MISSING_DEPENDENCY')).toHaveLength(2);
    expect(result.passed).toBe(false);
  });

  test('deve aceitar imports de módulos built-in do Node', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: {},
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import * as fs from 'fs';
      import * as path from 'path';
      import * as crypto from 'crypto';
    `);

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.missingDependencies).toBe(0);
  });

  test('deve aceitar imports relativos sem reportar como missing', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: {},
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import { helper } from './utils';
      import { config } from '../config';
    `);

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.missingDependencies).toBe(0);
  });

  // ── Versionamento ──

  test('deve detectar versões wildcard (*)', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { 'bad-pkg': '*' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import x from 'bad-pkg';");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.outdatedPatterns).toBe(1);
    expect(result.issues.some(i => i.code === 'WILDCARD_VERSION')).toBe(true);
  });

  test('deve detectar versão "latest"', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { 'latest-pkg': 'latest' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import x from 'latest-pkg';");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.outdatedPatterns).toBe(1);
    expect(result.issues.some(i => i.code === 'WILDCARD_VERSION')).toBe(true);
  });

  test('deve aceitar versões semver normais', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { lodash: '^4.17.21', express: '~4.18.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import _ from 'lodash';
      import express from 'express';
    `);

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.outdatedPatterns).toBe(0);
  });

  // ── Duplicatas ──

  test('deve detectar dependência duplicada em deps e devDeps', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { typescript: '^5.0.0' },
      devDependencies: { typescript: '^5.1.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import ts from 'typescript';");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'DUPLICATE_DEPENDENCY')).toBe(true);
  });

  // ── Lock file ──

  test('deve alertar quando não há lock file', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: {},
    }));

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'NO_LOCK_FILE')).toBe(true);
  });

  test('deve aceitar package-lock.json como lock file', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{}');

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.filter(i => i.code === 'NO_LOCK_FILE')).toHaveLength(0);
  });

  // ── Scoped packages ──

  test('deve reconhecer scoped packages (@scope/name)', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { '@angular/core': '^17.0.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import { Component } from '@angular/core';");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.unusedDependencies).toBe(0);
  });

  // ── Require syntax ──

  test('deve detectar imports via require()', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.0.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.js'), "const express = require('express');");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.details.unusedDependencies).toBe(0);
  });

  // ── Edge cases ──

  test('deve lidar com projeto sem package.json', () => {
    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.issues.some(i => i.code === 'NO_PACKAGE_JSON')).toBe(true);
    expect(result.details.dependencyScore).toBe(100);
  });

  test('deve lidar com package.json inválido', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), 'not json {{{');

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.code === 'INVALID_PACKAGE_JSON')).toBe(true);
  });

  test('deve calcular score corretamente com penalidades', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { unused1: '^1.0.0', unused2: '^1.0.0' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), 'export const x = 1;');

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    // 2 unused = -20 pontos → score 80
    expect(result.details.dependencyScore).toBe(80);
  });

  test('deve incluir sugestões em todas as issues', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      dependencies: { unused: '*' },
    }));
    fs.writeFileSync(path.join(testDir, 'app.ts'), "import x from 'missing-pkg';");

    const validator = new DependencyValidator(config);
    const result = validator.validate(testDir);

    const actionableIssues = result.issues.filter(
      i => ['UNUSED_DEPENDENCY', 'MISSING_DEPENDENCY', 'WILDCARD_VERSION'].includes(i.code)
    );
    for (const issue of actionableIssues) {
      expect(issue.suggestion).toBeDefined();
    }
  });
});
