// Re-exports from shared evaluation module. All logic lives in @evaluation/judge-personas.

import {
  getPersona,
  pickJudges,
  buildEvaluationPrompt,
  parseEvaluationOutput,
} from '@evaluation/judge-personas.js';
import type { JudgePersonaConfig } from '@evaluation/judge-personas.js';

export type { JudgePersonaConfig };
export { getPersona, pickJudges, buildEvaluationPrompt, parseEvaluationOutput };

/** @deprecated Use pickJudges() — kept for backward compatibility. */
export function pickJudgePair(): [JudgePersonaConfig, JudgePersonaConfig] {
  const judges = pickJudges();
  return [judges[0]!, judges[1]!];
}
