"""AI 분석 테스트 — 실제 LLM 대신 가짜 응답을 씀 (지어낸 문장만 사용)"""
import json

import httpx
import pytest

from app import analyze as A
from app.labelsheet import read_rows

GOOD = {"sentences": [
    {"no": 1, "type": "사실", "source": None, "speaker": None, "framing": []},
    {"no": 2, "type": "인용", "source": "야당", "speaker": "가상당 대표", "framing": []},
    {"no": 3, "type": "의견", "source": None, "speaker": None, "framing": ["외면한", "문장에없는단어"]},
]}


@pytest.fixture
def rows(tables):
    return [r for r in read_rows(tables("t.xlsx")) if r.article_id == "N01"]


def cfg(provider):
    return {"provider": provider, "model": "test-model", "key": "k", "url": A.DEFAULT_URL[provider]}


def client_returning(*bodies, provider="gemini"):
    calls = []

    def handler(req):
        calls.append(json.loads(req.content))
        text = bodies[min(len(calls), len(bodies)) - 1]
        if provider == "anthropic":
            return httpx.Response(200, json={"content": [{"type": "text", "text": text}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


@pytest.mark.parametrize("provider", ["gemini", "openai", "anthropic"])
def test_analyze_parses_each_provider(rows, provider):
    client, calls = client_returning("```json\n" + json.dumps(GOOD, ensure_ascii=False) + "\n```", provider=provider)
    out = A.analyze_article(cfg(provider), "가람일보", rows, client)
    assert out[2] == {"type": "인용", "source": "야당", "detail": None, "speaker": "가상당 대표", "framing": []}
    assert out[3]["framing"] == ["외면한"]  # 문장에 없는 단어는 버림
    assert "1. 법안이 위원회를 통과했다." in json.dumps(calls[0], ensure_ascii=False)


def test_retry_when_sentence_missing(rows):
    bad = json.dumps({"sentences": GOOD["sentences"][:2]}, ensure_ascii=False)
    client, calls = client_returning(bad, json.dumps(GOOD, ensure_ascii=False))
    out = A.analyze_article(cfg("gemini"), "가람일보", rows, client)
    assert len(calls) == 2 and "빠진 문장 번호" in calls[1]["messages"][-1]["content"]
    assert set(out) == {1, 2, 3}


def test_invalid_type_rejected(rows):
    wrong = json.loads(json.dumps(GOOD))
    wrong["sentences"][0]["type"] = "주장"
    client, _ = client_returning(*[json.dumps(wrong, ensure_ascii=False)] * 3)
    with pytest.raises(A.LLMError):
        A.analyze_article(cfg("gemini"), "가람일보", rows, client)


def test_cache_used(rows, tmp_path):
    cache = tmp_path / "N01.json"
    client, calls = client_returning(json.dumps(GOOD, ensure_ascii=False))
    A.analyze_article(cfg("gemini"), "가람일보", rows, client, cache)
    A.analyze_article(cfg("gemini"), "가람일보", rows, client, cache)
    assert len(calls) == 1 and cache.exists()


def test_bad_key_message(rows):
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, text="no")))
    with pytest.raises(A.LLMError, match="API 키"):
        A.analyze_article(cfg("gemini"), "가람일보", rows, client)


def test_prompt_mentions_ruling_party():
    assert "여당(더불어민주당)" in A.SYSTEM_PROMPT


def test_original_name_instead_of_etc(rows):
    body = json.loads(json.dumps(GOOD))
    body["sentences"][1]["source"] = "무소속 의원"
    client, _ = client_returning(json.dumps(body, ensure_ascii=False))
    out = A.analyze_article(cfg("gemini"), "가람일보", rows, client)
    assert out[2]["source"] == "기타" and out[2]["detail"] == "무소속 의원"


def test_literal_etc_is_retried(rows):
    body = json.loads(json.dumps(GOOD))
    body["sentences"][1]["source"] = "기타"
    client, calls = client_returning(json.dumps(body, ensure_ascii=False), json.dumps(GOOD, ensure_ascii=False))
    A.analyze_article(cfg("gemini"), "가람일보", rows, client)
    assert len(calls) == 2 and "원래 명칭" in calls[1]["messages"][-1]["content"]


@pytest.fixture
def clean_env(monkeypatch, tmp_path):
    monkeypatch.setattr(A, "ROOT", tmp_path)  # 진짜 .env 를 읽지 않게
    for k in ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY", "LLM_BASE_URL", "GEMINI_API_KEY", "GEMINI_MODEL",
              "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "CLAUDE_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL"]:
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


def test_config_per_provider_keys(clean_env):
    clean_env.setenv("GEMINI_API_KEY", "g")
    clean_env.setenv("ANTHROPIC_API_KEY", "c")
    g, c = A.config("gemini"), A.config("claude")
    assert (g["provider"], g["key"], g["model"]) == ("gemini", "g", "gemini-3.8-flash")
    assert (c["provider"], c["key"], c["model"]) == ("anthropic", "c", A.DEFAULT_MODEL["anthropic"])
    assert c["url"] == A.DEFAULT_URL["anthropic"]


def test_config_legacy_llm_keys_still_work(clean_env):
    clean_env.setenv("LLM_PROVIDER", "gemini")
    clean_env.setenv("LLM_API_KEY", "old")
    clean_env.setenv("LLM_MODEL", "gemini-x")
    assert A.config()["key"] == "old" and A.config("gemini")["model"] == "gemini-x"
    with pytest.raises(A.LLMError, match="ANTHROPIC_API_KEY"):  # 예전 키를 Claude에 잘못 쓰지 않음
        A.config("claude")


def test_config_unknown_model(clean_env):
    with pytest.raises(A.LLMError):
        A.config("llama")


def test_compare_two_gemini_models(clean_env):
    clean_env.setenv("GEMINI_API_KEY", "g")
    a = A.config(*A.parse_choice("gemini-3.8-flash"))
    b = A.config(*A.parse_choice("gemini-3.5-flash-lite"))
    assert (a["provider"], a["model"]) == ("gemini", "gemini-3.8-flash")
    assert (b["provider"], b["model"]) == ("gemini", "gemini-3.5-flash-lite") and b["key"] == "g"
    assert A.parse_choice("claude") == ("claude", None)


def test_groq_needs_model_name(clean_env):
    clean_env.setenv("GROQ_API_KEY", "q")
    with pytest.raises(A.LLMError, match="GROQ_MODEL"):
        A.config("groq")
    c = A.config(*A.parse_choice("groq:some-open-model"))
    assert c["model"] == "some-open-model" and c["url"].startswith("https://api.groq.com")


def test_chunks():
    rs = list(range(25))
    assert A.chunks(rs, 0) == [rs]
    assert [len(c) for c in A.chunks(rs, 10)] == [10, 10, 5]


def test_groq_model_names_with_slash(clean_env):
    clean_env.setenv("GROQ_API_KEY", "q")
    c = A.config(*A.parse_choice("groq:openai/gpt-oss-120b"))
    assert c["provider"] == "groq" and c["model"] == "openai/gpt-oss-120b"
    assert A.safe_name(c["model"]) == "openai_gpt-oss-120b"


def test_timeout_is_retried(rows, monkeypatch):
    monkeypatch.setattr(A.time, "sleep", lambda s: None)
    n = {"calls": 0}

    def handler(req):
        n["calls"] += 1
        if n["calls"] == 1:
            raise httpx.ReadTimeout("timed out", request=req)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(GOOD, ensure_ascii=False)}}]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    got = A.analyze_article(cfg("gemini"), "가람일보", rows, client)
    assert n["calls"] == 2 and got[2]["type"] == "인용"


def test_run_records_speed(tables, tmp_path, monkeypatch):
    from app import evaluate as E
    src = tables("원본.xlsx")
    monkeypatch.setattr(A, "CACHE_DIR", tmp_path / "ai")
    monkeypatch.setattr(A, "LABEL_DIR", tmp_path)

    def handler(req):
        nos = [int(l.split(".")[0]) for l in json.loads(req.content)["messages"][-1]["content"].splitlines() if l[:1].isdigit()]
        body = {"sentences": [{"no": n, "type": "사실", "source": None, "speaker": None, "framing": []} for n in nos]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(body)}}],
                                         "usage": {"prompt_tokens": 100, "completion_tokens": 40}})

    real = httpx.Client
    monkeypatch.setattr(A.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler)))
    dst = A.run(cfg("gemini"), src, again=False, gap=0)
    st = E.run_stats(dst)
    assert st["기사"] == 2 and st["출력 토큰"] == 80 and st["기사당 초"] is not None and st["완전"]
    assert E.run_stats(src) is None  # 사람 표에는 실행 기록이 없음
    # 두 번째 실행은 저장된 응답 + 저장된 시간 기록을 그대로 씀
    dst2 = A.run(cfg("gemini"), src, again=False, gap=0)
    assert E.run_stats(dst2)["출력 토큰"] == 80


def test_effort_sent_and_named(rows):
    c = cfg("gemini") | {"effort": "low"}
    client, calls = client_returning(json.dumps(GOOD, ensure_ascii=False))
    A.analyze_article(c, "가람일보", rows, client)
    assert calls[0]["reasoning_effort"] == "low"
    assert A.run_name(c) == "test-model_생각low_p2" and A.run_name(cfg("gemini")) == "test-model_p2"
    client, calls = client_returning(json.dumps(GOOD, ensure_ascii=False))
    A.analyze_article(cfg("gemini"), "가람일보", rows, client)
    assert "reasoning_effort" not in calls[0]


def test_daily_limit_message(rows, monkeypatch):
    monkeypatch.setattr(A.time, "sleep", lambda s: None)
    client = httpx.Client(transport=httpx.MockTransport(
        lambda req: httpx.Response(429, text='{"error": "Quota exceeded for GenerateRequestsPerDayPerProjectPerModel"}')))
    with pytest.raises(A.LLMError, match="오후 5시"):
        A.call_llm(cfg("gemini"), "s", "u", client)


def test_overloaded_server_message(monkeypatch):
    monkeypatch.setattr(A.time, "sleep", lambda s: None)
    client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(503, text="The model is overloaded")))
    with pytest.raises(A.LLMError, match="서버가 붐벼서"):
        A.call_llm(cfg("gemini"), "s", "u", client)


def test_source_synonyms_normalized():
    assert A.Label(no=1, type="인용", source="여당").source == "정부·여당"
    assert A.Label(no=1, type="인용", source="더불어민주당").source == "정부·여당"
    assert A.Label(no=1, type="인용", source="야권").source == "야당"
    assert A.Label(no=1, type="인용", source="무소속 의원").source == "무소속 의원"


def test_list_models(monkeypatch):
    def fake_get(url, headers, timeout):
        assert url == "https://api.groq.com/openai/v1/models"
        return httpx.Response(200, json={"data": [{"id": "openai/gpt-oss-20b"}, {"id": "llama-3.3-70b-versatile"}]})
    monkeypatch.setattr(A.httpx, "get", fake_get)
    c = {"provider": "groq", "model": "x", "key": "k", "url": A.DEFAULT_URL["groq"]}
    assert A.list_models(c) == ["llama-3.3-70b-versatile", "openai/gpt-oss-20b"]


def test_prompt_v2_rules():
    p = A.SYSTEM_PROMPT
    assert "국민의힘" in p and "모두 야당" in p          # 지금의 여야 구도
    assert "외치며 퇴장했다" in p                      # 말+행동 → 인용
    assert "평가 단어가 있든 없든 의견" in p            # 기자의 예측 → 의견


def test_examples_go_into_prompt(tmp_path):
    p = tmp_path / "예시.csv"
    p.write_text("문장,유형,출처유형,인용한사람\n가람시가 요금을 올렸다.,사실,,\n"
                 "가상당 대표는 \"반대한다\"고 말했다.,인용,야당,가상당 대표\n엉뚱한 줄,모름,,\n", encoding="utf-8-sig")
    ex = A.load_examples(p)
    assert len(ex) == 2
    c = cfg("gemini") | {"examples": ex, "examples_name": "보강1"}
    sp = A.system_prompt(c)
    assert "[예시]" in sp and "→ 인용 / 야당 / 가상당 대표" in sp
    assert A.system_prompt(cfg("gemini")) == A.SYSTEM_PROMPT
    assert A.run_name(c).endswith("_예시보강1")
    assert A.output_name(c | {"members": {"x": "y"}}).endswith("_사전")


def test_second_round_output_does_not_overwrite_first(tables, tmp_path, monkeypatch):
    import shutil
    src = tmp_path / "라벨링표_2차.xlsx"
    shutil.copy(tables("원본.xlsx"), src)
    monkeypatch.setattr(A, "CACHE_DIR", tmp_path / "ai")
    monkeypatch.setattr(A, "LABEL_DIR", tmp_path)

    def handler(req):
        nos = [int(l.split(".")[0]) for l in json.loads(req.content)["messages"][-1]["content"].splitlines() if l[:1].isdigit()]
        body = {"sentences": [{"no": n, "type": "사실", "source": None, "speaker": None, "framing": []} for n in nos]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(body)}}]})

    real = httpx.Client
    monkeypatch.setattr(A.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler)))
    dst = A.run(cfg("gemini"), src, again=False, gap=0)
    assert dst.name == "라벨링표_AI_test-model_p2_2차.xlsx"
