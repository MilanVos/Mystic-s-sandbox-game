class NetworkManager {
  constructor() {
    this.socket = null;
    this.onWorldData = null;
    this.onJoinAccepted = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onPlayerMove = null;
    this.onBlockChange = null;
    this.onChatMessage = null;
    this.onPlayerList = null;
    this.onPlayerPositions = null;
    this.onError = null;
    this.onLuaResult = null;
    this.onUICreate = null;
    this.onUIUpdate = null;
    this.onUIRemove = null;
    this.onToolList = null;
    this.onTeamUpdate = null;
    this.onRemoteEvent = null;
    this.onRemoteEventRegister = null;
    this.onPlayerTeleport = null;
    this.onPlayerSpeed = null;
    this.onPlayerHealthSet = null;
    this.onGameList = null;
    this.onGameCreate = null;
    this.onGameJoin = null;
    this.onGameLeave = null;
    this.connected = false;
  }

  connect() {
    this.socket = io({
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => {
      this.connected = true;
      console.log("[Network] Connected to server");
    });

    this.socket.on("disconnect", () => {
      this.connected = false;
      console.log("[Network] Disconnected from server");
    });

    this.socket.on("connect_error", (err) => {
      if (this.onError) this.onError("Connection failed: " + err.message);
    });

    this.socket.on(Constants.SOCKET_EVENTS.JOIN_ACCEPTED, (data) => {
      if (this.onJoinAccepted) this.onJoinAccepted(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.WORLD_DATA, (data) => {
      if (this.onWorldData) this.onWorldData(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_JOINED, (data) => {
      if (this.onPlayerJoined) this.onPlayerJoined(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_LEFT, (data) => {
      if (this.onPlayerLeft) this.onPlayerLeft(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_MOVE, (data) => {
      if (this.onPlayerMove) this.onPlayerMove(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.BLOCK_CHANGE, (data) => {
      if (this.onBlockChange) this.onBlockChange(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.CHAT_MESSAGE, (data) => {
      if (this.onChatMessage) this.onChatMessage(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_LIST, (data) => {
      if (this.onPlayerList) this.onPlayerList(data);
    });

    this.socket.on("player_positions", (data) => {
      if (this.onPlayerPositions) this.onPlayerPositions(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.ERROR, (msg) => {
      if (this.onError) this.onError(msg);
    });

    this.socket.on(Constants.SOCKET_EVENTS.LUA_RESULT, (data) => {
      if (this.onLuaResult) this.onLuaResult(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.UI_CREATE, (data) => {
      if (this.onUICreate) this.onUICreate(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.UI_UPDATE, (data) => {
      if (this.onUIUpdate) this.onUIUpdate(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.UI_REMOVE, (data) => {
      if (this.onUIRemove) this.onUIRemove(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.TOOL_LIST, (data) => {
      if (this.onToolList) this.onToolList(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.TEAM_UPDATE, (data) => {
      if (this.onTeamUpdate) this.onTeamUpdate(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.REMOTE_EVENT, (data) => {
      if (this.onRemoteEvent) this.onRemoteEvent(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.REMOTE_EVENT_REGISTER, (data) => {
      if (this.onRemoteEventRegister) this.onRemoteEventRegister(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_TELEPORT, (data) => {
      if (this.onPlayerTeleport) this.onPlayerTeleport(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_SPEED, (data) => {
      if (this.onPlayerSpeed) this.onPlayerSpeed(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_HEALTH_SET, (data) => {
      if (this.onPlayerHealthSet) this.onPlayerHealthSet(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.GAME_LIST, (data) => {
      if (this.onGameList) this.onGameList(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.GAME_CREATE, (data) => {
      if (this.onGameCreate) this.onGameCreate(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.GAME_JOIN, (data) => {
      if (this.onGameJoin) this.onGameJoin(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.GAME_LEAVE, (data) => {
      if (this.onGameLeave) this.onGameLeave(data);
    });
  }

  join(username) {
    if (!this.socket) return;
    this.socket.emit(Constants.SOCKET_EVENTS.JOIN, username);
  }

  sendMove(data) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.PLAYER_MOVE, data);
  }

  sendChat(msg) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.CHAT_MESSAGE, msg);
  }

  sendCreativeToggle(creative) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.CREATIVE_TOGGLE, { creative });
  }

  runLua(code) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.LUA_RUN, code);
  }

  equipTool(toolId) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.TOOL_EQUIP, { toolId });
  }

  useTool(x, y) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.TOOL_USE, { x, y });
  }

  sendUIEvent(elementId) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.UI_EVENT, { elementId });
  }

  fireRemoteEvent(name, data) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.REMOTE_EVENT, { name, data, fromServer: false });
  }

  requestGameList() {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.GAME_LIST);
  }

  createGame(name, description, luaScript) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.GAME_CREATE, { name, description, luaScript });
  }

  joinGame(gameId) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.GAME_JOIN, { gameId });
  }

  leaveGame() {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.GAME_LEAVE);
  }
}
