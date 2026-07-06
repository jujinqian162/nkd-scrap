import { createSustechTisSession } from "./sustech-tis";

const username = Bun.env.USER_NAME;
const password = Bun.env.USER_PSWD;

if (!username || !password) {
  throw new Error("Missing USER_NAME or USER_PSWD in environment");
}

const session = await createSustechTisSession({ username, password });
const keepAlive = await session.keepAlive();

console.log(
  JSON.stringify(
    {
      finalUrl: session.finalUrl,
      keepAliveStatus: keepAlive.status,
      cookies: session.cookieJar.entries().map((cookie) => ({
        domain: cookie.domain,
        name: cookie.name,
        path: cookie.path,
        secure: cookie.secure,
        hostOnly: cookie.hostOnly,
      })),
    },
    null,
    2,
  ),
);

