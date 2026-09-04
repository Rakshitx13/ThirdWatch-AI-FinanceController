"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { cp, mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const EXCLUDED = new Set([".git", ".env", ".pnpm-store", "node_modules", "dist", "coverage", "release"]);

async function main() {
  const projectDirectory = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(await readFile(path.join(projectDirectory, "package.json"), "utf8"));
  const baseName = `ThirdWatch-${packageJson.version}`;
  const releaseDirectory = path.join(projectDirectory, "release");
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "thirdwatch-release-"));
  const stagedProject = path.join(temporaryDirectory, baseName);
  const archivePath = path.join(releaseDirectory, `${baseName}.zip`);

  try {
    await mkdir(releaseDirectory, { recursive: true });
    await Promise.all([
      rm(archivePath, { force: true }),
      rm(`${archivePath}.sha256`, { force: true })
    ]);
    await cp(projectDirectory, stagedProject, {
      recursive: true,
      filter(source) {
        const relative = path.relative(projectDirectory, source);
        if (!relative) return true;
        const segments = relative.split(path.sep);
        if (segments.some((segment) => EXCLUDED.has(segment))) return false;
        if (relative === path.join("client", "dist")) return false;
        if (segments[0] === "data" && relative !== "data" && relative !== path.join("data", "README.md")) return false;
        return !relative.endsWith(".log");
      }
    });

    if (process.platform === "win32") {
      execFileSync("tar.exe", ["-a", "-c", "-f", archivePath, baseName], { cwd: temporaryDirectory, stdio: "inherit" });
    } else {
      execFileSync("zip", ["-q", "-r", archivePath, baseName], { cwd: temporaryDirectory, stdio: "inherit" });
    }

    const digest = createHash("sha256").update(await readFile(archivePath)).digest("hex");
    await writeFile(`${archivePath}.sha256`, `${digest}  ${path.basename(archivePath)}\n`, "utf8");
    console.log(`Created ${archivePath}`);
    console.log(`SHA-256 ${digest}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
