export interface SentinelConfig {
  testingThreshold: number;
  securityLevel: 'strict' | 'moderate' | 'permissive';
  performanceTarget: 'optimal' | 'good' | 'acceptable';
  maintainabilityScore: number;
  excludePatterns?: string[];
  reporters?: ('json' | 'markdown' | 'console')[];
  failOnWarnings?: boolean;
}

export interface ValidationResult {
  success: boolean;
  timestamp: string;
  sourceDirectory: string;
  summary: {
    totalFiles: number;
    passedChecks: number;
    failedChecks: number;
    warnings: number;
  };
  results: ValidatorResult[];
  report: string;
  exitCode: number;
}

export interface ValidatorResult {
  validator: string;
  passed: boolean;
  score?: number;
  threshold?: number;
  issues: ValidationIssue[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface SecurityIssue extends ValidationIssue {
  type: 'injection' | 'hardcoded-secret' | 'vulnerability' | 'exposure';
  cwe?: string;
}

export interface PerformanceIssue extends ValidationIssue {
  type: 'complexity' | 'memory' | 'async' | 'query-pattern';
  impact: 'low' | 'medium' | 'high';
}

export interface TestingMetrics {
  coverage: number;
  assertions: number;
  testFiles: number;
  edgeCases: number;
  qualityScore: number;
}

export interface SecurityMetrics {
  vulnerabilitiesFound: number;
  injectionRisks: number;
  hardcodedSecrets: number;
  dependencyIssues: number;
  securityScore: number;
}

export interface PerformanceMetrics {
  avgComplexity: number;
  memoryIssues: number;
  asyncIssues: number;
  queryPatterns: number;
  performanceScore: number;
}

export interface MaintainabilityMetrics {
  cyclomaticComplexity: number;
  functionLength: number;
  namingQuality: number;
  documentationCoverage: number;
  duplicationPercentage: number;
  maintainabilityIndex: number;
}

export interface ValidatorOptions {
  config: SentinelConfig;
  sourceDir?: string;
}

export interface ReportFormat {
  type: 'json' | 'markdown' | 'html' | 'console';
  content: string;
  timestamp: string;
}
