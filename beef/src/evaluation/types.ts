// Shared evaluation types — used by farm pipeline and RoastEngine.

export type JudgePersona = 'ct_degen' | 'comedy_writer' | 'data_hawk' | 'brand_guardian' | 'deflation_hawk';

export interface EvaluationScores {
  savage: number;
  factual: number;
  funny: number;
  original: number;
  shareable: number;
  crypto_native: number;
  degen: number;
  timely: number;
}

export interface EvaluationResult {
  reasoning: string;
  scores: EvaluationScores;
  composite: number;
  verdict: 'stockpile' | 'discard';
  one_line_why: string;
}

export interface JudgeEvaluation {
  persona: JudgePersona;
  result: EvaluationResult;
}
