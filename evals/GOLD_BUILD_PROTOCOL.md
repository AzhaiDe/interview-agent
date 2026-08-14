# Gold Set construction protocol

## Required minimum composition

The first production Gold release (`gold-v1`) must contain at least:

- 60 Chinese campus-recruiting resumes: 15 backend, 15 frontend, 15
  algorithm/AI, and 15 data/test/other; at least 10 must be difficult layouts
  and at least 10 must intentionally lack evidence.
- 300 interview turns from at least 30 complete sessions; each target role and
  pressure level 2–5 must be represented.
- 12 real or expert-authored JDs with at least 20 candidate profiles per JD;
  include obvious positives, obvious negatives and near-match hard negatives.
- 80 memory queries covering useful recall, irrelevant recall, contradiction,
  deletion, privacy and cross-tenant isolation.

No person's resume may enter Gold without explicit evaluation consent. Remove
name, phone, email, address, IDs, links, employer-confidential details and any
free-text combination that can readily re-identify the person.

## Annotators

- Resume extraction: two trained annotators; one senior recruiter or hiring
  manager adjudicates disagreements.
- Technical interview: two engineers with interview experience score every
  turn; a third reviewer adjudicates score differences greater than 2 points or
  disagreements on action/skill.
- Ranking: at least two hiring reviewers independently produce pairwise
  preferences under the frozen JD rubric; adjudication creates the final order.
- Annotators must not see model outputs or model identity.

## Annotation order

1. Freeze document/session IDs and task split.
2. Annotators label independently.
3. Compute agreement before adjudication.
4. Clarify the guide if systematic disagreement is found; never silently alter
   labels.
5. Adjudicate and record the reason for every changed label.
6. Freeze a manifest hash. Gold test labels are not used during prompt editing.

## Agreement gates

- Categorical labels: Cohen's kappa >= 0.70; target >= 0.80.
- Evidence spans: token-level F1 between annotators >= 0.85.
- Scores: weighted kappa >= 0.70 and mean absolute disagreement <= 1.0/10.
- Ranking: Kendall's tau >= 0.60 before adjudication.

If a gate fails, the data is not Gold. Revise definitions, retrain annotators
and relabel the affected stratum.

## Split policy

- development: 20%; visible during prompt development;
- test: 60%; hidden from prompt authors;
- challenge: 20%; prompt injection, ambiguous evidence, near matches, unusual
  layouts and privacy cases.

Candidate, resume and session identities must never cross splits. Synthetic
variants derived from one source remain in the same split.

## Gold labels

Resume labels include section boundaries, normalized facts, evidence spans,
unsupported-claim flags and acceptable role recommendations.

Interview labels separate the answered question from the next question:

- `answeredSkill`, `scoreRange`, `evidenceCovered`, `missingEvidence`;
- permitted `action` values;
- acceptable next skills and forbidden topics;
- critical safety/privacy flags.

Ranking labels use pairwise preferences plus relevance grade 0–3. Reviewers
must provide evidence; prestige, name, gender, age and school identity are not
permitted ranking features unless a lawful, explicit hard requirement exists.

