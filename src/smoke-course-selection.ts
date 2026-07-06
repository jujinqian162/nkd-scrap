import { getCourseSelectionData } from "./course-selection";
import { createSustechTisSession } from "./sustech-tis";

const username = Bun.env.USER_NAME;
const password = Bun.env.USER_PSWD;

if (!username || !password) {
  throw new Error("Missing USER_NAME or USER_PSWD in environment");
}

const session = await createSustechTisSession({ username, password });
const data = await getCourseSelectionData(session, {
  pageSize: 500,
  requestDelayMs: 2500,
  retryDelayMs: 5000,
});

console.log(
  JSON.stringify(
    {
      entry: data.entry,
      currentTerm: data.currentTerm,
      tabs: data.tabs.map((tab) => ({
        xkfsdm: tab.xkfsdm,
        xkfsmc: tab.xkfsmc,
        xkfsmc_en: tab.xkfsmc_en,
      })),
      selectedCount: data.selectedCourses.length,
      cartCount: data.cartCourses.length,
      availableGroups: data.availableCourseGroups.map((group) => ({
        xkfsdm: group.xkfsdm,
        total: group.total,
        fetched: group.courses.length,
        firstCourse: group.courses[0]
          ? {
              rwh: group.courses[0].rwh,
              kcdm: group.courses[0].kcdm,
              kcmc: group.courses[0].kcmc,
              xf: group.courses[0].xf,
            }
          : null,
      })),
    },
    null,
    2,
  ),
);
