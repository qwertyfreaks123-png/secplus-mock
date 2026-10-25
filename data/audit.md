# Source audit

Source: `questions/SY0-701_Clear_Unique_Questions_UPDATED.txt`  
Parsed: `data/raw.json`

## 1. Completeness

- headers in source: **417**
- records in raw.json: **417**
- header numbering 1..N, no gaps/repeats: **True**
- raw.json numbering matches headers: **True**

## 2. Parse fidelity (10 random questions, seed 701)

| Question | Stem, options and answer match source |
|---|---|
| Q053 | yes |
| Q057 | yes |
| Q124 | yes |
| Q144 | yes |
| Q256 | yes |
| Q274 | yes |
| Q282 | yes |
| Q300 | yes |
| Q383 | yes |
| Q403 | yes |

## 4. Near-duplicate stems (similarity >= 0.93)

- none

Below the threshold but >= 0.8 (checked by hand):

- Q081 / Q106: 0.86. Not a duplicate: different options; 'hired by a foreign government' vs 'large financial resources'.
- Q060 / Q240: 0.80. Not a duplicate: different options (exercises vs SOC documents).
- Q344 / Q345: 0.84. Near-duplicate: same options, same scenario, but keys differ (D vs B). Handling: flag Q344 (suggest B) and flag Q345 duplicate_of: Q344.

## 5. Distributions

| Options per question | Questions |
|---|---|
| 4 | 392 |
| 5 | 11 |
| 6 | 13 |
| 7 | 1 |

| Answers per question | Questions |
|---|---|
| 1 | 409 |
| 2 | 8 |

## 3. Problems found

9 problem(s).

| Id | Problem | Planned handling |
|---|---|---|
| Q080 | stem refers to an exhibit that is not in the source ('...s security logs and discovers the following; Which...') | Keep text; answer still determinable from options and convention, so keep and flag missing exhibit |
| Q084 | option D contains a malformed address '0.0.0.0.0.0.0.0.0/0' | Keep text (intended 0.0.0.0/0 is clear); flag |
| Q264 | 7 options (A-G); source line 'F. Technical G. Deterrent' merged two options | Parser splits the merged line; keep all options, flag |
| Q330 | stem asks for 2 answer(s) but key gives 1 (A) | Keep source answer; put full answer set in suggested_answer and flag |
| Q345 | near-duplicate of Q344 (similarity 0.84) with a different key | Flag Q345 duplicate_of: Q344; flag Q344 suggested answer B |
| Q347 | stem asks for 2 answer(s) but key gives 1 (A) | Keep source answer; put full answer set in suggested_answer and flag |
| Q350 | stem asks for 2 answer(s) but key gives 1 (C) | Keep source answer; put full answer set in suggested_answer and flag |
| Q359 | stem asks for 2 answer(s) but key gives 1 (A) | Keep source answer; put full answer set in suggested_answer and flag |
| Q391 | stem asks for 2 answer(s) but key gives 1 (A) | Keep source answer; put full answer set in suggested_answer and flag |
