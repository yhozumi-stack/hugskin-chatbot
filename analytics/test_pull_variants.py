#!/usr/bin/env python3
"""pull_variants.py の「履歴が消えない」仕組みの単体テスト(本番シートには一切触らない)。

実行: python3 analytics/test_pull_variants.py
  → 全部OKなら exit 0 / どれか壊れたら AssertionError で exit 1

守りたいこと(2026-07-31の改修の本体):
  ① 窓(WINDOW)を短くしても variant_daily の過去行は1行も消えない
  ② 同じキーは新しい取得値で上書きされる(GA4は数日かけて確定するため)
  ③ 万一縮んだら check_no_shrink が検知し、abort_on_shrink が exit 1 で止める
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pull_variants as pv   # noqa: E402  (鍵は遅延読み込みなので import だけなら不要)

OK = []


def check(name, cond):
    assert cond, f"❌ {name}"
    OK.append(name)
    print(f"  ok: {name}")


# ---- テストデータ: 「7/10〜7/23の過去分」+「7/24〜7/25の直近分」 ----
def row(d, var="ins29", scen="(lp)", metric="landing", s=10, u=9):
    return [d, var, scen, metric, s, u]


old_rows = [row(f"2026-07-{d:02d}") for d in range(10, 24)]      # 14行(過去)
recent_rows = [row(f"2026-07-{d:02d}") for d in (24, 25)]        # 2行(直近)
existing = {(r[0], r[1], r[2], r[3]): r for r in old_rows + recent_rows}   # 計16行

print("== ① 窓を短くしても過去行が消えない(蓄積型の本体) ==")
# 「窓2日」= GA4からは 7/24・7/25 しか返ってこない状況を再現
narrow_new = [row("2026-07-24", s=11, u=10), row("2026-07-25", s=12, u=11)]
merged, st = pv.merge_daily(existing, narrow_new, "2026-07-24", "2026-07-25")
before, after = pv.stats_of(list(existing.values())), pv.stats_of(merged)
check("既存16行が保持される(16→16行)", before["rows"] == 16 and after["rows"] == 16)
check("最古日が後退しない(07-10のまま)", after["min"] == "2026-07-10" == before["min"])
check("旧方式なら消えていた過去14行が残る",
      sum(1 for r in merged if r[0] < "2026-07-24") == 14)
check("縮小ガードは何も言わない", pv.check_no_shrink(before, after) == [])

print("== ② 同キーは新しい取得値で上書き / 新規日は追加 ==")
check("同キー上書きは2件", st["overwritten"] == 2)
check("上書きで値が変わったのは2件", st["changed"] == 2)
d24 = [r for r in merged if r[0] == "2026-07-24"][0]
check("07-24 の sessions が 10 → 11 に更新されている", d24[4] == 11)
merged2, st2 = pv.merge_daily(existing, [row("2026-07-26", s=5, u=5)], "2026-07-26", "2026-07-26")
check("未知の日付は新規追加(16→17行)", st2["added"] == 1 and len(merged2) == 17)
check("マージ結果はキー順にソートされている", merged == sorted(merged, key=lambda r: tuple(r[:4])))

print("== ③ 縮小検知(旧方式=全書き換えを再現して、ガードが捕まえるか) ==")
old_style = narrow_new            # ws.clear() → 直近2行だけ書く、が旧挙動
errs = pv.check_no_shrink(before, pv.stats_of(old_style))
check("旧方式(16行→2行)を検知する", len(errs) >= 1)
check("行数の縮小を名指しする", any("行数が縮小" in e for e in errs))
check("最古日の後退を名指しする", any("最古日が後退" in e for e in errs))
check("最新日だけ縮んだ場合も検知",
      any("最新日が後退" in e for e in
          pv.check_no_shrink(before, {"rows": 20, "min": "2026-07-10", "max": "2026-07-20"})))
check("空になった場合も検知",
      pv.check_no_shrink(before, {"rows": 0, "min": None, "max": None}) != [])

print("== ④ 数値の型(RAWで文字列のまま書き戻すとSUMPRODUCTが黙って0になる) ==")
check("'12' → 12 に戻る", pv._num("12") == 12)
check("空文字 → 0", pv._num("") == 0)
check("壊れた値 → 0(例外を投げない)", pv._num("あ") == 0)
check("マージ後の sessions/users は必ず int",
      all(isinstance(r[4], int) and isinstance(r[5], int) for r in merged))

print("== ⑤ 変更ログの「機械が無視できる」判定 ==")
check("日付行は拾う", bool(pv.DATE_RE.match("2026-07-24")))
check("# で始まる注記行は日付でない", not pv.DATE_RE.match("# 書き方"))
check("見出し/空欄も日付でない", not pv.DATE_RE.match("") and not pv.DATE_RE.match("date"))
check("初期行は 2026-07-24 のAB切替", pv.CHANGELOG_SEED[0][:3] == ["2026-07-24", "AB切替", "全体"])

print("== ⑥ abort_on_shrink は本当に exit 1 で止まるか(別プロセスで実測) ==")
code = ("import sys, os; sys.path.insert(0, %r); import pull_variants as pv;"
        "pv.abort_on_shrink(pv.check_no_shrink({'rows':16,'min':'2026-07-10','max':'2026-07-25'},"
        "{'rows':2,'min':'2026-07-24','max':'2026-07-25'}), 'テスト');"
        "print('ここに来たら失敗')" % os.path.dirname(os.path.abspath(__file__)))
p = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
check("終了コードが 1", p.returncode == 1)
check("::error:: を出す", "::error::" in p.stdout)
check("書き込み中止を明言する", "書き込みを中止" in p.stdout)
check("後続処理に進まない", "ここに来たら失敗" not in p.stdout)

print(f"\n✅ 全 {len(OK)} 項目 OK (本番シートへのアクセスは0回)")
