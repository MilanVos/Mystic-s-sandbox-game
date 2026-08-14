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

    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.camera = { x: 0, y: 0 };
    this.timeOfDay = 0.3;
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.lastFrameTime = 0;
    this.gameStarted = false;
    this.lastBreakSend = 0;
    this.lastPlaceSend = 0;
    this.breakingTile = null;
    this.breakingStartTime = 0;
    this.isDead = false;

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
      if (open) {
        this.chat.open();
        this.input.setDisabled(true);
      } else {
        this.chat.close();
        this.input.setDisabled(false);
      }
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
        this.network.sendDamage(damage);
        this.localPlayer.health -= damage;
        if (this.localPlayer.health <= 0) {
          this.handleDeath();
        }
        this.updateHealthBar();
      };

      document.getElementById("loading-screen").style.display = "none";
      document.getElementById("crosshair").style.display = "block";
      document.getElementById("player-list-panel").style.display = "block";
      this.gameStarted = true;
      this.input.setDisabled(false);
    };

    this.network.onWorldData = (data) => {
      this.world.loadFromData(data);
      if (this.localPlayer) {
        const spawn = this.world.getSpawnPoint();
        this.localPlayer.x = spawn.x;
        this.localPlayer.y = spawn.y;
      }
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
      this.chat.addMessage(data);
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

  updateCamera() {
    if (!this.localPlayer) return;
    const targetX = this.localPlayer.x + Constants.PLAYER_WIDTH / 2 - this.canvas.width / 2;
    const targetY = this.localPlayer.y + Constants.PLAYER_HEIGHT / 2 - this.canvas.height / 2;
    this.camera.x += (targetX - this.camera.x) * 0.1;
    this.camera.y += (targetY - this.camera.y) * 0.1;

    const maxCamX = this.world.width * Constants.TILE_SIZE - this.canvas.width;
    const maxCamY = this.world.height * Constants.TILE_SIZE - this.canvas.height;
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

    const screenX = Math.floor(this.breakingTile.x * Constants.TILE_SIZE - this.camera.x);
    const screenY = Math.floor(this.breakingTile.y * Constants.TILE_SIZE - this.camera.y);
    const cracks = Math.floor(progress * 5);

    this.ctx.fillStyle = `rgba(0, 0, 0, ${0.1 + progress * 0.3})`;
    this.ctx.fillRect(screenX, screenY, Constants.TILE_SIZE, Constants.TILE_SIZE);

    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= cracks; i++) {
      this.ctx.beginPath();
      const cx = screenX + (i * 7 + 5);
      const cy = screenY + (i * 11 + 3);
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + 6, cy + 8);
      this.ctx.stroke();
    }
  }

  handleBlockInteraction() {
    if (!this.localPlayer || this.isDead || this.input.chatOpen || this.input.craftingOpen) return;

    this.input.updateMouseWorld(this.camera.x, this.camera.y);
    const mouseTile = this.input.getMouseTile();

    const playerTileX = Math.floor((this.localPlayer.x + Constants.PLAYER_WIDTH / 2) / Constants.TILE_SIZE);
    const playerTileY = Math.floor((this.localPlayer.y + Constants.PLAYER_HEIGHT / 2) / Constants.TILE_SIZE);
    const dist = Math.sqrt(
      (mouseTile.x - playerTileX) ** 2 + (mouseTile.y - playerTileY) ** 2
    );
    if (dist > Constants.REACH_DISTANCE) {
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
      if (now - this.lastPlaceSend > 200) {
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

          if (data && data.solid) {
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
    if (!this.localPlayer || this.input.chatOpen || this.input.craftingOpen) return;

    this.input.updateMouseWorld(this.camera.x, this.camera.y);
    const mouseTile = this.input.getMouseTile();

    const playerTileX = Math.floor((this.localPlayer.x + Constants.PLAYER_WIDTH / 2) / Constants.TILE_SIZE);
    const playerTileY = Math.floor((this.localPlayer.y + Constants.PLAYER_HEIGHT / 2) / Constants.TILE_SIZE);
    const dist = Math.sqrt(
      (mouseTile.x - playerTileX) ** 2 + (mouseTile.y - playerTileY) ** 2
    );

    const screenX = Math.floor(mouseTile.x * Constants.TILE_SIZE - this.camera.x);
    const screenY = Math.floor(mouseTile.y * Constants.TILE_SIZE - this.camera.y);

    if (dist <= Constants.REACH_DISTANCE) {
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(screenX, screenY, Constants.TILE_SIZE, Constants.TILE_SIZE);
    }
  }

  renderDarknessOverlay() {
    const darkness = this.getDarknessOverlay();
    if (darkness <= 0) return;
    this.ctx.fillStyle = `rgba(0, 0, 15, ${darkness})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.localPlayer && darkness > 0.1) {
      const px = this.localPlayer.x - this.camera.x + Constants.PLAYER_WIDTH / 2;
      const py = this.localPlayer.y - this.camera.y + Constants.PLAYER_HEIGHT / 2;
      const radius = 120 + Math.sin(Date.now() * 0.005) * 10;
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
    const endCol = Math.min(this.world.width - 1, Math.ceil((this.camera.x + this.canvas.width) / Constants.TILE_SIZE) + 2);
    const startRow = Math.max(0, Math.floor(this.camera.y / Constants.TILE_SIZE) - 2);
    const endRow = Math.min(this.world.height - 1, Math.ceil((this.camera.y + this.canvas.height) / Constants.TILE_SIZE) + 2);

    this.ctx.globalCompositeOperation = "lighter";
    for (let x = startCol; x <= endCol; x++) {
      for (let y = startRow; y <= endRow; y++) {
        if (this.world.getTile(x, y) === Constants.BLOCK.TORCH) {
          const sx = x * Constants.TILE_SIZE - this.camera.x + Constants.TILE_SIZE / 2;
          const sy = y * Constants.TILE_SIZE - this.camera.y + Constants.TILE_SIZE / 2;
          const flicker = 1 + Math.sin(Date.now() * 0.01 + x * 7) * 0.1;
          const radius = 80 * flicker;
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
    this.world.render(this.ctx, this.camera.x, this.camera.y, this.canvas.width, this.canvas.height, this.timeOfDay);

    this.renderBreakingProgress();

    this.remotePlayers.forEach((rp) => {
      rp.render(this.ctx, this.camera.x, this.camera.y, false);
      rp.renderHealth(this.ctx, this.camera.x, this.camera.y);
    });

    if (this.localPlayer) {
      this.localPlayer.render(this.ctx, this.camera.x, this.camera.y, true);
    }

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
