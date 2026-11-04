import type { InputAdapter } from "./types";

export const captureAdapter: InputAdapter = {
  id: "capture",
  async load() { throw new Error("not implemented"); },
};
