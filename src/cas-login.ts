import { CookieJar } from "./cookie-jar";

export interface CasLoginOptions {
  casLoginUrl: string;
  serviceUrl: string;
  username: string;
  password: string;
  cookieJar?: CookieJar;
  fetch?: typeof fetch;
  userAgent?: string;
  extraFormFields?: Record<string, string>;
  maxRedirects?: number;
}

export interface AuthSession {
  finalUrl: string;
  cookieJar: CookieJar;
  request(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function loginWithCas(options: CasLoginOptions): Promise<AuthSession> {
  const fetchImpl = options.fetch ?? fetch;
  const cookieJar = options.cookieJar ?? new CookieJar();
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const loginUrl = withService(options.casLoginUrl, options.serviceUrl);

  const loginPage = await requestWithCookies(fetchImpl, cookieJar, loginUrl, {
    headers: { "user-agent": userAgent },
    redirect: "manual",
  });
  const loginHtml = await loginPage.text();
  if (!loginPage.ok) {
    throw new Error(`CAS login page returned HTTP ${loginPage.status}`);
  }

  const form = parseFirstForm(loginHtml);
  const formAction = new URL(form.action ?? loginPage.url, loginPage.url).toString();
  const formFields = new URLSearchParams(form.hiddenFields);
  formFields.set("username", options.username);
  formFields.set("password", options.password);
  if (!formFields.has("_eventId")) {
    formFields.set("_eventId", "submit");
  }
  if (!formFields.has("geolocation")) {
    formFields.set("geolocation", "");
  }
  for (const [key, value] of Object.entries(options.extraFormFields ?? {})) {
    formFields.set(key, value);
  }

  const submitted = await requestWithCookies(fetchImpl, cookieJar, formAction, {
    method: "POST",
    body: formFields,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": userAgent,
      referer: loginPage.url,
    },
    redirect: "manual",
  });

  const finalResponse = await followRedirects(fetchImpl, cookieJar, submitted, {
    userAgent,
    maxRedirects: options.maxRedirects ?? 10,
  });
  await finalResponse.arrayBuffer();

  return createAuthSession({
    finalUrl: finalResponse.url,
    cookieJar,
    fetchImpl,
    userAgent,
    maxRedirects: options.maxRedirects ?? 10,
  });
}

function createAuthSession(args: {
  finalUrl: string;
  cookieJar: CookieJar;
  fetchImpl: typeof fetch;
  userAgent: string;
  maxRedirects: number;
}): AuthSession {
  return {
    finalUrl: args.finalUrl,
    cookieJar: args.cookieJar,
    request: async (input, init = {}) => {
      const response = await requestWithCookies(args.fetchImpl, args.cookieJar, input, {
        ...init,
        headers: mergeHeaders(init.headers, {
          "user-agent": args.userAgent,
        }),
        redirect: "manual",
      });
      return followRedirects(args.fetchImpl, args.cookieJar, response, {
        userAgent: args.userAgent,
        maxRedirects: args.maxRedirects,
      });
    },
  };
}

async function requestWithCookies(
  fetchImpl: typeof fetch,
  cookieJar: CookieJar,
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url = requestUrl(input);
  const cookieHeader = cookieJar.getCookieHeader(url);
  const headers = mergeHeaders(init.headers, cookieHeader ? { cookie: cookieHeader } : {});
  const response = await fetchImpl(input, { ...init, headers });
  cookieJar.setCookiesFromHeaders(response.headers, url);
  return response;
}

async function followRedirects(
  fetchImpl: typeof fetch,
  cookieJar: CookieJar,
  initialResponse: Response,
  options: { userAgent: string; maxRedirects: number },
): Promise<Response> {
  let response = initialResponse;

  for (let redirects = 0; redirects < options.maxRedirects && isRedirect(response.status); redirects += 1) {
    const location = response.headers.get("location");
    if (!location) {
      break;
    }

    const nextUrl = new URL(location, response.url).toString();
    response = await requestWithCookies(fetchImpl, cookieJar, nextUrl, {
      headers: { "user-agent": options.userAgent },
      redirect: "manual",
    });
  }

  if (isRedirect(response.status)) {
    throw new Error(`Too many redirects while logging in; last URL was ${response.url}`);
  }
  return response;
}

function withService(casLoginUrl: string, serviceUrl: string): string {
  const url = new URL(casLoginUrl);
  if (!url.searchParams.has("service")) {
    url.searchParams.set("service", serviceUrl);
  }
  return url.toString();
}

function requestUrl(input: string | URL | Request): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function mergeHeaders(base: HeadersInit | undefined, additions: Record<string, string>): Headers {
  const headers = new Headers(base);
  for (const [key, value] of Object.entries(additions)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return headers;
}

function parseFirstForm(html: string): { action?: string; hiddenFields: Record<string, string> } {
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((match) => match[0]);
  const candidates = forms.length > 0 ? forms : [html];

  for (const formTag of candidates) {
    const action = readAttribute(formTag.match(/<form\b[^>]*>/i)?.[0] ?? "", "action");
    const hiddenFields: Record<string, string> = {};

    for (const inputMatch of formTag.matchAll(/<input\b[^>]*>/gi)) {
      const input = inputMatch[0];
      const name = readAttribute(input, "name");
      if (!name) {
        continue;
      }
      const type = readAttribute(input, "type")?.toLowerCase();
      if (type === "hidden") {
        hiddenFields[name] = decodeHtmlEntities(readAttribute(input, "value") ?? "");
      }
    }

    if (hiddenFields.execution) {
      return { action, hiddenFields };
    }
  }

  throw new Error("CAS login page did not contain an execution hidden field");
}

function readAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#x22;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
