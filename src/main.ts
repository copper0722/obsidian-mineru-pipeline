import { Notice, Plugin, TFile, TFolder } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { convertPdf, sanitizeFilename } from "./converter";
import {
  MineruPipelineSettings,
  DEFAULT_SETTINGS,
  MineruPipelineSettingTab,
} from "./settings";

const copyFileAsync = promisify(fs.copyFile);
const mkdirAsync = promisify(fs.mkdir);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);

export default class MineruPipelinePlugin extends Plugin {
  settings: MineruPipelineSettings = DEFAULT_SETTINGS;
  private processing: Set<string> = new Set();

  async onload() {
    await this.loadSettings();

    // Register file event listener for PDF detection
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          this.handlePdf(file);
        }
      })
    );

    // Command: convert current PDF
    this.addCommand({
      id: "convert-current-pdf",
      name: "Convert current PDF to markdown",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "pdf") {
          if (!checking) {
            this.handlePdf(file);
          }
          return true;
        }
        return false;
      },
    });

    // Command: convert all PDFs in vault
    this.addCommand({
      id: "convert-all-pdfs",
      name: "Convert all PDFs in vault",
      callback: () => {
        this.convertAllPdfs();
      },
    });

    // Register file menu item
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          menu.addItem((item) => {
            item
              .setTitle("Convert to Markdown (MinerU)")
              .setIcon("file-text")
              .onClick(() => this.handlePdf(file));
          });
        }
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("Convert all PDFs (MinerU)")
              .setIcon("files")
              .onClick(() => this.convertFolderPdfs(file));
          });
        }
      })
    );

    this.addSettingTab(new MineruPipelineSettingTab(this.app, this));
  }

  async handlePdf(file: TFile) {
    if (this.processing.has(file.path)) {
      return; // Already processing
    }
    this.processing.add(file.path);

    try {
      if (this.settings.showNotification) {
        new Notice(`MinerU: Converting ${file.name}...`);
      }

      // Get absolute path to PDF
      const vaultPath = (this.app.vault.adapter as any).getBasePath();
      const pdfAbsPath = path.join(vaultPath, file.path);

      // Run MinerU conversion
      const result = await convertPdf(pdfAbsPath, this.settings);

      if (!result.success || !result.markdownPath) {
        new Notice(`MinerU: Failed — ${result.error}`);
        return;
      }

      // Read converted markdown
      const mdContent = await readFileAsync(result.markdownPath, "utf-8");

      // Determine output filename
      const outputName = sanitizeFilename(file.name) + ".md";
      const outputPath = `${this.settings.outputFolder}/${outputName}`;

      // Ensure output folder exists
      await this.ensureFolder(this.settings.outputFolder);

      // Write markdown to vault
      const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, mdContent);
      } else {
        await this.app.vault.create(outputPath, mdContent);
      }

      // Copy images to vault image folder
      if (result.imagePaths.length > 0) {
        const imgSubfolder = sanitizeFilename(file.name);
        const imgVaultDir = `${this.settings.imageFolder}/${imgSubfolder}`;
        const imgAbsDir = path.join(vaultPath, imgVaultDir);
        await mkdirAsync(imgAbsDir, { recursive: true });

        for (const imgPath of result.imagePaths) {
          const imgName = path.basename(imgPath);
          const destPath = path.join(imgAbsDir, imgName);
          await copyFileAsync(imgPath, destPath);
        }
      }

      // Delete original PDF if configured
      if (this.settings.autoDelete) {
        await this.app.vault.delete(file);
      }

      const seconds = (result.duration / 1000).toFixed(1);
      if (this.settings.showNotification) {
        new Notice(
          `MinerU: ${file.name} → ${outputPath} (${seconds}s, ${result.imagePaths.length} images)`
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
    const pdfFiles = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "pdf");
    if (pdfFiles.length === 0) {
      new Notice("No PDFs found in vault.");
      return;
    }
    new Notice(`MinerU: Converting ${pdfFiles.length} PDFs...`);
    for (const pdf of pdfFiles) {
      await this.handlePdf(pdf);
    }
    new Notice(`MinerU: Batch complete (${pdfFiles.length} files).`);
  }

  async convertFolderPdfs(folder: TFolder) {
    const pdfFiles: TFile[] = [];
    this.app.vault.getFiles().forEach((f) => {
      if (f.extension === "pdf" && f.path.startsWith(folder.path)) {
        pdfFiles.push(f);
      }
    });
    if (pdfFiles.length === 0) {
      new Notice(`No PDFs in ${folder.path}`);
      return;
    }
    new Notice(`MinerU: Converting ${pdfFiles.length} PDFs in ${folder.name}...`);
    for (const pdf of pdfFiles) {
      await this.handlePdf(pdf);
    }
    new Notice(`MinerU: Folder complete (${pdfFiles.length} files).`);
  }

  private async ensureFolder(folderPath: string) {
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existing) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
