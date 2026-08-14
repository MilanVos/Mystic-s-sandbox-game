const crypto = require("crypto");
const { query } = require("./db");

const DEFAULT_GAMES = [
  {
    id: "sandbox",
    name: "Sandbox",
    description: "Free build mode - no rules, just create!",
    luaScript: "",
    createdBy: "System",
    isDefault: true,
  },
  {
    id: "survival",
    name: "Survival Arena",
    description: "Fight with tools and be the last one standing!",
    luaScript: `-- Survival Arena
game.broadcast("Survival Arena started!")

-- Give everyone tools on join
game.onPlayerJoin(function(player)
  game.sendMessage(player.id, "Welcome to Survival Arena!")
  game.sendMessage(player.id, "Use your tools to fight!")
  tools.give(player.id, TOOL.SWORD)
  tools.give(player.id, TOOL.BOW)
end)
`,
    createdBy: "System",
    isDefault: true,
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
    isDefault: true,
  },
  {
    id: "buildbattle",
    name: "Build Battle",
    description: "Build the most creative structure with tools!",
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
    isDefault: true,
  },
];

class GameManager {
  constructor() {
    this.games = new Map();
    this.playerGames = new Map();
    this.dbAvailable = false;
  }

  async initFromDB() {
    try {
      const result = await query("SELECT id, name, description, lua_script, created_by, created_at, is_default FROM games ORDER BY created_at ASC");
      if (result.rows.length > 0) {
        for (const row of result.rows) {
          this.games.set(row.id, {
            id: row.id,
            name: row.name,
            description: row.description,
            luaScript: row.lua_script,
            createdBy: row.created_by,
            createdAt: row.created_at,
            isDefault: row.is_default,
          });
        }
        console.log(`[Games] Loaded ${result.rows.length} games from database`);
      } else {
        for (const g of DEFAULT_GAMES) {
          await query(
            "INSERT INTO games (id, name, description, lua_script, created_by, created_at, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
            [g.id, g.name, g.description, g.luaScript, g.createdBy, Date.now(), true]
          );
          this.games.set(g.id, { ...g, createdAt: Date.now() });
        }
        console.log("[Games] Inserted default games into database");
      }
      this.dbAvailable = true;
    } catch (err) {
      console.error("[Games] DB load failed, using in-memory defaults:", err.message);
      for (const g of DEFAULT_GAMES) {
        this.games.set(g.id, { ...g, createdAt: Date.now() });
      }
      this.dbAvailable = false;
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

  async createGame(name, description, luaScript, createdBy) {
    const id = crypto.randomBytes(8).toString("hex");
    const gameData = {
      id,
      name: name.substring(0, 50),
      description: (description || "").substring(0, 200),
      luaScript: (luaScript || "").substring(0, 50000),
      createdBy: (createdBy || "Unknown").substring(0, 16),
      createdAt: Date.now(),
      isDefault: false,
    };

    this.games.set(id, gameData);

    if (this.dbAvailable) {
      try {
        await query(
          "INSERT INTO games (id, name, description, lua_script, created_by, created_at, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [id, gameData.name, gameData.description, gameData.luaScript, gameData.createdBy, gameData.createdAt, false]
        );
        console.log(`[Games] Saved game '${gameData.name}' to database`);
      } catch (err) {
        console.error("[Games] Failed to save game to DB:", err.message);
      }
    }

    return gameData;
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

  async removeGame(gameId) {
    const g = this.games.get(gameId);
    if (g && g.isDefault) return false;
    this.games.delete(gameId);
    if (this.dbAvailable) {
      try {
        await query("DELETE FROM games WHERE id = $1", [gameId]);
      } catch (err) {
        console.error("[Games] Failed to delete game from DB:", err.message);
      }
    }
    return true;
  }

  removePlayer(socketId) {
    this.playerGames.delete(socketId);
  }
}

module.exports = GameManager;
