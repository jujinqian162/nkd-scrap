import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  flattenCourseSelectionData,
  serializeCoursesToCsv,
  serializeCoursesToJsonl,
} from "./course-export";
import { getCourseSelectionData } from "./course-selection";
import { createSustechTisSession } from "./sustech-tis";

const username = Bun.env.USER_NAME;
const password = Bun.env.USER_PSWD;
const outputDir = Bun.argv[2] ?? "data";

if (!username || !password) {
  throw new Error("Missing USER_NAME or USER_PSWD in environment");
}

const session = await createSustechTisSession({ username, password });
const data = await getCourseSelectionData(session, {
  pageSize: 500,
  requestDelayMs: 2500,
  retryDelayMs: 5000,
});
const rows = flattenCourseSelectionData(data);

await mkdir(outputDir, { recursive: true });
const jsonlPath = join(outputDir, "course-selection-courses.jsonl");
const csvPath = join(outputDir, "course-selection-courses.csv");
await Bun.write(jsonlPath, serializeCoursesToJsonl(rows));
await Bun.write(csvPath, serializeCoursesToCsv(rows));

console.log(
  JSON.stringify(
    {
      count: rows.length,
      jsonlPath,
      csvPath,
      groups: data.availableCourseGroups.map((group) => ({
        xkfsdm: group.xkfsdm,
        total: group.total,
        fetched: group.courses.length,
      })),
    },
    null,
    2,
  ),
);

