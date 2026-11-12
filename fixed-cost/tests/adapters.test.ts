import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalog } from "../lib/catalog";
import { captureAdapter } from "../lib/adapters/capture";
import { csvAdapter, parseCsv } from "../lib/adapters/csv";
import { buildGmailQuery, gmailAdapter, parseGmailMessages } from "../lib/adapters/gmail";
import { listSamples, sampleAdapter } from "../lib/adapters/sample";
import { GmailMessageLiteSchema, TransactionSchema } from "../lib/schemas";
import { detectSubscriptionCandidates } from "../lib/rules";
import mailFixture from "./fixtures/gmail/messages.json";
import caseFixture from "../data/samples/persona-jaeun-case.json";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const csvHeader = "date,amount,raw_name,payment_method";
function mockMail(overrides: Partial<ReturnType<typeof GmailMessageLiteSchema.parse>> = {}) {
  return GmailMessageLiteSchema.parse({ ...mailFixture.messages[0], ...overrides });
}

describe("CSV", () => {
  it.each([csvHeader, "일자,금액,가맹점,결제수단", "\uFEFF금액,일자,결제수단,가맹점"])("영문·한글·BOM 헤더를 읽어요: %s", (header) => {
    const row = header.startsWith("\uFEFF") ? '"6,900원",2026-07-01,kakaopay,카카오페이' : '2026-07-01,"6,900원",카카오페이,kakaopay';
    const result = parseCsv(`${header}\r\n${row}\r\n`);
    expect(result.skipped).toEqual([]);
    expect(result.transactions[0]).toMatchObject({ date: "2026-07-01", amount: 6900, raw_name: "카카오페이", payment_method: "kakaopay", currency: "KRW", source: "csv" });
  });

  it.each(["2025.11.03", "2025-11-03", "25/11/03"])("날짜 예시를 ISO 날짜로 바꿔요: %s", (date) => {
    expect(parseCsv(`${csvHeader}\n${date},6900,가상 서비스,card`).transactions[0].date).toBe("2025-11-03");
  });

  it("인용 필드의 쉼표·큰따옴표·줄바꿈을 보존하고 오류 줄 번호를 유지해요", () => {
    const result = parseCsv(`${csvHeader}\n2026-07-01,6900,"가상, 서비스 ""테스트""\n추가 표기",card\n2026-02-30,1000,가상 서비스,card`);
    expect(result.transactions[0].raw_name).toBe('가상, 서비스 "테스트"\n추가 표기');
    expect(result.skipped).toEqual([{ line: 4, reason: "invalid_date" }]);
  });

  it.each(["date,amount,raw_name", "date,amount,raw_name,payment_method,date", "", '"date,amount,raw_name,payment_method'])(
    "깨지거나 중복된 필수 헤더를 거부해요", (header) => {
      expect(parseCsv(header)).toEqual({ transactions: [], skipped: [{ line: 1, reason: "invalid_header" }] });
    },
  );

  it.each(["-6900", "6900.5", "6,90", "9007199254740992", "USD 20", "NaN", ""])("잘못된 원화 금액을 건너뛰어요: %s", (amount) => {
    const result = parseCsv(`${csvHeader}\n2026-07-01,"${amount}",가상 서비스,card`);
    expect(result.transactions).toEqual([]);
    expect(result.skipped).toEqual([{ line: 2, reason: "invalid_amount" }]);
  });

  it.each(["2026-02-29", "2026-13-01", "2026.02/01", "", "invalid"])("존재하지 않거나 깨진 날짜를 건너뛰어요: %s", (date) => {
    expect(parseCsv(`${csvHeader}\n${date},6900,가상 서비스,card`).skipped).toEqual([{ line: 2, reason: "invalid_date" }]);
  });

  it("부분적으로 깨진 행을 보고하고 다음 정상 행을 계속 읽어요", () => {
    const result = parseCsv(`${csvHeader}\n2026-07-01,6900,가상 서비스\n2026-07-02,6900,"가상"잘못된문자,card\n2026-07-03,6900,가상 서비스,card`);
    expect(result.skipped).toEqual([{ line: 2, reason: "invalid_columns" }, { line: 3, reason: "invalid_csv" }]);
    expect(result.transactions).toHaveLength(1);
  });

  it("닫히지 않은 인용과 빈 결제 표기를 건너뛰어요", () => {
    expect(parseCsv(`${csvHeader}\n2026-07-01,6900,"가상 서비스,card`).skipped).toEqual([{ line: 2, reason: "invalid_csv" }]);
    expect(parseCsv(`${csvHeader}\n2026-07-01,6900,   ,card`).skipped).toEqual([{ line: 2, reason: "invalid_transaction" }]);
  });

  it("정규화한 결제 항목 4개가 같은 중복 행은 한 번만 처리해요", () => {
    const result = parseCsv(`${csvHeader}\n2026.07.01,"6,900원",가상 서비스,card\n26/07/01,6900,가상 서비스,card\n2026-07-01,6900,가상 서비스,apple`);
    expect(result.transactions).toHaveLength(2);
    expect(result.skipped).toEqual([{ line: 3, reason: "duplicate" }]);
    expect(new Set(result.transactions.map((item) => item.id)).size).toBe(2);
  });

  it("추가 열은 결과·id·오류 요약에 포함하지 않아요", () => {
    const result = parseCsv(`${csvHeader},추가메모\n2026-07-01,6900,가상 서비스,card,가상비공개표식`);
    expect(JSON.stringify(result)).not.toContain("가상비공개표식");
    expect(TransactionSchema.array().parse(result.transactions)).toEqual(result.transactions);
  });

  it("공통 어댑터는 Transaction 배열을 반환하고 비문자열은 안전하게 거부해요", async () => {
    await expect(csvAdapter.load(`${csvHeader}\n2026-07-01,6900,가상 서비스,card`)).resolves.toHaveLength(1);
    expect(() => parseCsv({ private: "가상비공개표식" })).toThrow("CSV 텍스트가 필요해요");
  });
});

describe("Gmail", () => {
  it("가짜 메일 13개에서 원화·외화·광고·중복·깨진 금액을 구분해요", () => {
    expect(mailFixture._mock).toBe(true);
    expect(mailFixture.messages).toHaveLength(13);
    const result = parseGmailMessages(GmailMessageLiteSchema.array().parse(mailFixture.messages), loadCatalog());
    expect(result.transactions.map((item) => item.amount)).toEqual([6900, 1100, 14900, 13500, 4900]);
    expect(result.skipped).toEqual([
      { message_id: "mock-mail-04", reason: "foreign_currency" },
      { message_id: "mock-mail-05", reason: "no_amount" },
      { message_id: "mock-mail-06", reason: "not_receipt" },
      { message_id: "mock-mail-01", reason: "duplicate" },
      { message_id: "mock-mail-10", reason: "no_amount" },
      { message_id: "mock-mail-11", reason: "no_amount" },
      { message_id: "mock-mail-12", reason: "no_amount" },
      { message_id: "mock-mail-13", reason: "not_receipt" },
    ]);
  });

  it.each(["₩6,900", "6,900원", "KRW 6,900"])("원화 표현을 읽어요: %s", (text) => {
    expect(parseGmailMessages([mockMail({ text })], loadCatalog()).transactions[0].amount).toBe(6900);
  });

  it.each(["USD 20", "US$20.00", "$20", "EUR 20", "회원용 USD 20"])("외화만 있으면 환산하지 않아요: %s", (text) => {
    expect(parseGmailMessages([mockMail({ text })], loadCatalog()).skipped[0].reason).toBe("foreign_currency");
  });

  it("명시된 원화가 있으면 그 금액만 읽고 외화를 계산에 쓰지 않아요", () => {
    expect(parseGmailMessages([mockMail({ text: "USD 20 / KRW 6,900" })], loadCatalog()).transactions[0].amount).toBe(6900);
  });

  it("한국 날짜 경계와 UTC 오프셋을 처리해요", () => {
    const result = parseGmailMessages([
      mockMail({ id: "timezone-a", received_at: "2026-08-31T16:00:00Z" }),
      mockMail({ id: "timezone-b", received_at: "2026-09-01T01:00:00+09:00" }),
    ], loadCatalog());
    expect(result.transactions.map((item) => item.date)).toEqual(["2026-09-01", "2026-09-01"]);
  });

  it("메일 원문·제목·발신 도메인은 Transaction으로 전달하지 않아요", () => {
    const result = parseGmailMessages([mockMail({ text: "₩6,900 가상비공개표식" })], loadCatalog());
    expect(Object.keys(result.transactions[0]).sort()).toEqual(["id", "date", "amount", "currency", "raw_name", "payment_method", "source"].sort());
    expect(JSON.stringify(result)).not.toContain("가상비공개표식");
  });

  it("형식·날짜·본문 길이 오류에는 원문 없는 오류를 내요", () => {
    for (const overrides of [{ received_at: "invalid" }, { text: "가상비공개표식".repeat(3000) }, { unexpected: "가상비공개표식" }]) {
      const call = () => parseGmailMessages([{ ...mockMail(), ...overrides }], loadCatalog());
      expect(call).toThrow("Gmail 메시지 형식·수신일·본문 길이를 확인해 주세요");
      try { call(); } catch (error) { expect(String(error)).not.toContain("가상비공개표식"); }
    }
  });

  it("다른 메일 id는 같은 금액이어도 삭제하지 않아요", () => {
    const result = parseGmailMessages([mockMail(), mockMail({ id: "another-message" })], loadCatalog());
    expect(result.transactions).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  it("확인된 카탈로그 도메인으로만 사업자를 식별하고 사칭 도메인은 거부해요", () => {
    const service = { ...loadCatalog().services[0], id: "kakaopay", email_domains: ["billing.example.invalid"] };
    const catalog = { services: [service] };
    const message = mockMail({ from_domain: "sub.billing.example.invalid", subject: "문서", text: "₩6,900" });
    expect(parseGmailMessages([message], catalog).transactions[0].payment_method).toBe("kakaopay");
    expect(parseGmailMessages([{ ...message, from_domain: "billing.example.invalid.attacker.invalid" }], catalog).skipped[0].reason).toBe("not_receipt");
    expect(parseGmailMessages([mockMail()], loadCatalog()).transactions[0].payment_method).toBe("unknown");
  });

  it("카탈로그 도메인과 키워드로만 검색어를 만들고 검색 문법 주입을 제외해요", () => {
    const catalog = loadCatalog();
    catalog.services[0].email_domains = ["billing.example.invalid", "BILLING.EXAMPLE.INVALID", "evil.invalid} after:1900/01/01 {"];
    const stores = "from:no_reply@email.apple.com from:googleplay-noreply@google.com";
    expect(buildGmailQuery(catalog)).toBe(`newer_than:6m {from:billing.example.invalid ${stores} 영수증 결제 receipt invoice payment}`);
    expect(buildGmailQuery(loadCatalog())).toBe(`newer_than:6m {${stores} 영수증 결제 receipt invoice payment}`);
    expect(loadCatalog().services[0].email_domains).toEqual([]);
  });

  it("공통 Gmail 어댑터도 변환만 하고 외부 호출·로그를 하지 않아요", async () => {
    const network = vi.fn(() => { throw new Error("외부 호출 금지"); });
    vi.stubGlobal("fetch", network);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(gmailAdapter.load([mockMail()])).resolves.toHaveLength(1);
    expect(network).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    await expect(gmailAdapter.load({ messages: [] })).rejects.toThrow("Gmail 메시지 배열이 필요해요");
  });
});

describe("샘플과 B2 통합", () => {
  it("입력 방식이 달라도 같은 공통 결제 필드를 만들어요", async () => {
    const sample = (await sampleAdapter.load("persona-1")).find((item) => item.id === "sample-p1-icloud-7")!;
    const catalog = { services: [{ ...loadCatalog().services[0], id: "apple", email_domains: ["cloud.example.invalid"] }] };
    const gmail = parseGmailMessages([mockMail({ from_name: "iCloud+", from_domain: "cloud.example.invalid", received_at: "2026-07-15T00:00:00Z", text: "1,100원" })], catalog).transactions[0];
    const csv = parseCsv(`${csvHeader}\n2026-07-15,1100,iCloud+,apple`).transactions[0];
    const fields = ({ date, amount, currency, raw_name, payment_method }: typeof sample) => ({ date, amount, currency, raw_name, payment_method });
    expect(fields(gmail)).toEqual(fields(sample));
    expect(fields(csv)).toEqual(fields(sample));
  });

  it.each([["persona-1", 18, 5], ["persona-2", 18, 5], ["persona-3", 17, 4]] as const)(
    "%s: 결제 %s건에서 심은 구독 %s개만 찾아요", async (id, count, expected) => {
      const transactions = await sampleAdapter.load(id);
      const catalog = loadCatalog();
      expect(transactions).toHaveLength(count);
      expect(new Set(transactions.map((item) => item.date.slice(0, 7))).size).toBe(3);
      expect(TransactionSchema.array().parse(transactions)).toEqual(transactions);
      expect(new Set(transactions.map((item) => item.id)).size).toBe(count);
      for (const transaction of transactions.filter((item) => !item.id.includes("-oneoff-"))) {
        const service = catalog.services.find((service) => transaction.id.includes(`-${service.id}-`));
        expect(service?.plans.some((plan) => plan.price === transaction.amount)).toBe(true);
      }
      const candidates = detectSubscriptionCandidates(transactions, catalog);
      expect(candidates).toHaveLength(expected);
      expect(candidates.flatMap((candidate) => candidate.transaction_ids).some((id) => id.includes("-oneoff-"))).toBe(false);
      expect(candidates.flatMap((candidate) => candidate.transaction_ids).sort()).toEqual(
        transactions.filter((item) => !item.id.includes("-oneoff-")).map((item) => item.id).sort(),
      );
    },
  );

  it("샘플 목록과 반환 데이터가 수정돼도 원본은 유지돼요", async () => {
    expect(listSamples()).toHaveLength(3);
    expect(listSamples().map((sample) => sample.id)).not.toContain("persona-jaeun-case");
    const samples = listSamples(); samples[0].name = "수정";
    const first = await sampleAdapter.load("persona-1"); first[0].amount = 0;
    expect(listSamples()[0].name).toBe("구독 많은 학생");
    expect((await sampleAdapter.load("persona-1"))[0].amount).toBe(13500);
    await expect(sampleAdapter.load("persona-jaeun-case")).rejects.toThrow("등록된 샘플 id가 필요해요");
  });

  it("기준 사례 8개를 별도 형식으로 보관하고 미확인 금액은 null이에요", () => {
    expect(caseFixture._note).toContain("Transaction[]이 아닌");
    expect(caseFixture.subscriptions).toHaveLength(8);
    for (const id of ["claude_pro", "genie_music", "tving"]) {
      expect(caseFixture.subscriptions.find((item) => item.service_id === id)?.amount).toBeNull();
    }
    expect(TransactionSchema.array().safeParse(caseFixture).success).toBe(false);
  });

  it.todo("팀 확인 후 Claude Pro 원화 금액 기준 사례를 검증해요");
  it.todo("팀 확인 후 지니뮤직 원화 금액 기준 사례를 검증해요");
  it.todo("팀 확인 후 티빙 원화 금액 기준 사례를 검증해요");

  it("화면 캡처는 명세의 자리 표시자로만 남겨요", async () => {
    await expect(captureAdapter.load(null)).rejects.toThrow("not implemented");
  });
});
