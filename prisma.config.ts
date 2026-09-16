import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env on its own. .env is gitignored (it holds real
// credentials), so it won't exist on a host like Vercel — there, env vars are
// injected directly, so there's nothing to load. A shell-provided DATABASE_URL
// (e.g. from launch.json) should win over the .env file, not the other way
// round, so it's captured here and restored after loading .env.
const shellDatabaseUrl = process.env.DATABASE_URL;
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // No .env file — fine, the platform is expected to provide env vars itself.
}
if (shellDatabaseUrl) process.env.DATABASE_URL = shellDatabaseUrl;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
