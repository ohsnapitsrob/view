#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules"].includes(entry.name)) return [];
      return walk(full);
    }

    return [full];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function checkJsSyntax() {
  const jsFiles = walk(root).filter((file) => file.endsWith(".js"));

  jsFiles.forEach((file) => {
    const rel = relative(file);
    try {
      new vm.Script(fs.readFileSync(file, "utf8"), { filename: rel });
    } catch (err) {
      failures.push(`JS syntax error in ${rel}: ${err.message}`);
    }
  });
}

function scriptSrcs(html) {
  const srcs = [];
  const regex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html))) {
    srcs.push(match[1]);
  }

  return srcs;
}

function checkHtmlScriptPaths() {
  const htmlFiles = walk(root).filter((file) => file.endsWith(".html"));

  htmlFiles.forEach((file) => {
    const rel = relative(file);
    const dir = path.dirname(file);
    const html = fs.readFileSync(file, "utf8");

    scriptSrcs(html)
      .filter((src) => !/^https?:\/\//i.test(src))
      .forEach((src) => {
        const cleaned = src.split("?")[0].split("#")[0];
        const resolved = path.resolve(dir, cleaned);

        if (!fs.existsSync(resolved)) {
          failures.push(`Missing script path in ${rel}: ${src}`);
        }
      });
  });
}

function checkRequiredCoreFiles() {
  [
    "src/boot.js",
    "src/data-store.js",
    "src/scene-packs.js",
    "src/title-visibility.js",
    "src/type-page.js",
    "scripts/check-project.js"
  ].forEach((rel) => {
    if (!fs.existsSync(path.join(root, rel))) {
      failures.push(`Missing required file: ${rel}`);
    }
  });
}

function checkNoKnownBrokenPattern() {
  const sceneCard = path.join(root, "src/scene-card.js");
  if (!fs.existsSync(sceneCard)) return;

  const text = fs.readFileSync(sceneCard, "utf8");
  if (text.includes("(row.rating || []).map")) {
    failures.push("src/scene-card.js still contains unsafe rating map pattern.");
  }
}

checkJsSyntax();
checkHtmlScriptPaths();
checkRequiredCoreFiles();
checkNoKnownBrokenPattern();

if (failures.length) {
  console.error("\nProject checks failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Project checks passed.");
