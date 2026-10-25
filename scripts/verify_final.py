"""Verify data/secplus-questions.json against data/raw.json and the schema rules."""
import json, re, sys

FINAL, RAW, N = "data/secplus-questions.json", "data/raw.json", 417
FIELDS = ["id", "domain", "objective", "type", "question", "options", "answer", "marks",
          "difficulty", "explanation", "suggested_answer", "flags"]
OBJECTIVES = {1: 4, 2: 5, 3: 4, 4: 9, 5: 6}

errors = []
try:
    recs = json.load(open(FINAL, encoding="utf-8"))
except (OSError, json.JSONDecodeError) as e:
    sys.exit(f"FAIL: cannot parse {FINAL}: {e}")
raw = {f"Q{q['num']:03d}": q for q in json.load(open(RAW))}

ids = [r.get("id") for r in recs]
if len(recs) != N:
    errors.append(f"expected {N} records, found {len(recs)}")
if ids != [f"Q{n:03d}" for n in range(1, N + 1)]:
    errors.append("ids are not exactly Q001..Q417 in order")
if len(set(ids)) != len(ids):
    errors.append("duplicate ids")

for r in recs:
    i = r.get("id")
    err = lambda m: errors.append(f"{i}: {m}")
    if list(r) != FIELDS:
        err(f"fields {list(r)}")
        continue
    src = raw.get(i)
    if src is None:
        err("no matching raw record"); continue
    for k in ("question", "options", "answer"):
        if r[k] != src[k]:
            err(f"{k} differs from raw.json")
    m = re.fullmatch(r"([1-5])\.(\d)", str(r["objective"]))
    if not m or int(m.group(2)) not in range(1, OBJECTIVES[int(m.group(1))] + 1):
        err(f"invalid objective {r['objective']}")
    elif r["domain"] != int(m.group(1)):
        err(f"domain {r['domain']} does not match objective {r['objective']}")
    is_multi = bool(re.search(r"(choose|select) (two|three)", r["question"], re.I))
    if r["type"] != ("multi" if is_multi else "single"):
        err(f"type {r['type']} but stem multi={is_multi}")
    if r["marks"] != 1:
        err(f"marks {r['marks']}")
    if r["difficulty"] not in ("easy", "medium", "hard"):
        err(f"difficulty {r['difficulty']}")
    if not isinstance(r["flags"], list) or not all(isinstance(f, str) and f for f in r["flags"]):
        err("flags must be a list of non-empty strings")
    if r["suggested_answer"] is not None:
        if not r["flags"]:
            err("suggested_answer without a flag")
        if not isinstance(r["suggested_answer"], list) or not r["suggested_answer"]:
            err("suggested_answer must be null or a non-empty list")
    for k in ("answer", "suggested_answer"):
        for a in r[k] or []:
            if a not in r["options"]:
                err(f"{k} letter {a} not in options")
    if not isinstance(r["explanation"], str) or len(r["explanation"]) < 20:
        err("explanation missing or too short")

if errors:
    print("\n".join(errors))
    sys.exit(f"FAIL: {len(errors)} problem(s)")
print(f"PASS: {len(recs)} records, ids Q001-Q{N:03d}, all checks passed")
