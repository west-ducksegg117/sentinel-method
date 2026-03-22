# Changelog

All notable changes to Sentinel Method will be documented in this file.

## [2.0.0] - 2026-03-22

### Added
- **CLI binary** (`sentinel`) with Commander.js — validate, list commands
- **BaseValidator** abstract class — Template Method pattern, eliminates code duplication
- **FileCollector** — centralized I/O with content caching
- **PluginLoader** — plugin system with programmatic and directory-based registration
- **DependencyValidator** — package.json health: unused deps, wildcards, lock file
- **DocumentationValidator** — JSDoc coverage, README/CHANGELOG presence
- **CodeStyleValidator** — indentation, trailing whitespace, console.log, long lines
- **OWASP/CWE mapping** — 12 CWE IDs across OWASP Top 10 categories
- **Halstead metrics** — volume, difficulty, effort, estimated time/bugs
- **Parallel execution** — Promise.all() for all validators
- **Score breakdown** — tabela de scores, grades A-F, aggregate score
- **GitHub Actions CI** — matrix strategy Node 18/20
- 213 tests with 96%+ coverage

### Changed
- Rewritten Sentinel engine with extensible validator array
- All 4 original validators refactored to extend BaseValidator
- SecurityValidator uses structured detection rules with CWE/OWASP mapping
- MaintainabilityValidator incorporates Halstead metrics (20% weight)
- Reporter supports console format
- Types: ValidatorResult.details now `Record<string, any>`

## [1.0.0] - 2026-03-22

### Added
- Initial release with 4 validators: Testing, Security, Performance, Maintainability
- JSON and Markdown report formats
- Configuration via .sentinelrc.json
- TypeScript strict mode
