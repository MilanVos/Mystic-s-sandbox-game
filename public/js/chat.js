class ChatManager {
  constructor(socket) {
    this.socket = socket;
    this.messages = [];
    this.maxMessages = 50;
    this.isOpen = false;
    this.inputEl = document.getElementById("chat-input");
    this.messagesEl = document.getElementById("chat-messages");
    this.setupListeners();
  }

  setupListeners() {
    this.inputEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const msg = this.inputEl.value.trim();
        if (msg.length > 0) {
          this.socket.emit(Constants.SOCKET_EVENTS.CHAT_MESSAGE, msg);
        }
        this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.inputEl.style.display = "block";
    this.inputEl.focus();
  }

  close() {
    this.isOpen = false;
    this.inputEl.style.display = "none";
    this.inputEl.value = "";
  }

  addMessage(data) {
    this.messages.push(data);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    this.renderMessages();
  }

  renderMessages() {
    this.messagesEl.innerHTML = "";
    const recent = this.messages.slice(-12);
    for (const msg of recent) {
      const el = document.createElement("div");
      el.className = "chat-message";
      el.innerHTML = `<span class="chat-username" style="color:${msg.color}">${this.escapeHtml(msg.username)}:</span> <span class="chat-text">${this.escapeHtml(msg.message)}</span>`;
      this.messagesEl.appendChild(el);
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  clear() {
    this.messages = [];
    this.renderMessages();
  }
}
