import { Notice, Plugin, TFile, TFolder } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { convertPdf, sanitizeFilename } from "./converter";
import { llmCleanup } from "./llm-cleanup";
import { lookupByFilename, guessKeyFromFilename, buildFrontmatter } from "./zotero-lookup";
import {
  MineruPipelineSettings,
  DEFAULT_SETTINGS,
  MineruPipelineSettingTab,
} from "./settings";

const copyFileAsync = promisify(fs.copyFile);
const mkdirAsync = promisify(fs.mkdir);
const readFileAsync = promisify(fs.readFile);

export default class MineruPipelinePlugin extends Plugin {
  settings: MineruPipelineSettings = DEFAULT_SETTINGS;
  private processing: Set<string> = new Set();

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          this.handlePdf(file);
        }
      })
    );

    this.addCommand({
      id: "convert-current-pdf",
      name: "Convert current PDF to markdown",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "pdf") {
          if (!checking) this.handlePdf(file);
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "convert-all-pdfs",
      name: "Convert all PDFs in vault",
      callback: () => this.convertAllPdfs(),
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          menu.addItem((item) => {
            item.setTitle("Convert to Markdown (MinerU)").setIcon("file-text")
              .onClick(() => this.handlePdf(file));
          });
        }
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item.setTitle("Convert all PDFs (MinerU)").setIcon("files")
              .onClick(() => this.convertFolderPdfs(file));
          });
        }
      })
    );

    this.addSettingTab(new MineruPipelineSettingTab(this.app, this));
  }

  async handlePdf(file: TFile) {
    if (this.processing.has(file.path)) return;
    this.processing.add(file.path);

    try {
      if (this.settings.showNotification) {
        new Notice(`MinerU: Converting ${file.name}...`);
      }

      const vaultPath = (this.app.vault.adapter as any).getBasePath();
      const pdfAbsPath = path.join(vaultPath, file.path);

      // Step 1: MinerU extraction
      const result = await convertPdf(pdfAbsPath, this.settings);
      if (!result.success || !result.markdownPath) {
        new Notice(`MinerU: Failed — ${result.error}`);
        return;
      }

      // Step 2: Read raw markdown
      let mdContent = await readFileAsync(result.markdownPath, "utf-8");

      // Step 3: LLM cleanup (if enabled)
      if (this.settings.llmEnabled) {
        if (this.settings.showNotification) {
          new Notice(`MinerU: Running LLM cleanup...`);
        }
        mdContent = await llmCleanup(mdContent, this.settings);
      }

      // Step 4: Zotero lookup (if enabled)
      let outputName: string;
      let frontmatter = "";

      if (this.settings.zoteroLookup) {
        const zoteroItem = await lookupByFilename(file.name);
        const today = new Date().toISOString().split("T")[0];
        frontmatter = buildFrontmatter(zoteroItem, file.name, today);

        if (zoteroItem?.citationKey) {
          outputName = zoteroItem.citationKey + ".md";
        } else {
          outputName = guessKeyFromFilename(file.name) + ".md";
        }
      } else {
        outputName = sanitizeFilename(file.name) + ".md";
      }

      // Combine frontmatter + content
      const finalContent = frontmatter + mdContent;
      const outputPath = `${this.settings.outputFolder}/${outputName}`;

      // Step 5: Write to vault
      await this.ensureFolder(this.settings.outputFolder);
      const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, finalContent);
      } else {
        await this.app.vault.create(outputPath, finalContent);
      }

      // Step 6: Copy images
      if (result.imagePaths.length > 0) {
        const imgSubfolder = outputName.replace(/\.md$/, "");
        const imgVaultDir = `${this.settings.imageFolder}/${imgSubfolder}`;
        const imgAbsDir = path.join(vaultPath, imgVaultDir);
        await mkdirAsync(imgAbsDir, { recursive: true });

        for (const imgPath of result.imagePaths) {
          const imgName = path.basename(imgPath);
          await copyFileAsync(imgPath, path.join(imgAbsDir, imgName));
        }
      }

      // Step 7: Delete original PDF
      if (this.settings.autoDelete) {
        await this.app.vault.delete(file);
      }

      const seconds = (result.duration / 1000).toFixed(1);
      if (this.settings.showNotification) {
        new Notice(
          `MinerU: ${file.name} → ${outputPath} (${seconds}s, ${result.imagePaths.length} imgs${this.settings.llmEnabled ? ", LLM cleaned" : ""})`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`MinerU error: ${message}`);
    } finally {
      this.processing.delete(file.path);
    }
  }

  async convertAllPdfs() {
    const pdfFiles = this.app.vault.getFiles().filter((f) => f.extension === "pdf");
    if (pdfFiles.length === 0) { new Notice("No PDFs found."); return; }
    new Notice(`MinerU: Converting ${pdfFiles.length} PDFs...`);
    for (const pdf of pdfFiles) await this.handlePdf(pdf);
    new Notice(`MinerU: Batch complete (${pdfFiles.length} files).`);
  }

  async convertFolderPdfs(folder: TFolder) {
    const pdfFiles = this.app.vault.getFiles().filter(f => f.extension === "pdf" && f.path.startsWith(folder.path));
    if (pdfFiles.length === 0) { new Notice(`No PDFs in ${folder.path}`); return; }
    new Notice(`MinerU: Converting ${pdfFiles.length} PDFs in ${folder.name}...`);
    for (const pdf of pdfFiles) await this.handlePdf(pdf);
    new Notice(`MinerU: Folder complete (${pdfFiles.length} files).`);
  }

  private async ensureFolder(folderPath: string) {
    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
}
