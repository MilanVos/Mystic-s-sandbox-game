const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const C = require("../shared/constants");
const GameServer = require("./game");
const LuaRuntime = require("./lua");
const GameManager = require("./games");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5 * 1024 * 1024,
});

const PORT = process.env.PORT || 3000;
const game = new GameServer();
const lua = new LuaRuntime(game, io);
const gameManager = new GameManager();

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/shared", express.static(path.join(__dirname, "..", "shared")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", players: game.players.size });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const connectedSockets = new Map();

io.on("connection", (socket) => {
  console.log(`[Server] Socket connected: ${socket.id}`);

  socket.on(C.SOCKET_EVENTS.JOIN, (username) => {
    if (connectedSockets.has(socket.id)) return;
    const cleanName = (username || "Player").substring(0, 16).replace(/[^a-zA-Z0-9_ -]/g, "");
    const player = game.addPlayer(socket, cleanName);
    connectedSockets.set(socket.id, player);

    socket.emit(C.SOCKET_EVENTS.JOIN_ACCEPTED, {
      id: player.id,
      username: player.username,
      color: player.color,
      x: player.x,
      y: player.y,
      health: player.health,
    });

    socket.emit(C.SOCKET_EVENTS.WORLD_DATA, game.getWorldData());

    socket.broadcast.emit(C.SOCKET_EVENTS.PLAYER_JOINED, {
      id: player.id,
      username: player.username,
      color: player.color,
      x: player.x,
      y: player.y,
      health: player.health,
    });

    io.emit(C.SOCKET_EVENTS.PLAYER_LIST, game.getPlayerList());
    io.emit(C.SOCKET_EVENTS.TEAM_UPDATE, game.getTeamsData());

    lua.onPlayerJoin(player);
  });

  socket.on(C.SOCKET_EVENTS.PLAYER_MOVE, (data) => {
    const moveData = game.handlePlayerMove(socket.id, data);
    if (moveData) {
      socket.broadcast.emit(C.SOCKET_EVENTS.PLAYER_MOVE, moveData);
    }
  });

  socket.on(C.SOCKET_EVENTS.BLOCK_BREAK, (data) => {
    const result = game.handleBlockBreak(socket.id, data.x, data.y);
    if (result) {
      io.emit(C.SOCKET_EVENTS.BLOCK_CHANGE, { x: result.x, y: result.y, tileId: result.tileId });
      lua.onBlockBreak(socket.id, result.x, result.y, result.brokenBlock);
    }
  });

  socket.on(C.SOCKET_EVENTS.BLOCK_PLACE, (data) => {
    const result = game.handleBlockPlace(socket.id, data.x, data.y, data.blockId);
    if (result) {
      io.emit(C.SOCKET_EVENTS.BLOCK_CHANGE, { x: result.x, y: result.y, tileId: result.tileId });
      lua.onBlockPlace(socket.id, result.x, result.y, result.tileId);
    }
  });

  socket.on(C.SOCKET_EVENTS.CHAT_MESSAGE, (msg) => {
    const cleanMsg = (msg || "").substring(0, 200).replace(/[^a-zA-Z0-9_ .,!?@#-]/g, "");
    if (cleanMsg.length === 0) return;
    const player = game.getPlayer(socket.id);
    if (!player) return;
    io.emit(C.SOCKET_EVENTS.CHAT_MESSAGE, {
      id: socket.id,
      username: player.username,
      color: player.color,
      message: cleanMsg,
      timestamp: Date.now(),
    });
    lua.onChat(socket.id, player.username, cleanMsg);
  });

  socket.on(C.SOCKET_EVENTS.CREATIVE_TOGGLE, (data) => {
    const player = game.getPlayer(socket.id);
    if (player) {
      player.creativeMode = !!data.creative;
    }
  });

  socket.on(C.SOCKET_EVENTS.LUA_RUN, (code) => {
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const script = (code || "").substring(0, 50000);
    console.log(`[Server] Lua script from ${player.username} (${script.length} chars)`);
    const result = lua.runScript(script);
    socket.emit(C.SOCKET_EVENTS.LUA_RESULT, result);
  });

  socket.on(C.SOCKET_EVENTS.TOOL_EQUIP, (data) => {
    const player = game.getPlayer(socket.id);
    if (player && player.tools && player.tools.includes(data.toolId)) {
      player.equippedTool = data.toolId;
    }
  });

  socket.on(C.SOCKET_EVENTS.TOOL_USE, (data) => {
    const player = game.getPlayer(socket.id);
    if (!player) return;
    const toolId = player.equippedTool || data.toolId;
    if (!toolId) return;
    lua.onToolUse(socket.id, toolId, data.x, data.y);
  });

  socket.on(C.SOCKET_EVENTS.UI_EVENT, (data) => {
    lua.onUIEventFromClient(socket.id, data.elementId);
  });

  socket.on(C.SOCKET_EVENTS.REMOTE_EVENT, (data) => {
    if (!data || !data.name) return;
    if (data.fromServer) return;
    lua.onRemoteEventFromClient(socket.id, data.name, data.data || "");
  });

  socket.on(C.SOCKET_EVENTS.GAME_LIST, () => {
    socket.emit(C.SOCKET_EVENTS.GAME_LIST, gameManager.listGames());
  });

  socket.on(C.SOCKET_EVENTS.GAME_CREATE, (data) => {
    if (!data || !data.name) return;
    const player = game.getPlayer(socket.id);
    const createdBy = player ? player.username : "Unknown";
    const newGame = gameManager.createGame(data.name, data.description, data.luaScript, createdBy);
    io.emit(C.SOCKET_EVENTS.GAME_LIST, gameManager.listGames());
    socket.emit(C.SOCKET_EVENTS.GAME_CREATE, { success: true, game: newGame });
  });

  socket.on(C.SOCKET_EVENTS.GAME_JOIN, (data) => {
    if (!data || !data.gameId) return;
    const gameData = gameManager.getGame(data.gameId);
    if (!gameData) {
      socket.emit(C.SOCKET_EVENTS.ERROR, "Game not found");
      return;
    }
    gameManager.joinGame(socket.id, data.gameId);

    if (gameData.luaScript && gameData.luaScript.trim().length > 0) {
      console.log(`[Server] Running game script for ${gameData.name} (${gameData.luaScript.length} chars)`);
      const result = lua.runScript(gameData.luaScript);
      socket.emit(C.SOCKET_EVENTS.LUA_RESULT, result);
    }

    io.emit(C.SOCKET_EVENTS.GAME_LIST, gameManager.listGames());
    socket.emit(C.SOCKET_EVENTS.GAME_JOIN, {
      success: true,
      game: {
        id: gameData.id,
        name: gameData.name,
        description: gameData.description,
      },
    });
  });

  socket.on(C.SOCKET_EVENTS.GAME_LEAVE, () => {
    gameManager.leaveGame(socket.id);
    io.emit(C.SOCKET_EVENTS.GAME_LIST, gameManager.listGames());
    socket.emit(C.SOCKET_EVENTS.GAME_LEAVE, { success: true });
  });

  socket.on("respawn", () => {
    const spawnData = game.respawnPlayer(socket.id);
    if (spawnData) {
      socket.emit("respawn", spawnData);
      socket.broadcast.emit(C.SOCKET_EVENTS.PLAYER_MOVE, {
        id: socket.id,
        ...spawnData,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: false,
      });
    }
  });

  socket.on("damage", (data) => {
    const result = game.handleDamage(socket.id, data.damage || 0);
    if (result) {
      io.emit(C.SOCKET_EVENTS.HEALTH_UPDATE, result);
    }
  });

  socket.on(C.SOCKET_EVENTS.PING, (cb) => {
    if (typeof cb === "function") cb();
  });

  socket.on("disconnect", () => {
    console.log(`[Server] Socket disconnected: ${socket.id}`);
    const player = game.getPlayer(socket.id);
    connectedSockets.delete(socket.id);
    game.removePlayer(socket.id);
    gameManager.removePlayer(socket.id);
    io.emit(C.SOCKET_EVENTS.PLAYER_LEFT, { id: socket.id });
    io.emit(C.SOCKET_EVENTS.PLAYER_LIST, game.getPlayerList());
    io.emit(C.SOCKET_EVENTS.GAME_LIST, gameManager.listGames());
    if (player) {
      lua.onPlayerLeave(socket.id, player.username);
    }
  });
});

setInterval(() => {
  io.emit("time_update", game.getTimeOfDay());
}, 1000);

setInterval(() => {
  const playerData = {};
  game.players.forEach((p) => {
    playerData[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facing: p.facing,
      onGround: p.onGround,
      health: p.health,
      flying: p.flying || false,
    };
  });
  io.emit("player_positions", playerData);
}, 50);

server.listen(PORT, () => {
  console.log(`[Server] Mystic Sandbox running on port ${PORT}`);
});

process.on("SIGINT", () => {
  console.log("[Server] Shutting down...");
  game.cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down...");
  game.cleanup();
  process.exit(0);
});
