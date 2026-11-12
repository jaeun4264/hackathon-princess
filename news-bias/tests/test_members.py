"""국회의원 소속 사전 테스트 (지어낸 이름·정당만 사용)"""
import httpx
import pytest

from app import members as M

MEMBERS = {"서가람": "더불어민주당", "박나래": "국민의힘", "김다솜": "무소속", "박바다": "국민의힘"}


def test_party_to_source():
    assert M.party_to_source("더불어민주당") == ("정부·여당", None)
    assert M.party_to_source("국민의힘") == ("야당", None)
    assert M.party_to_source("조국혁신당") == ("야당", None)
    assert M.party_to_source("무소속") == ("기타", "무소속 의원")


def test_resolve_full_and_short_names():
    earlier = ["더불어민주당 소속 서가람 법사위원장이 회의를 열었다.", "국민의힘 박나래 의원은 반발했다."]
    assert M.resolve("서가람 위원장", "…", earlier, MEMBERS) == "서가람"
    assert M.resolve("서 위원장", "서 위원장은 말했다.", earlier, MEMBERS) == "서가람"   # 앞에 나온 서씨 의원
    assert M.resolve(None, "김다솜 의원은 \"반대한다\"고 말했다.", [], MEMBERS) == "김다솜"
    # 말한 사람은 '서 위원장'인데 문장 뒤쪽에 말을 들은 다른 의원 이름이 있어도 헷갈리지 않음 (1차 N04-8에서 실제로 틀렸던 경우)
    assert M.resolve("서 위원장", "서 위원장은 박나래 의원에게 \"자리에 앉으라\"고 말했다.", earlier, MEMBERS) == "서가람"
    assert M.resolve(None, "회의에서는 \"표결하자\"는 말이 나왔고 이를 두고 박나래 의원이 반발했다.", [], MEMBERS) is None
    # 앞에 박씨 의원이 둘이면 누구인지 모르므로 고치지 않음
    assert M.resolve("박 의원", "박 의원은 말했다.", earlier + ["박바다 의원도 나섰다."], MEMBERS) is None
    assert M.resolve("법무부 장관", "장관은 말했다.", earlier, MEMBERS) is None


def test_fix_labels():
    texts = {1: "더불어민주당 소속 서가람 법사위원장이 회의를 열었다.",
             2: "서 위원장은 \"표결하겠다\"고 말했다.",
             3: "법무부는 \"검토하겠다\"고 밝혔다."}
    labels = {1: {"type": "사실", "source": None, "detail": None, "speaker": None, "framing": []},
              2: {"type": "인용", "source": "기타", "detail": "서 위원장", "speaker": "서 위원장", "framing": []},
              3: {"type": "인용", "source": "정부·여당", "detail": None, "speaker": "법무부", "framing": []}}
    assert M.fix_labels(labels, texts, MEMBERS) == 1
    assert (labels[2]["source"], labels[2]["detail"]) == ("정부·여당", None)
    assert labels[3]["source"] == "정부·여당"   # 사전에 없는 사람은 그대로


def test_load_drops_homonyms_with_different_parties(tmp_path):
    p = tmp_path / "m.csv"
    p.write_text("이름,정당\n서가람,더불어민주당\n서가람,국민의힘\n박나래,국민의힘\n", encoding="utf-8-sig")
    assert M.load(p) == {"박나래": "국민의힘"}


def test_download_pages():
    pages = {1: [{"HG_NM": "서가람", "POLY_NM": "더불어민주당"}], 2: [{"HG_NM": "박나래", "POLY_NM": "국민의힘"}]}

    def handler(req):
        page = int(req.url.params["pIndex"])
        return httpx.Response(200, json={"nwvrqwxyaytdsfvhu": [
            {"head": [{"list_total_count": 2}, {"RESULT": {"CODE": "INFO-000"}}]}, {"row": pages[page]}]})
    rows = M.download("k", httpx.Client(transport=httpx.MockTransport(handler)))
    assert rows == [("서가람", "더불어민주당"), ("박나래", "국민의힘")]


def test_download_error_message():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda req: httpx.Response(200, json={"RESULT": {"CODE": "ERROR-290", "MESSAGE": "인증키가 유효하지 않습니다."}})))
    with pytest.raises(SystemExit, match="인증키"):
        M.download("bad", client)
