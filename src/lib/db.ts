import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

function poolConfigFromUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 10,
    // MySQL DATETIME columns are stored without offset; keep reads and writes in UTC.
    timezone: "Z",
    // A hosted (non-localhost) database can take several seconds to hand back a new
    // connection over the public internet; the driver's 10s defaults are too tight for that.
    connectTimeout: 20_000,
    acquireTimeout: 20_000,
  };
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check your .env file.");
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfigFromUrl(url)) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
