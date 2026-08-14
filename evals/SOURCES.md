# Dataset and authority register

## Approved references

### CN-OCC-2022 — Chinese occupational standards

- Source: PRC Ministry of Human Resources and Social Security, *Occupational
  Classification of the PRC (2022)* and the national occupational skill
  standard for computer programmers.
- Use: role taxonomy, competency naming, annotation vocabulary.
- Does not provide resume/interview labels.
- Status: approved as a normative rubric reference; cite the original source.

### ONET-30.3 — O*NET occupational database

- Source: U.S. Department of Labor, O*NET 30.3 database.
- License: CC BY 4.0, subject to documented exceptions.
- Use: cross-check occupation/skill coverage and generate taxonomy challenge
  cases. It must not be treated as a direct description of Chinese campus
  recruiting.
- Status: approved with attribution and version pinning.

### ALIYUN-PJF-2019 — Tianchi job-resume matching data

- Source: 2019 Alibaba Cloud/Tianchi Zhaopin person-job matching competition.
- Research relevance: used as the Chinese dataset in the peer-reviewed ConFit
  v2 evaluation; documents are desensitized structured fields.
- Use: external person-job ranking benchmark only.
- Status: conditional. Do not download, redistribute or commit it until the
  account-visible Tianchi terms have been archived and commercial/internal
  evaluation rights have been confirmed.

### LREC-JD-ER-2022 — Job-description entity recognition corpus

- Source: Green, Maynard and Lin, LREC 2022.
- Scope: 18.6k annotated Skill, Qualification, Experience, Occupation and
  Domain entities.
- License: CC BY-NC 4.0.
- Use: optional research comparison for JD extraction.
- Status: non-commercial research only; excluded from shipped product assets.

### MIT-INTERVIEW — MIT mock interview dataset

- Scope: 138 audiovisual mock interviews from 69 students with multi-rater
  behavioral labels.
- Access: restricted request with terms; academic email requested.
- Use: only for a future audio/video behavior track.
- Status: excluded from the current text technical-interview benchmark because
  its labels measure behavioral presentation rather than technical evidence.

## Methodology references

- ConFit v2: ranking resumes and jobs with nDCG and Recall, including hard
  negatives and the Aliyun dataset.
- Vaishampayan et al., NAACL 2025: human and LLM resume ratings are not
  interchangeable; human labels remain required.
- Naim et al., IEEE/FG: interview ground truth should aggregate independent
  raters rather than rely on a single judge.

## Rejected sources

The following are not acceptable as Gold truth without new human annotation:

- Kaggle resume collections with unknown provenance or self-reported labels;
- scraped resumes or interview experiences without documented consent;
- LeetCode question lists as a proxy for interview quality;
- LLM-generated scores used as both the test labels and the system under test;
- application/acceptance logs treated as pure capability labels, because hiring
  outcomes contain unobserved and potentially biased factors.

