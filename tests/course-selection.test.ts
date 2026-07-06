import { afterAll, beforeAll, expect, test } from "bun:test";
import { getCourseSelectionData } from "../src/course-selection";
import { createSustechTisSession } from "../src/sustech-tis";

let server: Bun.Server;
let baseUrl: string;
let alphaPage2Attempts = 0;
const postedPaths: string[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/cas/login" && request.method === "GET") {
        return new Response(
          `<form method="post" action="/cas/login">
            <input type="hidden" name="execution" value="flow-456" />
          </form>`,
          { headers: { "content-type": "text/html;charset=UTF-8" } },
        );
      }

      if (url.pathname === "/cas/login" && request.method === "POST") {
        return new Response(null, {
          status: 302,
          headers: {
            location: `${baseUrl}/tis/cas?ticket=ST-course-ticket`,
            "set-cookie": "TGC=tgc; Path=/cas/; HttpOnly",
          },
        });
      }

      if (url.pathname === "/tis/cas") {
        return new Response(null, {
          status: 302,
          headers: {
            location: `${baseUrl}/tis/authentication/main`,
            "set-cookie": "JSESSIONID=tis-session; Path=/; HttpOnly",
          },
        });
      }

      if (url.pathname === "/tis/authentication/main") {
        return new Response("<title>TIS main</title>");
      }

      if (url.pathname === "/tis/Xsxk/query/1") {
        return Response.json({ status: 403, error: "Forbidden" }, { status: 403 });
      }

      if (url.pathname === "/tis/Xsxk/query/2") {
        return new Response("<title>course selection</title>", {
          headers: { "content-type": "text/html;charset=UTF-8" },
        });
      }

      if (request.method === "POST") {
        postedPaths.push(url.pathname);
        const form = new URLSearchParams(await request.text());

        if (url.pathname === "/tis/Xsxk/queryXkdqXnxq") {
          expect(form.get("p_pylx")).toBe("2");
          return Response.json({
            p_xn: "2026-2027",
            p_xq: "1",
            p_xnxq: "2026-20271",
            p_dqxn: "2025-2026",
            p_dqxq: "3",
            p_dqxnxq: "2025-20263",
            cxsfmt: "0",
          });
        }

        if (url.pathname === "/tis/Xsxk/queryYxkc") {
          expect(form.get("p_xkfsdm")).toBe("yixuan");
          return Response.json({
            yxkcList: [{ rwh: "selected-1", kcmc: "Already Selected" }],
            xkgwcList: [{ rwh: "cart-1", kcmc: "In Cart" }],
            xkgzszList: [
              { xkfsdm: "alpha", xkfsmc: "Alpha Courses", xkms: "2", lbxsxs: "1" },
              { xkfsdm: "beta", xkfsmc: "Beta Courses", xkms: "2", lbxsxs: "1" },
            ],
            xsxkPage: { p_pylx: "2", p_xh: "student-id" },
          });
        }

        if (url.pathname === "/tis/Xsxk/queryKxrw") {
          const xkfsdm = form.get("p_xkfsdm");
          const pageNum = form.get("pageNum");
          const pageSize = Number(form.get("pageSize"));

          if (xkfsdm === "alpha" && pageNum === "2") {
            alphaPage2Attempts += 1;
            if (alphaPage2Attempts === 1) {
              return Response.json({ jg: "-1", message: "查询请求频率过高 请稍后重试！" });
            }
          }

          const dataByKey: Record<string, Record<string, unknown>[]> = {
            "alpha:1": [
              { rwh: "alpha-1", kcmc: "Alpha One" },
              { rwh: "alpha-2", kcmc: "Alpha Two" },
            ],
            "alpha:2": [{ rwh: "alpha-3", kcmc: "Alpha Three" }],
            "beta:1": [{ rwh: "beta-1", kcmc: "Beta One" }],
          };
          const total = xkfsdm === "alpha" ? 3 : 1;
          return Response.json({
            jg: "1",
            message: "操作成功",
            yxkcList: [],
            xkgwcList: [],
            kxrwList: {
              total,
              pageNum: Number(pageNum),
              pageSize,
              list: dataByKey[`${xkfsdm}:${pageNum}`] ?? [],
            },
          });
        }
      }

      return new Response("not found", { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

test("getCourseSelectionData discovers the authorized entry and paginates every returned course tab", async () => {
  const session = await createSustechTisSession({
    username: "sid",
    password: "secret",
    urls: {
      casLoginUrl: `${baseUrl}/cas/login`,
      serviceUrl: `${baseUrl}/tis/cas`,
      keepAliveUrl: `${baseUrl}/tis/component/online`,
    },
  });

  const data = await getCourseSelectionData(session, {
    baseUrl: `${baseUrl}/tis/`,
    entryTypes: ["1", "2"],
    pageSize: 2,
    requestDelayMs: 0,
    retryDelayMs: 0,
  });

  expect(data.entry).toEqual({ type: "2", url: `${baseUrl}/tis/Xsxk/query/2` });
  expect(data.currentTerm.p_xnxq).toBe("2026-20271");
  expect(data.tabs.map((tab) => tab.xkfsdm)).toEqual(["alpha", "beta"]);
  expect(data.selectedCourses).toEqual([{ rwh: "selected-1", kcmc: "Already Selected" }]);
  expect(data.cartCourses).toEqual([{ rwh: "cart-1", kcmc: "In Cart" }]);
  expect(data.availableCourseGroups.map((group) => [group.xkfsdm, group.courses.map((course) => course.rwh)])).toEqual([
    ["alpha", ["alpha-1", "alpha-2", "alpha-3"]],
    ["beta", ["beta-1"]],
  ]);
  expect(alphaPage2Attempts).toBe(2);
  expect(postedPaths).toContain("/tis/Xsxk/queryXkdqXnxq");
  expect(postedPaths).toContain("/tis/Xsxk/queryYxkc");
  expect(postedPaths.filter((path) => path === "/tis/Xsxk/queryKxrw")).toHaveLength(4);
});
