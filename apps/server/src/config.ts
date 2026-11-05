import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const envPaths = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", "..", ".env")];
const envPath = envPaths.find((path) => existsSync(path));
if (envPath) config({ path: envPath });

export const port = Number(process.env.PORT ?? 3001);

export function getJwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}