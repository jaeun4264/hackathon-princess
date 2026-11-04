import persona1 from "../../data/samples/persona-1.json";
import persona2 from "../../data/samples/persona-2.json";
import persona3 from "../../data/samples/persona-3.json";
import { TransactionSchema } from "../schemas";
import type { InputAdapter } from "./types";

const samples = [
  { id: "persona-1", name: "구독 많은 학생", description: "등록된 서비스 5개와 단발 결제가 섞인 3개월 가상 내역", transactions: persona1 },
  { id: "persona-2", name: "AI 도구 중심 학생", description: "등록된 다글로·클라우드·노트 구독 3개. 미등록 AI 서비스는 제외", transactions: persona2 },
  { id: "persona-3", name: "OTT 중심 학생", description: "등록된 넷플릭스·멤버십 구독 2개. 미확인 OTT 가격은 제외", transactions: persona3 },
];

export function listSamples() {
  return samples.map(({ id, name, description }) => ({ id, name, description }));
}

export const sampleAdapter: InputAdapter = {
  id: "sample",
  async load(input) {
    const sample = samples.find((sample) => sample.id === input);
    if (!sample) throw new TypeError("등록된 샘플 id가 필요해요");
    return TransactionSchema.array().parse(sample.transactions);
  },
};
