/**
 * 智能問答助手 - 聊天與多資料庫互動模組 (Main App & Chat Controller)
 * 支援多資料庫動態切換、動態手風琴分類渲染與智能問答
 */

class ChatAssistantApp {
  constructor() {
    this.init();
  }

  init() {
    this.bindAdminDrawer();
    this.bindScrollTopButton();
    this.bindChatInput();
    this.bindHeaderDbSelector();
    this.bindQrCodeModal();
    this.onDatabaseSwitched();
    // 記錄訪問（Firebase + GA4）
    if (window.Tracker) window.Tracker.recordVisit();
  }

  // 當資料庫切換或內容更新時觸發
  onDatabaseSwitched() {
    let db = null;
    if (window.adminMgr && typeof window.adminMgr.getActiveDatabase === "function") {
      db = window.adminMgr.getActiveDatabase();
    }
    if (!db || !db.items || db.items.length === 0) {
      if (window.DEFAULT_DATABASES) {
        db = window.DEFAULT_DATABASES["db_1150120"] || Object.values(window.DEFAULT_DATABASES)[0];
      }
    }
    if (!db) {
      db = { name: "雙和醫療服務知識庫", categories: ["一般問答"], items: [] };
    }

    // 1. 固定頂部標題為「智能問答助手」
    const titleEl = document.getElementById("header-main-title");
    const subtitleEl = document.getElementById("header-subtitle-text");
    if (titleEl) titleEl.textContent = "智能問答助手";
    if (subtitleEl) subtitleEl.textContent = "歡迎使用智慧諮詢服務！為您解答住院須知、探病時間、病房設施與文件申請常見問題。";

    // 2. 更新頂部資料庫切換器按鈕 (若存在)
    const dbSelectBtn = document.getElementById("header-db-current-name");
    if (dbSelectBtn) {
      dbSelectBtn.textContent = db.name;
    }

    // 3. 重構並動態渲染首頁分類手風琴卡片
    this.renderCategoryAccordions(db);

    // 4. 更新後台標題
    const adminHeaderDb = document.getElementById("admin-current-db-badge");
    if (adminHeaderDb) {
      adminHeaderDb.textContent = `當前：${db.name}`;
    }
  }

  // 動態渲染分類手風琴列表
  renderCategoryAccordions(db) {
    const container = document.getElementById("main-categories-accordion");
    if (!container) return;

    const categories = db.categories || [];
    const items = db.items || [];

    if (categories.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:13px;">目前尚無分類，請至後台建立分類與問題！</div>`;
      return;
    }

    container.innerHTML = categories.map(cat => {
      const catItems = items.filter(item => {
        const itemCat = (item.category || "").trim();
        if (itemCat === cat) return true;
        let tags = [];
        if (Array.isArray(item.tags)) tags = item.tags;
        else if (typeof item.tags === "string" && item.tags.trim()) tags = item.tags.split(/[,，、]/).map(t => t.trim());
        return tags.includes(cat);
      });

      return `
        <div class="category-dropdown-card" data-category="${this.escapeHtml(cat)}">
          <div class="category-dropdown-header" onclick="window.chatApp.toggleCategoryCard(this)">
            <div class="category-title-left">
              <span class="folder-icon">📁</span>
              <span>${this.escapeHtml(cat)}</span>
              <span style="font-size:11.5px; color:#628ba8; font-weight:normal;">(${catItems.length})</span>
            </div>
            <span class="dropdown-triangle">▼</span>
          </div>
          <div class="category-dropdown-content">
            ${catItems.length === 0 
              ? `<div style="font-size:12.5px; color:var(--text-light); padding:4px;">此分類尚無問題</div>`
              : catItems.map(item => `
                <button class="accordion-q-btn" onclick="window.chatApp.askDirectQuestion('${this.escapeHtml(item.question)}')">
                  <span>❓ ${this.escapeHtml(item.question)}</span>
                  <span style="color:var(--primary-teal); font-size:12px;">➔</span>
                </button>
              `).join("")
            }
          </div>
        </div>
      `;
    }).join("");
  }

  // 點擊手風琴卡片展開/收合
  toggleCategoryCard(headerEl) {
    const card = headerEl.closest(".category-dropdown-card");
    if (!card) return;
    const isOpen = card.classList.contains("open");
    card.classList.toggle("open", !isOpen);
  }

  // 頂部資料庫切換選單互動
  bindHeaderDbSelector() {
    const selectorBtn = document.getElementById("header-db-selector-btn");
    const dropdownMenu = document.getElementById("header-db-dropdown-menu");

    if (selectorBtn && dropdownMenu) {
      selectorBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.populateHeaderDbDropdown();
        dropdownMenu.classList.toggle("show");
      });

      document.addEventListener("click", () => {
        dropdownMenu.classList.remove("show");
      });
    }
  }

  populateHeaderDbDropdown() {
    const dropdownMenu = document.getElementById("header-db-dropdown-menu");
    if (!dropdownMenu || !window.adminMgr) return;

    const databases = Object.values(window.adminMgr.databases);
    const activeId = window.adminMgr.activeDbId;

    dropdownMenu.innerHTML = `
      <div class="dropdown-header-title">切換問答資料庫</div>
      ${databases.map(db => `
        <div class="dropdown-db-item ${db.id === activeId ? "active" : ""}" onclick="window.adminMgr.setActiveDbId('${db.id}')">
          <span style="font-weight:700;">${this.escapeHtml(db.name)}</span>
          <span style="font-size:11.5px; color:var(--text-light);">${db.items.length} 題</span>
        </div>
      `).join("")}
      <div class="dropdown-footer-action" onclick="window.adminMgr.requestAdminUnlock(() => window.adminMgr.openCreateDbModal())">
        <span>➕ 建立新資料庫 (需驗證)</span>
      </div>
    `;
  }

  // 綁定後台管理抽屜 (需密碼解鎖驗證)
  bindAdminDrawer() {
    const openBtn = document.getElementById("btn-open-admin");
    const closeBtn = document.getElementById("btn-close-admin");
    const adminView = document.getElementById("admin-view");

    if (openBtn && adminView) {
      openBtn.addEventListener("click", () => {
        if (window.adminMgr) {
          window.adminMgr.requestAdminUnlock(() => {
            adminView.classList.add("active");
            window.adminMgr.renderDatabaseList();
            window.adminMgr.renderActiveDbContent();
            window.adminMgr.renderTagsCloud();
            window.adminMgr.renderStats();
          });
        }
      });
    }

    if (closeBtn && adminView) {
      closeBtn.addEventListener("click", () => {
        adminView.classList.remove("active");
      });
    }
  }

  // 綁定浮動回到頂部按鈕
  bindScrollTopButton() {
    const scrollBtn = document.getElementById("scroll-top-btn");
    const chatWindow = document.getElementById("chat-window");

    if (scrollBtn && chatWindow) {
      scrollBtn.addEventListener("click", () => {
        chatWindow.scrollTo({ top: 0, behavior: "smooth" });
      });

      chatWindow.addEventListener("scroll", () => {
        scrollBtn.style.opacity = chatWindow.scrollTop > 80 ? "1" : "0.7";
      });
    }
  }

  // 綁定聊天發送
  bindChatInput() {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("btn-send");

    const doSend = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      this.handleUserQuery(text);
    };

    if (sendBtn) sendBtn.addEventListener("click", doSend);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          doSend();
        }
      });
    }
  }

  // 綁定手機掃碼 QR Code 彈窗與立牌開啟
  bindQrCodeModal() {
    const openBtn = document.getElementById("btn-open-qrcode");
    const modal = document.getElementById("qrcode-modal");
    const closeBtn = document.getElementById("btn-close-qrcode");
    const downloadBtn = document.getElementById("btn-download-modal-qr");
    const standeeBtn = document.getElementById("btn-open-standee-page");
    const qrContainer = document.getElementById("modal-qrcode-canvas");
    const urlInput = document.getElementById("modal-qr-url-input");
    const updateBtn = document.getElementById("btn-modal-qr-update");

    const renderModalQR = (text) => {
      if (!qrContainer || !window.QRCode) return;
      qrContainer.innerHTML = "";
      new window.QRCode(qrContainer, {
        text: text,
        width: 170,
        height: 170,
        colorDark: "#026873",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H
      });
    };

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        let targetUrl = "http://10.97.1.178:8080";
        if (window.location.protocol.startsWith("http") && !window.location.hostname.includes("localhost")) {
          targetUrl = window.location.href;
        }
        if (urlInput) {
          urlInput.value = targetUrl;
        }
        renderModalQR(targetUrl);
        modal.classList.add("active");
      });
    }

    if (updateBtn && urlInput) {
      updateBtn.addEventListener("click", () => {
        const custom = urlInput.value.trim();
        if (custom) renderModalQR(custom);
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
        }
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        const img = document.querySelector("#modal-qrcode-canvas img") || document.querySelector("#modal-qrcode-canvas canvas");
        if (img) {
          let src = img.src;
          if (!src && img.toDataURL) {
            src = img.toDataURL("image/png");
          }
          const a = document.createElement("a");
          a.href = src;
          a.download = "雙和醫院_智慧諮詢服務_QRCode.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      });
    }

    if (standeeBtn) {
      standeeBtn.addEventListener("click", () => {
        const currentUrl = urlInput ? encodeURIComponent(urlInput.value.trim()) : "";
        window.open(`📱雙和醫院_智能問答QR_Code立牌與海報.html?url=${currentUrl}`, "_blank");
      });
    }
  }

  // 處理使用者提問
  handleUserQuery(query) {
    this.addUserMessage(query);

    let db = null;
    if (window.adminMgr && typeof window.adminMgr.getActiveDatabase === "function") {
      db = window.adminMgr.getActiveDatabase();
    }
    if (!db || !db.items || db.items.length === 0) {
      if (window.DEFAULT_DATABASES) {
        db = window.DEFAULT_DATABASES["db_1150120"] || Object.values(window.DEFAULT_DATABASES)[0];
      }
    }
    if (!db || !db.items) {
      db = { name: "雙和醫療服務知識庫", items: [] };
    }

    const matchResult = this.searchKnowledgeBase(query, db.items);

    if (window.adminMgr && typeof window.adminMgr.recordQuery === "function") {
      window.adminMgr.recordQuery(query, matchResult.bestItem);
    }

    // 記錄提問到 Firebase + GA4
    if (window.Tracker) {
      window.Tracker.recordQuestion(query, !!matchResult.bestItem, matchResult.bestItem || null);
    }

    if (matchResult.bestItem) {
      this.addBotMessage({
        text: matchResult.bestItem.answer,
        item: matchResult.bestItem
      });
    } else {
      this.addBotMessage({
        text: `抱歉，在題庫中暫時找不到與「${query}」直接符合的解答。\n您可以點擊上方分類展開查看常見問題，或嘗試使用不同關鍵字提問。`
      });
    }
  }

  // 智能搜尋比對 (支援標籤字串與陣列安全處理)
  searchKnowledgeBase(query, items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { bestItem: null };
    }

    const cleanQuery = (query || "").toLowerCase().trim();
    if (!cleanQuery) return { bestItem: null };

    const tokens = cleanQuery.split(/[\s,，、。！？?/\-_]+/).filter(Boolean);

    const scored = items.map(item => {
      let score = 0;
      const q = (item.question || "").toLowerCase();
      const a = (item.answer || "").toLowerCase();
      const c = (item.category || "").toLowerCase();
      
      let tags = [];
      if (Array.isArray(item.tags)) {
        tags = item.tags.map(t => (t || "").toString().toLowerCase());
      } else if (typeof item.tags === "string" && item.tags.trim()) {
        tags = item.tags.split(/[,，、]/).map(t => t.trim().toLowerCase());
      }

      if (q === cleanQuery) score += 100;
      else if (q.includes(cleanQuery)) score += 60;

      if (tags.some(t => t === cleanQuery)) score += 55;
      else if (tags.some(t => cleanQuery.includes(t) || t.includes(cleanQuery))) score += 40;

      if (c.includes(cleanQuery)) score += 30;
      if (a.includes(cleanQuery)) score += 20;

      tokens.forEach(tok => {
        if (!tok) return;
        if (q.includes(tok)) score += 15 * tok.length;
        if (tags.some(t => t.includes(tok))) score += 18 * tok.length;
        if (c.includes(tok)) score += 10;
        if (a.includes(tok)) score += 4 * tok.length;
      });

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const top = scored[0];
    if (top && top.score >= 10) {
      return {
        bestItem: top.item
      };
    }

    return { bestItem: null };
  }

  // 使用者對話訊息
  addUserMessage(text) {
    const chatWindow = document.getElementById("chat-window");
    const row = document.createElement("div");
    row.className = "chat-message-row user";
    row.innerHTML = `
      <div class="user-avatar-badge">👤</div>
      <div class="user-message-bubble">${this.escapeHtml(text)}</div>
    `;
    chatWindow.appendChild(row);
    this.scrollToBottom();
  }

  // 機器人對話訊息（乾淨呈現回答與來源，不顯示相關問題）
  addBotMessage(data) {
    const chatWindow = document.getElementById("chat-window");
    const row = document.createElement("div");
    row.className = "chat-message-row bot";

    let metaHtml = "";

    if (data.item) {
      const item = data.item;
      metaHtml = `
        <div class="answer-meta-row">
          <span class="chip">📁 ${item.category}</span>
          ${item.source ? `<span style="color:var(--text-light); font-size:11.5px;">來源：${this.escapeHtml(item.source)}</span>` : ""}
        </div>
      `;
    }

    row.innerHTML = `
      <div class="bot-avatar-badge">🤖</div>
      <div class="assistant-card-body">
        <div class="answer-text">${this.formatAnswerText(data.text)}</div>
        ${metaHtml}
      </div>
    `;

    chatWindow.appendChild(row);
    this.scrollToBottom();
  }

  // 格式化回答文字，將所有網址自動轉為可點擊超連結，電話號碼轉為可點擊撥號
  formatAnswerText(text) {
    if (!text) return "";
    let escaped = this.escapeHtml(text);

    // 1. 支援 Markdown 連結語法: [說明文字](http...)
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi, (match, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-auto-link" title="點擊前往：${url}">🔗 ${label} ↗</a>`;
    });

    // 2. 自動識別純文字網址 (https:// 或 http://)
    const urlPattern = /(https?:\/\/[^\s<>"'，、。)）\]]+)/gi;
    escaped = escaped.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-auto-link" title="點擊前往網頁：${url}">${url} ↗</a>`;
    });

    // 3. 自動識別電話號碼 (例如 (02)2249-0088 或 02-27361661) 轉為可點擊撥號連結
    const telPattern = /(\(?0\d{1,2}\)?[- ]?\d{3,4}[- ]?\d{4})/g;
    escaped = escaped.replace(telPattern, (match) => {
      const cleanNum = match.replace(/[^0-9]/g, "");
      return `<a href="tel:${cleanNum}" class="chat-tel-link" title="點擊直接撥打電話：${match}">📞 ${match}</a>`;
    });

    return escaped;
  }

  askDirectQuestion(questionText) {
    this.handleUserQuery(questionText);
  }

  scrollToBottom() {
    const chatWindow = document.getElementById("chat-window");
    setTimeout(() => {
      chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: "smooth" });
    }, 60);
  }

  escapeHtml(text) {
    if (!text) return "";
    return text.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// 實例化
function initChatApp() {
  if (!window.adminMgr && typeof DatabaseManager !== "undefined") {
    window.adminMgr = new DatabaseManager();
  }
  if (!window.chatApp) {
    window.chatApp = new ChatAssistantApp();
  }
}
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initChatApp);
} else {
  initChatApp();
}
