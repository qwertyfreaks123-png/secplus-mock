# Independent answer review

A separate reviewer agent, which had not seen the tags, answered all 417 questions from `data/raw.json` (questions, options and source answers only). Its answers are in `review_answers.json`.

- Reviewer agreed with the source key: **404**
- Reviewer disagreed: **13** (5 of them are the incomplete select-two keys)
- Questions where reviewer and tags both accept the key: **401**

Non-answer flags (Q080 missing exhibit, Q084 garbled option, Q264 merged options, Q345 duplicate) do not change the answer and are listed in audit.md and summary.md.

| Id | Source | Reviewer | Final suggested | Status | Reviewer reason | Resolution |
|---|---|---|---|---|---|---|
| Q011 | A | B | B | Both flagged | An internal PCI DSS assessment is not performed by the card brands/acquirer, so its direct outcome is audit findings; fines come from external (QSA/acquirer) non-compliance. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q155 | A | C | C | Both flagged | Sending logs to an off-site location for possible future reference is archiving; log aggregation is centralizing logs for correlation/analysis. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q176 | D | B | B | Both flagged | Malware delivered via shared files with no performance degradation and no failed logins points to a remote access Trojan; cryptojacking would noticeably degrade performance. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q180 | B | C | C | Both flagged | Only users who clocked in from inside the building (using internal DNS) were compromised; remote users of the same internet site were not, which rules out a site compromise (B) and fits internal DNS poisoning. ARP poisoning is unlikely across multiple routed segments/floors. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q215 | D | B | B | Both flagged | For ransomware recovery the key is offline/immutable backups; daily full backups on offline media survive the attack and restore quickly, whereas a NAS drive is online and reachable by ransomware. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q300 | C | C | B | Tags only | - | Kept the tagger's flag (suggest B); SCAP does not analyse a supply chain. Added a note that the reviewer accepted the key, so the item is marked ambiguous. |
| Q310 | A | C | C | Both flagged | On-premises gives the organization full control over the physical and logical security of the data and is the conventional 'most secure' architecture answer; cloud-based is not inherently the most secure. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q330 | A | A, D | A, D | Both flagged | Incomplete key: select-two question; ease of recovery and responsiveness are the HA design considerations. | Both said the key is incomplete but picked different second answers (tagger E, reviewer D). Resolved to A, D: responsiveness and ease of recovery are both listed SY0-701 architecture considerations; attack surface is not an availability factor. Tag updated. |
| Q337 | C | D | - | Reviewer only | Ambiguous: COPE fits company-owned and hardened, but 'reduced security risk' is best met by COBO (business-only use), which is more restrictive than COPE. | No flag added. COPE meets every stated requirement (company-owned, hardenable, compatible) and is the standard key; COBO is defensible but not clearly better. |
| Q344 | D | B | B | Both flagged | Ambiguous/near-duplicate of 345: corrective controls fix errors after they occur (B); preventing unauthorized changes (D) describes a preventive control, not a corrective one. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q347 | A | A, D | A, D | Both flagged | Incomplete key: select-two question; full disk encryption and endpoint protection harden end-user devices. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q350 | C | C, D | C, D | Both flagged | Incomplete key: select-two question; SSH tunneling (encrypt the legacy protocol) and segmentation are the compensating controls. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q352 | C | C | A | Tags only | - | Kept the tagger's flag (suggest A, misconfiguration) with a note that the reviewer accepted the key; marked ambiguous. |
| Q359 | A | A, D | A, D | Both flagged | Incomplete key: select-two question; swipe card and biometric scanner control on-premises physical access. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
| Q373 | B | B | A | Tags only | - | Kept the tagger's flag (suggest A, hybrid work environment) with a note that the reviewer accepted the key; marked ambiguous. |
| Q391 | A | A, B | A, B | Both flagged | Incomplete key: select-two question following a password audit; length and complexity belong in the password policy. | Reviewer and tags agree the key is wrong/incomplete; flag kept. |
