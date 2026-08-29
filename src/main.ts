import { App, ItemView, Modal, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BUNDLED_EMULATOR_ASSETS, BUNDLED_EMULATOR_ASSET_VERSION } from "./generated-vendor";

const VIEW_TYPE_GBA_PLAYER = "gba-player-view";
const SUPPORTED_ROM_EXTENSIONS = new Set(["gb", "gbc", "gba"]);

interface SelectedRom {
  name: string;
  displayName: string;
}

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
  private readonly emulatorLoaderUrl: string;
  private readonly emulatorDataUrl: string;
  private frame: HTMLIFrameElement | null = null;
  private selectedRom: SelectedRom | null = null;
  private selectedRomBytes: ArrayBuffer | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: GbaPlayerPlugin) {
    super(leaf);
    this.iframeUrl = plugin.getPluginAssetUrl("vendor/emulator/index.html");
    this.emulatorLoaderUrl = plugin.getPluginAssetUrl("vendor/emulator/data/loader.js");
    this.emulatorDataUrl = new URL(".", this.emulatorLoaderUrl).toString();
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
    const loadButton = header.createEl("button", { text: "게임 불러오기", cls: "mod-cta" });
    loadButton.addEventListener("click", () => this.openRomSourcePicker());

    const emptyState = contentEl.createDiv({ cls: "gba-player-empty" });
    emptyState.createEl("div", { text: "🎮", cls: "gba-player-empty-icon" });
    emptyState.createEl("h3", { text: "GBA 게임을 열어보세요" });
    emptyState.createEl("p", { text: "PC 또는 Vault에서 .gb, .gbc, .gba 파일을 선택하면 이 사이드바에서 mGBA 기반 에뮬레이터가 실행됩니다." });
    const chooseButton = emptyState.createEl("button", { text: "게임 선택", cls: "mod-cta" });
    chooseButton.addEventListener("click", () => this.openRomSourcePicker());
    emptyState.createEl("p", { text: "ROM과 BIOS 파일은 플러그인에 포함되지 않습니다.", cls: "gba-player-legal-note" });
  }

  private openRomSourcePicker(): void {
    new RomSourceModal(
      this.app,
      () => new RomPickerModal(this.app, (file) => void this.loadVaultRom(file)).open(),
      () => this.openSystemFilePicker()
    ).open();
  }

  private async loadVaultRom(file: TFile): Promise<void> {
    try {
      this.selectedRom = { name: file.name, displayName: file.basename };
      this.selectedRomBytes = await this.app.vault.adapter.readBinary(file.path);
      this.renderPlayer();
    } catch (error) {
      console.error("게임 파일을 읽지 못했습니다.", error);
      new Notice("게임 파일을 읽지 못했습니다. Vault 안의 .gb, .gbc, .gba 파일인지 확인해 주세요.");
    }
  }

  private openSystemFilePicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gb,.gbc,.gba";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (file) {
        void this.loadSystemRom(file);
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }

  private async loadSystemRom(file: File): Promise<void> {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !SUPPORTED_ROM_EXTENSIONS.has(extension)) {
      new Notice(".gb, .gbc, .gba 파일만 열 수 있습니다.");
      return;
    }

    try {
      this.selectedRom = { name: file.name, displayName: file.name.replace(/\.[^.]+$/, "") };
      this.selectedRomBytes = await file.arrayBuffer();
      this.renderPlayer();
    } catch (error) {
      console.error("PC의 게임 파일을 읽지 못했습니다.", error);
      new Notice("선택한 게임 파일을 읽지 못했습니다.");
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
    titleGroup.createDiv({ text: this.selectedRom.displayName, cls: "gba-player-rom-name" });
    const changeButton = header.createEl("button", { text: "게임 변경" });
    changeButton.addEventListener("click", () => this.openRomSourcePicker());

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
        bytes: this.selectedRomBytes,
        loaderUrl: this.emulatorLoaderUrl,
        dataUrl: this.emulatorDataUrl
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
    contentEl.createEl("h2", { text: "Vault 게임 파일 선택" });
    contentEl.createEl("p", { text: "Vault 안에 있는 .gb, .gbc, .gba 파일을 표시합니다." });

    const romFiles = this.app.vault.getFiles().filter((file) => SUPPORTED_ROM_EXTENSIONS.has(file.extension.toLowerCase()));
    if (romFiles.length === 0) {
      contentEl.createEl("p", { text: "아직 지원되는 게임 파일이 없습니다. PC에서 직접 열거나 .gb, .gbc, .gba 파일을 Vault에 넣어 주세요.", cls: "gba-player-empty-list" });
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

class RomSourceModal extends Modal {
  constructor(
    app: App,
    private readonly onChooseVault: () => void,
    private readonly onChoosePc: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "게임 파일 불러오기" });
    contentEl.createEl("p", { text: "Vault 안의 파일 또는 PC의 어느 폴더에 있는 파일도 열 수 있습니다." });

    const vaultButton = contentEl.createEl("button", { text: "Vault에서 선택", cls: "mod-cta gba-player-source-button" });
    vaultButton.addEventListener("click", () => {
      this.close();
      this.onChooseVault();
    });

    const pcButton = contentEl.createEl("button", { text: "PC에서 직접 선택", cls: "gba-player-source-button" });
    pcButton.addEventListener("click", () => {
      this.close();
      this.onChoosePc();
    });
  }
}

function isFrameMessage(value: unknown): value is { type: "gba:ready" | "gba:started" | "gba:error"; message?: string } {
  return typeof value === "object" && value !== null && "type" in value && typeof (value as { type?: unknown }).type === "string";
}
