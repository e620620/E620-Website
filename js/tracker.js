/**
 * 📊 智能問答助手 - 訪問與問題統計追蹤模組
 * 方案 C：Google Analytics 4 + Firebase Realtime Database
 *
 * 功能：
 * 1. recordVisit()      - 記錄每次訪問（時間、裝置類型）
 * 2. recordQuestion()   - 記錄每次提問並累計件數
 * 3. getQuestionStats() - 讀取問題統計供後台顯示
 */

// ============================================================
//  ⚙️ Firebase 設定（請填入您的 Firebase 專案設定）
//  建立方式：https://console.firebase.google.com/
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ============================================================
//  ⚙️ Google Analytics 4 設定
//  取得方式：https://analytics.google.com/ → 管理 → 資料串流
// ============================================================
const GA4_MEASUREMENT_ID = "G-XXXXXXXXXX"; // 請替換為您的衡量 ID

// ============================================================
//  內部工具函式
// ============================================================

/** 將問題文字轉為 Firebase 安全 key（移除不允許字元） */
function _encodeKey(str) {
  return (str || "")
    .replace(/[.#$[\]/]/g, "_")
    .substring(0, 120) // Firebase key 最長 768B，中文安全截 120 字
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

// ============================================================
//  Firebase 初始化（Compat SDK，從 CDN 載入）
// ============================================================
let _db = null; // Firebase Database 實例

function _initFirebase() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve) => {
    // 等待 Firebase SDK 載入
    const check = () => {
      if (window.firebase && window.firebase.database) {
        try {
          // 避免重複初始化
          if (!window.firebase.apps || window.firebase.apps.length === 0) {
            window.firebase.initializeApp(FIREBASE_CONFIG);
          }
          _db = window.firebase.database();
          resolve(_db);
        } catch (e) {
          console.warn("[Tracker] Firebase 初始化失敗:", e.message);
          resolve(null);
        }
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

// ============================================================
//  公開 API
// ============================================================

const Tracker = {

  /**
   * 記錄訪問事件
   * 在 Firebase: /visits/{pushId} = { time, device }
   * 在 GA4: event "page_visit"
   */
  async recordVisit() {
    // GA4 訪問（pageview 會自動記錄，此處額外送裝置類型）
    _gtag("event", "visit", {
      device_type: _detectDevice(),
      page_title:  "智能問答助手"
    });

    // Firebase
    const db = await _initFirebase();
    if (!db) return;

    try {
      await db.ref("visits").push({
        time:   new Date().toISOString(),
        device: _detectDevice(),
        ua:     navigator.userAgent.substring(0, 200)
      });
    } catch (e) {
      console.warn("[Tracker] recordVisit 寫入失敗:", e.message);
    }
  },

  /**
   * 記錄提問事件
   * @param {string}  query      - 使用者輸入的問題
   * @param {boolean} matched    - 是否命中知識庫
   * @param {object}  matchedItem - 命中的知識庫條目（可選）
   *
   * 在 Firebase: /questions/{encodedQuery}/count++
   * 在 GA4: event "question_asked"
   */
  async recordQuestion(query, matched, matchedItem = null) {
    if (!query || !query.trim()) return;

    const trimmed = query.trim();

    // GA4 事件
    _gtag("event", "question_asked", {
      question_text:     trimmed.substring(0, 100),
      matched:           matched ? "yes" : "no",
      matched_category:  matchedItem ? (matchedItem.category || "") : "",
      matched_question:  matchedItem ? (matchedItem.question  || "").substring(0, 100) : ""
    });

    // Firebase：對問題計數 +1（使用 transaction 確保並發安全）
    const db = await _initFirebase();
    if (!db) return;

    const key = _encodeKey(trimmed);
    const ref = db.ref(`questions/${key}`);

    try {
      await ref.transaction((current) => {
        if (current === null) {
          // 第一次被問到
          return {
            question:  trimmed,
            count:     1,
            matched:   matched ? 1 : 0,
            unmatched: matched ? 0 : 1,
            lastAsked: new Date().toISOString()
          };
        } else {
          // 累加
          return {
            ...current,
            count:     (current.count || 0) + 1,
            matched:   (current.matched   || 0) + (matched ? 1 : 0),
            unmatched: (current.unmatched || 0) + (matched ? 0 : 1),
            lastAsked: new Date().toISOString()
          };
        }
      });
    } catch (e) {
      console.warn("[Tracker] recordQuestion 寫入失敗:", e.message);
    }
  },

  /**
   * 讀取問題統計（供後台管理頁顯示）
   * @returns {Promise<Array>} 依問題提問次數排序的陣列
   */
  async getQuestionStats() {
    const db = await _initFirebase();
    if (!db) return [];

    try {
      const snap = await db.ref("questions")
        .orderByChild("count")
        .limitToLast(100)
        .once("value");

      const result = [];
      snap.forEach((child) => {
        result.push({ key: child.key, ...child.val() });
      });

      // 依 count 降序排列
      return result.sort((a, b) => (b.count || 0) - (a.count || 0));
    } catch (e) {
      console.warn("[Tracker] getQuestionStats 讀取失敗:", e.message);
      return [];
    }
  },

  /**
   * 讀取訪問統計摘要
   * @returns {Promise<{total, today, mobile, desktop}>}
   */
  async getVisitStats() {
    const db = await _initFirebase();
    if (!db) return { total: 0, today: 0, mobile: 0, desktop: 0 };

    try {
      const snap = await db.ref("visits").once("value");
      const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
      let total = 0, todayCount = 0, mobile = 0, desktop = 0;

      snap.forEach((child) => {
        const v = child.val();
        total++;
        if ((v.time || "").startsWith(today)) todayCount++;
        if (v.device === "mobile") mobile++;
        else desktop++;
      });

      return { total, today: todayCount, mobile, desktop };
    } catch (e) {
      console.warn("[Tracker] getVisitStats 讀取失敗:", e.message);
      return { total: 0, today: 0, mobile: 0, desktop: 0 };
    }
  }
};

window.Tracker = Tracker;
