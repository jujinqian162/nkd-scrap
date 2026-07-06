import type { AuthSession, CasLoginOptions } from "./cas-login";
import { loginWithCas } from "./cas-login";

export interface SustechTisUrls {
  casLoginUrl: string;
  serviceUrl: string;
  keepAliveUrl: string;
}

export interface SustechTisSession extends AuthSession {
  keepAlive(): Promise<Response>;
}

export interface SustechTisLoginOptions
  extends Omit<CasLoginOptions, "casLoginUrl" | "serviceUrl" | "extraFormFields"> {
  urls?: Partial<SustechTisUrls>;
}

export const SUSTECH_TIS_URLS: SustechTisUrls = {
  casLoginUrl: "https://cas.sustech.edu.cn/cas/login",
  serviceUrl: "https://tis.sustech.edu.cn/cas",
  keepAliveUrl: "https://tis.sustech.edu.cn/component/online",
};

export async function createSustechTisSession(options: SustechTisLoginOptions): Promise<SustechTisSession> {
  const urls = { ...SUSTECH_TIS_URLS, ...options.urls };
  const session = await loginWithCas({
    ...options,
    casLoginUrl: urls.casLoginUrl,
    serviceUrl: urls.serviceUrl,
  });

  return {
    ...session,
    keepAlive: () => session.request(urls.keepAliveUrl, { method: "POST" }),
  };
}

