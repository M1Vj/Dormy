import { mkdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";

const manifestPath = join(
  process.cwd(),
  ".next",
  "server",
  "app",
  "(role)",
  "page_client-reference-manifest.js"
);

const fallbackManifest = [
  "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});",
  'globalThis.__RSC_MANIFEST["/(role)/page"]={',
  '  "moduleLoading":{"prefix":"/_next/"},',
  '  "ssrModuleMapping":{},',
  '  "edgeSSRModuleMapping":{},',
  '  "clientModules":{},',
  '  "entryCSSFiles":{},',
  '  "rscModuleMapping":{},',
  '  "edgeRscModuleMapping":{}',
  "};",
].join("");

try {
  await access(manifestPath, constants.F_OK);
  console.log(`[ensure-role-manifest] Found ${manifestPath}`);
} catch {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, fallbackManifest, "utf8");
  console.log(`[ensure-role-manifest] Created fallback ${manifestPath}`);
}
