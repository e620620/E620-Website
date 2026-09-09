/**
 * 📊 智能問答助手 - 訪問與問題統計追蹤模組 (REST API 輕量高併發版)
 * 方案 C：Google Analytics 4 + Firebase Realtime Database (REST API)
 *
 * 特色：
 * 1. 突破 Firebase Spark 免費版 100 人長連線限制（改用 HTTP REST API，請求完即斷開，不佔連線數）。
 * 2. 免載入肥大的 Firebase SDK，提升網頁加載速度與省電。
 * 3. 完美支援 GA4 雙軌追蹤。
 */

// ============================================================
//  ⚙️ Firebase 設定
//  建立 Realtime Database 後，將資料庫網址貼在 databaseURL 即可！
//  例如: "https://e620-qa-tracker-default-rtdb.asia-southeast1.firebasedatabase.app"
// ============================================================
const FIREBASE_CONFIG = {
  databaseURL: "https://e620-qa-tracker-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// ============================================================
//  ⚙️ Google Analytics 4 設定
// ============================================================
const GA4_MEASUREMENT_ID = "G-XXXXXXXXXX";

// ============================================================
//  內部工具函式
// ============================================================

/** 將問題文字轉為 Firebase 安全 key（移除不允許字元） */
function _encodeKey(str) {
  return (str || "")
    .replace(/[.#$[\]/]/g, "_")
    .substring(0, 100)
    .trim() || "unknown";
}

/** 偵測裝置類型 */
function _detectDevice() {
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

/** 安全地呼叫 gtag（GA4 事件） */
function _gtag(...args) {
  if (typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

/** 檢查是否已設定有效的 Firebase URL */
function _isValidDbUrl() {
  return FIREBASE_CONFIG.databaseURL && 
         !FIREBASE_CONFIG.databaseURL.includes("YOUR_PROJECT") &&
         FIREBASE_CONFIG.databaseURL.startsWith("https://");
}

/** 格式化 Firebase URL 去除末尾斜線 */
function _getBaseUrl() {
  return FIREBASE_CONFIG.databaseURL.replace(/\/+$/, "");
}

// ============================================================
//  公開 API (REST API 實作)
// ============================================================

const Tracker = {

  /**
   * 記錄訪問事件
   * 透過 POST 請求寫入 /visits.json
   */
  async recordVisit() {
    // 1. GA4 訪問事件
    _gtag("event", "page_visit", {
      device_type: _detectDevice(),
      page_title: document.title || "智能問答助手"
    });

    // 2. Firebase REST API
    if (!_isValidDbUrl()) return;

    try {
      const payload = {
        time: new Date().toISOString(),
        device: _detectDevice(),
        ua: navigator.userAgent.substring(0, 150)
      };

      // 使用 fetch POST，自動產生唯一的 push ID，連線在瞬間完成釋放
      fetch(`${_getBaseUrl()}/visits.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(err => console.warn("[Tracker] recordVisit fetch error:", err));
    } catch (e) {
      console.warn("[Tracker] recordVisit exception:", e.message);
    }
  },

  /**
   * 記錄提問事件並累計件數
   * 先讀取目前的計數，再寫回（REST API 輕量更新）
   */
  async recordQuestion(query, matched, matchedItem = null) {
    if (!query || !query.trim()) return;
    const trimmed = query.trim();

    // 1. GA4 提問事件
    _gtag("event", "question_asked", {
      question_text: trimmed.substring(0, 100),
      matched: matched ? "yes" : "no",
      matched_category: matchedItem ? (matchedItem.category || "") : "",
      matched_question: matchedItem ? (matchedItem.question || "").substring(0, 100) : ""
    });

    // 2. Firebase REST API
    if (!_isValidDbUrl()) return;

    // 🌟 關鍵優化：命中解答時，統一以「題庫標準問題名稱」作為累計 Key！
    // 這樣不同病人問同一件事（例如「想請假」、「可以外出嗎」），都會合併計入「請問住院期間可以請假外出嗎？」
    const targetQuestionTitle = (matched && matchedItem && matchedItem.question) 
      ? matchedItem.question.trim() 
      : trimmed;

    const key = _encodeKey(targetQuestionTitle);
    const itemUrl = `${_getBaseUrl()}/questions/${encodeURIComponent(key)}.json`;

    try {
      // 讀取當前紀錄
      const res = await fetch(itemUrl);
      let current = null;
      if (res.ok) {
        current = await res.json();
      }

      const updated = {
        question: targetQuestionTitle,
        category: matchedItem ? (matchedItem.category || "") : "",
        count: ((current && current.count) || 0) + 1,
        matched: ((current && current.matched) || 0) + (matched ? 1 : 0),
        unmatched: ((current && current.unmatched) || 0) + (matched ? 0 : 1),
        lastAsked: new Date().toISOString()
      };

      // 用 PUT 覆蓋更新此題的累計數
      fetch(itemUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch(err => console.warn("[Tracker] recordQuestion update error:", err));

      // 3. 另外寫入原始流水帳紀錄 (/query_logs.json)，儲存每一位民眾問的確切文字
      const logPayload = {
        time: new Date().toISOString(),
        raw_query: trimmed,
        matched: !!matched,
        matched_question: matchedItem ? (matchedItem.question || "") : "",
        matched_category: matchedItem ? (matchedItem.category || "") : "",
        device: _detectDevice()
      };

      fetch(`${_getBaseUrl()}/query_logs.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logPayload)
      }).catch(err => console.warn("[Tracker] query_logs push error:", err));

    } catch (e) {
      console.warn("[Tracker] recordQuestion exception:", e.message);
    }
  },

  /**
   * 讀取問題統計（供後台管理頁顯示）
   */
  async getQuestionStats() {
    if (!_isValidDbUrl()) return [];

    try {
      const res = await fetch(`${_getBaseUrl()}/questions.json`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data) return [];

      const result = Object.keys(data).map(k => ({
        key: k,
        ...data[k]
      }));

      // 依 count 降序排列
      return result.sort((a, b) => (b.count || 0) - (a.count || 0));
    } catch (e) {
      console.warn("[Tracker] getQuestionStats failed:", e.message);
      return [];
    }
  },

  /**
   * 讀取訪問統計摘要
   */
  async getVisitStats() {
    if (!_isValidDbUrl()) return { total: 0, today: 0, mobile: 0, desktop: 0 };

    try {
      const res = await fetch(`${_getBaseUrl()}/visits.json`);
      if (!res.ok) return { total: 0, today: 0, mobile: 0, desktop: 0 };
      const data = await res.json();
      if (!data) return { total: 0, today: 0, mobile: 0, desktop: 0 };

      const today = new Date().toISOString().substring(0, 10);
      let total = 0, todayCount = 0, mobile = 0, desktop = 0;

      Object.values(data).forEach(v => {
        if (!v) return;
        total++;
        if ((v.time || "").startsWith(today)) todayCount++;
        if (v.device === "mobile") mobile++;
        else desktop++;
      });

      return { total, today: todayCount, mobile, desktop };
    } catch (e) {
      console.warn("[Tracker] getVisitStats failed:", e.message);
      return { total: 0, today: 0, mobile: 0, desktop: 0 };
    }
  },

  /**
   * 讀取全體民眾歷史原始提問流水帳清單 (依時間倒序)
   */
  async getQueryLogs() {
    if (!_isValidDbUrl()) return [];

    try {
      const res = await fetch(`${_getBaseUrl()}/query_logs.json`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data) return [];

      const list = Object.keys(data).map(k => ({
        id: k,
        ...data[k]
      }));

      // 依照提問時間倒序排列（最新提問在最上面）
      return list.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    } catch (e) {
      console.warn("[Tracker] getQueryLogs failed:", e.message);
      return [];
    }
  }
};

window.Tracker = Tracker;
