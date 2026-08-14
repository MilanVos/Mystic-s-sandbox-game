class GameBrowser {
  constructor(network) {
    this.network = network;
    this.isOpen = false;
    this.games = [];
    this.selectedGameId = null;
    this.onCreateJoin = null;
    this.createUI();
    this.setupNetworkCallbacks();
  }

  createUI() {
    const panel = document.createElement("div");
    panel.id = "game-browser";
    panel.style.display = "none";

    panel.innerHTML = `
      <div class="game-browser-overlay">
        <div class="game-browser-box">
          <h1>Mystic Sandbox</h1>
          <p class="subtitle">Choose a game to play or create your own!</p>

          <div id="game-browser-list" class="game-browser-list"></div>
          <div class="game-browser-footer">
            <button id="game-browser-play-btn" class="game-browser-play" disabled>Play Selected</button>
            <button id="game-browser-create-toggle" class="game-browser-toggle">Create New Game</button>
          </div>

          <div id="game-browser-create" class="game-browser-create" style="display:none;">
            <input type="text" id="new-game-name" placeholder="Game name..." maxlength="50" />
            <input type="text" id="new-game-desc" placeholder="Short description..." maxlength="200" />
            <textarea id="new-game-lua" spellcheck="false" placeholder="Lua script (optional)...
game.onPlayerJoin(function(player)
  game.sendMessage(player.id, 'Welcome to my game!')
end)"></textarea>
            <div class="game-browser-create-actions">
              <button id="new-game-create-btn" class="game-browser-play">Create & Play</button>
              <button id="new-game-cancel-btn" class="game-browser-toggle">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    this.listEl = document.getElementById("game-browser-list");
    this.playBtn = document.getElementById("game-browser-play-btn");
    this.createToggleBtn = document.getElementById("game-browser-create-toggle");
    this.createPanel = document.getElementById("game-browser-create");

    this.playBtn.addEventListener("click", () => this.joinSelected());
    this.createToggleBtn.addEventListener("click", () => this.toggleCreatePanel());
    document.getElementById("new-game-create-btn").addEventListener("click", () => this.createGame());
    document.getElementById("new-game-cancel-btn").addEventListener("click", () => this.toggleCreatePanel());
  }

  setupNetworkCallbacks() {
    this.network.onGameList = (games) => {
      this.games = games || [];
      this.renderList();
    };

    this.network.onGameJoin = (data) => {
      if (data && data.success) {
        this.close();
        if (this.onCreateJoin) this.onCreateJoin(data.game);
      }
    };

    this.network.onGameCreate = (data) => {
      if (data && data.success) {
        if (data.game) {
          this.network.joinGame(data.game.id);
        }
      }
    };
  }

  open() {
    const panel = document.getElementById("game-browser");
    panel.style.display = "flex";
    this.isOpen = true;
    this.selectedGameId = null;
    this.playBtn.disabled = true;
    this.createPanel.style.display = "none";
    this.network.requestGameList();
  }

  close() {
    const panel = document.getElementById("game-browser");
    panel.style.display = "none";
    this.isOpen = false;
  }

  renderList() {
    this.listEl.innerHTML = "";

    if (this.games.length === 0) {
      this.listEl.innerHTML = "<p class='game-browser-empty'>No games available. Create one!</p>";
      return;
    }

    for (const g of this.games) {
      const card = document.createElement("div");
      card.className = "game-card";
      if (this.selectedGameId === g.id) card.classList.add("selected");

      card.innerHTML = `
        <div class="game-card-name">${this.escapeHtml(g.name)}</div>
        <div class="game-card-desc">${this.escapeHtml(g.description || "No description")}</div>
        <div class="game-card-meta">
          <span>by ${this.escapeHtml(g.createdBy || "Unknown")}</span>
          <span class="game-card-players">${g.playerCount || 0} playing</span>
        </div>
      `;

      card.addEventListener("click", () => {
        this.selectedGameId = g.id;
        this.playBtn.disabled = false;
        this.listEl.querySelectorAll(".game-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
      });

      card.addEventListener("dblclick", () => {
        this.selectedGameId = g.id;
        this.joinSelected();
      });

      this.listEl.appendChild(card);
    }
  }

  joinSelected() {
    if (!this.selectedGameId) return;
    this.network.joinGame(this.selectedGameId);
  }

  toggleCreatePanel() {
    if (this.createPanel.style.display === "none") {
      this.createPanel.style.display = "flex";
      this.createToggleBtn.textContent = "Hide Create Panel";
      document.getElementById("new-game-name").focus();
    } else {
      this.createPanel.style.display = "none";
      this.createToggleBtn.textContent = "Create New Game";
    }
  }

  createGame() {
    const name = document.getElementById("new-game-name").value.trim();
    const desc = document.getElementById("new-game-desc").value.trim();
    const luaScript = document.getElementById("new-game-lua").value.trim();

    if (!name) {
      alert("Please enter a game name.");
      return;
    }

    this.network.createGame(name, desc, luaScript);
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
