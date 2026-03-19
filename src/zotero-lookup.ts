import { exec } from "child_process";
import { promisify } from "util";
import { requestUrl } from "obsidian";

const execAsync = promisify(exec);

export interface ZoteroItem {
  citationKey: string;
  itemKey: string;
  title: string;
  creators: string;
  year: string;
}

/**
 * Look up a Zotero item by PDF filename using Better BibTeX JSON-RPC.
 * Better BibTeX must be installed in Zotero and Zotero must be running.
 */
export async function lookupByFilename(pdfFilename: string): Promise<ZoteroItem | null> {
  try {
    // Search via Better BibTeX JSON-RPC (localhost:23119)
    const searchTerm = pdfFilename
      .replace(/\.pdf$/i, "")
      .replace(/^\d{4}\s*-\s*/, "") // Remove leading year
      .substring(0, 60); // Truncate for search

    const response = await requestUrl({
      url: "http://localhost:23119/better-bibtex/json-rpc",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "item.search",
        params: [searchTerm],
      }),
    });

    const data = JSON.parse(response.text);
    if (data.result && data.result.length > 0) {
      const item = data.result[0];
      return {
        citationKey: item.citekey || item.citationKey || "",
        itemKey: item.itemKey || item.key || "",
        title: item.title || "",
        creators: formatCreators(item.creators || []),
        year: item.date ? item.date.substring(0, 4) : "",
      };
    }

    return null;
  } catch (err) {
    // Better BibTeX not running or Zotero not open
    console.error("MinerU Pipeline: Zotero lookup failed:", err);
    return null;
  }
}

/**
 * Try to extract citationKey from filename pattern.
 * Handles common patterns: "Author2026.pdf", "2026 - Title.pdf", "authorTitle2026.pdf"
 */
export function guessKeyFromFilename(filename: string): string {
  const name = filename.replace(/\.pdf$/i, "");

  // Pattern: "Author et al. - 2026 - Title" → author2026
  const match1 = name.match(/^(.+?)\s*[-–]\s*(\d{4})\s*[-–]\s*/);
  if (match1) {
    const author = match1[1].split(/[,&]/)[0].trim().split(/\s+/).pop() || "";
    return author.toLowerCase() + match1[2];
  }

  // Pattern: "2026 - Title" → title2026
  const match2 = name.match(/^(\d{4})\s*[-–]\s*(.+)/);
  if (match2) {
    const firstWord = match2[2].split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
    return firstWord + match2[1];
  }

  // Fallback: sanitize filename
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 40);
}

function formatCreators(creators: any[]): string {
  if (!creators || creators.length === 0) return "";
  return creators
    .map((c: any) => c.lastName || c.name || "")
    .filter(Boolean)
    .join(", ");
}

/**
 * Build frontmatter for the output .md file
 */
export function buildFrontmatter(
  zoteroItem: ZoteroItem | null,
  pdfFilename: string,
  extractionDate: string
): string {
  const key = zoteroItem?.citationKey || guessKeyFromFilename(pdfFilename);

  const lines = [
    "---",
    `citationKey: ${key}`,
  ];

  if (zoteroItem) {
    lines.push(`zoteroItemKey: ${zoteroItem.itemKey}`);
    lines.push(`title: "${zoteroItem.title.replace(/"/g, '\\"')}"`);
    if (zoteroItem.creators) lines.push(`authors: "${zoteroItem.creators}"`);
    if (zoteroItem.year) lines.push(`year: ${zoteroItem.year}`);
  }

  lines.push(`source: zotero`);
  lines.push(`extracted: ${extractionDate}`);
  lines.push(`method: mineru+claude`);
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
