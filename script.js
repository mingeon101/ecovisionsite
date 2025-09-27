// Firebase SDK import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 환경 변수 및 상수
const VAPID_PUBLIC_KEY = "BD-EpP_7KB44ze4fi3gjugtwm0WOU67v8jYJgLXQCzRip_mVKB4k7yuu28Xb_XATwBcVFwBzZapbRwMICet-8Xo";
const AI_INCREMENT = 50; // AI 미션 보상으로 줄 생명력/감축량

// Firebase 설정 (본인 환경에 맞게 조정 필요)
const firebaseConfig = {
    apiKey: "AIzaSyBwr1j5-SokeoEdaBL0uGejzZLLYW4IHLg",
    authDomain: "eco-vision-db.firebaseapp.com",
    databaseURL: "https://eco-vision-db-default-rtdb.firebaseio.com",
    projectId: "eco-vision-db",
    storageBucket: "eco-vision-db.firebasestorage.app",
    messagingSenderId: "340035289683",
    appId: "1:340035289683:web:dd65ba6bab22e91029fca6",
    measurementId: "G-8ZN69L0H1C"
};

// 전역 상태 변수
let db, auth;
let userId, userName;
let isSaving = false;
let lastSaveTime = 0;
const SAVE_INTERVAL = 30000; // 30초마다 저장
let currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
const levelThresholds = { 2: 100, 3: 300, 4: 700, 5: 1500, 6: 3100, 7: 6300, 8: 12700, 9: 25500, 10: 51100 };

// 보상 목록
const rewardsList = [
    { id: 'walk_50g', description: '탄소 50g 감축 달성', completed: false, requiredGhg: 50 },
    { id: 'walk_150g', description: '탄소 150g 감축 달성', completed: false, requiredGhg: 150 },
    { id: 'walk_300g', description: '탄소 300g 감축 달성', completed: false, requiredGhg: 300 },
    { id: 'walk_500g', description: '탄소 500g 감축 달성', completed: false, requiredGhg: 500 },
];

// 미션 데이터
const MISSION_DATA = [
    { icon: '🚶‍♂️‍➡️', title: '플로깅을 실천하기', description: '조깅하면서 쓰레기를 줍는 활동으로 환경 보호와 운동을 동시에 하세요. (예: 주운 쓰레기 사진)', aiEnabled: true },
    { icon: '🥤', title: '텀블러 사용', description: '일회용 컵 대신 텀블러를 사용해 쓰레기를 줄이세요. (예: 텀블러를 사용하는 사진)', aiEnabled: true },
    { icon: '🪜', title: '계단 이용', description: '가까운 층은 엘리베이터 대신 계단을 이용해 전력 소비를 줄이세요. (AI 인증 가능)', aiEnabled: true },
    { icon: '🖥️', title: '컴퓨터 절전 모드 활용', description: '잠시 자리를 비울 때는 절전 모드로 전환하거나 전원을 끄세요. (일반 인증)', aiEnabled: false },
    { icon: '♻️', title: '택배 박스 재활용', description: '박스에 붙어 있는 테이프, 송장 스티커 등 이물질을 제거하고 박스를 펼쳐 배출하세요. (일반 인증)', aiEnabled: false },
    { icon: '👕', title: '패스트 패션 지양', description: '저렴하고 유행에 따라 자주 바뀌는 옷보다는 오래 입을 수 있는 좋은 옷을 구매하세요. (일반 인증)', aiEnabled: false },
    { icon: '☘️', title: '에코 캠페인 참여', description: '환경 단체에서 주관하는 캠페인이나 서명 운동에 참여하세요. (일반 인증)', aiEnabled: false },
    { icon: '🔌', title: '플러그 뽑기', description: '사용하지 않는 가전제품의 플러그를 뽑아 대기 전력을 차단하세요.', aiEnabled: false },
    { icon: '🌡️', title: '냉난방 온도 조절', description: '여름철에는 에어컨 온도를 26°C 이상으로, 겨울철에는 난방 온도를 20°C 이하로 유지하세요.', aiEnabled: false },
    { icon: '💡', title: '전등 끄기', description: '불필요한 조명은 끄고 에너지를 절약하세요.', aiEnabled: false },
    { icon: '🚰', title: '물 절약', description: '양치할 때 컵 사용하기, 샤워 시간 줄이기 등 물을 아껴 쓰세요.', aiEnabled: false },
    { icon: '💸', title: '친환경 제품 구매', description: '환경마크가 있는 제품이나 재활용 소재로 만든 제품을 구매하세요.', aiEnabled: false },
    { icon: '🥕', title: '중고 물품 활용', description: '필요한 물건은 중고로 구매하거나, 사용하지 않는 물건은 판매하거나 기부하세요.', aiEnabled: false },
    { icon: '🛒', title: '지역 농산물 이용', description: '지역 농산물을 구매해 운송 과정에서 발생하는 탄소 배출량을 줄이세요.', aiEnabled: false },
    { icon: '🍚', title: '잔반 남기지 않기', description: '먹을 만큼만 조리하고 남기지 않아 음식물 쓰레기 및 물 낭비를 줄이세요.', aiEnabled: false }
];

let currentMission = { title: '', description: '' }; // 현재 인증하려는 미션 정보

// --- 헬퍼 함수 ---

// VAPID 키를 서버 전송 형식으로 변환
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
}

// 파일(Blob)을 Base64 문자열로 변환
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// --- UI 제어 함수 ---

function showModal(title, message) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-overlay").style.display = 'flex';
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = 'none';
}

function openSidePanel() {
    document.getElementById("side-panel-overlay").classList.add('active');
    document.getElementById("side-panel").classList.add('active');
}

function closeSidePanel() {
    document.getElementById("side-panel-overlay").classList.remove('active');
    document.getElementById("side-panel").classList.remove('active');
}

function openMissionModal() {
    loadMissions();
    document.getElementById('mission-modal-overlay').style.display = 'flex';
}
function closeMissionModal() {
    document.getElementById('mission-modal-overlay').style.display = 'none';
}
function openRewardsModal() {
    checkRewardsStatus();
    document.getElementById('rewards-modal-overlay').style.display = 'flex';
}
function closeRewardsModal() {
    document.getElementById('rewards-modal-overlay').style.display = 'none';
}

// AI 인증 상세 모달 제어 함수 (HTML에서 직접 호출됨)
window.closeAIAuthModal = function() {
    const aiAuthModalOverlay = document.getElementById('ai-auth-modal-overlay');
    aiAuthModalOverlay.classList.add('opacity-0');
    aiAuthModalOverlay.querySelector('.modal-content-ai').classList.add('scale-95');
    setTimeout(() => {
        aiAuthModalOverlay.classList.add('hidden');
    }, 300);
}

window.handleMissionClick = function(title, description) {
    currentMission = { title, description };
    const aiAuthModalOverlay = document.getElementById('ai-auth-modal-overlay');
    const authMissionTitle = document.getElementById('auth-mission-title');
    const authMissionDesc = document.getElementById('auth-mission-desc');
    const missionImageInput = document.getElementById('mission-image');
    const imagePreview = document.getElementById('image-preview');
    const authStatusArea = document.getElementById('auth-status-area');
    const authMessage = document.getElementById('auth-message');
    const verifyMissionBtn = document.getElementById('verify-mission-btn');
    
    authMissionTitle.textContent = title;
    authMissionDesc.textContent = description.replace(' (예:', ' (AI 분석을 위해 인증 사진이 필요합니다. 예:'); 
    
    missionImageInput.value = '';
    imagePreview.classList.add('hidden');
    imagePreview.src = '';
    authStatusArea.classList.add('hidden');
    authMessage.textContent = '';
    verifyMissionBtn.disabled = false;
    verifyMissionBtn.textContent = 'AI로 미션 인증하기';
    verifyMissionBtn.classList.remove('bg-gray-400');
    verifyMissionBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');

    aiAuthModalOverlay.classList.remove('hidden');
    setTimeout(() => {
        aiAuthModalOverlay.classList.remove('opacity-0');
        aiAuthModalOverlay.querySelector('.modal-content-ai').classList.remove('scale-95');
    }, 10);
}

// --- 게임 상태 및 데이터 처리 함수 ---

function updateDisplay() {
    document.getElementById('level-value').textContent = currentState.level;
    document.getElementById('life-force-value').textContent = currentState.lifeForce;
    document.getElementById('ghg-reduced-value').textContent = `${currentState.ghgReduced}g`;
    document.getElementById("panel-level-value").textContent = currentState.level;
    document.getElementById("panel-ghg-reduced-value").textContent = `${currentState.ghgReduced}g`;
    const oreumElement = document.getElementById('oreum');
    oreumElement.className = `oreum level-${Math.min(currentState.level, 5)}`;
}

function checkLevelUp() {
    const nextLevel = currentState.level + 1;
    if (levelThresholds[nextLevel] && currentState.lifeForce >= levelThresholds[nextLevel]) {
        currentState.level = nextLevel;
        showModal("🎉 레벨 업!", `축하합니다! 오름이 Level ${currentState.level}(으)로 성장했습니다!`);
    }
}

// 센서 및 상태 업데이트 (위치 기반 로직)
async function updateGameAndTransport(speed) {
    if (!userId) return;

    let transport = "정지 상태";
    const speed_kph = speed * 3.6;

    if (speed_kph >= 30) transport = "차량";
    else if (speed_kph >= 10) transport = "자전거";
    else if (speed_kph >= 1) transport = "도보";
    
    document.getElementById("transport-display").textContent = transport;
    document.getElementById("speed-display").textContent = `${speed.toFixed(2)} m/s`;
    
    let lifeForceChange = 0;
    let ghgChange = 0;

    // 이동수단에 따른 생명력 및 감축량 변화 (초당 값으로 가정)
    switch (transport) {
        case "도보": lifeForceChange = 1; ghgChange = 2; break;
        case "자전거": lifeForceChange = 1; ghgChange = 4; break;
        case "차량": lifeForceChange = -2; ghgChange = -10; break;
    }

    if(lifeForceChange !== 0 || ghgChange !== 0) {
        currentState.lifeForce += lifeForceChange;
        currentState.ghgReduced += ghgChange;
        if(currentState.ghgReduced < 0) currentState.ghgReduced = 0;
    
        checkLevelUp();
        updateDisplay();
        checkRewardsStatus();
    }

    // DB 자동 저장
    const currentTime = Date.now();
    if (!isSaving && (currentTime - lastSaveTime > SAVE_INTERVAL)) {
        isSaving = true;
        document.getElementById("db-status").textContent = "데이터 저장 중...";
        try {
            const userPath = `users/${userId}`;
            await set(ref(db, `${userPath}/gameState`), currentState);
            lastSaveTime = currentTime;
            document.getElementById("db-status").textContent = "데이터 저장 완료!";
        } catch (e) {
            console.error("DB 저장 오류: ", e);
            document.getElementById("db-status").textContent = "데이터 저장 오류";
        } finally {
            isSaving = false;
        }
    }
}

function startSensors() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                const speed = pos.coords.speed || 0;
                updateGameAndTransport(speed);
            },
            (err) => {
                console.error("Geolocation Error:", err);
                showModal("위치 정보 오류", "위치 정보 접근이 거부되었거나 오류가 발생했습니다.");
            },
            { enableHighAccuracy: true, maximumAge: 500, timeout: 5000 }
        );
    } else {
        showModal("오류", "이 브라우저는 위치 정보(GPS)를 지원하지 않습니다.");
    }
}

// AI 미션 성공 시 게임 상태 업데이트 및 DB 저장 함수 (핵심)
window.updateLifeForceAndGhg = async function(rewardAmount) {
    if (!userId) {
        showModal("인증 오류", "AI 미션 인증 보상 수령을 위해서는 로그인이 필요합니다.");
        return;
    }
    
    currentState.lifeForce += rewardAmount;
    currentState.ghgReduced += rewardAmount;
    
    updateDisplay();
    checkLevelUp();
    checkRewardsStatus();
    
    // Firebase에 즉시 저장
    const userPath = `users/${userId}/gameState`;
    await set(ref(db, userPath), currentState);
    
    showModal("미션 성공!", `축하합니다! 미션을 완료하여 오름의 생명력과 탄소 감축량 ${rewardAmount}g을 획득했습니다.`);
};

// 보상 관련 함수
function checkRewardsStatus() {
    rewardsList.forEach(reward => {
        reward.completed = currentState.ghgReduced >= reward.requiredGhg;
    });
    renderRewards();
}

function renderRewards() {
    const rewardListContainer = document.getElementById('reward-list-container');
    rewardListContainer.innerHTML = '';
    rewardsList.forEach(reward => {
        const rewardItem = document.createElement('div');
        const isCompleted = reward.completed;
        rewardItem.className = `reward-item ${isCompleted ? 'completed' : ''}`;
        
        rewardItem.innerHTML = `
            <div class="reward-icon-container">
                ${isCompleted ? 
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' :
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>'
                }
            </div>
            <p>${reward.description}</p>
        `;
        rewardListContainer.appendChild(rewardItem);
    });
}

// 미션 목록 동적 로드 함수
function loadMissions() {
    const missionListContainer = document.getElementById('mission-list-container');
    missionListContainer.innerHTML = '';
    
    MISSION_DATA.forEach(mission => {
        const li = document.createElement('li');
        li.className = 'mission-item p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition duration-150';
        
        const missionTitleEscaped = mission.title.replace(/'/g, "\\'");
        const missionDescEscaped = mission.description.replace(/'/g, "\\'");
        
        if (mission.aiEnabled) {
            // AI 인증 미션: AI 인증 모달을 엽니다.
            li.setAttribute('onclick', `closeMissionModal(); handleMissionClick('${mission.icon} ${missionTitleEscaped}', '${missionDescEscaped}')`);
            li.innerHTML = `
                <h3 class="font-semibold text-lg text-gray-800 flex items-center">
                    ${mission.icon} ${mission.title}
                    <span class="ml-2 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">AI 인증</span>
                </h3>
                <p class="text-sm text-gray-600">${mission.description.split('(')[0].trim()}</p>
            `;
        } else {
            // 일반 인증 미션: 알림 모달을 띄웁니다.
            li.setAttribute('onclick', `closeMissionModal(); showModal('일반 인증', '${mission.title} 미션은 수동 인증이 필요합니다.')`);
            li.innerHTML = `
                <h3 class="font-semibold text-lg text-gray-800 flex items-center">
                    ${mission.icon} ${mission.title}
                    <span class="ml-2 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">수동 인증</span>
                </h3>
                <p class="text-sm text-gray-600">${mission.description.split('(')[0].trim()}</p>
            `;
        }

        missionListContainer.appendChild(li);
    });
}

// --- Firebase 및 인증 로직 ---

async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        closeSidePanel();
    } catch (error) {
        console.error("Google 로그인 오류:", error);
        showModal("로그인 오류", `로그인에 실패했습니다: ${error.message}`);
    }
}

function loadGameStateFromDB(currentUserId) {
    const userPath = `users/${currentUserId}/gameState`;
    const stateRef = ref(db, userPath);

    onValue(stateRef, (snapshot) => {
        if (snapshot.exists()) {
            currentState = snapshot.val();
        } else {
            currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
        }
        updateDisplay();
        checkRewardsStatus();
        document.getElementById("db-status").textContent = "데이터 동기화 완료!";
    });
}

// --- AI 인증 로직 (핵심) ---

async function verifyMissionWithAI(base64ImageData, mimeType, missionTitle, missionDescription) {
    const systemPrompt = `당신은 사용자의 친환경 미션 수행을 인증하는 AI 전문가입니다. 
    다음 규칙에 따라 응답하세요:
    1. 사용자가 업로드한 이미지와 요청된 미션 내용이 일치하는지, 미션 수행의 증거가 명확한지 판단해야 합니다.
    2. 응답은 오직 JSON 형식이어야 합니다. 텍스트나 추가 설명은 포함하지 마세요.
    3. JSON 형식: {"verification_result": boolean, "reason_kr": string}
    4. 'verification_result'가 true이면 미션이 성공적으로 인증되었음을 의미합니다.
    5. 'verification_result'가 false이면 인증에 실패했음을 의미합니다.
    6. 'reason_kr'은 한국어로 된 판단 이유입니다.`;

    const userQuery = `미션 제목: '${missionTitle}'. 미션 내용: '${missionDescription}'.
    이 이미지가 주어진 미션을 성공적으로 수행했음을 입증하는 충분한 증거를 제공합니까?`;

    const apiKey = ""; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: userQuery },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64ImageData
                        }
                    }
                ]
            }
        ],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "verification_result": { "type": "BOOLEAN" },
                    "reason_kr": { "type": "STRING" }
                }
            }
        }
    };

    let response;
    const maxRetries = 3;
    let delay = 1000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (jsonText) {
                    let cleanJsonText = jsonText.replace(/```json\s*/g, '').replace(/\s*```/g, '');
                    const parsedJson = JSON.parse(cleanJsonText);
                    return parsedJson.verification_result;
                }
            }
        } catch (error) {
            if (i === maxRetries - 1) {
                throw new Error('AI 미션 인증 서버 응답을 받을 수 없습니다.');
            }
        }

        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
}

// --- 이벤트 리스너 등록 및 초기화 ---

document.addEventListener('DOMContentLoaded', () => {
    // Service Worker 등록 (푸시 알림용)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker 등록 성공:', reg))
            .catch(err => console.error('Service Worker 등록 실패:', err));
    }

    // Firebase 초기화
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    // DOM 요소 캐싱
    const googleSignInBtn = document.getElementById("google-sign-in-btn");
    const signOutBtn = document.getElementById("sign-out-btn");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const profileIcon = document.getElementById('profile-icon-wrapper');
    const sidePanelCloseBtn = document.getElementById("side-panel-close-btn");
    const sidePanelOverlay = document.getElementById("side-panel-overlay");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    const missionIcon = document.getElementById('mission-icon-wrapper');
    const rewardsIcon = document.getElementById('rewards-icon-wrapper');
    const missionModalOverlay = document.getElementById('mission-modal-overlay');
    const rewardsModalOverlay = document.getElementById('rewards-modal-overlay');
    const missionCloseBtn = document.getElementById('mission-close-btn');
    const rewardsCloseBtn = document.getElementById('rewards-close-btn');
    
    const missionImageInput = document.getElementById('mission-image');
    const imagePreview = document.getElementById('image-preview');
    const verifyMissionBtn = document.getElementById('verify-mission-btn');
    const authStatusArea = document.getElementById('auth-status-area');
    const authMessage = document.getElementById('auth-message');
    
    // 초기 미션 목록 로드
    loadMissions(); 

    // Firebase 인증 상태 변화 감지
    onAuthStateChanged(auth, (user) => {
        const loggedOutView = document.getElementById("logged-out-view");
        const loggedInView = document.getElementById("logged-in-view");
        const userInfoDisplay = document.getElementById("user-info-display");
        const panelUserInfo = document.getElementById("panel-user-info");

        if (user) {
            userId = user.uid;
            userName = user.displayName || '사용자';
            
            userInfoDisplay.textContent = `환영합니다, ${userName}님!`;
            panelUserInfo.textContent = `${userName}님, 환영합니다!`;
            loggedOutView.classList.add('hidden');
            loggedInView.classList.remove('hidden');

            loadGameStateFromDB(userId);
            startSensors();
        } else {
            userId = null;
            userName = null;
            
            userInfoDisplay.textContent = "로그인하고 오름을 키워보세요!";
            loggedOutView.classList.remove('hidden');
            loggedInView.classList.add('hidden');
            
            currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
            updateDisplay();
            document.getElementById("db-status").textContent = "로그인 대기 중...";
        }
    });

    // --- UI 이벤트 리스너 ---
    googleSignInBtn.addEventListener('click', signInWithGoogle);
    signOutBtn.addEventListener('click', () => signOut(auth));
    profileIcon.addEventListener('click', openSidePanel);
    sidePanelCloseBtn.addEventListener('click', closeSidePanel);
    sidePanelOverlay.addEventListener('click', e => { if (e.target === sidePanelOverlay) closeSidePanel(); });
    modalCloseBtn.addEventListener('click', closeModal);
    
    missionIcon.addEventListener('click', openMissionModal);
    rewardsIcon.addEventListener('click', openRewardsModal);
    missionCloseBtn.addEventListener('click', closeMissionModal);
    rewardsCloseBtn.addEventListener('click', closeRewardsModal);
    missionModalOverlay.addEventListener('click', e => { if (e.target === missionModalOverlay) closeMissionModal(); });
    rewardsModalOverlay.addEventListener('click', e => { if (e.target === rewardsModalOverlay) closeRewardsModal(); });
    
    // --- AI 인증 관련 이벤트 리스너 ---
    
    // 이미지 미리보기
    missionImageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.classList.add('hidden');
            imagePreview.src = '';
        }
        // 상태 초기화
        authStatusArea.classList.add('hidden');
        authMessage.textContent = '';
        verifyMissionBtn.disabled = false;
        verifyMissionBtn.textContent = 'AI로 미션 인증하기';
        verifyMissionBtn.classList.remove('bg-gray-400');
        verifyMissionBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    });

    // AI 인증 실행
    verifyMissionBtn.addEventListener('click', async () => {
        if (typeof auth === 'undefined' || !auth.currentUser) {
            closeAIAuthModal();
            showModal("로그인 필요", "미션을 인증하려면 로그인해야 합니다.");
            return;
        }

        const file = missionImageInput.files[0];
        if (!file) {
            authStatusArea.classList.remove('hidden');
            authStatusArea.classList.add('bg-yellow-100');
            authMessage.style.color = 'orange';
            authMessage.textContent = '인증을 위해 사진 파일을 선택해주세요.';
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            authStatusArea.classList.remove('hidden');
            authStatusArea.classList.add('bg-red-100');
            authMessage.style.color = 'red';
            authMessage.textContent = '파일 크기가 너무 큽니다. 5MB 이하의 파일을 업로드해주세요.';
            return;
        }

        verifyMissionBtn.disabled = true;
        verifyMissionBtn.textContent = 'AI 인증 중...';
        verifyMissionBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        verifyMissionBtn.classList.add('bg-gray-400');
        
        authStatusArea.classList.remove('hidden');
        authStatusArea.classList.add('bg-gray-100');
        authMessage.style.color = '#4a5568';
        authMessage.textContent = '사진을 분석하고 있습니다. 잠시만 기다려주세요...';

        const base64Data = await fileToBase64(file);

        try {
            const isVerified = await verifyMissionWithAI(base64Data, file.type, currentMission.title, currentMission.description);
            
            authStatusArea.classList.remove('bg-gray-100', 'bg-yellow-100', 'bg-red-100');
            
            if (isVerified) {
                authStatusArea.classList.add('bg-green-100');
                authMessage.style.color = 'green';
                authMessage.textContent = `✅ 미션 인증 성공! '${currentMission.title}' 미션을 완료하여 생명력 +${AI_INCREMENT}을 획득했습니다.`;
                
                // 게임 상태 업데이트 (AI 보상 적용)
                window.updateLifeForceAndGhg(AI_INCREMENT);
                
                setTimeout(closeAIAuthModal, 2500);

            } else {
                authStatusArea.classList.add('bg-red-100');
                authMessage.style.color = 'red';
                authMessage.textContent = '❌ 미션 인증 실패. AI가 사진에서 미션 수행 증거를 찾지 못했습니다. 미션에 적합한 사진을 다시 업로드해 주세요.';
            }

        } catch (error) {
            console.error("AI 인증 오류:", error);
            authStatusArea.classList.remove('bg-gray-100', 'bg-green-100', 'bg-yellow-100');
            authStatusArea.classList.add('bg-red-100');
            authMessage.style.color = 'red';
            authMessage.textContent = '⚠️ API 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
        } finally {
            verifyMissionBtn.disabled = false;
            verifyMissionBtn.textContent = 'AI로 미션 인증하기';
            verifyMissionBtn.classList.remove('bg-gray-400');
            verifyMissionBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }
    });
    
    // 푸시 알림 구독
    subscribeBtn.addEventListener('click', async () => {
        if (!('PushManager' in window) || !auth.currentUser) {
            showModal("오류", "푸시 알림을 구독하려면 로그인이 필요합니다.");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.');
            
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            
            const body = { subscription, userId: auth.currentUser.uid };
            // 이 경로는 Netlify Functions (save-subscription.js)로 연결됩니다.
            await fetch('/api/save-subscription', { 
                method: 'POST',
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' },
            });
            showModal("알림 구독 완료", "성공적으로 알림을 구독했습니다.");
        } catch (error) {
            console.error("구독 실패: ", error);
            showModal("오류", `알림 구독에 실패했습니다: ${error.message}`);
        }
    });

});
