import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import { parse_passive_lottery_condition, type ScoreTracker } from "./utils";

function signedValue(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    scoreTracker: ScoreTracker;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, scoreTracker, block_id, block_idx } = context;
  const parsed = parse_passive_lottery_condition(condition);

  const conditionCueDuration = Number(settings.condition_cue_duration ?? 0.6);
  const preLotteryFixationDuration = Number(settings.pre_lottery_fixation_duration ?? 1.2);
  const lotteryRevealDuration = Number(settings.lottery_reveal_duration ?? 1.5);
  const outcomeFeedbackDuration = Number(settings.outcome_feedback_duration ?? 1.0);
  const itiDuration = Number(settings.iti_duration ?? 0.8);

  const conditionCue = trial.unit("condition_cue").addStim(
    stimBank.get_and_format("condition_cue", {
      condition_label: parsed.condition_label,
      condition_code: parsed.condition
    })
  );
  set_trial_context(conditionCue, {
    trial_id: trial.trial_id,
    phase: "condition_cue",
    deadline_s: conditionCueDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "condition_cue",
      condition: parsed.condition,
      condition_label: parsed.condition_label,
      block_idx
    },
    stim_id: "condition_cue"
  });
  conditionCue.show({ duration: conditionCueDuration }).to_dict();

  const preLotteryFixation = trial.unit("pre_lottery_fixation").addStim(stimBank.get("fixation"));
  set_trial_context(preLotteryFixation, {
    trial_id: trial.trial_id,
    phase: "pre_lottery_fixation",
    deadline_s: preLotteryFixationDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "pre_lottery_fixation",
      condition: parsed.condition,
      block_idx
    },
    stim_id: "fixation"
  });
  preLotteryFixation.show({ duration: preLotteryFixationDuration }).to_dict();

  const lotteryReveal = trial.unit("lottery_reveal").addStim(
    stimBank.get_and_format("lottery_offer", {
      prob_a: Math.round(parsed.prob_a * 100),
      rest_prob: Math.round((1 - parsed.prob_a) * 100),
      outcome_a: signedValue(parsed.outcome_a),
      outcome_b: signedValue(parsed.outcome_b)
    })
  );
  set_trial_context(lotteryReveal, {
    trial_id: trial.trial_id,
    phase: "lottery_reveal",
    deadline_s: lotteryRevealDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "lottery_reveal",
      condition: parsed.condition,
      prob_a: parsed.prob_a,
      outcome_a: parsed.outcome_a,
      outcome_b: parsed.outcome_b,
      block_idx
    },
    stim_id: "lottery_offer"
  });
  lotteryReveal.show({ duration: lotteryRevealDuration }).to_dict();

  const outcomeFeedback = trial.unit("outcome_feedback").addStim(
    stimBank.get_and_format(`outcome_${parsed.outcome_kind}`, {
      outcome_value: signedValue(parsed.outcome_value),
      total_score: scoreTracker.current() + parsed.outcome_value
    })
  );
  set_trial_context(outcomeFeedback, {
    trial_id: trial.trial_id,
    phase: "outcome_feedback",
    deadline_s: outcomeFeedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "outcome_feedback",
      condition: parsed.condition,
      outcome_value: parsed.outcome_value,
      outcome_kind: parsed.outcome_kind,
      block_idx
    },
    stim_id: `outcome_${parsed.outcome_kind}`
  });
  outcomeFeedback
    .show({ duration: outcomeFeedbackDuration })
    .set_state({
      outcome_kind: parsed.outcome_kind,
      outcome_value: parsed.outcome_value,
      feedback_delta: parsed.outcome_value,
      total_score: scoreTracker.current() + parsed.outcome_value
    })
    .to_dict();

  const iti = trial.unit("iti").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: "iti",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: parsed.condition_id,
    task_factors: {
      stage: "iti",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot: TrialSnapshot, _runtime, helpers) => {
    const totalScore = scoreTracker.update(parsed.outcome_value);
    helpers.setTrialState("planned_trial_index", parsed.trial_index);
    helpers.setTrialState("condition", parsed.condition);
    helpers.setTrialState("condition_id", parsed.condition_id);
    helpers.setTrialState("condition_label", parsed.condition_label);
    helpers.setTrialState("prob_a", parsed.prob_a);
    helpers.setTrialState("outcome_a", parsed.outcome_a);
    helpers.setTrialState("outcome_b", parsed.outcome_b);
    helpers.setTrialState("outcome_kind", parsed.outcome_kind);
    helpers.setTrialState("outcome_value", parsed.outcome_value);
    helpers.setTrialState("feedback_delta", parsed.outcome_value);
    helpers.setTrialState("total_score", totalScore);
    helpers.setTrialState(
      "outcome_value_signed",
      String(snapshot.units.outcome_feedback?.outcome_value ?? signedValue(parsed.outcome_value))
    );
  });

  return trial;
}
