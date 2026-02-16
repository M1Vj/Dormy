import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const candidateFiles = [
  ".env.local",
  ".env",
];

for (const relativePath of candidateFiles) {
  dotenv.config({
    path: path.join(projectRoot, relativePath),
    override: false,
    quiet: true,
  });
}
