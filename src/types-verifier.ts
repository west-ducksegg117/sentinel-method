/**
 * Sub-Agent Verification Protocol — Types
 *
 * Tipos para o sistema de verificação adversarial independente.
 * Inspirado no padrão sub-agent verification do pptx skill da Anthropic.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { ValidationIssue } from './types';

// ═══════════════════════════════════════════════════════════════
// CONFIDENCE LEVELS
// ═══════════════════════════════════════════════════════════════

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

// ═══════════════════════════════════════════════════════════════
// VERIFIER TYPES
// ═══════════════════════════════════════════════════════════════

export interface VerifierIssue extends ValidationIssue {
  /** Confiança do verifier neste finding */
  confidence: ConfidenceLevel;
  /** Heurística que gerou este finding */
  heuristic: string;
}

export interface VerifierResult {
  /** Nome do verifier */
  verifier: string;
  /** Issues encontradas independentemente */
  issues: VerifierIssue[];
  /** Score calculado independentemente */
  score: number;
  /** Detalhes específicos do domínio */
  details: Record<string, unknown>;
  /** Tempo de execução em ms */
  duration: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSENSUS TYPES
// ═══════════════════════════════════════════════════════════════

export type ConsensusZone = 'agreement' | 'disagreement' | 'only_primary' | 'only_verifier';

export interface ConsensusIssue {
  /** Zone de consenso */
  zone: ConsensusZone;
  /** Issue do primary (se existir) */
  primaryIssue?: ValidationIssue;
  /** Issue do verifier (se existir) */
  verifierIssue?: VerifierIssue;
  /** Confiança do consenso */
  confidence: ConfidenceLevel;
  /** Explicação de por que esta zona foi atribuída */
  reasoning: string;
}

export interface UncertaintyZone {
  /** Descrição da área de discordância */
  description: string;
  /** Issue do primary */
  primaryIssue: ValidationIssue;
  /** Issue (ou ausência) do verifier */
  verifierIssue?: VerifierIssue;
  /** Recomendação: review manual */
  recommendation: string;
}

export interface ConsensusResult {
  /** Validator/Verifier comparados */
  domain: string;
  /** Issues em Agreement (ambos concordam) — alta confiança */
  agreements: ConsensusIssue[];
  /** Issues em Disagreement (um vê, outro não) — requer atenção */
  disagreements: ConsensusIssue[];
  /** Issues só do Primary validator */
  onlyPrimary: ConsensusIssue[];
  /** Issues só do Verifier */
  onlyVerifier: ConsensusIssue[];
  /** Zonas de incerteza que precisam review humano */
  uncertaintyZones: UncertaintyZone[];
  /** Score do Primary */
  primaryScore: number;
  /** Score do Verifier */
  verifierScore: number;
  /** Score de consenso (ponderado) */
  consensusScore: number;
  /** Nível de concordância geral (0-1) */
  agreementRatio: number;
  /** Duração total em ms */
  duration: number;
}
