import type { SustechTisSession } from "./sustech-tis";

export type CourseSelectionRecord = Record<string, unknown>;

export interface CourseSelectionTab extends CourseSelectionRecord {
  xkfsdm: string;
  xkfsmc?: string;
  xkfsmc_en?: string;
}

export interface CourseSelectionEntry {
  type: string;
  url: string;
}

export interface AvailableCourseGroup {
  xkfsdm: string;
  tab: CourseSelectionTab;
  total: number;
  pageSize: number;
  courses: CourseSelectionRecord[];
}

export interface CourseSelectionData {
  entry: CourseSelectionEntry;
  currentTerm: CourseSelectionRecord;
  tabs: CourseSelectionTab[];
  selectedCourses: CourseSelectionRecord[];
  cartCourses: CourseSelectionRecord[];
  availableCourseGroups: AvailableCourseGroup[];
  rawInitialState: CourseSelectionRecord;
}

export interface CourseSelectionOptions {
  baseUrl?: string;
  entryTypes?: string[];
  pageSize?: number;
  requestDelayMs?: number;
  retryDelayMs?: number;
  maxRateLimitRetries?: number;
}

type QueryForm = Record<string, string>;

const DEFAULT_BASE_URL = "https://tis.sustech.edu.cn/";
const DEFAULT_ENTRY_TYPES = ["1", "2"];

export async function getCourseSelectionData(
  session: SustechTisSession,
  options: CourseSelectionOptions = {},
): Promise<CourseSelectionData> {
  const baseUrl = ensureTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
  const pageSize = options.pageSize ?? 50;
  const requestDelayMs = options.requestDelayMs ?? 1200;
  const retryDelayMs = options.retryDelayMs ?? 3000;
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 4;

  const entry = await discoverCourseSelectionEntry(session, baseUrl, options.entryTypes ?? DEFAULT_ENTRY_TYPES);
  const form = createBaseQueryForm(entry.type);
  const currentTerm = await postJson(session, baseUrl, "Xsxk/queryXkdqXnxq", form);
  Object.assign(form, pickStringValues(currentTerm, [
    "p_xn",
    "p_xq",
    "p_xnxq",
    "p_dqxn",
    "p_dqxq",
    "p_dqxnxq",
    "cxsfmt",
  ]));

  form.p_xkfsdm = "yixuan";
  const initialState = await postJson(session, baseUrl, "Xsxk/queryYxkc", form);
  const tabs = normalizeTabs(initialState.xkgzszList);
  const selectedCourses = normalizeArray(initialState.yxkcList);
  const cartCourses = normalizeArray(initialState.xkgwcList);

  const availableCourseGroups: AvailableCourseGroup[] = [];
  for (const tab of tabs) {
    form.p_xkfsdm = tab.xkfsdm;
    const group = await fetchAvailableCourseGroup(session, baseUrl, form, tab, {
      pageSize,
      requestDelayMs,
      retryDelayMs,
      maxRateLimitRetries,
    });
    availableCourseGroups.push(group);
  }

  return {
    entry,
    currentTerm,
    tabs,
    selectedCourses,
    cartCourses,
    availableCourseGroups,
    rawInitialState: initialState,
  };
}

async function discoverCourseSelectionEntry(
  session: SustechTisSession,
  baseUrl: string,
  entryTypes: string[],
): Promise<CourseSelectionEntry> {
  for (const type of entryTypes) {
    const url = new URL(`Xsxk/query/${type}`, baseUrl).toString();
    const response = await session.request(url);
    if (response.ok && response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      await response.arrayBuffer();
      return { type, url };
    }
    await response.arrayBuffer();
  }
  throw new Error(`No authorized course selection entry found in: ${entryTypes.join(", ")}`);
}

async function fetchAvailableCourseGroup(
  session: SustechTisSession,
  baseUrl: string,
  baseForm: QueryForm,
  tab: CourseSelectionTab,
  options: Required<Pick<CourseSelectionOptions, "pageSize" | "requestDelayMs" | "retryDelayMs" | "maxRateLimitRetries">>,
): Promise<AvailableCourseGroup> {
  const courses: CourseSelectionRecord[] = [];
  let total = 0;
  let pageNum = 1;

  while (pageNum === 1 || courses.length < total) {
    if (pageNum > 1) {
      await delay(options.requestDelayMs);
    }

    const response = await postWithRateLimitRetry(
      session,
      baseUrl,
      "Xsxk/queryKxrw",
      {
        ...baseForm,
        p_xkfsdm: tab.xkfsdm,
        pageNum: String(pageNum),
        pageSize: String(options.pageSize),
      },
      options,
    );

    if (response.jg !== "1" || !isRecord(response.kxrwList)) {
      throw new Error(`Course list query failed for ${tab.xkfsdm}: ${String(response.message ?? "unknown error")}`);
    }

    const page = response.kxrwList;
    const list = normalizeArray(page.list);
    courses.push(...list);
    total = Number(page.total ?? list.length);
    const actualPageSize = Number(page.pageSize ?? options.pageSize);
    if (list.length === 0 || courses.length >= total) {
      return { xkfsdm: tab.xkfsdm, tab, total, pageSize: actualPageSize, courses };
    }
    pageNum += 1;
  }

  return { xkfsdm: tab.xkfsdm, tab, total, pageSize: options.pageSize, courses };
}

async function postWithRateLimitRetry(
  session: SustechTisSession,
  baseUrl: string,
  path: string,
  form: QueryForm,
  options: Required<Pick<CourseSelectionOptions, "retryDelayMs" | "maxRateLimitRetries">>,
): Promise<CourseSelectionRecord> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await postJson(session, baseUrl, path, form);
    if (!isRateLimitResponse(response) || attempt >= options.maxRateLimitRetries) {
      return response;
    }
    await delay(options.retryDelayMs);
  }
}

async function postJson(
  session: SustechTisSession,
  baseUrl: string,
  path: string,
  form: QueryForm,
): Promise<CourseSelectionRecord> {
  const response = await session.request(new URL(path, baseUrl).toString(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams(form),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  const json = await response.json();
  if (!isRecord(json)) {
    throw new Error(`${path} did not return a JSON object`);
  }
  return json;
}

function createBaseQueryForm(entryType: string): QueryForm {
  return {
    cxsfmt: "0",
    p_pylx: entryType,
    mxpylx: entryType,
    p_sfgldjr: "0",
    p_sfredis: "0",
    p_sfsyxkgwc: "0",
    p_chaxunxh: "",
    p_gjz: "",
    p_skjs: "",
    p_xkfsdm: "yixuan",
    p_xiaoqu: "",
    p_kkyx: "",
    p_kclb: "",
    p_kkxnxq: "99",
    p_sfhlctkc: "0",
    p_sfhllrlkc: "0",
    p_sfxsgwckb: "1",
    p_kxsj_xqj: "",
    p_kxsj_ksjc: "",
    p_kxsj_jsjc: "",
    p_xzcxtjz_nj: "",
    p_xzcxtjz_yx: "",
    p_xzcxtjz_zy: "",
    p_xzcxtjz_zyfx: "",
    p_xzcxtjz_bj: "",
    p_kc_gjz: "",
  };
}

function normalizeTabs(value: unknown): CourseSelectionTab[] {
  return normalizeArray(value).filter((item): item is CourseSelectionTab => {
    return typeof item.xkfsdm === "string" && item.xkfsdm.length > 0;
  });
}

function normalizeArray(value: unknown): CourseSelectionRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function pickStringValues(source: CourseSelectionRecord, keys: string[]): QueryForm {
  const values: QueryForm = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      values[key] = String(value);
    }
  }
  return values;
}

function isRateLimitResponse(response: CourseSelectionRecord): boolean {
  return response.jg === "-1" && String(response.message ?? "").includes("频率");
}

function isRecord(value: unknown): value is CourseSelectionRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

