import React, { useState, useMemo, useEffect } from 'react';
import {
  Gift, Users, Sparkles, ShieldAlert, Heart, HeartOff,
  MessageSquarePlus, Lock, Unlock, CheckCircle2, Clock,
  Copy, Plus, Trash2, RefreshCw, Eye, EyeOff, Wand2,
  AlertTriangle, PartyPopper, ChevronRight, UserCheck,
  DollarSign, Calendar, Info, HelpCircle, Share2, Shuffle,
  Cloud, CloudOff, LogIn, FolderPlus, KeyRound, Check,
  Trees, Snowflake, Flame, Bell, Star, Award
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection
} from 'firebase/firestore';

// ==========================================
// 0. 雲端資料庫與外部部署設定 (支援 Canvas 預覽 + Vercel 獨立部署)
// ==========================================
// 💡 【部署至 Vercel 時請填入您的 Firebase 設定】
// 若在 Gemini Canvas 內使用則不需修改，系統會自動連線。
const EXTERNAL_FIREBASE_CONFIG = {
  apiKey: "",            // 例如: "AIzaSyD..."
  authDomain: "",        // 例如: "my-santa-app.firebaseapp.com"
  projectId: "",         // 例如: "my-santa-app"
  storageBucket: "",     // 例如: "my-santa-app.appspot.com"
  messagingSenderId: "", // 例如: "1234567890"
  appId: ""              // 例如: "1:123456:web:abcdef"
};

// 💡 【部署至 Vercel 時可選填您的免費 Gemini API Key】
const EXTERNAL_GEMINI_API_KEY = "";

const firebaseConfig = {
  apiKey: "AIzaSyAOXug4V1qWjzncIoubWSA2orUdXWM5pKU",
  authDomain: "christmas-31f31.firebaseapp.com",
  projectId: "christmas-31f31",
  storageBucket: "christmas-31f31.firebasestorage.app",
  messagingSenderId: "958528922808",
  appId: "1:958528922808:web:eab377a5ae451d14aac04d",
  measurementId: "G-PB965648KH"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'secret-santa-prod-v1';

// ==========================================
// 1. 核心防死結抽籤演算法 (Backtracking Derangement with Constraints)
// ==========================================
function generateSecretSantaPairings(participants) {
  const n = participants.length;
  if (n < 2) {
    return {
      success: false,
      error: '參與人數不足，至少需要 2 人才能進行交換禮物！'
    };
  }

  // 建立每個人的可用收禮對象清單 (排除自己、排除指定的避開對象/伴侶)
  const validReceiversMap = new Map();
  for (const giver of participants) {
    const valid = participants
      .filter(receiver => {
        if (receiver.id === giver.id) return false; // 絕對不能抽到自己
        if (giver.excludedId && receiver.id === giver.excludedId) return false; // 避開指定伴侶 (單向或雙向皆攔截)
        if (receiver.excludedId && receiver.excludedId === giver.id) return false; // 若對方設定避開自己，也一併保護
        return true;
      })
      .map(r => r.id);

    if (valid.length === 0) {
      return {
        success: false,
        error: `「${giver.name}」在扣除自己與避開對象後，已無任何可配對的人選！請增加參與人數或調整避開設定。`
      };
    }
    validReceiversMap.set(giver.id, valid);
  }

  // 啟發式優化：將「可選對象最少（限制最多）」的人排在前面優先配對，加速回溯收斂
  const sortedGivers = [...participants].sort(
    (a, b) => validReceiversMap.get(a.id).length - validReceiversMap.get(b.id).length
  );

  // Fisher-Yates 洗牌演算法，確保每次抽籤結果完全隨機且公平
  const shuffle = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const result = new Map(); // giverId -> receiverId
  const usedReceivers = new Set();

  // 遞迴回溯搜尋 (DFS Backtracking)
  const backtrack = (index) => {
    if (index === n) {
      return true; // 全員成功配對！
    }

    const currentGiver = sortedGivers[index];
    const candidates = shuffle(validReceiversMap.get(currentGiver.id));

    for (const candidateId of candidates) {
      if (!usedReceivers.has(candidateId)) {
        result.set(currentGiver.id, candidateId);
        usedReceivers.add(candidateId);

        if (backtrack(index + 1)) {
          return true;
        }

        // 退回上一步 (Backtrack)
        result.delete(currentGiver.id);
        usedReceivers.delete(candidateId);
      }
    }

    return false;
  };

  const isSuccess = backtrack(0);

  if (!isSuccess) {
    return {
      success: false,
      error: '偵測到配對死結（Deadlock）！例如：人數過少且多對情侶互相避開，導致數學上無法滿足全員錯位排列。請新增參與者或解除部分避開限制。'
    };
  }

  return {
    success: true,
    pairings: Object.fromEntries(result)
  };
}

// ==========================================
// 2. Gemini AI 智慧模糊化助手 API (含指數退避與降級保護)
// ==========================================
async function obfuscateWishlistWithAI(rawText, budgetRange) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const systemPrompt = `你是一位幽默、有創意且溫暖的「聖誕交換禮物心願潤飾大師」。
使用者的任務是填寫交換禮物心願，但直接寫出具體商品（如「AirPods Pro」、「Marshall 喇叭」、「Diptyque 蠟燭」）會失去拆禮物的驚喜感。
請將使用者輸入的「具體願望或興趣」，轉化為 2 到 3 句充滿北歐聖誕溫馨感、生活風格描述、且帶點幽默趣味的「模糊化線索指南」。
規則：
1. 絕對不要直接說出原本的品牌名稱或精確型號。
2. 描述它的使用情境、外觀質感、帶來的感受（例如把「iPhone 16」轉化為「能捕捉生活光影、提升日常效率的隨身科技黑盒子」）。
3. 參考房間預算範圍（${budgetRange}），讓提示聽起來合理又令人期待。
4. 使用繁體中文（台灣習慣用語），字數控制在 80 字以內，直接輸出潤飾後的文字即可，不需前後引號或解釋。`;

  const payload = {
    contents: [{ parts: [{ text: `請幫我模糊化這個交換禮物心願：「${rawText}」` }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim();
      throw new Error('Empty AI response');
    } catch (err) {
      if (attempt === delays.length) {
        // 優雅降級範例，確保使用者體驗不中斷
        return `✨ 想要一個能為冬日生活注入溫暖儀式感的質感好物！它可能跟「${rawText.slice(0, 4)}...」的領域有點關係，適合在微涼夜晚陪伴我，期待聖誕老人的驚喜挑選！`;
      }
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
}

// ==========================================
// 3. 預設豐富模擬資料 (方便立即測試所有情境)
// ==========================================
const AVATAR_OPTIONS = ['🎅', '🦌', '⛄', '🎄', '🧝', '🦊', '🐻‍❄️', '🐧', '🦉', '🍪'];

const INITIAL_PARTICIPANTS = [
  {
    id: 'u1',
    name: '小傑 (主辦人)',
    avatar: '🎅',
    isHost: true,
    excludedId: 'u2', // 與小美是情侶，互相避開
    isReady: true,
    wishlist: '最近迷上手沖咖啡與冬日露營，希望收到能提升早晨醒腦儀式感、或是戶外野營時用得到的溫潤木質/金屬質感小物！',
    blacklist: '一般印字馬克杯、星巴克禮券、過期咖啡豆',
  },
  {
    id: 'u2',
    name: '小美',
    avatar: '🦌',
    isHost: false,
    excludedId: 'u1', // 與小傑是情侶，互相避開
    isReady: true,
    wishlist: '下班後喜歡窩在沙發看書追劇，想要能讓房間充滿北歐木質香氣、或是冬天抱起來超級療癒柔軟的居家放鬆神器～',
    blacklist: '護手霜禮盒（家裡還有十條）、絨毛大玩偶、甜膩果香蠟燭',
  },
  {
    id: 'u3',
    name: '阿凱',
    avatar: '⛄',
    isHost: false,
    excludedId: 'u4', // 與琳琳是情侶
    isReady: true,
    wishlist: '身為每天盯著雙螢幕的工程師，渴望能拯救肩頸痠痛、或是讓辦公桌面看起來更極簡酷炫的深色系科技配件！',
    blacklist: '滑鼠墊、奇怪造型隨身碟、心靈雞湯書籍',
  },
  {
    id: 'u4',
    name: '琳琳',
    avatar: '🎄',
    isHost: false,
    excludedId: 'u3', // 與阿凱是情侶
    isReady: true,
    wishlist: '喜歡底片相機與復古文具，希望收到帶點老派浪漫、能記錄生活片刻或是擺在桌上看了心情就會很好的設計感小物。',
    blacklist: '千片拼圖、相框、快時尚塑膠飾品',
  },
  {
    id: 'u5',
    name: '大衛',
    avatar: '🦊',
    isHost: false,
    excludedId: '', // 單身貴族，無避開限制
    isReady: false, // 預設尚未完成填寫，方便展示狀態機轉換
    wishlist: '週末喜歡下廚研究熱紅酒與異國料理，也愛小酌一杯威士忌，期待能讓餐桌或吧台升級的實用道具！',
    blacklist: '造型製冰盒、普通開瓶器、搞笑圍裙',
  }
];

const INITIAL_SUGGESTIONS = [
  { id: 's1', targetUserId: 'u1', content: '他上次露營把磨豆機摔壞了，送他手搖磨豆機或鈦金屬露營杯準沒錯！', tag: '實用情報' },
  { id: 's2', targetUserId: 'u1', content: '拜託誰抽到他送他一個超浮誇的聖誕麋鹿發光毛衣，他聚餐說想穿 🤣', tag: '幽默惡搞' },
  { id: 's3', targetUserId: 'u2', content: '她最近超愛木質調（雪松、檀香），送融蠟燈或擴香石她一定會尖叫！', tag: '閨蜜線報' },
  { id: 's4', targetUserId: 'u3', content: '工程師最缺螢幕掛燈或人體工學暖腳墊，千萬別送鍵盤他自己有五把了。', tag: '避雷指南' },
  { id: 's5', targetUserId: 'u4', content: '推薦復古翻頁鐘或是即可拍底片相機組合，完全長在她的審美上！', tag: '精準推坑' },
  { id: 's6', targetUserId: 'u5', content: '日本製的料理溫度計或是質感香料研磨罐，他煮熱紅酒跟牛排時超需要！', tag: '吃貨情報' },
];

const DEFAULT_ROOM_INFO = {
  name: '🎄 2026 北歐冬夜・秘密聖誕老人交換禮物',
  code: 'SANTA-888',
  budget: 'NT$ 800 ~ 1,200',
  eventDate: '2026-12-25 19:30',
  allowForceDraw: false,
  strictPrivacyMode: false, // true 時隱藏頂部測試切換器，進入正式派對防偷看模式
};

// 靜謐飄雪粒子設定 (不干擾操作的優雅背景點綴)
const SNOWFLAKES = [
  { left: '6%', size: 5, duration: '18s', delay: '0s', opacity: 0.25 },
  { left: '16%', size: 8, duration: '24s', delay: '3s', opacity: 0.18 },
  { left: '28%', size: 4, duration: '16s', delay: '7s', opacity: 0.3 },
  { left: '42%', size: 7, duration: '22s', delay: '1s', opacity: 0.2 },
  { left: '58%', size: 5, duration: '19s', delay: '5s', opacity: 0.25 },
  { left: '72%', size: 9, duration: '26s', delay: '2s', opacity: 0.15 },
  { left: '84%', size: 4, duration: '17s', delay: '6s', opacity: 0.28 },
  { left: '93%', size: 6, duration: '21s', delay: '4s', opacity: 0.22 },
];

// ==========================================
// 4. 主應用程式組件
// ==========================================
export default function SecretSantaApp() {
  // 雲端認證與連線狀態
  const [user, setUser] = useState(null);
  const [activeRoomCode, setActiveRoomCode] = useState('SANTA-888');
  const [cloudRoomList, setCloudRoomList] = useState([]);
  const [isSyncing, setIsSyncing] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // 房間基本設定與狀態機: 'WAITING_FOR_SUBMISSION' | 'READY_TO_DRAW' | 'DRAWN_AND_REVEALED'
  const [roomInfo, setRoomInfo] = useState(DEFAULT_ROOM_INFO);
  const [participants, setParticipants] = useState(INITIAL_PARTICIPANTS);
  const [suggestions, setSuggestions] = useState(INITIAL_SUGGESTIONS);
  const [pairings, setPairings] = useState(null); // { [giverId]: receiverId }
  const [currentUserId, setCurrentUserId] = useState('u1');
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'profile' | 'suggestions' | 'reveal'

  // UI 互動狀態
  const [toast, setToast] = useState(null);
  const [drawError, setDrawError] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBoxOpened, setIsBoxOpened] = useState(false); // 拆禮物動畫狀態
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [ambientSnow, setAmbientSnow] = useState(true); // 靜謐冬雪特效開關

  // 新增參與者表單狀態
  const [newUserName, setNewUserName] = useState('');
  const [newUserAvatar, setNewUserAvatar] = useState('🐧');

  // 建立或切換房間表單狀態
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomBudget, setNewRoomBudget] = useState('NT$ 500 ~ 1,000');
  const [newRoomDate, setNewRoomDate] = useState('2026-12-25 20:00');
  const [newHostName, setNewHostName] = useState('');

  // 匿名靈感表單狀態
  const [selectedTargetId, setSelectedTargetId] = useState('u2');
  const [suggestionInput, setSuggestionInput] = useState('');
  const [suggestionTag, setSuggestionTag] = useState('實用情報');

  // 顯示輕量提示訊息 (取代原生 alert)
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ==========================================
  // 雲端步驟 1: 驗證使用者連線身分
  // ==========================================
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // ==========================================
  // 雲端步驟 2: 監聽公開房間清單與當前房間資料即時同步
  // ==========================================
  useEffect(() => {
    if (!user) return;
    setIsSyncing(true);

    // 監聽所有可用房間清單
    const roomsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms');
    const unsubRoomsList = onSnapshot(
      roomsColRef,
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.roomInfo) {
            list.push({
              code: docSnap.id,
              name: data.roomInfo.name,
              participantCount: (data.participants || []).length,
              hasDrawn: Boolean(data.pairings)
            });
          }
        });
        setCloudRoomList(list);
      },
      (err) => {
        console.error('Error listening to room list:', err);
      }
    );

    // 監聽目前所在的房間文件
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
    const unsubCurrentRoom = onSnapshot(
      roomDocRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.roomInfo) setRoomInfo(data.roomInfo);
          if (data.participants) {
            setParticipants(data.participants);
            const boundParticipant = data.participants.find(p => p.boundUid === user.uid);
            setCurrentUserId(prevId => {
              if (data.participants.some(p => p.id === prevId)) return prevId;
              if (boundParticipant) return boundParticipant.id;
              return data.participants[0]?.id || 'u1';
            });
          }
          if (data.suggestions) setSuggestions(data.suggestions);
          setPairings(data.pairings || null);
          setLastSyncedAt(new Date().toLocaleTimeString());
          setIsSyncing(false);
        } else {
          // 若預設房間尚未在雲端建立，自動將初始示範資料寫入雲端
          const seedData = {
            roomInfo: { ...DEFAULT_ROOM_INFO, code: activeRoomCode },
            participants: INITIAL_PARTICIPANTS,
            suggestions: INITIAL_SUGGESTIONS,
            pairings: null,
            updatedAt: Date.now()
          };
          try {
            await setDoc(roomDocRef, seedData);
            setIsSyncing(false);
          } catch (e) {
            console.error('Error seeding initial room:', e);
            setIsSyncing(false);
          }
        }
      },
      (err) => {
        console.error('Error listening to current room:', err);
        setIsSyncing(false);
      }
    );

    return () => {
      unsubRoomsList();
      unsubCurrentRoom();
    };
  }, [user, activeRoomCode]);

  // 封裝雲端寫入函式：確保每次修改皆同步至雲端供所有人即時看到
  const syncRoomToCloud = async (partialData) => {
    if (!user) return;
    setIsSyncing(true);
    const nextRoomInfo = partialData.roomInfo !== undefined ? partialData.roomInfo : roomInfo;
    const nextParticipants = partialData.participants !== undefined ? partialData.participants : participants;
    const nextSuggestions = partialData.suggestions !== undefined ? partialData.suggestions : suggestions;
    const nextPairings = partialData.pairings !== undefined ? partialData.pairings : pairings;

    // 樂觀更新本地狀態，提供零延遲手感
    if (partialData.roomInfo !== undefined) setRoomInfo(nextRoomInfo);
    if (partialData.participants !== undefined) setParticipants(nextParticipants);
    if (partialData.suggestions !== undefined) setSuggestions(nextSuggestions);
    if (partialData.pairings !== undefined) setPairings(nextPairings);

    try {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
      await setDoc(
        roomDocRef,
        {
          roomInfo: nextRoomInfo,
          participants: nextParticipants,
          suggestions: nextSuggestions,
          pairings: nextPairings,
          updatedAt: Date.now(),
          lastModifiedBy: user.uid
        },
        { merge: true }
      );
      setLastSyncedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to sync room data:', err);
      showToast('雲端同步失敗，請檢查網路連線', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // 當前視角使用者
  const currentUser = useMemo(
    () => participants.find(p => p.id === currentUserId) || participants[0],
    [participants, currentUserId]
  );

  // 自動計算房間狀態機 (State Machine)
  const roomStatus = useMemo(() => {
    if (pairings) return 'DRAWN_AND_REVEALED';
    const allReady = participants.length >= 2 && participants.every(p => p.isReady);
    return allReady ? 'READY_TO_DRAW' : 'WAITING_FOR_SUBMISSION';
  }, [participants, pairings]);

  // 計算填寫進度
  const readyCount = participants.filter(p => p.isReady).length;
  const progressPercent = Math.round((readyCount / participants.length) * 100);

  // 切換使用者視角時，重置拆禮物動畫，體驗每個人的開箱驚喜
  const handleSwitchUser = (uid) => {
    setCurrentUserId(uid);
    setIsBoxOpened(false);
    const otherUser = participants.find(p => p.id !== uid);
    if (otherUser) setSelectedTargetId(otherUser.id);
    showToast(`已切換視角為：${participants.find(p => p.id === uid)?.name}`, 'info');
  };

  // 將當前裝置綁定至指定參與者角色
  const handleClaimParticipant = async (targetParticipantId) => {
    if (!user) return;
    const nextParticipants = participants.map(p => {
      if (p.id === targetParticipantId) {
        return { ...p, boundUid: user.uid };
      }
      if (p.boundUid === user.uid) {
        return { ...p, boundUid: null };
      }
      return p;
    });
    setCurrentUserId(targetParticipantId);
    await syncRoomToCloud({ participants: nextParticipants });
    const targetName = participants.find(p => p.id === targetParticipantId)?.name;
    showToast(`🎄 已將您的手機綁定為「${targetName}」！`, 'success');
  };

  // 更新當前使用者的個人資料與心願 (即時寫入雲端)
  const updateCurrentUser = (updates) => {
    const nextParticipants = participants.map(p =>
      p.id === currentUser.id ? { ...p, ...updates } : p
    );
    setDrawError(null);
    syncRoomToCloud({ participants: nextParticipants });
  };

  // 觸發 Gemini AI 模糊化心願
  const handleAiObfuscate = async () => {
    if (!currentUser.wishlist || currentUser.wishlist.trim().length < 2) {
      showToast('請先輸入一點具體的想法（例如：AirPods、咖啡機），聖誕精靈才能幫您潤飾喔！', 'warning');
      return;
    }
    setIsAiLoading(true);
    const refined = await obfuscateWishlistWithAI(currentUser.wishlist, roomInfo.budget);
    updateCurrentUser({ wishlist: refined });
    setIsAiLoading(false);
    showToast('✨ 聖誕精靈已將您的心願轉化為充滿冬日驚喜的神秘線索！', 'success');
  };

  // 送出匿名推薦靈感 (即時寫入雲端)
  const handleAddSuggestion = async (e) => {
    e.preventDefault();
    if (!suggestionInput.trim()) {
      showToast('請輸入推薦的禮物靈感內容！', 'warning');
      return;
    }
    const newSug = {
      id: `s_${Date.now()}`,
      targetUserId: selectedTargetId,
      content: suggestionInput.trim(),
      tag: suggestionTag
    };
    const nextSuggestions = [newSug, ...suggestions];
    setSuggestionInput('');
    await syncRoomToCloud({ suggestions: nextSuggestions });
    const targetName = participants.find(p => p.id === selectedTargetId)?.name;
    showToast(`🦌 已透過秘密雪橇將靈感匿名投遞給「${targetName}」！`, 'success');
  };

  // 主辦人執行智慧防呆抽籤 (即時寫入雲端)
  const handleStartDraw = async () => {
    setDrawError(null);
    const result = generateSecretSantaPairings(participants);
    if (!result.success) {
      setDrawError(result.error);
      showToast('抽籤配對失敗，請檢查避開條件設定！', 'error');
      return;
    }
    setIsBoxOpened(false);
    setActiveTab('reveal');
    await syncRoomToCloud({ pairings: result.pairings });
    showToast('🔔 聖誕鐘聲響起！抽籤完成，快去拆開您的專屬火漆封蠟信封吧！', 'success');
  };

  // 一鍵將全員標記為已準備 (方便快速體驗抽籤)
  const handleMarkAllReady = async () => {
    const nextParticipants = participants.map(p => ({ ...p, isReady: true }));
    await syncRoomToCloud({ participants: nextParticipants });
    showToast('✅ 已將全體成員標記為「心願襪準備就緒」，現在可以搖響抽籤鈴鐺了！', 'success');
  };

  // 模擬死結情境 (測試演算法防呆)
  const handleSimulateDeadlock = () => {
    const p1 = participants[0];
    const p2 = participants[1];
    if (!p1 || !p2) return;
    const result = generateSecretSantaPairings([
      { ...p1, excludedId: p2.id },
      { ...p2, excludedId: p1.id }
    ]);
    setDrawError(`【演算法防呆實測】假設房間只剩「${p1.name}」與「${p2.name}」兩人且設為伴侶互相避開：\n${result.error}`);
  };

  // 新增參與者並綁定雲端
  const handleCreateParticipant = async (e) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    const newId = `u_${Date.now()}`;
    const newParticipant = {
      id: newId,
      name: newUserName.trim(),
      avatar: newUserAvatar,
      isHost: false,
      excludedId: '',
      isReady: true,
      wishlist: '喜歡有設計感的北歐生活小物，或是冬日裡能派上用場的溫暖配件！',
      blacklist: '一般印字馬克杯、年曆、絨毛娃娃',
      boundUid: user?.uid || null
    };
    const nextParticipants = [...participants, newParticipant];
    setNewUserName('');
    setShowAddUserModal(false);
    setCurrentUserId(newId);
    await syncRoomToCloud({ participants: nextParticipants });
    showToast(`🎄 歡迎「${newParticipant.name}」加入聖誕木屋！`, 'success');
  };

  // 主辦人移除未完成或離線成員
  const handleRemoveParticipant = async (id) => {
    if (participants.length <= 2) {
      showToast('聖誕房間至少需保留 2 位成員喔！', 'warning');
      return;
    }
    const target = participants.find(p => p.id === id);
    const nextParticipants = participants
      .filter(p => p.id !== id)
      .map(p => (p.excludedId === id ? { ...p, excludedId: '' } : p));

    if (currentUserId === id) {
      setCurrentUserId(nextParticipants[0].id);
    }
    await syncRoomToCloud({ participants: nextParticipants });
    showToast(`已將「${target?.name}」移出房間名單`, 'info');
  };

  // 建立全新的雲端房間
  const handleCreateNewRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim() || !user) return;
    const generatedCode = `NOEL-${Math.floor(100 + Math.random() * 900)}`;
    const hostName = newHostName.trim() || '聖誕主揪';
    const initialHost = {
      id: 'u_host',
      name: `${hostName} (主辦人)`,
      avatar: '🎅',
      isHost: true,
      excludedId: '',
      isReady: false,
      wishlist: '',
      blacklist: '',
      boundUid: user.uid
    };
    const newRoomData = {
      roomInfo: {
        name: newRoomName.trim(),
        code: generatedCode,
        budget: newRoomBudget.trim() || 'NT$ 500 ~ 1,000',
        eventDate: newRoomDate.trim() || '2026-12-25 20:00',
        allowForceDraw: false,
        strictPrivacyMode: true // 新建的正式房間預設開啟防偷看模式
      },
      participants: [initialHost],
      suggestions: [],
      pairings: null,
      updatedAt: Date.now(),
      lastModifiedBy: user.uid
    };

    try {
      setIsSyncing(true);
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', generatedCode);
      await setDoc(roomDocRef, newRoomData);
      setActiveRoomCode(generatedCode);
      setCurrentUserId('u_host');
      setShowRoomModal(false);
      setShowInviteModal(true); // 建立完成後直接彈出邀請卡方便分享給朋友
      setNewRoomName('');
      showToast(`🎄 已成功打造專屬聖誕木屋「${generatedCode}」！快複製邀請卡給朋友吧！`, 'success');
    } catch (err) {
      console.error('Error creating room:', err);
      showToast('建立房間失敗，請稍後再試', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // 切換「正式派對防偷看模式」與「測試沙盒模式」
  const handleToggleStrictPrivacy = async () => {
    const nextMode = !roomInfo.strictPrivacyMode;
    await syncRoomToCloud({
      roomInfo: { ...roomInfo, strictPrivacyMode: nextMode }
    });
    showToast(
      nextMode
        ? '🔒 已開啟「正式派對防偷看模式」！頂部測試切換列已鎖定隱藏。'
        : '🧪 已切換回「沙盒測試模式」，可自由切換不同人視角。',
      nextMode ? 'success' : 'info'
    );
  };

  // 透過房間代碼切換或加入房間
  const handleJoinRoomByCode = (codeToJoin) => {
    const cleanCode = (codeToJoin || joinCodeInput).trim().toUpperCase();
    if (!cleanCode) return;
    setActiveRoomCode(cleanCode);
    setIsBoxOpened(false);
    setShowRoomModal(false);
    setJoinCodeInput('');
    showToast(`🦌 已搭乘雪橇抵達房間：${cleanCode}`, 'info');
  };

  // 重置預設房間為初始示範資料
  const handleResetDemoRoom = async () => {
    await syncRoomToCloud({
      roomInfo: { ...DEFAULT_ROOM_INFO, code: activeRoomCode },
      participants: INITIAL_PARTICIPANTS,
      suggestions: INITIAL_SUGGESTIONS,
      pairings: null
    });
    setCurrentUserId('u1');
    setIsBoxOpened(false);
    showToast('🔄 已將聖誕木屋重置為 5 人完整示範資料！', 'info');
  };

  // 複製邀請連結
  const handleCopyInvite = () => {
    const inviteText = `🎄 叮叮噹！邀請你參加「${roomInfo.name}」交換禮物派對！\n🔑 專屬木屋代碼：${roomInfo.code}\n🎁 禮物預算：${roomInfo.budget}\n📅 拆禮時間：${roomInfo.eventDate}\n快點開連結掛上你的聖誕心願襪，並設定避開伴侶吧！`;
    try {
      const textarea = document.createElement('textarea');
      textarea.value = inviteText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('📋 已複製聖誕邀請函與房號！可直接貼到 LINE 群組。', 'success');
    } catch {
      showToast('複製成功！房間代碼：' + roomInfo.code, 'success');
    }
  };

  // 取得「我抽到的對象」資訊 (嚴格隱私：只查詢 currentUserId 對應的 receiver)
  const myTargetUser = useMemo(() => {
    if (!pairings || !pairings[currentUser.id]) return null;
    const targetId = pairings[currentUser.id];
    return participants.find(p => p.id === targetId) || null;
  }, [pairings, currentUser.id, participants]);

  // 取得推薦給某人的所有匿名靈感
  const getSuggestionsForUser = (uid) => {
    return suggestions.filter(s => s.targetUserId === uid);
  };

  return (
    <div className="min-h-screen bg-[#071712] text-[#F7F4EB] font-sans pb-24 selection:bg-[#9E2A2B] selection:text-[#FFF8E7] relative overflow-x-hidden">
      {/* ========================================== */}
      {/* 聖誕美學自訂動畫與紋理樣式 (不影響操作、內斂高質感) */}
      {/* ========================================== */}
      <style>{`
        @keyframes gentleSnow {
          0% { transform: translateY(-5vh) translateX(0px); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(105vh) translateX(25px); opacity: 0; }
        }
        .noel-snow {
          position: fixed;
          top: -20px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255,250,235,0.9) 0%, rgba(255,250,235,0.1) 100%);
          pointer-events: none;
          z-index: 1;
          animation-name: gentleSnow;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .candy-cane-bar {
          background-image: repeating-linear-gradient(
            45deg,
            #9E2A2B,
            #9E2A2B 12px,
            #D4AF37 12px,
            #D4AF37 24px
          );
        }
        .wax-seal-shadow {
          box-shadow: 0 6px 20px rgba(158, 42, 43, 0.55), inset 0 2px 4px rgba(255, 255, 255, 0.35), inset 0 -3px 6px rgba(60, 10, 12, 0.7);
        }
      `}</style>

      {/* 靜謐冬夜微光與飄雪背景層 (pointer-events-none 絕不干擾點擊) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 w-[28rem] h-[28rem] bg-[#9E2A2B]/15 rounded-full blur-[130px]" />
        <div className="absolute top-1/3 -right-24 w-[26rem] h-[26rem] bg-[#D4AF37]/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 left-10 w-[30rem] h-[30rem] bg-[#143628]/40 rounded-full blur-[120px]" />
        {ambientSnow && SNOWFLAKES.map((flake, i) => (
          <div
            key={i}
            className="noel-snow"
            style={{
              left: flake.left,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              animationDuration: flake.duration,
              animationDelay: flake.delay,
              opacity: flake.opacity,
            }}
          />
        ))}
      </div>

      {/* 頂部通知 Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-bounce">
          <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md ${
            toast.type === 'error' ? 'bg-[#3B0D11]/95 border-[#E05A47] text-[#FDE8E8]' :
            toast.type === 'warning' ? 'bg-[#3A260B]/95 border-[#D4AF37] text-[#FEF3C7]' :
            toast.type === 'info' ? 'bg-[#0F291E]/95 border-[#D4AF37]/60 text-[#F7F4EB]' :
            'bg-[#0D2E22]/95 border-[#6EE7B7]/60 text-[#ECFDF5]'
          }`}>
            <Sparkles className="w-5 h-5 shrink-0 text-[#D4AF37]" />
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 頂部狀態列：支援「測試沙盒切換」與「正式派對防偷看模式」 */}
      {/* ========================================== */}
      <div className="bg-[#0B2119]/90 border-b border-[#D4AF37]/20 px-4 py-2.5 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          {roomInfo.strictPrivacyMode ? (
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2 text-xs text-[#A7F3D0] font-semibold">
                <Lock className="w-4 h-4 shrink-0 text-[#D4AF37]" />
                <span>🔒 聖誕派對防偷看模式・您的身分：</span>
                <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#071712] font-bold shadow-sm">
                  {currentUser.avatar} {currentUser.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddUserModal(true)}
                  disabled={roomStatus === 'DRAWN_AND_REVEALED'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#163A2C] hover:bg-[#1E4D3B] border border-[#D4AF37]/40 text-[#F3E5AB] disabled:opacity-40 shrink-0 font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" /> 新朋友報名
                </button>
                <button
                  onClick={handleToggleStrictPrivacy}
                  className="text-[11px] text-[#A3B8AE] hover:text-[#F3E5AB] underline shrink-0"
                  title="主辦人可切換回測試沙盒模式"
                >
                  切換回沙盒測試
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-[#F3E5AB] font-medium">
                <Eye className="w-4 h-4 shrink-0 text-[#D4AF37]" />
                <span>沙盒測試視角切換（正式玩時可鎖定）：</span>
                <button
                  onClick={handleToggleStrictPrivacy}
                  className="px-2.5 py-0.5 rounded-full bg-[#163A2C] hover:bg-[#1E4D3B] text-[#A7F3D0] border border-[#D4AF37]/30 text-[11px] font-bold transition"
                >
                  🔒 鎖定為正式派對模式
                </button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 no-scrollbar">
                {participants.map(p => {
                  const active = p.id === currentUser.id;
                  const isBoundToMe = user && p.boundUid === user.uid;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSwitchUser(p.id)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 ${
                        active
                          ? 'bg-gradient-to-r from-[#D4AF37] to-[#E6C65B] text-[#071712] shadow-lg shadow-[#D4AF37]/20 scale-105'
                          : 'bg-[#122E23] text-[#D7E2DC] hover:bg-[#193E30] border border-white/5'
                      }`}
                    >
                      <span>{p.avatar}</span>
                      <span>{p.name.replace(' (主辦人)', '')}</span>
                      {isBoundToMe && (
                        <span className={`text-[10px] px-1 rounded font-bold ${active ? 'bg-[#071712] text-[#D4AF37]' : 'bg-[#D4AF37]/20 text-[#F3E5AB]'}`}>
                          我
                        </span>
                      )}
                      {p.isHost && <span className={`text-[10px] px-1 rounded ${active ? 'bg-[#9E2A2B] text-white' : 'bg-[#9E2A2B]/40 text-[#FCA5A5]'}`}>主揪</span>}
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowAddUserModal(true)}
                  disabled={roomStatus === 'DRAWN_AND_REVEALED'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#9E2A2B]/30 hover:bg-[#9E2A2B]/50 border border-[#D4AF37]/30 text-[#F3E5AB] disabled:opacity-40 shrink-0 font-semibold transition"
                  title="新增參與者並同步至雲端"
                >
                  <Plus className="w-3.5 h-3.5" /> 報名加入
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* 主視覺 Header & 北歐聖誕壁爐橫幅 */}
      {/* ========================================== */}
      <header className="relative z-10 bg-gradient-to-b from-[#112D22]/90 via-[#0A1E17]/95 to-[#071712] pt-6 pb-8 px-4 border-b border-[#D4AF37]/20">
        {/* 頂部金色微光飾條 */}
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-medium shadow-inner">
                <Trees className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>聖誕木屋代碼：</span>
                <span className="font-mono font-bold text-[#FFD966] tracking-wider">{roomInfo.code}</span>
              </div>

              {/* 雲端即時同步狀態指示燈 */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                user
                  ? 'bg-[#123124] border-[#6EE7B7]/30 text-[#A7F3D0]'
                  : 'bg-[#3A260B] border-[#D4AF37]/30 text-[#F3E5AB]'
              }`}>
                {user ? (
                  <>
                    <Cloud className={`w-3.5 h-3.5 text-[#6EE7B7] ${isSyncing ? 'animate-bounce' : ''}`} />
                    <span>{isSyncing ? '雪橇同步中...' : '雲端木屋即時連線'}</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>連線初始化中...</span>
                  </>
                )}
              </div>

              {/* 靜謐飄雪開關按鈕 */}
              <button
                onClick={() => setAmbientSnow(!ambientSnow)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                  ambientSnow
                    ? 'bg-[#153528] border-[#D4AF37]/30 text-[#F3E5AB]'
                    : 'bg-[#0C2018] border-white/10 text-[#7A9186]'
                }`}
                title="切換背景冬雪氛圍"
              >
                <Snowflake className={`w-3 h-3 ${ambientSnow ? 'text-[#D4AF37] animate-spin' : ''}`} style={{ animationDuration: '8s' }} />
                <span className="hidden sm:inline">{ambientSnow ? '冬雪開啟' : '冬雪關閉'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowRoomModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#153528] hover:bg-[#1C4635] text-[#F3E5AB] text-xs font-semibold border border-[#D4AF37]/30 transition shadow-sm"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>切換 / 新建木屋</span>
              </button>
              <button
                onClick={() => setShowArchitectureModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#10291F] hover:bg-[#173A2C] text-[#D7E2DC] text-xs font-medium border border-white/10 transition"
              >
                <Info className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden sm:inline">系統設計</span>
              </button>
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:from-[#B23031] hover:to-[#C83B3C] text-[#FFF8E7] text-xs font-bold shadow-lg shadow-[#9E2A2B]/30 border border-[#D4AF37]/40 transition"
              >
                <Share2 className="w-3.5 h-3.5 text-[#F3E5AB]" />
                <span>發送聖誕邀請卡</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FFFDF9] drop-shadow-sm">
              {roomInfo.name}
            </h1>
          </div>

          {/* 房間活動資訊膠囊 */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#C6D6CE] mb-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 bg-[#0E261C]/90 px-3.5 py-1.5 rounded-xl border border-[#D4AF37]/25 shadow-inner">
                <Gift className="w-4 h-4 text-[#D4AF37]" />
                <span>交換預算：<strong className="text-[#FFF8E7]">{roomInfo.budget}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#0E261C]/90 px-3.5 py-1.5 rounded-xl border border-[#D4AF37]/25 shadow-inner">
                <Bell className="w-4 h-4 text-[#E07A5F]" />
                <span>拆禮時刻：<strong className="text-[#FFF8E7]">{roomInfo.eventDate}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#0E261C]/90 px-3.5 py-1.5 rounded-xl border border-[#D4AF37]/25 shadow-inner">
                <Users className="w-4 h-4 text-[#6EE7B7]" />
                <span>木屋夥伴：<strong className="text-[#FFF8E7]">{participants.length} 位聖誕老人</strong></span>
              </div>
            </div>
          </div>

          {/* 聖誕工坊進度條 (State Machine Banner) */}
          <div className="bg-gradient-to-r from-[#0F291E] via-[#133225] to-[#0F291E] border border-[#D4AF37]/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {roomStatus === 'WAITING_FOR_SUBMISSION' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3A260B] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-bold">
                    <Flame className="w-3.5 h-3.5 text-[#D4AF37] animate-pulse" />
                    壁爐暖身中：等待全員掛上聖誕心願襪
                  </span>
                )}
                {roomStatus === 'READY_TO_DRAW' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#123B29] border border-[#6EE7B7]/40 text-[#A7F3D0] text-xs font-bold">
                    <Bell className="w-3.5 h-3.5 text-[#D4AF37] animate-bounce" />
                    全員準備就緒！主辦人可隨時搖響抽籤鈴鐺
                  </span>
                )}
                {roomStatus === 'DRAWN_AND_REVEALED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4A1517] border border-[#D4AF37]/50 text-[#FDE8E8] text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                    平安夜秘密配對完成・請前往「抽籤開箱」拆封火漆信封
                  </span>
                )}
              </div>
              <span className="text-xs text-[#C6D6CE]">
                心願襪掛載進度：<strong className="text-[#F3E5AB]">{readyCount} / {participants.length}</strong> ({progressPercent}%)
              </span>
            </div>

            <div className="w-full h-3 bg-[#071712] rounded-full overflow-hidden p-0.5 border border-[#D4AF37]/20">
              <div
                className={`h-full transition-all duration-700 rounded-full ${
                  roomStatus === 'DRAWN_AND_REVEALED'
                    ? 'candy-cane-bar'
                    : roomStatus === 'READY_TO_DRAW'
                    ? 'bg-gradient-to-r from-[#10B981] via-[#D4AF37] to-[#10B981]'
                    : 'bg-gradient-to-r from-[#9E2A2B] to-[#D4AF37]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ========================================== */}
      {/* 核心功能分頁導覽列 (Nordic Noel Tabs) */}
      {/* ========================================== */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0D231A]/95 p-1.5 rounded-2xl border border-[#D4AF37]/25 mb-6 shadow-xl backdrop-blur-md">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow-lg shadow-[#9E2A2B]/30 border border-[#D4AF37]/40'
                : 'text-[#A3B8AE] hover:text-[#FFF8E7] hover:bg-[#143327]/70'
            }`}
          >
            <Trees className="w-4 h-4 text-[#D4AF37]" />
            <span>1. 聖誕木屋大廳</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'profile'
                ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow-lg shadow-[#9E2A2B]/30 border border-[#D4AF37]/40'
                : 'text-[#A3B8AE] hover:text-[#FFF8E7] hover:bg-[#143327]/70'
            }`}
          >
            <Wand2 className="w-4 h-4 text-[#D4AF37]" />
            <span>2. 聖誕襪與避開</span>
          </button>

          <button
            onClick={() => setActiveTab('suggestions')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'suggestions'
                ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow-lg shadow-[#9E2A2B]/30 border border-[#D4AF37]/40'
                : 'text-[#A3B8AE] hover:text-[#FFF8E7] hover:bg-[#143327]/70'
            }`}
          >
            <MessageSquarePlus className="w-4 h-4 text-[#D4AF37]" />
            <span>3. 精靈悄悄話</span>
            <span className="px-1.5 py-0.2 bg-[#D4AF37]/20 text-[#F3E5AB] border border-[#D4AF37]/30 rounded-full text-[11px]">
              {suggestions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reveal')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'reveal'
                ? 'bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#D4AF37] text-[#071712] shadow-lg shadow-[#D4AF37]/30'
                : 'text-[#A3B8AE] hover:text-[#FFF8E7] hover:bg-[#143327]/70'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>4. 火漆信封開箱</span>
            {pairings && <span className="w-2 h-2 rounded-full bg-[#9E2A2B] animate-ping" />}
          </button>
        </div>

        {/* 演算法死結或錯誤警告框 */}
        {drawError && (
          <div className="mb-6 p-4 rounded-2xl bg-[#3B0D11]/95 border border-[#E05A47] text-[#FDE8E8] flex items-start gap-3 shadow-xl">
            <AlertTriangle className="w-5 h-5 text-[#F3E5AB] shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm whitespace-pre-line leading-relaxed">
              <div className="font-bold text-[#F3E5AB] mb-1">配對防呆演算法攔截通知</div>
              {drawError}
            </div>
            <button
              onClick={() => setDrawError(null)}
              className="text-xs text-[#F3E5AB] hover:text-white px-2 py-1"
            >
              關閉
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 1: 聖誕木屋大廳與成員狀態 */}
        {/* ========================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* 主辦人控制台 */}
            <div className="bg-gradient-to-br from-[#0F291E]/95 via-[#0C2219]/95 to-[#142F24]/95 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D4AF37]/15">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#FFF8E7] flex items-center gap-2">
                    <Bell className="w-5 h-5 text-[#D4AF37]" />
                    <span>聖誕老人搖鈴抽籤台</span>
                  </h2>
                  <p className="text-xs text-[#A3B8AE] mt-1">
                    演算法將嚴格排除「自己抽到自己」與「互設避開的伴侶」，並以火漆封蠟加密保存於雲端。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!roomInfo.strictPrivacyMode && roomStatus === 'WAITING_FOR_SUBMISSION' && (
                    <button
                      onClick={handleMarkAllReady}
                      className="px-3.5 py-2 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#F3E5AB] border border-[#D4AF37]/40 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                      <span>⚡ 測試：一鍵讓全員掛好聖誕襪</span>
                    </button>
                  )}

                  {!roomInfo.strictPrivacyMode && (
                    <button
                      onClick={handleSimulateDeadlock}
                      className="px-3 py-2 rounded-xl bg-[#143327] hover:bg-[#1B4334] text-[#C6D6CE] border border-white/10 text-xs font-medium transition flex items-center gap-1.5"
                      title="測試當 2 人互設避開時的死結偵測能力"
                    >
                      <ShieldAlert className="w-4 h-4 text-[#E07A5F]" />
                      <span>測試死結偵測</span>
                    </button>
                  )}

                  <button
                    onClick={handleStartDraw}
                    disabled={roomStatus === 'WAITING_FOR_SUBMISSION' && !roomInfo.allowForceDraw}
                    className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center gap-2 shadow-lg ${
                      roomStatus === 'WAITING_FOR_SUBMISSION' && !roomInfo.allowForceDraw
                        ? 'bg-[#152E24] text-[#5E786D] cursor-not-allowed border border-white/5'
                        : 'bg-gradient-to-r from-[#9E2A2B] via-[#B83334] to-[#9E2A2B] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/50 shadow-[#9E2A2B]/40'
                    }`}
                  >
                    <Shuffle className="w-4 h-4 text-[#F3E5AB]" />
                    <span>{pairings ? '重新搖鈴洗牌抽籤' : '🔔 鎖定木屋並搖鈴抽籤！'}</span>
                  </button>
                </div>
              </div>

              {/* 強制開抽開關 (當有人遲遲未填時) */}
              {roomStatus === 'WAITING_FOR_SUBMISSION' && (
                <div className="pt-3 flex items-center justify-between text-xs text-[#A3B8AE]">
                  <span>還有朋友還沒填完心願嗎？可點右上角「發送聖誕邀請卡」催促，或開啟強制抽籤：</span>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[#F3E5AB] font-semibold">
                    <input
                      type="checkbox"
                      checked={roomInfo.allowForceDraw}
                      onChange={e => syncRoomToCloud({ roomInfo: { ...roomInfo, allowForceDraw: e.target.checked } })}
                      className="rounded border-[#D4AF37] bg-[#071712] text-[#9E2A2B] focus:ring-[#D4AF37]"
                    />
                    <span>允許未全員填妥直接開抽</span>
                  </label>
                </div>
              )}
            </div>

            {/* 參與者卡片網格 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#F3E5AB] uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>木屋成員與心願襪狀態 ({participants.length})</span>
                </h3>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  disabled={roomStatus === 'DRAWN_AND_REVEALED'}
                  className="text-xs text-[#A7F3D0] hover:text-white font-semibold flex items-center gap-1 disabled:opacity-40 bg-[#143327] px-3 py-1.5 rounded-xl border border-[#D4AF37]/30"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" /> 新增參與者
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {participants.map(person => {
                  const excludedPartner = participants.find(p => p.id === person.excludedId);
                  const sugCount = getSuggestionsForUser(person.id).length;
                  const isMe = person.id === currentUser.id;
                  const isBoundToMe = user && person.boundUid === user.uid;

                  return (
                    <div
                      key={person.id}
                      className={`relative rounded-2xl p-4 border transition-all backdrop-blur-sm ${
                        isMe
                          ? 'bg-gradient-to-br from-[#173A2C] to-[#0F281E] border-[#D4AF37] shadow-lg shadow-[#D4AF37]/10'
                          : 'bg-[#0D231A]/90 border-[#D4AF37]/20 hover:border-[#D4AF37]/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-[#071712] border border-[#D4AF37]/30 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                            {person.avatar}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#FFF8E7] text-sm sm:text-base">
                                {person.name}
                              </span>
                              {isMe && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-[#D4AF37] text-[#071712] rounded-full">
                                  目前視角
                                </span>
                              )}
                              {isBoundToMe && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-[#143D2D] text-[#A7F3D0] border border-[#6EE7B7]/30 rounded-full">
                                  已綁定我的手機
                                </span>
                              )}
                            </div>

                            {/* 避開對象標籤 */}
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              {excludedPartner ? (
                                <span className="inline-flex items-center gap-1 text-[#FCA5A5] bg-[#9E2A2B]/30 px-2 py-0.5 rounded-md border border-[#9E2A2B]/50">
                                  <HeartOff className="w-3 h-3" />
                                  避開：{excludedPartner.avatar} {excludedPartner.name.replace(' (主辦人)', '')}
                                </span>
                              ) : (
                                <span className="text-[#8FA89B]">無指定避開對象</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 狀態徽章與刪除 */}
                        <div className="flex flex-col items-end gap-2">
                          {person.isReady ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#123B29] text-[#A7F3D0] border border-[#6EE7B7]/30 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#6EE7B7]" /> 已掛襪
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3A260B] text-[#F3E5AB] border border-[#D4AF37]/30 text-xs font-semibold">
                              <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> 準備中
                            </span>
                          )}

                          {!person.isHost && roomStatus !== 'DRAWN_AND_REVEALED' && (
                            <button
                              onClick={() => handleRemoveParticipant(person.id)}
                              className="text-[#7A9186] hover:text-[#FCA5A5] p-1 transition"
                              title="移出房間"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 底部快速互動列 */}
                      <div className="mt-4 pt-3 border-t border-[#D4AF37]/15 flex items-center justify-between text-xs">
                        <span className="text-[#A3B8AE]">
                          已收到 <strong className="text-[#F3E5AB]">{sugCount} 則</strong> 聖誕精靈悄悄話
                        </span>
                        <div className="flex items-center gap-2">
                          {!isBoundToMe && (
                            <button
                              onClick={() => handleClaimParticipant(person.id)}
                              className="text-[#A7F3D0] hover:text-white font-medium bg-[#143327] px-2.5 py-1 rounded-lg border border-[#6EE7B7]/25 transition"
                              title="將此角色綁定至您的裝置"
                            >
                              認領為我
                            </button>
                          )}
                          {!isMe ? (
                            <button
                              onClick={() => {
                                setSelectedTargetId(person.id);
                                setActiveTab('suggestions');
                              }}
                              className="text-[#F3E5AB] hover:text-white font-semibold flex items-center gap-1"
                            >
                              <span>塞悄悄話給他</span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setActiveTab('profile')}
                              className="text-[#D4AF37] hover:text-[#FFF8E7] font-semibold flex items-center gap-1"
                            >
                              <span>編輯我的心願襪</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: 個人資料、避開伴侶綁定 & AI 聖誕精靈潤飾 */}
        {/* ========================================== */}
        {activeTab === 'profile' && (
          <div className="bg-gradient-to-br from-[#0F291E]/95 via-[#0B2017]/95 to-[#122D22]/95 border border-[#D4AF37]/30 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D4AF37]/20">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#071712] border border-[#D4AF37]/40 flex items-center justify-center text-3xl shadow-inner">
                  {currentUser.avatar}
                </div>
                <div>
                  <div className="text-xs text-[#D4AF37] font-bold">正在佈置此人的聖誕心願襪：</div>
                  <h2 className="text-xl font-extrabold text-[#FFF8E7]">{currentUser.name}</h2>
                </div>
              </div>

              {/* 填寫完成切換按鈕 */}
              <button
                onClick={() => {
                  const nextReady = !currentUser.isReady;
                  updateCurrentUser({ isReady: nextReady });
                  showToast(
                    nextReady ? '🎄 已掛上您的聖誕心願襪並同步至雲端！' : '已切換回「準備中」狀態',
                    nextReady ? 'success' : 'info'
                  );
                }}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition shadow-lg ${
                  currentUser.isReady
                    ? 'bg-[#123B29] text-[#A7F3D0] border border-[#6EE7B7]/40'
                    : 'bg-gradient-to-r from-[#D4AF37] to-[#E6C65B] text-[#071712]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{currentUser.isReady ? '已掛好心願襪 (點擊可修改)' : '確認填妥，掛上我的聖誕襪'}</span>
              </button>
            </div>

            {/* 1. 避開對象綁定 (防呆配對核心) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#081912]/90 border border-[#D4AF37]/20 space-y-3">
              <div className="flex items-center gap-2 text-[#FCA5A5] font-bold text-sm">
                <HeartOff className="w-4 h-4 text-[#E05A47]" />
                <span>避開對象綁定（伴侶 / 室友防呆配對）</span>
              </div>
              <p className="text-xs text-[#A3B8AE] leading-relaxed">
                若您與伴侶一起參加，請在此選擇對方。抽籤演算法會確保<strong className="text-[#FFF8E7]">您絕對不會抽到自己，也絕對不會抽到指定伴侶（雙向保護）</strong>！
              </p>
              <select
                value={currentUser.excludedId || ''}
                onChange={e => updateCurrentUser({ excludedId: e.target.value })}
                disabled={roomStatus === 'DRAWN_AND_REVEALED'}
                className="w-full sm:w-80 bg-[#0F281E] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37] disabled:opacity-50"
              >
                <option value="">✨ 無需避開任何人（隨緣驚喜配對）</option>
                {participants
                  .filter(p => p.id !== currentUser.id)
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      🚫 抽籤時避開：{p.avatar} {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* 2. 禮物偏好與 AI 模糊化潤飾助手 */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-sm font-bold text-[#FFF8E7] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>期望收到的禮物方向（心願襪許願卡）</span>
                </label>

                <button
                  type="button"
                  onClick={handleAiObfuscate}
                  disabled={isAiLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] via-[#B83334] to-[#D4AF37] hover:brightness-110 text-[#FFF8E7] text-xs font-bold shadow-md shadow-[#9E2A2B]/30 transition disabled:opacity-50"
                >
                  <Wand2 className={`w-3.5 h-3.5 text-[#F3E5AB] ${isAiLoading ? 'animate-spin' : ''}`} />
                  <span>{isAiLoading ? '聖誕精靈施法潤飾中...' : '✨ 聖誕精靈幫我模糊化心願'}</span>
                </button>
              </div>

              <p className="text-xs text-[#A3B8AE]">
                💡 怕寫得太具體（例如直接寫「iPhone 16」或「某牌吹風機」）失去驚喜感嗎？直接輸入具體商品，點擊右上方<strong className="text-[#F3E5AB]">「聖誕精靈幫我模糊化心願」</strong>，AI 會自動轉化為充滿冬日儀式感的神秘線索！
              </p>

              <textarea
                rows={3}
                value={currentUser.wishlist}
                onChange={e => updateCurrentUser({ wishlist: e.target.value })}
                placeholder="例如：直接輸入「Marshall 藍牙喇叭」然後點擊右上角 AI 按鈕，或寫下：喜歡露營、手沖咖啡相關的質感小物..."
                className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-2xl p-4 text-sm text-[#FFF8E7] placeholder-[#5E786D] focus:outline-none focus:border-[#D4AF37] leading-relaxed"
              />
            </div>

            {/* 3. 地雷清單 (Blacklist) */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#FCA5A5] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#E05A47]" />
                <span>地雷清單（最不想收到的聖誕雷品警報）</span>
              </label>
              <p className="text-xs text-[#A3B8AE]">
                明確列出家裡已經堆積如山或過敏的物品，拯救您的神秘聖誕老人不踩雷！
              </p>
              <input
                type="text"
                value={currentUser.blacklist}
                onChange={e => updateCurrentUser({ blacklist: e.target.value })}
                placeholder="例如：馬克杯、護手霜禮盒、千片拼圖、絨毛娃娃..."
                className="w-full bg-[#071712] border border-[#9E2A2B]/50 rounded-xl px-4 py-3 text-sm text-[#FFF8E7] placeholder-[#5E786D] focus:outline-none focus:border-[#E05A47]"
              />
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: 聖誕精靈悄悄話 (Anonymous Gift Suggestions) */}
        {/* ========================================== */}
        {activeTab === 'suggestions' && (
          <div className="space-y-6">
            {/* 匿名投遞表單 */}
            <form
              onSubmit={handleAddSuggestion}
              className="bg-gradient-to-br from-[#0F291E]/95 via-[#0B2017]/95 to-[#122D22]/95 border border-[#D4AF37]/30 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-[#FFF8E7] flex items-center gap-2">
                  <MessageSquarePlus className="w-5 h-5 text-[#D4AF37]" />
                  <span>聖誕精靈匿名爆料池（助攻神秘聖誕老人）</span>
                </h2>
                <span className="px-2.5 py-1 rounded-full bg-[#153528] text-[#F3E5AB] border border-[#D4AF37]/30 text-xs font-semibold">
                  🕵️ 100% 絕對匿名
                </span>
              </div>

              <p className="text-xs text-[#A3B8AE] leading-relaxed">
                知道誰最近缺什麼、或是想看誰收到搞笑禮物嗎？在這裡匿名塞紙條！<strong className="text-[#F3E5AB]">系統不會記錄發文者 ID</strong>，抽籤揭曉後，抽到他的人跟當事人都能看到這些驚喜線報！
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#C6D6CE] mb-1">選擇要推薦給誰：</label>
                  <select
                    value={selectedTargetId}
                    onChange={e => setSelectedTargetId(e.target.value)}
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                  >
                    {participants.map(p => (
                      <option key={p.id} value={p.id}>
                        🎯 推薦給：{p.avatar} {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#C6D6CE] mb-1">情報類型標籤：</label>
                  <select
                    value={suggestionTag}
                    onChange={e => setSuggestionTag(e.target.value)}
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="實用情報">💡 實用情報（他最近超需要）</option>
                    <option value="閨蜜線報">💖 好友線報（他暗自許願過）</option>
                    <option value="避雷指南">⚠️ 避雷指南（千萬別買這個）</option>
                    <option value="幽默惡搞">🤣 幽默惡搞（全場氣氛擔當）</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 font-bold text-sm transition shadow-lg shadow-[#9E2A2B]/30"
                  >
                    🦌 搭乘雪橇匿名送出
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={suggestionInput}
                onChange={e => setSuggestionInput(e.target.value)}
                placeholder="寫下你推薦他收到的禮物靈感（例如：他上次露營把磨豆機摔壞了，送手搖磨豆機準沒錯！）"
                className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-[#FFF8E7] placeholder-[#5E786D] focus:outline-none focus:border-[#D4AF37]"
              />
            </form>

            {/* 依對象分類的靈感牆 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {participants.map(person => {
                const personSuggestions = getSuggestionsForUser(person.id);
                return (
                  <div
                    key={person.id}
                    className="bg-[#0D231A]/90 border border-[#D4AF37]/20 rounded-2xl p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#D4AF37]/15">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{person.avatar}</span>
                          <span className="font-bold text-[#FFF8E7] text-sm">{person.name}</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#153528] text-[#F3E5AB] border border-[#D4AF37]/25">
                          {personSuggestions.length} 則線報
                        </span>
                      </div>

                      {personSuggestions.length === 0 ? (
                        <p className="text-xs text-[#6E857A] italic py-4 text-center">
                          目前還沒有人塞悄悄話給他，快來當第一個爆料精靈！
                        </p>
                      ) : (
                        <ul className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                          {personSuggestions.map(s => (
                            <li
                              key={s.id}
                              className="p-3 rounded-xl bg-[#071712]/90 border border-[#D4AF37]/15 text-xs text-[#EAE6DF] leading-relaxed"
                            >
                              <span className="inline-block px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[#F3E5AB] font-semibold text-[10px] mr-2">
                                #{s.tag}
                              </span>
                              {s.content}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: 北歐火漆封蠟神秘信封開箱 (Strict Privacy Reveal) */}
        {/* ========================================== */}
        {activeTab === 'reveal' && (
          <div className="space-y-6">
            {!pairings ? (
              <div className="bg-gradient-to-br from-[#0F291E]/95 to-[#0A1D15]/95 border border-[#D4AF37]/30 rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-2xl">
                <div className="w-16 h-16 rounded-3xl bg-[#153528] border border-[#D4AF37]/40 flex items-center justify-center mx-auto text-[#D4AF37]">
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-extrabold text-[#FFF8E7]">聖誕火漆信封尚未封緘派發</h2>
                <p className="text-xs sm:text-sm text-[#A3B8AE] max-w-md mx-auto leading-relaxed">
                  目前房間狀態為 <code className="text-[#F3E5AB]">{roomStatus}</code>。請先回到「1. 聖誕木屋大廳」點擊「🔔 鎖定木屋並搖鈴抽籤」，即可為每位成員生成專屬的火漆封蠟神秘信封！
                </p>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-xs sm:text-sm font-bold transition shadow-lg"
                >
                  前往聖誕木屋大廳搖鈴
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 左側：我抽到的送禮對象 (嚴格隱私火漆信封卡片) */}
                <div className="lg:col-span-7 bg-gradient-to-br from-[#122E22] via-[#0B1F17] to-[#1A1114] border border-[#D4AF37]/40 rounded-3xl p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-bold">
                        <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                        北歐火漆封蠟保護：僅「{currentUser.name}」本人可見
                      </span>
                      {isBoxOpened && (
                        <button
                          onClick={() => setIsBoxOpened(false)}
                          className="text-xs text-[#A3B8AE] hover:text-[#FFF8E7] flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> 重新封緘隱藏（防旁人偷看）
                        </button>
                      )}
                    </div>

                    {!isBoxOpened ? (
                      /* 驚喜設計：北歐羊皮紙與勃根地紅火漆封蠟信封 */
                      <div className="py-8 text-center space-y-5">
                        <div
                          onClick={() => setIsBoxOpened(true)}
                          className="mx-auto max-w-sm rounded-2xl bg-gradient-to-b from-[#F5EEDB] to-[#E6DEC3] text-[#1E2923] p-6 shadow-2xl border-2 border-[#D4AF37] cursor-pointer group hover:scale-[1.02] transition-all relative overflow-hidden"
                        >
                          {/* 信封折線裝飾 */}
                          <div className="border border-[#C8B992] rounded-xl p-5 space-y-4 relative">
                            <div className="text-[11px] font-serif tracking-widest uppercase text-[#7A6A4F]">
                              North Pole Official Dispatch • 2026
                            </div>
                            <div className="text-base font-extrabold text-[#142E22]">
                              致 秘密聖誕老人：{currentUser.avatar} {currentUser.name}
                            </div>

                            {/* 火漆封蠟印章按鈕 */}
                            <div className="py-2 flex justify-center">
                              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#B83334] via-[#9E2A2B] to-[#6E1718] wax-seal-shadow border-2 border-[#D4AF37]/70 flex flex-col items-center justify-center text-[#F3E5AB] group-hover:scale-110 transition-transform">
                                <Trees className="w-7 h-7 text-[#F3E5AB] drop-shadow" />
                                <span className="text-[9px] font-bold tracking-widest mt-0.5">NOEL</span>
                              </div>
                            </div>

                            <p className="text-xs text-[#5C5343] font-medium">
                              請確認身旁沒有其他人偷看螢幕後，點擊上方<strong className="text-[#9E2A2B]">「火漆封蠟印章」</strong>拆封您的送禮任務！
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 拆封後的羊皮紙任務卡 */
                      <div className="space-y-5 animate-fadeIn">
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#F7F2E4] to-[#EAE0C8] text-[#172A20] border-2 border-[#D4AF37] shadow-xl">
                          <div className="flex items-center justify-between border-b border-[#C8B992] pb-3 mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-14 h-14 rounded-2xl bg-[#10281E] border border-[#D4AF37] flex items-center justify-center text-3xl shadow-inner">
                                {myTargetUser?.avatar}
                              </div>
                              <div>
                                <div className="text-[11px] font-extrabold text-[#9E2A2B] uppercase tracking-wider">
                                  🎁 您今年要守護的收禮對象是：
                                </div>
                                <div className="text-2xl font-black text-[#0F261C] mt-0.5">
                                  {myTargetUser?.name}
                                </div>
                              </div>
                            </div>
                            <Award className="w-8 h-8 text-[#9E2A2B]/80 hidden sm:block" />
                          </div>

                          <div className="space-y-3 text-xs sm:text-sm">
                            <div className="p-3.5 rounded-xl bg-white/75 border border-[#D5C9A8]">
                              <div className="font-bold text-[#143828] mb-1 flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-[#B8860B]" />
                                <span>他的聖誕襪許願線索：</span>
                              </div>
                              <p className="text-[#24382E] leading-relaxed font-medium">
                                {myTargetUser?.wishlist || '他沒有填寫具體心願，快看看下方精靈悄悄話怎麼說！'}
                              </p>
                            </div>

                            <div className="p-3.5 rounded-xl bg-[#FDE8E8]/90 border border-[#E05A47]/40">
                              <div className="font-bold text-[#9E2A2B] mb-1 flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-[#9E2A2B]" />
                                <span>千叮萬囑的地雷警報（請勿購買）：</span>
                              </div>
                              <p className="text-[#5C191B] font-medium">
                                {myTargetUser?.blacklist || '無特別地雷限制'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* 大家給這位收禮對象的匿名靈感助攻 */}
                        <div className="p-4 rounded-2xl bg-[#081A13]/90 border border-[#D4AF37]/25 space-y-2.5">
                          <div className="text-xs font-bold text-[#F3E5AB] flex items-center gap-1.5">
                            <MessageSquarePlus className="w-4 h-4 text-[#D4AF37]" />
                            <span>全場精靈給您準備「{myTargetUser?.name}」禮物的悄悄話助攻：</span>
                          </div>
                          {getSuggestionsForUser(myTargetUser?.id).length === 0 ? (
                            <p className="text-xs text-[#7A9186]">目前尚無匿名推薦，可參考上方他的個人心願線索挑選！</p>
                          ) : (
                            <ul className="space-y-2">
                              {getSuggestionsForUser(myTargetUser?.id).map(s => (
                                <li key={s.id} className="text-xs text-[#EAE6DF] bg-[#10291F] px-3 py-2 rounded-xl border border-[#D4AF37]/20">
                                  <span className="text-[#F3E5AB] font-semibold mr-2">[{s.tag}]</span>
                                  {s.content}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 右側：大家匿名推薦「我」收什麼 (抽籤後驚喜解鎖) */}
                <div className="lg:col-span-5 bg-gradient-to-br from-[#0F291E]/95 to-[#0A1D15]/95 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-2xl flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/20 text-[#F3E5AB] border border-[#D4AF37]/30 text-xs font-bold">
                      <Unlock className="w-3.5 h-3.5 text-[#D4AF37]" />
                      抽籤後驚喜解鎖
                    </div>
                    <h3 className="text-lg font-extrabold text-[#FFF8E7]">
                      大家匿名推薦「{currentUser.name}」收什麼？
                    </h3>
                    <p className="text-xs text-[#A3B8AE] leading-relaxed">
                      你永遠不會知道今年是哪位神秘聖誕老人抽到你，但你可以看看朋友們都在背後偷偷推坑你收什麼禮物！
                    </p>

                    <div className="space-y-2.5 pt-2">
                      {getSuggestionsForUser(currentUser.id).length === 0 ? (
                        <div className="p-6 rounded-2xl bg-[#071712]/70 border border-[#D4AF37]/15 text-center text-xs text-[#7A9186]">
                          還沒有朋友匿名推坑你禮物喔！快去「3. 精靈悄悄話」互相推坑吧！
                        </div>
                      ) : (
                        getSuggestionsForUser(currentUser.id).map(s => (
                          <div
                            key={s.id}
                            className="p-3.5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/20 text-xs text-[#FFF8E7] leading-relaxed"
                          >
                            <div className="text-[11px] font-bold text-[#D4AF37] mb-1">
                              🎄 匿名聖誕精靈（{s.tag}）：
                            </div>
                            {s.content}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/20 text-[11px] text-[#A3B8AE] flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <span>
                      <strong>隱私安全驗證：</strong>您可以試著切換頂部不同人的視角（沙盒模式下），驗證每個人都只能拆開自己的收禮對象，且全場沒有任何人重複中籤或抽到指定伴侶！
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* Modal 1: 新增參與者彈窗 */}
      {/* ========================================== */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E261C] border border-[#D4AF37]/40 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#FFF8E7] flex items-center gap-2">
                <Trees className="w-5 h-5 text-[#D4AF37]" />
                <span>報名加入聖誕交換禮物木屋</span>
              </h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-[#A3B8AE] hover:text-white text-sm"
              >
                關閉
              </button>
            </div>

            <form onSubmit={handleCreateParticipant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#F3E5AB] mb-1.5">選擇代表您的聖誕頭像：</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_OPTIONS.map(emoji => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setNewUserAvatar(emoji)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition ${
                        newUserAvatar === emoji
                          ? 'bg-[#D4AF37] text-[#071712] ring-2 ring-[#FFF8E7] scale-110'
                          : 'bg-[#071712] hover:bg-[#153528] border border-[#D4AF37]/20'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F3E5AB] mb-1.5">您的暱稱 / 姓名：</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="例如：小宇、派對女王..."
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#153528] text-[#C6D6CE] text-xs font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-xs font-bold shadow-lg"
                >
                  確認掛上聖誕襪
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Modal 2: 雲端木屋切換與建立彈窗 */}
      {/* ========================================== */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E261C] border border-[#D4AF37]/40 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-4">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-[#6EE7B7]" />
                <h3 className="text-lg font-extrabold text-[#FFF8E7]">
                  雲端多人派對木屋管理（即時同步儲存）
                </h3>
              </div>
              <button
                onClick={() => setShowRoomModal(false)}
                className="px-3 py-1 rounded-lg bg-[#153528] text-[#C6D6CE] hover:text-white text-xs font-bold"
              >
                關閉
              </button>
            </div>

            {/* 區塊 1: 輸入代碼快速切換房間 + 已存在雲端房間列表 */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-[#F3E5AB] uppercase tracking-wider">
                🔑 輸入木屋代碼加入朋友的交換禮物
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={e => setJoinCodeInput(e.target.value)}
                  placeholder="輸入代碼（例如：SANTA-888 或 NOEL-123）"
                  className="flex-1 bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] font-mono uppercase focus:outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="button"
                  onClick={() => handleJoinRoomByCode()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#E6C65B] text-[#071712] text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>進入木屋</span>
                </button>
              </div>

              {cloudRoomList.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs text-[#A3B8AE] mb-2">目前雲端已建立的聖誕木屋（點擊可直接切換）：</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {cloudRoomList.map(r => {
                      const isCurrent = r.code === activeRoomCode;
                      return (
                        <button
                          key={r.code}
                          type="button"
                          onClick={() => handleJoinRoomByCode(r.code)}
                          className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                            isCurrent
                              ? 'bg-[#173D2E] border-[#D4AF37] text-[#FFF8E7]'
                              : 'bg-[#071712]/80 border-[#D4AF37]/20 hover:border-[#D4AF37]/50 text-[#C6D6CE]'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-mono font-bold text-xs text-[#F3E5AB] flex items-center gap-1.5">
                              <span>{r.code}</span>
                              {isCurrent && <Check className="w-3.5 h-3.5 text-[#6EE7B7]" />}
                            </div>
                            <div className="text-xs truncate mt-0.5">{r.name}</div>
                          </div>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#153528] text-[#F3E5AB] shrink-0">
                            {r.participantCount} 人
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 區塊 2: 建立全新派對房間 */}
            <form onSubmit={handleCreateNewRoom} className="pt-4 border-t border-[#D4AF37]/20 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#A7F3D0]">
                <FolderPlus className="w-4 h-4 text-[#D4AF37]" />
                <span>建立全新的聖誕交換禮物木屋</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#C6D6CE] mb-1">派對活動名稱：</label>
                  <input
                    type="text"
                    required
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    placeholder="例如：🎄 2026 大學死黨聖誕交換禮物"
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C6D6CE] mb-1">主辦人（您）的暱稱：</label>
                  <input
                    type="text"
                    required
                    value={newHostName}
                    onChange={e => setNewHostName(e.target.value)}
                    placeholder="例如：小傑"
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C6D6CE] mb-1">禮物預算範圍：</label>
                  <input
                    type="text"
                    value={newRoomBudget}
                    onChange={e => setNewRoomBudget(e.target.value)}
                    placeholder="例如：NT$ 500 ~ 1,000"
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C6D6CE] mb-1">預計拆禮物時間：</label>
                  <input
                    type="text"
                    value={newRoomDate}
                    onChange={e => setNewRoomDate(e.target.value)}
                    placeholder="例如：2026-12-25 20:00"
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetDemoRoom}
                  className="text-xs text-[#A3B8AE] hover:text-[#F3E5AB] underline"
                >
                  🔄 將目前木屋重置為 5 人示範資料
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-xs font-bold shadow-lg"
                >
                  ✨ 立即建立雲端聖誕木屋
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Modal 3: 邀請朋友加入派對 (含 QR Code 與步驟教學) */}
      {/* ========================================== */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E261C] border border-[#D4AF37]/40 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h3 className="text-lg font-extrabold text-[#FFF8E7] flex items-center gap-2">
                <Share2 className="w-5 h-5 text-[#D4AF37]" />
                <span>發送北歐聖誕派對邀請卡</span>
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-[#A3B8AE] hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-[#153528]"
              >
                關閉
              </button>
            </div>

            {/* 專屬房號與 QR Code 展示卡 */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#163829] via-[#0B2017] to-[#2B1215] border border-[#D4AF37]/40 text-center space-y-3">
              <div className="text-xs text-[#F3E5AB] font-medium">{roomInfo.name}</div>
              <div className="text-3xl font-mono font-black tracking-widest text-[#FFD966]">
                {roomInfo.code}
              </div>
              <div className="text-xs text-[#C6D6CE]">
                禮物預算：{roomInfo.budget} ｜ 拆禮時間：{roomInfo.eventDate}
              </div>

              {/* 動態生成房號資訊 QR Code */}
              <div className="py-2 flex justify-center">
                <div className="p-3 bg-[#FFFDF9] rounded-2xl shadow-lg inline-block border-2 border-[#D4AF37]">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                      `SecretSantaRoom:${roomInfo.code}`
                    )}`}
                    alt="Room QR Code"
                    className="w-32 h-32 rounded-lg"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#A3B8AE]">
                聚會現場可讓朋友掃描或輸入上方木屋代碼 <strong className="text-[#FFF8E7]">{roomInfo.code}</strong> 對號入座
              </p>
            </div>

            {/* 朋友加入 3 步驟說明 */}
            <div className="space-y-2.5 text-xs text-[#D7E2DC] bg-[#071712]/80 p-4 rounded-2xl border border-[#D4AF37]/20">
              <div className="font-bold text-[#F3E5AB] text-sm mb-1">💡 朋友點開網址後怎麼加入？</div>
              <div className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#9E2A2B] text-white font-bold text-[10px] shrink-0 mt-0.5">步驟 1</span>
                <span>點擊右上角「<strong>切換 / 新建木屋</strong>」，輸入您的木屋代碼 <strong className="text-[#FFD966]">{roomInfo.code}</strong>。</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#9E2A2B] text-white font-bold text-[10px] shrink-0 mt-0.5">步驟 2</span>
                <span>點擊頂部「<strong>+ 新朋友報名</strong>」輸入自己的名字，並到「2. 聖誕襪與避開」填寫心願與伴侶防呆。</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[#9E2A2B] text-white font-bold text-[10px] shrink-0 mt-0.5">步驟 3</span>
                <span>全員掛好心願襪後，由身為「<strong>主辦人</strong>」的您按下搖鈴抽籤，大家就能在各自手機拆開火漆信封！</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg"
              >
                <Copy className="w-4 h-4 text-[#F3E5AB]" />
                <span>一鍵複製 LINE 聖誕邀請函</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Modal 4: 系統架構與技術規格摘要彈窗 */}
      {/* ========================================== */}
      {showArchitectureModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E261C] border border-[#D4AF37]/40 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h3 className="text-lg font-extrabold text-[#FFF8E7] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <span>系統架構與防呆設計重點摘要</span>
              </h3>
              <button
                onClick={() => setShowArchitectureModal(false)}
                className="px-3 py-1 rounded-lg bg-[#153528] text-[#C6D6CE] hover:text-white text-xs font-bold"
              >
                關閉
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-[#D7E2DC] leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
              <div className="p-3.5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/20">
                <div className="font-bold text-[#F3E5AB] mb-1">1. 帶有限制條件之完全錯位排列演算法 (Derangement with Constraints)</div>
                <p>採用有向圖深度優先回溯法（DFS Backtracking）結合 Fisher-Yates 隨機洗牌與最少分支優先啟發式（MRV Heuristic）。保證每個人嚴格送出 1 份、收到 1 份，且 100% 避開自己與指定伴侶。當設定條件在數學上無解時（如 2 人互設避開），會立即觸發 Deadlock 死結警報。</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/20">
                <div className="font-bold text-[#A7F3D0] mb-1">2. 多人雲端即時同步架構 (Firebase Firestore Real-time Sync)</div>
                <p>透過 Firestore `onSnapshot` 建立雙向即時資料流。任何參與者修改心願、綁定伴侶、投遞匿名靈感或由主辦人發起抽籤，所有連線中的手機與電腦皆會在毫秒級別內自動更新狀態。</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/20">
                <div className="font-bold text-[#FCA5A5] mb-1">3. 嚴格隱私與匿名靈感池 (Row-Level Privacy & Zero-Trace Suggestions)</div>
                <p>「聖誕精靈悄悄話」在寫入時完全不儲存 `author_id`，從資料庫層面杜絕筆跡追蹤；而配對揭曉採用火漆封蠟二次確認與單一視角過濾，確保每個人只能查詢 `giver_id === currentUser.id` 的目標對象。</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}