function normalized(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function quotesAreInSource(quotes: string[], source: string): boolean {
  const original = normalized(source);
  return quotes.every((quote) => normalized(quote).length > 0 && original.includes(normalized(quote)));
}
