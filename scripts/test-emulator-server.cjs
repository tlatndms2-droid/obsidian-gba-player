const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function loadWithObsidianStub(request, parent, isMain) {
  if (request === "obsidian") {
    return {
      App: class {},
      ItemView: class {},
      Modal: class {},
      Notice: class {},
      Plugin: class {},
      TFile: class {},
      WorkspaceLeaf: class {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const pluginModule = require("../main.js");
const GbaPlayerPlugin = pluginModule.default ?? pluginModule;

async function run() {
  const plugin = Object.create(GbaPlayerPlugin.prototype);
  plugin.emulatorServer = null;
  plugin.emulatorServerUrl = "";

  const baseUrl = await plugin.startEmulatorServer();
  try {
    const expected = [
      ["/index.html", "ROM을 불러오는 중"],
      ["/data/loader.js", "EJS_player"],
      ["/data/cores/mgba-wasm.data", null]
    ];

    for (const [path, expectedText] of expected) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 200, `${path} should be served`);
      if (expectedText) {
        assert.match(await response.text(), new RegExp(expectedText));
      } else {
        assert.ok((await response.arrayBuffer()).byteLength > 1_000_000, `${path} should contain the mGBA core`);
      }
    }

    const missing = await fetch(`${baseUrl}/not-found`);
    assert.equal(missing.status, 404, "unknown files should not be served");
  } finally {
    plugin.onunload();
  }
}

run().then(
  () => console.log("Local EmulatorJS server test passed."),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
