class Game {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    this.world = new ClientWorld();
    this.input = new InputManager(this.canvas);
    this.network = new NetworkManager();
    this.chat = null;
    this.luaEditor = null;
    this.gameBrowser = null;
    this.currentGameName = null;

    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.camera = { x: 0, y: 0 };
    this.zoom = Constants.CAMERA_ZOOM;
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.lastFrameTime = 0;
    this.gameStarted = false;
    this.lastToolUse = 0;
    this.uiElements = new Map();
    this.tools = [];
    this.equippedTool = null;
    this.remoteEventHandlers = {};
    this.registeredRemoteEvents = new Set();

    this.setupInputCallbacks();
    this.setupNetworkCallbacks();
    this.setupLoginScreen();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setupInputCallbacks() {
    this.input.onToggleChat = (open) => {
      if (!this.chat) return;
      if (open) {
        this.chat.open();
        this.input.setDisabled(true);
      } else {
        this.chat.close();
        this.input.setDisabled(false);
      }
    };

    this.input.onToggleLuaEditor = (open) => {
      if (!this.luaEditor) return;
      if (open) {
        this.luaEditor.open();
        this.input.setDisabled(true);
      } else {
        this.luaEditor.close();
        this.input.setDisabled(false);
      }
    };

    this.input.onToggleCreative = () => {
      if (!this.localPlayer) return;
      const isCreative = this.localPlayer.toggleCreative();
      this.network.sendCreativeToggle(isCreative);
      this.updateModeDisplay();
    };
  }

  setupNetworkCallbacks() {
    this.network.onJoinAccepted = (data) => {
      this.localPlayer = new Player(data.id, data.username, data.color, data.x, data.y);
      this.localPlayer.isLocal = true;

      this.localPlayer.onNetworkMove = (moveData) => {
        this.network.sendMove(moveData);
      };

      document.getElementById("loading-screen").style.display = "none";

      if (this.gameBrowser) {
        this.gameBrowser.open();
      } else {
        this.startGame();
      }
    };

    this.network.onWorldData = (data) => {
      this.world.loadFromData(data);
    };

    this.network.onPlayerJoined = (data) => {
      if (data.id === this.localPlayer?.id) return;
      const rp = new RemotePlayer(data);
      this.remotePlayers.set(data.id, rp);
    };

    this.network.onPlayerLeft = (data) => {
      this.remotePlayers.delete(data.id);
    };

    this.network.onPlayerMove = (data) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) {
        rp.updateFromNetwork(data);
      }
    };

    this.network.onPlayerPositions = (data) => {
      for (const id in data) {
        if (id === this.localPlayer?.id) continue;
        const rp = this.remotePlayers.get(id);
        if (rp) {
          rp.updateFromNetwork(data[id]);
        }
      }
    };

    this.network.onBlockChange = (data) => {
      this.world.setTile(data.x, data.y, data.tileId);
    };

    this.network.onChatMessage = (data) => {
      if (this.chat) this.chat.addMessage(data);
    };

    this.network.onPlayerList = (list) => {
      this.updatePlayerList(list);
    };

    this.network.onError = (msg) => {
      const errEl = document.getElementById("login-error");
      if (errEl) errEl.textContent = msg;
    };

    this.network.onLuaResult = (data) => {
      if (this.luaEditor) this.luaEditor.handleResult(data);
    };

    this.network.onUICreate = (data) => {
      this.createUIElement(data);
    };

    this.network.onUIUpdate = (data) => {
      this.updateUIElement(data);
    };

    this.network.onUIRemove = (data) => {
      this.removeUIElement(data.id);
    };

    this.network.onToolList = (data) => {
      this.updateToolbar(data.tools || []);
    };

    this.network.onTeamUpdate = (teams) => {
      this.updateTeamPanel(teams);
    };

    this.network.onRemoteEvent = (data) => {
      if (this.remoteEventHandlers && this.remoteEventHandlers[data.name]) {
        this.remoteEventHandlers[data.name](data.data);
      }
    };

    this.network.onRemoteEventRegister = (data) => {
      this.registeredRemoteEvents = this.registeredRemoteEvents || new Set();
      this.registeredRemoteEvents.add(data.name);
    };

    this.network.onPlayerTeleport = (data) => {
      if (this.localPlayer) {
        this.localPlayer.x = data.x;
        this.localPlayer.y = data.y;
        this.localPlayer.vx = 0;
        this.localPlayer.vy = 0;
      }
    };

    this.network.onPlayerSpeed = (data) => {
      if (this.localPlayer) {
        this.localPlayer.customSpeed = data.speed;
      }
    };

    this.network.onPlayerHealthSet = (data) => {
      if (this.localPlayer) {
        this.localPlayer.health = data.health;
      }
    };
  }

  setupLoginScreen() {
    const playBtn = document.getElementById("play-btn");
    const usernameInput = document.getElementById("username-input");
    const errorEl = document.getElementById("login-error");

    const tryJoin = () => {
      const username = usernameInput.value.trim();
      if (!username) {
        errorEl.textContent = "Please enter a username";
        return;
      }
      errorEl.textContent = "";

      document.getElementById("login-screen").style.display = "none";
      document.getElementById("game-container").style.display = "block";

      this.network.connect();
      this.chat = new ChatManager(this.network.socket);
      this.luaEditor = new LuaEditor(this.network);
      this.gameBrowser = new GameBrowser(this.network);

      this.gameBrowser.onCreateJoin = (gameData) => {
        this.currentGameName = gameData ? gameData.name : "Sandbox";
        this.startGame();
      };

      this.network.socket.on("connect", () => {
        this.network.join(username);
      });

      if (this.network.socket.connected) {
        this.network.join(username);
      }
    };

    playBtn.addEventListener("click", tryJoin);
    usernameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryJoin();
    });
    usernameInput.focus();
  }

  startGame() {
    document.getElementById("crosshair").style.display = "block";
    document.getElementById("player-list-panel").style.display = "block";
    const gameNameEl = document.getElementById("game-name-display");
    if (gameNameEl && this.currentGameName) {
      gameNameEl.textContent = this.currentGameName;
    }
    this.gameStarted = true;
    this.input.setDisabled(false);
    this.updateModeDisplay();
  }

  updateModeDisplay() {
    const modeEl = document.getElementById("mode-display");
    if (!modeEl) return;
    if (this.localPlayer && this.localPlayer.creativeMode) {
      modeEl.textContent = "Creative";
      modeEl.style.color = "#4ee4ec";
    } else {
      modeEl.textContent = "Play";
      modeEl.style.color = "#2ecc71";
    }
  }

  updatePlayerList(list) {
    const panel = document.getElementById("player-list-panel");
    panel.innerHTML = "";
    document.getElementById("player-count").textContent = `Players: ${list.length}`;

    for (const p of list) {
      const entry = document.createElement("div");
      entry.className = "player-list-entry";
      entry.innerHTML = `<div class="player-color-dot" style="background:${p.color}"></div> ${this.escapeHtml(p.username)}`;
      panel.appendChild(entry);
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  createUIElement(data) {
    const layer = document.getElementById("lua-ui-layer");
    if (!layer) return;

    let el;
    if (data.type === "button") {
      el = document.createElement("button");
      el.className = "lua-ui-button";
      el.textContent = data.text || "";
      el.style.background = data.color || "#4ee4ec";
      el.addEventListener("click", () => {
        this.network.sendUIEvent(data.id);
      });
    } else if (data.type === "label") {
      el = document.createElement("div");
      el.className = "lua-ui-label";
      el.textContent = data.text || "";
      el.style.color = data.color || "#ffffff";
      el.style.fontSize = (data.fontSize || 16) + "px";
    } else if (data.type === "frame") {
      el = document.createElement("div");
      el.className = "lua-ui-frame";
      el.style.background = data.color || "rgba(0,0,0,0.5)";
    } else {
      return;
    }

    el.dataset.uiId = data.id;
    el.style.left = (data.x || 0) + "px";
    el.style.top = (data.y || 0) + "px";
    el.style.width = (data.w || 100) + "px";
    el.style.height = (data.h || 40) + "px";

    const existing = layer.querySelector(`[data-ui-id="${data.id}"]`);
    if (existing) existing.remove();

    layer.appendChild(el);
    this.uiElements.set(data.id, el);
  }

  updateUIElement(data) {
    const el = this.uiElements.get(data.id);
    if (!el) return;
    const props = data.props || {};
    if (props.text !== undefined) el.textContent = props.text;
    if (props.color !== undefined) {
      if (el.classList.contains("lua-ui-button")) {
        el.style.background = props.color;
      } else {
        el.style.color = props.color;
      }
    }
    if (props.x !== undefined) el.style.left = props.x + "px";
    if (props.y !== undefined) el.style.top = props.y + "px";
    if (props.w !== undefined) el.style.width = props.w + "px";
    if (props.h !== undefined) el.style.height = props.h + "px";
    if (props.fontSize !== undefined) el.style.fontSize = props.fontSize + "px";
  }

  removeUIElement(id) {
    const el = this.uiElements.get(id);
    if (el) {
      el.remove();
      this.uiElements.delete(id);
    }
  }

  updateToolbar(tools) {
    this.tools = tools;
    const toolbar = document.getElementById("toolbar");
    const slots = document.getElementById("toolbar-slots");
    slots.innerHTML = "";

    if (tools.length === 0) {
      toolbar.style.display = "none";
      this.equippedTool = null;
      return;
    }

    toolbar.style.display = "flex";

    for (const toolId of tools) {
      const toolData = Object.values(Constants.TOOLS).find(t => t.id === toolId);
      if (!toolData) continue;

      const slot = document.createElement("div");
      slot.className = "toolbar-slot";
      if (this.equippedTool === toolId) slot.classList.add("active");
      slot.textContent = toolData.icon;
      slot.title = toolData.name;

      const nameEl = document.createElement("span");
      nameEl.className = "tool-name";
      nameEl.textContent = toolData.name;
      slot.appendChild(nameEl);

      slot.addEventListener("click", () => {
        this.equippedTool = toolId;
        this.network.equipTool(toolId);
        slots.querySelectorAll(".toolbar-slot").forEach(s => s.classList.remove("active"));
        slot.classList.add("active");
      });

      slots.appendChild(slot);
    }
  }

  updateTeamPanel(teams) {
    const panel = document.getElementById("team-panel");
    const list = document.getElementById("team-list");
    list.innerHTML = "";

    if (!teams || teams.length === 0) {
      panel.style.display = "none";
      return;
    }

    const hasPlayers = teams.some(t => t.playerCount > 0);
    panel.style.display = hasPlayers ? "block" : "none";

    for (const t of teams) {
      const entry = document.createElement("div");
      entry.className = "team-entry";
      entry.innerHTML = `<div class="team-color-dot" style="background:${t.color}"></div> ${this.escapeHtml(t.name)} (${t.playerCount})`;
      list.appendChild(entry);
    }
  }

  fireRemoteEvent(name, data) {
    this.network.fireRemoteEvent(name, data);
  }

  onRemoteEvent(name, handler) {
    this.remoteEventHandlers[name] = handler;
  }

  updateCamera() {
    if (!this.localPlayer) return;
    const lookAhead = this.localPlayer.facing * Constants.CAMERA_LOOKAHEAD;
    const viewW = this.canvas.width / this.zoom;
    const viewH = this.canvas.height / this.zoom;

    const targetX = this.localPlayer.x + Constants.PLAYER_WIDTH / 2 - viewW / 2 + lookAhead;
    const targetY = this.localPlayer.y + Constants.PLAYER_HEIGHT / 2 - viewH / 2;
    this.camera.x += (targetX - this.camera.x) * 0.08;
    this.camera.y += (targetY - this.camera.y) * 0.08;

    const maxCamX = this.world.width * Constants.TILE_SIZE - viewW;
    const maxCamY = this.world.height * Constants.TILE_SIZE - viewH;
    this.camera.x = Math.max(0, Math.min(maxCamX, this.camera.x));
    this.camera.y = Math.max(0, Math.min(maxCamY, this.camera.y));
  }

  renderBackground() {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    grad.addColorStop(0, "#4a90d9");
    grad.addColorStop(0.5, "#6ab0f5");
    grad.addColorStop(1, "#85c5f0");
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  handleToolUse() {
    if (!this.localPlayer || this.input.chatOpen || this.input.luaEditorOpen) return;
    if (!this.equippedTool) return;

    if (this.input.isLeftDown()) {
      const now = Date.now();
      const toolData = Object.values(Constants.TOOLS).find(t => t.id === this.equippedTool);
      const cooldown = toolData ? toolData.cooldown : 200;
      if (now - this.lastToolUse > cooldown) {
        this.lastToolUse = now;
        this.input.updateMouseWorld(this.camera.x, this.camera.y, this.zoom);
        const mouseTile = this.input.getMouseTile();
        this.network.useTool(mouseTile.x, mouseTile.y);
      }
    }
  }

  updateFps(now) {
    this.frameCount++;
    if (now - this.lastFpsTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
      document.getElementById("fps-display").textContent = `FPS: ${this.fps}`;
    }
  }

  gameLoop(now) {
    if (!this.gameStarted) {
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.updateFps(now);

    if (this.localPlayer) {
      this.localPlayer.update(this.world, this.input, dt);
    }

    this.remotePlayers.forEach((rp) => {
      rp.updateInterpolation(this.world, dt);
    });

    this.handleToolUse();
    this.updateCamera();

    this.renderBackground();

    this.ctx.save();
    this.ctx.scale(this.zoom, this.zoom);
    this.world.render(this.ctx, this.camera.x, this.camera.y, this.canvas.width / this.zoom, this.canvas.height / this.zoom);
    this.ctx.restore();

    this.ctx.save();
    this.ctx.scale(this.zoom, this.zoom);
    this.remotePlayers.forEach((rp) => {
      rp.render(this.ctx, this.camera.x, this.camera.y, false);
    });

    if (this.localPlayer) {
      this.localPlayer.render(this.ctx, this.camera.x, this.camera.y, true);
    }
    this.ctx.restore();

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  start() {
    this.lastFrameTime = performance.now();
    this.lastFpsTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

const game = new Game();
game.start();
