import type { CourseSelectionData, CourseSelectionRecord } from "./course-selection";

export const COURSE_EXPORT_COLUMNS = [
  "课程名称",
  "课程代码",
  "课程类别",
  "授课语言",
  "授课教师",
  "计分方式",
  "学分",
  "上课信息",
  "容量/已选",
  "开课学院",
] as const;

export type CourseExportColumn = (typeof COURSE_EXPORT_COLUMNS)[number];
export type CourseExportRow = Record<CourseExportColumn, string>;

export function flattenCourseSelectionData(data: CourseSelectionData): CourseExportRow[] {
  return data.availableCourseGroups.flatMap((group) => group.courses.map(formatCourseForExport));
}

export function formatCourseForExport(course: CourseSelectionRecord): CourseExportRow {
  return {
    课程名称: valueOf(course.kcmc),
    课程代码: valueOf(course.kcdm),
    课程类别: valueOf(course.kclbmc),
    授课语言: valueOf(course.skyymc),
    授课教师: valueOf(course.dgjsmc),
    计分方式: valueOf(course.jfzlbmc),
    学分: valueOf(course.xf),
    上课信息: formatClassInfo(course),
    "容量/已选": formatCapacity(course),
    开课学院: valueOf(course.kkyxmc),
  };
}

export function serializeCoursesToJsonl(rows: CourseExportRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}

export function serializeCoursesToCsv(rows: CourseExportRow[]): string {
  const header = COURSE_EXPORT_COLUMNS.join(",");
  const body = rows.map((row) => COURSE_EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(","));
  return [header, ...body].join("\r\n") + "\r\n";
}

function formatClassInfo(course: CourseSelectionRecord): string {
  const classInfo = htmlToText(valueOf(course.pkjgmx));
  if (classInfo) {
    return classInfo;
  }

  const fullInfo = htmlToText(valueOf(course.kcxx));
  if (fullInfo) {
    return fullInfo.replace(/^.*?上课信息[:：]\s*/, "");
  }

  return [course.sksj, course.skdd].map(valueOf).filter(Boolean).join(" ");
}

function formatCapacity(course: CourseSelectionRecord): string {
  const capacity = firstValue(course.zrl, course.rl, course.dnrl);
  const selected = firstValue(course.yxzrs, course.yxrs, course.dnyxrs);
  if (!capacity && !selected) {
    return "";
  }
  return `${capacity || "0"}/${selected || "0"}`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script>\s*-split-\s*<\/script>\s*<p[^>]*>\s*主任务[:：]\s*<\/p>/gi, "; 主任务: ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "; ")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<\/?(div|span|p|b|a)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[、\s]*;[、\s]*/g, "; ")
    .replace(/\s+/g, " ")
    .replace(/;\s*$/g, "")
    .trim();
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function firstValue(...values: unknown[]): string {
  for (const value of values) {
    const text = valueOf(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function valueOf(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}
