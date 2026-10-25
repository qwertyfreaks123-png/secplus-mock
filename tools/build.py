"""Merge parsed questions with per-batch tags, validate, and write JSON output.

Tags live in data/tags/batchNN.json as {"<num>": {"objective", "difficulty",
"explanation", "suggested_answer"?, "flags"?}}.
"""
import glob, json, re, sys

OBJECTIVES = {
    1: ["1.1", "1.2", "1.3", "1.4"],
    2: ["2.1", "2.2", "2.3", "2.4", "2.5"],
    3: ["3.1", "3.2", "3.3", "3.4"],
    4: ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"],
    5: ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"],
}
FIELDS = ["id", "domain", "objective", "type", "question", "options", "answer", "marks",
          "difficulty", "explanation", "suggested_answer", "flags"]

raw = {q["num"]: q for q in json.load(open("data/raw.json"))}
tags = {}
for path in sorted(glob.glob("data/tags/batch*.json")):
    tags.update({int(k): v for k, v in json.load(open(path)).items()})


def build(num):
    q, t = raw[num], tags[num]
    multi = re.search(r"\((choose|select) (two|three)", q["question"], re.I)
    obj = t["objective"]
    return {
        "id": f"Q{num:03d}",
        "domain": int(obj.split(".")[0]),
        "objective": obj,
        "type": "multi" if multi else "single",
        "question": q["question"],
        "options": q["options"],
        "answer": q["answer"],
        "marks": 1,
        "difficulty": t["difficulty"],
        "explanation": t["explanation"],
        "suggested_answer": t.get("suggested_answer"),
        "flags": t.get("flags", []),
    }


def validate(rec):
    errs = []
    if list(rec) != FIELDS:
        errs.append("field set/order mismatch")
    if rec["domain"] not in OBJECTIVES or rec["objective"] not in OBJECTIVES[rec["domain"]]:
        errs.append(f"bad domain/objective {rec['domain']}/{rec['objective']}")
    if rec["difficulty"] not in ("easy", "medium", "hard"):
        errs.append("bad difficulty")
    for key in ("answer", "suggested_answer"):
        for a in rec[key] or []:
            if a not in rec["options"]:
                errs.append(f"{key} {a} not an option")
    want = 1
    if rec["type"] == "multi":
        want = 3 if re.search(r"three", rec["question"], re.I) else 2
    if len(rec["answer"]) != want and not rec["flags"]:
        errs.append(f"answer count {len(rec['answer'])} != {want} and not flagged")
    if rec["suggested_answer"] is not None and not rec["flags"]:
        errs.append("suggested_answer without a flag")
    if not rec["explanation"] or not rec["question"]:
        errs.append("empty text")
    return errs


if __name__ == "__main__":
    lo, hi = (int(x) for x in sys.argv[1:3]) if len(sys.argv) > 2 else (1, max(raw))
    out = sys.argv[3] if len(sys.argv) > 3 else None
    recs, bad = [], 0
    for num in range(lo, hi + 1):
        if num not in tags:
            print(f"Q{num:03d}: missing tags"); bad += 1; continue
        rec = build(num)
        for e in validate(rec):
            print(f"{rec['id']}: {e}"); bad += 1
        recs.append(rec)
    if bad:
        sys.exit(f"{bad} validation errors")
    text = json.dumps(recs, indent=2, ensure_ascii=False)
    json.loads(text)
    if out:
        open(out, "w", encoding="utf-8").write(text + "\n")
    print(f"OK: {len(recs)} records valid ({recs[0]['id']}-{recs[-1]['id']})")
