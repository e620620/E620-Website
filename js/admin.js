/**
 * 智能問答助手 - 後台與多資料庫管理模組 (Multi-Database & Excel Module)
 */

const STORAGE_DATABASES_KEY = "QA_ALL_DATABASES_V2";
const STORAGE_ACTIVE_DB_KEY = "QA_ACTIVE_DB_ID_V2";
const STORAGE_ADMIN_PWD_KEY = "QA_ADMIN_PASSWORD_V2";
const STORAGE_VERSION_KEY = "QA_DATABASES_VERSION_V2";
const STATS_KEY = "QA_SYSTEM_STATS_V2";

class DatabaseManager {
  constructor() {
    this.databases = this.loadAllDatabases();
    this.activeDbId = this.loadActiveDbId();
    this.statsData = this.loadStats();
    this.isAdminUnlocked = false; // 是否已解鎖後台
    this.pendingAdminAction = null;
    this.currentEditingItemId = null;
    this.currentEditingDbId = null;
    this.initEventListeners();
  }

  // 取得管理密碼（預設 8888）
  getAdminPassword() {
    return localStorage.getItem(STORAGE_ADMIN_PWD_KEY) || "8888";
  }

  // 設定新管理密碼
  setAdminPassword(newPassword) {
    localStorage.setItem(STORAGE_ADMIN_PWD_KEY, newPassword);
  }

  // 請求解鎖後台（若已解鎖直接執行，未解鎖則彈出密碼視窗）
  requestAdminUnlock(onSuccess) {
    if (this.isAdminUnlocked) {
      if (typeof onSuccess === "function") onSuccess();
      return;
    }

    this.pendingAdminAction = onSuccess;
    const modal = document.getElementById("admin-auth-modal");
    const input = document.getElementById("admin-password-input");
    const errorEl = document.getElementById("admin-auth-error");

    if (errorEl) errorEl.style.display = "none";
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 150);
    }
    if (modal) modal.classList.add("active");
  }

  // 鎖定後台
  lockAdmin() {
    this.isAdminUnlocked = false;
  }

  // 載入所有資料庫 (自動檢核檔案版本與最新更新)
  loadAllDatabases() {
    const defaults = window.DEFAULT_DATABASES || {};
    const defaultVersion = window.DEFAULT_DATABASES_VERSION || 0;
    const savedVersion = parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || "0", 10);

    try {
      const saved = localStorage.getItem(STORAGE_DATABASES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          // 若本機檔案版本較新，強制覆蓋更新預設庫 (如 知識庫_1150120)
          if (defaultVersion > savedVersion) {
            Object.keys(defaults).forEach(key => {
              parsed[key] = defaults[key];
            });
            localStorage.setItem(STORAGE_VERSION_KEY, defaultVersion.toString());
            this.saveAllDatabases(parsed);
            return parsed;
          }

          // 一般情況下確保預設庫存在
          Object.keys(defaults).forEach(key => {
            if (!parsed[key] || key === "db_1150120") {
              parsed[key] = defaults[key];
            }
          });
          this.saveAllDatabases(parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.warn("讀取本機資料庫失敗：", e);
    }
    
    if (defaultVersion > 0) {
      localStorage.setItem(STORAGE_VERSION_KEY, defaultVersion.toString());
    }
    this.saveAllDatabases(defaults);
    return JSON.parse(JSON.stringify(defaults));
  }

  // 強制從 database/ 資料夾同步載入最新檔案內容
  syncFromLocalFiles() {
    const defaults = window.DEFAULT_DATABASES || {};
    if (Object.keys(defaults).length === 0) {
      this.showToast("未偵測到本機 databases.js 檔案內容", "warning");
      return;
    }
    this.databases = JSON.parse(JSON.stringify(defaults));
    this.saveAllDatabases(this.databases);
    if (window.DEFAULT_DATABASES_VERSION) {
      localStorage.setItem(STORAGE_VERSION_KEY, window.DEFAULT_DATABASES_VERSION.toString());
    }
    if (window.chatApp) {
      window.chatApp.onDatabaseSwitched();
    }
    this.renderDatabaseList();
    this.renderActiveDbContent();
    this.renderTagsCloud();
    this.renderStats();
    this.showToast("✅ 已成功從 database/ 檔案同步最新問答資料！", "success");
  }

  saveAllDatabases(data) {
    this.databases = data;
    try {
      localStorage.setItem(STORAGE_DATABASES_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("儲存資料庫至本機失敗：", e);
      this.showToast("儲存失敗，本機容量可能不足", "error");
    }
  }

  loadActiveDbId() {
    const saved = localStorage.getItem(STORAGE_ACTIVE_DB_KEY);
    if (saved && this.databases[saved]) {
      return saved;
    }
    if (this.databases["db_1150120"]) {
      return "db_1150120";
    }
    const keys = Object.keys(this.databases);
    return keys.length > 0 ? keys[0] : "db_1150120";
  }

  setActiveDbId(dbId) {
    if (!this.databases[dbId]) return;
    this.activeDbId = dbId;
    localStorage.setItem(STORAGE_ACTIVE_DB_KEY, dbId);
    
    if (window.chatApp) {
      window.chatApp.onDatabaseSwitched();
    }
    
    this.renderDatabaseList();
    this.renderActiveDbContent();
    this.renderTagsCloud();
    this.renderStats();
    this.showToast(`已切換至「${this.databases[dbId].name}」`, "success");
  }

  getActiveDatabase() {
    return this.databases[this.activeDbId] || {
      id: "default",
      name: "預設知識庫",
      description: "歡迎使用智能問答助手！",
      categories: ["一般問題"],
      items: []
    };
  }

  createDatabase({ name, description, categories }) {
    if (!name || !name.trim()) {
      alert("請輸入資料庫名稱！");
      return false;
    }

    const newId = "db_" + Date.now().toString(36);
    const catList = Array.isArray(categories) 
      ? categories.filter(Boolean) 
      : (typeof categories === "string" ? categories.split(/[,，、]/).map(c => c.trim()).filter(Boolean) : []);
    
    if (catList.length === 0) {
      catList.push("常見問題");
    }

    this.databases[newId] = {
      id: newId,
      name: name.trim(),
      description: description ? description.trim() : "歡迎使用智能問答小幫手！",
      categories: catList,
      createdAt: new Date().toISOString().slice(0, 10),
      items: [
        {
          id: `kb-${Date.now()}-01`,
          question: `歡迎使用【${name.trim()}】`,
          answer: `這是剛建立的「${name.trim()}」問答資料庫。\n您可以點選右上角「⚙ 後台管理」隨時透過 Excel 匯入或手動新增問答！`,
          category: catList[0],
          tags: ["歡迎", "使用指南"],
          source: "系統初始建立",
          confidence: 1.0
        }
      ]
    };

    this.saveAllDatabases(this.databases);
    this.setActiveDbId(newId);
    this.showToast(`成功建立資料庫「${name}」！`, "success");
    return true;
  }

  updateDatabaseInfo(dbId, { name, description }) {
    if (!this.databases[dbId]) return false;
    if (name && name.trim()) this.databases[dbId].name = name.trim();
    if (description !== undefined) this.databases[dbId].description = description.trim();
    
    this.saveAllDatabases(this.databases);
    if (window.chatApp) window.chatApp.onDatabaseSwitched();
    this.renderDatabaseList();
    this.showToast("已更新資料庫資訊！", "success");
    return true;
  }

  deleteDatabase(dbId) {
    const keys = Object.keys(this.databases);
    if (keys.length <= 1) {
      alert("系統必須保留至少一個資料庫，無法刪除！");
      return;
    }

    const targetDb = this.databases[dbId];
    if (!confirm(`確定要徹底刪除「${targetDb.name}」（內含 ${targetDb.items.length} 筆問答）嗎？此動作無法復原！`)) {
      return;
    }

    delete this.databases[dbId];
    this.saveAllDatabases(this.databases);

    if (this.activeDbId === dbId) {
      const remainingKeys = Object.keys(this.databases);
      this.setActiveDbId(remainingKeys[0]);
    } else {
      this.renderDatabaseList();
    }
    this.showToast("已刪除資料庫", "success");
  }

  // --- 分類管理 (Categories) ---
  addCategory(categoryName) {
    const cat = (categoryName || "").trim();
    if (!cat) return;
    const db = this.getActiveDatabase();
    if (!db.categories.includes(cat)) {
      db.categories.push(cat);
      this.saveAllDatabases(this.databases);
      if (window.chatApp) window.chatApp.onDatabaseSwitched();
      this.renderActiveDbContent();
      this.showToast(`已新增分類「${cat}」`, "success");
    }
  }

  deleteCategory(categoryName) {
    const db = this.getActiveDatabase();
    if (db.categories.length <= 1) {
      alert("資料庫至少需保留一個分類！");
      return;
    }
    if (confirm(`確定要刪除「${categoryName}」分類嗎？（所屬的問答將移至其他分類）`)) {
      db.categories = db.categories.filter(c => c !== categoryName);
      const fallbackCat = db.categories[0];
      db.items.forEach(item => {
        if (item.category === categoryName) item.category = fallbackCat;
      });
      this.saveAllDatabases(this.databases);
      if (window.chatApp) window.chatApp.onDatabaseSwitched();
      this.renderActiveDbContent();
      this.showToast(`已移除分類「${categoryName}」`, "success");
    }
  }

  // --- 問答條目 CRUD ---
  saveItem(itemData) {
    const db = this.getActiveDatabase();
    if (this.currentEditingItemId) {
      const idx = db.items.findIndex(i => i.id === this.currentEditingItemId);
      if (idx !== -1) {
        db.items[idx] = { ...db.items[idx], ...itemData, id: this.currentEditingItemId };
        this.showToast("已成功更新問答內容！", "success");
      }
    } else {
      const newItem = {
        id: "kb-" + Date.now().toString(36),
        ...itemData
      };
      db.items.unshift(newItem);
      this.showToast("已新增問答條目！", "success");
    }

    if (itemData.category && !db.categories.includes(itemData.category)) {
      db.categories.push(itemData.category);
    }

    this.saveAllDatabases(this.databases);
    if (window.chatApp) window.chatApp.onDatabaseSwitched();
    this.renderActiveDbContent();
    this.renderTagsCloud();
    this.renderStats();
  }

  deleteItem(itemId) {
    const db = this.getActiveDatabase();
    if (confirm("確定要刪除這筆問答嗎？")) {
      db.items = db.items.filter(i => i.id !== itemId);
      this.saveAllDatabases(this.databases);
      if (window.chatApp) window.chatApp.onDatabaseSwitched();
      this.renderActiveDbContent();
      this.renderTagsCloud();
      this.renderStats();
      this.showToast("已刪除該筆問答", "success");
    }
  }

  // --- 📊 EXCEL 匯出與匯入 ---

  // 1. 匯出 Excel (.xlsx)
  exportActiveDbToExcel() {
    if (typeof XLSX === "undefined") {
      alert("Excel 模組載入中，請稍候重試");
      return;
    }
    const db = this.getActiveDatabase();
    const rows = db.items.map(item => ({
      "分類": item.category || "",
      "問題": item.question || "",
      "答案": item.answer || "",
      "標籤": Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags || ""),
      "來源": item.source || ""
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "問答題庫");
    
    const fileName = `${db.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.xlsx`;
    XLSX.writeFile(wb, fileName);
    this.showToast(`已成功匯出 Excel 檔案「${fileName}」！`, "success");
  }

  // 2. 匯入 Excel (.xlsx / .xls / .csv)
  importExcelToActiveDb(file) {
    if (typeof XLSX === "undefined") {
      alert("Excel 解析元件尚未就緒，請確認 js/xlsx.full.min.js 檔案存在或重新整理網頁後重試。");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
          alert("Excel 檔案為空或無法識別工作表！");
          return;
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        const raw2DGrid = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const db = this.getActiveDatabase();

        const getValByRegex = (row, regex) => {
          for (const [k, v] of Object.entries(row)) {
            if (regex.test(k.trim())) return (v !== null && v !== undefined) ? v.toString().trim() : "";
          }
          return "";
        };

        const knownCategories = ["住院前", "住院中", "出院", "文件申請", "服務設施", "服務電話", "您好/你好"];

        let formatted = [];

        // 策略 A: 物件欄位正則智能匹配
        if (rawJsonRows && rawJsonRows.length > 0) {
          formatted = rawJsonRows.map((row, idx) => {
            const q = getValByRegex(row, /問題|題目|問|問答|常見問題|標題|question|title|^q$/i);
            const a = getValByRegex(row, /答案|回覆|內容|回答|答|說明|解答|answer|content|^a$/i);
            let c = getValByRegex(row, /分類|類別|類別名稱|項目|category|type|group/i);
            const rawTags = getValByRegex(row, /標籤|關鍵字|關鍵詞|tag|tags|keyword|keywords/i);
            const s = getValByRegex(row, /來源|出處|單位|source/i) || file.name;
            const rawConf = getValByRegex(row, /信心|信心分數|confidence|score/i);

            let tags = [];
            if (rawTags) {
              tags = rawTags.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
            }

            if (!c || c === "一般問答") {
              const matchedCat = knownCategories.find(kc => tags.includes(kc));
              if (matchedCat) c = matchedCat;
              else if (!c) c = "一般問答";
            }

            const conf = rawConf ? parseFloat(rawConf) : 0.95;

            return {
              id: `kb-excel-${Date.now()}-${idx + 1}`,
              question: q,
              answer: a,
              category: c,
              tags: tags,
              source: s,
              confidence: isNaN(conf) ? 0.95 : conf
            };
          }).filter(i => i.question && i.answer);
        }

        // 策略 B: 若策略 A 未找到問答，採用 2D 陣列欄位位置推斷 (A欄:問題, B欄:答案, C欄:分類...)
        if (formatted.length === 0 && raw2DGrid && raw2DGrid.length > 1) {
          const startIndex = (raw2DGrid[0] && (/問題|question/i.test(raw2DGrid[0][0]) || /答案|answer/i.test(raw2DGrid[0][1]))) ? 1 : 0;
          for (let i = startIndex; i < raw2DGrid.length; i++) {
            const row = raw2DGrid[i];
            if (!row || row.length === 0) continue;
            const q = (row[0] || "").toString().trim();
            const a = (row[1] || "").toString().trim();
            if (!q && !a) continue;

            let c = (row[2] || "").toString().trim();
            const rawTags = (row[3] || "").toString().trim();
            const s = (row[4] || "").toString().trim() || file.name;
            const rawConf = (row[5] || "").toString().trim();

            let tags = [];
            if (rawTags) {
              tags = rawTags.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
            }

            if (!c || c === "一般問答") {
              const matchedCat = knownCategories.find(kc => tags.includes(kc));
              if (matchedCat) c = matchedCat;
              else if (!c) c = "一般問答";
            }

            const conf = rawConf ? parseFloat(rawConf) : 0.95;

            if (q && a) {
              formatted.push({
                id: `kb-excel-${Date.now()}-${i + 1}`,
                question: q,
                answer: a,
                category: c,
                tags: tags,
                source: s,
                confidence: isNaN(conf) ? 0.95 : conf
              });
            }
          }
        }

        if (formatted.length === 0) {
          alert("未在 Excel 中偵測到有效的問答內容！\n請確認工作表第 1 列是否有「問題」與「答案」欄位，且下方有填寫問答資料。");
          return;
        }

        // 詢問使用者要覆蓋還是追加
        const isOverwrite = confirm(
          `📊 成功自「${file.name}」解析出 ${formatted.length} 筆問答！\n\n` +
          `【確定】➔ 覆蓋更新（完全同步 Excel 內容，將舊資料覆蓋）\n` +
          `【取消】➔ 追加匯入（保留現有問答，將這 ${formatted.length} 筆加在後面）`
        );

        if (isOverwrite) {
          db.items = formatted;
        } else {
          db.items.push(...formatted);
        }

        // 自動更新分類清單
        formatted.forEach(i => {
          if (i.category && !db.categories.includes(i.category)) {
            db.categories.push(i.category);
          }
        });

        this.saveAllDatabases(this.databases);
        if (window.chatApp) window.chatApp.onDatabaseSwitched();
        this.renderActiveDbContent();
        this.renderTagsCloud();
        this.renderStats();
        this.showToast(`🎉 成功${isOverwrite ? "覆蓋更新" : "匯入"} ${formatted.length} 筆問答！`, "success");
      } catch (err) {
        console.error("Excel 匯入失敗：", err);
        alert("Excel 讀取失敗：" + (err.message || err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // --- JSON 匯出與匯入 ---
  exportActiveDatabase() {
    const db = this.getActiveDatabase();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `${db.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}-${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.showToast("資料庫 JSON 已成功匯出！", "success");
  }

  importDatabaseJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.id && parsed.name && Array.isArray(parsed.items)) {
        const newId = "db_imported_" + Date.now().toString(36);
        const dbToImport = {
          ...parsed,
          id: newId,
          name: parsed.name + " (匯入)",
          createdAt: new Date().toISOString().slice(0, 10)
        };
        this.databases[newId] = dbToImport;
        this.saveAllDatabases(this.databases);
        this.setActiveDbId(newId);
        this.showToast(`成功匯入新資料庫「${dbToImport.name}」！`, "success");
        return true;
      }
      
      if (Array.isArray(parsed)) {
        const db = this.getActiveDatabase();
        const formatted = parsed.map((p, idx) => ({
          id: `kb-import-${Date.now()}-${idx}`,
          question: p.question || "未填問題",
          answer: p.answer || "未填答案",
          category: p.category || db.categories[0] || "常見問題",
          tags: Array.isArray(p.tags) ? p.tags : (typeof p.tags === "string" ? p.tags.split(/[,，、]/).map(t => t.trim()) : []),
          source: p.source || "批次匯入",
          confidence: parseFloat(p.confidence || 0.95)
        }));

        formatted.forEach(item => {
          if (!db.categories.includes(item.category)) db.categories.push(item.category);
        });

        db.items.push(...formatted);
        this.saveAllDatabases(this.databases);
        if (window.chatApp) window.chatApp.onDatabaseSwitched();
        this.renderActiveDbContent();
        this.renderTagsCloud();
        this.renderStats();
        this.showToast(`成功匯入 ${formatted.length} 筆問答至「${db.name}」！`, "success");
        return true;
      }

      throw new Error("無效的資料格式");
    } catch (err) {
      alert("匯入失敗，請確認 JSON 格式：" + err.message);
      return false;
    }
  }

  // --- 🎨 介面渲染方法群 (UI Renderers) ---

  // 1. 渲染資料庫清單列表
  renderDatabaseList() {
    const container = document.getElementById("admin-db-list-container");
    if (!container) return;

    const dbEntries = Object.entries(this.databases);
    if (dbEntries.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:13px;">目前尚無資料庫</div>`;
      return;
    }

    container.innerHTML = dbEntries.map(([id, db]) => {
      const isActive = id === this.activeDbId;
      const itemCount = (db.items || []).length;
      const catCount = (db.categories || []).length;

      return `
        <div style="background:#ffffff; border:1px solid ${isActive ? "var(--primary-teal)" : "var(--border-color)"}; border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
          <div style="flex:1; min-width:0; margin-right:10px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <span style="font-size:14px; font-weight:800; color:var(--text-dark); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${this.escapeHtml(db.name)}
              </span>
              ${isActive ? `<span style="font-size:10.5px; font-weight:700; background:var(--primary-teal); color:#ffffff; padding:1px 6px; border-radius:10px;">使用中</span>` : ""}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${this.escapeHtml(db.description || "無描述")}
            </div>
            <div style="font-size:11px; color:var(--text-light); display:flex; gap:10px;">
              <span>📁 ${catCount} 個分類</span>
              <span>📝 ${itemCount} 筆問答</span>
              <span>🕒 ${db.updatedAt || db.createdAt || "最新"}</span>
            </div>
          </div>
          <div style="display:flex; gap:5px; flex-shrink:0;">
            ${!isActive ? `
              <button onclick="window.adminMgr.setActiveDbId('${id}')" class="btn-primary" style="font-size:11.5px; padding:4px 8px;">
                切換
              </button>
            ` : ""}
            <button onclick="window.adminMgr.openEditDbModal('${id}')" class="btn-outline" style="font-size:11.5px; padding:4px 8px;">
              ✏️ 編輯
            </button>
            ${dbEntries.length > 1 ? `
              <button onclick="window.adminMgr.deleteDatabase('${id}')" class="btn-outline" style="font-size:11.5px; padding:4px 8px; color:#c62828; border-color:#ffcdd2;">
                🗑️ 刪除
              </button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  // 2. 渲染當前活躍資料庫的問答內容與分類
  renderActiveDbContent(filterText = "", categoryFilter = "ALL") {
    const db = this.getActiveDatabase();
    const categories = db.categories || [];
    const items = db.items || [];

    // 1. 渲染分類 Chips
    const chipsContainer = document.getElementById("admin-db-categories-chips");
    if (chipsContainer) {
      chipsContainer.innerHTML = `
        ${categories.map(cat => {
          const count = items.filter(i => (i.category || "").trim() === cat).length;
          return `
            <span class="db-cat-chip" style="background:#edf5fb; color:#19538c; border:1px solid #d0e4f5; padding:3px 8px; border-radius:12px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px; margin:2px;">
              📁 ${this.escapeHtml(cat)} (${count})
              ${categories.length > 1 ? `<button onclick="window.adminMgr.deleteCategory('${this.escapeHtml(cat)}')" style="background:transparent; border:none; color:#19538c; cursor:pointer; font-weight:bold; font-size:12px; margin-left:2px;">×</button>` : ""}
            </span>
          `;
        }).join("")}
        <button onclick="window.adminMgr.promptAddCategory()" class="add-cat-btn" style="border:1px dashed var(--primary-teal); color:var(--primary-teal); background:#ffffff; padding:2px 8px; border-radius:12px; font-size:11.5px; cursor:pointer; margin:2px;">
          ＋ 新增分類
        </button>
      `;
    }

    // 2. 渲染分類下拉選單
    const filterSelect = document.getElementById("admin-category-filter");
    if (filterSelect) {
      const currentSelected = categoryFilter || filterSelect.value || "ALL";
      filterSelect.innerHTML = `
        <option value="ALL">全部分類 (${items.length})</option>
        ${categories.map(cat => {
          const count = items.filter(i => (i.category || "").trim() === cat).length;
          return `<option value="${this.escapeHtml(cat)}" ${cat === currentSelected ? "selected" : ""}>${this.escapeHtml(cat)} (${count})</option>`;
        }).join("")}
      `;
    }

    // 3. 過濾問答卡片
    const cleanSearch = (filterText || "").toLowerCase().trim();
    const cleanCat = categoryFilter || "ALL";

    let filtered = items.filter(item => {
      if (cleanCat !== "ALL" && (item.category || "").trim() !== cleanCat) {
        return false;
      }
      if (cleanSearch) {
        const q = (item.question || "").toLowerCase();
        const a = (item.answer || "").toLowerCase();
        let tags = [];
        if (Array.isArray(item.tags)) tags = item.tags;
        else if (typeof item.tags === "string") tags = item.tags.split(/[,，、]/);
        const hasTag = tags.some(t => t.toLowerCase().includes(cleanSearch));
        return q.includes(cleanSearch) || a.includes(cleanSearch) || hasTag;
      }
      return true;
    });

    // 4. 渲染問答卡片清單
    const cardsContainer = document.getElementById("admin-kb-cards-container");
    if (cardsContainer) {
      if (filtered.length === 0) {
        cardsContainer.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:13px; background:#fbfdfd; border-radius:8px; border:1px dashed #dcefed;">查無符合條件的問答資料</div>`;
        return;
      }

      cardsContainer.innerHTML = filtered.map(item => {
        let tagArray = [];
        if (Array.isArray(item.tags)) tagArray = item.tags;
        else if (typeof item.tags === "string") tagArray = item.tags.split(/[,，、]/).map(t => t.trim()).filter(Boolean);

        return `
          <div style="background:#ffffff; border:1px solid var(--border-color); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
              <div style="display:flex; align-items:center; gap:6px; flex:1;">
                <span style="font-size:11px; font-weight:700; background:#edf5fb; color:#19538c; padding:2px 7px; border-radius:6px; flex-shrink:0;">
                  📁 ${this.escapeHtml(item.category || "一般問答")}
                </span>
                <span style="font-size:14px; font-weight:800; color:var(--text-dark);">
                  ❓ ${this.escapeHtml(item.question)}
                </span>
              </div>
              <div style="display:flex; gap:4px; flex-shrink:0;">
                <button onclick="window.adminMgr.openEditItemModal('${item.id}')" class="btn-outline" style="font-size:11px; padding:3px 7px;">
                  ✏️ 編輯
                </button>
                <button onclick="window.adminMgr.deleteItem('${item.id}')" class="btn-outline" style="font-size:11px; padding:3px 7px; color:#c62828; border-color:#ffcdd2;">
                  🗑️ 刪除
                </button>
              </div>
            </div>

            <div style="font-size:12.5px; color:var(--text-dark); line-height:1.5; background:#f9fbfa; padding:8px 10px; border-radius:6px; border:1px solid #eef5f5; word-break:break-word;">
              ${this.escapeHtml(item.answer)}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-light); margin-top:2px;">
              <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${tagArray.map(t => `<span style="background:#f1f5f9; color:#475569; padding:1px 6px; border-radius:4px;">🏷️ ${this.escapeHtml(t)}</span>`).join("")}
              </div>
              <span style="flex-shrink:0; margin-left:8px;">來源：${this.escapeHtml(item.source || "雙和醫院")}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 3. 渲染標籤庫雲
  renderTagsCloud() {
    const container = document.getElementById("admin-tags-cloud");
    if (!container) return;

    const db = this.getActiveDatabase();
    const items = db.items || [];
    const tagCountMap = {};

    items.forEach(item => {
      let tags = [];
      if (Array.isArray(item.tags)) tags = item.tags;
      else if (typeof item.tags === "string") tags = item.tags.split(/[,，、]/);
      tags.forEach(t => {
        const cleanT = (t || "").trim();
        if (cleanT) {
          tagCountMap[cleanT] = (tagCountMap[cleanT] || 0) + 1;
        }
      });
    });

    const tagEntries = Object.entries(tagCountMap);
    tagEntries.sort((a, b) => b[1] - a[1]);

    if (tagEntries.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-light); font-size:12.5px; width:100%;">尚無任何標籤資料</div>`;
      return;
    }

    container.innerHTML = tagEntries.map(([tag, count]) => `
      <button onclick="window.adminMgr.queryTagInChat('${this.escapeHtml(tag)}')" style="background:#ffffff; border:1px solid #d0e4f5; color:#19538c; border-radius:14px; padding:4px 10px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
        🏷️ ${this.escapeHtml(tag)}
        <span style="font-size:10.5px; background:#edf5fb; padding:1px 5px; border-radius:8px;">${count}</span>
      </button>
    `).join("");
  }

  // --- 統計與提問記錄 ---
  loadStats() {
    try {
      const saved = localStorage.getItem(STATS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          totalQueries: parsed.totalQueries || 0,
          matchedQueries: parsed.matchedQueries || 0,
          unmatchedQueries: parsed.unmatchedQueries || 0,
          questionHits: parsed.questionHits || {},
          categoryHits: parsed.categoryHits || {},
          unmatchedList: Array.isArray(parsed.unmatchedList) ? parsed.unmatchedList : [],
          recentLog: Array.isArray(parsed.recentLog) ? parsed.recentLog : []
        };
      }
    } catch (e) {}
    return {
      totalQueries: 0,
      matchedQueries: 0,
      unmatchedQueries: 0,
      questionHits: {},
      categoryHits: {},
      unmatchedList: [],
      recentLog: []
    };
  }

  // 記錄每次使用者的提問狀況
  recordQuery(query, matchedItem) {
    if (!query || !query.trim()) return;
    const cleanQ = query.trim();
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${timeStr}`;

    this.statsData.totalQueries = (this.statsData.totalQueries || 0) + 1;

    if (matchedItem) {
      this.statsData.matchedQueries = (this.statsData.matchedQueries || 0) + 1;
      
      // 記錄問題命中次數與使用率
      const qKey = matchedItem.id || matchedItem.question;
      if (!this.statsData.questionHits[qKey]) {
        this.statsData.questionHits[qKey] = {
          id: matchedItem.id,
          question: matchedItem.question,
          category: matchedItem.category || "一般問答",
          count: 0,
          lastAsked: dateStr
        };
      }
      this.statsData.questionHits[qKey].count += 1;
      this.statsData.questionHits[qKey].lastAsked = dateStr;

      // 記錄各分類諮詢熱度
      const cat = matchedItem.category || "一般問答";
      this.statsData.categoryHits[cat] = (this.statsData.categoryHits[cat] || 0) + 1;

      // 加入近期動態日誌 (最多 30 筆)
      this.statsData.recentLog.unshift({
        time: timeStr,
        date: dateStr,
        query: cleanQ,
        matched: true,
        matchedTitle: matchedItem.question,
        category: cat
      });
    } else {
      this.statsData.unmatchedQueries = (this.statsData.unmatchedQueries || 0) + 1;

      // 記錄未命中關鍵字
      const existing = this.statsData.unmatchedList.find(u => u.query.toLowerCase() === cleanQ.toLowerCase());
      if (existing) {
        existing.count += 1;
        existing.lastAsked = dateStr;
      } else {
        this.statsData.unmatchedList.unshift({
          query: cleanQ,
          count: 1,
          lastAsked: dateStr
        });
      }

      // 加入近期動態日誌 (最多 30 筆)
      this.statsData.recentLog.unshift({
        time: timeStr,
        date: dateStr,
        query: cleanQ,
        matched: false,
        matchedTitle: "查無直接對應解答",
        category: "待補充"
      });
    }

    if (this.statsData.recentLog.length > 30) {
      this.statsData.recentLog = this.statsData.recentLog.slice(0, 30);
    }
    if (this.statsData.unmatchedList.length > 50) {
      this.statsData.unmatchedList = this.statsData.unmatchedList.slice(0, 50);
    }

    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.statsData));
    } catch (e) {}
  }

  // 渲染問題使用率與效能分析面板
  renderStats() {
    const db = this.getActiveDatabase();
    const total = this.statsData.totalQueries || 0;
    const matched = this.statsData.matchedQueries || 0;
    const unmatched = this.statsData.unmatchedQueries || 0;
    const matchRate = total > 0 ? Math.round((matched / total) * 100) : 0;
    
    const dbItems = db.items || [];
    const askedQuestionIds = Object.keys(this.statsData.questionHits || {});
    const uniqueAskedCount = askedQuestionIds.length;
    const kbCoverageRate = dbItems.length > 0 ? Math.min(100, Math.round((uniqueAskedCount / dbItems.length) * 100)) : 0;

    // 1. 更新 4 大 KPI 指標卡片
    const elTotal = document.getElementById("stat-total-queries");
    const elMatchRate = document.getElementById("stat-match-rate");
    const elMatchedSub = document.getElementById("stat-matched-sub");
    const elKbCoverage = document.getElementById("stat-kb-coverage");
    const elCoverageSub = document.getElementById("stat-coverage-sub");
    const elUnmatched = document.getElementById("stat-unmatched-count");

    if (elTotal) elTotal.textContent = total.toLocaleString() + " 次";
    if (elMatchRate) elMatchRate.textContent = matchRate + "%";
    if (elMatchedSub) elMatchedSub.textContent = `成功回答 ${matched.toLocaleString()} 次`;
    if (elKbCoverage) elKbCoverage.textContent = kbCoverageRate + "%";
    if (elCoverageSub) elCoverageSub.textContent = `題庫共 ${dbItems.length} 題，已使用 ${uniqueAskedCount} 題`;
    if (elUnmatched) elUnmatched.textContent = unmatched.toLocaleString() + " 次";

    // 2. 渲染 🏆 熱門問題使用率排行榜 (Top 10)
    const topContainer = document.getElementById("stat-top-questions-container");
    if (topContainer) {
      const questionList = Object.values(this.statsData.questionHits || {});
      questionList.sort((a, b) => b.count - a.count);
      const top10 = questionList.slice(0, 10);

      if (top10.length === 0) {
        topContainer.innerHTML = `<div style="font-size:12.5px; color:var(--text-light); text-align:center; padding:16px;">尚無提問數據，當民眾在前端開始發問後將即時統計！</div>`;
      } else {
        const medals = ["🥇", "🥈", "🥉"];
        topContainer.innerHTML = top10.map((q, idx) => {
          const rankBadge = idx < 3 ? `<span style="font-size:15px;">${medals[idx]}</span>` : `<span style="font-size:11px; font-weight:800; background:#e8f0fe; color:#19538c; width:18px; height:18px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;">${idx + 1}</span>`;
          const sharePercent = total > 0 ? Math.round((q.count / total) * 100) : 0;
          return `
            <div style="background:#f8fbfa; border:1px solid #e2ecec; border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                  ${rankBadge}
                  <span style="font-size:13px; font-weight:700; color:var(--text-dark); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${this.escapeHtml(q.question)}
                  </span>
                  <span style="font-size:10.5px; color:#19538c; background:#edf5fb; padding:1px 5px; border-radius:6px; flex-shrink:0;">
                    ${this.escapeHtml(q.category || "一般")}
                  </span>
                </div>
                <div style="text-align:right; flex-shrink:0; margin-left:8px;">
                  <span style="font-size:13px; font-weight:800; color:var(--primary-teal);">${q.count} 次</span>
                  <span style="font-size:11px; color:var(--text-muted); margin-left:4px;">(${sharePercent}%)</span>
                </div>
              </div>
              <div style="width:100%; background:#e4eded; border-radius:9999px; height:6px; overflow:hidden;">
                <div style="background:var(--primary-teal); height:100%; width:${Math.min(100, Math.max(8, sharePercent))}%; border-radius:9999px;"></div>
              </div>
              <div style="font-size:10.5px; color:var(--text-light); text-align:right;">最後提問：${q.lastAsked || "無紀錄"}</div>
            </div>
          `;
        }).join("");
      }
    }

    // 3. 渲染 📁 各分類諮詢熱度分佈
    const catContainer = document.getElementById("stat-category-distribution-container");
    if (catContainer) {
      const catList = db.categories.map(cat => {
        const askCount = this.statsData.categoryHits[cat] || 0;
        const totalItemsInCat = dbItems.filter(i => i.category === cat).length;
        const percent = total > 0 ? Math.round((askCount / total) * 100) : 0;
        return { cat, askCount, totalItemsInCat, percent };
      });
      catList.sort((a, b) => b.askCount - a.askCount);

      catContainer.innerHTML = catList.map(c => `
        <div style="padding:6px 0; border-bottom:1px solid #f2f5f5;">
          <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:3px;">
            <span style="font-weight:700; color:var(--text-dark);">📁 ${this.escapeHtml(c.cat)} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${c.totalItemsInCat} 題)</span></span>
            <span style="font-weight:800; color:#19538c;">${c.askCount} 次詢問 (${c.percent}%)</span>
          </div>
          <div style="width:100%; background:#e8f0f8; border-radius:9999px; height:6px; overflow:hidden;">
            <div style="background:#19538c; height:100%; width:${Math.min(100, Math.max(c.askCount > 0 ? 6 : 0, c.percent))}%; border-radius:9999px;"></div>
          </div>
        </div>
      `).join("");
    }

    // 4. 渲染 🔍 待補充問題清單 (搜尋未命中紀錄)
    const unmatchedContainer = document.getElementById("stat-unmatched-list-container");
    if (unmatchedContainer) {
      const list = this.statsData.unmatchedList || [];
      list.sort((a, b) => b.count - a.count);

      if (list.length === 0) {
        unmatchedContainer.innerHTML = `<div style="font-size:12px; color:#2e7d32; text-align:center; padding:12px; background:#f0f9f5; border-radius:8px;">🎉 目前沒有未命中的提問紀錄，所有問題皆能精準回答！</div>`;
      } else {
        unmatchedContainer.innerHTML = list.slice(0, 10).map(u => `
          <div style="background:#fffcf9; border:1px solid #fce8d5; border-radius:8px; padding:7px 10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:700; color:#b25e00;">🔍 「${this.escapeHtml(u.query)}」</div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">未命中 ${u.count} 次 ｜ 最近詢問：${u.lastAsked || "剛才"}</div>
            </div>
            <button onclick="window.adminMgr.openCreateItemForUnmatched('${this.escapeHtml(u.query)}')" style="background:#026873; color:#ffffff; border:none; padding:4px 9px; border-radius:4px; font-size:11.5px; font-weight:700; cursor:pointer; white-space:nowrap;">
              ＋ 加入題庫
            </button>
          </div>
        `).join("");
      }
    }

    // 5. 渲染 🕒 最近即時諮詢動態
    const recentContainer = document.getElementById("stat-recent-activity-container");
    if (recentContainer) {
      const logs = this.statsData.recentLog || [];
      if (logs.length === 0) {
        recentContainer.innerHTML = `<div style="font-size:12px; color:var(--text-light); text-align:center; padding:12px;">尚無近期諮詢紀錄</div>`;
      } else {
        recentContainer.innerHTML = logs.slice(0, 15).map(l => `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:5px 8px; background:#f9fbfa; border-radius:6px; border-left:3px solid ${l.matched ? "#026873" : "#d97706"};">
            <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
              <span style="font-size:10.5px; color:var(--text-light); font-family:monospace;">${l.time}</span>
              <span style="font-weight:700; color:var(--text-dark); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(l.query)}</span>
              <span style="font-size:11px; color:${l.matched ? "#026873" : "#d97706"};">➔ ${this.escapeHtml(l.matchedTitle)}</span>
            </div>
            <span style="font-size:10px; padding:1px 5px; border-radius:4px; font-weight:700; background:${l.matched ? "#e6f4ea; color:#137333" : "#fef7e0; color:#b06000"}; flex-shrink:0;">
              ${l.matched ? "✅ 命中" : "⚠️ 未命中"}
            </span>
          </div>
        `).join("");
      }
    }
  }

  // 快速為未命中的問題開啟新增視窗
  openCreateItemForUnmatched(questionText) {
    this.openEditItemModal();
    const qInput = document.getElementById("item-question");
    if (qInput) {
      qInput.value = questionText;
      setTimeout(() => {
        const aInput = document.getElementById("item-answer");
        if (aInput) aInput.focus();
      }, 150);
    }
  }

  // 匯出問題使用率與效能分析報表 (CSV 格式)
  exportStatsReport() {
    const db = this.getActiveDatabase();
    const total = this.statsData.totalQueries || 0;
    const matched = this.statsData.matchedQueries || 0;
    const unmatched = this.statsData.unmatchedQueries || 0;
    const matchRate = total > 0 ? Math.round((matched / total) * 100) : 0;
    
    let csv = "\uFEFF"; // UTF-8 BOM
    csv += "【智能問答系統 - 問題使用率與效能分析報告】\n";
    csv += `報告產生時間,${new Date().toLocaleString()}\n`;
    csv += `當前資料庫,${db.name}\n`;
    csv += `總提問次數,${total}\n`;
    csv += `成功回答次數,${matched}\n`;
    csv += `成功解答率 (效能),${matchRate}%\n`;
    csv += `未命中次數,${unmatched}\n\n`;

    csv += "【熱門問題使用率排行榜 (Top Asked Questions)】\n";
    csv += "排名,問題名稱,所屬分類,提問次數,使用率佔比,最後提問時間\n";
    const qList = Object.values(this.statsData.questionHits || {});
    qList.sort((a, b) => b.count - a.count);
    qList.forEach((q, idx) => {
      const share = total > 0 ? Math.round((q.count / total) * 100) : 0;
      csv += `${idx + 1},"${(q.question || "").replace(/"/g, '""')}","${q.category || ""}",${q.count},${share}%,"${q.lastAsked || ""}"\n`;
    });

    csv += "\n【分類諮詢熱度分佈】\n";
    csv += "分類名稱,諮詢次數,佔比\n";
    Object.entries(this.statsData.categoryHits || {}).forEach(([cat, count]) => {
      const share = total > 0 ? Math.round((count / total) * 100) : 0;
      csv += `"${cat}",${count},${share}%\n`;
    });

    csv += "\n【未命中待補強問題清單】\n";
    csv += "關鍵字,未命中次數,最後提問時間\n";
    (this.statsData.unmatchedList || []).forEach(u => {
      csv += `"${(u.query || "").replace(/"/g, '""')}",${u.count},"${u.lastAsked || ""}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `問題使用率與效能分析報表_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast("📊 問題使用率統計報表已成功下載！", "success");
  }

  // 重設統計數據
  resetStatsData() {
    if (!confirm("確定要重設所有的提問次數、使用率與效能統計數據嗎？\n此動作無法復原。")) {
      return;
    }
    this.statsData = {
      totalQueries: 0,
      matchedQueries: 0,
      unmatchedQueries: 0,
      questionHits: {},
      categoryHits: {},
      unmatchedList: [],
      recentLog: []
    };
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.statsData));
    } catch (e) {}
    this.renderStats();
    this.showToast("統計數據已重設歸零！", "success");
  }

  queryTagInChat(tagName) {
    document.getElementById("admin-view")?.classList.remove("active");
    if (window.chatApp) {
      window.chatApp.askDirectQuestion(tagName);
    }
  }

  promptAddCategory() {
    const name = prompt("請輸入新分類名稱（例如：掛號須知、費用說明）：");
    if (name) this.addCategory(name);
  }

  // --- 彈窗處理 ---
  openCreateDbModal() {
    this.currentEditingDbId = null;
    document.getElementById("db-modal-title").textContent = "➕ 建立新資料庫";
    document.getElementById("db-name-input").value = "";
    document.getElementById("db-desc-input").value = "";
    document.getElementById("db-cats-input").value = "常見問題, 服務須知";
    document.getElementById("db-modal").classList.add("active");
  }

  openEditDbModal(dbId) {
    const db = this.databases[dbId];
    if (!db) return;
    this.currentEditingDbId = dbId;
    document.getElementById("db-modal-title").textContent = "✏️ 編輯資料庫資訊";
    document.getElementById("db-name-input").value = db.name || "";
    document.getElementById("db-desc-input").value = db.description || "";
    document.getElementById("db-cats-input").value = (db.categories || []).join(", ");
    document.getElementById("db-modal").classList.add("active");
  }

  openEditItemModal(id = null) {
    this.currentEditingItemId = id;
    const modal = document.getElementById("item-modal");
    const modalTitle = document.getElementById("modal-title");
    const qInput = document.getElementById("item-question");
    const aInput = document.getElementById("item-answer");
    const cSelect = document.getElementById("item-category");
    const tInput = document.getElementById("item-tags");
    const sInput = document.getElementById("item-source");

    const db = this.getActiveDatabase();
    cSelect.innerHTML = db.categories.map(c => `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`).join("");

    if (id) {
      const item = db.items.find(i => i.id === id);
      if (item) {
        modalTitle.textContent = "✏️ 編輯問答條目";
        qInput.value = item.question || "";
        aInput.value = item.answer || "";
        cSelect.value = item.category || db.categories[0];
        tInput.value = (item.tags || []).join(", ");
        sInput.value = item.source || "";
      }
    } else {
      modalTitle.textContent = "＋ 新增問答條目";
      qInput.value = "";
      aInput.value = "";
      cSelect.value = db.categories[0] || "常見問題";
      tInput.value = "";
      sInput.value = db.name;
    }

    modal.classList.add("active");
  }

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove("active");
    this.currentEditingItemId = null;
    this.currentEditingDbId = null;
  }

  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = `${type === "success" ? "✅ " : "⚠️ "}${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  initEventListeners() {
    // 後台分頁切換
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        
        document.getElementById("tab-db-panel").style.display = tab === "db" ? "flex" : "none";
        document.getElementById("tab-kb-panel").style.display = tab === "kb" ? "flex" : "none";
        document.getElementById("tab-tags-panel").style.display = tab === "tags" ? "flex" : "none";
        document.getElementById("tab-stats-panel").style.display = tab === "stats" ? "flex" : "none";
        document.getElementById("tab-security-panel").style.display = tab === "security" ? "flex" : "none";
        
        if (tab === "db") this.renderDatabaseList();
        if (tab === "kb") this.renderActiveDbContent();
        if (tab === "tags") this.renderTagsCloud();
        if (tab === "stats") { this.renderStats(); this.refreshFirebaseStats(); }
      });
    });

    // 後台解鎖密碼表單送出
    document.getElementById("admin-auth-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("admin-password-input");
      const errorEl = document.getElementById("admin-auth-error");
      const enteredPwd = input.value.trim();
      const correctPwd = this.getAdminPassword();

      if (enteredPwd === correctPwd) {
        this.isAdminUnlocked = true;
        this.closeModal("admin-auth-modal");
        if (errorEl) errorEl.style.display = "none";
        
        if (typeof this.pendingAdminAction === "function") {
          this.pendingAdminAction();
          this.pendingAdminAction = null;
        }
        this.showToast("🔓 安全驗證通過，已進入後台！", "success");
      } else {
        if (errorEl) errorEl.style.display = "block";
        input.value = "";
        input.focus();
        input.style.borderColor = "#c62828";
        setTimeout(() => { input.style.borderColor = ""; }, 1500);
      }
    });

    // 修改密碼表單送出
    document.getElementById("change-pwd-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const oldPwd = document.getElementById("old-pwd-input").value.trim();
      const newPwd = document.getElementById("new-pwd-input").value.trim();
      const confirmPwd = document.getElementById("confirm-pwd-input").value.trim();
      const currentPwd = this.getAdminPassword();

      if (oldPwd !== currentPwd) {
        alert("目前密碼輸入錯誤，請重新輸入！");
        document.getElementById("old-pwd-input").focus();
        return;
      }

      if (newPwd.length < 4) {
        alert("新密碼長度請至少輸入 4 碼！");
        document.getElementById("new-pwd-input").focus();
        return;
      }

      if (newPwd !== confirmPwd) {
        alert("兩次輸入的新密碼不相符，請確認後重試！");
        document.getElementById("confirm-pwd-input").focus();
        return;
      }

      this.setAdminPassword(newPwd);
      document.getElementById("old-pwd-input").value = "";
      document.getElementById("new-pwd-input").value = "";
      document.getElementById("confirm-pwd-input").value = "";
      this.showToast("✅ 管理密碼已成功更新！請妥善保存新密碼。", "success");
    });

    // 關閉後台時自動上鎖
    document.getElementById("btn-close-admin")?.addEventListener("click", () => {
      this.lockAdmin();
    });

    // 搜尋與分類過濾
    const sInput = document.getElementById("admin-search-input");
    const cFilter = document.getElementById("admin-category-filter");
    if (sInput) sInput.addEventListener("input", () => this.renderActiveDbContent(sInput.value, cFilter ? cFilter.value : "ALL"));
    if (cFilter) cFilter.addEventListener("change", () => this.renderActiveDbContent(sInput ? sInput.value : "", cFilter.value));

    // 按鈕綁定
    document.getElementById("btn-sync-local-files-1")?.addEventListener("click", () => this.syncFromLocalFiles());
    document.getElementById("btn-sync-local-files-2")?.addEventListener("click", () => this.syncFromLocalFiles());
    document.getElementById("btn-create-db-open")?.addEventListener("click", () => this.openCreateDbModal());
    document.getElementById("btn-add-item")?.addEventListener("click", () => this.openEditItemModal());
    document.getElementById("btn-export-active-db")?.addEventListener("click", () => this.exportActiveDatabase());
    document.getElementById("btn-export-excel")?.addEventListener("click", () => this.exportActiveDbToExcel());
    document.getElementById("btn-import-json-open")?.addEventListener("click", () => document.getElementById("json-modal")?.classList.add("active"));
    document.getElementById("btn-export-stats")?.addEventListener("click", () => this.exportStatsReport());
    document.getElementById("btn-reset-stats")?.addEventListener("click", () => this.resetStatsData());
    document.getElementById("btn-refresh-firebase-stats")?.addEventListener("click", () => this.refreshFirebaseStats());

    // Excel 匯入
    const excelBtn = document.getElementById("btn-import-excel");
    const fileInput = document.getElementById("excel-file-input");
    if (excelBtn && fileInput) {
      excelBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        if (e.target.files[0]) {
          this.importExcelToActiveDb(e.target.files[0]);
          fileInput.value = "";
        }
      });
    }

    // JSON 匯入確認
    document.getElementById("btn-confirm-import-json")?.addEventListener("click", () => {
      const text = document.getElementById("json-import-textarea").value.trim();
      if (this.importDatabaseJSON(text)) {
        this.closeModal("json-modal");
        document.getElementById("json-import-textarea").value = "";
      }
    });

    // 資料庫表單送出
    document.getElementById("db-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("db-name-input").value.trim();
      const description = document.getElementById("db-desc-input").value.trim();
      const categories = document.getElementById("db-cats-input").value.trim();

      if (this.currentEditingDbId) {
        this.updateDatabaseInfo(this.currentEditingDbId, { name, description });
      } else {
        this.createDatabase({ name, description, categories });
      }
      this.closeModal("db-modal");
    });

    // 問答表單送出
    document.getElementById("item-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const itemData = {
        question: document.getElementById("item-question").value.trim(),
        answer: document.getElementById("item-answer").value.trim(),
        category: document.getElementById("item-category").value,
        tags: document.getElementById("item-tags").value.split(/[,，、]/).map(t => t.trim()).filter(Boolean),
        source: document.getElementById("item-source").value.trim() || this.getActiveDatabase().name,
        confidence: 0.95
      };
      this.saveItem(itemData);
      this.closeModal("item-modal");
    });
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

  // 刷新 Firebase 統計（訪問數 + 問題件數排行）
  async refreshFirebaseStats() {
    const statusEl = document.getElementById("firebase-stats-status");
    const questionBlock = document.getElementById("firebase-question-stats-block");


    if (!window.Tracker) {
      if (statusEl) statusEl.textContent = "⚠️ tracker.js 尚未載入";
      return;
    }

    if (statusEl) statusEl.textContent = "🔄 連線 Firebase 中...";

    // 讀取訪問統計
    const visitStats = await window.Tracker.getVisitStats();
    const todayEl = document.getElementById("fb-stat-today");
    const totalEl = document.getElementById("fb-stat-total");
    const mobileEl = document.getElementById("fb-stat-mobile");
    const desktopEl = document.getElementById("fb-stat-desktop");

    if (visitStats.total === 0 && visitStats.today === 0 && visitStats.mobile === 0) {
      // 可能尚未設定 Firebase 或無資料
      if (statusEl) statusEl.textContent = "⚠️ 尚未設定 Firebase 或無訪問資料";
    } else {
      if (todayEl) todayEl.textContent = visitStats.today;
      if (totalEl) totalEl.textContent = visitStats.total;
      if (mobileEl) mobileEl.textContent = visitStats.mobile;
      if (desktopEl) desktopEl.textContent = visitStats.desktop;
      const now = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      if (statusEl) statusEl.textContent = `✅ 已同步（${now}）`;
    }

    // 讀取問題件數統計
    const questionStats = await window.Tracker.getQuestionStats();
    if (questionStats.length > 0 && questionBlock) {
      questionBlock.style.display = "block";

      const badge = document.getElementById("fb-question-total-badge");
      const totalQuestions = questionStats.reduce((sum, q) => sum + (q.count || 0), 0);
      if (badge) badge.textContent = `共 ${totalQuestions} 次提問`;

      const tbody = document.getElementById("firebase-question-tbody");
      if (tbody) {
        tbody.innerHTML = questionStats.slice(0, 50).map((q, i) => {
          const hitRate = q.count > 0
            ? Math.round(((q.matched || 0) / q.count) * 100)
            : 0;
          const lastAsked = q.lastAsked
            ? new Date(q.lastAsked).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
            : "—";
          const rankColor = i === 0 ? "#e65100" : i === 1 ? "#ad1457" : i === 2 ? "#1565c0" : "var(--text-muted)";
          const rankBg = i < 3 ? "#fff8e1" : "transparent";
          return `
            <tr style="border-bottom:1px solid #f0f0f0; background:${rankBg};">
              <td style="padding:6px 8px; font-weight:800; color:${rankColor};">${i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}</td>
              <td style="padding:6px 8px; font-weight:600; color:var(--text-dark); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(q.question || q.key)}</td>
              <td style="padding:6px 8px; text-align:center; font-weight:800; color:var(--primary-teal); font-size:14px;">${q.count}</td>
              <td style="padding:6px 8px; text-align:center;">
                <span style="background:${hitRate >= 80 ? "#e8f5e9" : hitRate >= 50 ? "#fff8e1" : "#ffebee"}; color:${hitRate >= 80 ? "#2e7d32" : hitRate >= 50 ? "#e65100" : "#c62828"}; padding:2px 6px; border-radius:6px; font-weight:700; font-size:11px;">${hitRate}%</span>
              </td>
              <td style="padding:6px 8px; text-align:right; font-size:11px; color:var(--text-muted);">${lastAsked}</td>
            </tr>
          `;
        }).join("");
      }
    }
  }

}

// 實例化
function initAdminManager() {
  if (!window.adminMgr) {
    window.adminMgr = new DatabaseManager();
  }
}
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initAdminManager);
} else {
  initAdminManager();
}
