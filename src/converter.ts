import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import type { MineruPipelineSettings } from "./settings";

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const copyFileAsync = promisify(fs.copyFile);
const mkdirAsync = promisify(fs.mkdir);

export interface ConversionResult {
  success: boolean;
  markdownPath: string | null;
  imagePaths: string[];
  error: string | null;
  duration: number;
}

export async function convertPdf(
  pdfPath: string,
  settings: MineruPipelineSettings
): Promise<ConversionResult> {
  const startTime = Date.now();
  const tmpDir = path.join(require("os").tmpdir(), "mineru-pipeline-" + Date.now());

  try {
    await mkdirAsync(tmpDir, { recursive: true });

    // Step 1: Run MinerU
    const cmd = [
      settings.mineruPath,
      "-p", JSON.stringify(pdfPath),
      "-o", JSON.stringify(tmpDir),
      "-m", settings.mineruMethod,
      "-b", settings.mineruBackend,
    ].join(" ");

    await execAsync(cmd, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });

    // Step 2: Find the output .md file
    const mdFile = await findMdFile(tmpDir);
    if (!mdFile) {
      return {
        success: false,
        markdownPath: null,
        imagePaths: [],
        error: "MinerU produced no .md output",
        duration: Date.now() - startTime,
      };
    }

    // Step 3: Read the markdown content
    const content = await readFileAsync(mdFile, "utf-8");

    // Step 4: Find extracted images
    const imageDir = path.join(path.dirname(mdFile), "images");
    const imagePaths: string[] = [];
    try {
      const imageFiles = await readdirAsync(imageDir);
      for (const img of imageFiles) {
        imagePaths.push(path.join(imageDir, img));
      }
    } catch {
      // No images directory — that's fine
    }

    return {
      success: true,
      markdownPath: mdFile,
      imagePaths,
      error: null,
      duration: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      markdownPath: null,
      imagePaths: [],
      error: `MinerU failed: ${message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function findMdFile(dir: string): Promise<string | null> {
  const entries = await readdirAsync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await statAsync(fullPath);
    if (stat.isDirectory()) {
      const found = await findMdFile(fullPath);
      if (found) return found;
    } else if (entry.endsWith(".md")) {
      return fullPath;
    }
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_");
}
