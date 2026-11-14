"""방송 기사 [이름 / 직함] 줄은 따로 세지 않고 다음 발언 문장 앞에 붙임 (11/14 확정)"""
from app.labeling import body_to_sentences as b


def test_tag_lines_attach_to_next_sentence():
    assert b('[홍길동 / 국민의힘 의원]\n"이건 잘못된 결정입니다."\n앵커가 말했다.') == \
        ['[홍길동 / 국민의힘 의원] "이건 잘못된 결정입니다."', '앵커가 말했다.']
    assert b('<인터뷰> 김철수 / 시민\n"너무 비싸요."') == ['[김철수 / 시민] "너무 비싸요."']
    assert b('<녹취> 홍길동/의원\n"반대합니다."') == ['[홍길동 / 의원] "반대합니다."']


def test_not_a_tag():
    assert b("가격은 1/2로 줄었다.") == ["가격은 1/2로 줄었다."]


def test_fetch_bodies_fills_empty_files(tmp_path, monkeypatch):
    import httpx
    from app import labeling as Lb
    from app.fetch import Fetcher
    monkeypatch.setattr(Lb, "round_paths", lambda n: (tmp_path, tmp_path / "t.xlsx"))
    (tmp_path / "F01_가람일보.txt").write_text("# 가람일보 | 요금 인상\n# 원문: https://a.test/1\n# 안내\n", encoding="utf-8-sig")
    (tmp_path / "F02_나래일보.txt").write_text("# 나래일보 | x\n# 원문: https://a.test/2\n이미 붙여 넣은 본문이다.\n", encoding="utf-8-sig")
    body = "".join(f"<p>가람시는 {i}일 요금 인상안을 발표했다. 시 관계자는 적자가 크다고 말했다.</p>" for i in range(1, 12))

    def site(req):
        if req.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, text=f"<html><body><article>{body}</article></body></html>")
    res = dict(Lb.fetch_bodies(3, Fetcher(httpx.Client(transport=httpx.MockTransport(site)), delay=0)))
    assert res["F02_나래일보.txt"] == "이미 본문 있음" and res["F01_가람일보.txt"].endswith("자")
    assert "가람시는 1일" in (tmp_path / "F01_가람일보.txt").read_text(encoding="utf-8-sig")


def test_lead_subtitle_and_recommend_line_removed():
    raw = '“오늘 돌아보니 표현 과해… 사과드려”\n최 최고위원은 11일 사과했다.\n이 기사를 추천합니다.'
    assert b(raw) == ["최 최고위원은 11일 사과했다."]
    assert b('"이간 영상 찍으려 한다는 주장은 허위사실"\n이 전 시의원은 고발했다.') == ["이 전 시의원은 고발했다."]
    assert b('최 최고위원은 "사과드린다"고 말했다.\n다음 문장이다.') == ['최 최고위원은 "사과드린다"고 말했다.', "다음 문장이다."]


def test_lead_subtitle_after_header_lines():
    raw = "# 가람일보 | 제목\n# 원문: https://a.test\n“오늘 돌아보니 표현 과해… 사과드려”\n최 최고위원은 사과했다."
    assert b(raw) == ["최 최고위원은 사과했다."]
