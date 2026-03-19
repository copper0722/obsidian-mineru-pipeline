import { App, PluginSettingTab, Setting } from "obsidian";
import type MineruPipelinePlugin from "./main";

export interface MineruPipelineSettings {
  mineruPath: string;
  mineruMethod: "auto" | "txt" | "ocr";
  mineruBackend: string;
  outputFolder: string;
  imageFolder: string;
  autoDelete: boolean;
  showNotification: boolean;
}

export const DEFAULT_SETTINGS: MineruPipelineSettings = {
  mineruPath: "mineru",
  mineruMethod: "auto",
  mineruBackend: "pipeline",
  outputFolder: "raw",
  imageFolder: "raw/images",
  autoDelete: true,
  showNotification: true,
};

export class MineruPipelineSettingTab extends PluginSettingTab {
  plugin: MineruPipelinePlugin;

  constructor(app: App, plugin: MineruPipelinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "MinerU Pipeline Settings" });

    new Setting(containerEl)
      .setName("MinerU path")
      .setDesc("Path to mineru CLI executable. Leave as 'mineru' if in PATH.")
      .addText((text) =>
        text
          .setPlaceholder("mineru")
          .setValue(this.plugin.settings.mineruPath)
          .onChange(async (value) => {
            this.plugin.settings.mineruPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Extraction method")
      .setDesc("auto = detect automatically, txt = text extraction, ocr = force OCR")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "Auto")
          .addOption("txt", "Text")
          .addOption("ocr", "OCR")
          .setValue(this.plugin.settings.mineruMethod)
          .onChange(async (value) => {
            this.plugin.settings.mineruMethod = value as "auto" | "txt" | "ocr";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Backend")
      .setDesc("pipeline = CPU general, vlm-auto-engine = GPU high accuracy")
      .addText((text) =>
        text
          .setPlaceholder("pipeline")
          .setValue(this.plugin.settings.mineruBackend)
          .onChange(async (value) => {
            this.plugin.settings.mineruBackend = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Vault folder for converted .md files")
      .addText((text) =>
        text
          .setPlaceholder("raw")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Image folder")
      .setDesc("Vault folder for extracted images")
      .addText((text) =>
        text
          .setPlaceholder("raw/images")
          .setValue(this.plugin.settings.imageFolder)
          .onChange(async (value) => {
            this.plugin.settings.imageFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-delete PDF")
      .setDesc("Delete original PDF from vault after successful conversion")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDelete)
          .onChange(async (value) => {
            this.plugin.settings.autoDelete = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show notifications")
      .setDesc("Show notice when conversion starts and completes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showNotification)
          .onChange(async (value) => {
            this.plugin.settings.showNotification = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
