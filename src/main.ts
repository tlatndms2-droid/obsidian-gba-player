import { App, ItemView, Modal, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BUNDLED_EMULATOR_ASSETS, BUNDLED_EMULATOR_ASSET_VERSION } from "./generated-vendor";

const VIEW_TYPE_GBA_PLAYER = "gba-player-view";
const ROM_EXTENSION = "gba";

export default class GbaPlayerPlugin extends Plugin {
  async onload(): Promise<void> {
    try {
      this.installBundledEmulatorAssets();
    } catch (error) {
      console.error("GBA 실행 파일을 준비하지 못했습니다.", error);
      new Notice("GBA 실행 파일을 준비하지 못했습니다. 플러그인을 다시 설치해 주세요.");
      return;
    }

    this.registerView(VIEW_TYPE_GBA_PLAYER, (leaf) => new GbaPlayerView(leaf, this));

    this.addRibbonIcon("gamepad-2", "GBA 플레이어 열기", () => void this.activateView());
    this.addCommand({
      id: "open-gba-player",
      name: "GBA 플레이어 열기",
      callback: () => void this.activateView()
    });
  }

  async activateView(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_GBA_PLAYER)[0];
    const leaf = existingLeaf ?? this.app.workspace.getRightLeaf(false);

    await leaf.setViewState({ type: VIEW_TYPE_GBA_PLAYER, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  getPluginAssetUrl(relativePath: string): string {
    if (!this.manifest.dir) {
      throw new Error("플러그인 폴더를 찾을 수 없습니다.");
    }

    const assetPath = normalizePath(`${this.manifest.dir}/${relativePath}`);
    return this.app.vault.adapter.getResourcePath(assetPath);
  }

  private installBundledEmulatorAssets(): void {
    if (!this.manifest.dir) {
      throw new Error("플러그인 폴더를 찾을 수 없습니다.");
    }

    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    const vaultPath = adapter.getBasePath?.();
    if (!vaultPath) {
      throw new Error("데스크톱 Vault 경로를 찾을 수 없습니다.");
    }

    const pluginPath = join(vaultPath, this.manifest.dir);
    const markerPath = join(pluginPath, "vendor", "emulator", ".bundle-version");
    const filesArePresent = Object.keys(BUNDLED_EMULATOR_ASSETS).every((relativePath) => existsSync(join(pluginPath, relativePath)));
    if (filesArePresent && existsSync(markerPath) && readFileSync(markerPath, "utf8") === BUNDLED_EMULATOR_ASSET_VERSION) {
      return;
    }

    for (const [relativePath, base64] of Object.entries(BUNDLED_EMULATOR_ASSETS)) {
      const targetPath = join(pluginPath, relativePath);
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, Buffer.from(base64, "base64"));
    }
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, BUNDLED_EMULATOR_ASSET_VERSION, "utf8");
  }
}

class GbaPlayerView extends ItemView {
  private readonly iframeUrl: string;
  private frame: HTMLIFrameElement | null = null;
  private selectedRom: TFile | null = null;
  private selectedRomBytes: ArrayBuffer | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: GbaPlayerPlugin) {
    super(leaf);
    this.iframeUrl = plugin.getPluginAssetUrl("vendor/emulator/index.html");
  }

  getViewType(): string {
    return VIEW_TYPE_GBA_PLAYER;
  }

  getDisplayText(): string {
    return "GBA 플레이어";
  }

  getIcon(): string {
    return "gamepad-2";
  }

  async onOpen(): Promise<void> {
    this.registerDomEvent(window, "message", (event: MessageEvent<unknown>) => this.handleFrameMessage(event));
    this.renderEmptyState();
  }

  async onClose(): Promise<void> {
    this.frame?.remove();
    this.frame = null;
    this.selectedRomBytes = null;
  }

  private renderEmptyState(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gba-player-view");

    const header = contentEl.createDiv({ cls: "gba-player-header" });
    header.createDiv({ text: "GBA 플레이어", cls: "gba-player-title" });
    const loadButton = header.createEl("button", { text: "ROM 불러오기", cls: "mod-cta" });
    loadButton.addEventListener("click", () => this.openRomPicker());

    const emptyState = contentEl.createDiv({ cls: "gba-player-empty" });
    emptyState.createEl("div", { text: "🎮", cls: "gba-player-empty-icon" });
    emptyState.createEl("h3", { text: "GBA 게임을 열어보세요" });
    emptyState.createEl("p", { text: "Vault에 넣어 둔 .gba 파일을 선택하면, 이 사이드바에서 mGBA 기반 에뮬레이터가 실행됩니다." });
    const chooseButton = emptyState.createEl("button", { text: "ROM 선택", cls: "mod-cta" });
    chooseButton.addEventListener("click", () => this.openRomPicker());
    emptyState.createEl("p", { text: "ROM과 BIOS 파일은 플러그인에 포함되지 않습니다.", cls: "gba-player-legal-note" });
  }

  private openRomPicker(): void {
    new RomPickerModal(this.app, (file) => void this.loadRom(file)).open();
  }

  private async loadRom(file: TFile): Promise<void> {
    try {
      this.selectedRom = file;
      this.selectedRomBytes = await this.app.vault.adapter.readBinary(file.path);
      this.renderPlayer();
    } catch (error) {
      console.error("GBA ROM을 읽지 못했습니다.", error);
      new Notice("ROM 파일을 읽지 못했습니다. Vault 안의 .gba 파일인지 확인해 주세요.");
    }
  }

  private renderPlayer(): void {
    if (!this.selectedRom || !this.selectedRomBytes) {
      return;
    }

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gba-player-view");

    const header = contentEl.createDiv({ cls: "gba-player-header" });
    const titleGroup = header.createDiv({ cls: "gba-player-title-group" });
    titleGroup.createDiv({ text: "GBA 플레이어", cls: "gba-player-title" });
    titleGroup.createDiv({ text: this.selectedRom.basename, cls: "gba-player-rom-name" });
    const changeButton = header.createEl("button", { text: "ROM 변경" });
    changeButton.addEventListener("click", () => this.openRomPicker());

    this.statusEl = contentEl.createDiv({ text: "에뮬레이터를 준비하는 중…", cls: "gba-player-status" });

    this.frame = contentEl.createEl("iframe", {
      cls: "gba-player-frame",
      attr: {
        title: "GBA 에뮬레이터",
        allow: "autoplay; fullscreen; gamepad",
        allowfullscreen: "true"
      }
    });
    this.frame.src = this.iframeUrl;
  }

  private handleFrameMessage(event: MessageEvent<unknown>): void {
    if (!this.frame || event.source !== this.frame.contentWindow || !isFrameMessage(event.data)) {
      return;
    }

    if (event.data.type === "gba:ready" && this.selectedRom && this.selectedRomBytes) {
      this.statusEl?.setText("mGBA 엔진을 시작하는 중…");
      this.frame.contentWindow?.postMessage({
        type: "gba:load-rom",
        name: this.selectedRom.name,
        bytes: this.selectedRomBytes
      }, "*", [this.selectedRomBytes]);
      this.selectedRomBytes = null;
      return;
    }

    if (event.data.type === "gba:started") {
      this.statusEl?.remove();
      this.statusEl = null;
      return;
    }

    if (event.data.type === "gba:error") {
      this.statusEl?.setText(`실행할 수 없습니다: ${event.data.message}`);
    }
  }
}

class RomPickerModal extends Modal {
  constructor(app: App, private readonly onSelect: (file: TFile) => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "GBA ROM 선택" });
    contentEl.createEl("p", { text: "Vault 안에 있는 .gba 파일만 표시합니다." });

    const romFiles = this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === ROM_EXTENSION);
    if (romFiles.length === 0) {
      contentEl.createEl("p", { text: "아직 .gba 파일이 없습니다. 직접 보유한 ROM 파일을 Vault에 넣은 뒤 다시 열어 주세요.", cls: "gba-player-empty-list" });
      return;
    }

    const list = contentEl.createDiv({ cls: "gba-player-rom-list" });
    for (const file of romFiles) {
      const item = list.createEl("button", { cls: "gba-player-rom-item" });
      item.createDiv({ text: file.basename, cls: "gba-player-rom-item-name" });
      item.createDiv({ text: file.path, cls: "gba-player-rom-item-path" });
      item.addEventListener("click", () => {
        this.onSelect(file);
        this.close();
      });
    }
  }
}

function isFrameMessage(value: unknown): value is { type: "gba:ready" | "gba:started" | "gba:error"; message?: string } {
  return typeof value === "object" && value !== null && "type" in value && typeof (value as { type?: unknown }).type === "string";
}
