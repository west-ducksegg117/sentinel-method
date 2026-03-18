# Sentinel Method

A framework for production-grade quality assurance of AI-generated code

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Overview

Sentinel Method is a CI/CD-integrated framework that validates AI-generated code against production standards. It enforces testing coverage, security scanning, performance benchmarks, and maintainability checks before any AI-generated code reaches production. Developed by Camilo Girardelli (IEEE Senior Member, Senior Software Architect, CTO at Girardelli Tecnologia).

## The 4 Pillars

Sentinel Method is built on four core validation pillars:

1. **Testing Coverage** - Ensures comprehensive test coverage with quality assertions and edge case validation
2. **Security Scanning** - Detects vulnerability patterns, injection risks, and hardcoded secrets
3. **Performance Benchmarks** - Analyzes time complexity, memory allocation, and async patterns
4. **Maintainability Checks** - Validates cyclomatic complexity, function length, and documentation

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Sentinel Method                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │   Testing    │  │   Security   │  │Performance  │
│  │   Coverage   │  │   Scanning   │  │ Benchmarks  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│         │                  │                │       │
│         └──────────────────┼────────────────┘       │
│                            │                        │
│                  ┌─────────▼─────────┐              │
│                  │  Sentinel Engine  │              │
│                  │  (Orchestrator)   │              │
│                  └─────────┬─────────┘              │
│                            │                        │
│                  ┌─────────▼─────────┐              │
│                  │  Report Generator │              │
│                  │ (JSON/Markdown)   │              │
│                  └───────────────────┘              │
│                                                     │
│              ┌────────────────────┐                 │
│              │ Maintainability    │                 │
│              │ Checker            │                 │
│              └────────────────────┘                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install sentinel-method
```

### Basic Usage

```typescript
import { Sentinel } from 'sentinel-method';

const sentinel = new Sentinel({
  testingThreshold: 80,
  securityLevel: 'strict',
  performanceTarget: 'optimal',
  maintainabilityScore: 75,
});

const results = await sentinel.validate('./src');
const report = sentinel.generateReport(results);

console.log(report);
```

### Configuration

Create a `.sentinelrc.json` file:

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

## CI/CD Integration

### GitHub Actions

```yaml
name: Sentinel Validation
on: [push, pull_request]

jobs:
  sentinel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run validate
```

### GitLab CI

```yaml
stages:
  - validate

sentinel:
  stage: validate
  image: node:18
  script:
    - npm install
    - npm run validate
  artifacts:
    reports:
      junit: report.json
```

## Core Features

- **Automated Validation** - Run comprehensive checks with a single command
- **Configurable Thresholds** - Customize validation rules per project
- **Detailed Reporting** - Generate human-readable and machine-parseable reports
- **CI/CD Ready** - Integrates seamlessly with GitHub Actions, GitLab CI, and Jenkins
- **Type-Safe** - Built entirely in TypeScript for robust validation
- **Extensible Architecture** - Add custom validators to match your project requirements

## API Reference

### Sentinel Class

```typescript
class Sentinel {
  constructor(config: SentinelConfig);
  validate(sourceDir: string): Promise<ValidationResult>;
  runPipeline(code: string): Promise<ValidatorResult[]>;
  generateReport(results: ValidationResult): string;
}
```

### Validators

- `TestingValidator` - Validates test coverage and quality
- `SecurityValidator` - Scans for security vulnerabilities
- `PerformanceValidator` - Analyzes performance characteristics
- `MaintainabilityValidator` - Checks code maintainability metrics

## Examples

See the `examples/` directory for:
- `basic-validation.ts` - Simple usage example
- `ci-integration.ts` - CI/CD pipeline integration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run type-check
```

## License

MIT License 2026 - Camilo Girardelli / Girardelli Tecnologia

## Author

**Camilo Girardelli**
- IEEE Senior Member
- Senior Software Architect
- CTO at Girardelli Tecnologia
