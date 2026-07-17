import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const pnpmPath = process.env.npm_execpath;
if (!pnpmPath) throw new Error("Run this check through pnpm");

const report = JSON.parse(
  execFileSync(process.execPath, [pnpmPath, "licenses", "list", "--prod", "--json"], {
    encoding: "utf8"
  })
);
const notices = await readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
const failures = [];

for (const [license, dependencies] of Object.entries(report)) {
  if (license !== "MIT") failures.push(`Unsupported production license: ${license}`);
  for (const { name } of dependencies) {
    if (!notices.includes(`\`${name}\``)) failures.push(`Missing notice for ${name}`);
  }
}

if (failures.length > 0) throw new Error(failures.join("\n"));
process.stdout.write("All production dependencies are MIT-licensed and documented.\n");
