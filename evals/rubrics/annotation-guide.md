# Annotation guide v0.1

## Evidence dimensions

- `ownership`: explicit personal responsibility or module boundary.
- `mechanism`: concrete inputs, outputs, steps, data structures or algorithms.
- `tradeoff`: a considered alternative and a reasoned choice.
- `metric`: named metric with value or interpretable outcome.
- `validation`: baseline, experiment, test set, replay or production check.
- `failure_boundary`: failure mode, scale boundary, monitoring or rollback.

Do not infer a dimension from technical vocabulary alone.

## Interview score anchors

- 0–2: refuses, irrelevant, contradictory, or contains no usable answer.
- 3–4: relevant conclusion but no independently verifiable mechanism or role.
- 5–6: explains part of the mechanism and personal work, but lacks important
  tradeoff, metric, validation or boundary evidence.
- 7–8: clear ownership and mechanism with credible tradeoff/result evidence;
  minor gaps remain.
- 9–10: complete, internally consistent and falsifiable account with ownership,
  mechanism, alternatives, measurement and failure boundaries. Use sparingly.

Annotators label an acceptable score range, not a false single-point truth.
Model MAE is measured against the midpoint, while `withinRange` is the primary
score-agreement metric.

## Turn actions

- `clarify`: the answer is relevant and a single important evidence gap can be
  resolved without exceeding depth/clarification limits.
- `advance`: the current skill has sufficient evidence or another required
  skill has materially lower coverage.
- `pivot`: the answer/question path is off-rubric, saturated or unsafe.
- `finish`: question budget is reached and minimum rubric coverage is met, or
  continuing cannot add useful evidence.

## Person-job relevance grades

- 0: contradicts a lawful hard requirement or has no relevant evidence.
- 1: related vocabulary/education only; capability is not demonstrated.
- 2: relevant practical experience, with meaningful gaps or weak evidence.
- 3: strong direct evidence for most must-haves at the required depth.

Hiring outcome is not the label. The label is document-grounded suitability
under the frozen rubric.

