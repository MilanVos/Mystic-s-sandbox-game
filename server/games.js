const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GAMES_FILE = path.join(__dirname, "..", "games.json");

const DEFAULT_GAMES = [
  {
    id: "sandbox",
    name: "Sandbox",
    description: "Free build mode - no rules, just create!",
    luaScript: "",
    createdBy: "System",
    createdAt: Date.now(),
  },
  {
    id: "survival",
    name: "Survival Challenge",
    description: "Mine resources and survive the night!",
    luaScript: `-- Survival Challenge
game.broadcast("Survival Challenge started!")

-- Give everyone a pickaxe on join
game.onPlayerJoin(function(player)
  game.sendMessage(player.id, "Welcome to Survival Challenge!")
  game.sendMessage(player.id, "Mine blocks and survive!")
  tools.give(player.id, TOOL.PICKAXE)
  tools.give(player.id, TOOL.SWORD)
end)

-- Track block breaks for score
game.onBlockBreak(function(data)
  datastore.set(data.id, "blocksBroken", (datastore.get(data.id, "blocksBroken") or 0) + 1)
  local score = datastore.get(data.id, "blocksBroken")
  game.sendMessage(data.id, "Blocks broken: " .. score)
end)
`,
    createdBy: "System",
    createdAt: Date.now(),
  },
  {
    id: "ctf",
    name: "Capture the Flag",
    description: "Red vs Blue - steal the enemy flag!",
    luaScript: `-- Capture the Flag
game.broadcast("Capture the Flag starting!")

-- Assign teams on join
game.onPlayerJoin(function(player)
  local redCount = #teams.getPlayers("Red")
  local blueCount = #teams.getPlayers("Blue")
  if redCount <= blueCount then
    teams.setPlayer(player.id, "Red")
    game.sendMessage(player.id, "You are on the Red team!")
  else
    teams.setPlayer(player.id, "Blue")
    game.sendMessage(player.id, "You are on the Blue team!")
  end
  tools.give(player.id, TOOL.SWORD)
  tools.give(player.id, TOOL.BOW)
end)

-- Track kills
game.onChat(function(data)
  if data.message == "/score" then
    local redCount = #teams.getPlayers("Red")
    local blueCount = #teams.getPlayers("Blue")
    game.sendMessage(data.id, "Red: " .. redCount .. " players | Blue: " .. blueCount .. " players")
  end
end)
`,
    createdBy: "System",
    createdAt: Date.now(),
  },
  {
    id: "buildbattle",
    name: "Build Battle",
    description: "Build the best creation with limited blocks!",
    luaScript: `-- Build Battle
game.broadcast("Build Battle started! Build something amazing!")

game.onPlayerJoin(function(player)
  game.sendMessage(player.id, "Welcome to Build Battle!")
  game.sendMessage(player.id, "Build the most creative structure you can!")
  tools.give(player.id, TOOL.BLOCK_PLACER)
  tools.give(player.id, TOOL.WAND)
end)

-- Create a UI banner
game.onPlayerJoin(function(player)
  ui.createLabel(player.id, "Build Battle", 10, 10, 200, 30, "#4ee4ec", 20)
end)
`,
    createdBy: "System",
    createdAt: Date.now(),
  },
];

class GameManager {
  constructor() {
    this.games = new Map();
    this.playerGames = new Map();
    this.loadGames();
  }

  loadGames() {
    try {
      if (fs.existsSync(GAMES_FILE)) {
        const data = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
        for (const g of data) {
          this.games.set(g.id, g);
        }
      } else {
        for (const g of DEFAULT_GAMES) {
          this.games.set(g.id, g);
        }
        this.saveGames();
      }
    } catch (e) {
      console.error("[Games] Failed to load games:", e.message);
      for (const g of DEFAULT_GAMES) {
        this.games.set(g.id, g);
      }
    }
  }

  saveGames() {
    try {
      const arr = Array.from(this.games.values());
      fs.writeFileSync(GAMES_FILE, JSON.stringify(arr, null, 2));
    } catch (e) {
      console.error("[Games] Failed to save games:", e.message);
    }
  }

  listGames() {
    const result = [];
    this.games.forEach((g) => {
      result.push({
        id: g.id,
        name: g.name,
        description: g.description,
        createdBy: g.createdBy,
        createdAt: g.createdAt,
        playerCount: this.getPlayerCount(g.id),
      });
    });
    return result;
  }

  getPlayerCount(gameId) {
    let count = 0;
    this.playerGames.forEach((gid) => {
      if (gid === gameId) count++;
    });
    return count;
  }

  getGame(gameId) {
    return this.games.get(gameId);
  }

  createGame(name, description, luaScript, createdBy) {
    const id = crypto.randomBytes(8).toString("hex");
    const game = {
      id,
      name: name.substring(0, 50),
      description: (description || "").substring(0, 200),
      luaScript: (luaScript || "").substring(0, 50000),
      createdBy: createdBy.substring(0, 16),
      createdAt: Date.now(),
    };
    this.games.set(id, game);
    this.saveGames();
    return game;
  }

  joinGame(socketId, gameId) {
    this.playerGames.set(socketId, gameId);
    return this.games.get(gameId);
  }

  leaveGame(socketId) {
    this.playerGames.delete(socketId);
  }

  getPlayerGame(socketId) {
    const gameId = this.playerGames.get(socketId);
    if (!gameId) return null;
    return this.games.get(gameId);
  }

  removeGame(gameId) {
    if (gameId === "sandbox" || gameId === "survival" || gameId === "ctf" || gameId === "buildbattle") {
      return false;
    }
    this.games.delete(gameId);
    this.saveGames();
    return true;
  }

  removePlayer(socketId) {
    this.playerGames.delete(socketId);
  }
}

module.exports = GameManager;
