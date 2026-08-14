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
    this.onHealthUpdate = null;
    this.onPlayerList = null;
    this.onTimeUpdate = null;
    this.onPlayerPositions = null;
    this.onRespawn = null;
    this.onError = null;
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

    this.socket.on(Constants.SOCKET_EVENTS.HEALTH_UPDATE, (data) => {
      if (this.onHealthUpdate) this.onHealthUpdate(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.PLAYER_LIST, (data) => {
      if (this.onPlayerList) this.onPlayerList(data);
    });

    this.socket.on("time_update", (data) => {
      if (this.onTimeUpdate) this.onTimeUpdate(data);
    });

    this.socket.on("player_positions", (data) => {
      if (this.onPlayerPositions) this.onPlayerPositions(data);
    });

    this.socket.on("respawn", (data) => {
      if (this.onRespawn) this.onRespawn(data);
    });

    this.socket.on(Constants.SOCKET_EVENTS.ERROR, (msg) => {
      if (this.onError) this.onError(msg);
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

  sendBlockBreak(x, y) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.BLOCK_BREAK, { x, y });
  }

  sendBlockPlace(x, y, blockId) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.BLOCK_PLACE, { x, y, blockId });
  }

  sendChat(msg) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(Constants.SOCKET_EVENTS.CHAT_MESSAGE, msg);
  }

  sendDamage(damage) {
    if (!this.socket || !this.connected) return;
    this.socket.emit("damage", { damage });
  }

  requestRespawn() {
    if (!this.socket || !this.connected) return;
    this.socket.emit("respawn");
  }
}
