import { exec } from "child_process";
import { promisify } from "util";
import type { MineruPipelineSettings } from "./settings";

const execAsync = promisify(exec);

const CLEANUP_PROMPT = `You are a zh-TW text cleanup agent. Fix the following MinerU-extracted markdown. Rules:
1. Fix ALL simplified Chinese → Traditional Chinese (e.g., 诊→診, 贰→貳, 决→決, 医→醫, 技术→技術, 顺→順)
2. Remove LaTeX artifacts ($:$, $=$, $\\textcircled{}$, $\\$ NNN$)
3. Convert HTML <table> tags → pipe-separated markdown tables
4. Fix run-on lines (split merged fields)
5. Do NOT change any factual content, numbers, dates, or names
6. Output ONLY the cleaned markdown, no commentary.

Input:
`;

export async function llmCleanup(
  rawMarkdown: string,
  settings: MineruPipelineSettings
): Promise<string> {
  if (!settings.llmEnabled || !settings.llmCommand) {
    return rawMarkdown;
  }

  try {
    // Write raw content to temp file to avoid shell escaping issues
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const tmpFile = path.join(os.tmpdir(), `mineru-llm-input-${Date.now()}.md`);
    const tmpOutput = path.join(os.tmpdir(), `mineru-llm-output-${Date.now()}.md`);

    fs.writeFileSync(tmpFile, rawMarkdown, "utf-8");

    // Build command: pipe file content to LLM CLI
    let cmd: string;
    if (settings.llmCommand.includes("gemini")) {
      cmd = `cat "${tmpFile}" | gemini -p "${CLEANUP_PROMPT}" > "${tmpOutput}"`;
    } else if (settings.llmCommand.includes("claude")) {
      cmd = `claude -p "${CLEANUP_PROMPT}" < "${tmpFile}" > "${tmpOutput}"`;
    } else {
      // Generic: assume command accepts stdin and outputs to stdout
      cmd = `cat "${tmpFile}" | ${settings.llmCommand} > "${tmpOutput}"`;
    }

    await execAsync(cmd, {
      timeout: 300000, // 5 min timeout for LLM
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, PATH: settings.shellPath || process.env.PATH },
    });

    // Read cleaned output
    if (fs.existsSync(tmpOutput)) {
      const cleaned = fs.readFileSync(tmpOutput, "utf-8");
      // Cleanup temp files
      fs.unlinkSync(tmpFile);
      fs.unlinkSync(tmpOutput);

      // Sanity check: cleaned output should be at least 50% of original length
      if (cleaned.length > rawMarkdown.length * 0.5) {
        return cleaned;
      }
      // If LLM output is suspiciously short, return raw
      return rawMarkdown;
    }

    return rawMarkdown;
  } catch (err: unknown) {
    // LLM cleanup failed — return raw markdown (graceful degradation)
    console.error("MinerU Pipeline: LLM cleanup failed:", err);
    return rawMarkdown;
  }
}
