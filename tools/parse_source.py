"""Parse the plain-text question bank into raw records (no tags yet)."""
import json, re, sys

SRC = "questions/SY0-701_Clear_Unique_Questions_UPDATED.txt"
OUT = "data/raw.json"

text = open(SRC, encoding="utf-8").read()
blocks = re.split(r"^QUESTION (\d+)\s*$", text, flags=re.M)[1:]
records = []
for num, body in zip(blocks[0::2], blocks[1::2]):
    body = re.split(r"^-{20,}\s*$", body, flags=re.M)[0]
    lines = [l.strip() for l in body.splitlines()]
    lines = [l for l in lines if l and not l.startswith("Source item")]
    stem, opts, ans_line = [], {}, None
    for l in lines:
        if re.match(r"^Correct answers?:", l):
            ans_line = l.split(":", 1)[1].strip()
            continue
        # an option line may contain a second merged option, e.g. "F. Technical G. Deterrent"
        m = re.match(r"^([A-H])\.\s+(.*)$", l)
        if m and m.group(1) == chr(ord("A") + len(opts)):
            letter, txt = m.groups()
            merged = re.match(r"^(.*?)\s+([A-H])\.\s+(.*)$", txt)
            if merged and merged.group(2) == chr(ord(letter) + 1):
                opts[letter] = merged.group(1)
                opts[merged.group(2)] = merged.group(3)
            else:
                opts[letter] = txt
        elif opts:
            raise SystemExit(f"Q{num}: unexpected line after options: {l!r}")
        else:
            stem.append(l)
    if ";" in ans_line or not re.match(r"^[A-H] and ", ans_line):
        letters = [p.strip()[0] for p in ans_line.split(";")]
    else:
        letters = re.findall(r"\b([A-H])\b", ans_line)
    records.append({"num": int(num), "question": " ".join(stem), "options": opts,
                    "answer": letters, "answer_raw": ans_line})
json.dump(records, open(OUT, "w"), indent=1, ensure_ascii=False)
print(len(records))
