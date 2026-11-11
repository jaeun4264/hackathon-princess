"""기사 원문 본문 가져오기 (11/7 결정: 원문 자동 수집, 분석 후 버림)

- 본문은 메모리에서 문장으로 나눠 AI 분석에만 쓰고 파일로 저장하지 않습니다.
  남는 것은 라벨(사실/의견/인용, 출처 유형, 인용한 사람)과 의견 문장 앞 40자뿐입니다.
- 언론사 사이트의 robots.txt 가 막아 둔 주소는 가져오지 않습니다.
- 사이트마다 짧게 쉬어 가며 요청하고, 실패하면 그 기사만 건너뜁니다.
"""
import html as htmllib
import json
import re
import sys
import time
import urllib.robotparser
from urllib.parse import urlparse

import httpx

ROBOT_NAME = "NewsBiasHackathonBot"  # robots.txt 규칙을 확인할 때 쓰는 이름
# 앞부분은 일반 브라우저와 같은 형식 (SBS처럼 브라우저가 아니면 "지원하지 않는 브라우저" 안내만 주는 사이트가 있어서).
# 정체는 그대로 밝힘: compatible; NewsBiasHackathonBot
USER_AGENT = (f"Mozilla/5.0 (compatible; {ROBOT_NAME}/0.2; student hackathon; analysis only, no storage) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
MIN_CHARS = 300  # 본문이 이보다 짧으면 제대로 못 읽은 것으로 보고 건너뜀


class FetchError(Exception):
    pass


class Fetcher:
    def __init__(self, client: httpx.Client | None = None, delay: float = 1.0):
        self.client = client or httpx.Client(timeout=20, follow_redirects=True, headers={"User-Agent": USER_AGENT})
        self.delay = delay
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._last: dict[str, float] = {}

    def allowed(self, url: str) -> bool:
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                res = self.client.get(base + "/robots.txt")
                if res.status_code == 200:
                    rp.parse(res.text.splitlines())
                else:
                    rp.parse([])  # robots.txt 가 없으면 허용
                self._robots[base] = rp
            except httpx.HTTPError:
                self._robots[base] = None  # 확인 못 하면 가져오지 않음
        rp = self._robots[base]
        return bool(rp and rp.can_fetch(ROBOT_NAME, url))

    def _wait(self, url: str) -> None:
        host = urlparse(url).netloc
        gap = time.monotonic() - self._last.get(host, 0)
        if gap < self.delay:
            time.sleep(self.delay - gap)
        self._last[host] = time.monotonic()

    def read(self, res: httpx.Response, url: str) -> tuple[str, str, str]:
        """받은 페이지 → (본문, 읽은 방법, 실제로 읽은 주소).
        그 페이지에서 못 읽으면 같은 기사의 다른 주소를 차례로 시도: 대표 주소(canonical·og:url) →
        추적용 덧붙임(plink·cooper 등)을 뺀 주소 → 짧은 안내 페이지가 보내는 주소. 모두 robots.txt 확인"""
        text, how = extract_how(res.text, url)
        if len(text) >= MIN_CHARS:
            return text, how, url
        tried = {url}
        for target in alternatives(res.text, url):
            if target in tried or not self.allowed(target):
                continue
            tried.add(target)
            self._wait(target)
            try:
                nxt = self.client.get(target)
            except httpx.HTTPError:
                continue
            if nxt.status_code != 200:
                continue
            t2, how2 = extract_how(nxt.text, target)
            if len(t2) >= MIN_CHARS:
                return t2, how2, target
        return text, how, url

    def body(self, url: str) -> str:
        """원문 주소 → 본문 글자 (저장하지 않음). 못 가져오면 FetchError"""
        if not url.startswith(("http://", "https://")):
            raise FetchError("원문 주소가 없음")
        if not self.allowed(url):
            raise FetchError("robots.txt 가 허용하지 않음")
        self._wait(url)
        try:
            res = self.client.get(url)
        except httpx.HTTPError as e:
            raise FetchError(f"연결 실패: {e}") from e
        if res.status_code != 200:
            raise FetchError(f"HTTP {res.status_code}")
        text, _, _ = self.read(res, url)
        if len(text) < MIN_CHARS:
            raise FetchError(f"본문이 너무 짧음 ({len(text)}자) — 유료 기사이거나 읽기 실패")
        return text


HANGUL = re.compile(r"[가-힣]")
SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
JSON_STR = re.compile(r'"((?:[^"\\]|\\.){200,})"')
TAG = re.compile(r"<br\s*/?>|</p>|</div>", re.I)


def _clean(s: str) -> str:
    s = TAG.sub("\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = htmllib.unescape(s)
    return "\n".join(line.strip() for line in s.splitlines() if line.strip())


MAX_BODY = 12000  # 기사 하나로 보기엔 너무 긴 글(페이지 전체 글자를 모은 것)은 본문으로 안 봄
ARTICLE_BODY = re.compile(r'"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"')
SENTENCE_END = re.compile(r'(다|요|음|함)[.?!]?["”’\']?\s*$|[.?!]["”’\']?\s*$')


def _unquote(raw: str) -> str | None:
    try:
        return json.loads('"' + raw + '"')
    except ValueError:
        return None


def _leaves(text: str, depth: int = 0):
    """스크립트 글 → 그 안의 JSON 문자열들을 문서 순서대로 (JSON 안에 다시 JSON 이 든 Next.js 데이터까지 풀어 봄)"""
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"', text):
        s = _unquote(m.group(1))
        if not s:
            continue
        if depth < 3 and '":' in s or (depth < 3 and s.lstrip()[:1] in "[{" and '"' in s):
            yield from _leaves(s, depth + 1)
        else:
            yield s


def _looks_like_body(s: str) -> bool:
    return len(HANGUL.findall(s)) >= 150 and s.count("다.") >= 3 and len(s) <= MAX_BODY


def _sentence_like(s: str) -> bool:
    return len(HANGUL.findall(s)) >= 15 and bool(SENTENCE_END.search(s.strip()))


def from_scripts(html: str) -> tuple[str, str]:
    """본문을 자바스크립트로 채우는 사이트용 (글, 찾은 곳)
    1) 검색엔진용 기사 정보(JSON-LD)의 articleBody  2) 페이지 데이터 안의 긴 기사 글 하나
    3) 문단이 하나씩 따로 들어 있으면, 문장처럼 끝나는 글이 이어진 구간 중 가장 긴 것"""
    scripts = SCRIPT.findall(html)
    best = ""
    for sc in scripts:
        for m in ARTICLE_BODY.finditer(sc):
            cand = _clean(_unquote(m.group(1)) or "")
            if _looks_like_body(cand) and len(cand) > len(best):
                best = cand
    if best:
        return best, "JSON-LD"
    leaves = [x for sc in scripts for x in _leaves(sc)]
    for x in leaves:
        cand = _clean(x)
        if _looks_like_body(cand) and len(cand) > len(best):
            best = cand
    if best:
        return best, "데이터 글"
    blocks, cur, gap = [], [], 0
    for x in leaves:
        c = _clean(x)
        if _sentence_like(c) and len(c) <= 2000:  # 문단 하나로 보기엔 너무 긴 글은 끊는 곳으로
            cur.append(c)
            gap = 0
        elif cur:
            gap += 1 if len(c) <= 2000 else 99
            if gap > 3:
                blocks.append(cur)
                cur, gap = [], 0
    if cur:
        blocks.append(cur)
    joined = [("\n".join(dict.fromkeys(b))) for b in blocks]
    joined = [j for j in joined if _looks_like_body(j)]
    return (max(joined, key=len), "데이터 문단") if joined else ("", "")


REDIRECT = re.compile(r'<meta[^>]+http-equiv=["\']?refresh["\']?[^>]+url=([^"\'>\s]+)|location\.(?:href\s*=|replace\()\s*["\']([^"\']+)["\']', re.I)
TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
CANONICAL = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)|<meta[^>]+property=["\']og:url["\'][^>]+content=["\']([^"\']+)', re.I)
ID_PARAM = re.compile(r"id|no|seq|ncd|idx|key", re.I)


def alternatives(html: str, url: str) -> list[str]:
    """같은 기사의 다른 주소 후보 (순서대로 시도)"""
    from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
    out = []
    for m in CANONICAL.finditer(html):
        out.append(urljoin(url, htmllib.unescape(m.group(1) or m.group(2))))
    p = urlsplit(url)
    if p.query:
        keep = [(k, v) for k, v in parse_qsl(p.query) if ID_PARAM.search(k)]
        out.append(urlunsplit((p.scheme, p.netloc, p.path, urlencode(keep), "")))
    r = redirect_target(html, url)
    if r:
        out.append(r)
    return [u for u in dict.fromkeys(out) if u.startswith(("http://", "https://")) and u != url]


def redirect_target(html: str, url: str) -> str | None:
    """짧은 안내 페이지가 자바스크립트·meta 로 다른 주소로 보내는 경우 그 주소"""
    if len(html) > 30000:
        return None
    m = REDIRECT.search(html)
    if not m:
        return None
    from urllib.parse import urljoin
    target = urljoin(url, htmllib.unescape(m.group(1) or m.group(2)))
    return target if target.startswith(("http://", "https://")) and target != url else None


def extract(html: str, url: str = "") -> str:
    """HTML → 본문 (문단마다 줄바꿈). 제목·메뉴·광고·댓글은 빼고 본문만"""
    return extract_how(html, url)[0]


def extract_how(html: str, url: str = "") -> tuple[str, str]:
    """(본문, 읽은 방법). 1) trafilatura 2) 페이지 안 데이터 3) trafilatura 넓게 읽기"""
    import trafilatura
    opts = dict(url=url or None, include_comments=False, include_tables=False)  # deduplicate 는 기사끼리 같은 문단을 지워서 끔
    text = trafilatura.extract(html, favor_precision=True, **opts) or trafilatura.extract(html, **opts) or ""
    if len(text) >= MIN_CHARS:
        return text, "본문"
    data, where = from_scripts(html)
    if len(data) >= MIN_CHARS:
        return data, f"페이지 데이터({where})"
    wide = trafilatura.extract(html, favor_recall=True, **opts) or ""
    if len(wide) >= MIN_CHARS:
        return wide, "넓게 읽기"
    return max((text, data, wide), key=len), "실패"


def diagnose(urls: list[tuple[str, str]], fetcher: "Fetcher | None" = None) -> list[dict]:
    """언론사별로 본문을 왜 못 읽는지 확인 (본문 글자는 출력하지 않음)"""
    f = fetcher or Fetcher()
    out = []
    for outlet, url in urls:
        r = {"언론사": outlet, "주소": url[:70]}
        try:
            if not f.allowed(url):
                r["결과"] = "robots.txt 가 막음"
                out.append(r)
                continue
            f._wait(url)
            res = f.client.get(url)
            first = res.text
            text, how, used = f.read(res, url)
            t = TITLE.search(first)
            r.update({"HTTP": res.status_code, "페이지 크기": len(first),
                      "다른 주소로 읽음": used[:60] if used != url else "-",
                      "페이지 제목": (htmllib.unescape(t.group(1)).strip()[:25] if t else "-"),
                      "본문 글자": len(text), "방법": how,
                      "본문 앞부분": text[:20].replace("\n", " "),
                      "자바스크립트 데이터": ",".join(k for k, pat in (("Next.js", "__NEXT_DATA__"), ("Next.js(RSC)", "__next_f"),
                                                             ("JSON-LD", "ld+json")) if pat in first) or "-",
                      "결과": "성공" if len(text) >= MIN_CHARS and res.status_code == 200 else "실패"})
        except httpx.HTTPError as e:
            r["결과"] = f"연결 실패 {type(e).__name__}"
        out.append(r)
    return out


def main(argv=None):
    """python -m app.fetch 확인 [언론사 ...]   → data/raw 의 수집 결과에서 언론사마다 기사 3개씩 읽어 보고 결과 표 출력"""
    import glob
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] != ["확인"]:
        sys.exit("사용법: python -m app.fetch 확인 [언론사 ...]  (예: python -m app.fetch 확인 뉴스1 JTBC SBS)")
    want = argv[1:] or ["뉴스1", "JTBC", "SBS", "MBC", "KBS", "YTN", "TV조선", "채널A", "MBN"]
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    files = sorted(glob.glob(str(root / "data" / "raw" / "*.json")), reverse=True)
    picked: dict[str, list[str]] = {o: [] for o in want}
    for fn in files:
        try:
            data = json.loads(Path(fn).read_text(encoding="utf-8"))
        except ValueError:
            continue
        for a in data.get("articles", []) if isinstance(data, dict) else []:
            o, u = a.get("outlet"), a.get("url")
            if o in picked and u and u not in picked[o] and len(picked[o]) < 3:
                picked[o].append(u)
    urls = [(o, u) for o, us in picked.items() for u in us]
    if not urls:
        sys.exit("data/raw 에 그 언론사 기사가 없습니다. 먼저 python -m app.collect 로 수집하세요.")
    for r in diagnose(urls):
        print(" | ".join(f"{k} {v}" for k, v in r.items() if k != "주소"))
    print("\n방법: 본문=보통 방식, 페이지 데이터(…)=자바스크립트용 데이터에서 읽음, 넓게 읽기=덜 엄격하게 읽음, 실패=못 읽음")
    print("본문 앞부분이 기사 첫 문장이 맞는지, 본문 글자 수가 기사 한 편 정도(보통 500~3000자)인지 봐 주세요.")


if __name__ == "__main__":
    main()
