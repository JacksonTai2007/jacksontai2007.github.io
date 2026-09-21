#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf2json.py — 把「N、題幹 / A. 選項 / B. 選項* / C. 選項」格式的題目 PDF 轉成題庫 JSON。

用法：
    python pdf2json.py 題目.pdf -o ../data/my-bank.json --id my-bank --title "題庫名稱"

規則：
  * 題目以「數字、」開頭（例：1、鴉片戰爭之前……）
  * 選項以「A. / A、 / A．」開頭，正確答案在選項末尾用 * 標記
  * 頁眉頁腳（標題行、「（共100 題）」、「1/13」）會自動剔除
  * 題幹中的空格佔位（4 個以上空格）或下劃線（3 個以上）統一成 ____，前端渲染成填空橫線
  * 可選：--categories categories.json  → { "分類名": [題號, ...] }
"""
import argparse
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    sys.exit("需要 PyMuPDF：pip install pymupdf")

CJK = r"　-〿一-鿿＀-￯‘’“”—…、。"
RE_Q = re.compile(r"^\s*(\d{1,3})\s*[、.．]\s*(.*)$")
RE_OPT = re.compile(r"^\s*([A-H])\s*[.、．]\s*(.*)$")
RE_HEADER = [
    re.compile(r"^第[一二三四五六七八九十百\d]+屆.*(競賽|賽)\s*$"),
    re.compile(r"^（\s*共\s*\d+\s*題\s*）\s*$"),
    re.compile(r"^\d+\s*/\s*\d+\s*$"),
]


def is_cjk(ch: str) -> bool:
    return bool(ch) and bool(re.match(f"[{CJK}]", ch))


def smart_join(a: str, b: str) -> str:
    """合併 PDF 換行：兩側任一邊是中文/全形標點就直接相連，否則保留一個空格。"""
    a, b = a.rstrip(), b.lstrip()
    if not a:
        return b
    if not b:
        return a
    if is_cjk(a[-1]) or is_cjk(b[0]):
        return a + b
    return a + " " + b


def tidy(s: str) -> str:
    s = s.replace(" ", " ").strip()
    # 填空：長下劃線 / 長空白 → ____
    s = re.sub(r"_{3,}", "____", s)
    s = re.sub(r"[ 　]{4,}", "____", s)
    # 多個 ____ 相鄰合併
    s = re.sub(r"(____\s*){2,}", "____", s)
    # 數字/英文與中文之間的空格是 PDF 抽取產生的，去掉（2025 年9 月 → 2025年9月，APEC 中國年 → APEC中國年）
    s = re.sub(rf"(?<=[A-Za-z0-9%+])\s+(?=[{CJK}])", "", s)
    s = re.sub(rf"(?<=[{CJK}])\s+(?=[A-Za-z0-9])", "", s)
    # 中文標點前後不留空格
    s = re.sub(r"\s+(?=[，。、；：？！）》」”])", "", s)
    s = re.sub(r"(?<=[（《「“])\s+", "", s)
    # 連續空格壓縮
    s = re.sub(r"[ ]{2,}", " ", s)
    return s.strip()


def parse_pdf(path: Path):
    doc = fitz.open(str(path))
    questions = []
    cur = None          # 目前題目 dict
    target = None       # "stem" 或 選項索引
    for pno, page in enumerate(doc, start=1):
        for raw in page.get_text().splitlines():
            line = raw.rstrip()
            if not line.strip():
                continue
            if any(h.match(line.strip()) for h in RE_HEADER):
                continue
            mq = RE_Q.match(line)
            mo = RE_OPT.match(line)
            # 題號必須是遞增的下一題，避免把「1860 公里」之類誤判成題號
            if mq and int(mq.group(1)) == len(questions) + 1:
                cur = {"id": int(mq.group(1)), "stem": mq.group(2), "options": [], "answer": None, "page": pno}
                questions.append(cur)
                target = "stem"
                continue
            if cur is None:
                continue
            if mo and (not cur["options"] or ord(mo.group(1)) == ord("A") + len(cur["options"])):
                cur["options"].append(mo.group(2))
                target = len(cur["options"]) - 1
                continue
            # 續行
            if target == "stem":
                cur["stem"] = smart_join(cur["stem"], line)
            elif isinstance(target, int):
                cur["options"][target] = smart_join(cur["options"][target], line)
    # 整理 & 找答案
    for q in questions:
        opts = []
        correct = []
        for i, o in enumerate(q["options"]):
            if "*" in o:
                correct.append(i)
                o = o.replace("*", "")
            opts.append(tidy(o))
        q["options"] = opts
        q["stem"] = tidy(q["stem"])
        if len(correct) != 1:
            raise SystemExit(f"第 {q['id']} 題答案標記異常：{correct} / {q['options']}")
        q["answer"] = correct[0]
        q["type"] = "single"
    return questions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--short", default="")
    ap.add_argument("--description", default="")
    ap.add_argument("--categories", help="JSON：{分類名: [題號...]}")
    args = ap.parse_args()

    qs = parse_pdf(Path(args.pdf))
    cats = {}
    if args.categories:
        mapping = json.loads(Path(args.categories).read_text(encoding="utf-8"))
        for name, ids in mapping.items():
            for i in ids:
                cats[i] = name
    if cats:
        for q in qs:
            q["category"] = cats.get(q["id"], "未分類")

    bank = {
        "id": args.id,
        "title": args.title,
        "short": args.short or args.title,
        "description": args.description,
        "lang": "zh-Hant",
        "count": len(qs),
        "questions": qs,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {len(qs)} 題 → {out}")


if __name__ == "__main__":
    main()
