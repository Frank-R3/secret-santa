import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, Gift, Users, Settings, Copy, Check, Lock, 
  Unlock, Trash2, Plus, ArrowLeft, KeyRound, LogOut,
  Calendar, DollarSign, ShieldAlert, AlertTriangle, ChevronRight,
  RefreshCw, Snowflake, Trees, HeartHandshake, Ban, MailOpen, UserPlus,
  MessageSquare, Send, ChevronDown, ChevronUp
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
// 0. 雲端資料庫與環境變數設定 (.env 讀取)
// ==========================================
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

try {
  const rawGlobalConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
  const finalConfig = (EXTERNAL_FIREBASE_CONFIG.apiKey && EXTERNAL_FIREBASE_CONFIG.projectId)
    ? EXTERNAL_FIREBASE_CONFIG
    : rawGlobalConfig;

  if (finalConfig && finalConfig.apiKey) {
    app = !getApps().length ? initializeApp(finalConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("Firebase initialization warning:", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'secret_santa_app_v2026';

// ==========================================
// 1. 配對演算法（防死結 Hamilton Cycle + 排除避開名單）
// ==========================================
function generateSecretSantaPairs(participants) {
  const n = participants.length;
  if (n < 3) throw new Error("至少需要 3 位成員才能進行交換禮物抽籤喔！");

  let givers = [...participants];
  let receivers = [...participants];
  let attempts = 0;
  const maxAttempts = 1500;

  while (attempts < maxAttempts) {
    attempts++;
    givers = [...participants];
    receivers = [...participants];

    for (let i = receivers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }

    let success = true;
    const assignments = [];

    for (let i = 0; i < n; i++) {
      const giver = givers[i];
      const receiver = receivers[i];

      const isSelf = giver.id === receiver.id;
      const isBlacklisted = giver.excludedId && giver.excludedId === receiver.id;

      if (isSelf || isBlacklisted) {
        success = false;
        break;
      }
      assignments.push({ giverId: giver.id, receiverId: receiver.id });
    }

    if (success) {
      const map = {};
      assignments.forEach(a => { map[a.giverId] = a.receiverId; });
      let curr = givers[0].id;
      let count = 0;
      const visited = new Set();
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

  throw new Error("無法在目前的「指定避開條件」下找到完美配對，請放寬部分避開限制後再試一次！");
}

// ==========================================
// 2. Gemini AI 智慧心願模糊化功能 (高難度燒腦側面暗示版)
// ==========================================
async function callGeminiBlurWish(rawWish, apiKeyToUse) {
  const key = apiKeyToUse || "";
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `你是一位高深莫測、擅長「極致側面暗示」的北歐聖誕精靈。使用者填寫了一個直白的交換禮物心願：「${rawWish}」。
請將這個心願高度模糊化，改寫成 3 個「極度曖昧、不能讓人一眼看穿確切商品、但能隱約感覺到關聯情境或身體部位/生活動態」的燒腦線索！
【重要範例與禁令】：
- 例如願望若是「球鞋」：絕對禁止出現「鞋、球、穿、襪、鞋帶、Nike」等字眼！只能暗示「與大地接觸時的反作用力、承載雙足律動與邁開步伐的動能夥伴、陪我流汗奔馳或走過街頭的支撐」。
- 例如願望若是「保溫杯」：絕對禁止出現「杯、水、喝、瓶、蓋子」等字眼！只能暗示「鎖住冬日裡的一抹溫熱、放在桌角隨手汲取的暖流容器」。
- 絕對不能出現原始心願中的任何字詞！要讓送禮者覺得「好像跟某種動態/部位/情境有關，但又無法 100% 確定是哪個單品」。
請用繁體中文回答，字數精簡在 110 字內，格式如下：
🔮 曖昧部位與情境暗示：...
🌌 動態與氛圍線索：...
🧩 燒腦抽象謎語：...`
            }]
          }]
        })
      }
    );
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text.trim();
  } catch (err) {
    console.warn("Gemini AI fallback:", err);
  }
  const crypticPool = [
    "🔮 曖昧部位與情境暗示：與日常移動的節奏、或是身體某處的舒適支撐息息相關。\n🌌 動態與氛圍線索：在動與靜的切換之間，承載著步伐、律動或生活裡的微妙能量。\n🧩 燒腦抽象謎語：不直接言明其形，卻能在每一次出發或停留時感受到它的存在感。",
    "🔮 曖昧部位與情境暗示：常伴於感官周圍，在特定時刻能帶來恰到好處的包覆或療癒感。\n🌌 動態與氛圍線索：介於實用機能與個人風格之間，是日常儀式感裡不可或缺的拼圖。\n🧩 燒腦抽象謎語：猜得到方向卻摸不透全貌，留給送禮者一場充滿驚喜的尋寶挑戰。"
  ];
  return crypticPool[Math.floor(Math.random() * crypticPool.length)];
}

// ==========================================
// 3. 北歐火漆封蠟神秘信封組件
// ==========================================
function WaxSealEnvelope({ giver, pairResult, participants, onOpenSeal }) {
  const [isOpen, setIsOpen] = useState(Boolean(giver?.hasOpenedEnvelope));
  const receiver = participants.find(p => p.id === pairResult.receiverId);

  const handleOpen = () => {
    setIsOpen(true);
    if (onOpenSeal) onOpenSeal();
  };

  return (
    <div className="relative w-full max-w-md mx-auto my-4">
      {!isOpen ? (
        <div
          onClick={handleOpen}
          className="group relative cursor-pointer rounded-3xl bg-gradient-to-br from-[#F4EEDC] via-[#EAE0C8] to-[#DFD1B0] text-[#153528] p-8 border-2 border-[#D4AF37] shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:shadow-[#D4AF37]/20"
        >
          <div className="absolute inset-x-0 top-0 h-24 border-b-2 border-[#D4AF37]/40 bg-[#E6D9BC]/60 rounded-t-3xl flex items-center justify-center">
            <span className="text-[11px] font-extrabold tracking-widest uppercase text-[#7A5523]">
              🎄 NORDIC SECRET SANTA OFFICIAL SEAL 🎄
            </span>
          </div>

          <div className="pt-16 pb-4 flex flex-col items-center text-center space-y-5">
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#B83334] via-[#9E2A2B] to-[#6E1718] border-4 border-[#D4AF37] shadow-2xl flex flex-col items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <div className="w-18 h-18 rounded-full border border-[#F3E5AB]/40 flex flex-col items-center justify-center p-3">
                <span className="text-3xl">🎅</span>
                <span className="text-[9px] font-black text-[#F3E5AB] tracking-tighter mt-0.5">OPEN ME</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-[#7A5523]">致 秘密聖誕老人：</div>
              <div className="text-2xl font-black text-[#153528] flex items-center justify-center gap-2">
                <span>{giver.avatar || '🎅'}</span>
                <span>{giver.name}</span>
              </div>
              <p className="text-xs text-[#5A4521] pt-1">
                點擊中央「勃根地紅火漆封蠟」拆開羊皮紙信封，揭曉您要送禮的神秘對象！
              </p>
            </div>

            <div className="text-[11px] text-[#9E2A2B] font-bold bg-[#9E2A2B]/10 px-3 py-1 rounded-full">
              🔒 請確認周圍沒有其他人偷看螢幕喔！
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-[#F4EEDC] text-[#153528] p-6 sm:p-8 border-2 border-[#D4AF37] shadow-2xl space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#D4AF37]/40 pb-3">
            <span className="text-xs font-extrabold text-[#9E2A2B] tracking-wider uppercase flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>火漆信封已拆封・專屬任務卡</span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-[#7A5523] hover:text-[#153528] underline"
            >
              重新封回信封
            </button>
          </div>

          <div className="flex flex-col items-center text-center py-2 space-y-2">
            <div className="text-xs font-bold text-[#5A4521]">您本次要準備聖誕禮物的對象是：</div>
            <div className="w-20 h-20 rounded-2xl bg-[#153528] text-[#D4AF37] text-4xl flex items-center justify-center border-2 border-[#D4AF37] shadow-lg">
              {receiver?.avatar || '🎁'}
            </div>
            <div className="text-3xl font-black text-[#153528] pt-1">
              {receiver?.name || '神秘成員'}
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-[#EAE0C8] rounded-2xl p-4 border border-[#D4AF37]/50 space-y-1.5">
              <div className="text-xs font-extrabold text-[#153528] flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-[#9E2A2B]" />
                <span>TA 的許願聖誕襪（想收到的方向）：</span>
              </div>
              <div className="text-xs text-[#2A1F11] whitespace-pre-line leading-relaxed font-medium">
                {receiver?.wishlist
                  ? receiver.wishlist
                  : "（這位小迷糊還沒填寫心願清單，您可以準備充滿驚喜的實用好物！）"}
              </div>
            </div>

            <div className="bg-[#F9E4E4] rounded-2xl p-4 border border-[#9E2A2B]/30 space-y-1.5">
              <div className="text-xs font-extrabold text-[#9E2A2B] flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-[#9E2A2B]" />
                <span>TA 的地雷清單（千萬別送）：</span>
              </div>
              <div className="text-xs text-[#5C1A1B] whitespace-pre-line leading-relaxed font-medium">
                {receiver?.blacklist
                  ? receiver.blacklist
                  : "（無特別填寫地雷，自由發揮！）"}
              </div>
            </div>

            <div className="bg-[#153528]/10 rounded-2xl p-4 border border-[#153528]/25 space-y-2">
              <div className="text-xs font-extrabold text-[#153528] flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#7A5523]" />
                <span>親友團對 TA 的匿名嘴砲＆送禮推坑 ({Array.isArray(receiver?.gossipComments) ? receiver.gossipComments.length : 0} 則)：</span>
              </div>
              {Array.isArray(receiver?.gossipComments) && receiver.gossipComments.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {receiver.gossipComments.map(c => (
                    <div key={c.id} className="text-xs bg-white/70 rounded-xl px-3 py-2 border border-[#D4AF37]/40 text-[#2A1F11]">
                      <span className="font-extrabold text-[#9E2A2B]">{c.alias}：</span>
                      <span>{c.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#5A4521] italic">
                  （目前還沒有人對 TA 匿名嘴砲，快去「3. 匿名嘴砲牆」幫大家補充線索！）
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-3 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#F3E5AB] text-xs font-bold transition shadow"
          >
            🔒 看完記住了，把信封蓋起來保密！
          </button>
        </div>
      )}
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
        } catch {}
        return cleanCode;
      }
      try {
        const savedInvite = sessionStorage.getItem('santa_invited_room');
        if (savedInvite) return savedInvite;
      } catch {}
    }
    return null;
  }, []);

  const [pendingInviteRoom, setPendingInviteRoom] = useState(invitedRoomFromUrl || null);

  const [globalAccount, setGlobalAccount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('santa_global_account_v2');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  const [registeredAccounts, setRegisteredAccounts] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('santa_registered_accounts_v2');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [activeRoomCode, setActiveRoomCode] = useState(invitedRoomFromUrl || null);

  const [cloudRoomList, setCloudRoomList] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('santa_rooms_index_v2');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [activeTab, setActiveTab] = useState('participants');
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

  const [authName, setAuthName] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authAvatar, setAuthAvatar] = useState('🎅');
  const [authMode, setAuthMode] = useState('login');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newRoomNameInput, setNewRoomNameInput] = useState('');
  const [newRoomBudgetInput, setNewRoomBudgetInput] = useState('NT$ 500 ~ 1,000');
  const [manualMemberName, setManualMemberName] = useState('');
  const [manualMemberAvatar, setManualMemberAvatar] = useState('🦌');
  const [deleteModalRoomCode, setDeleteModalRoomCode] = useState(null);
  const [deleteInputPin, setDeleteInputPin] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [isCurrentRoomLoaded, setIsCurrentRoomLoaded] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [selectedGossipTargetId, setSelectedGossipTargetId] = useState('');
  const [gossipInputText, setGossipInputText] = useState('');
  const [gossipAlias, setGossipAlias] = useState('🦌 神秘吃瓜馴鹿');
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const saveLocalRoomBackup = (code, data) => {
    if (typeof window === 'undefined' || !code) return;
    try {
      localStorage.setItem(`santa_room_data_${code}`, JSON.stringify(data));
      setCloudRoomList(prev => {
        const summary = {
          code,
          name: data.roomName || '聖誕小木屋',
          budget: data.budget || 'NT$ 500 ~ 1,000',
          deadline: data.deadline || '2026-12-25 19:30',
          creatorName: data.creatorName || '匿名',
          participantsCount: data.participants ? data.participants.length : 0,
          isLocked: Boolean(data.isLocked)
        };
        const exists = prev.some(r => r.code === code);
        const next = exists ? prev.map(r => r.code === code ? summary : r) : [summary, ...prev];
        localStorage.setItem('santa_rooms_index_v2', JSON.stringify(next));
        return next;
      });
    } catch {}
  };

  // 1. Firebase 匿名驗證初始化
  useEffect(() => {
    if (!auth) return;
    const unsubAuth = onAuthStateChanged(auth, () => {});
    signInAnonymously(auth).catch(err => console.warn("Anonymous auth warning:", err));
    return () => unsubAuth();
  }, []);

  // 1.5 監聽雲端全站帳號列表（跨裝置防重複註冊與密碼比對）
  useEffect(() => {
    if (!db) return;
    const accountsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'secret_santa_accounts');
    const unsubAccounts = onSnapshot(accountsColRef, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data());
      });
      if (list.length > 0) {
        setRegisteredAccounts(list);
        try {
          localStorage.setItem('santa_registered_accounts_v2', JSON.stringify(list));
        } catch {}
      }
    }, (err) => {
      console.warn("Accounts snapshot warning:", err);
    });
    return () => unsubAccounts();
  }, []);

  // 2. 監聽雲端所有小木屋列表
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
          participantsCount: data.participants ? data.participants.length : 0,
          isLocked: Boolean(data.isLocked)
        });
      });
      setCloudRoomList(list);
      try {
        localStorage.setItem('santa_rooms_index_v2', JSON.stringify(list));
      } catch {}
    }, (err) => {
      console.warn("Rooms snapshot warning:", err);
    });
    return () => unsubRooms();
  }, []);

  // 3. 監聽當前進入的小木屋詳細資料
  useEffect(() => {
    if (!activeRoomCode) {
      setIsCurrentRoomLoaded(true);
      return;
    }

    setIsCurrentRoomLoaded(false);
    setRoomNotFound(false);

    if (!db) {
      try {
        const raw = localStorage.getItem(`santa_room_data_${activeRoomCode}`);
        if (raw) {
          const data = JSON.parse(raw);
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
      } catch {
        setRoomNotFound(true);
      }
      setIsCurrentRoomLoaded(true);
      return;
    }

    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
    const loadTimeout = setTimeout(() => {
      setIsCurrentRoomLoaded(true);
    }, 4000);

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
      console.warn("Current room snapshot warning:", err);
      setIsCurrentRoomLoaded(true);
    });

    return () => {
      clearTimeout(loadTimeout);
      unsubCurrentRoom();
    };
  }, [activeRoomCode]);

  // 4. 當已登入的使用者進入小木屋時，若不在名單內則自動加入為一般成員
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
        originalWishlist: '',
        blacklist: '',
        gossipComments: []
      };
      const updatedList = [...participants, newMember];
      setParticipants(updatedList);
      syncRoomToCloud({ participants: updatedList });
      showToast(`🎄 已自動將「${globalAccount.name}」加入「${roomInfo.name}」名冊！`, 'info');
    }
  }, [globalAccount, activeRoomCode, isCurrentRoomLoaded, roomNotFound, roomInfo.code, participants.length]);

  useEffect(() => {
    if (participants.length > 0 && (!selectedGossipTargetId || !participants.some(p => p.id === selectedGossipTargetId))) {
      setSelectedGossipTargetId(participants[0].id);
    }
  }, [participants, selectedGossipTargetId]);

  const syncRoomToCloud = async (updateFields) => {
    if (!activeRoomCode) return;
    const payload = {
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
    };

    saveLocalRoomBackup(activeRoomCode, payload);

    if (db) {
      try {
        const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', activeRoomCode);
        await setDoc(roomDocRef, payload, { merge: true });
      } catch (err) {
        console.warn("Sync room error:", err);
      }
    }
  };

  const completeAuthAndRedirect = (userObj, isNewAccount = false) => {
    setGlobalAccount(userObj);
    try {
      localStorage.setItem('santa_global_account_v2', JSON.stringify(userObj));
    } catch {}
    setAuthPin('');

    const targetRoom = activeRoomCode || pendingInviteRoom;
    if (targetRoom) {
      setActiveRoomCode(targetRoom);
      setPendingInviteRoom(null);
      try {
        sessionStorage.removeItem('santa_invited_room');
      } catch {}
      showToast(`🎄 歡迎「${userObj.name}」！已直接帶您進入受邀的小木屋 (${targetRoom})！`, 'success');
    } else {
      showToast(
        isNewAccount
          ? `🎉 帳號建立完成！歡迎來到聖誕村總覽大廳，${userObj.name}！`
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
      showToast('請輸入您的名稱（可中英文）與簡易密碼！', 'warning');
      return;
    }

    let matchedAccount = registeredAccounts.find(
      a => a.name.toLowerCase() === cleanName.toLowerCase()
    );

    // 若本機快取尚未讀取到，直接向雲端做最後雙重確認
    if (db && !matchedAccount) {
      try {
        const accountDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_accounts', cleanName.toLowerCase());
        const docSnap = await getDoc(accountDocRef);
        if (docSnap.exists()) {
          matchedAccount = docSnap.data();
        }
      } catch (err) {
        console.warn("Verify cloud account error:", err);
      }
    }

    if (authMode === 'login') {
      if (!matchedAccount) {
        showToast(`找不到帳號「${cleanName}」！請切換至「首次進入・登記我是誰」先建立帳號。`, 'error');
        return;
      }

      if (matchedAccount.pin !== cleanPin) {
        showToast('密碼錯誤！請重新輸入正確密碼。', 'error');
        return;
      }

      const userObj = {
        name: matchedAccount.name,
        pin: matchedAccount.pin,
        avatar: matchedAccount.avatar || authAvatar
      };
      completeAuthAndRedirect(userObj, false);
    } else {
      if (matchedAccount) {
        showToast(`⚠️ 帳號名稱「${cleanName}」已被其他人使用！請換一個暱稱，或切換至「已有帳號・直接登入」。`, 'error');
        return;
      }

      const newUserObj = {
        name: cleanName,
        pin: cleanPin,
        avatar: authAvatar,
        createdAt: Date.now()
      };

      const nextAccounts = [...registeredAccounts, newUserObj];
      setRegisteredAccounts(nextAccounts);

      try {
        localStorage.setItem('santa_registered_accounts_v2', JSON.stringify(nextAccounts));
      } catch {}

      if (db) {
        try {
          const accountDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_accounts', cleanName.toLowerCase());
          await setDoc(accountDocRef, newUserObj);
        } catch (err) {
          console.warn("Cloud account save error:", err);
        }
      }

      completeAuthAndRedirect(newUserObj, true);
    }
  };

  // 補回缺失：建立新小木屋
  const handleCreateNewRoom = async () => {
    const rName = newRoomNameInput.trim() || `${globalAccount.name} 的聖誕交換禮物`;
    const rBudget = newRoomBudgetInput.trim() || 'NT$ 500 ~ 1,000';
    const newCode = `NOEL-${Math.floor(100 + Math.random() * 900)}`;

    const newRoomData = {
      roomName: rName,
      budget: rBudget,
      deadline: '2026-12-25 19:30',
      creatorName: globalAccount.name,
      participants: [{
        id: `u_${Date.now()}`,
        name: globalAccount.name,
        pin: globalAccount.pin,
        avatar: globalAccount.avatar || '🎅',
        isHost: true,
        excludedId: '',
        isReady: false,
        wishlist: '',
        originalWishlist: '',
        blacklist: '',
        gossipComments: []
      }],
      pairings: null,
      isLocked: false,
      adminPin: '8888',
      createdAt: Date.now()
    };

    saveLocalRoomBackup(newCode, newRoomData);

    if (db) {
      try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', newCode);
        await setDoc(roomRef, newRoomData);
      } catch (err) {
        console.warn("Create room error:", err);
      }
    }

    setNewRoomNameInput('');
    setActiveTab('participants');
    setActiveRoomCode(newCode);
    showToast(`🎉 成功創建小木屋「${rName}」！代碼：${newCode}`, 'success');
  };

  // 補回缺失：刪除小木屋
  const handleDeleteRoomAction = async (targetCode) => {
    try {
      localStorage.removeItem(`santa_room_data_${targetCode}`);
      const nextList = cloudRoomList.filter(r => r.code !== targetCode);
      setCloudRoomList(nextList);
      localStorage.setItem('santa_rooms_index_v2', JSON.stringify(nextList));
    } catch {}

    if (db) {
      try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'secret_santa_rooms', targetCode);
        await deleteDoc(roomRef);
      } catch (err) {
        console.warn("Delete room error:", err);
      }
    }

    if (activeRoomCode === targetCode) {
      setActiveRoomCode(null);
    }
    setDeleteModalRoomCode(null);
    setDeleteInputPin('');
    showToast(`🗑️ 小木屋 ${targetCode} 已成功刪除！`, 'info');
  };

  const myParticipant = useMemo(() => {
    if (!globalAccount) return null;
    return participants.find(p => p.name.toLowerCase() === globalAccount.name.toLowerCase()) || null;
  }, [participants, globalAccount]);

  const isRoomCreator = useMemo(() => {
    if (!globalAccount) return false;
    if (roomInfo.creatorName && roomInfo.creatorName.toLowerCase() === globalAccount.name.toLowerCase()) {
      return true;
    }
    return Boolean(myParticipant?.isHost);
  }, [globalAccount, roomInfo.creatorName, myParticipant]);

  const readyCount = useMemo(() => {
    return participants.filter(p => p.isReady || (p.wishlist && p.wishlist.trim().length > 0)).length;
  }, [participants]);

  const readyPercent = participants.length > 0 ? Math.round((readyCount / participants.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#071712] text-[#F9F6EE] font-sans relative overflow-x-hidden selection:bg-[#D4AF37] selection:text-[#071712]">
      {/* 靜謐冬夜微光初雪背景 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-25">
        <div className="absolute top-12 left-[15%] w-2 h-2 bg-white rounded-full animate-pulse"></div>
        <div className="absolute top-28 right-[20%] w-1.5 h-1.5 bg-[#D4AF37] rounded-full animate-ping"></div>
        <div className="absolute bottom-32 left-[25%] w-2 h-2 bg-white rounded-full animate-bounce"></div>
        <div className="absolute top-1/2 right-[12%] w-2 h-2 bg-[#F3E5AB] rounded-full animate-pulse"></div>
      </div>

      {/* 頂部動態通知 Toast */}
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

      {/* 畫面一：全站登入 / 建立帳號首頁 */}
      {!globalAccount ? (
        <div className="relative z-10 max-w-md mx-auto px-4 pt-12 pb-12">
          <div className="text-center mb-6 space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-bold">
              <Trees className="w-4 h-4 text-[#D4AF37]" />
              <span>北歐靜謐冬夜・交換禮物派對</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#FFFDF9]">
              歡迎來到秘密聖誕村
            </h1>
            <p className="text-xs text-[#A3B8AE]">
              首次進入請先登記「我是誰」，即可進入受邀木屋或自己創立房間！
            </p>
          </div>

          {(activeRoomCode || pendingInviteRoom) && (
            <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-[#9E2A2B] to-[#7A1F20] border border-[#D4AF37] text-[#FFF8E7] shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#071712]/40 flex items-center justify-center text-xl shrink-0">
                💌
              </div>
              <div className="text-xs leading-relaxed">
                <div className="font-bold text-[#F3E5AB]">您已收到小木屋邀請函！</div>
                <div>完成下方登入後，將直接進入小木屋 <strong className="underline font-mono">{activeRoomCode || pendingInviteRoom}</strong></div>
              </div>
            </div>
          )}

          <div className="bg-[#0D231A]/95 border border-[#D4AF37]/40 rounded-3xl p-6 shadow-2xl backdrop-blur-md">
            <div className="flex rounded-xl bg-[#071712] p-1 mb-6 border border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition ${
                  authMode === 'register' ? 'bg-[#153528] text-[#F3E5AB] shadow border border-[#D4AF37]/40' : 'text-[#A3B8AE] hover:text-white'
                }`}
              >
                ✨ 首次進入・登記我是誰
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition ${
                  authMode === 'login' ? 'bg-[#153528] text-[#F3E5AB] shadow border border-[#D4AF37]/40' : 'text-[#A3B8AE] hover:text-white'
                }`}
              >
                🔑 已有帳號・直接登入
              </button>
            </div>

            <form onSubmit={handleGlobalAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  您的帳號 / 顯示名稱（中英文皆可）：
                </label>
                <input
                  type="text"
                  value={authName}
                  onChange={e => setAuthName(e.target.value)}
                  placeholder="例如：阿傑 / Jessica"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  設定簡易登入密碼（使用者自行設計）：
                </label>
                <input
                  type="password"
                  value={authPin}
                  onChange={e => setAuthPin(e.target.value)}
                  placeholder="例如：1234 或任意好記密碼"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
                <div className="mt-2.5 p-3 rounded-xl bg-[#3A260B]/80 border border-[#D4AF37] text-[#FEF3C7] text-xs leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#D4AF37] mt-0.5" />
                  <span>
                    <strong>⚠️ 重要提醒：</strong>此款 APP 僅供派對娛樂用，密碼保存無高機密加密，<strong>請大家絕對不要使用平常用的真實密碼！！！！</strong>
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">
                  選擇您的聖誕代表頭像：
                </label>
                <div className="flex gap-2.5 justify-center py-1">
                  {['🎅', '🤶', '🦌', '⛄', '🎄', '🎁', '🦊', '🧸'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAuthAvatar(emoji)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition ${
                        authAvatar === emoji
                          ? 'bg-[#153528] border-2 border-[#D4AF37] scale-110 shadow-lg'
                          : 'bg-[#071712] border border-[#D4AF37]/20 hover:scale-105'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] border border-[#D4AF37]/50 text-sm font-bold shadow-xl transition"
              >
                {activeRoomCode || pendingInviteRoom
                  ? `🎄 完成登入並直達小木屋 (${activeRoomCode || pendingInviteRoom})`
                  : authMode === 'register'
                  ? '🎄 完成登記並進入聖誕小木屋總覽'
                  : '🔑 登入進入聖誕小木屋總覽'}
              </button>
            </form>
          </div>
        </div>
      ) : !activeRoomCode ? (
        /* 畫面二：聖誕村首頁大廳 (所有小木屋總覽) */
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0D231A]/95 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#153528] border border-[#D4AF37] text-2xl flex items-center justify-center shadow-inner">
                {globalAccount.avatar || '🎅'}
              </div>
              <div>
                <div className="text-xs text-[#A3B8AE]">歡迎來到聖誕小木屋總覽首頁</div>
                <div className="text-lg font-extrabold text-[#FFFDF9] flex items-center gap-2">
                  <span>{globalAccount.name}</span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#153528] text-[#D4AF37] border border-[#D4AF37]/30">
                    已登入
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setGlobalAccount(null);
                try {
                  localStorage.removeItem('santa_global_account_v2');
                } catch {}
                showToast('已登出帳號！', 'info');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#153528] hover:bg-[#9E2A2B] text-[#FFF8E7] text-xs font-bold border border-[#D4AF37]/30 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>切換帳號 / 登出</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-gradient-to-br from-[#122B20] to-[#071712] border-2 border-[#D4AF37]/50 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
                  <Plus className="w-5 h-5" />
                  <span>建立新的交換禮物小木屋（您將成為創辦人）</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newRoomNameInput}
                  onChange={e => setNewRoomNameInput(e.target.value)}
                  placeholder="小木屋名稱（如：大學死黨交換禮物）"
                  className="bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
                <input
                  type="text"
                  value={newRoomBudgetInput}
                  onChange={e => setNewRoomBudgetInput(e.target.value)}
                  placeholder="禮物預算（如：NT$ 500 ~ 1,000）"
                  className="bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <button
                onClick={handleCreateNewRoom}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] font-bold text-xs border border-[#D4AF37]/40 shadow-lg transition flex items-center justify-center gap-2"
              >
                <Gift className="w-4 h-4" />
                <span>+ 立即創建我的聖誕小木屋</span>
              </button>
            </div>

            <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="text-sm font-bold text-[#F3E5AB] flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                  <span>輸入木屋代碼加入</span>
                </div>
                <p className="text-xs text-[#A3B8AE]">
                  輸入朋友分享給您的代碼（如 NOEL-123）直接進入該木屋：
                </p>
              </div>
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={e => setJoinCodeInput(e.target.value)}
                  placeholder="例如：NOEL-123"
                  className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7] uppercase font-mono"
                />
                <button
                  onClick={() => {
                    const clean = joinCodeInput.trim().toUpperCase();
                    if (!clean) {
                      showToast('請先輸入小木屋代碼！', 'warning');
                      return;
                    }
                    setActiveTab('participants');
                    setActiveRoomCode(clean);
                    setJoinCodeInput('');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-extrabold transition"
                >
                  進入該小木屋
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#FFFDF9] flex items-center gap-2">
                <Trees className="w-5 h-5 text-[#D4AF37]" />
                <span>所有聖誕小木屋總覽 ({cloudRoomList.length})</span>
              </h2>
              <span className="text-xs text-[#A3B8AE]">
                僅創辦人或管理員可刪除木屋
              </span>
            </div>

            {cloudRoomList.length === 0 ? (
              <div className="text-center py-12 bg-[#0D231A]/60 border border-[#D4AF37]/20 rounded-3xl text-sm text-[#A3B8AE] space-y-2">
                <div className="text-2xl">🪵❄️</div>
                <div className="font-bold text-[#F3E5AB]">目前還沒有任何小木屋</div>
                <div className="text-xs">請點擊上方「立即創建我的聖誕小木屋」開啟第一場派對吧！</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cloudRoomList.map(room => {
                  const isCreator =
                    room.creatorName &&
                    room.creatorName.toLowerCase() === globalAccount.name.toLowerCase();
                  return (
                    <div
                      key={room.code}
                      className="bg-[#0D231A]/95 border border-[#D4AF37]/30 rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-4 hover:border-[#D4AF37] transition"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-extrabold text-base text-[#FFFDF9]">{room.name}</div>
                          <span className="px-2.5 py-1 rounded-full bg-[#153528] border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-mono font-bold shrink-0">
                            {room.code}
                          </span>
                        </div>
                        <div className="text-xs text-[#A3B8AE] flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>👑 創辦人：<strong className="text-[#F3E5AB]">{room.creatorName || '匿名'}</strong></span>
                          <span>👥 目前人數：<strong className="text-[#D4AF37]">{room.participantsCount} 人</strong></span>
                          <span>💰 預算：{room.budget}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#D4AF37]/15">
                        <button
                          onClick={() => {
                            setActiveTab('participants');
                            setActiveRoomCode(room.code);
                          }}
                          className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-extrabold transition flex items-center gap-1.5"
                        >
                          <span>進入小木屋</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setDeleteModalRoomCode(room.code)}
                          className="px-3 py-2 rounded-xl bg-[#9E2A2B]/25 hover:bg-[#9E2A2B]/50 text-[#FDE8E8] border border-[#E05A47]/30 text-xs font-bold transition flex items-center gap-1.5"
                          title="僅創辦人或管理員可刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#E05A47]" />
                          <span>{isCreator ? '刪除木屋' : '管理員刪除'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : !isCurrentRoomLoaded ? (
        <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin"></div>
          <div className="text-sm font-bold text-[#F3E5AB]">正在同步小木屋 ({activeRoomCode})...</div>
        </div>
      ) : roomNotFound ? (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4">
          <div className="text-4xl">🪵❄️</div>
          <div className="text-lg font-extrabold text-[#FFFDF9]">找不到代碼為「{activeRoomCode}」的小木屋</div>
          <p className="text-xs text-[#A3B8AE] max-w-sm">
            該木屋可能已被創辦人刪除，或房號輸入有誤。請返回小木屋總覽首頁查看現有房間！
          </p>
          <button
            onClick={() => setActiveRoomCode(null)}
            className="px-6 py-3 rounded-xl bg-[#D4AF37] text-[#071712] text-xs font-extrabold"
          >
            ← 返回小木屋總覽首頁
          </button>
        </div>
      ) : (
        /* 畫面三：小木屋內部 */
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-2xl px-4 py-3 shadow-xl">
            <button
              onClick={() => setActiveRoomCode(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#F3E5AB] text-xs font-bold border border-[#D4AF37]/30 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>返回小木屋總覽</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] text-xs font-bold border border-[#D4AF37]/40 shadow transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>邀請函連結</span>
              </button>

              <button
                onClick={() => setDeleteModalRoomCode(roomInfo.code)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#153528] hover:bg-[#9E2A2B]/60 text-[#E05A47] text-xs font-bold border border-[#E05A47]/30 transition"
                title="僅創辦人或管理員可刪除此木屋"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">刪除木屋</span>
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#122B20] via-[#0D231A] to-[#071712] border-2 border-[#D4AF37]/50 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#D4AF37]">
                  <span>🏠 木屋代碼：{roomInfo.code}</span>
                  <span>｜</span>
                  <span>👑 創辦人：{roomInfo.creatorName || '主辦人'}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-[#FFFDF9] tracking-tight">
                  {roomInfo.name}
                </h1>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <div className="px-3.5 py-2 rounded-2xl bg-[#153528] border border-[#D4AF37]/40 text-center">
                  <div className="text-[10px] text-[#A3B8AE]">目前人數</div>
                  <div className="text-base font-black text-[#D4AF37]">{participants.length} 人</div>
                </div>
                <div className="px-3.5 py-2 rounded-2xl bg-[#153528] border border-[#D4AF37]/40 text-center">
                  <div className="text-[10px] text-[#A3B8AE]">抽籤狀態</div>
                  <div className="text-xs font-extrabold text-[#F3E5AB]">
                    {pairings ? '🎉 已完成配對' : '⏳ 準備中'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#071712]/70 border border-[#D4AF37]/30 text-[#F3E5AB]">
                <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>預算：{roomInfo.budget}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#071712]/70 border border-[#D4AF37]/30 text-[#F3E5AB]">
                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>交換時間：{roomInfo.deadline}</span>
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#F3E5AB] flex items-center gap-1.5">
                  <span>🧦 聖誕心願襪填寫進度</span>
                </span>
                <span className="font-mono font-bold text-[#D4AF37]">
                  {readyCount} / {participants.length} ({readyPercent}%)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#071712] border border-[#D4AF37]/30 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#9E2A2B] via-[#D4AF37] to-[#9E2A2B]"
                  style={{ width: `${Math.max(readyPercent, 6)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-[#0D231A]/90 p-2 rounded-2xl border border-[#D4AF37]/30 shadow-lg">
            {[
              { id: 'participants', label: '1. 聖誕名冊', icon: Users },
              { id: 'wishlist', label: '2. 許願聖誕襪', icon: Gift },
              { id: 'gossip', label: '3. 匿名嘴砲牆', icon: MessageSquare },
              { id: 'settings', label: '4. 木屋與抽籤', icon: Settings },
              { id: 'reveal', label: '5. 火漆信封開箱', icon: MailOpen }
            ].map(tab => {
              const IconComp = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] border border-[#D4AF37]/60 shadow-lg'
                      : 'text-[#A3B8AE] hover:text-[#FFF8E7] hover:bg-[#153528]/60'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* 分頁 1：聖誕老人名冊 */}
          {activeTab === 'participants' && (
            <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D4AF37]/20 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#FFFDF9] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#D4AF37]" />
                    <span>小木屋成員名冊 ({participants.length} 人)</span>
                  </h2>
                  <p className="text-xs text-[#A3B8AE] mt-0.5">
                    💡 <strong>點擊任何一位成員的框框</strong>即可變大展開，完整查看對方的聖誕心願線索與地雷清單！
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('gossip')}
                    className="px-3 py-2 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#F3E5AB] border border-[#D4AF37]/40 text-xs font-extrabold transition"
                  >
                    💬 去匿名嘴砲牆
                  </button>
                  <button
                    onClick={() => setActiveTab('wishlist')}
                    className="px-3.5 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-extrabold transition"
                  >
                    🧦 填寫我的心願襪 →
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {participants.map(p => {
                  const isMe = globalAccount && p.name.toLowerCase() === globalAccount.name.toLowerCase();
                  const hasWish = Boolean(p.isReady || (p.wishlist && p.wishlist.trim()));
                  const gossipCount = Array.isArray(p.gossipComments) ? p.gossipComments.length : 0;
                  const isExpanded = expandedMemberId === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setExpandedMemberId(isExpanded ? null : p.id)}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                        isExpanded
                          ? 'bg-[#153528] border-2 border-[#D4AF37] shadow-2xl scale-[1.01]'
                          : isMe
                          ? 'bg-[#153528]/80 border-[#D4AF37]/70 hover:border-[#D4AF37]'
                          : 'bg-[#071712]/80 border-[#D4AF37]/25 hover:border-[#D4AF37]/60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-[#0D231A] border border-[#D4AF37]/40 text-2xl flex items-center justify-center shrink-0 mt-0.5">
                            {p.avatar || '🎅'}
                          </div>
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-sm sm:text-base text-[#FFFDF9]">{p.name}</span>
                              {isMe && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#071712] font-black">
                                  我本人
                                </span>
                              )}
                              {p.isHost && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9E2A2B] text-[#FFF8E7] font-bold">
                                  👑 創辦人
                                </span>
                              )}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                hasWish ? 'bg-[#0D2E22] text-[#6EE7B7] border border-[#6EE7B7]/40' : 'bg-[#3A260B] text-[#FEF3C7]'
                              }`}>
                                {hasWish ? '🧦 心願襪已掛上' : '⏳ 心願未填'}
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[11px] text-[#D4AF37] font-bold ml-1">
                                {isExpanded ? (
                                  <>
                                    <span>收合完整心願</span>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </>
                                ) : (
                                  <>
                                    <span>點擊展開完整心願</span>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </>
                                )}
                              </span>
                            </div>

                            {!isExpanded && (
                              <div className="space-y-0.5 pt-0.5">
                                <div className="text-xs text-[#F3E5AB]/90 line-clamp-2 whitespace-pre-line">
                                  🎁 心願線索：{p.wishlist ? p.wishlist : '（尚未填寫心願清單）'}
                                </div>
                                {gossipCount > 0 && (
                                  <div className="text-[11px] text-[#D4AF37] line-clamp-1">
                                    💬 最新匿名爆料：「{p.gossipComments[p.gossipComments.length - 1].text}」
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGossipTargetId(p.id);
                              setActiveTab('gossip');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-[#0D231A] hover:bg-[#1E4635] border border-[#D4AF37]/40 text-xs font-bold text-[#F3E5AB] flex items-center gap-1 transition"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>💬 匿名嘴砲 ({gossipCount})</span>
                          </button>

                          {(isMe || isRoomCreator) && !pairings && (
                            <div className="flex items-center gap-1.5">
                              <HeartHandshake className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <select
                                value={p.excludedId || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  const updated = participants.map(item =>
                                    item.id === p.id ? { ...item, excludedId: val } : item
                                  );
                                  setParticipants(updated);
                                  syncRoomToCloud({ participants: updated });
                                  showToast(`已更新「${p.name}」的抽籤避開對象！`, 'info');
                                }}
                                className="bg-[#071712] border border-[#D4AF37]/40 rounded-xl px-2.5 py-1.5 text-xs text-[#FFF8E7]"
                              >
                                <option value="">不避開任何人</option>
                                {participants
                                  .filter(other => other.id !== p.id)
                                  .map(other => (
                                    <option key={other.id} value={other.id}>
                                      避開：{other.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}

                          {isRoomCreator && !isMe && !pairings && (
                            <button
                              onClick={() => {
                                const updated = participants.filter(item => item.id !== p.id);
                                setParticipants(updated);
                                syncRoomToCloud({ participants: updated });
                                showToast(`已將「${p.name}」移出名冊`, 'info');
                              }}
                              className="p-2 rounded-xl bg-[#9E2A2B]/30 hover:bg-[#9E2A2B] text-[#FDE8E8] transition"
                              title="移出此成員"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="mt-4 pt-4 border-t border-[#D4AF37]/30 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn cursor-default"
                        >
                          <div className="p-3.5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/40 space-y-1.5">
                            <div className="text-xs font-extrabold text-[#D4AF37] flex items-center gap-1.5">
                              <Gift className="w-4 h-4" />
                              <span>🎁 想收到的聖誕心願清單 / 線索（完整內容）：</span>
                            </div>
                            <div className="text-xs text-[#FFF8E7] whitespace-pre-line leading-relaxed break-words">
                              {p.wishlist && p.wishlist.trim()
                                ? p.wishlist
                                : '（這位成員尚未填寫心願清單）'}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-2xl bg-[#3B0D11]/60 border border-[#E05A47]/40 space-y-1.5">
                            <div className="text-xs font-extrabold text-[#FDE8E8] flex items-center gap-1.5">
                              <Ban className="w-4 h-4 text-[#E05A47]" />
                              <span>💣 千萬別送的地雷清單（完整內容）：</span>
                            </div>
                            <div className="text-xs text-[#FDE8E8] whitespace-pre-line leading-relaxed break-words">
                              {p.blacklist && p.blacklist.trim()
                                ? p.blacklist
                                : '（無特別填寫地雷清單）'}
                            </div>
                          </div>

                          {gossipCount > 0 && (
                            <div className="sm:col-span-2 p-3.5 rounded-2xl bg-[#0D231A] border border-[#D4AF37]/30 space-y-2">
                              <div className="text-xs font-extrabold text-[#F3E5AB] flex items-center justify-between">
                                <span>💬 大家對「{p.name}」的匿名嘴砲與送禮推坑 ({gossipCount} 則)：</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedGossipTargetId(p.id);
                                    setActiveTab('gossip');
                                  }}
                                  className="text-[11px] text-[#D4AF37] underline"
                                >
                                  前往匿名嘴砲牆留言 →
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                {p.gossipComments.map(c => (
                                  <div key={c.id} className="text-xs bg-[#071712]/70 rounded-xl px-3 py-2 border border-[#D4AF37]/20 text-[#FFF8E7]">
                                    <span className="font-bold text-[#D4AF37]">{c.alias}：</span>
                                    <span className="whitespace-pre-line break-words">{c.text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {isRoomCreator && !pairings && (
                <div className="pt-4 border-t border-[#D4AF37]/20 space-y-2.5">
                  <div className="text-xs font-bold text-[#F3E5AB] flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-[#D4AF37]" />
                    <span>創辦人工具：手動代新增成員（或點上方「邀請函連結」讓朋友自己點進來）</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={manualMemberAvatar}
                      onChange={e => setManualMemberAvatar(e.target.value)}
                      className="bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3 py-2 text-sm"
                    >
                      {['🦌', '🎅', '🤶', '⛄', '🎄', '🎁', '🦊', '🧸'].map(em => (
                        <option key={em} value={em}>{em}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={manualMemberName}
                      onChange={e => setManualMemberName(e.target.value)}
                      placeholder="輸入朋友名稱（例如：小美）"
                      className="flex-1 bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2 text-xs text-[#FFF8E7]"
                    />
                    <button
                      onClick={() => {
                        const clean = manualMemberName.trim();
                        if (!clean) return;
                        if (participants.some(p => p.name.toLowerCase() === clean.toLowerCase())) {
                          showToast('此名稱已經在名冊中囉！', 'warning');
                          return;
                        }
                        const newM = {
                          id: `u_${Date.now()}`,
                          name: clean,
                          pin: '1234',
                          avatar: manualMemberAvatar,
                          isHost: false,
                          excludedId: '',
                          isReady: false,
                          wishlist: '',
                          originalWishlist: '',
                          blacklist: '',
                          gossipComments: []
                        };
                        const updated = [...participants, newM];
                        setParticipants(updated);
                        syncRoomToCloud({ participants: updated });
                        setManualMemberName('');
                        showToast(`已新增成員「${clean}」！`, 'success');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#153528] hover:bg-[#1E4635] text-[#F3E5AB] border border-[#D4AF37]/40 text-xs font-bold shrink-0"
                    >
                      + 代新增成員
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 分頁 2：許願聖誕襪與地雷 */}
          {activeTab === 'wishlist' && (
            <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="border-b border-[#D4AF37]/20 pb-3">
                <h2 className="text-base font-extrabold text-[#FFFDF9] flex items-center gap-2">
                  <Gift className="w-4 h-4 text-[#D4AF37]" />
                  <span>我的專屬許願聖誕襪（{globalAccount.name}）</span>
                </h2>
                <p className="text-xs text-[#A3B8AE] mt-0.5">
                  寫下您想收到的禮物方向與千萬別送的地雷！若不想講太白，可點擊「✨ AI 燒腦高度模糊化」。
                </p>
              </div>

              {Boolean(pairings || myParticipant?.hasOpenedEnvelope) && (
                <div className="p-4 rounded-2xl bg-[#3B0D11]/90 border border-[#E05A47] text-[#FDE8E8] text-xs flex items-start gap-2.5 shadow-lg">
                  <Lock className="w-4 h-4 text-[#E05A47] shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-[#F3E5AB]">🔒 火漆信封已開箱／已發放，心願清單已鎖定：</strong>
                    為了避免秘密聖誕老人已經準備好禮物卻臨時被改掉願望，火漆信封開箱後<strong>無法再對「我想收到的聖誕心願清單 / 線索」與地雷進行更改</strong>喔！
                  </div>
                </div>
              )}

              {!myParticipant ? (
                <div className="text-center py-8 text-xs text-[#A3B8AE]">
                  您尚未在名冊中，請切換至「1. 聖誕名冊」確認！
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const isWishLocked = Boolean(pairings || myParticipant?.hasOpenedEnvelope);
                    return (
                      <>
                        {myParticipant.originalWishlist && (
                          <div className="p-4 rounded-2xl bg-[#153528] border-2 border-[#D4AF37] space-y-2 shadow-lg">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs font-extrabold text-[#D4AF37] flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5" />
                                <span>🔒 我的心願真實答案（僅您本人可見，名冊與火漆信封皆已隱藏）：</span>
                              </span>
                              {!isWishLocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = participants.map(item =>
                                      item.id === myParticipant.id
                                        ? { ...item, wishlist: item.originalWishlist, originalWishlist: '' }
                                        : item
                                    );
                                    setParticipants(updated);
                                    syncRoomToCloud({ participants: updated });
                                    showToast('已還原為您的原始直白心願！', 'info');
                                  }}
                                  className="text-[11px] font-bold text-[#F3E5AB] underline hover:text-white"
                                >
                                  ↩ 還原成直白心願重寫
                                </button>
                              )}
                            </div>
                            <div className="text-sm font-black text-[#FFFDF9] bg-[#071712]/80 px-3.5 py-2.5 rounded-xl border border-[#D4AF37]/30 whitespace-pre-line">
                              🎯 {myParticipant.originalWishlist}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <label className="text-xs font-bold text-[#F3E5AB] flex items-center gap-1.5">
                              <span>
                                {myParticipant.originalWishlist
                                  ? '🔮 公開給大家看的模糊化燒腦線索（所有人只看得到這段）：'
                                  : '🎁 我想收到的聖誕心願清單 / 線索：'}
                              </span>
                              {isWishLocked && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#9E2A2B] text-white font-bold">
                                  🔒 火漆信封已開箱・禁止更改
                                </span>
                              )}
                            </label>
                            <button
                              type="button"
                              disabled={isWishLocked || isAiLoading || !(myParticipant.originalWishlist || myParticipant.wishlist)}
                              onClick={async () => {
                                if (isWishLocked) {
                                  showToast('火漆信封已開箱，無法再修改心願清單喔！', 'warning');
                                  return;
                                }
                                setIsAiLoading(true);
                                const rawAnswer = (myParticipant.originalWishlist && myParticipant.originalWishlist.trim())
                                  ? myParticipant.originalWishlist.trim()
                                  : myParticipant.wishlist.trim();
                                const blurred = await callGeminiBlurWish(rawAnswer, EXTERNAL_GEMINI_API_KEY);
                                const updated = participants.map(item =>
                                  item.id === myParticipant.id
                                    ? {
                                        ...item,
                                        originalWishlist: rawAnswer,
                                        wishlist: blurred,
                                        isReady: true
                                      }
                                    : item
                                );
                                setParticipants(updated);
                                syncRoomToCloud({ participants: updated });
                                setIsAiLoading(false);
                                showToast('🔮 AI 已將心願模糊化！您的真實答案已安全保留在上方專屬區塊（僅本人可見）！', 'success');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#E5C158] text-[#071712] text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed shadow transition"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>
                                {isAiLoading
                                  ? 'AI 聖誕精靈施法中...'
                                  : myParticipant.originalWishlist
                                  ? '🔮 用真實答案重新換一組模糊線索'
                                  : '🔮 AI 極致燒腦模糊化心願'}
                              </span>
                            </button>
                          </div>
                          <textarea
                            rows={4}
                            disabled={isWishLocked}
                            value={myParticipant.wishlist || ''}
                            onChange={e => {
                              if (isWishLocked) return;
                              const val = e.target.value;
                              const updated = participants.map(item =>
                                item.id === myParticipant.id ? { ...item, wishlist: val } : item
                              );
                              setParticipants(updated);
                              syncRoomToCloud({ participants: updated });
                            }}
                            placeholder="例如：輸入「球鞋」，再點右上角「🔮 AI 極致燒腦模糊化心願」，真實答案「球鞋」會保留在上方只有您自己看得到，而這裡會變成給大家看的神秘線索！"
                            className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-2xl p-4 text-xs text-[#FFF8E7] leading-relaxed focus:outline-none focus:border-[#D4AF37] disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-[#E05A47]">
                            💣 千萬別送我的地雷清單（避雷指南）：
                          </label>
                          <textarea
                            rows={2}
                            disabled={isWishLocked}
                            value={myParticipant.blacklist || ''}
                            onChange={e => {
                              if (isWishLocked) return;
                              const val = e.target.value;
                              const updated = participants.map(item =>
                                item.id === myParticipant.id ? { ...item, blacklist: val } : item
                              );
                              setParticipants(updated);
                              syncRoomToCloud({ participants: updated });
                            }}
                            placeholder="例如：馬克杯（家裡已經有 10 個了）、護手霜、辣的食物..."
                            className="w-full bg-[#071712] border border-[#E05A47]/30 rounded-2xl p-3.5 text-xs text-[#FFF8E7] focus:outline-none focus:border-[#E05A47] disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            disabled={isWishLocked}
                            onClick={() => {
                              if (isWishLocked) return;
                              const nextReady = !myParticipant.isReady;
                              const updated = participants.map(item =>
                                item.id === myParticipant.id ? { ...item, isReady: nextReady } : item
                              );
                              setParticipants(updated);
                              syncRoomToCloud({ participants: updated });
                              showToast(
                                nextReady ? '🧦 已將您的聖誕心願襪掛上壁爐！' : '已取下心願襪繼續修改',
                                'success'
                              );
                            }}
                            className={`w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                              myParticipant.isReady
                                ? 'bg-[#0D2E22] text-[#6EE7B7] border border-[#6EE7B7]'
                                : 'bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-[#FFF8E7] border border-[#D4AF37]/50 shadow-lg'
                            }`}
                          >
                            {isWishLocked ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            <span>
                              {isWishLocked
                                ? '🔒 火漆信封已開箱・心願清單已鎖定'
                                : myParticipant.isReady
                                ? '✅ 已掛上心願襪（點擊可取消）'
                                : '🧦 儲存並掛上我的聖誕心願襪'}
                            </span>
                          </button>

                          {pairings && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('reveal')}
                              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#D4AF37] text-[#071712] text-xs font-extrabold"
                            >
                              前往拆開火漆信封 →
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 分頁 3：匿名嘴砲牆 */}
          {activeTab === 'gossip' && (
            <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="border-b border-[#D4AF37]/20 pb-3">
                <h2 className="text-base font-extrabold text-[#FFFDF9] flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
                  <span>🎭 匿名嘴砲許願池（親友推坑＆爆料留言板）</span>
                </h2>
                <p className="text-xs text-[#A3B8AE] mt-1 leading-relaxed">
                  大家可以在這裡<strong>完全匿名</strong>對任何一位成員進行公開留言！聊聊「他適合什麼風格、平常有什麼怪癖、建議送他什麼方向的東西」，讓抽到他的人更有靈感！（⚠️ <strong>注意：禁止直接指定特定商品全名，專供大家打嘴砲推坑！</strong>）
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#F3E5AB]">
                  1. 點選你要匿名嘴砲 / 推坑的對象：
                </label>
                <div className="flex flex-wrap gap-2">
                  {participants.map(p => {
                    const count = Array.isArray(p.gossipComments) ? p.gossipComments.length : 0;
                    const isSelected = selectedGossipTargetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedGossipTargetId(p.id)}
                        className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 border ${
                          isSelected
                            ? 'bg-[#D4AF37] text-[#071712] border-[#FFF8E7] shadow-lg scale-[1.03]'
                            : 'bg-[#071712]/80 text-[#F3E5AB] border-[#D4AF37]/30 hover:bg-[#153528]'
                        }`}
                      >
                        <span>{p.avatar || '🎅'}</span>
                        <span>{p.name}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                          isSelected ? 'bg-[#071712] text-[#D4AF37]' : 'bg-[#153528] text-[#D4AF37]'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const targetMember = participants.find(p => p.id === selectedGossipTargetId) || participants[0];
                if (!targetMember) return null;
                const targetComments = Array.isArray(targetMember.gossipComments) ? targetMember.gossipComments : [];

                return (
                  <div className="space-y-5 pt-1">
                    <div className="p-4 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/40 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="text-xs font-bold text-[#F3E5AB] flex items-center gap-1.5">
                          <span>正在對</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#9E2A2B] text-white font-extrabold">
                            {targetMember.avatar || '🎅'} {targetMember.name}
                          </span>
                          <span>進行公開匿名爆料（絕不顯示您的真名）：</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[#A3B8AE]">匿名頭銜：</span>
                          <select
                            value={gossipAlias}
                            onChange={e => setGossipAlias(e.target.value)}
                            className="bg-[#0D231A] border border-[#D4AF37]/40 rounded-xl px-2.5 py-1 text-xs text-[#F3E5AB]"
                          >
                            {[
                              '🦌 神秘吃瓜馴鹿',
                              '⛄ 路過嘴砲雪人',
                              '🎄 毒舌聖誕精靈',
                              '🎅 隔壁棚聖誕老人',
                              '🦊 知道太多的北極狐',
                              '🍪 薑餅人觀察家'
                            ].map(alias => (
                              <option key={alias} value={alias}>{alias}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={gossipInputText}
                          onChange={e => setGossipInputText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const cleanText = gossipInputText.trim();
                              if (!cleanText) return;
                              const newComment = {
                                id: `c_${Date.now()}`,
                                alias: gossipAlias,
                                text: cleanText,
                                createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              };
                              const updated = participants.map(item =>
                                item.id === targetMember.id
                                  ? { ...item, gossipComments: [...(item.gossipComments || []), newComment] }
                                  : item
                              );
                              setParticipants(updated);
                              syncRoomToCloud({ participants: updated });
                              setGossipInputText('');
                              showToast(`🎭 已匿名發送對「${targetMember.name}」的嘴砲推坑留言！`, 'success');
                            }
                          }}
                          placeholder={`匿名嘴砲「${targetMember.name}」適合什麼風格禮物...（請勿直接指定商品全名！）`}
                          className="flex-1 bg-[#0D231A] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7] focus:outline-none focus:border-[#D4AF37]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cleanText = gossipInputText.trim();
                            if (!cleanText) {
                              showToast('請先輸入匿名嘴砲或推坑內容喔！', 'warning');
                              return;
                            }
                            const newComment = {
                              id: `c_${Date.now()}`,
                              alias: gossipAlias,
                              text: cleanText,
                              createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            };
                            const updated = participants.map(item =>
                              item.id === targetMember.id
                                ? { ...item, gossipComments: [...(item.gossipComments || []), newComment] }
                                : item
                            );
                            setParticipants(updated);
                            syncRoomToCloud({ participants: updated });
                            setGossipInputText('');
                            showToast(`🎭 已匿名發送對「${targetMember.name}」的嘴砲推坑留言！`, 'success');
                          }}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-[#FFF8E7] text-xs font-extrabold border border-[#D4AF37]/50 shadow flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>匿名送出嘴砲</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-extrabold text-[#D4AF37] flex items-center justify-between">
                        <span>📢 關於「{targetMember.name}」的公開匿名嘴砲＆送禮建議 ({targetComments.length} 則)</span>
                      </div>

                      {targetComments.length === 0 ? (
                        <div className="text-center py-8 bg-[#071712]/50 rounded-2xl border border-[#D4AF37]/20 text-xs text-[#A3B8AE]">
                          目前還沒有人對「{targetMember.name}」開砲，快當第一個匿名爆料推坑的人吧！
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {targetComments.map(comment => (
                            <div
                              key={comment.id}
                              className="p-3.5 rounded-2xl bg-[#153528]/80 border border-[#D4AF37]/30 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-extrabold text-[#D4AF37]">{comment.alias}</span>
                                  <span className="text-[10px] text-[#A3B8AE]">→ 給 {targetMember.name} 的送禮建議</span>
                                  {comment.createdAt && (
                                    <span className="text-[10px] text-[#A3B8AE]/70 font-mono">{comment.createdAt}</span>
                                  )}
                                </div>
                                <p className="text-xs text-[#FFF8E7] leading-relaxed whitespace-pre-line">
                                  {comment.text}
                                </p>
                              </div>

                              {isRoomCreator && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = participants.map(item =>
                                      item.id === targetMember.id
                                        ? { ...item, gossipComments: (item.gossipComments || []).filter(c => c.id !== comment.id) }
                                        : item
                                    );
                                    setParticipants(updated);
                                    syncRoomToCloud({ participants: updated });
                                    showToast('已刪除該則匿名留言', 'info');
                                  }}
                                  className="text-[#E05A47] hover:text-white p-1"
                                  title="創辦人刪除此留言"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 分頁 4：木屋活動設定與抽籤 */}
          {activeTab === 'settings' && (
            <div className="bg-[#0D231A]/90 border border-[#D4AF37]/30 rounded-3xl p-6 shadow-xl space-y-6">
              <div className="border-b border-[#D4AF37]/20 pb-3">
                <h2 className="text-base font-extrabold text-[#FFFDF9] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#D4AF37]" />
                  <span>小木屋活動設定與秘密抽籤控制台</span>
                </h2>
                <p className="text-xs text-[#A3B8AE] mt-0.5">
                  修改木屋名稱、預算與時間，並由創辦人啟動「防死結秘密聖誕抽籤」。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">小木屋名稱：</label>
                  <input
                    type="text"
                    disabled={!isRoomCreator}
                    value={roomInfo.name}
                    onChange={e => {
                      const val = e.target.value;
                      setRoomInfo(prev => ({ ...prev, name: val }));
                      syncRoomToCloud({ roomName: val });
                    }}
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-xs text-[#FFF8E7] disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">禮物預算範圍：</label>
                  <input
                    type="text"
                    disabled={!isRoomCreator}
                    value={roomInfo.budget}
                    onChange={e => {
                      const val = e.target.value;
                      setRoomInfo(prev => ({ ...prev, budget: val }));
                      syncRoomToCloud({ budget: val });
                    }}
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-xs text-[#FFF8E7] disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#F3E5AB] mb-1.5">交換禮物日期時間：</label>
                  <input
                    type="text"
                    disabled={!isRoomCreator}
                    value={roomInfo.deadline}
                    onChange={e => {
                      const val = e.target.value;
                      setRoomInfo(prev => ({ ...prev, deadline: val }));
                      syncRoomToCloud({ deadline: val });
                    }}
                    className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-3.5 py-2.5 text-xs text-[#FFF8E7] disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#071712]/90 border border-[#D4AF37]/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#F3E5AB]">
                      🎲 秘密聖誕老人自動配對引擎
                    </div>
                    <div className="text-xs text-[#A3B8AE] mt-0.5">
                      自動排除抽到自己、遵守避開對象設定，並保證單一完美大循環（無孤島互抽）。
                    </div>
                  </div>

                  {!pairings ? (
                    <button
                      onClick={() => {
                        if (!isRoomCreator) {
                          showToast('只有此木屋創辦人可以啟動抽籤喔！', 'warning');
                          return;
                        }
                        try {
                          const result = generateSecretSantaPairs(participants);
                          setPairings(result);
                          setIsLocked(true);
                          syncRoomToCloud({ pairings: result, isLocked: true });
                          setActiveTab('reveal');
                          showToast('🎉 抽籤完成！快去拆開您的火漆封蠟神秘信封！', 'success');
                        } catch (err) {
                          showToast(err.message, 'error');
                        }
                      }}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] hover:brightness-110 text-white text-xs font-extrabold border border-[#D4AF37]/50 shadow-xl shrink-0"
                    >
                      🎲 立即啟動秘密抽籤配對
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab('reveal')}
                        className="px-4 py-2.5 rounded-xl bg-[#D4AF37] text-[#071712] text-xs font-extrabold"
                      >
                        💌 查看我的信封
                      </button>
                      {isRoomCreator && (
                        <button
                          onClick={() => {
                            setPairings(null);
                            setIsLocked(false);
                            syncRoomToCloud({ pairings: null, isLocked: false });
                            showToast('已重置抽籤結果，現在可以重新增減成員或重抽！', 'info');
                          }}
                          className="px-3.5 py-2.5 rounded-xl bg-[#153528] hover:bg-[#9E2A2B] text-[#FFF8E7] text-xs font-bold border border-[#D4AF37]/30 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>重新抽籤</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 分頁 5：火漆封蠟信封開箱 */}
          {activeTab === 'reveal' && (
            <div className="bg-[#0D231A]/95 border-2 border-[#D4AF37]/60 rounded-3xl p-6 shadow-2xl space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-lg sm:text-xl font-black text-[#FFFDF9]">
                  💌 北歐火漆封蠟神秘信封開箱
                </h2>
                <p className="text-xs text-[#D4AF37]">
                  系統只會顯示專屬於「{globalAccount.name}」本人的秘密信封，絕對防作弊！
                </p>
              </div>

              {!pairings ? (
                <div className="text-center py-10 space-y-4">
                  <div className="text-4xl">⏳🎅</div>
                  <div className="text-sm font-bold text-[#F3E5AB]">
                    尚未進行抽籤配對！
                  </div>
                  <p className="text-xs text-[#A3B8AE] max-w-sm mx-auto">
                    請等待創辦人（{roomInfo.creatorName || '主辦人'}）確認大家都進木屋後，啟動秘密抽籤配對。
                  </p>
                  {isRoomCreator && (
                    <button
                      onClick={() => {
                        try {
                          const result = generateSecretSantaPairs(participants);
                          setPairings(result);
                          setIsLocked(true);
                          syncRoomToCloud({ pairings: result, isLocked: true });
                          showToast('🎉 秘密抽籤配對完成！請點擊火漆印章拆信！', 'success');
                        } catch (err) {
                          showToast(err.message, 'error');
                        }
                      }}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#9E2A2B] to-[#B83334] text-white text-xs font-extrabold border border-[#D4AF37]"
                    >
                      🎲 我是創辦人，現在立刻抽籤！
                    </button>
                  )}
                </div>
              ) : (() => {
                if (!myParticipant) {
                  return (
                    <div className="text-center py-8 text-xs text-[#A3B8AE]">
                      您的帳號未在本次抽籤名單中。
                    </div>
                  );
                }
                const myPair = pairings.find(item => item.giverId === myParticipant.id);
                if (!myPair) {
                  return (
                    <div className="text-center py-8 text-xs text-[#A3B8AE]">
                      找不到對應的配對紀錄，請創辦人重新抽籤一次。
                    </div>
                  );
                }
                return (
                  <WaxSealEnvelope
                    giver={myParticipant}
                    pairResult={myPair}
                    participants={participants}
                    onOpenSeal={() => {
                      if (!myParticipant.hasOpenedEnvelope) {
                        const updated = participants.map(item =>
                          item.id === myParticipant.id ? { ...item, hasOpenedEnvelope: true } : item
                        );
                        setParticipants(updated);
                        syncRoomToCloud({ participants: updated });
                      }
                    }}
                  />
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 彈出視窗 A：專屬邀請函 */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D231A] border-2 border-[#D4AF37] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-extrabold text-[#FFFDF9] flex items-center gap-2">
                <span>💌 專屬聖誕小木屋邀請函</span>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-xs text-[#A3B8AE] hover:text-white"
              >
                關閉 ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#071712] border border-[#D4AF37]/40 text-xs text-[#F3E5AB] space-y-2 leading-relaxed font-mono">
              <div>🎄 【{roomInfo.name}】聖誕交換禮物邀請函</div>
              <div>🏠 小木屋代碼：{roomInfo.code}</div>
              <div>💰 禮物預算：{roomInfo.budget}</div>
              <div>📅 交換時間：{roomInfo.deadline}</div>
              <div className="pt-1 text-[#6EE7B7] break-all">
                👉 點擊專屬連結直接進入我們的小木屋：<br />
                {typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?room=${roomInfo.code}` : `https://your-app.vercel.app/?room=${roomInfo.code}`}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#153528] text-xs font-bold text-[#F3E5AB]"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomInfo.code}`;
                  const inviteText = `🎄 【${roomInfo.name}】聖誕交換禮物邀請函\n🏠 小木屋代碼：${roomInfo.code}\n💰 禮物預算：${roomInfo.budget}\n📅 交換時間：${roomInfo.deadline}\n\n👉 點擊下方連結，登記名字後直接進入小木屋：\n${shareUrl}`;
                  navigator.clipboard.writeText(inviteText);
                  setShowInviteModal(false);
                  showToast('💌 已複製完整邀請函（含直達連結），快貼到 LINE 群組吧！', 'success');
                }}
                className="flex-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#071712] text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>一鍵複製邀請函與連結</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈出視窗 B：刪除小木屋權限確認 */}
      {deleteModalRoomCode && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D231A] border-2 border-[#E05A47] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-[#E05A47]">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <div className="font-extrabold text-base">確認刪除小木屋 ({deleteModalRoomCode})？</div>
            </div>

            {(() => {
              const targetRoom = cloudRoomList.find(r => r.code === deleteModalRoomCode) || roomInfo;
              const isCreator =
                globalAccount &&
                targetRoom?.creatorName &&
                targetRoom.creatorName.toLowerCase() === globalAccount.name.toLowerCase();

              return (
                <>
                  {isCreator ? (
                    <p className="text-xs text-[#6EE7B7] leading-relaxed">
                      👑 系統確認您為此小木屋的<strong>創辦人本人（{globalAccount.name}）</strong>，可直接點擊下方按鈕刪除木屋！
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-[#A3B8AE] leading-relaxed">
                        ⚠️ 只有創辦人本人（{targetRoom?.creatorName || '創辦人'}）或系統管理員可以刪除此木屋。若您是管理員，請輸入管理員密碼（預設 <code className="text-[#D4AF37]">8888</code>）：
                      </p>
                      <input
                        type="password"
                        value={deleteInputPin}
                        onChange={e => setDeleteInputPin(e.target.value)}
                        placeholder="請輸入管理員密碼 8888"
                        className="w-full bg-[#071712] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-xs text-[#FFF8E7]"
                      />
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setDeleteModalRoomCode(null);
                        setDeleteInputPin('');
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#153528] text-xs font-bold text-[#F3E5AB]"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (isCreator || deleteInputPin === '8888' || deleteInputPin === adminPin) {
                          handleDeleteRoomAction(deleteModalRoomCode);
                        } else {
                          showToast('您不是創辦人，或管理員密碼錯誤！', 'error');
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#9E2A2B] hover:bg-[#B83334] text-xs font-extrabold text-white"
                    >
                      確認永久刪除
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}