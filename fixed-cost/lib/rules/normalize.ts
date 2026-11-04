export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(\s*주\s*\)/gu, "")
    .replace(/\d{2,4}\s*[년./-]\s*\d{1,2}\s*[월./-]\s*\d{1,2}\s*일?[\s\p{P}\p{S}]*$/gu, "")
    .replace(/[\d\s\p{P}\p{S}]+$/gu, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}
