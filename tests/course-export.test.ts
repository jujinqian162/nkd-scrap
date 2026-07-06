import { expect, test } from "bun:test";
import {
  COURSE_EXPORT_COLUMNS,
  formatCourseForExport,
  serializeCoursesToCsv,
  serializeCoursesToJsonl,
} from "../src/course-export";

test("formatCourseForExport keeps only the requested searchable fields", () => {
  const row = formatCourseForExport({
    kcmc: "生物学原理",
    kcdm: "BIO103",
    kclbmc: "通识必修课",
    skyymc: "双语",
    jfzlbmc: "十三级制",
    xf: "3.0",
    pkjgmx:
      "<div><span><p>1-16周,星期一第3-4节 一教321</p><p>1-15单周,星期三第1-2节 一教321</p></span></div>",
    zrl: "40",
    yxzrs: "8",
    kkyxmc: "生物系",
    rwh: "hidden-task-id",
  });

  expect(Object.keys(row)).toEqual(COURSE_EXPORT_COLUMNS);
  expect(row).toEqual({
    课程名称: "生物学原理",
    课程代码: "BIO103",
    课程类别: "通识必修课",
    授课语言: "双语",
    计分方式: "十三级制",
    学分: "3.0",
    上课信息: "1-16周,星期一第3-4节 一教321; 1-15单周,星期三第1-2节 一教321",
    "容量/已选": "40/8",
    开课学院: "生物系",
  });
});

test("serializers write JSONL and CSV without extra fields", () => {
  const rows = [
    formatCourseForExport({
      kcmc: "植物应用之插花技艺",
      kcdm: "BIOS222",
      kclbmc: "通识选修课",
      skyymc: "中文",
      jfzlbmc: "二级制",
      xf: "1.0",
      pkjgmx: "<p>2-16双周,星期一第5-8节 慧园2栋507</p>",
      zrl: "20",
      yxzrs: "4",
      kkyxmc: "生物系",
    }),
  ];

  expect(serializeCoursesToJsonl(rows)).toBe(
    '{"课程名称":"植物应用之插花技艺","课程代码":"BIOS222","课程类别":"通识选修课","授课语言":"中文","计分方式":"二级制","学分":"1.0","上课信息":"2-16双周,星期一第5-8节 慧园2栋507","容量/已选":"20/4","开课学院":"生物系"}\n',
  );
  expect(serializeCoursesToCsv(rows)).toBe(
    '课程名称,课程代码,课程类别,授课语言,计分方式,学分,上课信息,容量/已选,开课学院\r\n植物应用之插花技艺,BIOS222,通识选修课,中文,二级制,1.0,"2-16双周,星期一第5-8节 慧园2栋507",20/4,生物系\r\n',
  );
});
