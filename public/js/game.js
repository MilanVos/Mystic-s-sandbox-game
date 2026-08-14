class Game {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    this.world = new ClientWorld();
    this.input = new InputManager(this.canvas);
    this.network = new NetworkManager();
    this.inventory = new InventoryManager();
    this.chat = null;
    this.luaEditor = null;
    this.gameBrowser = null;
    this.currentGameName = null;

    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.camera = { x: 0, y: 0 };
    this.zoom = Constants.CAMERA_ZOOM;
    this.timeOfDay = 0.3;
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.lastFrameTime = 0;
    this.gameStarted = false;
    this.lastBreakSend = 0;
    this.lastPlaceSend = 0;
    this.lastToolUse = 0;
    this.breakingTile = null;
    this.breakingStartTime = 0;
    this.isDead = false;
    this.uiElements = new Map();
    this.tools = [];
    this.equippedTool = null;
    this.remoteEventHandlers = {};
    this.registeredRemoteEvents = new Set();

    this.setupInputCallbacks();
    this.setupNetworkCallbacks();
    this.setupLoginScreen();
    this.setupCraftingMenu();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setupInputCallbacks() {
    this.input.onHotbarSelect = (index) => {
      this.inventory.selectSlot(index);
    };

    this.input.onToggleCrafting = (open) => {
      const menu = document.getElementById("crafting-menu");
      menu.style.display = open ? "block" : "none";
      if (open) {
        this.inventory.renderCraftingMenu();
      }
      this.input.setDisabled(open);
    };

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
      this.localPlayer.health = data.health;

      this.localPlayer.onNetworkMove = (moveData) => {
        this.network.sendMove(moveData);
      };

      this.localPlayer.onDamage = (damage) => {
        if (this.localPlayer.creativeMode) return;
        this.network.sendDamage(damage);
        this.localPlayer.health -= damage;
        if (this.localPlayer.health <= 0) {
          this.handleDeath();
        }
        this.updateHealthBar();
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

    this.network.onHealthUpdate = (data) => {
      if (this.localPlayer && data.id === this.localPlayer.id) {
        this.localPlayer.health = data.health;
        this.updateHealthBar();
        if (this.localPlayer.health <= 0) {
          this.handleDeath();
        }
      }
    };

    this.network.onPlayerList = (list) => {
      this.updatePlayerList(list);
    };

    this.network.onTimeUpdate = (time) => {
      this.timeOfDay = time;
    };

    this.network.onRespawn = (data) => {
      this.localPlayer.x = data.x;
      this.localPlayer.y = data.y;
      this.localPlayer.vx = 0;
      this.localPlayer.vy = 0;
      this.localPlayer.health = data.health;
      this.isDead = false;
      document.getElementById("respawn-screen").style.display = "none";
      this.input.setDisabled(false);
      this.updateHealthBar();
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
        this.updateHealthBar();
        if (this.localPlayer.health <= 0) {
          this.handleDeath();
        }
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

  setupCraftingMenu() {
    document.getElementById("close-crafting").addEventListener("click", () => {
      this.input.craftingOpen = false;
      document.getElementById("crafting-menu").style.display = "none";
      this.input.setDisabled(false);
    });
  }

  handleDeath() {
    if (this.isDead) return;
    this.isDead = true;
    document.getElementById("respawn-screen").style.display = "flex";
    this.input.setDisabled(true);

    document.getElementById("respawn-btn").onclick = () => {
      this.network.requestRespawn();
    };
  }

  updateHealthBar() {
    const health = this.localPlayer ? this.localPlayer.health : 0;
    const maxHealth = Constants.PLAYER_MAX_HEALTH;
    const pct = (health / maxHealth) * 100;
    document.getElementById("health-bar").style.width = pct + "%";
    document.getElementById("health-text").textContent = `${Math.ceil(health)} / ${maxHealth}`;

    const bar = document.getElementById("health-bar");
    if (pct > 60) {
      bar.style.background = "linear-gradient(90deg, #2ecc71, #27ae60)";
    } else if (pct > 30) {
      bar.style.background = "linear-gradient(90deg, #f39c12, #e67e22)";
    } else {
      bar.style.background = "linear-gradient(90deg, #e74c3c, #c0392b)";
    }
  }

  updateModeDisplay() {
    const modeEl = document.getElementById("mode-display");
    if (!modeEl) return;
    if (this.localPlayer && this.localPlayer.creativeMode) {
      modeEl.textContent = "Creative";
      modeEl.style.color = "#4ee4ec";
    } else {
      modeEl.textContent = "Survival";
      modeEl.style.color = "#e74c3c";
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

  getSkyColor() {
    const t = this.timeOfDay;
    if (t < 0.2) {
      return this.lerpColor([10, 10, 30], [20, 20, 60], t / 0.2);
    } else if (t < 0.35) {
      return this.lerpColor([20, 20, 60], [120, 180, 255], (t - 0.2) / 0.15);
    } else if (t < 0.65) {
      return [120, 180, 255];
    } else if (t < 0.8) {
      return this.lerpColor([120, 180, 255], [255, 120, 60], (t - 0.65) / 0.15);
    } else if (t < 0.9) {
      return this.lerpColor([255, 120, 60], [20, 20, 60], (t - 0.8) / 0.1);
    } else {
      return this.lerpColor([20, 20, 60], [10, 10, 30], (t - 0.9) / 0.1);
    }
  }

  lerpColor(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  getDarknessOverlay() {
    const t = this.timeOfDay;
    if (t < 0.2 || t > 0.9) return 0.5;
    if (t >= 0.2 && t < 0.35) return 0.5 * (1 - (t - 0.2) / 0.15);
    if (t >= 0.65 && t < 0.8) return ((t - 0.65) / 0.15) * 0.3;
    if (t >= 0.8 && t < 0.9) return 0.3 + ((t - 0.8) / 0.1) * 0.2;
    return 0;
  }

  renderBackground() {
    const sky = this.getSkyColor();
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    grad.addColorStop(0, `rgb(${sky[0]}, ${sky[1]}, ${sky[2]})`);
    grad.addColorStop(0.6, `rgb(${Math.min(255, sky[0] + 20)}, ${Math.min(255, sky[1] + 20)}, ${Math.min(255, sky[2] + 20)})`);
    grad.addColorStop(1, `rgb(${Math.max(0, sky[0] - 10)}, ${Math.max(0, sky[1] - 10)}, ${Math.max(0, sky[2] - 10)})`);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderCelestialBody();

    if (this.timeOfDay > 0.1 && this.timeOfDay < 0.8) {
      this.renderClouds();
    }
  }

  renderCelestialBody() {
    const t = this.timeOfDay;
    const angle = (t - 0.25) * Math.PI;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height * 0.7;
    const r = Math.min(this.canvas.width, this.canvas.height) * 0.4;
    const x = cx + Math.cos(angle) * r;
    const y = cy - Math.sin(angle) * r;

    const isNight = t < 0.2 || t > 0.9;
    if (isNight) {
      this.ctx.fillStyle = "#f0f0e0";
      this.ctx.beginPath();
      this.ctx.arc(x, y, 22, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = "rgba(200, 200, 180, 0.3)";
      this.ctx.beginPath();
      this.ctx.arc(x - 8, y - 5, 5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.arc(x + 6, y + 8, 4, 0, Math.PI * 2);
      this.ctx.fill();

      this.renderStars();
    } else {
      this.ctx.fillStyle = "rgba(255, 230, 100, 0.15)";
      this.ctx.beginPath();
      this.ctx.arc(x, y, 50, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = "#ffe6a0";
      this.ctx.beginPath();
      this.ctx.arc(x, y, 28, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  renderStars() {
    if (!this._stars) {
      this._stars = [];
      for (let i = 0; i < 80; i++) {
        this._stars.push({
          x: Math.random(),
          y: Math.random() * 0.6,
          size: Math.random() * 2 + 0.5,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
    const time = Date.now() * 0.001;
    this.ctx.fillStyle = "#fff";
    for (const star of this._stars) {
      const alpha = 0.4 + Math.sin(time + star.twinkle) * 0.3;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillRect(star.x * this.canvas.width, star.y * this.canvas.height, star.size, star.size);
    }
    this.ctx.globalAlpha = 1;
  }

  renderClouds() {
    if (!this._clouds) {
      this._clouds = [];
      for (let i = 0; i < 12; i++) {
        this._clouds.push({
          x: Math.random() * this.canvas.width * 2,
          y: Math.random() * this.canvas.height * 0.35,
          w: 60 + Math.random() * 100,
          speed: 0.2 + Math.random() * 0.3,
        });
      }
    }
    const cloudAlpha = this.timeOfDay > 0.2 && this.timeOfDay < 0.8 ? 0.4 : 0.15;
    this.ctx.fillStyle = `rgba(255, 255, 255, ${cloudAlpha})`;
    for (const cloud of this._clouds) {
      cloud.x += cloud.speed;
      if (cloud.x > this.canvas.width + 100) cloud.x = -150;
      this.ctx.beginPath();
      this.ctx.ellipse(cloud.x, cloud.y, cloud.w, cloud.w * 0.35, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.ellipse(cloud.x + cloud.w * 0.3, cloud.y - 5, cloud.w * 0.6, cloud.w * 0.25, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  renderBreakingProgress() {
    if (!this.breakingTile || !this.localPlayer) return;

    const data = Constants.BLOCK_DATA[this.breakingTile.tileId];
    if (!data || !data.hardness) return;

    if (this.localPlayer.creativeMode) {
      this.network.sendBlockBreak(this.breakingTile.x, this.breakingTile.y);
      this.world.setTile(this.breakingTile.x, this.breakingTile.y, Constants.BLOCK.AIR);
      this.inventory.addItem(this.breakingTile.tileId, 1);
      this.breakingTile = null;
      this.breakingStartTime = 0;
      return;
    }

    const elapsed = Date.now() - this.breakingStartTime;
    const totalTime = data.hardness * 400;
    const progress = Math.min(1, elapsed / totalTime);

    if (progress >= 1) {
      this.network.sendBlockBreak(this.breakingTile.x, this.breakingTile.y);
      this.world.setTile(this.breakingTile.x, this.breakingTile.y, Constants.BLOCK.AIR);
      this.inventory.addItem(this.breakingTile.tileId, 1);
      this.breakingTile = null;
      this.breakingStartTime = 0;
      return;
    }

    const screenX = Math.floor((this.breakingTile.x * Constants.TILE_SIZE - this.camera.x) * this.zoom);
    const screenY = Math.floor((this.breakingTile.y * Constants.TILE_SIZE - this.camera.y) * this.zoom);
    const cracks = Math.floor(progress * 5);

    this.ctx.fillStyle = `rgba(0, 0, 0, ${0.1 + progress * 0.3})`;
    this.ctx.fillRect(screenX, screenY, Constants.TILE_SIZE * this.zoom, Constants.TILE_SIZE * this.zoom);

    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= cracks; i++) {
      this.ctx.beginPath();
      const cx = screenX + (i * 7 + 5) * this.zoom;
      const cy = screenY + (i * 11 + 3) * this.zoom;
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + 6 * this.zoom, cy + 8 * this.zoom);
      this.ctx.stroke();
    }
  }

  handleBlockInteraction() {
    if (!this.localPlayer || this.isDead || this.input.chatOpen || this.input.craftingOpen || this.input.luaEditorOpen) return;

    this.input.updateMouseWorld(this.camera.x, this.camera.y, this.zoom);
    const mouseTile = this.input.getMouseTile();

    if (this.equippedTool && this.input.isLeftDown()) {
      const now = Date.now();
      if (now - this.lastToolUse > 200) {
        this.lastToolUse = now;
        this.network.useTool(mouseTile.x, mouseTile.y);
      }
      this.breakingTile = null;
      this.breakingStartTime = 0;
      return;
    }

    if (this.equippedTool && this.input.isRightDown()) {
      this.breakingTile = null;
      this.breakingStartTime = 0;
      return;
    }

    const playerTileX = Math.floor((this.localPlayer.x + Constants.PLAYER_WIDTH / 2) / Constants.TILE_SIZE);
    const playerTileY = Math.floor((this.localPlayer.y + Constants.PLAYER_HEIGHT / 2) / Constants.TILE_SIZE);
    const dist = Math.sqrt(
      (mouseTile.x - playerTileX) ** 2 + (mouseTile.y - playerTileY) ** 2
    );
    const reach = this.localPlayer.creativeMode ? Constants.REACH_DISTANCE * 2 : Constants.REACH_DISTANCE;
    if (dist > reach) {
      this.breakingTile = null;
      this.breakingStartTime = 0;
      return;
    }

    if (this.input.isLeftDown()) {
      const tileId = this.world.getTile(mouseTile.x, mouseTile.y);
      if (tileId !== Constants.BLOCK.AIR) {
        const data = Constants.BLOCK_DATA[tileId];
        if (data && data.mineable) {
          if (!this.breakingTile || this.breakingTile.x !== mouseTile.x || this.breakingTile.y !== mouseTile.y) {
            this.breakingTile = { x: mouseTile.x, y: mouseTile.y, tileId };
            this.breakingStartTime = Date.now();
          }
        }
      } else {
        this.breakingTile = null;
        this.breakingStartTime = 0;
      }
    } else {
      this.breakingTile = null;
      this.breakingStartTime = 0;
    }

    if (this.input.isRightDown()) {
      const now = Date.now();
      if (now - this.lastPlaceSend > 150) {
        this.lastPlaceSend = now;
        const tileId = this.world.getTile(mouseTile.x, mouseTile.y);
        if (tileId === Constants.BLOCK.AIR) {
          const blockId = this.inventory.getSelectedBlock();
          const data = Constants.BLOCK_DATA[blockId];

          const blockLeft = mouseTile.x * Constants.TILE_SIZE;
          const blockTop = mouseTile.y * Constants.TILE_SIZE;
          const blockRight = blockLeft + Constants.TILE_SIZE;
          const blockBottom = blockTop + Constants.TILE_SIZE;
          const pRight = this.localPlayer.x + Constants.PLAYER_WIDTH;
          const pBottom = this.localPlayer.y + Constants.PLAYER_HEIGHT;

          if (data && data.solid && !this.localPlayer.flying) {
            const overlap = !(
              pRight <= blockLeft ||
              this.localPlayer.x >= blockRight ||
              pBottom <= blockTop ||
              this.localPlayer.y >= blockBottom
            );
            if (overlap) return;
          }

          this.network.sendBlockPlace(mouseTile.x, mouseTile.y, blockId);
          this.world.setTile(mouseTile.x, mouseTile.y, blockId);
        }
      }
    }
  }

  renderTargetHighlight() {
    if (!this.localPlayer || this.input.chatOpen || this.input.craftingOpen || this.input.luaEditorOpen) return;

    this.input.updateMouseWorld(this.camera.x, this.camera.y, this.zoom);
    const mouseTile = this.input.getMouseTile();

    const playerTileX = Math.floor((this.localPlayer.x + Constants.PLAYER_WIDTH / 2) / Constants.TILE_SIZE);
    const playerTileY = Math.floor((this.localPlayer.y + Constants.PLAYER_HEIGHT / 2) / Constants.TILE_SIZE);
    const dist = Math.sqrt(
      (mouseTile.x - playerTileX) ** 2 + (mouseTile.y - playerTileY) ** 2
    );
    const reach = this.localPlayer.creativeMode ? Constants.REACH_DISTANCE * 2 : Constants.REACH_DISTANCE;

    const screenX = Math.floor((mouseTile.x * Constants.TILE_SIZE - this.camera.x) * this.zoom);
    const screenY = Math.floor((mouseTile.y * Constants.TILE_SIZE - this.camera.y) * this.zoom);

    if (dist <= reach) {
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(screenX, screenY, Constants.TILE_SIZE * this.zoom, Constants.TILE_SIZE * this.zoom);
    }
  }

  renderDarknessOverlay() {
    const darkness = this.getDarknessOverlay();
    if (darkness <= 0) return;
    this.ctx.fillStyle = `rgba(0, 0, 15, ${darkness})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.localPlayer && darkness > 0.1) {
      const px = (this.localPlayer.x - this.camera.x + Constants.PLAYER_WIDTH / 2) * this.zoom;
      const py = (this.localPlayer.y - this.camera.y + Constants.PLAYER_HEIGHT / 2) * this.zoom;
      const radius = (120 + Math.sin(Date.now() * 0.005) * 10) * this.zoom;
      const grad = this.ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, `rgba(0, 0, 15, 0)`);
      grad.addColorStop(1, `rgba(0, 0, 15, ${darkness})`);
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(px, py, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.renderTorchLighting(darkness);
  }

  renderTorchLighting(darkness) {
    if (darkness <= 0.05) return;
    const startCol = Math.max(0, Math.floor(this.camera.x / Constants.TILE_SIZE) - 2);
    const endCol = Math.min(this.world.width - 1, Math.ceil((this.camera.x + this.canvas.width / this.zoom) / Constants.TILE_SIZE) + 2);
    const startRow = Math.max(0, Math.floor(this.camera.y / Constants.TILE_SIZE) - 2);
    const endRow = Math.min(this.world.height - 1, Math.ceil((this.camera.y + this.canvas.height / this.zoom) / Constants.TILE_SIZE) + 2);

    this.ctx.globalCompositeOperation = "lighter";
    for (let x = startCol; x <= endCol; x++) {
      for (let y = startRow; y <= endRow; y++) {
        if (this.world.getTile(x, y) === Constants.BLOCK.TORCH) {
          const sx = (x * Constants.TILE_SIZE - this.camera.x + Constants.TILE_SIZE / 2) * this.zoom;
          const sy = (y * Constants.TILE_SIZE - this.camera.y + Constants.TILE_SIZE / 2) * this.zoom;
          const flicker = 1 + Math.sin(Date.now() * 0.01 + x * 7) * 0.1;
          const radius = 80 * flicker * this.zoom;
          const grad = this.ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
          grad.addColorStop(0, "rgba(255, 180, 60, 0.4)");
          grad.addColorStop(0.5, "rgba(255, 140, 40, 0.15)");
          grad.addColorStop(1, "rgba(255, 100, 20, 0)");
          this.ctx.fillStyle = grad;
          this.ctx.beginPath();
          this.ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
    this.ctx.globalCompositeOperation = "source-over";
  }

  updateTimeDisplay() {
    const t = this.timeOfDay;
    let label;
    if (t < 0.2) label = "Night";
    else if (t < 0.3) label = "Dawn";
    else if (t < 0.65) label = "Day";
    else if (t < 0.8) label = "Dusk";
    else label = "Night";
    document.getElementById("time-display").textContent = label;
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

    if (this.localPlayer && !this.isDead) {
      this.localPlayer.update(this.world, this.input, dt);
    }

    this.remotePlayers.forEach((rp) => {
      rp.updateInterpolation(this.world, dt);
    });

    this.handleBlockInteraction();
    this.updateCamera();

    this.renderBackground();

    this.ctx.save();
    this.ctx.scale(this.zoom, this.zoom);
    this.world.render(this.ctx, this.camera.x, this.camera.y, this.canvas.width / this.zoom, this.canvas.height / this.zoom, this.timeOfDay);
    this.ctx.restore();

    this.renderBreakingProgress();

    this.ctx.save();
    this.ctx.scale(this.zoom, this.zoom);
    this.remotePlayers.forEach((rp) => {
      rp.render(this.ctx, this.camera.x, this.camera.y, false);
      rp.renderHealth(this.ctx, this.camera.x, this.camera.y);
    });

    if (this.localPlayer) {
      this.localPlayer.render(this.ctx, this.camera.x, this.camera.y, true);
    }
    this.ctx.restore();

    this.renderTargetHighlight();
    this.renderDarknessOverlay();
    this.updateTimeDisplay();

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
