class LuaEditor {
  constructor(network) {
    this.network = network;
    this.isOpen = false;
    this.defaultCode = `-- Welcome to the Lua Script Editor!
-- You can create your own games and modify the world.

-- Example: Build a house
local size = 5
local px = 200
local py = 40

-- Floor
game.fillArea(px, py, px + size, py, BLOCK.PLANKS)

-- Walls
for i = 1, size do
  game.placeBlock(px, py - i, BLOCK.PLANKS)
  game.placeBlock(px + size, py - i, BLOCK.PLANKS)
end

-- Roof
game.fillArea(px, py - size - 1, px + size, py - size - 1, BLOCK.WOOD)

-- Door
game.breakBlock(px + 2, py - 1)
game.breakBlock(px + 2, py - 2)

-- Windows
game.placeBlock(px + 1, py - 2, BLOCK.GLASS)
game.placeBlock(px + 3, py - 2, BLOCK.GLASS)

-- Torch inside
game.placeBlock(px + 2, py - 3, BLOCK.TORCH)

print("House built!")
game.broadcast("A house was built by a script!")

-- Event: Welcome new players
game.onPlayerJoin(function(player)
  game.sendMessage(player.id, "Welcome " .. player.name .. "!")
  print(player.name .. " joined the game")
end)

-- Event: When someone breaks a block
game.onBlockBreak(function(data)
  print(data.name .. " broke a block at " .. data.x .. ", " .. data.y)
end)
`;

    this.createUI();
    this.loadSavedCode();
  }

  createUI() {
    const panel = document.createElement("div");
    panel.id = "lua-editor";
    panel.style.display = "none";

    panel.innerHTML = `
      <div class="lua-editor-header">
        <h2>Lua Script Editor</h2>
        <div class="lua-editor-tabs">
          <button id="lua-tab-editor" class="lua-tab active">Editor</button>
          <button id="lua-tab-output" class="lua-tab">Output</button>
          <button id="lua-tab-help" class="lua-tab">Help</button>
        </div>
      </div>
      <div id="lua-panel-editor" class="lua-panel">
        <textarea id="lua-code" spellcheck="false" placeholder="Write Lua code here..."></textarea>
        <div class="lua-editor-actions">
          <button id="lua-run-btn" class="lua-btn-run">Run (Ctrl+Enter)</button>
          <button id="lua-clear-btn" class="lua-btn-clear">Clear</button>
          <button id="lua-save-btn" class="lua-btn-save">Save</button>
          <button id="lua-close-btn" class="lua-btn-close">Close (Esc)</button>
        </div>
      </div>
      <div id="lua-panel-output" class="lua-panel" style="display:none;">
        <div id="lua-output"></div>
        <button id="lua-clear-output" class="lua-btn-clear">Clear Output</button>
      </div>
      <div id="lua-panel-help" class="lua-panel" style="display:none;">
        <div class="lua-help-content">
          <h3>API Reference</h3>

          <h4>World Functions</h4>
          <pre>game.placeBlock(x, y, blockId)  -- Place a block</pre>
          <pre>game.breakBlock(x, y)           -- Break a block</pre>
          <pre>game.getTile(x, y)              -- Get block ID at position</pre>
          <pre>game.fillArea(x1, y1, x2, y2, blockId) -- Fill a rectangular area</pre>
          <pre>game.getWorldSize()             -- Returns {width, height}</pre>
          <pre>game.setSpawn(x, y)             -- Set the spawn point</pre>
          <pre>game.setTime(time)              -- Set time (0.0-1.0)</pre>

          <h4>Player Functions</h4>
          <pre>game.getPlayers()               -- Get list of all players</pre>
          <pre>game.getPlayerInfo(playerId)    -- Get {id, name, health, team}</pre>
          <pre>game.sendMessage(playerId, msg) -- Send message to a player</pre>
          <pre>game.broadcast(msg)             -- Send message to all players</pre>
          <pre>player.teleport(playerId, x, y) -- Teleport player to position</pre>
          <pre>player.setSpeed(playerId, speed)-- Set player movement speed</pre>
          <pre>player.setHealth(playerId, hp)  -- Set player health</pre>
          <pre>player.getInfo(playerId)        -- Get player info table</pre>

          <h4>UI Functions (Roblox-like)</h4>
          <pre>ui.createButton(playerId, text, x, y, w, h, color) -- Create a button</pre>
          <pre>ui.createLabel(playerId, text, x, y, w, h, color, fontSize) -- Create text</pre>
          <pre>ui.createFrame(playerId, x, y, w, h, color) -- Create a frame</pre>
          <pre>ui.update(playerId, elementId, props) -- Update UI element</pre>
          <pre>ui.remove(playerId, elementId)  -- Remove UI element</pre>

          <h4>Tools System</h4>
          <pre>tools.give(playerId, toolId)    -- Give a tool to player</pre>
          <pre>tools.remove(playerId, toolId)  -- Remove a tool from player</pre>
          <pre>tools.equipped(playerId)        -- Get equipped tool ID</pre>
          <pre>tools.onUse(function(data) ... end) -- Tool use callback</pre>
          <pre>TOOL.PICKAXE TOOL.SWORD TOOL.BOW TOOL.BLOCK_PLACER TOOL.WAND</pre>

          <h4>DataStore (Persistent Storage)</h4>
          <pre>datastore.get(playerId, key)    -- Get stored value (or nil)</pre>
          <pre>datastore.set(playerId, key, value) -- Store a value permanently</pre>

          <h4>Teams System</h4>
          <pre>teams.create(name, color)       -- Create a new team</pre>
          <pre>teams.setPlayer(playerId, name) -- Assign player to team</pre>
          <pre>teams.getPlayers(name)          -- Get list of players in team</pre>
          <pre>teams.list()                    -- Get all teams info</pre>

          <h4>RemoteEvents (Client-Server)</h4>
          <pre>remote.register(name)           -- Register a remote event</pre>
          <pre>remote.fire(name, data)         -- Fire event to all clients</pre>
          <pre>remote.fireTo(playerId, name, data) -- Fire event to one client</pre>
          <pre>remote.on(name, function(data) ... end) -- Listen for client events</pre>
          <pre>-- Client side: game.fireRemoteEvent(name, data)</pre>
          <pre>-- Client side: game.onRemoteEvent(name, function(data) ... end)</pre>

          <h4>Events</h4>
          <pre>game.onPlayerJoin(function(player) ... end)</pre>
          <pre>game.onPlayerLeave(function(player) ... end)</pre>
          <pre>game.onBlockBreak(function(data) ... end)</pre>
          <pre>game.onBlockPlace(function(data) ... end)</pre>
          <pre>game.onChat(function(data) ... end)</pre>
          <pre>game.onUIEvent(function(data) ... end)</pre>

          <h4>Block Constants</h4>
          <pre>BLOCK.AIR BLOCK.GRASS BLOCK.DIRT BLOCK.STONE BLOCK.WOOD
BLOCK.LEAVES BLOCK.SAND BLOCK.WATER BLOCK.COAL BLOCK.IRON
BLOCK.GOLD BLOCK.DIAMOND BLOCK.BEDROCK BLOCK.PLANKS BLOCK.GLASS
BLOCK.BRICK BLOCK.TORCH BLOCK.FLOWER BLOCK.SNOW BLOCK.ICE</pre>

          <h4>Utility</h4>
          <pre>print(...)  -- Print to output panel and server console</pre>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    this.textarea = document.getElementById("lua-code");
    this.output = document.getElementById("lua-output");
    this.textarea.value = this.defaultCode;

    document.getElementById("lua-run-btn").addEventListener("click", () => this.runCode());
    document.getElementById("lua-clear-btn").addEventListener("click", () => {
      this.textarea.value = "";
    });
    document.getElementById("lua-save-btn").addEventListener("click", () => this.saveCode());
    document.getElementById("lua-close-btn").addEventListener("click", () => this.close());
    document.getElementById("lua-clear-output").addEventListener("click", () => {
      this.output.innerHTML = "";
    });

    document.getElementById("lua-tab-editor").addEventListener("click", () => this.switchTab("editor"));
    document.getElementById("lua-tab-output").addEventListener("click", () => this.switchTab("output"));
    document.getElementById("lua-tab-help").addEventListener("click", () => this.switchTab("help"));

    this.textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.runCode();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        this.textarea.value = this.textarea.value.substring(0, start) + "  " + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
      }
      e.stopPropagation();
    });

    this.textarea.addEventListener("keyup", (e) => {
      e.stopPropagation();
    });
  }

  switchTab(tab) {
    const tabs = ["editor", "output", "help"];
    for (const t of tabs) {
      document.getElementById("lua-panel-" + t).style.display = t === tab ? "flex" : "none";
      document.getElementById("lua-tab-" + t).classList.toggle("active", t === tab);
    }
    if (tab === "editor") {
      this.textarea.focus();
    }
  }

  open() {
    const panel = document.getElementById("lua-editor");
    panel.style.display = "flex";
    this.isOpen = true;
    this.textarea.focus();
  }

  close() {
    const panel = document.getElementById("lua-editor");
    panel.style.display = "none";
    this.isOpen = false;
  }

  runCode() {
    const code = this.textarea.value.trim();
    if (!code) {
      this.addOutput("Nothing to run.", "error");
      return;
    }

    this.addOutput("Running script...", "info");
    this.switchTab("output");
    this.network.runLua(code);
  }

  addOutput(text, type) {
    const line = document.createElement("div");
    line.className = "lua-output-line lua-output-" + (type || "normal");
    line.textContent = text;
    this.output.appendChild(line);
    this.output.scrollTop = this.output.scrollHeight;
  }

  handleResult(data) {
    if (data.success) {
      if (data.output && data.output.length > 0) {
        for (const line of data.output) {
          this.addOutput(line, "normal");
        }
      } else {
        this.addOutput("Script completed (no output)", "info");
      }
    } else {
      this.addOutput("Error: " + data.error, "error");
      if (data.output && data.output.length > 0) {
        for (const line of data.output) {
          this.addOutput(line, "normal");
        }
      }
    }
  }

  saveCode() {
    try {
      localStorage.setItem("mystic_lua_code", this.textarea.value);
      this.addOutput("Code saved to browser storage.", "info");
      this.switchTab("output");
    } catch (e) {
      this.addOutput("Failed to save: " + e.message, "error");
      this.switchTab("output");
    }
  }

  loadSavedCode() {
    try {
      const saved = localStorage.getItem("mystic_lua_code");
      if (saved) {
        this.textarea.value = saved;
      }
    } catch (e) {
      // Ignore
    }
  }
}
