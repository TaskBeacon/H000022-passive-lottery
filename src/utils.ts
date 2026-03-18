import type { ReducedTrialRow } from "psyflow-web";

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toKind(value: number): "win" | "neutral" | "loss" {
  if (value > 0) {
    return "win";
  }
  if (value < 0) {
    return "loss";
  }
  return "neutral";
}

function toSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export class ScoreTracker {
  total_score: number;

  constructor(initial_score = 0) {
    this.total_score = Number(initial_score);
  }

  update(outcome_value: number): number {
    this.total_score += Number(outcome_value);
    return this.total_score;
  }

  current(): number {
    return this.total_score;
  }
}

export interface LotteryProfileSpec {
  label: string;
  prob_a: number;
  outcome_a: number;
  outcome_b: number;
}

export interface ConditionGenerationConfig {
  seed?: number;
  enable_logging?: boolean;
  lottery_profiles?: Record<string, Partial<LotteryProfileSpec>>;
}

export interface PassiveLotteryConditionSpec {
  condition: string;
  condition_label: string;
  prob_a: number;
  outcome_a: number;
  outcome_b: number;
  outcome_value: number;
  outcome_kind: "win" | "neutral" | "loss";
  condition_id: string;
  trial_index: number;
}

function normalizeProfile(key: string, input: Partial<LotteryProfileSpec> | undefined): LotteryProfileSpec {
  const prob = Number(input?.prob_a ?? 0.5);
  const probA = Math.max(0, Math.min(1, Number.isFinite(prob) ? prob : 0.5));
  return {
    label: String(input?.label ?? key),
    prob_a: probA,
    outcome_a: Number(input?.outcome_a ?? 0),
    outcome_b: Number(input?.outcome_b ?? 0)
  };
}

function buildProfiles(config: ConditionGenerationConfig | undefined): Record<string, LotteryProfileSpec> {
  const raw = config?.lottery_profiles;
  if (!raw || Object.keys(raw).length === 0) {
    return {
      gain: { label: "增益彩票", prob_a: 0.75, outcome_a: 10, outcome_b: 0 },
      loss: { label: "损失彩票", prob_a: 0.75, outcome_a: -10, outcome_b: 0 },
      mixed: { label: "混合彩票", prob_a: 0.5, outcome_a: 10, outcome_b: -10 }
    };
  }
  const profiles: Record<string, LotteryProfileSpec> = {};
  for (const [key, value] of Object.entries(raw)) {
    profiles[key] = normalizeProfile(key, value);
  }
  return profiles;
}

function shuffleInPlace<T>(values: T[], rng: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

export function generate_passive_lottery_conditions(
  n_trials: number,
  condition_labels: string[],
  block_idx: number,
  config: ConditionGenerationConfig | undefined,
  seed: number
): string[] {
  const nTrials = Math.max(0, Math.trunc(n_trials));
  if (nTrials <= 0) {
    return [];
  }
  const profiles = buildProfiles(config);
  const validLabels = (Array.isArray(condition_labels) ? condition_labels : [])
    .map(String)
    .filter((label) => profiles[label] != null);
  const labels = validLabels.length > 0 ? validLabels : Object.keys(profiles);
  const seedOffset = Number(config?.seed ?? 2026) + Math.trunc(block_idx) * 1009;
  const rng = makeSeededRandom(Math.trunc(seed) + seedOffset);

  const schedule: string[] = [];
  for (let index = 0; index < nTrials; index += 1) {
    schedule.push(labels[index % labels.length]);
  }
  shuffleInPlace(schedule, rng);

  const planned: PassiveLotteryConditionSpec[] = [];
  schedule.forEach((condition, idx) => {
    const trialIndex = idx + 1;
    const profile = profiles[condition];
    const drawA = rng() < profile.prob_a;
    const outcomeValue = drawA ? profile.outcome_a : profile.outcome_b;
    const conditionId = `${condition}_p${Math.round(profile.prob_a * 100)}_t${String(trialIndex).padStart(3, "0")}`;
    planned.push({
      condition,
      condition_label: profile.label,
      prob_a: profile.prob_a,
      outcome_a: profile.outcome_a,
      outcome_b: profile.outcome_b,
      outcome_value: outcomeValue,
      outcome_kind: toKind(outcomeValue),
      condition_id: conditionId,
      trial_index: trialIndex
    });
  });
  return planned.map((item) => JSON.stringify(item));
}

export function parse_passive_lottery_condition(condition: string): PassiveLotteryConditionSpec {
  const parsed = JSON.parse(String(condition)) as Partial<PassiveLotteryConditionSpec>;
  const outcomeValue = Number(parsed.outcome_value ?? 0);
  const outcomeKind = String(parsed.outcome_kind ?? toKind(outcomeValue));
  const normalizedOutcomeKind =
    outcomeKind === "win" || outcomeKind === "loss" || outcomeKind === "neutral"
      ? outcomeKind
      : toKind(outcomeValue);
  return {
    condition: String(parsed.condition ?? "gain"),
    condition_label: String(parsed.condition_label ?? parsed.condition ?? "gain"),
    prob_a: Math.max(0, Math.min(1, Number(parsed.prob_a ?? 0.5))),
    outcome_a: Number(parsed.outcome_a ?? 0),
    outcome_b: Number(parsed.outcome_b ?? 0),
    outcome_value: outcomeValue,
    outcome_kind: normalizedOutcomeKind,
    condition_id: String(parsed.condition_id ?? "condition_unknown"),
    trial_index: Math.max(1, Number(parsed.trial_index ?? 1))
  };
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string): {
  win_rate: string;
  block_score: number;
  block_score_signed: string;
  total_score: number;
} {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  const n = Math.max(1, blockRows.length);
  const wins = blockRows.filter((row) => String(row.outcome_kind ?? "") === "win").length;
  const blockScore = blockRows.reduce((sum, row) => sum + Number(row.outcome_value ?? 0), 0);
  const totalScore = rows.length > 0 ? Number(rows[rows.length - 1].total_score ?? 0) : 0;
  return {
    win_rate: `${((wins / n) * 100).toFixed(1)}%`,
    block_score: blockScore,
    block_score_signed: toSigned(blockScore),
    total_score: totalScore
  };
}

export function summarizeOverall(rows: ReducedTrialRow[]): {
  total_score: number;
} {
  return {
    total_score: rows.length > 0 ? Number(rows[rows.length - 1].total_score ?? 0) : 0
  };
}
