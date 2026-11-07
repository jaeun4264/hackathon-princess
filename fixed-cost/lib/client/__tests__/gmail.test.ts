import { describe, expect, it } from "vitest";
import { decodeBase64Url, parseFrom, stripHtml, toGmailMessageLite } from "../gmail";

const b64url = (text: string) => Buffer.from(text, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("Gmail 메시지 줄이기", () => {
  it("base64url(한글 포함)을 풀어요", () => {
    expect(decodeBase64Url(b64url("결제 금액 ₩13,500"))).toBe("결제 금액 ₩13,500");
  });

  it("발신자에서 이름과 도메인을 나눠요", () => {
    expect(parseFrom('"Netflix" <info@account.netflix.com>')).toEqual({ name: "Netflix", domain: "account.netflix.com" });
    expect(parseFrom("no-reply@example.com")).toEqual({ name: "no-reply", domain: "example.com" });
  });

  it("HTML 태그·스크립트를 지우고 글자만 남겨요", () => {
    expect(stripHtml("<style>x{}</style><p>합계&nbsp;<b>&#8361;1,100</b></p><script>alert(1)</script>")).toBe("합계 ₩1,100");
  });

  it("text/plain을 먼저 쓰고, 없으면 HTML을 써요", () => {
    const base = { id: "m1", internalDate: String(Date.UTC(2026, 8, 15)), payload: { headers: [{ name: "From", value: "넷플릭스 <a@mock.example.invalid>" }, { name: "Subject", value: "영수증" }] } };
    const plain = toGmailMessageLite({ ...base, payload: { ...base.payload, mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: b64url("<b>HTML</b>") } },
      { mimeType: "text/plain", body: { data: b64url("플레인 ₩13,500") } },
    ] } });
    expect(plain).toEqual({ id: "m1", received_at: "2026-09-15T00:00:00.000Z", from_name: "넷플릭스", from_domain: "mock.example.invalid", subject: "영수증", text: "플레인 ₩13,500" });
    const html = toGmailMessageLite({ ...base, payload: { ...base.payload, mimeType: "text/html", body: { data: b64url("<p>합계 ₩1,100</p>") } } });
    expect(html?.text).toBe("합계 ₩1,100");
  });

  it("본문은 2만 자까지만", () => {
    const long = toGmailMessageLite({ id: "m2", internalDate: "0", payload: { mimeType: "text/plain", body: { data: b64url("가".repeat(25_000)) }, headers: [{ name: "From", value: "a@b.example" }] } });
    expect(long?.text.length).toBe(20_000);
  });

  it("발신 도메인이나 날짜가 없으면 버려요", () => {
    expect(toGmailMessageLite({ id: "m3", payload: { headers: [] } })).toBeNull();
  });
});
