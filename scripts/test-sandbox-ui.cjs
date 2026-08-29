const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const debuggerPort = Number(process.env.GBA_SANDBOX_DEBUG_PORT ?? 9228);
const screenshotPath = path.resolve(process.env.GBA_SANDBOX_SCREENSHOT ?? "artifacts/gba-player-sandbox.png");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        (this.events ??= []).push(message);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
      else pending.resolve(message.result);
    });
  }

  command(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression, contextId, sessionId) {
  const result = await client.command("Runtime.evaluate", {
    expression,
    contextId,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(check, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await check();
    if (lastValue) return lastValue;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function getGameTarget(client) {
  const targets = await client.command("Target.getTargets");
  return targets.targetInfos.find((target) => target.type === "iframe" && target.url.startsWith("http://127.0.0.1:")) ?? null;
}

async function openSettingsClient() {
  const target = await waitFor(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json();
    return targets.find((candidate) => candidate.type === "page" && candidate.url === "about:blank" && /Obsidian Sandbox/.test(candidate.title));
  }, "the Sandbox settings window");
  const settingsClient = new CdpClient(target.webSocketDebuggerUrl);
  await settingsClient.connect();
  return settingsClient;
}

async function run() {
  const targets = await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json();
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("app://obsidian.md/"));
  assert.ok(target, "Sandbox Obsidian page was not found");

  const client = new CdpClient(target.webSocketDebuggerUrl);
  let settingsClient;
  await client.connect();
  try {
    await client.command("Runtime.enable");
    await waitFor(() => evaluate(client, `typeof app !== "undefined"`), "the Sandbox Vault workspace");
    await evaluate(client, `app.plugins.setEnable(true)`);
    await sleep(500);
    let loaded = await evaluate(client, `(() => {
      const plugin = app.plugins.getPlugin("gba-player");
      return {
        loaded: Boolean(plugin),
        version: plugin?.manifest?.version,
        enabled: [...app.plugins.enabledPlugins],
        manifests: Object.keys(app.plugins.manifests)
      };
    })()`);
    if (!loaded.loaded) {
      const directLoad = await evaluate(client, `(async () => {
        try {
          await app.plugins.loadPlugin("gba-player", true);
          const plugin = app.plugins.getPlugin("gba-player");
          return { loaded: Boolean(plugin), version: plugin?.manifest?.version };
        } catch (error) {
          return { error: error?.stack ?? String(error) };
        }
      })()`);
      if (!directLoad.loaded) throw new Error(`Sandbox plugin did not load. ${JSON.stringify(loaded)} ${JSON.stringify(directLoad)}`);
      loaded = directLoad;
    }
    assert.equal(loaded.version, "0.3.2");

    await evaluate(client, `app.plugins.getPlugin("gba-player").openPluginSettings()`);
    settingsClient = await openSettingsClient();
    const initialSettings = await evaluate(settingsClient, `(() => {
      const slider = [...document.querySelectorAll("input[type=range]")].find((input) => input.closest(".setting-item")?.textContent?.includes("기본 음량"));
      return slider ? { value: slider.value, text: slider.closest(".setting-item").textContent, bodyText: document.body.innerText } : null;
    })()`);
    assert.equal(initialSettings?.value, "17", `Saved plugin volume should appear in the actual settings UI: ${JSON.stringify(initialSettings)}`);
    assert.match(initialSettings.bodyText, /게임을 닫거나 Obsidian을 다시 열어도 유지됩니다/);
    console.log("Verified: settings UI shows the stored 17% value.");
    const settingsScreenshotPath = path.resolve("artifacts/gba-player-settings-sandbox.png");
    const settingsScreenshot = await settingsClient.command("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(path.dirname(settingsScreenshotPath), { recursive: true });
    fs.writeFileSync(settingsScreenshotPath, Buffer.from(settingsScreenshot.data, "base64"));

    const changed = await evaluate(settingsClient, `(() => {
      const slider = [...document.querySelectorAll("input[type=range]")].find((input) => input.closest(".setting-item")?.textContent?.includes("기본 음량"));
      slider.value = "23";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
      return slider.value;
    })()`);
    assert.equal(changed, "23");
    await sleep(500);
    console.log("Verified: settings slider accepted 23%.");

    const reloaded = await evaluate(client, `(async () => {
      await app.plugins.disablePlugin("gba-player");
      await app.plugins.enablePlugin("gba-player");
      const plugin = app.plugins.getPlugin("gba-player");
      return { loaded: Boolean(plugin), volume: plugin?.getEmulatorSettings?.().volume };
    })()`);
    assert.deepEqual(reloaded, { loaded: true, volume: 0.23 }, "Plugin setting should survive plugin restart");
    console.log("Verified: 23% persisted across plugin reload.");

    await evaluate(client, `app.plugins.getPlugin("gba-player").openPluginSettings()`);
    await sleep(300);
    const reopenedSettings = await evaluate(settingsClient, `(() => {
      const slider = [...document.querySelectorAll("input[type=range]")].find((input) => input.closest(".setting-item")?.textContent?.includes("기본 음량"));
      return slider?.value ?? null;
    })()`);
    assert.equal(reopenedSettings, "23", "The persisted volume should return to the settings UI after reload");
    console.log("Verified: settings UI restored 23% after reload.");

    console.log("Loading the Sandbox test ROM.");
    await evaluate(client, `(async () => {
      const plugin = app.plugins.getPlugin("gba-player");
      await plugin.activateView();
      const leaf = app.workspace.getLeavesOfType("gba-player-view")[0];
      const rom = app.vault.getAbstractFileByPath("test-rom.gb");
      await leaf.view.loadVaultRom(rom);
      return Boolean(leaf.view.frame);
    })()`);
    console.log("Requested Sandbox ROM load.");
    const playerDom = await evaluate(client, `(() => ({
      iframeSrc: document.querySelector(".gba-player-frame")?.src ?? null,
      status: document.querySelector(".gba-player-status")?.textContent ?? null
    }))()`);
    console.log(`Sandbox player DOM: ${JSON.stringify(playerDom)}`);

    const gameTarget = await waitFor(() => getGameTarget(client), "the emulator iframe", 5000);
    const gameSessionId = (await client.command("Target.attachToTarget", { targetId: gameTarget.targetId, flatten: true })).sessionId;
    console.log("Verified: emulator iframe was created.");

    const gameStarted = await waitFor(
      async () => evaluate(client, `Boolean(window.EJS_emulator?.gameManager && window.EJS_emulator?.volume === 0.23)`, undefined, gameSessionId),
      "the game to start with the persisted volume",
      20000
    );
    assert.equal(gameStarted, true);
    console.log("Verified: game started with the persisted volume.");

    await evaluate(client, `(() => {
      const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === "게임 메뉴");
      button?.click();
      return Boolean(button);
    })()`);
    await sleep(300);

    const menuState = await evaluate(client, `(() => {
      const restartItems = [...document.querySelectorAll(".ejs_menu_button, button, [role='button']")]
        .filter((element) => element.textContent?.trim().toLowerCase() === "restart")
        .map((element) => getComputedStyle(element).display);
      return { restartItems, bodyText: document.body.innerText.includes("Restart") };
    })()`, undefined, gameSessionId);
    assert.ok(menuState.restartItems.length > 0, "The EmulatorJS Restart item was not found for inspection");
    assert.ok(menuState.restartItems.every((display) => display === "none"), "Restart must be hidden in the game menu");

    const screenshot = await client.command("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

    console.log(JSON.stringify({
      plugin: loaded,
      settingsInitialVolume: initialSettings.value,
      settingsPersistedVolume: reopenedSettings,
      emulatorVolume: 0.23,
      restartDisplays: menuState.restartItems,
      settingsScreenshotPath,
      screenshotPath
    }, null, 2));
  } finally {
    settingsClient?.close();
    client.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
