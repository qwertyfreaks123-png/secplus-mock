# SY0-701 question bank summary

Source: `data/secplus-questions.json`. Audit: [audit.md](audit.md). Answer review: [review.md](review.md).

- Total questions: **417**
- Types: multi 13, single 404 (no PBQs in the source)
- Flagged questions: **19**

## Domains vs SY0-701 weights

| Domain | Name | Questions | Share of bank | SY0-701 weight | Difference |
|---|---|---|---|---|---|
| 1 | General Security Concepts | 64 | 15.3% | 12% | +3.3 pts |
| 2 | Threats, Vulnerabilities, and Mitigations | 86 | 20.6% | 22% | -1.4 pts |
| 3 | Security Architecture | 72 | 17.3% | 18% | -0.7 pts |
| 4 | Security Operations | 136 | 32.6% | 28% | +4.6 pts |
| 5 | Security Program Management and Oversight | 59 | 14.1% | 20% | -5.9 pts |

## Objectives

| Objective | Questions |
|---|---|
| 1.1 | 14 |
| 1.2 | 16 |
| 1.3 | 11 |
| 1.4 | 23 |
| 2.1 | 9 |
| 2.2 | 17 |
| 2.3 | 21 |
| 2.4 | 18 |
| 2.5 | 21 |
| 3.1 | 15 |
| 3.2 | 21 |
| 3.3 | 18 |
| 3.4 | 18 |
| 4.1 | 17 |
| 4.2 | 10 |
| 4.3 | 18 |
| 4.4 | 12 |
| 4.5 | 20 |
| 4.6 | 26 |
| 4.7 | 8 |
| 4.8 | 20 |
| 4.9 | 5 |
| 5.1 | 9 |
| 5.2 | 13 |
| 5.3 | 7 |
| 5.4 | 5 |
| 5.5 | 13 |
| 5.6 | 12 |

## Difficulty

| Difficulty | Questions | Share |
|---|---|---|
| easy | 216 | 51.8% |
| medium | 174 | 41.7% |
| hard | 27 | 6.5% |

211 of 417 stems use best/most/first wording, so that wording alone was not treated as hard; hard is reserved for long scenarios and close distractors.

## Full mock papers

The bank has no PBQs, so each paper is 85 multiple-choice questions in 80 minutes, with domain quotas 10 / 19 / 15 / 24 / 17. Papers never repeat a question.

| Domain | Quota | Questions | Papers this domain supports | Left over |
|---|---|---|---|---|
| 1 | 10 | 64 | 6 | 4 |
| 2 | 19 | 86 | 4 | 10 |
| 3 | 15 | 72 | 4 | 12 |
| 4 | 24 | 136 | 5 | 16 |
| 5 | 17 | 59 | 3 | 8 |

**The bank supports 3 full papers.** Domain 5 (Security Program Management and Oversight) runs out first.
Excluding the 1 flagged duplicate(s) (Q345): 3 full papers, domain 5 runs out first.

## Flagged questions

| Id | Source answer | Suggested answer | Reason |
|---|---|---|---|
| Q011 | A | B | Possible wrong answer: an internal PCI DSS assessment most directly produces audit findings; fines typically follow an external assessment or breach. |
| Q080 | A | (same) | Missing exhibit: the stem says the administrator 'discovers the following;' but the source omits the log; answer kept as keyed (brute force is the standard answer for this item). |
| Q084 | D | (same) | Source text error: option D's deny rule reads '0.0.0.0.0.0.0.0.0/0' (intended 0.0.0.0/0); text kept as given, answer unaffected. |
| Q155 | A | C | Possible wrong answer: storing logs off-site for future reference is archiving; aggregation is about centralizing logs for analysis. |
| Q176 | D | B | Possible wrong answer: the absence of degraded performance argues against cryptojacking; a RAT hidden in shared files fits the scenario. |
| Q180 | B | C | Possible wrong answer: a compromised internet-facing site would affect remote users too; internal DNS poisoning across the routed segments fits the scenario. |
| Q215 | D | B | Possible wrong answer: online NAS backups are exposed to ransomware and full+incremental chains slow recovery; daily full backups on offline media best meet RPO/RTO against ransomware. |
| Q264 | E, F | (same) | Source formatting: options F and G were merged on one line in the source; split into F. Technical and G. Deterrent (7 options). |
| Q300 | C | B | Possible wrong answer: SCAP is a configuration-compliance standard, not a supply chain analysis method; a third-party penetration test is the closer fit for SY0-701 vendor/supply chain assessment.<br>Independent reviewer accepted the source answer; treat as ambiguous. |
| Q310 | A | C | Possible wrong answer: on-premises offers the greatest control and is usually considered the most secure model; cloud-based is not inherently more secure. |
| Q330 | A | A, D | Incomplete answer key: stem asks for two answers but the source gives one; suggested pair A, D (ease of recovery and responsiveness, both SY0-701 architecture considerations). |
| Q344 | D | B | Possible wrong answer: corrective controls limit or fix the effect of errors (B); preventing unauthorized changes (D) is a preventive control goal.<br>Conflicting key with near-duplicate Q345, which gives B. |
| Q345 | B | (same) | duplicate_of: Q344<br>Near-duplicate Q344 has the same options but its source key gives D; B is correct for both. |
| Q347 | A | A, D | Incomplete answer key: stem asks for two answers but the source gives one; suggested pair A, D (full disk encryption and endpoint protection). |
| Q350 | C | C, D | Incomplete answer key: stem asks for two answers but the source gives one; suggested pair C, D (SSH tunneling and segmentation). |
| Q352 | C | A | Possible wrong answer: improper certificate use and management is best classed as misconfiguration; insecure key storage refers specifically to how private keys are protected.<br>Independent reviewer accepted the source answer; treat as ambiguous. |
| Q359 | A | A, D | Incomplete answer key: stem asks for two answers but the source gives one; suggested pair A and D (swipe card and biometric scanner). |
| Q373 | B | A | Possible wrong answer: the scenario centers on securing a laptop while working from home, which SY0-701 covers under hybrid/remote work environments rather than operations security.<br>Independent reviewer accepted the source answer; treat as ambiguous. |
| Q391 | A | A, B | Incomplete answer key: stem asks for two answers but the source gives one; suggested pair A and B (length and complexity). |
