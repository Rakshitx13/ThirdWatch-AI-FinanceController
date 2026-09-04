"use strict";

const { createHash } = require("node:crypto");
const { access, readFile, readdir } = require("node:fs/promises");
const path = require("node:path");

const projectDirectory = path.resolve(__dirname, "..");
const failures = [];
const passes = [];

async function exists(relativePath) {
  try {
    await access(path.join(projectDirectory, relativePath));
    return true;
  } catch {
    return false;
  }
}

function check(condition, description) {
  (condition ? passes : failures).push(description);
}

async function text(relativePath) {
  return readFile(path.join(projectDirectory, relativePath), "utf8");
}

async function main() {
  const required = [
    "README.md", "ARCHITECTURE.md", ".gitignore", ".env.example", ".nvmrc", ".node-version",
    "package.json", "pnpm-lock.yaml", "Dockerfile", ".dockerignore", ".github/workflows/ci.yml",
    "SECURITY.md", "CONTRIBUTING.md", "scripts/cleanup-data.js", "scripts/validate-release.js"
  ];
  for (const file of required) check(await exists(file), `${file} exists`);

  check((await exists("LICENSE")) || (await exists("LICENSE_STATUS.md")), "license or explicit license-status file exists");

  const packageJson = JSON.parse(await text("package.json"));
  check(packageJson.packageManager === "pnpm@11.19.0", "packageManager is pinned to pnpm@11.19.0");
  check(packageJson.engines?.node === ">=24.19.0 <25", "Node engine is constrained to the tested major");
  check((await text(".nvmrc")).trim() === "24.19.0", ".nvmrc pins Node 24.19.0");
  check((await text(".node-version")).trim() === "24.19.0", ".node-version pins Node 24.19.0");
  check(!(await exists("package-lock.json")), "no competing npm lockfile exists");

  const envExample = await text(".env.example");
  check(/^HOST=127\.0\.0\.1$/m.test(envExample), "default host is loopback-only");
  check(/^ANTHROPIC_API_KEY=$/m.test(envExample), "example Anthropic key is empty");
  check(!/^ANTHROPIC_API_KEY=\S+/m.test(envExample), "no Anthropic secret is embedded in .env.example");

  const dockerfile = await text("Dockerfile");
  check((dockerfile.match(/^FROM /gm) ?? []).length >= 2, "Dockerfile is multi-stage");
  check(/^USER node$/m.test(dockerfile), "container runtime is non-root");
  check(/^HEALTHCHECK /m.test(dockerfile), "container health check exists");
  check(/^data$/m.test(await text(".dockerignore")), "Docker context excludes runtime financial data");

  const workflow = await text(".github/workflows/ci.yml");
  check(workflow.includes("pnpm install --frozen-lockfile"), "CI uses the authoritative lockfile");
  check(workflow.includes("pnpm run test:all"), "CI runs the complete test suite");
  check(workflow.includes("docker build"), "CI validates the container build");

  const appSource = await text("server/app.ts");
  const routeSource = await text("server/routes.ts");
  check(appSource.includes('app.get("/health"'), "root health endpoint is implemented");
  check(routeSource.includes('service: "ThirdWatch"'), "health response uses ThirdWatch branding");
  check(routeSource.includes('router.get("/metrics"'), "aggregate metrics endpoint is implemented");

  const licenseStatus = (await exists("LICENSE_STATUS.md")) ? await text("LICENSE_STATUS.md") : "";
  check((await exists("LICENSE")) || licenseStatus.includes("No software license has been selected"), "unresolved license status is explicit");

  if (process.argv.includes("--require-artifacts")) {
    const releaseDirectory = path.join(projectDirectory, "release");
    const archiveName = `ThirdWatch-${packageJson.version}.zip`;
    const archivePath = path.join(releaseDirectory, archiveName);
    const checksumPath = `${archivePath}.sha256`;
    check(await exists(path.join("release", archiveName)), `${archiveName} exists`);
    check(await exists(path.join("release", `${archiveName}.sha256`)), `${archiveName}.sha256 exists`);
    if ((await exists(path.join("release", archiveName))) && (await exists(path.join("release", `${archiveName}.sha256`)))) {
      const actual = createHash("sha256").update(await readFile(archivePath)).digest("hex");
      const declared = (await readFile(checksumPath, "utf8")).trim().split(/\s+/)[0];
      check(actual === declared, "release SHA-256 checksum verifies");
    }
  }

  for (const message of passes) console.log(`PASS ${message}`);
  for (const message of failures) console.error(`FAIL ${message}`);
  console.log(`Validated ${passes.length + failures.length} release requirement(s): ${passes.length} passed, ${failures.length} failed.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
