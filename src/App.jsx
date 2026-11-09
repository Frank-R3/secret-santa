import React, { useState, useMemo, useEffect } from 'react';
import {
  Gift, Users, Sparkles, ShieldAlert, HeartOff,
  MessageSquarePlus, Lock, CheckCircle2, Clock,
  Copy, Trash2, EyeOff, Wand2,
  AlertTriangle, Share2, Shuffle,
  FolderPlus, KeyRound, Check,
  Trees, Flame, Bell, LogOut, ShieldCheck,
  Home, Plus, ArrowLeft, UserCheck, DoorOpen
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
  deleteDoc,
  onSnapshot,
  collection
} from 'firebase/firestore';

// ==========================================
// 0. 雲端資料庫與環境變數設定 (自動相容 Canvas 預覽與 Vercel .env)
// ==========================================
const getViteEnv = (key) => {
  try {
    const env = new Function('try { return import.meta.env; } catch (e) { return {}; }')();
    return (env && env[key]) || "";
  } catch {
    return "";
  }
};

const EXTERNAL_FIREBASE_CONFIG = {
  apiKey: getViteEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getViteEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getViteEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getViteEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getViteEnv('VITE_FIREBASE_APP_ID')
};

const EXTERNAL_GEMINI_API_KEY = getViteEnv('VITE_GEMINI_API_KEY');

let app = null;
let auth = null;
let db = null;

try {
  const rawConfig =
    typeof __firebase_config !== 'undefined' && __firebase_config
      ? JSON.parse(__firebase_config)
      : EXTERNAL_FIREBASE_CONFIG;

  if (rawConfig && rawConfig.apiKey) {
    app = initializeApp(rawConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (err) {
  console.warn('Firebase initialization skipped or failed, running in local fallback mode:', err);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'secret-santa-prod-v1';

// 預設系統管理員通行碼（除了創辦人外，輸入此密碼也可刪除任何木屋）
const SYSTEM_ADMIN_PIN = '8888';

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

  const validReceiversMap = new Map();
  for (const giver of participants) {
    const valid = participants
      .filter(receiver => {
        if (receiver.id === giver.id) return false;
        if (giver.excludedId && receiver.id === giver.excludedId) return false;
        if (receiver.excludedId && receiver.excludedId === giver.id) return false;
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

  const sortedGivers = [...participants].sort(
    (a, b) => validReceiversMap.get(a.id).length - validReceiversMap.get(b.id).length
  );

  const shuffle = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const result = new Map();
  const usedReceivers = new Set();

  const backtrack = (index) => {
    if (index === n) return true;
    const currentGiver = sortedGivers[index];
    const candidates = shuffle(validReceiversMap.get(currentGiver.id));

    for (const candidateId of candidates) {
      if (!usedReceivers.has(candidateId)) {
        result.set(currentGiver.id, candidateId);
        usedReceivers.add(candidateId);
        if (backtrack(index + 1)) return true;
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
      error: '偵測到配對死結！人數過少且多對情侶互相避開，導致無法完成配對。請新增參與者或解除部分避開限制。'
    };
  }

  return {
    success: true,
    pairings: Object.fromEntries(result)
  };
}

// ==========================================
// 2. Gemini AI 智慧模糊化助手 API
// ==========================================
async function obfuscateWishlistWithAI(rawText, budgetRange) {
  const apiKey = EXTERNAL_GEMINI_API_KEY || "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const systemPrompt = `你是一位幽默、有創意且溫暖的「聖誕交換禮物心願潤飾大師」。
請將使用者輸入的「具體願望或興趣」，轉化為 2 到 3 句充滿北歐聖誕溫馨感、生活風格描述、且帶點幽默趣味的「模糊化線索指南」。
規則：
1. 絕對不要直接說出原本的品牌名稱或精確型號。
2. 參考房間預算範圍（${budgetRange}），讓提示聽起來合理又令人期待。
3. 使用繁體中文（台灣習慣用語），字數控制在 80 字以內，直接輸出潤飾後的文字即可。`;

  const payload = {
    contents: [{ parts: [{ text: `請幫我模糊化這個交換禮物心願：「${rawText}」` }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  const delays = [1000, 2000];
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
    } catch {
      if (attempt === delays.length) {
        return `✨ 想要一個能為冬日生活注入溫暖儀式感的質感好物！它可能跟「${rawText.slice(0, 4)}...」的領域有點關係，適合在微涼夜晚陪伴我，期待聖誕老人的驚喜挑選！`;
      }
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
}

// ==========================================
// 3. 預設示範資料
// ==========================================
const AVATAR_OPTIONS = ['🎅', '🦌', '⛄', '🎄', '🧝', '🦊', '🐻‍❄️', '🐧', '🦉', '🍪'];

const INITIAL_PARTICIPANTS = [
  {
    id: 'u1',
    name: '小傑',
    pin: '1234',
    avatar: '🎅',
    isHost: true,
    excludedId: 'u2',
    isReady: true,
    wishlist: '最近迷上手沖咖啡與冬日露營，希望收到能提升早晨醒腦儀式感、或是戶外野營時用得到的溫潤木質/金屬質感小物！',
    blacklist: '一般印字馬克杯、星巴克禮券、過期咖啡豆',
  },
  {
    id: 'u2',
    name: '小美',
    pin: '1234',
    avatar: '🦌',
    isHost: false,
    excludedId: 'u1',
    isReady: true,
    wishlist: '下班後喜歡窩在沙發看書追劇，想要能讓房間充滿北歐木質香氣、或是冬天抱起來超級療癒柔軟的居家放鬆神器～',
    blacklist: '護手霜禮盒、絨毛大玩偶、甜膩果香蠟燭',
  },
  {
    id: 'u3',
    name: '阿凱',
    pin: '1234',
    avatar: '⛄',
    isHost: false,
    excludedId: '',
    isReady: false,
    wishlist: '身為每天盯著雙螢幕的工程師，渴望能拯救肩頸痠痛、或是讓辦公桌面看起來更極簡酷炫的深色系科技配件！',
    blacklist: '滑鼠墊、奇怪造型隨身碟',
  }
];

const INITIAL_SUGGESTIONS = [
  { id: 's1', targetUserId: 'u1', content: '他上次露營把磨豆機摔壞了，送他手搖磨豆機或鈦金屬露營杯準沒錯！', tag: '實用情報' },
  { id: 's2', targetUserId: 'u2', content: '她最近超愛木質調（雪松、檀香），送融蠟燈或擴香石她一定會尖叫！', tag: '閨蜜線報' },
];

const DEFAULT_ROOM_INFO = {
  name: '🎄 2026 聖誕交換禮物示範木屋',
  code: 'SANTA-888',
  budget: 'NT$ 800 ~ 1,200',
  eventDate: '2026-12-25 19:30',
  allowForceDraw: false,
  creatorName: '小傑'
};

const SNOWFLAKES = [
  { left: '8%', size: 5, duration: '19s', delay: '0s', opacity: 0.22 },
  { left: '22%', size: 7, duration: '24s', delay: '3s', opacity: 0.16 },
  { left: '45%', size: 5, duration: '18s', delay: '5s', opacity: 0.25 },
  { left: '68%', size: 8, duration: '26s', delay: '2s', opacity: 0.15 },
  { left: '88%', size: 5, duration: '21s', delay: '4s', opacity: 0.2 },
];

// ==========================================
// 4. 主應用程式組件
// ==========================================
export default function SecretSantaApp() {
  // 解析網址是否有夾帶 ?room=木屋代碼（朋友點邀請連結時直接帶入）
  const invitedRoomFromUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) return roomParam.trim().toUpperCase();
    }
    return null;
  }, []);

  const [firebaseUser, setFirebaseUser] = useState(null);

  // 全域使用者帳號狀態：{ name: '小傑', pin: '1234', avatar: '🎅' }
  const [globalAccount, setGlobalAccount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('santa_global_account_v2');
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return null;
  });

  // 全域會員名冊（儲存在雲端，避免撞名與核對密碼）
  const [registeredAccounts, setRegisteredAccounts] = useState([
    { name: '小傑', pin: '1234', avatar: '🎅' },
    { name: '小美', pin: '1234', avatar: '🦌' },
    { name: '阿凱', pin: '1234', avatar: '⛄' }
  ]);

  // 當前所在的小木屋代碼（若為 null 代表在「網站首頁：小木屋總覽大廳」）
  const [activeRoomCode, setActiveRoomCode] = useState(invitedRoomFromUrl || null);

  // 所有雲端小木屋總覽列表
  const [cloudRoomList, setCloudRoomList] = useState([
    {
      code: 'SANTA-888',
      name: DEFAULT_ROOM_INFO.name,
      budget: DEFAULT_ROOM_INFO.budget,
      eventDate: DEFAULT_ROOM_INFO.eventDate,
      creatorName: DEFAULT_ROOM_INFO.creatorName,
      participantCount: INITIAL_PARTICIPANTS.length,
      hasDrawn: false
    }
  ]);

  // 當前進入的小木屋詳細資料
  const [roomInfo, setRoomInfo] = useState(DEFAULT_ROOM_INFO);
  const [participants, setParticipants] = useState(INITIAL_PARTICIPANTS);
  const [suggestions, setSuggestions] = useState(INITIAL_SUGGESTIONS);
  const [pairings, setPairings] = useState(null);

  // 管理員解鎖狀態
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

  // 首頁全域登入 / 註冊表單狀態
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authName, setAuthName] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authAvatar, setAuthAvatar] = useState('🎅');

  // 頁面頁籤與互動狀態
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [drawError, setDrawError] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isBoxOpened, setIsBoxOpened] = useState(false);

  // 彈窗開關
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [roomCodeToDelete, setRoomCodeToDelete] = useState(null); // 欲刪除的木屋代碼
  const [adminPinInput, setAdminPinInput] = useState('');

  // 首頁快速輸入房號加入
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // 建立新木屋表單狀態（因為已先登入，創辦人直接就是 globalAccount.name！）
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomBudget, setNewRoomBudget] = useState('NT$ 500 ~ 1,000');
  const [newRoomDate, setNewRoomDate] = useState('2026-12-25 20:00');

  // 匿名靈感表單狀態
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [suggestionInput, setSuggestionInput] = useState('');
  const [suggestionTag, setSuggestionTag] = useState('實用情報');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // 動態產生帶 ?room=木屋代碼 的專屬邀請連結
  const shareableRoomUrl = useMemo(() => {
    if (typeof window === 'undefined' || !activeRoomCode) return '';
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?room=${encodeURIComponent(activeRoomCode)}`;
  }, [activeRoomCode]);

  // 切換首頁或進入小木屋時，同步更新網址列參數
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (activeRoomCode) {
          url.searchParams.set('room', activeRoomCode);
        } else {
          url.searchParams.delete('room');
        }
        window.history.replaceState({}, '', url.toString());
      } catch {
        // Ignore history state errors in sandboxed iframes
      }
    }
  }, [activeRoomCode]);

  // ==========================================
  // 雲端步驟 1: Firebase 匿名連線驗證
  // ==========================================
  useEffect(() => {
    if (!auth) return;
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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
    });
    return () => unsubscribe();
  }, []);

  // ==========================================
  // 雲端步驟 2: 監聽全域帳號名冊 與 所有小木屋總覽
  // ==========================================
  useEffect(() => {
    if (!firebaseUser || !db) return;

    // 監聽全域帳號名冊
    const usersDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_users', 'directory');
    const unsubUsers = onSnapshot(
      usersDocRef,
      (docSnap) => {
        if (docSnap.exists() && docSnap.data()?.accounts) {
          setRegisteredAccounts(docSnap.data().accounts);
        }
      },
      (err) => console.error('Error listening users directory:', err)
    );

    // 監聽所有小木屋總覽
    const roomsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms');
    const unsubRoomsList = onSnapshot(
      roomsColRef,
      async (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data?.roomInfo) {
            list.push({
              code: docSnap.id,
              name: data.roomInfo.name,
              budget: data.roomInfo.budget || 'NT$ 500 ~ 1,000',
              eventDate: data.roomInfo.eventDate || '聖誕夜',
              creatorName: data.roomInfo.creatorName || data.participants?.find(p => p.isHost)?.name || '主辦人',
              participantCount: (data.participants || []).length,
              hasDrawn: Boolean(data.pairings)
            });
          }
        });

        // 若雲端完全沒半間房間，建立一間預設示範木屋
        if (list.length === 0) {
          const seedRoomRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', 'SANTA-888');
          const seedData = {
            roomInfo: DEFAULT_ROOM_INFO,
            participants: INITIAL_PARTICIPANTS,
            suggestions: INITIAL_SUGGESTIONS,
            pairings: null,
            updatedAt: Date.now()
          };
          try {
            await setDoc(seedRoomRef, seedData);
          } catch (e) {
            console.error('Seed default room error:', e);
          }
        } else {
          setCloudRoomList(list);
        }
      },
      (err) => console.error('Error listening to room list:', err)
    );

    return () => {
      unsubUsers();
      unsubRoomsList();
    };
  }, [firebaseUser]);

  // ==========================================
  // 雲端步驟 3: 當進入特定小木屋時，監聽該木屋即時資料並自動將已登入者加入木屋
  // ==========================================
  useEffect(() => {
    if (!activeRoomCode || !firebaseUser || !db) return;

    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
    const unsubCurrentRoom = onSnapshot(
      roomDocRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.roomInfo) setRoomInfo(data.roomInfo);
          const roomParticipants = data.participants || [];
          setParticipants(roomParticipants);
          setSuggestions(data.suggestions || []);
          setPairings(data.pairings || null);
        }
      },
      (err) => console.error('Error listening to current room:', err)
    );

    return () => unsubCurrentRoom();
  }, [firebaseUser, activeRoomCode]);

  // 當「已登入的全域使用者」進入某間小木屋時，若他還不在名單內且尚未抽籤，自動將他加入該木屋！
  useEffect(() => {
    if (!globalAccount || !activeRoomCode) return;

    const alreadyInRoom = participants.some(
      p => p.name.toLowerCase() === globalAccount.name.toLowerCase()
    );

    if (!alreadyInRoom && !pairings) {
      const newMember = {
        id: `u_${Date.now()}`,
        name: globalAccount.name,
        pin: globalAccount.pin,
        avatar: globalAccount.avatar || '🎅',
        isHost: participants.length === 0 || roomInfo.creatorName === globalAccount.name,
        excludedId: '',
        isReady: false,
        wishlist: '',
        blacklist: ''
      };
      const updatedList = [...participants, newMember];
      syncRoomToCloud({ participants: updatedList });
      showToast(`🎄 已自動將「${globalAccount.name}」加入小木屋名單！請填寫您的聖誕心願襪。`, 'info');
    }
  }, [globalAccount, activeRoomCode, participants.length]);

  // 雲端寫入封裝
  const syncRoomToCloud = async (partialData, targetCode = activeRoomCode) => {
    if (!targetCode) return;
    const nextRoomInfo = partialData.roomInfo !== undefined ? partialData.roomInfo : roomInfo;
    const nextParticipants = partialData.participants !== undefined ? partialData.participants : participants;
    const nextSuggestions = partialData.suggestions !== undefined ? partialData.suggestions : suggestions;
    const nextPairings = partialData.pairings !== undefined ? partialData.pairings : pairings;

    if (targetCode === activeRoomCode) {
      if (partialData.roomInfo !== undefined) setRoomInfo(nextRoomInfo);
      if (partialData.participants !== undefined) setParticipants(nextParticipants);
      if (partialData.suggestions !== undefined) setSuggestions(nextSuggestions);
      if (partialData.pairings !== undefined) setPairings(nextPairings);
    }

    if (!firebaseUser || !db) return;

    try {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', targetCode);
      await setDoc(
        roomDocRef,
        {
          roomInfo: nextRoomInfo,
          participants: nextParticipants,
          suggestions: nextSuggestions,
          pairings: nextPairings,
          updatedAt: Date.now()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to sync room data:', err);
      showToast('雲端同步失敗，請檢查網路連線', 'error');
    }
  };

  // 目前在小木屋內的個人參與者物件（依登入的 globalAccount.name 對應）
  const currentUser = useMemo(() => {
    if (!globalAccount) return null;
    return (
      participants.find(p => p.name.toLowerCase() === globalAccount.name.toLowerCase()) || null
    );
  }, [participants, globalAccount]);

  // 預設選擇第一個非自己的對象作為悄悄話目標
  useEffect(() => {
    if (currentUser && participants.length > 1) {
      const other = participants.find(p => p.id !== currentUser.id);
      if (other && !selectedTargetId) {
        setSelectedTargetId(other.id);
      }
    }
  }, [currentUser, participants, selectedTargetId]);

  // 房間狀態機
  const roomStatus = useMemo(() => {
    if (pairings) return 'DRAWN_AND_REVEALED';
    const allReady = participants.length >= 2 && participants.every(p => p.isReady);
    return allReady ? 'READY_TO_DRAW' : 'WAITING_FOR_SUBMISSION';
  }, [participants, pairings]);

  const readyCount = participants.filter(p => p.isReady).length;
  const progressPercent = participants.length > 0 ? Math.round((readyCount / participants.length) * 100) : 0;

  // ==========================================
  // 全站登入 / 註冊邏輯（一進網站就先確認我是誰）
  // ==========================================
  const handleGlobalAuthSubmit = async (e) => {
    e.preventDefault();
    const cleanName = authName.trim();
    const cleanPin = authPin.trim();

    if (!cleanName || !cleanPin) {
      showToast('請輸入您的帳號（名稱）與簡易密碼！', 'warning');
      return;
    }

    // 同時檢查全域會員名冊與當前房間成員
    const existingGlobal = registeredAccounts.find(
      a => a.name.toLowerCase() === cleanName.toLowerCase()
    );
    const existingInRoom = participants.find(
      p => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    const matchedAccount = existingGlobal || existingInRoom;

    if (authMode === 'login') {
      if (!matchedAccount) {
        showToast(`找不到帳號「${cleanName}」，若您是第一次使用，請點選左方「首次使用・建立帳號」！`, 'warning');
        return;
      }
      if (matchedAccount.pin && matchedAccount.pin !== cleanPin) {
        showToast('密碼不正確！請重新輸入。', 'error');
        return;
      }
      const userObj = {
        name: matchedAccount.name,
        pin: cleanPin,
        avatar: matchedAccount.avatar || '🎅'
      };
      setGlobalAccount(userObj);
      localStorage.setItem('santa_global_account_v2', JSON.stringify(userObj));
      setAuthPin('');
      showToast(
        activeRoomCode
          ? `🎄 歡迎「${userObj.name}」！已直接帶您進入小木屋！`
          : `🎄 歡迎回來，${userObj.name}！`,
        'success'
      );
    } else {
      // 註冊新帳號
      if (matchedAccount) {
        if (matchedAccount.pin === cleanPin) {
          // 密碼相同就直接幫他登入
          const userObj = {
            name: matchedAccount.name,
            pin: cleanPin,
            avatar: matchedAccount.avatar || authAvatar
          };
          setGlobalAccount(userObj);
          localStorage.setItem('santa_global_account_v2', JSON.stringify(userObj));
          showToast(`🎄 歡迎回來，${userObj.name}！`, 'success');
          return;
        }
        showToast(`「${cleanName}」已經有人註冊過囉！請切換到「已有帳號・登入」或換個暱稱。`, 'warning');
        setAuthMode('login');
        return;
      }

      const newUserObj = {
        name: cleanName,
        pin: cleanPin,
        avatar: authAvatar
      };
      const nextAccounts = [...registeredAccounts, newUserObj];
      setRegisteredAccounts(nextAccounts);
      setGlobalAccount(newUserObj);
      localStorage.setItem('santa_global_account_v2', JSON.stringify(newUserObj));
      setAuthPin('');

      if (firebaseUser && db) {
        try {
          const usersDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_users', 'directory');
          await setDoc(usersDocRef, { accounts: nextAccounts, updatedAt: Date.now() }, { merge: true });
        } catch (err) {
          console.error('Save global user error:', err);
        }
      }

      showToast(
        activeRoomCode
          ? `🎉 帳號建立完成！已直接帶您進入受邀的小木屋！`
          : `🎉 帳號建立完成！您可以建立自己的小木屋或選擇現有木屋加入！`,
        'success'
      );
    }
  };

  // 全站登出
  const handleGlobalLogout = () => {
    setGlobalAccount(null);
    setIsBoxOpened(false);
    setIsAdminUnlocked(false);
    localStorage.removeItem('santa_global_account_v2');
    showToast('已登出帳號', 'info');
  };

  // 建立全新的雲端小木屋（因為已經先登入，創辦人直接就是 globalAccount！）
  const handleCreateNewRoom = async (e) => {
    e.preventDefault();
    if (!globalAccount) return;
    if (!newRoomName.trim()) {
      showToast('請輸入小木屋名稱！', 'warning');
      return;
    }

    const generatedCode = `NOEL-${Math.floor(100 + Math.random() * 900)}`;
    const hostId = `u_${Date.now()}`;
    const initialHost = {
      id: hostId,
      name: globalAccount.name,
      pin: globalAccount.pin,
      avatar: globalAccount.avatar || '🎅',
      isHost: true,
      excludedId: '',
      isReady: false,
      wishlist: '',
      blacklist: ''
    };

    const newRoomData = {
      roomInfo: {
        name: newRoomName.trim(),
        code: generatedCode,
        budget: newRoomBudget.trim() || 'NT$ 500 ~ 1,000',
        eventDate: newRoomDate.trim() || '2026-12-25 20:00',
        allowForceDraw: false,
        creatorName: globalAccount.name
      },
      participants: [initialHost],
      suggestions: [],
      pairings: null,
      updatedAt: Date.now()
    };

    try {
      if (firebaseUser && db) {
        const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', generatedCode);
        await setDoc(roomDocRef, newRoomData);
      } else {
        setCloudRoomList(prev => [
          {
            code: generatedCode,
            name: newRoomData.roomInfo.name,
            budget: newRoomData.roomInfo.budget,
            eventDate: newRoomData.roomInfo.eventDate,
            creatorName: globalAccount.name,
            participantCount: 1,
            hasDrawn: false
          },
          ...prev
        ]);
      }

      setRoomInfo(newRoomData.roomInfo);
      setParticipants(newRoomData.participants);
      setSuggestions([]);
      setPairings(null);
      setActiveRoomCode(generatedCode);
      setShowCreateRoomModal(false);
      setShowInviteModal(true);
      setNewRoomName('');
      showToast(`🎄 已建立「${newRoomData.roomInfo.name}」！快複製邀請連結給朋友吧！`, 'success');
    } catch (err) {
      console.error('Error creating room:', err);
      showToast('建立小木屋失敗，請稍後再試', 'error');
    }
  };

  // 刪除小木屋（限該木屋創辦人本人或輸入管理員密碼 8888）
  const handleConfirmDeleteRoom = async () => {
    if (!roomCodeToDelete) return;
    const targetRoomMeta = cloudRoomList.find(r => r.code === roomCodeToDelete);
    const creatorName = targetRoomMeta?.creatorName || (roomCodeToDelete === activeRoomCode ? roomInfo.creatorName : '');

    const isCreator =
      globalAccount &&
      creatorName &&
      globalAccount.name.toLowerCase() === creatorName.toLowerCase();
    const isAdminValid = adminPinInput.trim() === SYSTEM_ADMIN_PIN || isAdminUnlocked;

    if (!isCreator && !isAdminValid) {
      showToast(`權限不足！只有創辦人「${creatorName || '主辦人'}」本人或輸入正確管理員密碼才能刪除。`, 'error');
      return;
    }

    if (adminPinInput.trim() === SYSTEM_ADMIN_PIN) {
      setIsAdminUnlocked(true);
    }

    try {
      if (firebaseUser && db) {
        const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', roomCodeToDelete);
        await deleteDoc(roomDocRef);
      }
      setCloudRoomList(prev => prev.filter(r => r.code !== roomCodeToDelete));
      if (activeRoomCode === roomCodeToDelete) {
        setActiveRoomCode(null);
      }
      setRoomCodeToDelete(null);
      setAdminPinInput('');
      showToast(`🗑️ 已成功刪除小木屋「${roomCodeToDelete}」`, 'info');
    } catch (err) {
      console.error('Error deleting room:', err);
      showToast('刪除失敗，請稍後再試', 'error');
    }
  };

  // 更新當前使用者的個人資料與心願
  const updateCurrentUser = (updates) => {
    if (!currentUser) return;
    const nextParticipants = participants.map(p =>
      p.id === currentUser.id ? { ...p, ...updates } : p
    );
    setDrawError(null);
    syncRoomToCloud({ participants: nextParticipants });
  };

  // 觸發 Gemini AI 模糊化心願
  const handleAiObfuscate = async () => {
    if (!currentUser?.wishlist || currentUser.wishlist.trim().length < 2) {
      showToast('請先輸入一點具體的想法（例如：AirPods、咖啡機），AI 才能幫您潤飾喔！', 'warning');
      return;
    }
    setIsAiLoading(true);
    const refined = await obfuscateWishlistWithAI(currentUser.wishlist, roomInfo.budget);
    updateCurrentUser({ wishlist: refined });
    setIsAiLoading(false);
    showToast('✨ 聖誕精靈已幫您模糊化心願！', 'success');
  };

  // 送出匿名推薦靈感
  const handleAddSuggestion = async (e) => {
    e.preventDefault();
    if (!suggestionInput.trim() || !selectedTargetId) {
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
    showToast(`🦌 已匿名投遞悄悄話給「${targetName}」！`, 'success');
  };

  // 主辦人執行智慧防呆抽籤
  const handleStartDraw = async () => {
    const isRoomCreator =
      currentUser?.isHost ||
      (globalAccount && roomInfo.creatorName?.toLowerCase() === globalAccount.name.toLowerCase()) ||
      isAdminUnlocked;

    if (!isRoomCreator) {
      showToast('只有小木屋創辦人可以按下搖鈴抽籤喔！', 'warning');
      return;
    }
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
    showToast('🔔 聖誕鐘聲響起！抽籤完成，快拆開您的火漆封蠟信封吧！', 'success');
  };

  // 主辦人移除未完成或離線成員
  const handleRemoveParticipant = async (id) => {
    if (participants.length <= 2) {
      showToast('小木屋至少需保留 2 位成員喔！', 'warning');
      return;
    }
    const target = participants.find(p => p.id === id);
    const nextParticipants = participants
      .filter(p => p.id !== id)
      .map(p => (p.excludedId === id ? { ...p, excludedId: '' } : p));

    await syncRoomToCloud({ participants: nextParticipants });
    showToast(`已將「${target?.name}」移出小木屋`, 'info');
  };

  // 複製包含「直接進入連結」的聖誕邀請函
  const handleCopyInvite = () => {
    const inviteText = `🎄 叮叮噹！${globalAccount?.name || '朋友'}邀請你參加「${roomInfo.name}」交換禮物派對！\n\n👉 點擊專屬連結，登入後直接進入我們的小木屋：\n${shareableRoomUrl}\n\n🎁 禮物預算：${roomInfo.budget}\n📅 拆禮時間：${roomInfo.eventDate}\n🔑 木屋代碼：${roomInfo.code}`;
    try {
      const textarea = document.createElement('textarea');
      textarea.value = inviteText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('📋 已複製邀請函與專屬直達連結！快貼到 LINE 群組吧！', 'success');
    } catch {
      showToast('複製成功！連結：' + shareableRoomUrl, 'success');
    }
  };

  // 取得「我抽到的對象」資訊
  const myTargetUser = useMemo(() => {
    if (!pairings || !currentUser || !pairings[currentUser.id]) return null;
    const targetId = pairings[currentUser.id];
    return participants.find(p => p.id === targetId) || null;
  }, [pairings, currentUser, participants]);

  const getSuggestionsForUser = (uid) => {
    return suggestions.filter(s => s.targetUserId === uid);
  };

  // 判斷某個木屋是否由當前登入者創辦
  const isOwnerOfRoom = (creatorName) => {
    if (!globalAccount || !creatorName) return false;
    return globalAccount.name.toLowerCase() === creatorName.toLowerCase();
  };

  return (
    <div className="min-h-screen bg-[#071712] text-[#F7F4EB] font-sans pb-20 selection:bg-[#9E2A2B] selection:text-[#FFF8E7] relative overflow-x-hidden">
      {/* 聖誕美學輕量樣式 */}
      <style>{`
        @keyframes gentleSnow {
          0% { transform: translateY(-5vh) translateX(0px); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(105vh) translateX(20px); opacity: 0; }
        }
        .noel-snow {
          position: fixed;
          top: -20px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255,250,235,0.85) 0%, rgba(255,250,235,0.1) 100%);
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

      {/* 靜謐背景微光與輕柔雪花 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 w-[26rem] h-[26rem] bg-[#9E2A2B]/15 rounded-full blur-[130px]" />
        <div className="absolute top-1/3 -right-24 w-[24rem] h-[24rem] bg-[#D4AF37]/10 rounded-full blur-[140px]" />
        {SNOWFLAKES.map((flake, i) => (
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
      {/* 情境 1：尚未登入時 ➔ 一進網站強制先顯示「全站登入 / 建立帳號」首頁 */}
      {/* ========================================== */}
      {!globalAccount ? (
        <div className="relative z-10 max-w-md mx-auto px-4 pt-12 pb-10">
          <div className="text-center mb-6 space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-bold">
              <Trees className="w-4 h-4 text-[#D4AF37]" />
              <span>聖誕交換禮物派對平台</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#FFFDF9]">
              歡迎來到秘密聖誕村
            </h1>
            <p className="text-xs text-[#A3B8AE]">
              請先登入或建立您的專屬身分，即可建立小木屋或進入朋友的派對！
            </p>
          </div>

          {/* 若是點擊朋友邀請連結進來的，顯示貼心直達提示 */}
          {activeRoomCode && (
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-[#9E2A2B]/90 to-[#7A1F20]/90 border border-[#D4AF37] text-[#FFF8E7] shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#071712]/40 flex items-center justify-center text-xl shrink-0">
                💌
              </div>
              <div className="text-xs leading-relaxed">
                <div className="font-bold text-[#F3E5AB]">您已收到小木屋邀請函！</div>
                <div>
                  完成下方登入或建立帳號後，將直接進入小木屋 <strong className="underline font-mono">{activeRoomCode}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-br from-[#0F291E]/95 via-[#0B2017]/95 to-[#122D22]/95 border-2 border-[#D4AF37]/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            {/* 切換「首次使用・建立帳號」與「已有帳號・登入」 */}
            <div className="grid grid-cols-2 gap-2 bg-[#071712] p-1.5 rounded-2xl border border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`py-2.5 rounded-xl text-xs font-bold transition ${
                  authMode === 'register'
                    ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow'
                    : 'text-[#A3B8AE] hover:text-white'
                }`}
              >
                ✨ 首次使用・建立帳號
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`py-2.5 rounded-xl text-xs font-bold transition ${
                  authMode === 'login'
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#E6C65B] text-[#071712] shadow'
                    : 'text-[#A3B8AE] hover:text-white'
                }`}
              >
                🔑 已有帳號・直接登入
              </button>
            </div>

            {/* 娛樂用密碼安全醒目提醒 */}
            <div className="p-3.5 rounded-2xl bg-[#3A260B]/90 border border-[#D4AF37] text-[#FEF3C7] text-xs leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#FFD966] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#FFD966] block mb-0.5">⚠️ 重要提醒：請勿使用您平常用的真實密碼！</strong>
                此款 APP 僅供派對娛樂使用，密碼採簡易保存，請隨意設定簡單的 4 碼數字或代號即可（例如：<code className="text-white font-mono">1234</code>）。
              </div>
            </div>

            <form onSubmit={handleGlobalAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-[#F3E5AB] mb-2">
                    1. 選擇您的聖誕代表頭像：
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_OPTIONS.map(emoji => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() => setAuthAvatar(emoji)}
                        className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition ${
                          authAvatar === emoji
                            ? 'bg-[#D4AF37] text-[#071712] ring-2 ring-[#FFF8E7] scale-110'
                            : 'bg-[#071712] hover:bg-[#153528] border border-[#D4AF37]/20'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  {authMode === 'register' ? '2. 設定您的帳號（即您的名稱，中英文皆可）：' : '您的帳號（名稱）：'}
                </label>
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={e => setAuthName(e.target.value)}
                  placeholder="例如：小傑、Bella、聖誕王..."
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
                {authMode === 'login' && registeredAccounts.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[#8FA89B]">快速點選已建立帳號：</span>
                    {registeredAccounts.slice(0, 8).map((acc, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setAuthName(acc.name)}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-[#153528] hover:bg-[#1E4D3B] text-[#F3E5AB] border border-[#D4AF37]/30 transition"
                      >
                        {acc.avatar} {acc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  {authMode === 'register' ? '3. 設定簡易娛樂密碼（下次登入用）：' : '輸入您的密碼：'}
                </label>
                <input
                  type="password"
                  required
                  value={authPin}
                  onChange={e => setAuthPin(e.target.value)}
                  placeholder="請輸入簡易密碼（切勿使用真實常用密碼！）"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-sm font-bold shadow-lg transition"
              >
                {activeRoomCode
                  ? `🎄 登入並直接進入小木屋 (${activeRoomCode})`
                  : authMode === 'register'
                  ? '🎄 建立帳號並進入小木屋總覽首頁'
                  : '🔑 登入進入小木屋總覽首頁'}
              </button>
            </form>
          </div>
        </div>
      ) : !activeRoomCode ? (
        /* ========================================== */
        /* 情境 2：已登入 且 在網站首頁 ➔ 「小木屋總覽大廳 (Home Lobby)」 */
        /* ========================================== */
        <div className="relative z-10 max-w-3xl mx-auto px-4 pt-6 space-y-6">
          {/* 首頁頂部使用者資訊列 */}
          <header className="bg-[#0F291E]/95 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#071712] border border-[#D4AF37]/50 flex items-center justify-center text-2xl shadow-inner">
                {globalAccount.avatar}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#A3B8AE]">目前登入身分：</span>
                  <span className="font-extrabold text-base text-[#FFF8E7]">{globalAccount.name}</span>
                  {isAdminUnlocked && (
                    <span className="px-2 py-0.5 rounded bg-[#D4AF37] text-[#071712] text-[10px] font-bold">
                      管理員模式
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8FA89B] mt-0.5">
                  您可以點選下方小木屋進入，或自己建立新木屋邀請另一團朋友！
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setShowCreateRoomModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] text-xs font-bold shadow-lg border border-[#D4AF37]/40 transition"
              >
                <Plus className="w-4 h-4 text-[#F3E5AB]" />
                <span>建立我的新小木屋</span>
              </button>

              <button
                onClick={handleGlobalLogout}
                className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#C6D6CE] text-xs font-semibold border border-[#D4AF37]/25 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>登出</span>
              </button>
            </div>
          </header>

          {/* 快速輸入代碼直達區塊 */}
          <div className="bg-[#0D231A]/90 border border-[#D4AF37]/25 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs font-bold text-[#F3E5AB] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D4AF37]" />
              <span>有朋友給的小木屋代碼嗎？可直接輸入進入：</span>
            </div>
            <div className="flex w-full sm:w-auto gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value)}
                placeholder="例如：NOEL-123"
                className="flex-1 sm:w-44 bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2 text-xs text-[#FFF8E7] uppercase font-mono"
              />
              <button
                onClick={() => {
                  const clean = joinCodeInput.trim().toUpperCase();
                  if (!clean) return;
                  setActiveRoomCode(clean);
                  setJoinCodeInput('');
                }}
                className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-bold shrink-0 transition"
              >
                直接進入
              </button>
            </div>
          </div>

          {/* 小木屋總覽列表 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base sm:text-lg font-extrabold text-[#FFF8E7] flex items-center gap-2">
                <Home className="w-5 h-5 text-[#D4AF37]" />
                <span>所有聖誕小木屋總覽 ({cloudRoomList.length})</span>
              </h2>
              <span className="text-xs text-[#8FA89B]">
                僅創辦人本人或管理員可刪除木屋
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cloudRoomList.map(room => {
                const isMyCreatedRoom = isOwnerOfRoom(room.creatorName);
                return (
                  <div
                    key={room.code}
                    className="bg-[#0F291E]/90 hover:bg-[#133325] border border-[#D4AF37]/30 rounded-3xl p-5 shadow-lg transition flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-extrabold text-[#FFF8E7] leading-snug">
                          {room.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-lg bg-[#071712] border border-[#D4AF37]/30 text-[11px] font-mono text-[#F3E5AB] shrink-0">
                          {room.code}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#C6D6CE]">
                        <span className="inline-flex items-center gap-1 bg-[#071712]/70 px-2.5 py-1 rounded-lg">
                          👑 創辦人：<strong className="text-[#FFF8E7]">{room.creatorName}</strong>
                          {isMyCreatedRoom && (
                            <span className="ml-1 px-1.5 py-0.2 bg-[#D4AF37] text-[#071712] rounded text-[10px] font-bold">
                              我創辦的
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-[#071712]/70 px-2.5 py-1 rounded-lg">
                          <Users className="w-3.5 h-3.5 text-[#6EE7B7]" />
                          <strong>{room.participantCount} 人</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#D4AF37]/15 gap-2">
                      <button
                        type="button"
                        onClick={() => setRoomCodeToDelete(room.code)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#3B0D11]/60 hover:bg-[#3B0D11] text-[#FCA5A5] border border-[#E05A47]/30 text-xs font-semibold transition"
                        title="僅創辦人或管理員可刪除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>刪除</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveRoomCode(room.code);
                          setIsBoxOpened(false);
                        }}
                        className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#E6C65B] hover:brightness-105 text-[#071712] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow transition"
                      >
                        <DoorOpen className="w-4 h-4" />
                        <span>進入此小木屋</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        /* ========================================== */
        /* 情境 3：已登入 且 在特定小木屋內 ➔ 極簡乾淨的小木屋內部視圖 */
        /* ========================================== */
        <div>
          <header className="relative z-10 bg-gradient-to-b from-[#112D22]/95 to-[#071712] pt-5 pb-6 px-4 border-b border-[#D4AF37]/20">
            <div className="max-w-3xl mx-auto space-y-4">
              {/* 第一列：返回首頁總覽按鈕 與 邀請/當前帳號 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => setActiveRoomCode(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#F3E5AB] text-xs font-bold border border-[#D4AF37]/30 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>返回小木屋總覽首頁</span>
                </button>

                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#123124] border border-[#D4AF37]/30 text-xs">
                    <span>{globalAccount.avatar}</span>
                    <span className="font-bold text-[#FFF8E7]">{globalAccount.name}</span>
                  </div>

                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] text-xs font-bold shadow-lg border border-[#D4AF37]/40 transition"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#F3E5AB]" />
                    <span>邀請朋友</span>
                  </button>
                </div>
              </div>

              {/* 第二列：小木屋名稱 與 目前人數（乾淨呈現） */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#FFFDF9]">
                    {roomInfo.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#C6D6CE] mt-2">
                    <span className="inline-flex items-center gap-1.5 bg-[#0E261C] px-3 py-1 rounded-lg border border-[#D4AF37]/25">
                      <Users className="w-3.5 h-3.5 text-[#6EE7B7]" />
                      目前人數：<strong className="text-[#FFF8E7]">{participants.length} 人</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-[#0E261C] px-3 py-1 rounded-lg border border-[#D4AF37]/25">
                      👑 創辦人：<strong className="text-[#FFF8E7]">{roomInfo.creatorName || '主辦人'}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-[#0E261C] px-3 py-1 rounded-lg border border-[#D4AF37]/25">
                      <Gift className="w-3.5 h-3.5 text-[#D4AF37]" />
                      預算：<strong className="text-[#FFF8E7]">{roomInfo.budget}</strong>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setRoomCodeToDelete(activeRoomCode)}
                  className="self-start sm:self-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#3B0D11]/70 hover:bg-[#3B0D11] text-[#FCA5A5] border border-[#E05A47]/40 text-xs font-semibold transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>刪除此木屋</span>
                </button>
              </div>
            </div>
          </header>

          <main className="relative z-10 max-w-3xl mx-auto px-4 pt-6 space-y-6">
            {/* 簡潔進度橫幅 */}
            <div className="bg-[#0F291E]/90 border border-[#D4AF37]/30 rounded-2xl p-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold">
                  {roomStatus === 'WAITING_FOR_SUBMISSION' && (
                    <span className="text-[#F3E5AB] flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-[#D4AF37] animate-pulse" />
                      等待大家填妥心願襪中...
                    </span>
                  )}
                  {roomStatus === 'READY_TO_DRAW' && (
                    <span className="text-[#A7F3D0] flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-[#D4AF37] animate-bounce" />
                      全員已填妥！創辦人可以搖鈴抽籤囉
                    </span>
                  )}
                  {roomStatus === 'DRAWN_AND_REVEALED' && (
                    <span className="text-[#FDE8E8] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                      抽籤已完成！請點選「4. 抽籤開箱」查看結果
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#C6D6CE]">
                  完成進度：<strong className="text-[#F3E5AB]">{readyCount} / {participants.length} 人</strong>
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#071712] rounded-full overflow-hidden p-0.5 border border-[#D4AF37]/20">
                <div
                  className={`h-full transition-all duration-700 rounded-full ${
                    roomStatus === 'DRAWN_AND_REVEALED'
                      ? 'candy-cane-bar'
                      : 'bg-gradient-to-r from-[#9E2A2B] to-[#D4AF37]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* 4 大乾淨功能頁籤 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0D231A]/95 p-1.5 rounded-2xl border border-[#D4AF37]/25 shadow-lg">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow border border-[#D4AF37]/40'
                    : 'text-[#A3B8AE] hover:text-[#FFF8E7]'
                }`}
              >
                <Trees className="w-4 h-4 text-[#D4AF37]" />
                <span>1. 木屋名單</span>
              </button>

              <button
                onClick={() => setActiveTab('profile')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow border border-[#D4AF37]/40'
                    : 'text-[#A3B8AE] hover:text-[#FFF8E7]'
                }`}
              >
                <Wand2 className="w-4 h-4 text-[#D4AF37]" />
                <span>2. 我的心願襪</span>
              </button>

              <button
                onClick={() => setActiveTab('suggestions')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'suggestions'
                    ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] shadow border border-[#D4AF37]/40'
                    : 'text-[#A3B8AE] hover:text-[#FFF8E7]'
                }`}
              >
                <MessageSquarePlus className="w-4 h-4 text-[#D4AF37]" />
                <span>3. 匿名推坑</span>
              </button>

              <button
                onClick={() => setActiveTab('reveal')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  activeTab === 'reveal'
                    ? 'bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#D4AF37] text-[#071712] shadow'
                    : 'text-[#A3B8AE] hover:text-[#FFF8E7]'
                }`}
              >
                <Gift className="w-4 h-4" />
                <span>4. 抽籤開箱</span>
                {pairings && <span className="w-2 h-2 rounded-full bg-[#9E2A2B] animate-ping" />}
              </button>
            </div>

            {/* 抽籤錯誤提示 */}
            {drawError && (
              <div className="p-4 rounded-2xl bg-[#3B0D11]/95 border border-[#E05A47] text-[#FDE8E8] flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#F3E5AB] shrink-0 mt-0.5" />
                <div className="flex-1 text-xs sm:text-sm">{drawError}</div>
                <button onClick={() => setDrawError(null)} className="text-xs text-[#F3E5AB]">關閉</button>
              </div>
            )}

            {/* TAB 1: 木屋成員名單 */}
            {activeTab === 'dashboard' && (
              <div className="space-y-5">
                {(currentUser?.isHost || isOwnerOfRoom(roomInfo.creatorName) || isAdminUnlocked) && (
                  <div className="bg-[#0F291E] border border-[#D4AF37]/35 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-[#FFF8E7] flex items-center gap-2">
                        <Bell className="w-4 h-4 text-[#D4AF37]" />
                        <span>創辦人專屬：搖鈴抽籤控制</span>
                      </div>
                      <p className="text-xs text-[#A3B8AE] mt-0.5">
                        當大家都填妥心願襪後，即可按下按鈕進行防呆配對抽籤。
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {roomStatus === 'WAITING_FOR_SUBMISSION' && (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-[#F3E5AB]">
                          <input
                            type="checkbox"
                            checked={roomInfo.allowForceDraw}
                            onChange={e => syncRoomToCloud({ roomInfo: { ...roomInfo, allowForceDraw: e.target.checked } })}
                            className="rounded border-[#D4AF37] bg-[#071712] text-[#9E2A2B]"
                          />
                          <span>允許未全員填完直接抽</span>
                        </label>
                      )}
                      <button
                        onClick={handleStartDraw}
                        disabled={roomStatus === 'WAITING_FOR_SUBMISSION' && !roomInfo.allowForceDraw}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                          roomStatus === 'WAITING_FOR_SUBMISSION' && !roomInfo.allowForceDraw
                            ? 'bg-[#152E24] text-[#5E786D] cursor-not-allowed'
                            : 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] border border-[#D4AF37]/40 shadow-lg'
                        }`}
                      >
                        <Shuffle className="w-3.5 h-3.5 text-[#F3E5AB]" />
                        <span>{pairings ? '重新搖鈴抽籤' : '🔔 立即搖鈴抽籤'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {participants.map(person => {
                    const excludedPartner = participants.find(p => p.id === person.excludedId);
                    const isMe = currentUser && person.id === currentUser.id;

                    return (
                      <div
                        key={person.id}
                        className={`rounded-2xl p-4 border transition ${
                          isMe
                            ? 'bg-[#163829] border-[#D4AF37]'
                            : 'bg-[#0D231A]/90 border-[#D4AF37]/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-[#071712] border border-[#D4AF37]/30 flex items-center justify-center text-2xl shrink-0">
                              {person.avatar}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-[#FFF8E7] text-sm">
                                  {person.name}
                                </span>
                                {isMe && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-[#D4AF37] text-[#071712] rounded-full">
                                    我
                                  </span>
                                )}
                                {(person.isHost || person.name === roomInfo.creatorName) && (
                                  <span className="px-1.5 py-0.5 text-[10px] bg-[#9E2A2B]/60 text-[#FCA5A5] rounded">
                                    創辦人
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#8FA89B] mt-0.5">
                                {excludedPartner
                                  ? `🚫 避開：${excludedPartner.name}`
                                  : '✨ 無指定避開對象'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {person.isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#123B29] text-[#A7F3D0] text-xs font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> 已填妥
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3A260B] text-[#F3E5AB] text-xs font-semibold">
                                <Clock className="w-3.5 h-3.5" /> 填寫中
                              </span>
                            )}

                            {(currentUser?.isHost || isOwnerOfRoom(roomInfo.creatorName) || isAdminUnlocked) &&
                              !person.isHost &&
                              roomStatus !== 'DRAWN_AND_REVEALED' && (
                                <button
                                  onClick={() => handleRemoveParticipant(person.id)}
                                  className="text-[#7A9186] hover:text-[#FCA5A5] p-1"
                                  title="移除此成員"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: 我的心願襪與避開設定 */}
            {activeTab === 'profile' && currentUser && (
              <div className="bg-[#0F291E]/95 border border-[#D4AF37]/30 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D4AF37]/20">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#071712] border border-[#D4AF37]/40 flex items-center justify-center text-2xl">
                      {currentUser.avatar}
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold text-[#FFF8E7]">{currentUser.name} 的聖誕心願襪</h2>
                      <p className="text-xs text-[#A3B8AE]">填寫完畢後請點選右方「確認填妥，掛上我的聖誕襪」</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const nextReady = !currentUser.isReady;
                      updateCurrentUser({ isReady: nextReady });
                      showToast(nextReady ? '🎄 已掛上您的聖誕心願襪！' : '已切換為修改中狀態');
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                      currentUser.isReady
                        ? 'bg-[#123B29] text-[#A7F3D0] border border-[#6EE7B7]/40'
                        : 'bg-gradient-to-r from-[#D4AF37] to-[#E6C65B] text-[#071712] shadow-lg'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{currentUser.isReady ? '已填妥掛襪 (點擊可修改)' : '確認填妥，掛上我的聖誕襪'}</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-[#071712]/80 border border-[#D4AF37]/20 space-y-2">
                  <div className="text-sm font-bold text-[#FCA5A5] flex items-center gap-1.5">
                    <HeartOff className="w-4 h-4 text-[#E05A47]" />
                    <span>避開對象設定（抽籤時絕對不會抽到對方）</span>
                  </div>
                  <select
                    value={currentUser.excludedId || ''}
                    onChange={e => updateCurrentUser({ excludedId: e.target.value })}
                    disabled={roomStatus === 'DRAWN_AND_REVEALED'}
                    className="w-full sm:w-72 bg-[#0F281E] border border-[#D4AF37]/30 rounded-xl px-3 py-2 text-sm text-[#FFF8E7]"
                  >
                    <option value="">✨ 無需避開任何人</option>
                    {participants
                      .filter(p => p.id !== currentUser.id)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          🚫 避開：{p.avatar} {p.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-sm font-bold text-[#FFF8E7] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                      <span>想收到的禮物方向（心願線索）</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAiObfuscate}
                      disabled={isAiLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#D4AF37] text-[#FFF8E7] text-xs font-bold shadow disabled:opacity-50"
                    >
                      <Wand2 className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                      <span>{isAiLoading ? 'AI 潤飾中...' : '✨ AI 幫我模糊化心願'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={currentUser.wishlist}
                    onChange={e => updateCurrentUser({ wishlist: e.target.value })}
                    placeholder="輸入你想收到的東西（若寫得太具體，可點右上角讓 AI 幫你轉成神秘線索）..."
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-2xl p-3.5 text-sm text-[#FFF8E7]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-[#FCA5A5] flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#E05A47]" />
                    <span>地雷清單（最不想收到的東西）</span>
                  </label>
                  <input
                    type="text"
                    value={currentUser.blacklist}
                    onChange={e => updateCurrentUser({ blacklist: e.target.value })}
                    placeholder="例如：馬克杯、護手霜、拼圖..."
                    className="w-full bg-[#071712] border border-[#9E2A2B]/50 rounded-xl px-3.5 py-2.5 text-sm text-[#FFF8E7]"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: 匿名推坑靈感池 */}
            {activeTab === 'suggestions' && (
              <div className="space-y-5">
                <form
                  onSubmit={handleAddSuggestion}
                  className="bg-[#0F291E]/95 border border-[#D4AF37]/30 rounded-3xl p-5 space-y-4"
                >
                  <div className="text-base font-bold text-[#FFF8E7] flex items-center gap-2">
                    <MessageSquarePlus className="w-5 h-5 text-[#D4AF37]" />
                    <span>匿名幫朋友推坑禮物（完全不記名）</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      value={selectedTargetId}
                      onChange={e => setSelectedTargetId(e.target.value)}
                      className="bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3 py-2 text-sm text-[#FFF8E7]"
                    >
                      {participants.map(p => (
                        <option key={p.id} value={p.id}>
                          🎯 推薦給：{p.avatar} {p.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={suggestionTag}
                      onChange={e => setSuggestionTag(e.target.value)}
                      className="bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3 py-2 text-sm text-[#FFF8E7]"
                    >
                      <option value="實用情報">💡 實用情報</option>
                      <option value="好友線報">💖 好友線報</option>
                      <option value="避雷指南">⚠️ 避雷指南</option>
                      <option value="幽默惡搞">🤣 幽默惡搞</option>
                    </select>

                    <button
                      type="submit"
                      className="py-2 px-4 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] font-bold text-xs sm:text-sm"
                    >
                      🦌 匿名送出
                    </button>
                  </div>

                  <input
                    type="text"
                    value={suggestionInput}
                    onChange={e => setSuggestionInput(e.target.value)}
                    placeholder="寫下你推薦他收到的禮物..."
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7]"
                  />
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {participants.map(person => {
                    const personSuggestions = getSuggestionsForUser(person.id);
                    return (
                      <div key={person.id} className="bg-[#0D231A]/90 border border-[#D4AF37]/20 rounded-2xl p-4">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#D4AF37]/15">
                          <span className="font-bold text-sm text-[#FFF8E7]">
                            {person.avatar} {person.name}
                          </span>
                          <span className="text-xs text-[#F3E5AB]">{personSuggestions.length} 則線報</span>
                        </div>
                        {personSuggestions.length === 0 ? (
                          <p className="text-xs text-[#6E857A] py-2">尚無匿名線報</p>
                        ) : (
                          <ul className="space-y-2 max-h-40 overflow-y-auto">
                            {personSuggestions.map(s => (
                              <li key={s.id} className="p-2.5 rounded-xl bg-[#071712] text-xs text-[#EAE6DF]">
                                <span className="text-[#D4AF37] font-bold mr-1.5">#{s.tag}</span>
                                {s.content}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 4: 火漆信封抽籤開箱 */}
            {activeTab === 'reveal' && currentUser && (
              <div>
                {!pairings ? (
                  <div className="bg-[#0F291E]/95 border border-[#D4AF37]/30 rounded-3xl p-8 text-center space-y-3">
                    <Lock className="w-10 h-10 text-[#D4AF37] mx-auto" />
                    <h2 className="text-lg font-extrabold text-[#FFF8E7]">尚未進行搖鈴抽籤</h2>
                    <p className="text-xs text-[#A3B8AE]">
                      請等待全員填妥心願襪後，由小木屋創辦人在「1. 木屋名單」按下搖鈴抽籤！
                    </p>
                  </div>
                ) : (
                  <div className="bg-[#0F291E]/95 border border-[#D4AF37]/40 rounded-3xl p-6 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#F3E5AB] flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                        專屬結果：僅「{currentUser.name}」本人可見
                      </span>
                      {isBoxOpened && (
                        <button
                          onClick={() => setIsBoxOpened(false)}
                          className="text-xs text-[#A3B8AE] hover:text-white flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> 重新封上信封
                        </button>
                      )}
                    </div>

                    {!isBoxOpened ? (
                      <div className="py-6 text-center">
                        <div
                          onClick={() => setIsBoxOpened(true)}
                          className="mx-auto max-w-sm rounded-2xl bg-gradient-to-b from-[#F5EEDB] to-[#E6DEC3] text-[#1E2923] p-6 shadow-2xl border-2 border-[#D4AF37] cursor-pointer hover:scale-[1.02] transition"
                        >
                          <div className="border border-[#C8B992] rounded-xl p-5 space-y-4">
                            <div className="text-base font-extrabold text-[#142E22]">
                              給 {currentUser.avatar} {currentUser.name} 的神秘任務信封
                            </div>
                            <div className="py-2 flex justify-center">
                              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#B83334] via-[#9E2A2B] to-[#6E1718] wax-seal-shadow border-2 border-[#D4AF37]/70 flex flex-col items-center justify-center text-[#F3E5AB]">
                                <Trees className="w-7 h-7" />
                                <span className="text-[9px] font-bold tracking-widest mt-0.5">拆封</span>
                              </div>
                            </div>
                            <p className="text-xs text-[#5C5343] font-medium">
                              請確認身旁沒有人偷看螢幕，點擊中央<strong>紅色火漆印章</strong>拆開信封！
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#F7F2E4] to-[#EAE0C8] text-[#172A20] border-2 border-[#D4AF37]">
                          <div className="flex items-center gap-3 border-b border-[#C8B992] pb-3 mb-3">
                            <div className="w-12 h-12 rounded-2xl bg-[#10281E] flex items-center justify-center text-2xl">
                              {myTargetUser?.avatar}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#9E2A2B]">🎁 您要送禮物的對象是：</div>
                              <div className="text-2xl font-black text-[#0F261C]">{myTargetUser?.name}</div>
                            </div>
                          </div>

                          <div className="space-y-2.5 text-xs sm:text-sm">
                            <div className="p-3 rounded-xl bg-white/80">
                              <div className="font-bold text-[#143828] mb-1">✨ 他的心願線索：</div>
                              <p>{myTargetUser?.wishlist || '未填寫具體心願'}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-[#FDE8E8]">
                              <div className="font-bold text-[#9E2A2B] mb-1">🚫 他的地雷清單：</div>
                              <p>{myTargetUser?.blacklist || '無特別地雷'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ========================================== */}
      {/* Modal 1: 建立新小木屋彈窗 (自動將目前登入者設為創辦人！) */}
      {/* ========================================== */}
      {showCreateRoomModal && globalAccount && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E261C] border border-[#D4AF37]/40 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h3 className="text-lg font-extrabold text-[#FFF8E7] flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[#D4AF37]" />
                <span>建立新的聖誕小木屋</span>
              </h3>
              <button
                onClick={() => setShowCreateRoomModal(false)}
                className="px-3 py-1 rounded-lg bg-[#153528] text-[#C6D6CE] text-xs font-bold"
              >
                取消
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#143527] border border-[#D4AF37]/30 flex items-center gap-3 text-xs">
              <UserCheck className="w-5 h-5 text-[#6EE7B7] shrink-0" />
              <div>
                木屋創辦人將自動設定為：<strong className="text-[#FFF8E7]">{globalAccount.avatar} {globalAccount.name}</strong>
              </div>
            </div>

            <form onSubmit={handleCreateNewRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1">小木屋名稱：</label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="例如：2026 大學死黨交換禮物"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-sm text-[#FFF8E7]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1">禮物預算範圍：</label>
                <input
                  type="text"
                  value={newRoomBudget}
                  onChange={e => setNewRoomBudget(e.target.value)}
                  placeholder="例如：NT$ 500 ~ 1,000"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-sm text-[#FFF8E7]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1">拆禮物時間 / 日期：</label>
                <input
                  type="text"
                  value={newRoomDate}
                  onChange={e => setNewRoomDate(e.target.value)}
                  placeholder="例如：2026-12-25 20:00"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-sm text-[#FFF8E7]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-sm font-bold shadow-lg"
              >
                ✨ 立即建立並產生邀請函
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Modal 2: 刪除小木屋權限驗證彈窗 (僅限創辦人本人或管理員密碼) */}
      {/* ========================================== */}
      {roomCodeToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          {(() => {
            const targetRoom = cloudRoomList.find(r => r.code === roomCodeToDelete);
            const targetCreator = targetRoom?.creatorName || roomInfo.creatorName || '主辦人';
            const isCreator = isOwnerOfRoom(targetCreator);

            return (
              <div className="bg-[#1A0D10] border border-[#E05A47] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-[#FDE8E8] flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-[#E05A47]" />
                    <span>刪除小木屋「{targetRoom?.name || roomCodeToDelete}」</span>
                  </h3>
                  <button
                    onClick={() => {
                      setRoomCodeToDelete(null);
                      setAdminPinInput('');
                    }}
                    className="text-xs text-[#FCA5A5]"
                  >
                    取消
                  </button>
                </div>

                <p className="text-xs text-[#FCD5D5] leading-relaxed">
                  只有本木屋創辦人 <strong>{targetCreator}</strong> 本人，或輸入系統管理員密碼才能刪除此木屋。
                </p>

                {isCreator ? (
                  <div className="p-3 rounded-xl bg-[#123124] border border-[#6EE7B7]/40 text-xs text-[#A7F3D0] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>系統確認您為本木屋創辦人（{globalAccount?.name}），可直接刪除！</span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-[#F3E5AB] mb-1.5">
                      您不是此木屋創辦人（{targetCreator}），若您是管理員請輸入管理員密碼：
                    </label>
                    <input
                      type="password"
                      value={adminPinInput}
                      onChange={e => setAdminPinInput(e.target.value)}
                      placeholder="請輸入管理員密碼"
                      className="w-full bg-[#071712] border border-[#E05A47]/50 rounded-xl px-3.5 py-2 text-sm text-white"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRoomCodeToDelete(null);
                      setAdminPinInput('');
                    }}
                    className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold"
                  >
                    保留木屋
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteRoom}
                    className="px-4 py-2 rounded-xl bg-[#E05A47] hover:bg-[#C94A38] text-white text-xs font-bold shadow-lg"
                  >
                    確認永久刪除
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================== */}
      {/* Modal 3: 邀請函彈窗（附上直達連結與 QR Code） */}
      {/* ========================================== */}
      {showInviteModal && activeRoomCode && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0E261C] border border-[#D4AF37]/40 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h3 className="text-lg font-extrabold text-[#FFF8E7] flex items-center gap-2">
                <Share2 className="w-5 h-5 text-[#D4AF37]" />
                <span>邀請朋友進入小木屋</span>
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-[#A3B8AE] hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-[#153528]"
              >
                關閉
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#163829] via-[#0B2017] to-[#2B1215] border border-[#D4AF37]/40 text-center space-y-3">
              <div className="text-base font-extrabold text-[#FFF8E7]">{roomInfo.name}</div>
              <div className="text-xs text-[#C6D6CE]">
                預算：{roomInfo.budget} ｜ 時間：{roomInfo.eventDate}
              </div>

              <div className="py-2 flex justify-center">
                <div className="p-3 bg-[#FFFDF9] rounded-2xl shadow-lg inline-block border-2 border-[#D4AF37]">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      shareableRoomUrl || activeRoomCode
                    )}`}
                    alt="Room Direct Link QR Code"
                    className="w-32 h-32 rounded-lg"
                  />
                </div>
              </div>

              <div className="text-left bg-[#071712]/90 p-3 rounded-xl border border-[#D4AF37]/25">
                <div className="text-[11px] text-[#F3E5AB] font-bold mb-1">🔗 小木屋專屬直達連結：</div>
                <div className="text-xs text-[#A7F3D0] font-mono break-all select-all">
                  {shareableRoomUrl}
                </div>
              </div>
              <p className="text-[11px] text-[#A3B8AE]">
                朋友點開連結後，若尚未登入會先請他建立帳號/登入，一登入就會<strong>直接進到這間小木屋</strong>！
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyInvite}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-sm font-bold flex items-center justify-center gap-2 shadow-lg"
            >
              <Copy className="w-4 h-4 text-[#F3E5AB]" />
              <span>一鍵複製邀請函（含直達連結）</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}