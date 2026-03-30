# Changelog

All notable changes to Sentinel Method will be documented in this file.

## [3.0.0] - 2026-03-25

### Added
- **Sub-Agent Verification**: Dual independent analysis (primary + adversarial) with consensus engine
- `BaseVerifier` abstract class for creating adversarial verifiers
- `SecurityVerifier` — adversarial verifier for security domain
- `ConsensusEngine` — compares primary vs adversarial findings with agreement/disagreement/uncertainty zones
- Taint flow analysis in SecurityVerifier for tracking unsanitized input propagation
- MCP integration support via `nexus-validation` server

### Changed
- All validator files refactored to max 500 lines (extracted helpers)
- Reporter split into `reporter.ts` + `formatters/html-formatter.ts`
- Dead code helpers rewritten with return-value pattern

### Fixed
- `extractFunctionBlocks` now detects callback arrow functions
- Unused imports cleaned across all validators

## [2.0.0] - 2026-03-22

### Added
- **CLI binary** (`sentinel`) with Commander.js — validate, list, init, hooks commands
- **Watch mode** (`-w`) — re-run validation on file changes with debounce
- **Severity filter** (`--min-severity`) — filter issues by error/warning/info
- **Output to file** (`-o, --output`) — save report to .json, .md, or .html
- **Init command** — scaffolds .sentinelrc.json and .sentinelignore
- **Git hooks** (`sentinel hooks --install`) — pre-commit and pre-push integration
- **ResultCache** — skip re-validation when files haven't changed (.sentinel-cache/)
- **DiffAnalyzer** — identify changed files via git for incremental validation
- **SentinelIgnore** — .gitignore-style file exclusion patterns (.sentinelignore)
- **HTML Reporter** — self-contained report with inline SVG charts and CSS
- **BaseValidator** abstract class — Template Method pattern, eliminates code duplication
- **FileCollector** — centralized I/O with content caching and .sentinelignore support
- **PluginLoader** — plugin system with programmatic and directory-based registration
- **DependencyValidator** — package.json health: unused deps, wildcards, lock file
- **DocumentationValidator** — JSDoc coverage, README/CHANGELOG presence
- **CodeStyleValidator** — indentation, trailing whitespace, console.log, long lines
- **OWASP/CWE mapping** — 12 CWE IDs across OWASP Top 10 categories
- **Halstead metrics** — volume, difficulty, effort, estimated time/bugs
- **Parallel execution** — Promise.all() for all validators
- **Error recovery** — individual validator failures don't interrupt pipeline
- **Execution timing** — duration (ms) tracked in ValidationResult
- **Score breakdown** — tabela de scores, grades A-F, aggregate score
- **Config auto-detect** — .sentinelrc.json, .sentinelrc, sentinel.config.json, package.json
- **Config schema validation** — structured errors/warnings, unknown field detection
- **GitHub Actions CI** — matrix strategy Node 18/20
- 311 tests with 96%+ coverage

### Changed
- Rewritten Sentinel engine with extensible validator array and error recovery
- All 4 original validators refactored to extend BaseValidator
- SecurityValidator uses structured detection rules with CWE/OWASP mapping
- MaintainabilityValidator incorporates Halstead metrics (20% weight)
- ConfigLoader rewritten with schema validation and auto-detect
- Reporter supports console and HTML formats
- FileCollector integrates SentinelIgnore and config excludePatterns
- Types: ValidatorResult.details now `Record<string, any>`, duration added

## [1.0.0] - 2026-03-22

### Added
- Initial release with 4 validators: Testing, Security, Performance, Maintainability
- JSON and Markdown report formats
- Configuration via .sentinelrc.json
- TypeScript strict mode
