import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, Gift, Users, Settings, Copy, Check, Lock, 
  Unlock, Trash2, Plus, ArrowLeft, KeyRound, LogOut,
  Calendar, DollarSign, ShieldAlert, AlertTriangle, ChevronRight,
  HelpCircle, RefreshCw, Snowflake, Trees
} from 'lucide-react';

import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection
} from 'firebase/firestore';

// ==========================================
// 0. 雲端資料庫與環境變數設定
// ==========================================
const getSafeEnv = (key) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {
    // ignore
  }
  return "";
};

const EXTERNAL_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const EXTERNAL_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

let app = null;
let auth = null;
let db = null;
let isCloudConfigured = false;

try {
  if (EXTERNAL_FIREBASE_CONFIG.apiKey && EXTERNAL_FIREBASE_CONFIG.projectId) {
    app = !getApps().length ? initializeApp(EXTERNAL_FIREBASE_CONFIG) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    isCloudConfigured = true;
  }
} catch (e) {
  console.warn("Firebase initialization warning:", e);
}

const appId = 'secret_santa_app_v2026';

// ==========================================
// 1. 配對演算法（排除避開名單）
// ==========================================
function generateSecretSantaPairs(participants) {
  const n = participants.length;
  if (n < 3) throw new Error("至少需要 3 位成員才能進行交換禮物！");

  let givers = [...participants];
  let receivers = [...participants];
  let attempts = 0;
  const maxAttempts = 1000;

  while (attempts < maxAttempts) {
    attempts++;
    givers = [...participants];
    receivers = [...participants];

    // 洗牌 receivers
    for (let i = receivers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }

    let success = true;
    const assignments = [];

    for (let i = 0; i < n; i++) {
      const giver = givers[i];
      const receiver = receivers[i];

      // 檢查是否抽到自己，或在對方的迴避名單中
      const isSelf = giver.id === receiver.id;
      const isBlacklisted = giver.excludedId && giver.excludedId === receiver.id;

      if (isSelf || isBlacklisted) {
        success = false;
        break;
      }
      assignments.push({ giverId: giver.id, receiverId: receiver.id });
    }

    if (success) {
      // 雙向環狀防單向孤島檢查
      const map = {};
      assignments.forEach(a => { map[a.giverId] = a.receiverId; });
      let curr = givers[0].id;
      let count = 0;
      let visited = new Set();
      while (!visited.has(curr)) {
        visited.add(curr);
        curr = map[curr];
        count++;
      }
      if (count === n) {
        return assignments;
      }
    }
  }

  throw new Error("無法在符合「不抽到自己」與「避開指定對象」的條件下完成配對，請嘗試放寬避開限制！");
}

// ==========================================
// 2. AI 模糊化心願功能
// ==========================================
async function callGeminiBlurWish(rawWish, apiKeyToUse) {
  if (!apiKeyToUse) {
    return `🎁 驚喜禮物：${rawWish.slice(0, 15)}... (未設定 AI 金鑰)`;
  }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKeyToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `請將以下聖誕心願改寫成一句「充滿北歐冬雪詩意、不直接破費但保留禮物暗示」的優雅謎語心願。字數請在 25 字以內，不要加引號。心願內容：${rawWish}`
          }]
        }]
      })
    });
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : `🎁 來自冬雪的溫馨心願：${rawWish}`;
  } catch (err) {
    console.error("Gemini AI error:", err);
    return `🎁 神秘心願：${rawWish}`;
  }
}

// ==========================================
// 3. 專屬火漆封蠟信封組件 (Card Component)
// ==========================================
function WaxSealEnvelope({ giver, pairResult, participants, onOpen }) {
  const [isOpen, setIsOpen] = useState(false);
  const receiver = participants.find(p => p.id === pairResult.receiverId);

  const handleSealClick = () => {
    if (!isOpen) {
      setIsOpen(true);
      if (onOpen) onOpen();
    }
  };

  return (
    <div className="relative w-full max-w-sm mx-auto my-4 perspective-1000">
      <div 
        onClick={handleSealClick}
        className={`relative w-full rounded-2xl p-6 cursor-pointer transition-all duration-700 transform-style-3d shadow-2xl ${
          isOpen 
            ? 'bg-[#F4EEDC] text-[#153528] rotate-y-180 border-2 border-[#D4AF37]' 
            : 'bg-gradient-to-br from-[#122B20] to-[#071712] text-[#F9F6EE] border-2 border-[#D4AF37]/60 hover:scale-[1.02]'
        }`}
      >
        {!isOpen ? (
          <div className="flex flex-col items-center text-center py-6 space-y-4">
            <div className="text-xs uppercase tracking-widest text-[#D4AF37] font-bold">
              🎄 聖誕老人專屬秘密信封
            </div>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#9E2A2B] to-[#7A1F20] border-4 border-[#D4AF37] flex items-center justify-center shadow-2xl relative animate-pulse">
              <span className="text-2xl">🎅</span>
              <div className="absolute inset-0 rounded-full border border-white/20"></div>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-extrabold text-[#FFFDF9]">{giver.name} 的抽籤結果</div>
              <div className="text-xs text-[#D4AF37]">點擊火漆印章，親手拆開你的交換對象</div>
            </div>
            <div className="pt-2 text-[11px] text-[#A3B8AE] italic">
              「保守秘密，直到聖誕夜揭曉那一刻...」
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-4 space-y-4 rotate-y-180">
            <div className="text-xs font-bold text-[#9E2A2B] uppercase tracking-wider">
              ✨ 恭喜你抽中了！ ✨
            </div>
            <div className="w-16 h-16 rounded-full bg-[#153528] text-[#D4AF37] text-2xl flex items-center justify-center border-2 border-[#D4AF37] shadow-inner">
              {receiver?.avatar || '🎁'}
            </div>
            <div>
              <div className="text-2xl font-black text-[#153528] mb-1">{receiver?.name}</div>
              <div className="text-xs text-[#7A5523]">準備好為 TA 挑選聖誕禮物了嗎？</div>
            </div>
            <div className="w-full bg-[#EAE0C8] rounded-xl p-3 text-left border border-[#D4AF37]/40 space-y-1">
              <div className="text-[11px] font-bold text-[#5A4521] flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 text-[#9E2A2B]" />
                <span>TA 的聖誕心願與提示：</span>
              </div>
              <div className="text-xs text-[#2A1F11] font-medium leading-relaxed italic">
                {receiver?.wishlist ? receiver.wishlist : "（TA 還沒寫下心願，快去提醒他填寫！）"}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
              className="text-xs text-[#9E2A2B] underline font-bold hover:text-[#7A1F20]"
            >
              重新蓋回信封
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 4. 主應用程式組件
// ==========================================
export default function SecretSantaApp() {
  const invitedRoomFromUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        const cleanCode = roomParam.trim().toUpperCase();
        try {
          sessionStorage.setItem('santa_invited_room', cleanCode);
        } catch {
          // ignore
        }
        return cleanCode;
      }
      try {
        const savedInvite = sessionStorage.getItem('santa_invited_room');
        if (savedInvite) return savedInvite;
      } catch {
        // ignore
      }
    }
    return null;
  }, []);

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [pendingInviteRoom, setPendingInviteRoom] = useState(invitedRoomFromUrl || null);

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

  const [registeredAccounts, setRegisteredAccounts] = useState([]);
  const [activeRoomCode, setActiveRoomCode] = useState(invitedRoomFromUrl || null);
  const [cloudRoomList, setCloudRoomList] = useState([]);

  // 房間內狀態
  const [roomInfo, setRoomInfo] = useState({
    code: '',
    name: '我的聖誕小木屋',
    budget: 'NT$ 500 ~ 1,000',
    deadline: '2026-12-25 19:30',
    creatorName: ''
  });
  const [participants, setParticipants] = useState([]);
  const [pairings, setPairings] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [adminPin, setAdminPin] = useState('8888');

  // UI 互動狀態
  const [authName, setAuthName] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authAvatar, setAuthAvatar] = useState('🎅');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newRoomNameInput, setNewRoomNameInput] = useState('');
  const [deleteModalRoomCode, setDeleteModalRoomCode] = useState(null);
  const [deleteInputPin, setDeleteInputPin] = useState('');
  const [isSnowActive, setIsSnowActive] = useState(true);
  const [toast, setToast] = useState(null);
  const [isCurrentRoomLoaded, setIsCurrentRoomLoaded] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Firebase 匿名登入與雲端監聽
  useEffect(() => {
    if (!auth) return;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    signInAnonymously(auth).catch(err => console.warn("Anonymous auth warning:", err));
    return () => unsubAuth();
  }, []);

  // 監聽全域所有小木屋總覽
  useEffect(() => {
    if (!db) return;
    const roomsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms');
    const unsubRooms = onSnapshot(roomsColRef, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          code: docSnap.id,
          name: data.roomName || '未命名木屋',
          budget: data.budget || 'NT$ 500 ~ 1,000',
          deadline: data.deadline || '2026-12-25 19:30',
          creatorName: data.creatorName || '匿名',
          participantsCount: data.participants ? data.participants.length : 0
        });
      });
      setCloudRoomList(list);
    }, (err) => {
      console.error("Rooms snapshot error:", err);
    });
    return () => unsubRooms();
  }, []);

  // 監聽當前小木屋詳細資料
  useEffect(() => {
    if (!activeRoomCode || !db) {
      setIsCurrentRoomLoaded(true);
      return;
    }

    setIsCurrentRoomLoaded(false);
    setRoomNotFound(false);

    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
    
    const loadTimeout = setTimeout(() => {
      setIsCurrentRoomLoaded(true);
    }, 4500);

    const unsubCurrentRoom = onSnapshot(roomDocRef, (docSnap) => {
      clearTimeout(loadTimeout);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomInfo({
          code: activeRoomCode,
          name: data.roomName || '聖誕小木屋',
          budget: data.budget || 'NT$ 500 ~ 1,000',
          deadline: data.deadline || '2026-12-25 19:30',
          creatorName: data.creatorName || ''
        });
        setParticipants(data.participants || []);
        setPairings(data.pairings || null);
        setIsLocked(Boolean(data.isLocked));
        setAdminPin(data.adminPin || '8888');
        setRoomNotFound(false);
      } else {
        setRoomNotFound(true);
      }
      setIsCurrentRoomLoaded(true);
    }, (err) => {
      clearTimeout(loadTimeout);
      console.error("Current room snapshot error:", err);
      setIsCurrentRoomLoaded(true);
    });

    return () => {
      clearTimeout(loadTimeout);
      unsubCurrentRoom();
    };
  }, [activeRoomCode]);

  // 當已登入的使用者進入某間小木屋時，自動將其加入成員名冊（若尚未加入）
  useEffect(() => {
    if (!globalAccount || !activeRoomCode || !isCurrentRoomLoaded || roomNotFound) return;
    if (!roomInfo.code) return;

    const alreadyInRoom = participants.some(
      p => p.name.toLowerCase() === globalAccount.name.toLowerCase()
    );

    if (!alreadyInRoom && !pairings) {
      const isCreator =
        roomInfo.creatorName &&
        roomInfo.creatorName.toLowerCase() === globalAccount.name.toLowerCase();

      const newMember = {
        id: `u_${Date.now()}`,
        name: globalAccount.name,
        pin: globalAccount.pin,
        avatar: globalAccount.avatar || '🎅',
        isHost: Boolean(isCreator),
        excludedId: '',
        isReady: false,
        wishlist: '',
        blacklist: ''
      };
      const updatedList = [...participants, newMember];
      syncRoomToCloud({ participants: updatedList });
      showToast(`🎄 已自動將「${globalAccount.name}」加入「${roomInfo.name}」！`, 'info');
    }
  }, [globalAccount, activeRoomCode, isCurrentRoomLoaded, roomNotFound, roomInfo.code, participants.length]);

  const syncRoomToCloud = async (updateFields) => {
    if (!activeRoomCode || !db) return;
    try {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
      await setDoc(roomDocRef, {
        roomName: roomInfo.name,
        budget: roomInfo.budget,
        deadline: roomInfo.deadline,
        creatorName: roomInfo.creatorName,
        participants,
        pairings,
        isLocked,
        adminPin,
        updatedAt: Date.now(),
        ...updateFields
      }, { merge: true });
    } catch (err) {
      console.error("Sync room error:", err);
    }
  };

  const completeAuthAndRedirect = (userObj, isNewAccount = false) => {
    setGlobalAccount(userObj);
    localStorage.setItem('santa_global_account_v2', JSON.stringify(userObj));
    setAuthPin('');

    const targetRoom = activeRoomCode || pendingInviteRoom;
    if (targetRoom) {
      setActiveRoomCode(targetRoom);
      setPendingInviteRoom(null);
      try {
        sessionStorage.removeItem('santa_invited_room');
      } catch {
        // ignore
      }
      showToast(`🎄 歡迎「${userObj.name}」！已直接帶您進入受邀的小木屋 (${targetRoom})！`, 'success');
    } else {
      showToast(
        isNewAccount
          ? `🎉 帳號建立完成！歡迎來到聖誕村大廳，${userObj.name}！`
          : `🎄 歡迎回來，${userObj.name}！`,
        'success'
      );
    }
  };

  const handleGlobalAuthSubmit = async (e) => {
    e.preventDefault();
    const cleanName = authName.trim();
    const cleanPin = authPin.trim();

    if (!cleanName || !cleanPin) {
      showToast('請輸入您的帳號（名稱）與簡易密碼！', 'warning');
      return;
    }

    const existingGlobal = registeredAccounts.find(
      a => a.name.toLowerCase() === cleanName.toLowerCase()
    );
    const matchedAccount = existingGlobal;

    if (authMode === 'login') {
      if (matchedAccount && matchedAccount.pin && matchedAccount.pin !== cleanPin) {
        showToast('密碼不正確！請重新輸入。', 'error');
        return;
      }
      const userObj = {
        name: cleanName,
        pin: cleanPin,
        avatar: matchedAccount?.avatar || authAvatar
      };
      completeAuthAndRedirect(userObj, false);
    } else {
      const newUserObj = {
        name: cleanName,
        pin: cleanPin,
        avatar: authAvatar
      };
      const nextAccounts = [...registeredAccounts, newUserObj];
      setRegisteredAccounts(nextAccounts);
      completeAuthAndRedirect(newUserObj, true);
    }
  };

  const handleCreateNewRoom = async () => {
    const rName = newRoomNameInput.trim() || `${globalAccount.name} 的聖誕小木屋`;
    const newCode = `NOEL-${Math.floor(100 + Math.random() * 900)}`;

    const newRoomData = {
      roomName: rName,
      budget: 'NT$ 500 ~ 1,000',
      deadline: '2026-12-25 19:30',
      creatorName: globalAccount.name,
      participants: [{
        id: `u_${Date.now()}`,
        name: globalAccount.name,
        pin: globalAccount.pin,
        avatar: globalAccount.avatar || '🎅',
        isHost: true,
        excludedId: '',
        isReady: true,
        wishlist: '',
        blacklist: ''
      }],
      pairings: null,
      isLocked: false,
      adminPin: '8888',
      createdAt: Date.now()
    };

    if (db) {
      try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', newCode);
        await setDoc(roomRef, newRoomData);
      } catch (err) {
        console.error("Create room error:", err);
      }
    }

    setNewRoomNameInput('');
    setActiveRoomCode(newCode);
    showToast(`🎉 成功創建小木屋「${rName}」！代碼：${newCode}`, 'success');
  };

  const handleDeleteRoomAction = async (targetCode) => {
    if (db) {
      try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', targetCode);
        await deleteDoc(roomRef);
      } catch (err) {
        console.error("Delete room error:", err);
      }
    }
    if (activeRoomCode === targetCode) {
      setActiveRoomCode(null);
    }
    setDeleteModalRoomCode(null);
    setDeleteInputPin('');
    showToast(`🗑️ 小木屋 ${targetCode} 已成功刪除！`, 'info');
  };

  return (
    <div className="min-h-screen bg-[#071712] text-[#F9F6EE] font-sans relative overflow-x-hidden selection:bg-[#D4AF37] selection:text-[#071712]">
      {/* 背景極致柔和飄雪效果 */}
      {isSnowActive && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30">
          <div className="absolute -top-10 left-10 w-2 h-2 bg-white rounded-full animate-ping"></div>
          <div className="absolute top-20 right-20 w-1.5 h-1.5 bg-[#D4AF37] rounded-full animate-pulse"></div>
          <div className="absolute bottom-40 left-1/4 w-2 h-2 bg-white rounded-full animate-bounce"></div>
        </div>
      )}

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

      {/* 雲端連線狀態 */}
      {!isCloudConfigured && (
        <div className="relative z-40 bg-[#9E2A2B] border-b border-[#D4AF37] px-4 py-2 text-center text-xs text-[#FFF8E7] font-bold">
          ⚠️ 本機離線模式：請在 src/App.jsx 設定 Firebase API Key 即可跨裝置同步！
        </div>
      )}

      {/* ========================================== */}
      {/* 情境 1：尚未登入 ➔ 全站登入 / 註冊首頁 */}
      {/* ========================================== */}
      {!globalAccount ? (
        <div className="relative z-10 max-w-md mx-auto px-4 pt-12 pb-10">
          <div className="text-center mb-6 space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-bold">
              <Trees className="w-4 h-4 text-[#D4AF37]" />
              <span>北歐冬夜・秘密聖誕老人</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#FFFDF9]">
              歡迎來到秘密聖誕村
            </h1>
            <p className="text-xs text-[#A3B8AE]">
              請先登記您的身分，即可自由創建或加入小木屋派對！
            </p>
          </div>

          {(activeRoomCode || pendingInviteRoom) && (
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-[#9E2A2B] to-[#7A1F20] border border-[#D4AF37] text-[#FFF8E7] shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#071712]/40 flex items-center justify-center text-xl shrink-0">
                💌
              </div>
              <div className="text-xs leading-relaxed">
                <div className="font-bold text-[#F3E5AB]">您已收到邀請函！</div>
                <div>完成下方登入後將直接進入小木屋 <strong className="underline font-mono">{activeRoomCode || pendingInviteRoom}</strong></div>
              </div>
            </div>
          )}

          <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
            <div className="flex rounded-xl bg-[#071712] p-1 mb-6 border border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  authMode === 'login' ? 'bg-[#153528] text-[#F3E5AB] shadow' : 'text-[#A3B8AE] hover:text-white'
                }`}
              >
                🔑 已有帳號・登入
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                  authMode === 'register' ? 'bg-[#153528] text-[#F3E5AB] shadow' : 'text-[#A3B8AE] hover:text-white'
                }`}
              >
                ✨ 首次使用・建立帳號
              </button>
            </div>

            <form onSubmit={handleGlobalAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  您的名稱 / 暱稱 (可中英文)：
                </label>
                <input
                  type="text"
                  value={authName}
                  onChange={e => setAuthName(e.target.value)}
                  placeholder="例如：聖誕小達人 / David"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  簡易密碼 (供日後辨識)：
                </label>
                <input
                  type="password"
                  value={authPin}
                  onChange={e => setAuthPin(e.target.value)}
                  placeholder="請輸入 4 位數或自訂密碼"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
                <div className="mt-2 p-3 rounded-xl bg-[#3A260B]/70 border border-[#D4AF37]/50 text-[#FEF3C7] text-[11px] leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#D4AF37] mt-0.5" />
                  <span>
                    <strong>⚠️ 安全提醒：</strong>此 APP 僅供娛樂互動，請<strong>絕對不要</strong>輸入您平常用的銀行或重要帳號密碼！
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  選擇您的代表聖誕圖示：
                </label>
                <div className="flex gap-3 justify-center py-2">
                  {['🎅', '🎄', '🎁', '⛄', '🦌', '⭐'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAuthAvatar(emoji)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition ${
                        authAvatar === emoji ? 'bg-[#153528] border-2 border-[#D4AF37] scale-110 shadow-lg' : 'bg-[#071712] border border-[#D4AF37]/20 hover:scale-105'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/40 text-sm font-bold shadow-lg transition"
              >
                {activeRoomCode || pendingInviteRoom
                  ? `🎄 完成並直接進入小木屋`
                  : authMode === 'register'
                  ? '🎄 建立帳號並進入聖誕村大廳'
                  : '🔑 登入進入聖誕村大廳'}
              </button>
            </form>
          </div>
        </div>

      /* ========================================== */
      /* 情境 2：已登入且在房間總覽大廳 (activeRoomCode === null) */
      /* ========================================== */
      ) : !activeRoomCode ? (
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 space-y-8">
          {/* 頂部導覽列：歡迎語與登出 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#153528] border border-[#D4AF37] text-2xl flex items-center justify-center shadow">
                {globalAccount.avatar || '🎅'}
              </div>
              <div>
                <div className="text-xs text-[#A3B8AE]">目前登入身分</div>
                <div className="text-base font-extrabold text-[#FFFDF9]">{globalAccount.name}</div>
              </div>
            </div>
            <button
              onClick={() => {
                setGlobalAccount(null);
                localStorage.removeItem('santa_global_account_v2');
                showToast('已安全登出！', 'info');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#9E2A2B]/80 hover:bg-[#9E2A2B] text-[#FFF8E7] text-xs font-bold border border-[#D4AF37]/40 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>登出帳號</span>
            </button>
          </div>

          {/* 快速輸入代碼直達 */}
          <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs font-bold text-[#F3E5AB] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D4AF37]" />
              <span>有朋友給的小木屋代碼嗎？直接輸入進入：</span>
            </div>
            <div className="flex w-full sm:w-auto gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value)}
                placeholder="例如：NOEL-123"
                className="flex-1 sm:w-48 bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2 text-xs text-[#FFF8E7] uppercase font-mono"
              />
              <button
                onClick={async () => {
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

          {/* 建立新小木屋區塊 */}
          <div className="bg-gradient-to-br from-[#122B20] to-[#071712] border-2 border-[#D4AF37]/50 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
              <Gift className="w-5 h-5" />
              <span>建立您的專屬聖誕交換禮物小木屋</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newRoomNameInput}
                onChange={e => setNewRoomNameInput(e.target.value)}
                placeholder="小木屋名稱（例如：2026 跨年交換禮物派對）"
                className="flex-1 bg-[#071712] border border-[#D4AF37]/30 rounded-2xl px-4 py-3 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                onClick={handleCreateNewRoom}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] font-bold text-sm border border-[#D4AF37]/40 shadow-lg transition flex items-center justify-center gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>立即創建小木屋</span>
              </button>
            </div>
          </div>

          {/* 所有小木屋總覽列表 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#FFFDF9] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#D4AF37]" />
                <span>所有聖誕小木屋總覽 ({cloudRoomList.length})</span>
              </h2>
            </div>

            {cloudRoomList.length === 0 ? (
              <div className="text-center py-12 bg-[#0D231A]/60 border border-[#D4AF37]/20 rounded-3xl text-sm text-[#A3B8AE] space-y-2">
                <div>🪵 目前還沒有任何聖誕小木屋</div>
                <div className="text-xs">點擊上方按鈕建立您的第一間小木屋吧！</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cloudRoomList.map(room => {
                  const isHostOrAdmin = 
                    (room.creatorName && room.creatorName.toLowerCase() === globalAccount.name.toLowerCase());
                  return (
                    <div 
                      key={room.code}
                      className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-4 hover:border-[#D4AF37] transition"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-extrabold text-base text-[#FFFDF9] line-clamp-1">{room.name}</div>
                          <span className="px-2.5 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-mono font-bold shrink-0">
                            {room.code}
                          </span>
                        </div>
                        <div className="text-xs text-[#A3B8AE] flex items-center gap-4">
                          <span>創辦人：{room.creatorName || '匿名'}</span>
                          <span>目前人數：{room.participantsCount} 人</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#D4AF37]/15">
                        <button
                          onClick={() => setActiveRoomCode(room.code)}
                          className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <span>進入木屋</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        {isHostOrAdmin && (
                          <button
                            onClick={() => setDeleteModalRoomCode(room.code)}
                            className="p-2 rounded-xl bg-[#9E2A2B]/20 hover:bg-[#9E2A2B]/40 text-[#E05A47] transition"
                            title="刪除小木屋"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 刪除小木屋密碼確認視窗 */}
          {deleteModalRoomCode && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#0D231A] border-2 border-[#E05A47] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-[#E05A47]">
                  <ShieldAlert className="w-6 h-6 shrink-0" />
                  <div className="font-extrabold text-base">確認刪除小木屋？</div>
                </div>
                <p className="text-xs text-[#A3B8AE] leading-relaxed">
                  刪除後資料將永久清除。若您非創辦人，請輸入管理員密碼（預設 8888）：
                </p>
                <input
                  type="password"
                  value={deleteInputPin}
                  onChange={e => setDeleteInputPin(e.target.value)}
                  placeholder="請輸入密碼（非創辦人需填 8888）"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7]"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setDeleteModalRoomCode(null); setDeleteInputPin(''); }}
                    className="flex-1 py-2 rounded-xl bg-[#153528] text-xs font-bold text-[#F3E5AB]"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const targetRoom = cloudRoomList.find(r => r.code === deleteModalRoomCode);
                      const isCreator = targetRoom && targetRoom.creatorName && targetRoom.creatorName.toLowerCase() === globalAccount.name.toLowerCase();
                      if (isCreator || deleteInputPin === '8888') {
                        handleDeleteRoomAction(deleteModalRoomCode);
                      } else {
                        showToast('密碼錯誤，或是您沒有權限刪除此木屋！', 'error');
                      }
                    }}
                    className="flex-1 py-2 rounded-xl bg-[#9E2A2B] text-xs font-bold text-white"
                  >
                    確認刪除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      /* ========================================== */
      /* 情境 3：進入具體某間小木屋內部 (activeRoomCode !== null) */
      /* ========================================== */
      ) : !isCurrentRoomLoaded ? (
        <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin"></div>
          <div className="text-sm font-bold text-[#F3E5AB]">正在進入小木屋 ({activeRoomCode})...</div>
        </div>
      ) : roomNotFound ? (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4">
          <div className="text-3xl">🪵❌</div>
          <div className="text-base font-bold text-[#FFFDF9]">找不到代碼為「{activeRoomCode}」的小木屋！</div>
          <button
            onClick={() => setActiveRoomCode(null)}
            className="px-6 py-2.5 rounded-xl bg-[#D4AF37] text-[#071712] text-xs font-bold"
          >
            返回小木屋總覽大廳
          </button>
        </div>
      ) : (
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* 頂部極簡導覽 */}
          <div className="flex items-center justify-between bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-2xl px-4 py-3 shadow-xl">
            <button
              onClick={() => setActiveRoomCode(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#F3E5AB] text-xs font-bold border border-[#D4AF37]/30 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>返回總覽首頁</span>
            </button>
            <div className="text-xs font-mono font-bold text-[#D4AF37] px-3 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/30">
              {roomInfo.code}
            </div>
          </div>

          {/* 小木屋主標題卡片 */}
          <div className="bg-[#0D231A]/95 border-2 border-[#D4AF37]/50 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-[#FFFDF9]">{roomInfo.name}</h1>
                <p className="text-xs text-[#A3B8AE] mt-1">
                  目前人數：<strong className="text-[#D4AF37]">{participants.length}</strong> 人 ｜ 預算：{roomInfo.budget}
                </p>
              </div>

              {/* 創辦人或管理員可刪除此木屋 */}
              {roomInfo.creatorName && (roomInfo.creatorName.toLowerCase() === globalAccount.name.toLowerCase()) && (
                <button
                  onClick={() => setDeleteModalRoomCode(roomInfo.code)}
                  className="px-3 py-2 rounded-xl bg-[#9E2A2B]/30 hover:bg-[#9E2A2B]/60 text-[#E05A47] text-xs font-bold border border-[#E05A47]/40 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>刪除此木屋</span>
                </button>
              )}
            </div>

            {/* 邀請函功能 */}
            <div className="pt-3 border-t border-[#D4AF37]/20 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-[#F3E5AB] flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#D4AF37]" />
                <span>邀請朋友直接進入此木屋：</span>
              </div>
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomInfo.code}`;
                  const inviteText = `🎄 來參加我的聖誕交換禮物派對！\n木屋名稱：${roomInfo.name}\n點擊連結直接加入：\n${shareUrl}`;
                  navigator.clipboard.writeText(inviteText);
                  showToast('💌 邀請函與直達連結已複製到剪貼簿！', 'success');
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>一鍵複製邀請函（含直達連結）</span>
              </button>
            </div>
          </div>

          {/* 成員名冊與心願設定 */}
          <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#F3E5AB] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#D4AF37]" />
                <span>參與聖誕老人名冊 ({participants.length})</span>
              </h2>
            </div>

            <div className="space-y-3">
              {participants.map(p => {
                const isMe = p.name.toLowerCase() === globalAccount.name.toLowerCase();
                return (
                  <div 
                    key={p.id}
                    className={`p-4 rounded-2xl border transition ${
                      isMe ? 'bg-[#153528]/80 border-[#D4AF37]' : 'bg-[#071712] border-[#D4AF37]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{p.avatar || '🎅'}</span>
                        <div>
                          <span className="font-bold text-sm text-[#FFFDF9]">{p.name}</span>
                          {isMe && <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-[#D4AF37] text-[#071712] font-bold">我</span>}
                        </div>
                      </div>
                    </div>

                    {/* 若是自己，可填寫心願與 AI 模糊化 */}
                    {isMe && !pairings && (
                      <div className="mt-3 pt-3 border-t border-[#D4AF37]/20 space-y-2">
                        <div className="text-xs text-[#F3E5AB] font-bold">填寫您的聖誕心願：</div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={p.wishlist || ''}
                            onChange={e => {
                              const val = e.target.value;
                              const updated = participants.map(item => item.id === p.id ? { ...item, wishlist: val } : item);
                              setParticipants(updated);
                              syncRoomToCloud({ participants: updated });
                            }}
                            placeholder="例如：想要一本好書或保溫杯"
                            className="flex-1 bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3 py-2 text-xs text-[#FFF8E7]"
                          />
                          <button
                            disabled={isAiLoading || !p.wishlist}
                            onClick={async () => {
                              setIsAiLoading(true);
                              const blurred = await callGeminiBlurWish(p.wishlist, EXTERNAL_GEMINI_API_KEY);
                              const updated = participants.map(item => item.id === p.id ? { ...item, wishlist: blurred } : item);
                              setParticipants(updated);
                              syncRoomToCloud({ participants: updated });
                              setIsAiLoading(false);
                              showToast('✨ AI 已幫您將心願轉化為詩意謎語！', 'success');
                            }}
                            className="px-3 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-bold disabled:opacity-50 shrink-0"
                          >
                            {isAiLoading ? 'AI 魔法中...' : '✨ AI 模糊化'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!isMe && p.wishlist && (
                      <div className="text-xs text-[#A3B8AE] italic mt-1">
                        心願：{p.wishlist}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 抽籤按鈕區（創辦人專屬） */}
            {roomInfo.creatorName && roomInfo.creatorName.toLowerCase() === globalAccount.name.toLowerCase() && !pairings && (
              <div className="pt-4 border-t border-[#D4AF37]/20">
                <button
                  onClick={() => {
                    try {
                      const res = generateSecretSantaPairs(participants);
                      setPairings(res);
                      setIsLocked(true);
                      syncRoomToCloud({ pairings: res, isLocked: true });
                      showToast('🎉 秘密聖誕老人抽籤配對成功！', 'success');
                    } catch (err) {
                      showToast(err.message, 'error');
                    }
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-white text-sm font-bold shadow-xl border border-[#D4AF37]/50"
                >
                  🎲 開始進行秘密抽籤配對
                </button>
              </div>
            )}
          </div>

          {/* 抽籤結果與火漆信封開箱 */}
          {pairings && (
            <div className="bg-[#0D231A]/95 border-2 border-[#D4AF37] rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-extrabold text-[#FFFDF9]">🎁 聖誕交換禮物火漆信封</h3>
                <p className="text-xs text-[#D4AF37]">點擊下方專屬信封，查看您抽中的交換對象！</p>
              </div>

              {(() => {
                const myParticipant = participants.find(p => p.name.toLowerCase() === globalAccount.name.toLowerCase());
                if (!myParticipant) return <div className="text-center text-xs text-[#A3B8AE]">您目前未在此房間名單中</div>;
                const myPair = pairings.find(item => item.giverId === myParticipant.id);
                if (!myPair) return <div className="text-center text-xs text-[#A3B8AE]">尚未產生您的配對結果</div>;
                return (
                  <WaxSealEnvelope 
                    giver={myParticipant}
                    pairResult={myPair}
                    participants={participants}
                  />
                );
              })()}
            </div>
          )}

          {/* 刪除小木屋密碼視窗 */}
          {deleteModalRoomCode && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#0D231A] border-2 border-[#E05A47] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-[#E05A47]">
                  <ShieldAlert className="w-6 h-6 shrink-0" />
                  <div className="font-extrabold text-base">確認刪除此小木屋？</div>
                </div>
                <p className="text-xs text-[#A3B8AE] leading-relaxed">
                  刪除後將無法恢復。若您非創辦人，請輸入管理員密碼（預設 8888）：
                </p>
                <input
                  type="password"
                  value={deleteInputPin}
                  onChange={e => setDeleteInputPin(e.target.value)}
                  placeholder="請輸入密碼（非創辦人需填 8888）"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7]"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setDeleteModalRoomCode(null); setDeleteInputPin(''); }}
                    className="flex-1 py-2 rounded-xl bg-[#153528] text-xs font-bold text-[#F3E5AB]"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const isCreator = roomInfo.creatorName && roomInfo.creatorName.toLowerCase() === globalAccount.name.toLowerCase();
                      if (isCreator || deleteInputPin === '8888') {
                        handleDeleteRoomAction(deleteModalRoomCode);
                      } else {
                        showToast('密碼錯誤，或是您沒有權限刪除此木屋！', 'error');
                      }
                    }}
                    className="flex-1 py-2 rounded-xl bg-[#9E2A2B] text-xs font-bold text-white"
                  >
                    確認刪除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}