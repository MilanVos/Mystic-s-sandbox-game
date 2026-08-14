class AuthManager {
  constructor() {
    this.token = null;
    this.username = null;
    this.userId = null;
    this.onAuthSuccess = null;
    this._socket = null;
  }

  init(socket) {
    this._socket = socket;
    this._setupUI();
    this._registerHandlers();
  }

  _setupUI() {
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const loginPanel = document.getElementById("auth-login-panel");
    const registerPanel = document.getElementById("auth-register-panel");

    tabLogin.addEventListener("click", () => {
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      loginPanel.style.display = "block";
      registerPanel.style.display = "none";
      this._clearError();
    });

    tabRegister.addEventListener("click", () => {
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      registerPanel.style.display = "block";
      loginPanel.style.display = "none";
      this._clearError();
    });

    document.getElementById("login-btn").addEventListener("click", () => {
      this._doLogin();
    });

    document.getElementById("register-btn").addEventListener("click", () => {
      this._doRegister();
    });

    document.getElementById("login-password").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._doLogin();
    });

    document.getElementById("reg-password2").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._doRegister();
    });
  }

  _registerHandlers() {
    this._socket.on(Constants.SOCKET_EVENTS.AUTH_RESULT, (data) => {
      if (data.success) {
        this.token = data.token;
        this.username = data.username;
        this.userId = data.userId;
        if (this.onAuthSuccess) this.onAuthSuccess(data);
      } else {
        this._showError(data.error || "Authentication failed");
      }
    });
  }

  _doLogin() {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    if (!username || !password) {
      this._showError("Please enter username and password");
      return;
    }
    this._clearError();
    this._setBusy(true);
    this._socket.emit(Constants.SOCKET_EVENTS.AUTH_LOGIN, { username, password });
  }

  _doRegister() {
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;
    const password2 = document.getElementById("reg-password2").value;
    if (!username || !password) {
      this._showError("Please fill in all fields");
      return;
    }
    if (password !== password2) {
      this._showError("Passwords do not match");
      return;
    }
    if (username.length < 3) {
      this._showError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 6) {
      this._showError("Password must be at least 6 characters");
      return;
    }
    this._clearError();
    this._setBusy(true);
    this._socket.emit(Constants.SOCKET_EVENTS.AUTH_REGISTER, { username, password });
  }

  _showError(msg) {
    this._setBusy(false);
    const el = document.getElementById("login-error");
    if (el) el.textContent = msg;
  }

  _clearError() {
    const el = document.getElementById("login-error");
    if (el) el.textContent = "";
  }

  _setBusy(busy) {
    const loginBtn = document.getElementById("login-btn");
    const registerBtn = document.getElementById("register-btn");
    if (loginBtn) {
      loginBtn.disabled = busy;
      loginBtn.textContent = busy ? "Connecting..." : "Login";
    }
    if (registerBtn) {
      registerBtn.disabled = busy;
      registerBtn.textContent = busy ? "Creating..." : "Create Account";
    }
  }

  isLoggedIn() {
    return this.token !== null;
  }

  clear() {
    this.token = null;
    this.username = null;
    this.userId = null;
  }
}
