"""신뢰 구간·맥니마 검정 (11/14) — 경계 사례 실제 숫자로 확인"""
from app.evaluate import mcnemar, wilson


def test_wilson_matches_known_values():
    lo, hi = wilson(111, 118)
    assert round(lo * 100, 1) == 88.3 and round(hi * 100, 1) == 97.1
    lo, hi = wilson(11, 12)
    assert round(lo * 100, 1) == 64.6 and round(hi * 100, 1) == 98.5
    assert wilson(0, 0) is None


def test_mcnemar_boundary_cases():
    # v2만 맞힘 2, v3만 맞힘 10, 둘 다 맞힘 66, 둘 다 틀림 11 → p = 0.0386
    a = [True] * 2 + [False] * 10 + [True] * 66 + [False] * 11
    b = [False] * 2 + [True] * 10 + [True] * 66 + [False] * 11
    t = mcnemar(a, b)
    assert (t["앞만 맞힘"], t["뒤만 맞힘"]) == (2, 10) and round(t["p"], 4) == 0.0386
    assert mcnemar([True], [True])["p"] == 1.0
