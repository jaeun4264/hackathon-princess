"""기사 원문 본문 가져오기 (11/7 결정: 원문 자동 수집, 분석 후 버림)

- 본문은 메모리에서 문장으로 나눠 AI 분석에만 쓰고 파일로 저장하지 않습니다.
  남는 것은 라벨(사실/의견/인용, 출처 유형, 인용한 사람)과 의견 문장 앞 40자뿐입니다.
- 언론사 사이트의 robots.txt 가 막아 둔 주소는 가져오지 않습니다.
- 사이트마다 짧게 쉬어 가며 요청하고, 실패하면 그 기사만 건너뜁니다.
"""
import time
import urllib.robotparser
from urllib.parse import urlparse

import httpx

USER_AGENT = "NewsBiasHackathonBot/0.1 (student hackathon; analysis only, no storage)"
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
        return bool(rp and rp.can_fetch(USER_AGENT, url))

    def _wait(self, url: str) -> None:
        host = urlparse(url).netloc
        gap = time.monotonic() - self._last.get(host, 0)
        if gap < self.delay:
            time.sleep(self.delay - gap)
        self._last[host] = time.monotonic()

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
        text = extract(res.text, url)
        if len(text) < MIN_CHARS:
            raise FetchError(f"본문이 너무 짧음 ({len(text)}자) — 유료 기사이거나 읽기 실패")
        return text


def extract(html: str, url: str = "") -> str:
    """HTML → 본문 (문단마다 줄바꿈). 제목·메뉴·광고·댓글은 빼고 본문만"""
    import trafilatura
    opts = dict(url=url or None, include_comments=False, include_tables=False)  # deduplicate 는 기사끼리 같은 문단을 지워서 끔
    # 정확도 우선으로 먼저 읽고, 못 읽으면(짧은 페이지 등) 기본 설정으로 다시
    text = trafilatura.extract(html, favor_precision=True, **opts) or trafilatura.extract(html, **opts)
    return text or ""
