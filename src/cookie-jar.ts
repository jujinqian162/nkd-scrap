export interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  expires?: number;
  hostOnly: boolean;
}

export class CookieJar {
  private readonly cookies = new Map<string, CookieRecord>();

  setCookie(setCookieHeader: string, requestUrl: string | URL): void {
    const url = new URL(requestUrl);
    const parts = splitCookieAttributes(setCookieHeader);
    const [nameValue, ...attributes] = parts;
    const separator = nameValue.indexOf("=");
    if (separator <= 0) {
      return;
    }

    const name = nameValue.slice(0, separator).trim();
    const value = nameValue.slice(separator + 1).trim();
    const cookie: CookieRecord = {
      name,
      value,
      domain: url.hostname.toLowerCase(),
      path: defaultCookiePath(url.pathname),
      secure: false,
      hostOnly: true,
    };

    for (const attribute of attributes) {
      const [rawKey, ...rawValue] = attribute.split("=");
      const key = rawKey.trim().toLowerCase();
      const attrValue = rawValue.join("=").trim();

      if (key === "domain" && attrValue) {
        cookie.domain = attrValue.replace(/^\./, "").toLowerCase();
        cookie.hostOnly = false;
      } else if (key === "path" && attrValue) {
        cookie.path = attrValue;
      } else if (key === "secure") {
        cookie.secure = true;
      } else if (key === "expires" && attrValue) {
        const expires = Date.parse(attrValue);
        if (!Number.isNaN(expires)) {
          cookie.expires = expires;
        }
      } else if (key === "max-age" && attrValue) {
        const seconds = Number(attrValue);
        if (Number.isFinite(seconds)) {
          cookie.expires = Date.now() + seconds * 1000;
        }
      }
    }

    const key = cookieKey(cookie);
    if (cookie.expires !== undefined && cookie.expires <= Date.now()) {
      this.cookies.delete(key);
      return;
    }
    this.cookies.set(key, cookie);
  }

  setCookiesFromHeaders(headers: Headers, requestUrl: string | URL): void {
    for (const header of getSetCookieHeaders(headers)) {
      this.setCookie(header, requestUrl);
    }
  }

  getCookieHeader(requestUrl: string | URL): string {
    const url = new URL(requestUrl);
    const now = Date.now();
    const pairs: string[] = [];

    for (const [key, cookie] of this.cookies) {
      if (cookie.expires !== undefined && cookie.expires <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (!domainMatches(url.hostname.toLowerCase(), cookie)) {
        continue;
      }
      if (!pathMatches(url.pathname, cookie.path)) {
        continue;
      }
      if (cookie.secure && url.protocol !== "https:") {
        continue;
      }
      pairs.push(`${cookie.name}=${cookie.value}`);
    }

    return pairs.join("; ");
  }

  entries(): CookieRecord[] {
    return [...this.cookies.values()];
  }
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithSetCookie.getSetCookie === "function") {
    return headersWithSetCookie.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookie(combined) : [];
}

function cookieKey(cookie: CookieRecord): string {
  return `${cookie.domain}\t${cookie.path}\t${cookie.name}`;
}

function defaultCookiePath(pathname: string): string {
  if (!pathname || pathname[0] !== "/" || pathname === "/") {
    return "/";
  }
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function domainMatches(hostname: string, cookie: CookieRecord): boolean {
  if (cookie.hostOnly) {
    return hostname === cookie.domain;
  }
  return hostname === cookie.domain || hostname.endsWith(`.${cookie.domain}`);
}

function pathMatches(pathname: string, cookiePath: string): boolean {
  if (pathname === cookiePath) {
    return true;
  }
  if (!pathname.startsWith(cookiePath)) {
    return false;
  }
  return cookiePath.endsWith("/") || pathname[cookiePath.length] === "/";
}

function splitCookieAttributes(header: string): string[] {
  return header.split(";").map((part) => part.trim()).filter(Boolean);
}

function splitCombinedSetCookie(header: string): string[] {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let i = 0; i < header.length; i += 1) {
    const char = header[i];
    const rest = header.slice(i).toLowerCase();
    if (rest.startsWith("expires=")) {
      inExpires = true;
    }
    if (inExpires && char === ";") {
      inExpires = false;
    }
    if (!inExpires && char === "," && /\s*[^=;,\s]+=/.test(header.slice(i + 1))) {
      cookies.push(header.slice(start, i).trim());
      start = i + 1;
    }
  }

  cookies.push(header.slice(start).trim());
  return cookies.filter(Boolean);
}

