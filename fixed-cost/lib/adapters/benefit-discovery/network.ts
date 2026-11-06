import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import type { OfficialPageFetcher } from "./types";

export const PAGE_MAX_BYTES = 512 * 1024;
export const PAGE_TIMEOUT_MS = 8000;
const denied = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) denied.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) denied.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !denied.check(address, "ipv4") : family === 6 && globalV6.check(address, "ipv6") && !denied.check(address, "ipv6");
}
export function officialUrl(raw: string, hosts: string[]): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
    isIP(url.hostname.replace(/^\[|\]$/gu, "")) || !hosts.includes(url.hostname) || url.hostname.endsWith(".")) throw new Error("unsafe_url");
  url.hash = "";
  return url;
}
export interface PinnedTarget { url: URL; address: string; family: 4 | 6; signal: AbortSignal }
export interface PageResponse { status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Uint8Array>; cancel(): void }
export type PageTransport = (target: PinnedTarget) => Promise<PageResponse>;
// DNS 검증 후 같은 IP에 연결해 DNS 재바인딩을 막고 TLS는 원래 호스트로 검증해요.
export const httpsTransport: PageTransport = ({ url, address, family, signal }) => new Promise((resolve, reject) => {
  const req = request(url, { signal, family, servername: url.hostname, agent: false, rejectUnauthorized: true,
    headers: { "Accept": "text/html,application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "FixedCost-BenefitVerifier/1" },
    lookup: (_host, options, callback) => {
      if (options.all) callback(null, [{ address, family }]); else callback(null, address, family);
    } }, (res) => resolve({ status: res.statusCode ?? 0, headers: { location: res.headers.location,
      "content-type": res.headers["content-type"], "content-length": res.headers["content-length"], "content-encoding": res.headers["content-encoding"] },
    body: res, cancel: () => res.destroy() }));
  req.on("error", reject); req.end();
});

export function createSecurePageFetcher(options: { resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  transport?: PageTransport; now?: () => Date } = {}): OfficialPageFetcher {
  const resolve = options.resolve ?? ((host) => lookup(host, { all: true, verbatim: true }));
  const transport = options.transport ?? httpsTransport;
  return { async fetch(raw, hosts) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("page_timeout")); }, PAGE_TIMEOUT_MS); });
    const work = async () => {
      let url = officialUrl(raw, hosts);
      for (let redirects = 0; redirects <= 3; redirects++) {
        const addresses = await resolve(url.hostname);
        if (controller.signal.aborted) throw new Error("page_timeout");
        if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) throw new Error("private_address");
        const address = addresses[0];
        const response = await transport({ url, address: address.address, family: address.family as 4 | 6, signal: controller.signal });
        try {
          if (controller.signal.aborted) throw new Error("page_timeout");
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (!response.headers.location || redirects === 3) throw new Error("redirect_limit");
            url = officialUrl(new URL(response.headers.location, url).href, hosts); continue;
          }
          if (response.status !== 200) throw new Error("http_error");
          if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/iu.test(response.headers["content-type"] ?? "")) throw new Error("unsupported_content");
          if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") throw new Error("encoded_content");
          if (Number(response.headers["content-length"]) > PAGE_MAX_BYTES) throw new Error("page_too_large");
          let bytes = 0, html = "";
          const decoder = new TextDecoder("utf-8", { fatal: true });
          for await (const chunk of response.body) {
            if (controller.signal.aborted) throw new Error("page_timeout");
            bytes += chunk.byteLength; if (bytes > PAGE_MAX_BYTES) throw new Error("page_too_large");
            html += decoder.decode(chunk, { stream: true });
          }
          html += decoder.decode();
          return { requested_url: officialUrl(raw, hosts).href, final_url: url.href, html, fetched_at: (options.now ?? (() => new Date()))().toISOString() };
        } finally { response.cancel(); }
      }
      throw new Error("redirect_limit");
    };
    try { return await Promise.race([work(), timeout]); } finally { clearTimeout(timer); controller.abort(); }
  } };
}
