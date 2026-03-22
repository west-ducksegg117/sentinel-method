# 🛡️ Sentinel Method v2.0

A production-grade quality gate framework for AI-generated code validation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.1+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-263_passing-brightgreen.svg)](#testing)
[![Coverage](https://img.shields.io/badge/Coverage-96%25-brightgreen.svg)](#testing)

## Overview

Sentinel Method is a CI/CD-integrated framework that validates AI-generated code against production standards before it reaches your codebase. It enforces testing coverage, security scanning (OWASP/CWE mapped), performance benchmarks, maintainability checks (with Halstead metrics), dependency health, documentation coverage, and code style consistency.

Developed by **Camilo Girardelli** — IEEE Senior Member, Senior Software Architect, CTO at Girardelli Tecnologia.

## The 7 Validators

| Validator | What it checks | Key metrics |
|---|---|---|
| **Testing Coverage** | Test files, assertions, edge cases | Quality score 0-100 |
| **Security Scanning** | Injection, XSS, secrets, weak crypto | OWASP A01-A07, 12 CWEs |
| **Performance Benchmarks** | Complexity, memory, async patterns | Cyclomatic complexity |
| **Maintainability Checker** | Function length, docs, duplication | Halstead V/D/E, MI index |
| **Dependency Analysis** | Unused deps, wildcards, lock file | Package health score |
| **Documentation Coverage** | JSDoc, README, CHANGELOG | Coverage % |
| **Code Style** | Indentation, trailing WS, console.log | Consistency score |

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Sentinel Method v2.0                     │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Testing │ │Security │ │Performanc│ │Maintainabilit│   │
│  │ Quality │ │Scanning │ │Benchmarks│ │   Checker    │   │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └──────┬───────┘   │
│       │           │           │               │            │
│  ┌────┴────┐ ┌────┴────┐ ┌───┴────┐                      │
│  │Dependenc│ │Document.│ │  Code  │                      │
│  │Analysis │ │Coverage │ │ Style  │                      │
│  └────┬────┘ └────┬────┘ └───┬────┘                      │
│       │           │          │                            │
│       └───────────┴──────┬───┘                            │
│                          │                                │
│              ┌───────────▼───────────┐                    │
│              │   BaseValidator       │  ← Template Method │
│              │   + FileCollector     │  ← Cached I/O      │
│              │   + SentinelIgnore    │  ← .sentinelignore  │
│              └───────────┬───────────┘                    │
│                          │                                │
│              ┌───────────▼───────────┐                    │
│              │   Sentinel Engine     │  ← Promise.all()   │
│              │   + PluginLoader      │  ← Extensible      │
│              │   + Error Recovery    │  ← Resilient       │
│              └───────────┬───────────┘                    │
│                          │                                │
│              ┌───────────▼───────────┐                    │
│              │  Reporter + CLI       │                    │
│              │  (JSON/MD/HTML/CLI)   │                    │
│              └───────────────────────┘                    │
└───────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install sentinel-method
```

### CLI Usage

```bash
# Validate current directory
npx sentinel validate

# Validate with custom thresholds
npx sentinel validate ./src -t 80 -m 75 -s strict

# JSON output for CI pipelines
npx sentinel validate ./src --json

# Markdown report
npx sentinel validate ./src -f markdown

# List available validators
npx sentinel list
```

### CLI Options

```
sentinel validate [directory] [options]

Options:
  -f, --format <format>              Report format: json, markdown, console, html (default: console)
  -t, --testing-threshold <n>        Minimum testing score 0-100 (default: 80)
  -s, --security-level <level>       Security: strict, moderate, permissive (default: strict)
  -p, --performance-target <target>  Performance: optimal, good, acceptable (default: optimal)
  -m, --maintainability-score <n>    Minimum maintainability score 0-100 (default: 75)
  --fail-on-warnings                 Treat warnings as failures
  --json                             Output raw JSON (shorthand for -f json)
  --min-severity <level>             Filter issues: error, warning, info
  -w, --watch                        Watch mode — re-run on file changes
```

### Initialize Project

```bash
# Generate .sentinelrc.json and .sentinelignore
npx sentinel init

# Overwrite existing files
npx sentinel init --force
```

### Programmatic Usage

```typescript
import { Sentinel } from 'sentinel-method';

const sentinel = new Sentinel({
  testingThreshold: 80,
  securityLevel: 'strict',
  performanceTarget: 'optimal',
  maintainabilityScore: 75,
});

const result = await sentinel.validate('./src');

if (result.success) {
  console.log('Quality gate passed!');
} else {
  console.log(`Failed: ${result.summary.failedChecks} validators failed`);
  process.exit(1);
}
```

### Custom Validators (Plugin System)

```typescript
import { Sentinel, BaseValidator, PluginLoader } from 'sentinel-method';
import type { SentinelPlugin, ValidatorResult, SentinelConfig } from 'sentinel-method';

// 1. Create a custom validator
class LicenseValidator extends BaseValidator {
  readonly name = 'License Check';

  validate(sourceDir: string): ValidatorResult {
    const files = this.getAllFiles(sourceDir);
    const hasLicense = files.some(f => f.includes('LICENSE'));

    return this.buildResult(
      hasLicense,
      hasLicense ? [] : [this.createIssue('error', 'NO_LICENSE', 'Missing LICENSE file')],
      { licenseFound: hasLicense },
    );
  }
}

// 2. Register as plugin
const sentinel = new Sentinel();
sentinel.registerValidator(new LicenseValidator({
  testingThreshold: 80,
  securityLevel: 'strict',
  performanceTarget: 'optimal',
  maintainabilityScore: 75,
}));

// 3. Or load plugins from a directory
const loader = new PluginLoader();
loader.loadFromDirectory('./plugins');
```

### Configuration File

Create a `.sentinelrc.json`:

```json
{
  "testingThreshold": 80,
  "securityLevel": "strict",
  "performanceTarget": "optimal",
  "maintainabilityScore": 75,
  "excludePatterns": ["node_modules", "dist", "coverage"],
  "reporters": ["json", "markdown"],
  "failOnWarnings": false
}
```

### .sentinelignore

Create a `.sentinelignore` file (`.gitignore` syntax) to exclude files from analysis:

```gitignore
# Generated code
generated/
*.auto.ts

# Vendor libraries
vendor/

# Specific files
legacy-module.js
```

Default exclusions (always active): `node_modules/`, `.git/`, `dist/`, `coverage/`, `.nyc_output/`, `.*` (hidden files/dirs).

The `excludePatterns` in `.sentinelrc.json` also feeds into the ignore system.

## CI/CD Integration

### GitHub Actions

```yaml
name: Sentinel Quality Gate
on: [push, pull_request]

jobs:
  sentinel:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npx sentinel validate ./src --json > sentinel-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: sentinel-report-node${{ matrix.node-version }}
          path: sentinel-report.json
```

### GitLab CI

```yaml
sentinel:
  stage: validate
  image: node:20
  script:
    - npm ci
    - npx sentinel validate ./src -f markdown > sentinel-report.md
  artifacts:
    paths:
      - sentinel-report.md
```

## Security: OWASP/CWE Coverage

The Security Scanning validator maps findings to OWASP Top 10 (2021) and CWE:

| Detection | CWE | OWASP Category |
|---|---|---|
| eval() / Function() | CWE-94, CWE-95 | A03:2021 Injection |
| SQL template injection | CWE-89 | A03:2021 Injection |
| Command injection | CWE-78 | A03:2021 Injection |
| innerHTML / document.write | CWE-79 | A07:2021 XSS |
| Hardcoded passwords/tokens | CWE-798 | A02:2021 Crypto Failures |
| Hardcoded API keys | CWE-321 | A02:2021 Crypto Failures |
| MD5/SHA-1 usage | CWE-327 | A02:2021 Crypto Failures |
| Path traversal | CWE-22 | A01:2021 Access Control |
| Unsafe deserialization | CWE-502 | A04:2021 Insecure Design |

## Halstead Complexity Metrics

The Maintainability Checker includes Halstead software science metrics:

- **Volume (V)**: Information content of the code — `N × log₂(η)`
- **Difficulty (D)**: How hard the code is to understand — `(η₁/2) × (N₂/η₂)`
- **Effort (E)**: Mental effort to comprehend — `D × V`
- **Estimated Time**: Development time in seconds — `E / 18`
- **Estimated Bugs**: Bug prediction — `V / 3000`

These are integrated into the Maintainability Index with a 20% weight.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Quality gate passed |
| `1` | Quality gate failed |
| `2` | Runtime error |

## Testing

```bash
npm test                # Run all tests
npm run test:coverage   # With coverage report
npm run test:watch      # Watch mode
```

Current metrics: **263 tests**, 96%+ statements, 87%+ branches, 96%+ functions.

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run lint         # ESLint check
npm run type-check   # TypeScript strict mode
npm run validate     # All checks: lint + type-check + test
```

## API Reference

### Core Classes

```typescript
class Sentinel {
  constructor(config?: Partial<SentinelConfig>);
  validate(sourceDir: string): Promise<ValidationResult>;
  registerValidator(validator: BaseValidator): void;
  getValidators(): BaseValidator[];
}

abstract class BaseValidator {
  abstract readonly name: string;
  abstract validate(sourceDir: string): ValidatorResult;
  protected getAllFiles(dir: string): string[];
  protected getSourceFiles(dir: string): string[];
  protected createIssue(severity, code, message, extras?): ValidationIssue;
  protected buildResult(passed, issues, details, score?, threshold?): ValidatorResult;
}

class FileCollector {
  constructor(sourceDir: string, excludePatterns?: string[]);
  collect(): string[];
  getSourceFiles(): string[];
  getTestFiles(): string[];
  readFile(filePath: string): string;  // cached
  clearCache(): void;
  getIgnore(): SentinelIgnore;
}

class SentinelIgnore {
  constructor(patterns?: string[]);
  static fromFile(dir: string): SentinelIgnore;
  addPatterns(patterns: string[]): void;
  isIgnored(relativePath: string): boolean;
  filter(paths: string[], baseDir: string): string[];
  getPatterns(): string[];
}

class PluginLoader {
  register(plugin: SentinelPlugin): void;
  loadFromDirectory(dirPath: string): number;
  createValidators(config: SentinelConfig): BaseValidator[];
}
```

### Validators

| Class | Description |
|---|---|
| `TestingValidator` | Test coverage, assertions, edge cases |
| `SecurityValidator` | OWASP-mapped vulnerability scanning |
| `PerformanceValidator` | Complexity, memory, async patterns |
| `MaintainabilityValidator` | Halstead metrics, MI index, docs |
| `DependencyValidator` | Package.json health analysis |
| `DocumentationValidator` | JSDoc, README, CHANGELOG coverage |
| `CodeStyleValidator` | Style consistency enforcement |

## License

MIT License 2026 — Camilo Girardelli / Girardelli Tecnologia

## Author

**Camilo Girardelli**
- IEEE Senior Member
- Senior Software Architect
- CTO at Girardelli Tecnologia
