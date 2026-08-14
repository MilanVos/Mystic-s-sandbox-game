const http = require("http");
const { io } = require("socket.io-client");
const C = require("./shared/constants");

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=== Integration Tests ===\n");

  let dbAvailable = false;

  try {
    const health = await httpGet("http://localhost:3000/health");
    const healthData = JSON.parse(health);
    dbAvailable = healthData.db;
    console.log("[PASS] Health endpoint:", health);
    console.log("[INFO] Database available:", dbAvailable);
  } catch (e) {
    console.log("[FAIL] Health endpoint:", e.message);
    process.exit(1);
  }

  try {
    const css = await httpGet("http://localhost:3000/css/style.css");
    console.log("[PASS] CSS served (" + css.length + " bytes)");
    const js = await httpGet("http://localhost:3000/js/auth.js");
    console.log("[PASS] auth.js served (" + js.length + " bytes)");
    const html = await httpGet("http://localhost:3000/");
    console.log("[PASS] HTML served (" + html.length + " bytes)");
  } catch (e) {
    console.log("[FAIL] Static files:", e.message);
  }

  if (dbAvailable) {
    console.log("\n--- Testing Auth Flow ---");
    await testAuthFlow();
  } else {
    console.log("\n[SKIP] Auth flow tests (no database available)");
  }

  console.log("\n--- Testing Game Flow ---");
  await testGameFlow(dbAvailable);

  console.log("\nAll tests completed.");
  process.exit(0);
}

async function testAuthFlow() {
  return new Promise((resolve) => {
    const socket = io("http://localhost:3000", { transports: ["websocket"] });
    const results = {};
    let authToken = null;
    let authState = "register";
    let testUser = "testuser_" + Math.floor(Math.random() * 100000);
    const testPass = "testpass123";

    socket.on("connect", () => {
      console.log("[PASS] Auth socket connected");
      socket.emit(C.SOCKET_EVENTS.AUTH_REGISTER, { username: testUser, password: testPass });
    });

    socket.on(C.SOCKET_EVENTS.AUTH_RESULT, (data) => {
      if (authState === "register") {
        if (data.success) {
          results.register = true;
          authToken = data.token;
          console.log("[PASS] Register success: user=" + data.username + " token=" + data.token.substring(0, 8) + "...");
          authState = "login";
          socket.emit(C.SOCKET_EVENTS.AUTH_LOGIN, { username: testUser, password: testPass });
        } else {
          console.log("[FAIL] Register failed:", data.error);
          socket.disconnect();
          resolve();
        }
      } else if (authState === "login") {
        if (data.success) {
          results.login = true;
          authToken = data.token;
          console.log("[PASS] Login success: user=" + data.username);
          socket.emit(C.SOCKET_EVENTS.JOIN, { token: authToken });
        } else {
          console.log("[FAIL] Login failed:", data.error);
          socket.disconnect();
          resolve();
        }
      }
    });

    socket.on(C.SOCKET_EVENTS.JOIN_ACCEPTED, (data) => {
      results.joinWithToken = true;
      console.log("[PASS] Join with token accepted: user=" + data.username);
      socket.emit(C.SOCKET_EVENTS.GAME_LIST);
    });

    socket.on(C.SOCKET_EVENTS.WORLD_DATA, (data) => {
      results.worldData = true;
      console.log("[PASS] World data received: " + data.width + "x" + data.height);
    });

    socket.on(C.SOCKET_EVENTS.GAME_LIST, (games) => {
      results.gameList = true;
      console.log("[PASS] Game list received: " + games.length + " games");
    });

    socket.on(C.SOCKET_EVENTS.ERROR, (msg) => {
      console.log("[FAIL] Server error:", msg);
    });

    setTimeout(() => {
      console.log("\n=== Auth Test Results ===");
      const expected = ["register", "login", "joinWithToken", "worldData", "gameList"];
      let pass = 0, fail = 0;
      for (const key of expected) {
        if (results[key]) { pass++; console.log("[PASS] " + key); }
        else { fail++; console.log("[FAIL] " + key); }
      }
      console.log("Passed: " + pass + ", Failed: " + fail);
      socket.disconnect();
      resolve();
    }, 3000);
  });
}

async function testGameFlow(dbAvailable) {
  return new Promise((resolve) => {
    const socket = io("http://localhost:3000", { transports: ["websocket"] });
    let mySocketId = null;
    let hasJoinedGame = false;

    const results = {};

    socket.on("connect", () => {
      console.log("[PASS] Socket.io connected");
      mySocketId = socket.id;
      socket.emit("join", "TestPlayer");
    });

    socket.on("join_accepted", (data) => {
      results.joinAccepted = true;
      console.log("[PASS] Join accepted:", data.username, "id:", data.id);
      socket.emit("game_list");
    });

    socket.on("world_data", (data) => {
      results.worldData = true;
      console.log("[PASS] World data received: " + data.width + "x" + data.height);
    });

    socket.on("game_list", (games) => {
      results.gameList = true;
      console.log("[PASS] Game list received: " + games.length + " games");
      games.forEach((g) => {
        console.log("  - " + g.name + " (by " + g.createdBy + ", " + g.playerCount + " players)");
      });

      if (!hasJoinedGame) {
        hasJoinedGame = true;
        const survivalGame = games.find((g) => g.id === "survival");
        if (survivalGame) {
          socket.emit("game_join", { gameId: survivalGame.id });
        }
      }
    });

    socket.on("game_join", (data) => {
      results.gameJoin = true;
      console.log("[PASS] Game joined:", data.game.name);
    });

    let luaResultCount = 0;
    socket.on("lua_result", (data) => {
      luaResultCount++;
      results.luaExecution = true;
      if (data.success) {
        console.log("[PASS] Lua script #" + luaResultCount + " executed. Output:", JSON.stringify(data.output));
      } else {
        console.log("[FAIL] Lua script error:", data.error);
      }
    });

    socket.on("team_update", (teams) => {
      results.teamUpdate = true;
      console.log("[PASS] Team update received: " + teams.length + " teams");
    });

    socket.on("tool_list", (data) => {
      results.toolList = true;
      console.log("[PASS] Tool list received:", JSON.stringify(data.tools));
    });

    socket.on("ui_create", (data) => {
      results.uiCreate = true;
      console.log("[PASS] UI element created:", data.type, "id:", data.id);
    });

    socket.on("remote_event_register", (data) => {
      results.remoteRegister = true;
      console.log("[PASS] Remote event registered:", data.name);
    });

    socket.on("remote_event", (data) => {
      results.remoteEvent = true;
      console.log("[PASS] Remote event received:", data.name, "data:", data.data);
    });

    socket.on("player_speed", (data) => {
      results.playerSpeed = true;
      console.log("[PASS] Player speed set:", data.speed);
    });

    socket.on("player_teleport", (data) => {
      results.playerTeleport = true;
      console.log("[PASS] Player teleported to:", data.x, data.y);
    });

    socket.on("chat_message", (data) => {
      results.chatMessage = true;
      console.log("[PASS] Chat message:", data.username + ": " + data.message);
    });

    socket.on("error", (msg) => {
      console.log("[FAIL] Server error:", msg);
    });

    setTimeout(() => {
      socket.emit("chat_message", "Hello from test!");
      socket.emit("creative_toggle", { creative: true });
      socket.emit("player_move", {
        x: 100, y: 50, vx: 5, vy: 0,
        facing: 1, onGround: true,
      });

      const luaTest = `
        print("Hello from Lua test!")
        game.broadcast("Lua test broadcast")

        local pid = "${mySocketId}"
        ui.createLabel(pid, "Test Label", 10, 50, 200, 30, "#4ee4ec", 16)
        tools.give(pid, TOOL.PICKAXE)
        tools.give(pid, TOOL.SWORD)
        remote.register("TestEvent")
        remote.fire("TestEvent", "test data")
        datastore.set(pid, "score", 100)
        local val = datastore.get(pid, "score")
        print("DataStore value: " .. tostring(val))
        player.setSpeed(pid, 8)
        player.teleport(pid, 500, 50)
        player.setHealth(pid, 80)

        teams.create("TestTeam", "#ff00ff")
        print("All Lua API tests passed!")
      `;
      socket.emit("lua_run", luaTest);
    }, 1500);

    setTimeout(() => {
      socket.emit("tool_use", { x: 201, y: 40 });
    }, 2500);

    setTimeout(() => {
      console.log("\n=== Game Test Results ===");

      const expected = [
        "joinAccepted", "worldData", "gameList", "gameJoin",
        "luaExecution", "teamUpdate", "chatMessage",
      ];

      let pass = 0;
      let fail = 0;

      for (const key of expected) {
        if (results[key]) {
          pass++;
        } else {
          fail++;
          console.log("[FAIL] " + key);
        }
      }

      const optional = ["toolList", "uiCreate", "remoteRegister", "remoteEvent", "playerSpeed", "playerTeleport"];
      for (const key of optional) {
        if (results[key]) {
          pass++;
          console.log("[PASS] " + key);
        } else {
          fail++;
          console.log("[FAIL] " + key + " (optional)");
        }
      }

      console.log("\nPassed: " + pass + ", Failed: " + fail);
      console.log(fail === 0 ? "\nALL TESTS PASSED!" : "\nSOME TESTS FAILED");

      socket.disconnect();
      resolve();
    }, 4000);
  });
}

runTests().then(() => process.exit(0));
