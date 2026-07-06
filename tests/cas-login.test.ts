import { afterAll, beforeAll, expect, test } from "bun:test";
import { loginWithCas } from "../src/cas-login";
import { createSustechTisSession } from "../src/sustech-tis";

let server: Bun.Server;
let baseUrl: string;
let postBody = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/cas/login" && request.method === "GET") {
        return new Response(
          `<form method="post" action="/cas/locale">
            <input type="hidden" name="locale" value="zh_CN" />
          </form>
          <form method="post" action="/cas/login">
            <input type="hidden" name="execution" value="flow-123" />
            <input type="hidden" name="_eventId" value="submit" />
          </form>`,
          {
            headers: {
              "content-type": "text/html;charset=UTF-8",
              "set-cookie": "CASSESSION=abc; Path=/cas; HttpOnly",
            },
          },
        );
      }

      if (url.pathname === "/cas/login" && request.method === "POST") {
        postBody = await request.text();
        return new Response(null, {
          status: 302,
          headers: {
            location: `${baseUrl}/tis/cas?ticket=ST-mock-ticket`,
            "set-cookie": 'TGC="ticket-granting-cookie"; Path=/cas/; HttpOnly; Secure',
          },
        });
      }

      if (url.pathname === "/tis/cas") {
        expect(url.searchParams.get("ticket")).toBe("ST-mock-ticket");
        return new Response(null, {
          status: 302,
          headers: {
            location: `${baseUrl}/tis/authentication/main`,
            "set-cookie": "JSESSIONID=tis-session; Path=/; HttpOnly",
          },
        });
      }

      if (url.pathname === "/tis/authentication/main") {
        expect(request.headers.get("cookie")).toContain("JSESSIONID=tis-session");
        return new Response("<title>TIS main</title>");
      }

      if (url.pathname === "/tis/component/online" && request.method === "POST") {
        expect(request.headers.get("cookie")).toContain("JSESSIONID=tis-session");
        return Response.json({ code: 0, content: null });
      }

      return new Response("not found", { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

test("loginWithCas exchanges credentials for an authenticated service session", async () => {
  const session = await loginWithCas({
    casLoginUrl: `${baseUrl}/cas/login`,
    serviceUrl: `${baseUrl}/tis/cas`,
    username: "sid",
    password: "secret",
  });

  expect(session.finalUrl).toBe(`${baseUrl}/tis/authentication/main`);
  expect(decodeURIComponent(postBody)).toContain("username=sid");
  expect(decodeURIComponent(postBody)).toContain("password=secret");
  expect(decodeURIComponent(postBody)).toContain("execution=flow-123");
  expect(session.cookieJar.getCookieHeader(`${baseUrl}/tis/authentication/main`)).toContain(
    "JSESSIONID=tis-session",
  );

  const response = await session.request(`${baseUrl}/tis/component/online`, { method: "POST" });
  await expect(response.json()).resolves.toEqual({ code: 0, content: null });
});

test("createSustechTisSession reuses CAS login and exposes keepAlive", async () => {
  const session = await createSustechTisSession({
    username: "sid",
    password: "secret",
    urls: {
      casLoginUrl: `${baseUrl}/cas/login`,
      serviceUrl: `${baseUrl}/tis/cas`,
      keepAliveUrl: `${baseUrl}/tis/component/online`,
    },
  });

  expect(session.finalUrl).toBe(`${baseUrl}/tis/authentication/main`);
  const response = await session.keepAlive();
  await expect(response.json()).resolves.toEqual({ code: 0, content: null });
});
