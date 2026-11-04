import { loadCatalog } from "../../lib/catalog";
import { parseCsv } from "../../lib/adapters/csv";
import { parseGmailMessages } from "../../lib/adapters/gmail";
import { listSamples, sampleAdapter } from "../../lib/adapters/sample";
import { GmailMessageLiteSchema } from "../../lib/schemas";
import { detectSubscriptionCandidates } from "../../lib/rules";
import fixture from "../fixtures/gmail/messages.json";

// 가상 fixture만 출력해요. 실제 메일·CSV·토큰은 읽지 않아요.
if (!fixture._mock) throw new Error("가상 메일 표시가 필요해요");
const catalog = loadCatalog();
const csv = parseCsv('일자,금액,가맹점,결제수단\n2026.07.01,"6,900원",카카오페이,kakaopay\n26/07/01,6900,카카오페이,kakaopay\n2026-02-30,1000,가상 서비스,card');
const gmail = parseGmailMessages(GmailMessageLiteSchema.array().parse(fixture.messages), catalog);
const samples = [];
for (const sample of listSamples()) {
  const transactions = await sampleAdapter.load(sample.id);
  samples.push({ id: sample.id, transactions: transactions.length, candidates: detectSubscriptionCandidates(transactions, catalog) });
}
console.log(JSON.stringify({ csv, gmail, samples }, null, 2));
