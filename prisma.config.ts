import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env on its own. A shell-provided DATABASE_URL
// (e.g. from launch.json) should win over the .env file, not the other way
// round, so it's captured here and restored after loading .env.
const shellDatabaseUrl = process.env.DATABASE_URL;
process.loadEnvFile(path.join(process.cwd(), ".env"));
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
