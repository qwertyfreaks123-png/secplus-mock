"""Audit the source question bank and data/raw.json; write findings to data/audit.md.

Re-runs tools/parse_source.py when raw.json is older than the source file.
"""
import difflib, json, os, random, re, subprocess, sys
from collections import Counter

SRC = "questions/SY0-701_Clear_Unique_Questions_UPDATED.txt"
RAW = "data/raw.json"
OUT = "data/audit.md"
SIM_THRESHOLD = 0.93
INFO_THRESHOLD = 0.80  # lower bar, listed for manual review only
# Verdicts from reading each sub-threshold pair by hand.
MANUAL_VERDICTS = {
    (81, 106): "Not a duplicate: different options; 'hired by a foreign government' vs 'large financial resources'.",
    (60, 240): "Not a duplicate: different options (exercises vs SOC documents).",
    (344, 345): "Near-duplicate: same options, same scenario, but keys differ (D vs B). "
                "Handling: flag Q344 (suggest B) and flag Q345 duplicate_of: Q344.",
}

if not os.path.exists(RAW) or os.path.getmtime(RAW) < os.path.getmtime(SRC):
    subprocess.run([sys.executable, "tools/parse_source.py"], check=True)

text = open(SRC, encoding="utf-8").read()
raw = json.load(open(RAW))
problems = []  # (id, problem, handling)


def qid(n):
    return f"Q{n:03d}"


def ws(s):
    return re.sub(r"\s+", " ", s).strip()


# 1. Completeness
headers = [int(n) for n in re.findall(r"^QUESTION (\d+)\s*$", text, flags=re.M)]
nums = [q["num"] for q in raw]
expected = list(range(1, len(headers) + 1))
completeness = {
    "headers in source": len(headers),
    "records in raw.json": len(raw),
    "header numbering 1..N, no gaps/repeats": headers == expected,
    "raw.json numbering matches headers": nums == headers,
}
for n, c in Counter(headers).items():
    if c > 1:
        problems.append((qid(n), "QUESTION header repeated", "Parser bug check required"))
for n in set(expected) - set(headers):
    problems.append((qid(n), "QUESTION number missing from source", "Report to owner"))

# 2. Parse fidelity: compare 10 random records against their source block
blocks = dict(zip(*[iter(re.split(r"^QUESTION (\d+)\s*$", text, flags=re.M)[1:])] * 2))
rng = random.Random(701)
sample = sorted(rng.sample(nums, 10))
fidelity = []
for n in sample:
    block = ws(re.split(r"^-{20,}\s*$", blocks[str(n)], flags=re.M)[0])
    q = raw[n - 1]
    checks = {"stem": ws(q["question"]) in block}
    for k, v in q["options"].items():
        checks[f"option {k}"] = f"{k}. {ws(v)}" in block
    ans_text = block.split("Correct answer", 1)[1]
    checks["answer"] = all(re.search(rf"\b{a}\b", ans_text) for a in q["answer"])
    ok = all(checks.values())
    fidelity.append((n, ok, [k for k, v in checks.items() if not v]))
    if not ok:
        problems.append((qid(n), f"raw.json differs from source: {fidelity[-1][2]}", "Fix parser"))


# 3. Per-question checks
def expected_answers(stem):
    if re.search(r"\((choose|select) three", stem, re.I):
        return 3
    if re.search(r"\((choose|select) two", stem, re.I):
        return 2
    return 1


for q in raw:
    i, stem, opts, ans = qid(q["num"]), q["question"], q["options"], q["answer"]
    letters = list(opts)
    if len(opts) < 3:
        problems.append((i, f"only {len(opts)} options", "Exclude or report"))
    if letters != [chr(ord("A") + k) for k in range(len(letters))]:
        problems.append((i, f"option letters out of order/gapped: {letters}", "Fix parser"))
    for a in ans:
        if a not in opts:
            problems.append((i, f"answer {a} is not an option", "Fix parser or flag"))
    want = expected_answers(stem)
    if len(ans) != want:
        problems.append((i, f"stem asks for {want} answer(s) but key gives {len(ans)} ({', '.join(ans)})",
                         "Keep source answer; put full answer set in suggested_answer and flag"))
    seen = Counter(ws(v).lower() for v in opts.values())
    for v, c in seen.items():
        if c > 1:
            problems.append((i, f"duplicate option text: {v!r}", "Flag"))
    if len(stem) < 25:
        problems.append((i, f"stem too short ({len(stem)} chars)", "Report"))
    elif not re.search(r"[?.:)\"'”]$", stem.strip()):
        problems.append((i, f"stem may be truncated (ends with {stem.strip()[-20:]!r})", "Review"))
    m = re.search(r"(the following|as follows|below)\s*[:;,.]?\s*(Which|What|Based)\b", stem, re.I)
    if m:
        problems.append((i, f"stem refers to an exhibit that is not in the source ('...{stem[max(0, m.start() - 30):m.end()]}...')",
                         "Keep text; answer still determinable from options and convention, so keep and flag missing exhibit"))
    for k, v in opts.items():
        for ip in re.findall(r"\b\d{1,3}(?:\.\d{1,3}){4,}(?:/\d+)?", v):
            problems.append((i, f"option {k} contains a malformed address {ip!r}",
                             "Keep text (intended 0.0.0.0/0 is clear); flag"))
    if len(opts) > 6:
        problems.append((i, f"{len(opts)} options (A-{letters[-1]}); source line 'F. Technical G. Deterrent' "
                            "merged two options" if "G" in opts else f"{len(opts)} options",
                         "Parser splits the merged line; keep all options, flag"))

# 4. Near-duplicate stems
norm = [re.sub(r"[^a-z0-9 ]", "", q["question"].lower()) for q in raw]
dupes, near = [], []
for a in range(len(raw)):
    for b in range(a):
        m = difflib.SequenceMatcher(None, norm[a], norm[b], autojunk=False)
        if m.real_quick_ratio() >= INFO_THRESHOLD and m.quick_ratio() >= INFO_THRESHOLD:
            r = m.ratio()
            if INFO_THRESHOLD <= r < SIM_THRESHOLD:
                near.append((raw[b]["num"], raw[a]["num"], r))
            if r >= SIM_THRESHOLD:
                dupes.append((raw[b]["num"], raw[a]["num"], r))
                problems.append((qid(raw[a]["num"]), f"near-duplicate of {qid(raw[b]['num'])} (similarity {r:.2f})",
                                 f"Flag duplicate_of: {qid(raw[b]['num'])}"))

for a, b, r in near:
    if "Near-duplicate" in MANUAL_VERDICTS.get((a, b), ""):
        problems.append((qid(b), f"near-duplicate of {qid(a)} (similarity {r:.2f}) with a different key",
                         f"Flag {qid(b)} duplicate_of: {qid(a)}; flag {qid(a)} suggested answer B"))

# 5. Distributions
opt_counts = Counter(len(q["options"]) for q in raw)
ans_counts = Counter(len(q["answer"]) for q in raw)

lines = ["# Source audit", "", f"Source: `{SRC}`  ", f"Parsed: `{RAW}`", "", "## 1. Completeness", ""]
lines += [f"- {k}: **{v}**" for k, v in completeness.items()]
lines += ["", "## 2. Parse fidelity (10 random questions, seed 701)", "", "| Question | Stem, options and answer match source |", "|---|---|"]
lines += [f"| {qid(n)} | {'yes' if ok else 'NO: ' + ', '.join(bad)} |" for n, ok, bad in fidelity]
lines += ["", f"## 4. Near-duplicate stems (similarity >= {SIM_THRESHOLD})", ""]
lines += [f"- {qid(a)} / {qid(b)}: {r:.2f}" for a, b, r in dupes] or ["- none"]
lines += ["", f"Below the threshold but >= {INFO_THRESHOLD} (checked by hand):", ""]
lines += [f"- {qid(a)} / {qid(b)}: {r:.2f}. {MANUAL_VERDICTS.get((a, b), 'Not yet reviewed.')}"
          for a, b, r in near] or ["- none"]
lines += ["", "## 5. Distributions", "", "| Options per question | Questions |", "|---|---|"]
lines += [f"| {k} | {v} |" for k, v in sorted(opt_counts.items())]
lines += ["", "| Answers per question | Questions |", "|---|---|"]
lines += [f"| {k} | {v} |" for k, v in sorted(ans_counts.items())]
lines += ["", "## 3. Problems found", "", f"{len(problems)} problem(s).", "", "| Id | Problem | Planned handling |", "|---|---|---|"]
lines += [f"| {i} | {p} | {h} |" for i, p, h in sorted(problems)]
open(OUT, "w").write("\n".join(lines) + "\n")

print("\n".join(f"{k}: {v}" for k, v in completeness.items()))
print("fidelity:", sum(ok for _, ok, _ in fidelity), "/ 10 ok")
print("near-duplicates:", dupes, "below threshold:", near)
print("options:", dict(opt_counts), "answers:", dict(ans_counts))
for p in sorted(problems):
    print(*p, sep=" | ")
