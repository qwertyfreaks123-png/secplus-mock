"""Write data/summary.md from data/secplus-questions.json."""
import json
from collections import Counter

recs = json.load(open("data/secplus-questions.json", encoding="utf-8"))
NAMES = {1: "General Security Concepts", 2: "Threats, Vulnerabilities, and Mitigations",
         3: "Security Architecture", 4: "Security Operations", 5: "Security Program Management and Oversight"}
WEIGHTS = {1: 12, 2: 22, 3: 18, 4: 28, 5: 20}
QUOTAS = {1: 10, 2: 19, 3: 15, 4: 24, 5: 17}  # 85-question paper

n = len(recs)
dom = Counter(r["domain"] for r in recs)
obj = Counter(r["objective"] for r in recs)
diff = Counter(r["difficulty"] for r in recs)
typ = Counter(r["type"] for r in recs)
flagged = [r for r in recs if r["flags"]]
dupes = {r["id"] for r in recs if any(f.startswith("duplicate_of:") for f in r["flags"])}
unique_dom = Counter(r["domain"] for r in recs if r["id"] not in dupes)


def papers(counts):
    per = {d: counts[d] // QUOTAS[d] for d in QUOTAS}
    full = min(per.values())
    # the domain that runs out first: fewest papers, then least left over
    first = min(QUOTAS, key=lambda d: (per[d], counts[d] - per[d] * QUOTAS[d]))
    return full, per, first


full, per, first = papers(dom)
ufull, uper, ufirst = papers(unique_dom)
L = ["# SY0-701 question bank summary", "",
     f"Source: `data/secplus-questions.json`. Audit: [audit.md](audit.md). Answer review: [review.md](review.md).", "",
     f"- Total questions: **{n}**",
     f"- Types: " + ", ".join(f"{t} {c}" for t, c in sorted(typ.items())) + " (no PBQs in the source)",
     f"- Flagged questions: **{len(flagged)}**", "",
     "## Domains vs SY0-701 weights", "",
     "| Domain | Name | Questions | Share of bank | SY0-701 weight | Difference |", "|---|---|---|---|---|---|"]
for d in range(1, 6):
    share = 100 * dom[d] / n
    L.append(f"| {d} | {NAMES[d]} | {dom[d]} | {share:.1f}% | {WEIGHTS[d]}% | {share - WEIGHTS[d]:+.1f} pts |")
L += ["", "## Objectives", "", "| Objective | Questions |", "|---|---|"]
L += [f"| {o} | {obj[o]} |" for o in sorted(obj, key=lambda o: tuple(map(int, o.split("."))))]
L += ["", "## Difficulty", "", "| Difficulty | Questions | Share |", "|---|---|---|"]
L += [f"| {k} | {diff[k]} | {100 * diff[k] / n:.1f}% |" for k in ("easy", "medium", "hard")]
L += ["", "## Full mock papers", "",
      "The bank has no PBQs, so each paper is 85 multiple-choice questions in 80 minutes, with domain quotas "
      "10 / 19 / 15 / 24 / 17. Papers never repeat a question.", "",
      "| Domain | Quota | Questions | Papers this domain supports | Left over |", "|---|---|---|---|---|"]
L += [f"| {d} | {QUOTAS[d]} | {dom[d]} | {per[d]} | {dom[d] - per[d] * QUOTAS[d]} |" for d in range(1, 6)]
L += ["", f"**The bank supports {full} full papers.** Domain {first} ({NAMES[first]}) runs out first.",
      f"Excluding the {len(dupes)} flagged duplicate(s) ({', '.join(sorted(dupes)) or 'none'}): "
      f"{ufull} full papers, domain {ufirst} runs out first.", "",
      "## Flagged questions", "", "| Id | Source answer | Suggested answer | Reason |", "|---|---|---|---|"]
for r in flagged:
    sug = ", ".join(r["suggested_answer"]) if r["suggested_answer"] else "(same)"
    reason = "<br>".join(f.replace("|", "\\|") for f in r["flags"])
    L.append(f"| {r['id']} | {', '.join(r['answer'])} | {sug} | {reason} |")
open("data/summary.md", "w", encoding="utf-8").write("\n".join(L) + "\n")
print(f"wrote data/summary.md: {n} questions, {len(flagged)} flagged, {full} full papers, domain {first} first")
