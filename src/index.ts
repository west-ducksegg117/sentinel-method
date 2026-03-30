export { Sentinel } from './sentinel';
export { BaseValidator } from './validators/base';
export { TestingValidator } from './validators/testing';
export { SecurityValidator } from './validators/security';
export { PerformanceValidator } from './validators/performance';
export { MaintainabilityValidator } from './validators/maintainability';
export type { HalsteadMetrics } from './validators/maintainability';
export { DependencyValidator } from './validators/dependency';
export { DocumentationValidator } from './validators/documentation';
export { CodeStyleValidator } from './validators/code-style';
export { ArchitectureValidator } from './validators/architecture';
export type { ArchitectureMetrics } from './validators/architecture';
export { ApiContractValidator } from './validators/api-contract';
export type { ApiContractMetrics } from './validators/api-contract';
export { AccessibilityValidator } from './validators/accessibility';
export type { AccessibilityMetrics } from './validators/accessibility';
export { I18nValidator } from './validators/i18n';
export type { I18nMetrics } from './validators/i18n';
export { ErrorHandlingValidator } from './validators/error-handling';
export type { ErrorHandlingMetrics } from './validators/error-handling';
export { TypeSafetyValidator } from './validators/type-safety';
export type { TypeSafetyMetrics } from './validators/type-safety';
export { DeadCodeValidator } from './validators/dead-code';
export type { DeadCodeMetrics } from './validators/dead-code';
export { Reporter } from './reporter';
export { ConfigLoader } from './config';
export type { ConfigValidationResult } from './config';
export { FileCollector } from './file-collector';
export { SentinelIgnore } from './ignore';
export { ResultCache } from './cache';
export { HookManager } from './hooks';
export { DiffAnalyzer } from './diff';
export type { CacheEntry, CachedValidatorResult } from './cache';
export { PluginLoader } from './plugin-loader';
export type { SentinelPlugin, PluginRegistry } from './plugin-loader';

// Sprint 5 — Intelligence Layer
export { BusinessGates } from './business-gates';
export type {
  BusinessDomain,
  BusinessGateConfig,
  BusinessGateThreshold,
  BusinessGateResult,
  BusinessGateEvaluation,
  RiskSummary,
  ScoreInput,
} from './business-gates';

export { RiskBudget } from './risk-budget';
export type {
  RiskBudgetConfig,
  DeployRiskAssessment,
  FindingSummary,
  SprintBudgetStatus,
  ApprovalRequest,
  RiskTrend,
  Severity,
} from './risk-budget';

export { FitnessEngine } from './fitness-functions';
export type {
  FitnessFunctionType,
  FitnessFunctionRule,
  FitnessEvaluation,
  FitnessViolation,
  FitnessReport,
  FitnessInput,
  FileMetrics,
  DependencyEdge,
  ModuleCoverage,
  PerformanceMetric,
} from './fitness-functions';

export type {
  SentinelConfig,
  ValidationResult,
  ValidatorResult,
  ValidationIssue,
  SecurityIssue,
  PerformanceIssue,
  TestingMetrics,
  SecurityMetrics,
  PerformanceMetrics,
  MaintainabilityMetrics,
  ValidatorOptions,
  ReportFormat,
} from './types';
