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
  llmEnabled: boolean;
  llmCommand: string;
  shellPath: string;
  zoteroLookup: boolean;
}

export const DEFAULT_SETTINGS: MineruPipelineSettings = {
  mineruPath: "mineru",
  mineruMethod: "auto",
  mineruBackend: "pipeline",
  outputFolder: "raw",
  imageFolder: "raw/images",
  autoDelete: true,
  showNotification: true,
  llmEnabled: false,
  llmCommand: "gemini -p",
  shellPath: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  zoteroLookup: true,
};

export class MineruPipelineSettingTab extends PluginSettingTab {
  plugin: MineruPipelinePlugin;
  constructor(app: App, plugin: MineruPipelinePlugin) { super(app, plugin); this.plugin = plugin; }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "MinerU Pipeline Settings" });
    containerEl.createEl("h3", { text: "MinerU" });
    new Setting(containerEl).setName("MinerU path").setDesc("Path to mineru CLI").addText(t => t.setPlaceholder("mineru").setValue(this.plugin.settings.mineruPath).onChange(async v => { this.plugin.settings.mineruPath = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Method").setDesc("auto/txt/ocr").addDropdown(d => d.addOption("auto","Auto").addOption("txt","Text").addOption("ocr","OCR").setValue(this.plugin.settings.mineruMethod).onChange(async v => { this.plugin.settings.mineruMethod = v as any; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Backend").setDesc("pipeline=CPU, vlm-auto-engine=GPU").addText(t => t.setPlaceholder("pipeline").setValue(this.plugin.settings.mineruBackend).onChange(async v => { this.plugin.settings.mineruBackend = v; await this.plugin.saveSettings(); }));
    containerEl.createEl("h3", { text: "LLM Cleanup" });
    new Setting(containerEl).setName("Enable LLM cleanup").setDesc("Fix zh-TW, LaTeX, HTML tables after MinerU").addToggle(t => t.setValue(this.plugin.settings.llmEnabled).onChange(async v => { this.plugin.settings.llmEnabled = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("LLM command").setDesc("e.g. 'gemini -p' or 'claude -p'").addText(t => t.setPlaceholder("gemini -p").setValue(this.plugin.settings.llmCommand).onChange(async v => { this.plugin.settings.llmCommand = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Shell PATH").setDesc("PATH for CLI (Obsidian may not inherit terminal PATH)").addText(t => t.setPlaceholder("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin").setValue(this.plugin.settings.shellPath).onChange(async v => { this.plugin.settings.shellPath = v; await this.plugin.saveSettings(); }));
    containerEl.createEl("h3", { text: "Zotero" });
    new Setting(containerEl).setName("Zotero lookup").setDesc("Look up citationKey via Better BibTeX (Zotero must be running)").addToggle(t => t.setValue(this.plugin.settings.zoteroLookup).onChange(async v => { this.plugin.settings.zoteroLookup = v; await this.plugin.saveSettings(); }));
    containerEl.createEl("h3", { text: "Output" });
    new Setting(containerEl).setName("Output folder").addText(t => t.setPlaceholder("raw").setValue(this.plugin.settings.outputFolder).onChange(async v => { this.plugin.settings.outputFolder = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Image folder").addText(t => t.setPlaceholder("raw/images").setValue(this.plugin.settings.imageFolder).onChange(async v => { this.plugin.settings.imageFolder = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Auto-delete PDF").addToggle(t => t.setValue(this.plugin.settings.autoDelete).onChange(async v => { this.plugin.settings.autoDelete = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Show notifications").addToggle(t => t.setValue(this.plugin.settings.showNotification).onChange(async v => { this.plugin.settings.showNotification = v; await this.plugin.saveSettings(); }));
  }
}
