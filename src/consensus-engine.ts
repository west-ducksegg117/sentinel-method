/**
 * ConsensusEngine — Compara Primary Validator vs Adversarial Verifier
 *
 * Recebe ValidatorResult + VerifierResult e produz ConsensusResult:
 * - Agreement: ambos encontraram o mesmo issue → alta confiança
 * - Disagreement: um encontrou, outro não → requer atenção humana
 * - Only-Primary: só o Validator detectou
 * - Only-Verifier: só o Verifier detectou (possível falso negativo do Primary)
 *
 * O diferencial do Nexus: dois scans independentes mostrando onde discordam.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { ValidatorResult, ValidationIssue } from './types';
import {
  VerifierResult,
  VerifierIssue,
  ConsensusResult,
  ConsensusIssue,
  UncertaintyZone,
  ConfidenceLevel,
} from './types-verifier';

// ═══════════════════════════════════════════════════════════════
// MATCHING CONFIG
// ═══════════════════════════════════════════════════════════════

interface MatchConfig {
  /** Threshold de similaridade para considerar match (0-1) */
  matchThreshold: number;
  /** Peso do file match */
  fileWeight: number;
  /** Peso do line proximity */
  lineWeight: number;
  /** Peso do severity match */
  severityWeight: number;
  /** Peso do code/type match */
  codeWeight: number;
  /** Distância máxima de linhas para considerar "mesmo local" */
  lineProximity: number;
}

const DEFAULT_MATCH_CONFIG: MatchConfig = {
  matchThreshold: 0.5,
  fileWeight: 0.4,
  lineWeight: 0.2,
  severityWeight: 0.15,
  codeWeight: 0.25,
  lineProximity: 10,
};

// ═══════════════════════════════════════════════════════════════
// CONSENSUS ENGINE
// ═══════════════════════════════════════════════════════════════

export class ConsensusEngine {
  private config: MatchConfig;

  constructor(config?: Partial<MatchConfig>) {
    this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
  }

  /**
   * Compara Primary vs Verifier e produz resultado de consenso.
   */
  analyze(
    primaryResult: ValidatorResult,
    verifierResult: VerifierResult,
    domain: string,
  ): ConsensusResult {
    const start = Date.now();

    const primaryIssues = [...primaryResult.issues];
    const verifierIssues = [...verifierResult.issues];

    // Track which issues have been matched
    const matchedPrimary = new Set<number>();
    const matchedVerifier = new Set<number>();

    const agreements: ConsensusIssue[] = [];
    const disagreements: ConsensusIssue[] = [];

    // ── Phase 1: Find matches (agreements) ──
    for (let pi = 0; pi < primaryIssues.length; pi++) {
      let bestMatch = -1;
      let bestScore = 0;

      for (let vi = 0; vi < verifierIssues.length; vi++) {
        if (matchedVerifier.has(vi)) continue;

        const score = this.calculateMatchScore(primaryIssues[pi]!, verifierIssues[vi]!);
        if (score > bestScore && score >= this.config.matchThreshold) {
          bestScore = score;
          bestMatch = vi;
        }
      }

      if (bestMatch >= 0) {
        matchedPrimary.add(pi);
        matchedVerifier.add(bestMatch);

        const confidence = this.scoreToConfidence(bestScore);
        agreements.push({
          zone: 'agreement',
          primaryIssue: primaryIssues[pi],
          verifierIssue: verifierIssues[bestMatch],
          confidence,
          reasoning: `Both Primary and Verifier detected similar issue (match score: ${(bestScore * 100).toFixed(0)}%)`,
        });
      }
    }

    // ── Phase 2: Unmatched issues ──
    const onlyPrimary: ConsensusIssue[] = [];
    const onlyVerifier: ConsensusIssue[] = [];
    const uncertaintyZones: UncertaintyZone[] = [];

    for (let pi = 0; pi < primaryIssues.length; pi++) {
      if (matchedPrimary.has(pi)) continue;

      const issue = primaryIssues[pi]!;
      onlyPrimary.push({
        zone: 'only_primary',
        primaryIssue: issue,
        confidence: issue.severity === 'error' ? 'medium' : 'low',
        reasoning: 'Only detected by Primary Validator. Verifier did not flag this issue.',
      });

      // High-severity unmatched → uncertainty zone
      if (issue.severity === 'error') {
        uncertaintyZones.push({
          description: `Primary found '${issue.code}' but Verifier missed it`,
          primaryIssue: issue,
          recommendation: 'Manual review recommended. This could be a true positive missed by the Verifier, or a false positive from the Primary.',
        });
      }
    }

    for (let vi = 0; vi < verifierIssues.length; vi++) {
      if (matchedVerifier.has(vi)) continue;

      const issue = verifierIssues[vi]!;
      onlyVerifier.push({
        zone: 'only_verifier',
        verifierIssue: issue,
        confidence: issue.confidence,
        reasoning: 'Only detected by Adversarial Verifier. Primary Validator missed this.',
      });

      // Verifier-only findings are particularly important — potential false negatives
      if (issue.severity === 'error' || issue.confidence === 'high') {
        uncertaintyZones.push({
          description: `Verifier found '${issue.code}' that Primary missed`,
          primaryIssue: { severity: 'info', code: 'NOT_DETECTED', message: 'Not detected by Primary Validator' },
          verifierIssue: issue,
          recommendation: 'IMPORTANT: Adversarial Verifier found an issue the Primary missed. This is exactly what sub-agent verification is designed to catch.',
        });
      }
    }

    // ── Phase 3: Calculate consensus score ──
    const primaryScore = primaryResult.score ?? 100;
    const verifierScore = verifierResult.score;

    // Consensus score weighs agreements more heavily
    const totalIssues = agreements.length + onlyPrimary.length + onlyVerifier.length;
    const agreementRatio = totalIssues > 0 ? agreements.length / totalIssues : 1;

    // Score: weighted average + penalty for disagreements
    const consensusScore = Math.round(
      (primaryScore * 0.5 + verifierScore * 0.5) -
      (disagreements.length * 5) -
      (uncertaintyZones.length * 3),
    );

    return {
      domain,
      agreements,
      disagreements,
      onlyPrimary,
      onlyVerifier,
      uncertaintyZones,
      primaryScore,
      verifierScore,
      consensusScore: Math.max(0, Math.min(100, consensusScore)),
      agreementRatio,
      duration: Date.now() - start,
    };
  }

  // ── Matching Logic ──

  private calculateMatchScore(primary: ValidationIssue, verifier: VerifierIssue): number {
    let score = 0;

    // File match (exact)
    if (primary.file && verifier.file) {
      if (primary.file === verifier.file) {
        score += this.config.fileWeight;
      } else if (this.sameFileName(primary.file, verifier.file)) {
        score += this.config.fileWeight * 0.5;
      }
    }

    // Line proximity
    if (primary.line && verifier.line) {
      const distance = Math.abs(primary.line - verifier.line);
      if (distance <= this.config.lineProximity) {
        score += this.config.lineWeight * (1 - distance / this.config.lineProximity);
      }
    }

    // Severity match
    if (primary.severity === verifier.severity) {
      score += this.config.severityWeight;
    } else if (
      (primary.severity === 'error' && verifier.severity === 'warning') ||
      (primary.severity === 'warning' && verifier.severity === 'error')
    ) {
      score += this.config.severityWeight * 0.5;
    }

    // Code similarity (partial match on code prefix or keywords)
    if (this.codesRelated(primary.code, verifier.code)) {
      score += this.config.codeWeight;
    } else if (this.messagesOverlap(primary.message, verifier.message)) {
      score += this.config.codeWeight * 0.5;
    }

    return score;
  }

  private sameFileName(a: string, b: string): boolean {
    const nameA = a.split('/').pop() || a;
    const nameB = b.split('/').pop() || b;
    return nameA === nameB;
  }

  private codesRelated(codeA: string, codeB: string): boolean {
    // Extract category from code (e.g., "INJECTION_EVAL" → "INJECTION")
    const categoryA = codeA.split('_')[0]?.toLowerCase() || '';
    const categoryB = codeB.split('_')[0]?.toLowerCase() || '';

    // Direct match
    if (codeA === codeB) return true;

    // Category match
    if (categoryA && categoryB && categoryA === categoryB) return true;

    // Related categories
    const relatedGroups = [
      ['injection', 'taint', 'sql', 'cmd', 'xss'],
      ['secret', 'credential', 'password', 'token', 'key', 'jwt'],
      ['crypto', 'weak', 'random', 'hash'],
      ['cors', 'auth', 'middleware', 'control'],
    ];

    for (const group of relatedGroups) {
      const aInGroup = group.some(g => categoryA.includes(g) || codeA.toLowerCase().includes(g));
      const bInGroup = group.some(g => categoryB.includes(g) || codeB.toLowerCase().includes(g));
      if (aInGroup && bInGroup) return true;
    }

    return false;
  }

  private messagesOverlap(msgA: string, msgB: string): boolean {
    const wordsA = new Set(msgA.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const wordsB = new Set(msgB.toLowerCase().split(/\W+/).filter(w => w.length > 3));

    let overlap = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++;
    }

    const total = Math.max(wordsA.size, wordsB.size);
    return total > 0 && overlap / total > 0.3;
  }

  private scoreToConfidence(score: number): ConfidenceLevel {
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    if (score >= 0.4) return 'low';
    return 'uncertain';
  }
}
