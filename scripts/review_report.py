"""Compare the blind reviewer's answers with the tags and write data/review.md."""
import json

recs = {int(r["id"][1:]): r for r in json.load(open("data/secplus-questions.json"))}
rev = {int(k): v for k, v in json.load(open("data/review_answers.json")).items()}

# How each mismatch between the reviewer and the tags was resolved.
RESOLUTIONS = {
    300: "Kept the tagger's flag (suggest B); SCAP does not analyse a supply chain. Added a note that the reviewer accepted the key, so the item is marked ambiguous.",
    330: "Both said the key is incomplete but picked different second answers (tagger E, reviewer D). Resolved to A, D: responsiveness and ease of recovery are both listed SY0-701 architecture considerations; attack surface is not an availability factor. Tag updated.",
    337: "No flag added. COPE meets every stated requirement (company-owned, hardenable, compatible) and is the standard key; COBO is defensible but not clearly better.",
    352: "Kept the tagger's flag (suggest A, misconfiguration) with a note that the reviewer accepted the key; marked ambiguous.",
    373: "Kept the tagger's flag (suggest A, hybrid work environment) with a note that the reviewer accepted the key; marked ambiguous.",
}

agree_rows, rows = 0, []
for n in sorted(recs):
    r, v = recs[n], rev[n]
    flagged = r["suggested_answer"] is not None
    if v["agrees"] and not flagged:
        agree_rows += 1
        continue
    same = sorted(v["reviewer_answer"]) == sorted(r["suggested_answer"] or [])
    if not v["agrees"] and flagged and same:
        status, how = "Both flagged", RESOLUTIONS.get(n, "Reviewer and tags agree the key is wrong/incomplete; flag kept.")
    elif not v["agrees"] and flagged:
        status, how = "Both flagged, different fix", RESOLUTIONS.get(n, "Unresolved")
    elif not v["agrees"]:
        status, how = "Reviewer only", RESOLUTIONS.get(n, "Unresolved")
    else:
        status, how = "Tags only", RESOLUTIONS.get(n, "Unresolved")
    rows.append((r["id"], ", ".join(r["answer"]), ", ".join(v["reviewer_answer"]),
                 ", ".join(r["suggested_answer"] or []) or "-", status, v.get("reason", "-"), how))

disagree = sum(1 for v in rev.values() if not v["agrees"])
L = ["# Independent answer review", "",
     "A separate reviewer agent, which had not seen the tags, answered all 417 questions from `data/raw.json` "
     "(questions, options and source answers only). Its answers are in `review_answers.json`.", "",
     f"- Reviewer agreed with the source key: **{417 - disagree}**",
     f"- Reviewer disagreed: **{disagree}** (5 of them are the incomplete select-two keys)",
     f"- Questions where reviewer and tags both accept the key: **{agree_rows}**", "",
     "Non-answer flags (Q080 missing exhibit, Q084 garbled option, Q264 merged options, Q345 duplicate) "
     "do not change the answer and are listed in audit.md and summary.md.", "",
     "| Id | Source | Reviewer | Final suggested | Status | Reviewer reason | Resolution |",
     "|---|---|---|---|---|---|---|"]
L += ["| " + " | ".join(c.replace("|", "\\|") for c in row) + " |" for row in rows]
open("data/review.md", "w").write("\n".join(L) + "\n")
unresolved = [r[0] for r in rows if r[6] == "Unresolved"]
print(f"wrote data/review.md: {disagree} reviewer disagreements, {len(rows)} rows, unresolved: {unresolved or 'none'}")
