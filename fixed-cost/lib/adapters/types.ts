import type { Transaction } from "../types";

export interface InputAdapter {
  id: "sample" | "csv" | "gmail" | "capture";
  load(input: unknown): Promise<Transaction[]>;
}
