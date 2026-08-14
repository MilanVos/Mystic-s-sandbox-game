const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const C = require("../shared/constants");
const GameServer = require("./game");
const LuaRuntime = require("./lua");
const GameManager = require("./games");
const { initDB, pool } = require("./db");
const auth = require("./auth");

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
  res.json({ status: "ok", players: game.players.size, db: auth.dbAvailable });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const connectedSockets = new Map();

async function startServer() {
  try {
    await initDB();
    const testQuery = await pool.query("SELECT 1 as test").catch(() => null);
    const dbOk = testQuery !== null;
    auth.setDbAvailable(dbOk);
    console.log(`[Server] Database: ${dbOk ? "CONNECTED" : "NOT AVAILABLE"}`);

    await gameManager.initFromDB();
    lua.setDbAvailable(dbOk);
  } catch (err) {
    console.error("[Server] Startup error:", err.message);
    auth.setDbAvailable(false);
  }

  server.listen(PORT, () => {
    console.log(`[Server] Mystic Sandbox running on port ${PORT}`);
  });
}

io.on("connection", (socket) => {
  console.log(`[Server] Socket connected: ${socket.id}`);

  let authenticatedUser = null;

  socket.on(C.SOCKET_EVENTS.AUTH_REGISTER, async (data) => {
    const result = await auth.register(data.username, data.password);
    if (result.success) {
      authenticatedUser = { userId: result.userId, username: result.username, token: result.token };
    }
    socket.emit(C.SOCKET_EVENTS.AUTH_RESULT, result);
  });

  socket.on(C.SOCKET_EVENTS.AUTH_LOGIN, async (data) => {
    const result = await auth.login(data.username, data.password);
    if (result.success) {
      authenticatedUser = { userId: result.userId, username: result.username, token: result.token };
    }
    socket.emit(C.SOCKET_EVENTS.AUTH_RESULT, result);
  });

  socket.on(C.SOCKET_EVENTS.JOIN, (data) => {
    if (connectedSockets.has(socket.id)) return;

    let username;
    if (typeof data === "string") {
      username = data;
    } else if (data && data.token) {
      const session = auth.verifySession(data.token);
      if (!session) {
        socket.emit(C.SOCKET_EVENTS.ERROR, "Invalid or expired session");
        return;
      }
      username = session.username;
    } else if (data && data.username) {
      username = data.username;
    } else {
      socket.emit(C.SOCKET_EVENTS.ERROR, "Authentication required");
      return;
    }

    const cleanName = (username || "Player").substring(0, 16).replace(/[^a-zA-Z0-9_ -]/g, "");
    const player = game.addPlayer(socket, cleanName);
    connectedSockets.set(socket.id, player);

    socket.emit(C.SOCKET_EVENTS.JOIN_ACCEPTED, {
      id: player.id,
      username: player.username,
      color: player.color,
      x: player.x,
      y: player.y,
    });

    socket.emit(C.SOCKET_EVENTS.WORLD_DATA, game.getWorldData());

    socket.broadcast.emit(C.SOCKET_EVENTS.PLAYER_JOINED, {
      id: player.id,
      username: player.username,
      color: player.color,
      x: player.x,
      y: player.y,
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

  socket.on(C.SOCKET_EVENTS.GAME_CREATE, async (data) => {
    if (!data || !data.name) return;
    const player = game.getPlayer(socket.id);
    const createdBy = player ? player.username : "Unknown";
    const newGame = await gameManager.createGame(data.name, data.description, data.luaScript, createdBy);
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

  socket.on(C.SOCKET_EVENTS.PING, (cb) => {
    if (typeof cb === "function") cb();
  });

  socket.on("disconnect", () => {
    console.log(`[Server] Socket disconnected: ${socket.id}`);
    if (authenticatedUser && authenticatedUser.token) {
      auth.removeSession(authenticatedUser.token);
    }
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
      flying: p.flying || false,
    };
  });
  io.emit("player_positions", playerData);
}, 50);

setInterval(() => {
  auth.cleanExpiredSessions();
}, 60 * 60 * 1000);

startServer();

process.on("SIGINT", () => {
  console.log("[Server] Shutting down...");
  game.cleanup();
  pool.end();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down...");
  game.cleanup();
  pool.end();
  process.exit(0);
});
