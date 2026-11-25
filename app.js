/* ==========================================================================
   CC SPINNER — MAIN APPLICATION ENGINE (app.js)
   ==========================================================================
   1.  Global State & Constants
   2.  Initialization, Persistence & Navigation
   3.  Core Spinner Engine
   4.  Mistakes Flagging & Badges
   5.  Audio, Haptics & Text-to-Speech
   6.  Voiceover Audio Engine
   7.  Extra Info Modal (Panzoom)
   8.  Lessons Grid & Week Range Controls
   9.  Review Mode & Quick Picker
   10. Settings Toggles
   11. Challenge: Review Mistakes
   12. Challenge: Time Attack
   13. Challenge: Map Game
   14. Challenge: Trivia Quiz
   15. Challenge: CC Spinner Radio
   16. Celebration & Confetti Engine
   17. Splash Screen & Daily Streak
   18. Interactive Walkthrough
   19. Contact Form, Input Bindings & PWA
   ========================================================================== */

/* ==========================================================================
   1. GLOBAL STATE & CONSTANTS
   ========================================================================== */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const subjects = ["Bible", "English", "Geography", "History", "Latin", "Math", "Science", "Timeline"];
const subjectIcons = {
    "Bible": "📜", "English": "📖", "Geography": "🌍", "History": "⚔️",
    "Latin": "🏛️", "Math": "🔢", "Science": "🧪", "Timeline": "⏳"
};
const weeks = Array.from({ length: 24 }, (_, i) => i + 1);

const latinTwinGroups = [
    [1, 2, 13, 14],  // Present Tense
    [3, 4, 15, 16],  // Imperfect Tense
    [5, 6, 17, 18],  // Future Tense
    [7, 8, 19, 20],  // Perfect Tense
    [9, 10, 21, 22], // Pluperfect Tense
    [11, 12, 23, 24] // Future Perfect Tense
];

const challengeIds = [
    'challengeContainer', 'taMenuContainer', 'taGameContainer',
    'mistakeGameContainer', 'mapMenuContainer', 'mapGameContainer',
    'triviaMenuContainer', 'triviaGameContainer', 'scriptureContainer',
    'radioContainer'
];

// Cached Core DOM Elements
const spinBtn = document.getElementById("spinBtn");
const toggleBtn = document.getElementById("toggleAnswer");
const undoBtn = document.getElementById("undoBtn");
const promptDiv = document.getElementById("prompt");
const ansDiv = document.getElementById("answerContent");

// Core App State
let currentMode = 'spinner';
let activeChallengePage = 'challengeContainer';
let isSpinning = false;
let pendingTAFinish = false;
let spinHistory = [];

// Active Cycle & Storage Prefix
let currentCycle = localStorage.getItem('ccActiveCycle') ? parseInt(localStorage.getItem('ccActiveCycle'), 10) : 2;
const getPrefix = () => `cycle${currentCycle}_`;

// Cycle-Specific Persisted State
let gridState = JSON.parse(localStorage.getItem(getPrefix() + 'ccSpinnerProgress') || '{}');
let allowedWeeks = JSON.parse(localStorage.getItem(getPrefix() + 'ccAllowedWeeks') || '[]');
let blockedWeeks = JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedWeeks') || '[]');
let blockedSubjects = JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedSubjects') || '[]');
let mistakesBank = JSON.parse(localStorage.getItem(getPrefix() + 'ccMistakesBank') || '[]');

// Global User Settings
let userSettings = Object.assign({
    muted: false,
    haptics: true,
    turbo: false,
    autoReveal: false,
    darkMode: false,
    selectedVoice: ""
}, JSON.parse(localStorage.getItem('appSettings') || '{}'));

// Active Lesson Data Pointer (loaded from data.js)
let lessonData = cycleData[currentCycle];

if (Object.keys(gridState).length === 0) {
    subjects.forEach(s => {
        gridState[s] = {};
        weeks.forEach(w => gridState[s][w] = true);
    });
}


/* ==========================================================================
   2. INITIALIZATION, PERSISTENCE & NAVIGATION
   ========================================================================== */
function saveSettings() {
    localStorage.setItem('appSettings', JSON.stringify(userSettings));
}

function saveToDevice() {
    const prefix = getPrefix();
    localStorage.setItem(prefix + 'ccSpinnerProgress', JSON.stringify(gridState));
    localStorage.setItem(prefix + 'ccMaxWeek', String(getMaxWeek()));
    localStorage.setItem(prefix + 'ccMinWeek', String(getMinWeek()));
    localStorage.setItem(prefix + 'ccAllowedWeeks', JSON.stringify(allowedWeeks));
    localStorage.setItem(prefix + 'ccBlockedWeeks', JSON.stringify(blockedWeeks));
    localStorage.setItem(prefix + 'ccBlockedSubjects', JSON.stringify(blockedSubjects));
    localStorage.setItem(prefix + 'ccMistakesBank', JSON.stringify(mistakesBank));
}

function switchMode(mode) {
    pauseRadio();
    stopVoiceover();

    // Double-tap Focus tab to return to the Focus menu
    if (mode === 'challenge' && currentMode === 'challenge') {
        challengeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
        document.getElementById('challengeContainer').classList.add('active');
        activeChallengePage = 'challengeContainer';
        pauseTimeAttack();
        return;
    }

    // Toggle main views
    document.getElementById('spinnerContainer').classList.toggle('active', mode === 'spinner');
    document.getElementById('reviewContainer').classList.toggle('active', mode === 'review');
    document.getElementById('gridContainer').classList.toggle('active', mode === 'grid');
    document.getElementById('settingsContainer').classList.toggle('active', mode === 'settings');

    if (mode === 'challenge') {
        challengeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });

        const target = document.getElementById(activeChallengePage || 'challengeContainer');
        if (target) target.classList.add('active');

        resumeTimeAttack();

        if (pendingTAFinish) {
            endTimeAttack(false);
            pendingTAFinish = false;
        }
    } else {
        challengeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.classList.contains('active')) {
                activeChallengePage = id;
                el.classList.remove('active');
            }
        });
        pauseTimeAttack();
    }

    currentMode = mode;

    // Update bottom nav highlight
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + mode);
    if (activeNav) activeNav.classList.add('active');

    if (mode === 'review') initReviewMode();
    if (mode === 'grid') buildGrid();
}

function changeCycle(cycleNum) {
    currentCycle = parseInt(cycleNum, 10);
    localStorage.setItem('ccActiveCycle', currentCycle);
    lessonData = cycleData[currentCycle];

    gridState = JSON.parse(localStorage.getItem(getPrefix() + 'ccSpinnerProgress') || '{}');
    allowedWeeks = JSON.parse(localStorage.getItem(getPrefix() + 'ccAllowedWeeks') || '[]');
    blockedWeeks = JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedWeeks') || '[]');
    blockedSubjects = JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedSubjects') || '[]');
    mistakesBank = JSON.parse(localStorage.getItem(getPrefix() + 'ccMistakesBank') || '[]');

    if (Object.keys(gridState).length === 0) {
        subjects.forEach(s => {
            gridState[s] = {};
            weeks.forEach(w => gridState[s][w] = true);
        });
    }

    const cycleMax = localStorage.getItem(getPrefix() + 'ccMaxWeek');
    const cycleMin = localStorage.getItem(getPrefix() + 'ccMinWeek');
    setMaxWeek(cycleMax ? parseInt(cycleMax, 10) : 24);
    setMinWeek(cycleMin ? parseInt(cycleMin, 10) : 1);

    buildGrid();
    if (currentMode === 'review') updateReviewDisplay();
    updateFlagUI();
    updateScriptureButtonUI();
}

function updateVh() {
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
window.addEventListener('resize', updateVh);
updateVh();

window.onload = function () {
    document.getElementById('cyclePicker').value = currentCycle;
    const splashPicker = document.getElementById('splashCyclePicker');
    if (splashPicker) splashPicker.value = currentCycle;

    lessonData = cycleData[currentCycle];
    updateSettingsIcons();

    if (!navigator.vibrate) {
        const hapticsRow = document.getElementById('row-haptics');
        if (hapticsRow) hapticsRow.style.display = 'none';
    }

    const prefix = getPrefix();
    const savedMax = localStorage.getItem(prefix + 'ccMaxWeek');
    const savedMin = localStorage.getItem(prefix + 'ccMinWeek');
    setMaxWeek(savedMax ? parseInt(savedMax, 10) : 24);
    setMinWeek(savedMin ? parseInt(savedMin, 10) : 1);

    document.getElementById('toggleAnswer').disabled = true;
    buildGrid();
    setupAudioButtons();

    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(40);
    checkStandaloneMode();

    // Sync version tag from manifest
    fetch('manifest.json')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(m => {
            const verEl = document.getElementById('app-version');
            if (verEl) verEl.innerText = m.version;
        })
        .catch(() => {
            const verEl = document.getElementById('app-version');
            if (verEl) verEl.innerText = "not available";
        });

    updateDailyStreak();
    updateFlagUI();
    updateScriptureButtonUI();

    // Reveal splash screen after layout and fonts settle
    setTimeout(() => {
        const splashInner = document.getElementById('splashContentWrapper');
        if (splashInner) splashInner.style.opacity = '1';
    }, 250);
};


/* ==========================================================================
   3. CORE SPINNER ENGINE
   ========================================================================== */
function setSpinLabel(label) {
    if (!spinBtn) return;
    const tp = spinBtn.querySelector('textPath');
    if (tp) tp.textContent = String(label).toUpperCase();
    else spinBtn.textContent = String(label).toUpperCase();
}

function getSpinLabel() {
    if (!spinBtn) return '';
    const tp = spinBtn.querySelector('textPath');
    if (tp) return (tp.textContent || '').trim();
    return (spinBtn.textContent || '').trim();
}

function isWeekActive(w, minLimit, maxLimit) {
    return ((w >= minLimit && w <= maxLimit) || allowedWeeks.includes(w)) && !blockedWeeks.includes(w);
}

function spinBoth() {
    stopVoiceover();
    if (getSpinLabel().toLowerCase() === 'done') {
        finishLesson();
        return;
    }
    if (isSpinning) return;
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15);

    const minWeekLimit = getMinWeek();
    const maxWeekLimit = getMaxWeek();

    const availableSubjects = subjects.filter(s =>
        !blockedSubjects.includes(s) &&
        weeks.some(w => isWeekActive(w, minWeekLimit, maxWeekLimit) && gridState[s][w])
    );

    if (availableSubjects.length === 0) {
        setSpinLabel('Done');
        if (spinBtn) {
            spinBtn.style.background = '#22c55e';
            spinBtn.style.fontSize = '14px';
        }
        finishLesson();
        return;
    }

    // Lock UI during spin
    isSpinning = true;
    spinBtn.disabled = true;
    toggleBtn.disabled = true;
    undoBtn.disabled = true;
    document.getElementById('flagBtn').disabled = true;

    toggleBtn.textContent = '▼ Show Answer ▼';
    document.getElementById('answerContainer').classList.remove('open');
    ansDiv.textContent = "";
    promptDiv.textContent = "";

    const subject = availableSubjects[Math.floor(Math.random() * availableSubjects.length)];
    const availableWeeks = weeks.filter(w => isWeekActive(w, minWeekLimit, maxWeekLimit) && gridState[subject][w]);
    const week = availableWeeks[Math.floor(Math.random() * availableWeeks.length)];
    const subIdx = subjects.indexOf(subject);
    const weekIdx = weeks.indexOf(week);

    const spinDuration = userSettings.turbo ? 500 : 2000;
    const weekDuration = userSettings.turbo ? 700 : 2800;
    const finalTimeout = userSettings.turbo ? 750 : 2600;

    spinReel("subjectReel", availableSubjects, subject, spinDuration);
    spinReel("weekReel", availableWeeks.map(w => "Week " + w), "Week " + week, weekDuration);

    setTimeout(() => {
        try {
            playSound(988, 'triangle', 0.1, 0.03);
            setTimeout(() => playSound(1319, 'triangle', 0.2, 0.03), 100);
            if (userSettings.haptics && navigator.vibrate) navigator.vibrate([40, 30, 40]);

            const lesson = lessonData[subject][week];

            spinHistory.push({
                subject,
                week,
                sIdx: subIdx,
                wIdx: weekIdx,
                prompt: lesson.p,
                answer: lesson.a
            });
            if (spinHistory.length > 50) spinHistory.shift();

            promptDiv.textContent = lesson.p;
            ansDiv.innerHTML = lesson.a;

            prepVoiceover(subject, week, 'audioBtnMain');
            prepInfoBtn(subject, week, 'infoBtnMain');

            if (userSettings.autoReveal) {
                document.getElementById('answerContainer').classList.add('open');
                toggleBtn.textContent = '▲ Hide Answer ▲';
            }

            gridState[subject][week] = false;

            if (subject === "Latin" && currentCycle === 2) {
                const group = latinTwinGroups.find(g => g.includes(week));
                if (group) {
                    group.forEach(twinWeek => {
                        gridState["Latin"][twinWeek] = false;
                    });
                }
            }

            saveToDevice();
            buildGrid();

            const remaining = subjects.some(s =>
                !blockedSubjects.includes(s) &&
                weeks.some(w => isWeekActive(w, minWeekLimit, maxWeekLimit) && gridState[s][w])
            );
            if (!remaining) {
                setSpinLabel('Done');
                spinBtn.style.background = '#22c55e';
                spinBtn.style.fontSize = '14px';
            }
        } catch (e) {
            console.error("Spin Error:", e);
            promptDiv.textContent = "Spinning error. Please try again!";
        } finally {
            isSpinning = false;
            spinBtn.disabled = false;
            toggleBtn.disabled = false;
            undoBtn.disabled = false;
            updateFlagUI();
        }
    }, finalTimeout);
}

function spinReel(reelId, items, finalValue, duration = 2400) {
    const reel = document.getElementById(reelId);
    reel.innerHTML = "";

    const sequence = [];
    for (let i = 0; i < 20; i++) {
        sequence.push(items[Math.floor(Math.random() * items.length)]);
    }
    sequence.push(finalValue);

    const fragment = document.createDocumentFragment();
    sequence.forEach(text => {
        const div = document.createElement("div");
        div.textContent = subjectIcons[text] ? `${subjectIcons[text]} ${text}` : text;
        fragment.appendChild(div);
    });
    reel.appendChild(fragment);

    const totalMove = (sequence.length - 1) * 80;
    let currentTick = 0;

    function playNextTick() {
        if (!isSpinning || currentTick >= sequence.length) return;
        playSound(400, 'triangle', 0.02, 0.01);
        currentTick++;
        const nextDelay = (duration / sequence.length) * (1 + Math.pow(currentTick / sequence.length, 2) * 10);
        if (currentTick < sequence.length) setTimeout(playNextTick, nextDelay);
    }
    playNextTick();

    reel.style.transition = "none";
    reel.style.transform = "translateY(0)";
    setTimeout(() => {
        reel.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0, 0.15, 1)`;
        reel.style.transform = `translateY(-${totalMove}px)`;
    }, 20);
}

function toggleAnswer() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    const container = document.getElementById('answerContainer');
    container.classList.toggle('open');
    toggleBtn.textContent = container.classList.contains('open') ? '▲ Hide Answer ▲' : '▼ Show Answer ▼';
}

function undoLastSpin() {
    stopVoiceover();
    if (spinHistory.length === 0) return;

    const undoneSpin = spinHistory.pop();

    // Restore lesson on the grid
    gridState[undoneSpin.subject][undoneSpin.week] = true;
    if (undoneSpin.subject === "Latin" && currentCycle === 2) {
        const group = latinTwinGroups.find(g => g.includes(undoneSpin.week));
        if (group) {
            group.forEach(twinWeek => {
                gridState["Latin"][twinWeek] = true;
            });
        }
    }

    // Rewind UI to previous spin if available
    if (spinHistory.length > 0) {
        const prev = spinHistory[spinHistory.length - 1];
        const subReel = document.getElementById('subjectReel');
        const weekReel = document.getElementById('weekReel');

        subReel.innerHTML = "";
        subjects.forEach(s => {
            const div = document.createElement("div");
            div.textContent = `${subjectIcons[s]} ${s}`;
            subReel.appendChild(div);
        });

        weekReel.innerHTML = "";
        weeks.forEach(w => {
            const div = document.createElement("div");
            div.textContent = "Week " + w;
            weekReel.appendChild(div);
        });

        void subReel.offsetHeight;

        prepVoiceover(prev.subject, prev.week, 'audioBtnMain');
        prepInfoBtn(prev.subject, prev.week, 'infoBtnMain');

        subReel.style.transition = "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        weekReel.style.transition = "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        subReel.style.transform = `translateY(-${prev.sIdx * 80}px)`;
        weekReel.style.transform = `translateY(-${prev.wIdx * 80}px)`;

        promptDiv.textContent = prev.prompt;
        ansDiv.innerHTML = prev.answer;
        undoBtn.disabled = false;
    } else {
        document.getElementById('subjectReel').style.transform = `translateY(0)`;
        document.getElementById('weekReel').style.transform = `translateY(0)`;
        promptDiv.textContent = "Spin to start!";
        ansDiv.textContent = "";

        const audioBtn = document.getElementById('audioBtnMain');
        if (audioBtn) audioBtn.style.display = 'none';
        const infoBtn = document.getElementById('infoBtnMain');
        if (infoBtn) infoBtn.style.display = 'none';

        undoBtn.disabled = true;
    }

    document.getElementById('answerContainer').classList.remove('open');
    spinBtn.style.background = "var(--primary)";
    spinBtn.disabled = false;
    setSpinLabel('SPIN');
    spinBtn.style.fontSize = '';

    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(40);
    updateFlagUI();
    saveToDevice();
    buildGrid();
}


/* ==========================================================================
   4. MISTAKES FLAGGING & BADGES
   ========================================================================== */
function toggleMistake() {
    const currentSpin = spinHistory.length > 0 ? spinHistory[spinHistory.length - 1] : null;
    if (!currentSpin) return;

    const idx = mistakesBank.findIndex(m => m.subject === currentSpin.subject && m.week === currentSpin.week);
    if (idx !== -1) {
        mistakesBank.splice(idx, 1);
    } else {
        mistakesBank.push({ subject: currentSpin.subject, week: currentSpin.week });
        if (userSettings.haptics && navigator.vibrate) navigator.vibrate([20, 50, 20]);
    }

    saveToDevice();
    updateFlagUI();
}

function toggleMistakeFromReview() {
    const subject = subjects[reviewSubjectIdx];
    const week = weeks[reviewWeekIdx];

    const idx = mistakesBank.findIndex(m => m.subject === subject && m.week === week);
    if (idx !== -1) {
        mistakesBank.splice(idx, 1);
    } else {
        mistakesBank.push({ subject, week });
        if (userSettings.haptics && navigator.vibrate) navigator.vibrate([20, 50, 20]);
    }

    saveToDevice();
    updateFlagUI();
}

function updateFlagUI() {
    const flagBtn = document.getElementById('flagBtn');
    if (flagBtn) {
        const currentSpin = spinHistory.length > 0 ? spinHistory[spinHistory.length - 1] : null;
        if (!currentSpin) {
            flagBtn.disabled = true;
            flagBtn.classList.remove('flagged');
        } else {
            flagBtn.disabled = false;
            const isFlagged = mistakesBank.some(m => m.subject === currentSpin.subject && m.week === currentSpin.week);
            flagBtn.classList.toggle('flagged', isFlagged);
        }
    }

    const reviewFlagBtn = document.getElementById('reviewFlagBtn');
    if (reviewFlagBtn) {
        const subject = subjects[reviewSubjectIdx];
        const week = weeks[reviewWeekIdx];
        const isFlagged = mistakesBank.some(m => m.subject === subject && m.week === week);
        reviewFlagBtn.classList.toggle('flagged', isFlagged);
    }

    updateBadgeCounts();
}

function updateBadgeCounts() {
    const count = mistakesBank.length;
    const navBadge = document.getElementById('navMistakeBadge');
    const menuBadge = document.getElementById('menuMistakeBadge');

    if (navBadge) {
        const oldText = navBadge.textContent;
        navBadge.textContent = count;
        navBadge.style.display = count > 0 ? 'flex' : 'none';

        if (count > parseInt(oldText || 0, 10)) {
            navBadge.style.transform = 'scale(1.4)';
            setTimeout(() => navBadge.style.transform = 'scale(1)', 200);
        }
    }

    if (menuBadge) {
        menuBadge.textContent = count;
        menuBadge.style.display = count > 0 ? 'flex' : 'none';
    }
}


/* ==========================================================================
   5. AUDIO, HAPTICS & TEXT-TO-SPEECH
   ========================================================================== */
function playSound(freq, type, duration, vol) {
    if (userSettings.muted) return;
    if (audioCtx.state !== 'running') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playVictoryChime() {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const notes = [
        { freq: 261.63, delay: 0,   duration: 0.1 },
        { freq: 392.00, delay: 80,  duration: 0.1 },
        { freq: 523.25, delay: 160, duration: 0.1 },
        { freq: 659.25, delay: 240, duration: 0.1 },
        { freq: 784.00, delay: 320, duration: 0.2 },

        { freq: 349.23, delay: 500, duration: 0.15 },
        { freq: 440.00, delay: 500, duration: 0.15 },
        { freq: 523.25, delay: 500, duration: 0.15 },

        { freq: 392.00, delay: 650, duration: 0.15 },
        { freq: 493.88, delay: 650, duration: 0.15 },
        { freq: 587.33, delay: 650, duration: 0.15 },

        { freq: 261.63, delay: 850, duration: 0.8 },
        { freq: 392.00, delay: 850, duration: 0.8 },
        { freq: 523.25, delay: 850, duration: 0.8 },
        { freq: 659.25, delay: 850, duration: 0.8 },
        { freq: 784.00, delay: 850, duration: 0.8 }
    ];

    notes.forEach(note => {
        setTimeout(() => playSound(note.freq, 'triangle', note.duration, 0.04), note.delay);
    });
}

let availableVoices = [];

function populateVoiceList() {
    if (!('speechSynthesis' in window)) return;

    availableVoices = window.speechSynthesis.getVoices();
    const voicePicker = document.getElementById('voicePicker');
    if (!voicePicker) return;

    voicePicker.innerHTML = '<option value="">Auto-Select</option>';

    const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
    const premiumNames = ['Samantha', 'Daniel', 'Moira', 'Karen', 'Siri', 'Alex', 'Premium', 'Enhanced', 'Google US English'];
    const seenNames = new Set();
    const uniqueVoices = [];

    englishVoices.forEach(voice => {
        const displayName = voice.name
            .replace(/ \(English \(United States\)\)/g, '')
            .replace(/ \(en-(US|GB|AU|IE)\)/g, '')
            .trim();

        if (!seenNames.has(displayName)) {
            seenNames.add(displayName);
            uniqueVoices.push({ originalName: voice.name, displayName });
        }
    });

    uniqueVoices.sort((a, b) => {
        const aIsPremium = premiumNames.some(p => a.displayName.includes(p));
        const bIsPremium = premiumNames.some(p => b.displayName.includes(p));
        if (aIsPremium && !bIsPremium) return -1;
        if (!aIsPremium && bIsPremium) return 1;
        return a.displayName.localeCompare(b.displayName);
    });

    uniqueVoices.forEach(v => {
        const option = document.createElement('option');
        option.textContent = v.displayName;
        option.value = v.originalName;
        if (v.originalName === userSettings.selectedVoice) option.selected = true;
        voicePicker.appendChild(option);
    });
}

if ('speechSynthesis' in window) {
    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
}

function changeVoice(voiceName) {
    userSettings.selectedVoice = voiceName;
    saveSettings();

    if (voiceName) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Testing new voice.");
        utterance.voice = availableVoices.find(v => v.name === voiceName);
        window.speechSynthesis.speak(utterance);
    }
}

function speakText(text) {
    if (!text || !('speechSynthesis' in window)) return;
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);

    // Wake up OS speech engine if sleeping
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    stopVoiceover();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;

    if (availableVoices.length === 0) {
        availableVoices = window.speechSynthesis.getVoices();
    }

    if (availableVoices.length > 0) {
        let bestVoice = null;
        if (userSettings.selectedVoice) {
            bestVoice = availableVoices.find(v => v.name === userSettings.selectedVoice);
        }
        if (!bestVoice) {
            bestVoice = availableVoices.find(v => v.default && v.lang.startsWith('en'));
        }
        if (!bestVoice) {
            bestVoice = availableVoices.find(v =>
                v.name.includes('Siri') ||
                v.name.includes('Premium') ||
                v.name.includes('Enhanced') ||
                v.name.includes('Google US English') ||
                v.name === 'Alex'
            );
        }
        if (!bestVoice) {
            bestVoice = availableVoices.find(v => v.lang.startsWith('en-US') || v.lang.startsWith('en'));
        }
        if (bestVoice) utterance.voice = bestVoice;
    }

    window.speechSynthesis.speak(utterance);
}


/* ==========================================================================
   6. VOICEOVER AUDIO ENGINE
   ========================================================================== */
const voiceAudio = new Audio();
let activeVoiceBtn = null;
let currentVoiceUrl = "";

voiceAudio.addEventListener('ended', () => {
    if (activeVoiceBtn) setAudioIcon(activeVoiceBtn, false);
    activeVoiceBtn = null;
});

function prepVoiceover(subject, week, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.style.display = 'none';
    btn.classList.remove('has-full');
    setAudioIcon(btnId, false);

    const cleanSubject = subject.toLowerCase().replace(/[^a-z0-9]/g, '');
    const url = `audio/c${currentCycle}/${cleanSubject}/c${currentCycle}-${cleanSubject}-w${week}.m4a`;
    const fullUrl = `audio/c${currentCycle}/${cleanSubject}/c${currentCycle}-${cleanSubject}-w${week}-full.m4a`;

    fetch(url, { method: 'HEAD' })
        .then(res => {
            if (res.ok) {
                btn.dataset.url = url;
                btn.style.display = 'flex';
                setAudioIcon(btnId, false);

                // Check for extended full song
                fetch(fullUrl, { method: 'HEAD' })
                    .then(resFull => {
                        if (resFull.ok) {
                            btn.dataset.fullUrl = fullUrl;
                            btn.classList.add('has-full');
                        }
                    })
                    .catch(() => {});
            }
        })
        .catch(() => {});
}

function playVoiceover(btnId, isFull) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const targetUrl = isFull ? btn.dataset.fullUrl : btn.dataset.url;

    if (activeVoiceBtn === btnId && !voiceAudio.paused) {
        voiceAudio.pause();
        setAudioIcon(btnId, false);
        return;
    }

    if (currentVoiceUrl !== targetUrl) {
        voiceAudio.src = targetUrl;
        currentVoiceUrl = targetUrl;
    }

    if (activeVoiceBtn && activeVoiceBtn !== btnId) {
        setAudioIcon(activeVoiceBtn, false);
    }

    voiceAudio.play().catch(err => {
        console.error("Audio play failed:", err);
        if (isFull) {
            alert("No extended song found for this week.");
            setAudioIcon(btnId, false);
            activeVoiceBtn = null;
        }
    });

    activeVoiceBtn = btnId;
    setAudioIcon(btnId, true, isFull);
}

function setAudioIcon(btnId, isPlaying, isFull = false) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.classList.remove('playing', 'playing-regular', 'playing-full');

    if (isPlaying) {
        btn.classList.add('playing', isFull ? 'playing-full' : 'playing-regular');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
}

function stopVoiceover() {
    if (!voiceAudio.paused) {
        voiceAudio.pause();
        if (activeVoiceBtn) setAudioIcon(activeVoiceBtn, false);
    }

    if ('speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.cancel();
        if (typeof audioCtx !== 'undefined') {
            if (audioCtx.state !== 'running') audioCtx.resume();
            else audioCtx.suspend().then(() => audioCtx.resume());
        }
    }
}

function setupAudioButtons() {
    const audioBtns = ['audioBtnMain', 'audioBtnReview', 'audioBtnMistake', 'audioBtnTA'];

    audioBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.removeAttribute('onclick');

        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let hasMoved = false;

        const start = (e) => {
            e.stopPropagation();
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startY = clientY;
            currentY = clientY;
            isDragging = true;
            hasMoved = false;
            btn.style.transition = 'none';
        };

        const move = (e) => {
            if (!isDragging) return;
            currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaY = currentY - startY;

            if (btn.classList.contains('has-full') && deltaY > 0) {
                e.preventDefault();
                const pullDistance = Math.min(deltaY * 0.4, 30);
                btn.style.transform = `translateY(calc(-50% + ${pullDistance}px)) scale(0.95)`;
                hasMoved = true;
            }
        };

        const end = (e) => {
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
            isDragging = false;

            btn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            btn.style.transform = 'translateY(-50%) scale(1)';

            const deltaY = currentY - startY;
            if (btn.classList.contains('has-full') && deltaY > 15 && hasMoved) {
                if (userSettings.haptics && navigator.vibrate) navigator.vibrate([20, 30, 20]);
                playVoiceover(id, true);
            } else {
                playVoiceover(id, false);
            }
        };

        const cancel = () => {
            isDragging = false;
            btn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            btn.style.transform = 'translateY(-50%) scale(1)';
        };

        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchmove', move, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', cancel);

        btn.addEventListener('mousedown', start);
        btn.addEventListener('mousemove', move);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', cancel);
    });
}


/* ==========================================================================
   7. EXTRA INFO MODAL (PANZOOM)
   ========================================================================== */
let infoPanZoom = null;

function prepInfoBtn(subject, week, btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.style.display = 'none';

    const cleanSubject = subject.toLowerCase().replace(/[^a-z0-9]/g, '');
    const jpgUrl = `extra/c${currentCycle}/${cleanSubject}/c${currentCycle}-${cleanSubject}-w${week}.jpg`;
    const pngUrl = `extra/c${currentCycle}/${cleanSubject}/c${currentCycle}-${cleanSubject}-w${week}.png`;

    fetch(jpgUrl, { method: 'HEAD' })
        .then(res => {
            if (res.ok) {
                btn.dataset.url = jpgUrl;
                btn.style.display = 'flex';
            } else {
                return fetch(pngUrl, { method: 'HEAD' }).then(resPng => {
                    if (resPng.ok) {
                        btn.dataset.url = pngUrl;
                        btn.style.display = 'flex';
                    }
                });
            }
        })
        .catch(() => {});
}

function openInfoModal(e, btnId) {
    if (e) e.stopPropagation();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);

    const btn = document.getElementById(btnId);
    if (!btn || !btn.dataset.url) return;

    const contentDiv = document.getElementById('infoModalContent');
    contentDiv.innerHTML = "";

    const img = document.createElement('img');
    img.id = 'infoImage';
    img.src = btn.dataset.url;
    img.draggable = false;
    img.style.userSelect = 'none';
    img.style.webkitUserSelect = 'none';
    img.style.webkitTouchCallout = 'none';
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.transformOrigin = '0 0';
    img.style.touchAction = 'none';

    contentDiv.appendChild(img);
    document.getElementById('infoModalOverlay').style.display = 'block';

    img.onload = () => {
        const wrapperWidth = contentDiv.clientWidth;
        const wrapperHeight = contentDiv.clientHeight;
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const wrapperRatio = wrapperWidth / wrapperHeight;

        let targetWidth, targetHeight;
        if (imgRatio > wrapperRatio) {
            targetWidth = wrapperWidth;
            targetHeight = wrapperWidth / imgRatio;
        } else {
            targetHeight = wrapperHeight;
            targetWidth = wrapperHeight * imgRatio;
        }

        img.style.width = targetWidth + 'px';
        img.style.height = targetHeight + 'px';

        if (infoPanZoom) infoPanZoom.dispose();
        infoPanZoom = panzoom(img, {
            maxZoom: 6,
            minZoom: 1,
            bounds: true,
            boundsPadding: 0.05
        });

        infoPanZoom.moveTo((wrapperWidth - targetWidth) / 2, (wrapperHeight - targetHeight) / 2);
    };
}

function closeInfoModal() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);

    if (infoPanZoom) {
        infoPanZoom.dispose();
        infoPanZoom = null;
    }

    document.getElementById('infoModalOverlay').style.display = 'none';
    document.getElementById('infoModalContent').innerHTML = "";
}


/* ==========================================================================
   8. LESSONS GRID & WEEK RANGE CONTROLS
   ========================================================================== */
function getMinWeek() {
    const el = document.getElementById("minWeekDisplay");
    return Math.max(1, Math.min(24, parseInt(el.textContent, 10) || 1));
}

function setMinWeek(n) {
    document.getElementById("minWeekDisplay").textContent = String(Math.max(1, Math.min(getMaxWeek(), Number(n) || 1)));
}

function increaseMinWeek() { setMinWeek(getMinWeek() + 1); buildGrid(); }
function decreaseMinWeek() { setMinWeek(getMinWeek() - 1); buildGrid(); }

function getMaxWeek() {
    const el = document.getElementById("maxWeekDisplay");
    return Math.max(1, Math.min(24, parseInt(el.textContent, 10) || 24));
}

function setMaxWeek(n) {
    document.getElementById("maxWeekDisplay").textContent = String(Math.max(getMinWeek(), Math.min(24, Number(n) || 1)));
}

function increaseMaxWeek() { setMaxWeek(getMaxWeek() + 1); buildGrid(); }
function decreaseMaxWeek() { setMaxWeek(getMaxWeek() - 1); buildGrid(); }

function buildGrid() {
    saveToDevice();
    const minWeek = getMinWeek();
    const maxWeek = getMaxWeek();
    const container = document.getElementById('gridContent');
    const containerWidth = container ? container.clientWidth : window.innerWidth;
    const availableForSubjects = Math.max(120, containerWidth - 48 - 12);
    const subjectWidth = Math.max(32, Math.floor(availableForSubjects / subjects.length));

    let html = `<table><colgroup><col style="width:48px">`;
    subjects.forEach(() => { html += `<col style="width:${subjectWidth}px">`; });
    html += '</colgroup><thead><tr><th class="top-header empty-header"></th>';

    subjects.forEach(s => {
        const isSubjectBlocked = blockedSubjects.includes(s);
        const subClass = isSubjectBlocked ? "subjectHeader top-header blocked-header" : "subjectHeader top-header";
        html += `<th class="${subClass}" onclick="toggleSubject('${s}')"><span>${s}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    weeks.forEach(w => {
        const isAllowed = allowedWeeks.includes(w);
        const isBlocked = blockedWeeks.includes(w);
        const numClass = isBlocked ? 'blocked' : (isAllowed ? 'active' : '');
        html += `<tr><th class="week-header" data-week="${w}"><button class="weekNumber ${numClass}" data-week="${w}">${w}</button></th>`;

        subjects.forEach(s => {
            let cls = "";
            if (isBlocked || blockedSubjects.includes(s) || !gridState[s][w] || ((w < minWeek || w > maxWeek) && !isAllowed)) {
                cls = "completed";
            } else if (isAllowed && (w < minWeek || w > maxWeek)) {
                cls = "override";
            }
            html += `<td class="${cls}" onclick="toggleCell('${s}',${w})"></td>`;
        });
        html += '</tr>';
    });

    document.getElementById('grid').innerHTML = html + '</tbody></table>';
    bindWeekHeaderHandlers();
}

function toggleCell(s, w) {
    gridState[s][w] = !gridState[s][w];
    buildGrid();
}

function toggleSubject(s) {
    const idx = blockedSubjects.indexOf(s);
    if (idx !== -1) blockedSubjects.splice(idx, 1);
    else blockedSubjects.push(s);
    saveToDevice();
    buildGrid();
}

function toggleWeek(w) {
    const anyOn = subjects.some(s => gridState[s][w]);
    subjects.forEach(s => gridState[s][w] = !anyOn);
    buildGrid();
}

function toggleAllowWeek(e, w) {
    const minWeek = getMinWeek();
    const maxWeek = getMaxWeek();
    const blockedIdx = blockedWeeks.indexOf(w);

    if (blockedIdx !== -1) {
        blockedWeeks.splice(blockedIdx, 1);
    } else {
        const allowedIdx = allowedWeeks.indexOf(w);
        if (allowedIdx !== -1) {
            allowedWeeks.splice(allowedIdx, 1);
        } else if (w < minWeek || w > maxWeek) {
            allowedWeeks.push(w);
        } else {
            blockedWeeks.push(w);
        }
    }
    saveToDevice();
    buildGrid();
}

function bindWeekHeaderHandlers() {
    document.querySelectorAll('#grid th.week-header').forEach(th => {
        th.addEventListener('click', () => toggleWeek(Number(th.getAttribute('data-week'))));
    });
    document.querySelectorAll('#grid .weekNumber').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleAllowWeek(e, Number(this.getAttribute('data-week')));
        });
    });
}

function showResetConfirm() { document.getElementById('resetConfirmOverlay').style.display = 'flex'; }
function hideResetConfirm() { document.getElementById('resetConfirmOverlay').style.display = 'none'; }
function resetGrid() { showResetConfirm(); }

function resetGridConfirmed() {
    isSpinning = false;
    hideResetConfirm();
    spinHistory = [];

    subjects.forEach(s => {
        gridState[s] = {};
        weeks.forEach(w => gridState[s][w] = true);
    });
    allowedWeeks = [];
    blockedWeeks = [];
    blockedSubjects = [];
    saveToDevice();
    buildGrid();

    spinBtn.style.background = "var(--primary)";
    spinBtn.disabled = false;
    setSpinLabel('SPIN');
    spinBtn.style.fontSize = '';

    promptDiv.textContent = "Cycle " + currentCycle;
    ansDiv.textContent = "";
    document.getElementById('answerContainer').classList.remove('open');
    toggleBtn.disabled = true;
}


/* ==========================================================================
   9. REVIEW MODE & QUICK PICKER
   ========================================================================== */
let reviewSubjectIdx = localStorage.getItem('reviewSubjectIdx') ? parseInt(localStorage.getItem('reviewSubjectIdx'), 10) : 0;
let reviewWeekIdx = localStorage.getItem('reviewWeekIdx') ? parseInt(localStorage.getItem('reviewWeekIdx'), 10) : 0;
let currentPickerType = '';

function initReviewMode() {
    updateReviewDisplay();
}

function changeReviewSubject(dir) {
    reviewSubjectIdx = (reviewSubjectIdx + dir + subjects.length) % subjects.length;
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    updateReviewDisplay();
}

function changeReviewWeek(dir) {
    reviewWeekIdx = (reviewWeekIdx + dir + weeks.length) % weeks.length;
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    updateReviewDisplay();
}

function updateReviewDisplay() {
    stopVoiceover();
    const subject = subjects[reviewSubjectIdx];
    const week = weeks[reviewWeekIdx];
    const lesson = lessonData[subject][week];

    document.getElementById('reviewSubjectLabel').innerHTML = `${subjectIcons[subject]} ${subject}`;
    document.getElementById('reviewWeekLabel').textContent = `Week ${week}`;
    document.getElementById('reviewPrompt').textContent = lesson.p;
    document.getElementById('reviewAnswerContent').innerHTML = lesson.a;

    prepVoiceover(subject, week, 'audioBtnReview');
    prepInfoBtn(subject, week, 'infoBtnReview');
    updateFlagUI();
}

function openPicker(type) {
    currentPickerType = type;
    const overlay = document.getElementById('reviewPickerOverlay');
    const title = document.getElementById('pickerTitle');
    const grid = document.getElementById('pickerGrid');
    grid.innerHTML = '';

    if (type === 'subject') {
        title.textContent = 'Select Subject';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
        subjects.forEach((s, i) => {
            const btn = document.createElement('button');
            btn.className = `picker-btn ${i === reviewSubjectIdx ? 'selected' : ''}`;
            btn.innerHTML = `<span style="display: block; font-size: 24px; margin-bottom: 4px;">${subjectIcons[s]}</span><span style="line-height: 1.2;">${s}</span>`;
            btn.onclick = () => selectPickerItem(i);
            grid.appendChild(btn);
        });
    } else if (type === 'week') {
        title.textContent = 'Select Week';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(60px, 1fr))';
        weeks.forEach((w, i) => {
            const btn = document.createElement('button');
            btn.className = `picker-btn ${i === reviewWeekIdx ? 'selected' : ''}`;
            btn.textContent = w;
            btn.onclick = () => selectPickerItem(i);
            grid.appendChild(btn);
        });
    } else if (type === 'taMinutes') {
        title.textContent = 'Select Minutes';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(60px, 1fr))';
        const scroll = document.getElementById('taMinuteScroll');
        const currentIdx = Math.round(scroll.scrollTop / 80);

        for (let i = 1; i <= 60; i++) {
            const btn = document.createElement('button');
            btn.className = `picker-btn ${i - 1 === currentIdx ? 'selected' : ''}`;
            btn.textContent = i;
            btn.onclick = () => selectPickerItem(i - 1);
            grid.appendChild(btn);
        }
    } else if (type === 'triviaCount') {
        title.textContent = 'Select Amount';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
        const scroll = document.getElementById('triviaCountScroll');
        const currentIdx = Math.round(scroll.scrollTop / 80);

        currentTriviaIncrements.forEach((val, i) => {
            const btn = document.createElement('button');
            btn.className = `picker-btn ${i === currentIdx ? 'selected' : ''}`;
            btn.textContent = val;
            btn.onclick = () => selectPickerItem(i);
            grid.appendChild(btn);
        });
    }

    overlay.style.display = 'flex';
}

function closePicker() {
    document.getElementById('reviewPickerOverlay').style.display = 'none';
}

function selectPickerItem(idx) {
    if (currentPickerType === 'subject') {
        reviewSubjectIdx = idx;
        updateReviewDisplay();
    } else if (currentPickerType === 'week') {
        reviewWeekIdx = idx;
        updateReviewDisplay();
    } else if (currentPickerType === 'taMinutes') {
        document.getElementById('taMinuteScroll').scrollTo({ top: idx * 80, behavior: 'smooth' });
    } else if (currentPickerType === 'triviaCount') {
        document.getElementById('triviaCountScroll').scrollTo({ top: idx * 80, behavior: 'smooth' });
    }

    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(20);
    closePicker();
}


/* ==========================================================================
   10. SETTINGS TOGGLES
   ========================================================================== */
function updateSettingsIcons() {
    document.getElementById('switch-sound').classList.toggle('on', !userSettings.muted);
    document.getElementById('switch-haptics').classList.toggle('on', !!userSettings.haptics);
    document.getElementById('switch-turbo').classList.toggle('on', !!userSettings.turbo);
    document.getElementById('switch-reveal').classList.toggle('on', !!userSettings.autoReveal);
    document.getElementById('switch-dark').classList.toggle('on', !!userSettings.darkMode);

    if (!navigator.vibrate) {
        const hapticsRow = document.getElementById('row-haptics');
        if (hapticsRow) hapticsRow.style.display = 'none';
    }

    document.documentElement.classList.toggle('dark-mode', !!userSettings.darkMode);
    document.body.classList.toggle('dark-mode', !!userSettings.darkMode);
}

function toggleSound() { userSettings.muted = !userSettings.muted; saveSettings(); updateSettingsIcons(); }
function toggleTurbo() { userSettings.turbo = !userSettings.turbo; saveSettings(); updateSettingsIcons(); }
function toggleAutoReveal() { userSettings.autoReveal = !userSettings.autoReveal; saveSettings(); updateSettingsIcons(); }
function toggleDarkMode() { userSettings.darkMode = !userSettings.darkMode; saveSettings(); updateSettingsIcons(); }
function toggleHaptics() {
    userSettings.haptics = !userSettings.haptics;
    saveSettings();
    updateSettingsIcons();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15);
}


/* ==========================================================================
   11. CHALLENGE: REVIEW MISTAKES
   ========================================================================== */
let mistakeQueue = [];
let currentMistake = null;

function startMistakeReview() {
    if (mistakesBank.length === 0) {
        alert("Great job! Your mistakes bank is currently empty.");
        return;
    }

    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('mistakeGameContainer').classList.add('active');

    mistakeQueue = [...mistakesBank].sort(() => Math.random() - 0.5);
    spinNextMistake();
}

function exitMistakeReview() {
    stopVoiceover();
    document.getElementById('mistakeGameContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function spinNextMistake() {
    try {
        stopVoiceover();

        if (!mistakeQueue || mistakeQueue.length === 0) {
            finishMistakeReview();
            return;
        }

        currentMistake = mistakeQueue.shift();
        if (!currentMistake || !currentMistake.subject || !currentMistake.week) {
            console.warn("Skipped corrupted mistake data:", currentMistake);
            spinNextMistake();
            return;
        }

        const remainingEl = document.getElementById('mistakesRemaining');
        if (remainingEl) remainingEl.textContent = `Remaining: ${mistakeQueue.length + 1}`;

        const labelEl = document.getElementById('mistakeSubjectLabel');
        if (labelEl) labelEl.textContent = `${subjectIcons[currentMistake.subject]} ${currentMistake.subject} - Week ${currentMistake.week}`;

        const lesson = lessonData[currentMistake.subject][currentMistake.week];
        if (!lesson) throw new Error("Lesson data not found for this week.");

        document.getElementById('mistakePrompt').textContent = lesson.p;
        document.getElementById('mistakeAnswerContent').innerHTML = lesson.a;

        document.getElementById('mistakeAnswerContainer').classList.remove('open');
        document.getElementById('toggleMistakeAnswer').textContent = '▼ Show Answer ▼';
        if (userSettings.autoReveal) toggleMistakeAnswerBtn();

        const needsWorkBtn = document.getElementById('mistakeNeedsWorkBtn');
        const correctBtn = document.getElementById('mistakeCorrectBtn');
        if (needsWorkBtn) { needsWorkBtn.disabled = false; needsWorkBtn.style.opacity = '1'; }
        if (correctBtn) { correctBtn.disabled = false; correctBtn.style.opacity = '1'; }

        prepVoiceover(currentMistake.subject, currentMistake.week, 'audioBtnMistake');
        prepInfoBtn(currentMistake.subject, currentMistake.week, 'infoBtnMistake');
    } catch (error) {
        console.error("Mistake Review Crash:", error);
        alert("Oops! A corrupted lesson got stuck in the deck. We've cleared the error, please try again.");
        mistakesBank = [];
        saveToDevice();
        updateFlagUI();
        exitMistakeReview();
    }
}

function toggleMistakeAnswerBtn() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    const container = document.getElementById('mistakeAnswerContainer');
    const btn = document.getElementById('toggleMistakeAnswer');
    container.classList.toggle('open');
    btn.textContent = container.classList.contains('open') ? '▲ Hide Answer ▲' : '▼ Show Answer ▼';
}

function processMistake(isCorrect) {
    if (isCorrect) {
        const idx = mistakesBank.findIndex(m => m.subject === currentMistake.subject && m.week === currentMistake.week);
        if (idx !== -1) mistakesBank.splice(idx, 1);
        saveToDevice();
    } else {
        mistakeQueue.push(currentMistake);
    }

    spinNextMistake();
    updateFlagUI();
}

function finishMistakeReview() {
    playVictoryChime();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60, 30, 60]);
    document.getElementById('mistakeResultsOverlay').style.display = 'flex';
    startConfetti('mistakeConfettiCanvas');
}

function closeMistakeResults() {
    stopConfetti('mistakeConfettiCanvas');
    document.getElementById('mistakeResultsOverlay').style.display = 'none';
    exitMistakeReview();
}


/* ==========================================================================
   12. CHALLENGE: TIME ATTACK
   ========================================================================== */
let taTimer = null;
let taTimeLeft = 0;
let taTotalStartingTime = 0;
let taScoreRight = 0;
let taScoreWrong = 0;
let taAvailable = [];
let taCurrent = null;
let isTAPaused = false;

function openTimeAttackMenu() {
    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('taMenuContainer').classList.add('active');

    const reel = document.getElementById('taMinuteReel');
    if (reel.innerHTML === "") {
        for (let i = 1; i <= 60; i++) {
            const div = document.createElement("div");
            div.textContent = i;
            reel.appendChild(div);
        }
        setTimeout(() => {
            document.getElementById('taMinuteScroll').scrollTo({ top: 160, behavior: 'auto' });
        }, 50);
    }
}

function exitTimeAttackMenu() {
    document.getElementById('taMenuContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function pauseTimeAttack() {
    if (taTimer && taTimeLeft > 0) {
        clearInterval(taTimer);
        taTimer = null;
        isTAPaused = true;
    }
}

function resumeTimeAttack() {
    if (isTAPaused && activeChallengePage === 'taGameContainer') {
        taTimer = setInterval(tickTATimer, 1000);
        isTAPaused = false;
    }
}

function startTimeAttack() {
    const scroll = document.getElementById('taMinuteScroll');
    const minutes = Math.round(scroll.scrollTop / 80) + 1;

    taTimeLeft = minutes * 60;
    taTotalStartingTime = taTimeLeft;
    taScoreRight = 0;
    taScoreWrong = 0;
    document.getElementById('taScoreRight').textContent = "0";
    document.getElementById('taScoreWrong').textContent = "0";
    updateTATimerUI();

    taAvailable = [];
    const minLimit = getMinWeek();
    const maxLimit = getMaxWeek();
    subjects.forEach(s => {
        if (blockedSubjects.includes(s)) return;
        weeks.forEach(w => {
            if (isWeekActive(w, minLimit, maxLimit) && gridState[s][w]) {
                taAvailable.push({ subject: s, week: w });
            }
        });
    });

    if (taAvailable.length === 0) {
        alert("Your grid is already finished! Reset the grid on the Lessons tab to play Time Attack.");
        return;
    }

    document.getElementById('taMenuContainer').classList.remove('active');
    document.getElementById('taGameContainer').classList.add('active');

    nextTAQuestion();
    taTimer = setInterval(tickTATimer, 1000);
}

function tickTATimer() {
    taTimeLeft--;
    updateTATimerUI();

    if (taTimeLeft <= 0) {
        clearInterval(taTimer);
        if (currentMode === 'challenge') endTimeAttack(false);
        else pendingTAFinish = true;
    }
}

function updateTATimerUI() {
    const m = Math.floor(taTimeLeft / 60).toString().padStart(2, '0');
    const s = (taTimeLeft % 60).toString().padStart(2, '0');
    document.getElementById('taTimerDisplay').textContent = `${m}:${s}`;
}

function nextTAQuestion() {
    stopVoiceover();
    if (taAvailable.length === 0) {
        endTimeAttack(true);
        return;
    }

    const randIdx = Math.floor(Math.random() * taAvailable.length);
    taCurrent = taAvailable[randIdx];
    const lesson = lessonData[taCurrent.subject][taCurrent.week];

    document.getElementById('taSubjectLabel').textContent = `${subjectIcons[taCurrent.subject]} ${taCurrent.subject} - Week ${taCurrent.week}`;
    document.getElementById('taPrompt').textContent = lesson.p;
    document.getElementById('taAnswerContent').innerHTML = lesson.a;

    document.getElementById('taAnswerContainer').classList.remove('open');
    document.getElementById('toggleTAAnswer').textContent = '▼ Show Answer ▼';

    prepVoiceover(taCurrent.subject, taCurrent.week, 'audioBtnTA');
    prepInfoBtn(taCurrent.subject, taCurrent.week, 'infoBtnTA');
}

function toggleTAAnswerBtn() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    const container = document.getElementById('taAnswerContainer');
    const btn = document.getElementById('toggleTAAnswer');
    container.classList.toggle('open');
    btn.textContent = container.classList.contains('open') ? '▲ Hide Answer ▲' : '▼ Show Answer ▼';
}

function processTA(isCorrect) {
    if (taTimeLeft <= 0) return;

    if (isCorrect) {
        taScoreRight++;
        document.getElementById('taScoreRight').textContent = taScoreRight;
        gridState[taCurrent.subject][taCurrent.week] = false;

        if (taCurrent.subject === "Latin" && currentCycle === 2) {
            const group = latinTwinGroups.find(g => g.includes(taCurrent.week));
            if (group) {
                group.forEach(twinWeek => {
                    gridState["Latin"][twinWeek] = false;
                    taAvailable = taAvailable.filter(item => !(item.subject === "Latin" && group.includes(item.week)));
                });
            }
        }

        saveToDevice();
        buildGrid();
    } else {
        taScoreWrong++;
        document.getElementById('taScoreWrong').textContent = taScoreWrong;

        const idx = mistakesBank.findIndex(m => m.subject === taCurrent.subject && m.week === taCurrent.week);
        if (idx === -1) {
            mistakesBank.push({ subject: taCurrent.subject, week: taCurrent.week });
            saveToDevice();
            updateFlagUI();
        }
    }

    taAvailable = taAvailable.filter(item => !(item.subject === taCurrent.subject && item.week === taCurrent.week));
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15);
    nextTAQuestion();
}

function quitTimeAttack() {
    stopVoiceover();
    clearInterval(taTimer);
    taTimer = null;
    isTAPaused = false;
    document.getElementById('taGameContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function endTimeAttack(clearedBoard = false) {
    stopVoiceover();
    clearInterval(taTimer);
    taTimer = null;
    isTAPaused = false;

    playVictoryChime();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60, 30, 60]);

    const total = taScoreRight + taScoreWrong;
    const accuracy = total > 0 ? Math.round((taScoreRight / total) * 100) : 0;
    const titleEl = document.getElementById('taResultsTitle');
    const subtitleEl = document.getElementById('taResultsSubtitle');

    if (clearedBoard) {
        const elapsed = taTotalStartingTime - taTimeLeft;
        const m = Math.floor(elapsed / 60);
        const s = (elapsed % 60).toString().padStart(2, '0');
        titleEl.textContent = "Board Cleared!";
        subtitleEl.textContent = `You finished the lesson in only ${m}:${s}!`;
        subtitleEl.style.display = 'block';

        subjects.forEach(s => {
            weeks.forEach(w => gridState[s][w] = true);
        });
        saveToDevice();
        buildGrid();

        if (spinBtn) {
            spinBtn.style.background = "var(--primary)";
            spinBtn.disabled = false;
            setSpinLabel('SPIN');
            spinBtn.style.fontSize = '';
        }
    } else {
        titleEl.textContent = "Time's Up!";
        subtitleEl.style.display = 'none';
    }

    taTimeLeft = 0;
    document.getElementById('taFinalScore').textContent = `${taScoreRight} / ${total}`;
    document.getElementById('taAccuracy').textContent = `Accuracy: ${accuracy}%`;
    document.getElementById('taResultsOverlay').style.display = 'flex';
    startConfetti('taConfettiCanvas');
}

function closeTAResults() {
    stopConfetti('taConfettiCanvas');
    document.getElementById('taResultsOverlay').style.display = 'none';
    document.getElementById('taGameContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}


/* ==========================================================================
   13. CHALLENGE: MAP GAME
   ========================================================================== */
const mapDatabase = {
    1: [
        { id: 'c1_africa', name: 'Africa', svg: null, comingSoon: true },
        { id: 'c1_world', name: 'World', svg: null, comingSoon: true }
    ],
    2: [
        { id: 'c2_europe', name: 'Europe', svg: europeMap, comingSoon: false },
        { id: 'c2_world', name: 'World', svg: null, comingSoon: true }
    ],
    3: [
        { id: 'c3_us', name: 'United States', svg: null, comingSoon: true },
        { id: 'c3_canada', name: 'Canada', svg: null, comingSoon: true }
    ]
};

let mapTargets = [];
let availableMapTargets = [];
let currentMapTarget = null;
let mapScoreRight = 0;
let mapAttempts = 0;
let mapPanZoom = null;
let isMapProcessing = false;
let mapPromptTimeout = null;
let touchStartX = 0;
let touchStartY = 0;
let isMapTouchTracked = false;
let lastMapClickTime = 0;

function formatMapTargetName(rawId) {
    let name = String(rawId).trim().replace(/^w\d+[_\-\s]*/i, '');
    return name.split(/[_\-\s]+/)
        .filter(word => word.length > 0)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function openMapMenu() {
    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('mapMenuContainer').classList.add('active');
    activeChallengePage = 'mapMenuContainer';

    document.getElementById('mapMenuCycleDisplay').textContent = currentCycle;
    const list = document.getElementById('mapSelectionList');
    list.innerHTML = '';

    const availableMaps = mapDatabase[currentCycle] || [];
    if (availableMaps.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted); font-weight: bold;">Maps for Cycle ${currentCycle} coming soon!</p>`;
        return;
    }

    availableMaps.forEach(mapObj => {
        const btn = document.createElement('button');
        btn.className = 'setting-item';

        if (mapObj.comingSoon) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'default';
            btn.style.pointerEvents = 'none';
            btn.innerHTML = `
                <div class="setting-text" style="text-align: left;">
                    <h4>${mapObj.name}</h4>
                    <p style="color: var(--primary); font-weight: 800;">Coming Soon</p>
                </div>
                <div style="font-size: 22px; opacity: 0.5;">🔒</div>
            `;
        } else {
            btn.onclick = () => startMapGame(mapObj.svg);
            btn.innerHTML = `
                <div class="setting-text" style="text-align: left;">
                    <h4>${mapObj.name}</h4>
                    <p>Tap to practice</p>
                </div>
                <div style="font-size: 24px; color: var(--primary);">➔</div>
            `;
        }
        list.appendChild(btn);
    });
}

function exitMapMenu() {
    document.getElementById('mapMenuContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function startMapGame(selectedMapSvg) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    document.getElementById('mapMenuContainer').classList.remove('active');
    document.getElementById('mapGameContainer').classList.add('active');
    activeChallengePage = 'mapGameContainer';

    mapScoreRight = 0;
    mapAttempts = 0;
    isMapProcessing = false;
    clearTimeout(mapPromptTimeout);
    document.getElementById('mapScoreDisplay').textContent = `Score: 0 / 0`;

    const reminder = document.getElementById('twoFingerReminder');
    if (reminder) {
        reminder.innerHTML = `<span style="margin-right: 10px; font-size: 24px;">🗺️</span> Drag to pan, pinch to zoom`;
        reminder.style.display = 'flex';
        reminder.style.opacity = '1';
    }

    if (mapPanZoom) {
        mapPanZoom.dispose();
        mapPanZoom = null;
    }

    const wrapper = document.getElementById('svgMapWrapper');
    wrapper.innerHTML = selectedMapSvg;

    wrapper.addEventListener('touchstart', hideMapReminder, { once: true });
    wrapper.addEventListener('mousedown', hideMapReminder, { once: true });

    if (!isMapTouchTracked) {
        wrapper.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });
        wrapper.addEventListener('mousedown', (e) => {
            touchStartX = e.clientX;
            touchStartY = e.clientY;
        }, { passive: true });
        isMapTouchTracked = true;
    }

    const svg = document.querySelector('#svgMapWrapper svg');
    if (svg) {
        let initialZoom = 1;
        const viewBox = svg.getAttribute('viewBox');

        if (viewBox) {
            const vbParts = viewBox.match(/[\d\.]+/g);
            if (vbParts && vbParts.length >= 4) {
                const vbWidth = parseFloat(vbParts[2]);
                const vbHeight = parseFloat(vbParts[3]);

                svg.removeAttribute('width');
                svg.removeAttribute('height');

                const targetWidth = wrapper.clientWidth;
                const targetHeight = targetWidth * (vbHeight / vbWidth);
                svg.style.width = targetWidth + 'px';
                svg.style.height = targetHeight + 'px';

                if (targetHeight < wrapper.clientHeight) {
                    initialZoom = wrapper.clientHeight / targetHeight;
                }
            }
        }

        mapPanZoom = panzoom(svg, {
            maxZoom: 6,
            minZoom: initialZoom,
            bounds: true,
            boundsPadding: 0.05
        });

        mapPanZoom.zoomAbs(wrapper.clientWidth / 2, wrapper.clientHeight / 2, initialZoom);
        mapPanZoom.moveTo(0, 0);
    }

    initMapHitboxes();
    availableMapTargets = [...mapTargets];
    nextMapQuestion();
}

function hideMapReminder() {
    const reminder = document.getElementById('twoFingerReminder');
    if (reminder) {
        reminder.style.opacity = '0';
        setTimeout(() => reminder.style.display = 'none', 300);
    }
}

function exitMapGame() {
    clearTimeout(mapPromptTimeout);
    isMapProcessing = false;
    document.getElementById('mapGameContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function initMapHitboxes() {
    mapTargets = [];
    const svg = document.querySelector('#svgMapWrapper svg');
    if (!svg) return;

    const currentMinWeek = getMinWeek();
    const currentMaxWeek = getMaxWeek();
    const interactables = svg.querySelectorAll('[id]');

    interactables.forEach(el => {
        const rawId = el.getAttribute('id');
        if (!rawId || rawId.startsWith('Vector') || rawId.startsWith('Group') || rawId.startsWith('mask')) return;

        const weekMatch = rawId.match(/^w(\d+)[_\-\s]+(.+)/i);
        if (!weekMatch) return;

        el.style.opacity = '0';
        const weekNum = parseInt(weekMatch[1], 10);

        if (weekNum < currentMinWeek || weekNum > currentMaxWeek) {
            el.style.pointerEvents = 'none';
            return;
        }

        mapTargets.push(rawId);
        el.classList.add('map-target');

        const handleTap = (e) => {
            let endX, endY;
            if (e.type === 'touchend' && e.changedTouches.length > 0) {
                endX = e.changedTouches[0].clientX;
                endY = e.changedTouches[0].clientY;
            } else if (e.type === 'mouseup') {
                endX = e.clientX;
                endY = e.clientY;
            }

            if (endX !== undefined && endY !== undefined) {
                if (Math.hypot(endX - touchStartX, endY - touchStartY) > 10) return;
            }
            if (isMapProcessing) return;

            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
            handleMapClick(rawId, el);
        };

        el.addEventListener('mouseup', handleTap);
        el.addEventListener('touchend', handleTap, { passive: false });
    });
}

function nextMapQuestion() {
    if (availableMapTargets.length === 0) {
        finishMapGame();
        return;
    }

    const randIdx = Math.floor(Math.random() * availableMapTargets.length);
    currentMapTarget = availableMapTargets[randIdx];
    availableMapTargets.splice(randIdx, 1);

    const overlays = ['peninsula', 'mountains', 'river', 'alps'];
    const activeOverlay = overlays.find(o => currentMapTarget.includes(o)) || 'base';

    mapTargets.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const isShapeOverlay = overlays.find(o => id.includes(o));
        el.style.pointerEvents = (isShapeOverlay && isShapeOverlay !== activeOverlay) ? 'none' : 'all';
    });

    document.getElementById('mapPrompt').textContent = `Find: ${formatMapTargetName(currentMapTarget)}`;
}

function handleMapClick(clickedId, element) {
    const now = Date.now();
    if (now - lastMapClickTime < 500 || isMapProcessing) return;
    lastMapClickTime = now;

    mapAttempts++;

    if (clickedId === currentMapTarget) {
        isMapProcessing = true;
        clearTimeout(mapPromptTimeout);

        if (userSettings.haptics && navigator.vibrate) navigator.vibrate([30, 50, 30]);
        playSound(988, 'triangle', 0.1, 0.03);
        setTimeout(() => playSound(1319, 'triangle', 0.2, 0.03), 100);

        mapScoreRight++;
        document.getElementById('mapScoreDisplay').textContent = `Score: ${mapScoreRight} / ${mapAttempts}`;
        document.getElementById('mapPrompt').textContent = "Correct!";

        element.style.transition = 'none';
        element.style.opacity = '0.8';
        element.classList.add('flash-correct');

        setTimeout(() => {
            element.style.transition = 'opacity 1s ease-out';
            element.style.opacity = '0';
            setTimeout(() => element.classList.remove('flash-correct'), 1000);
        }, 50);

        mapPromptTimeout = setTimeout(() => {
            isMapProcessing = false;
            nextMapQuestion();
        }, 1000);
    } else {
        clearTimeout(mapPromptTimeout);
        if (userSettings.haptics && navigator.vibrate) navigator.vibrate(50);
        playSound(200, 'triangle', 0.1, 0.05);

        document.getElementById('mapScoreDisplay').textContent = `Score: ${mapScoreRight} / ${mapAttempts}`;
        document.getElementById('mapPrompt').textContent = `Oops! That's ${formatMapTargetName(clickedId)}. Try again!`;

        mapPromptTimeout = setTimeout(() => {
            document.getElementById('mapPrompt').textContent = `Find: ${formatMapTargetName(currentMapTarget)}`;
        }, 2000);
    }
}

function finishMapGame() {
    playVictoryChime();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60, 30, 60]);

    const accuracy = mapAttempts > 0 ? Math.round((mapScoreRight / mapAttempts) * 100) : 0;
    document.getElementById('mapFinalScore').textContent = `${mapScoreRight} / ${mapAttempts}`;
    document.getElementById('mapAccuracy').textContent = `Accuracy: ${accuracy}%`;
    document.getElementById('mapResultsOverlay').style.display = 'flex';
    startConfetti('mapConfettiCanvas');
}

function closeMapResults() {
    stopConfetti('mapConfettiCanvas');
    document.getElementById('mapResultsOverlay').style.display = 'none';
    exitMapGame();
}


/* ==========================================================================
   14. CHALLENGE: TRIVIA QUIZ
   ========================================================================== */
let fullTriviaDeck = [];
let triviaQueue = [];
let currentTrivia = null;
let triviaScoreRight = 0;
let triviaScoreWrong = 0;
let isTriviaProcessing = false;
let currentTriviaIncrements = [];

function openTriviaMenu() {
    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('triviaMenuContainer').classList.add('active');
    activeChallengePage = 'triviaMenuContainer';

    fullTriviaDeck = [];
    const minLimit = getMinWeek();
    const maxLimit = getMaxWeek();

    if (typeof customTriviaBank !== 'undefined') {
        customTriviaBank.forEach(trivia => {
            if (trivia.cycle === currentCycle) {
                const s = trivia.subject;
                const w = trivia.week;
                if (!blockedSubjects.includes(s) &&
                    isWeekActive(w, minLimit, maxLimit) &&
                    gridState[s] && gridState[s][w]) {
                    fullTriviaDeck.push(trivia);
                }
            }
        });
    }

    const reel = document.getElementById('triviaCountReel');
    reel.innerHTML = "";

    if (fullTriviaDeck.length === 0) {
        const div = document.createElement("div");
        div.textContent = "0 Available";
        reel.appendChild(div);
        return;
    }

    const maxQ = fullTriviaDeck.length;
    currentTriviaIncrements = [];
    for (let i = 5; i < maxQ; i += 5) currentTriviaIncrements.push(i);
    currentTriviaIncrements.push(`All (${maxQ})`);

    currentTriviaIncrements.forEach(val => {
        const div = document.createElement("div");
        div.textContent = val;
        div.dataset.val = (typeof val === 'number') ? val : maxQ;
        reel.appendChild(div);
    });

    setTimeout(() => {
        document.getElementById('triviaCountScroll').scrollTo({ top: 0, behavior: 'auto' });
    }, 50);
}

function exitTriviaMenu() {
    document.getElementById('triviaMenuContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function startTriviaGame() {
    if (fullTriviaDeck.length === 0) {
        alert("No trivia questions available! Either the grid is finished, or we need to add more questions.");
        exitTriviaMenu();
        return;
    }

    const scroll = document.getElementById('triviaCountScroll');
    const selectedIndex = Math.round(scroll.scrollTop / 80);
    const reelDivs = document.getElementById('triviaCountReel').children;
    const amount = reelDivs[selectedIndex] ? parseInt(reelDivs[selectedIndex].dataset.val, 10) : fullTriviaDeck.length;

    document.getElementById('triviaMenuContainer').classList.remove('active');
    document.getElementById('triviaGameContainer').classList.add('active');
    activeChallengePage = 'triviaGameContainer';

    triviaScoreRight = 0;
    triviaScoreWrong = 0;
    document.getElementById('triviaScoreDisplay').textContent = `Score: 0`;

    fullTriviaDeck.sort(() => Math.random() - 0.5);
    triviaQueue = fullTriviaDeck.slice(0, amount);
    nextTriviaQuestion();
}

function exitTriviaGame() {
    stopVoiceover();
    document.getElementById('triviaGameContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function nextTriviaQuestion() {
    isTriviaProcessing = false;
    stopVoiceover();

    if (triviaQueue.length === 0) {
        finishTriviaGame();
        return;
    }

    currentTrivia = triviaQueue.shift();
    document.getElementById('triviaSubjectLabel').textContent = `${subjectIcons[currentTrivia.subject]} ${currentTrivia.subject}`;
    document.getElementById('triviaPrompt').textContent = currentTrivia.q;

    const allOptions = currentTrivia.options
        .map((text, idx) => ({ text, isCorrect: currentTrivia.answerIndex === idx }))
        .sort(() => Math.random() - 0.5);

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`triviaBtn${i}`);
        if (i < allOptions.length) {
            btn.innerHTML = allOptions[i].text;
            btn.className = 'trivia-option-btn';
            btn.dataset.correct = allOptions[i].isCorrect;
            btn.style.display = 'flex';
            btn.onclick = () => processTriviaAnswer(i, allOptions[i].isCorrect, btn);
        } else {
            btn.style.display = 'none';
        }
    }
}

function processTriviaAnswer(index, isCorrect, btnElement) {
    if (isTriviaProcessing) return;
    isTriviaProcessing = true;

    let delayTime = 1000;
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15);

    if (isCorrect) {
        btnElement.classList.add('correct');
        playSound(988, 'triangle', 0.1, 0.03);
        setTimeout(() => playSound(1319, 'triangle', 0.2, 0.03), 100);
        triviaScoreRight++;

        if (gridState[currentTrivia.subject]) {
            gridState[currentTrivia.subject][currentTrivia.week] = false;
        }
        saveToDevice();
        buildGrid();
    } else {
        btnElement.classList.add('wrong');
        playSound(200, 'triangle', 0.1, 0.05);
        triviaScoreWrong++;

        const idx = mistakesBank.findIndex(m => m.subject === currentTrivia.subject && m.week === currentTrivia.week);
        if (idx === -1) {
            mistakesBank.push({ subject: currentTrivia.subject, week: currentTrivia.week });
            saveToDevice();
            updateFlagUI();
        }

        for (let i = 0; i < 4; i++) {
            const checkBtn = document.getElementById(`triviaBtn${i}`);
            if (checkBtn.dataset.correct === 'true') checkBtn.classList.add('correct-reveal');
        }
        delayTime = 3000;
    }

    document.getElementById('triviaScoreDisplay').textContent = `Score: ${triviaScoreRight}`;
    setTimeout(nextTriviaQuestion, delayTime);
}

function finishTriviaGame() {
    playVictoryChime();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60, 30, 60]);

    const total = triviaScoreRight + triviaScoreWrong;
    const accuracy = total > 0 ? Math.round((triviaScoreRight / total) * 100) : 0;

    document.getElementById('triviaFinalScore').textContent = `${triviaScoreRight} / ${total}`;
    document.getElementById('triviaAccuracy').textContent = `Accuracy: ${accuracy}%`;
    document.getElementById('triviaResultsOverlay').style.display = 'flex';
    startConfetti('triviaConfettiCanvas');
}

function closeTriviaResults() {
    stopConfetti('triviaConfettiCanvas');
    document.getElementById('triviaResultsOverlay').style.display = 'none';
    exitTriviaGame();
}


/* ==========================================================================
   15. CHALLENGE: CC SPINNER RADIO
   ========================================================================== */
const radioAudio = new Audio();
let radioPlaylist = [];
let radioOriginalList = [];
let currentRadioIndex = 0;
let isRadioPlaying = false;
let radioRepeatMode = 0; // 0: Off, 1: All, 2: One
let radioShuffleOn = false;
let radioAutoSkipCount = 0;

radioAudio.addEventListener('timeupdate', updateRadioProgress);
radioAudio.addEventListener('ended', handleRadioEnded);
radioAudio.addEventListener('error', () => {
    radioAutoSkipCount++;
    if (radioAutoSkipCount >= radioPlaylist.length) {
        pauseRadio();
        document.getElementById('radioTrackTitle').textContent = "No audio found!";
    } else {
        nextRadioTrack(true);
    }
});

function openRadio() {
    stopVoiceover();
    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('radioContainer').classList.add('active');
    activeChallengePage = 'radioContainer';
    buildRadioPlaylist();
}

function closeRadio() {
    pauseRadio();
    document.getElementById('radioContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function buildRadioPlaylist() {
    radioPlaylist = [];
    const currentMinWeek = getMinWeek();
    const currentMaxWeek = getMaxWeek();

    subjects.forEach(subject => {
        const cleanSub = subject.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let w = currentMinWeek; w <= currentMaxWeek; w++) {
            radioPlaylist.push({
                subject,
                week: w,
                url: `audio/c${currentCycle}/${cleanSub}/c${currentCycle}-${cleanSub}-w${w}.m4a`
            });
        }
    });

    radioOriginalList = [...radioPlaylist];
    currentRadioIndex = 0;
    radioAutoSkipCount = 0;

    if (radioShuffleOn) shuffleRadioList();
    loadRadioTrack(currentRadioIndex);
}

function loadRadioTrack(index) {
    if (radioPlaylist.length === 0) return;

    const track = radioPlaylist[index];
    radioAudio.src = track.url;
    radioAudio.load();

    document.getElementById('radioTrackTitle').textContent = `${track.subject} - Week ${track.week}`;
    document.getElementById('radioTrackSub').textContent = `Cycle ${currentCycle}`;
    document.getElementById('radioSeeker').value = 0;
    document.getElementById('radioTimeCurrent').textContent = "0:00";
    document.getElementById('radioTimeTotal').textContent = "-:--";
}

function toggleRadioPlay() {
    if (isRadioPlaying) pauseRadio();
    else playRadio();
}

function playRadio() {
    if (radioPlaylist.length === 0) return;
    if (audioCtx.state !== 'running') audioCtx.resume();

    radioAudio.play().then(() => {
        isRadioPlaying = true;
        radioAutoSkipCount = 0;
        document.getElementById('radioPlayIcon').setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
        document.getElementById('radioArt').classList.add('radio-playing-art');
    }).catch(() => {});
}

function pauseRadio() {
    radioAudio.pause();
    isRadioPlaying = false;
    const playIcon = document.getElementById('radioPlayIcon');
    if (playIcon) playIcon.setAttribute('d', 'M8 5v14l11-7z');
    const radioArt = document.getElementById('radioArt');
    if (radioArt) radioArt.classList.remove('radio-playing-art');
}

function handleRadioEnded() {
    if (radioRepeatMode === 2) {
        radioAudio.currentTime = 0;
        playRadio();
    } else {
        nextRadioTrack(true);
    }
}

function nextRadioTrack(autoSkip = false) {
    currentRadioIndex++;
    if (currentRadioIndex >= radioPlaylist.length) {
        currentRadioIndex = 0;
        if (radioRepeatMode !== 1 && !autoSkip) {
            loadRadioTrack(currentRadioIndex);
            pauseRadio();
            return;
        }
    }
    loadRadioTrack(currentRadioIndex);
    if (isRadioPlaying || autoSkip) playRadio();
}

function prevRadioTrack() {
    if (radioAudio.currentTime > 3) {
        radioAudio.currentTime = 0;
        return;
    }
    currentRadioIndex = (currentRadioIndex - 1 + radioPlaylist.length) % radioPlaylist.length;
    loadRadioTrack(currentRadioIndex);
    if (isRadioPlaying) playRadio();
}

function toggleRadioShuffle() {
    radioShuffleOn = !radioShuffleOn;
    const btn = document.getElementById('radioShuffleBtn');

    if (radioShuffleOn) {
        btn.classList.add('active');
        shuffleRadioList();
    } else {
        btn.classList.remove('active');
        const currentTrack = radioPlaylist[currentRadioIndex];
        radioPlaylist = [...radioOriginalList];
        currentRadioIndex = radioPlaylist.findIndex(t => t.url === currentTrack.url);
    }
}

function shuffleRadioList() {
    const currentTrack = radioPlaylist[currentRadioIndex];
    for (let i = radioPlaylist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [radioPlaylist[i], radioPlaylist[j]] = [radioPlaylist[j], radioPlaylist[i]];
    }
    if (currentTrack) {
        const newIndex = radioPlaylist.findIndex(t => t.url === currentTrack.url);
        [radioPlaylist[0], radioPlaylist[newIndex]] = [radioPlaylist[newIndex], radioPlaylist[0]];
        currentRadioIndex = 0;
    }
}

function toggleRadioRepeat() {
    radioRepeatMode = (radioRepeatMode + 1) % 3;
    const btn = document.getElementById('radioRepeatBtn');

    if (radioRepeatMode === 0) {
        btn.classList.remove('active');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"></path></svg>`;
    } else if (radioRepeatMode === 1) {
        btn.classList.add('active');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"></path></svg>`;
    } else {
        btn.classList.add('active');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2.5V15h3v-4H9.5v1.5h1.5v3H13z"></path></svg>`;
    }
}

function updateRadioProgress() {
    if (isNaN(radioAudio.duration)) return;
    const seeker = document.getElementById('radioSeeker');
    seeker.max = radioAudio.duration;
    seeker.value = radioAudio.currentTime;
    document.getElementById('radioTimeCurrent').textContent = formatTime(radioAudio.currentTime);
    document.getElementById('radioTimeTotal').textContent = formatTime(radioAudio.duration);
}

const radioSeeker = document.getElementById('radioSeeker');
if (radioSeeker) {
    radioSeeker.addEventListener('input', (e) => {
        radioAudio.currentTime = e.target.value;
    });
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}


/* ==========================================================================
   16. CELEBRATION & CONFETTI ENGINE
   ========================================================================== */
let confettiAnimationId = null;
let confettiResizeHandler = null;
let isConfettiStopping = false;

function finishLesson() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60, 30, 60]);
    playVictoryChime();
    showDoneOverlay();
}

function showDoneOverlay() {
    const overlay = document.getElementById('doneOverlay');
    if (!overlay) return;

    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.pointerEvents = 'auto';
    const box = overlay.querySelector('.doneBox');
    if (box) box.style.display = 'block';

    overlay.style.display = 'flex';
    startConfetti();
}

function hideDoneOverlay() {
    isConfettiStopping = true;
    const overlay = document.getElementById('doneOverlay');
    const box = overlay.querySelector('.doneBox');

    if (box) box.style.display = 'none';
    overlay.style.background = 'transparent';
    overlay.style.pointerEvents = 'none';
}

function startConfetti(canvasId = 'confettiCanvas') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    isConfettiStopping = false;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }
    resize();
    confettiResizeHandler = resize;
    window.addEventListener('resize', confettiResizeHandler);

    const styles = ['confetti', 'fireworks', 'emojis'];
    const activeStyle = styles[Math.floor(Math.random() * styles.length)];
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#6366f1', '#ec4899'];
    const emojiList = ['📜', '📖', '🌍', '⚔️', '🏛️', '🔢', '🧪', '⏳'];
    const parts = [];

    if (activeStyle === 'confetti' || activeStyle === 'emojis') {
        for (let i = 0; i < 100; i++) {
            parts.push({
                x: Math.random() * canvas.width,
                y: Math.random() * -canvas.height,
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 3 + 2,
                r: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                emoji: emojiList[Math.floor(Math.random() * emojiList.length)],
                size: Math.random() * 20 + 20,
                rot: Math.random() * 360,
                vr: (Math.random() - 0.5) * 10
            });
        }
    }

    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (activeStyle === 'confetti') {
            for (const p of parts) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.02;
                p.rot += p.vr;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
                ctx.restore();

                if (p.y > canvas.height + 20 && !isConfettiStopping) {
                    p.y = -10;
                    p.x = Math.random() * canvas.width;
                    p.vy = Math.random() * 3 + 2;
                }
            }
            if (isConfettiStopping && parts.every(p => p.y > canvas.height + 20)) {
                stopConfetti(canvasId);
                return;
            }
        } else if (activeStyle === 'emojis') {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (const p of parts) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.02;
                p.rot += p.vr;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot * Math.PI / 180);
                ctx.font = `${p.size}px Arial`;
                ctx.fillText(p.emoji, 0, 0);
                ctx.restore();

                if (p.y > canvas.height + 40 && !isConfettiStopping) {
                    p.y = -40;
                    p.x = Math.random() * canvas.width;
                    p.vy = Math.random() * 3 + 2;
                }
            }
            if (isConfettiStopping && parts.every(p => p.y > canvas.height + 40)) {
                stopConfetti(canvasId);
                return;
            }
        } else if (activeStyle === 'fireworks') {
            ctx.globalCompositeOperation = 'lighter';

            if (Math.random() < 0.06 && !isConfettiStopping) {
                const bx = Math.random() * canvas.width;
                const by = Math.random() * (canvas.height * 0.5);
                const fColor = colors[Math.floor(Math.random() * colors.length)];
                for (let i = 0; i < 40; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 5 + 2;
                    parts.push({
                        x: bx, y: by,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        color: fColor,
                        alpha: 1,
                        decay: Math.random() * 0.015 + 0.015,
                        r: Math.random() * 3 + 1
                    });
                }
            }

            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.05;
                p.vx *= 0.94;
                p.alpha -= p.decay;

                if (p.alpha <= 0) {
                    parts.splice(i, 1);
                    continue;
                }

                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            if (isConfettiStopping && parts.length === 0) {
                stopConfetti(canvasId);
                return;
            }
        }

        confettiAnimationId = requestAnimationFrame(frame);
    }
    confettiAnimationId = requestAnimationFrame(frame);
}

function stopConfetti(canvasId = 'confettiCanvas') {
    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;

    if (confettiResizeHandler) {
        window.removeEventListener('resize', confettiResizeHandler);
        confettiResizeHandler = null;
    }

    const canvas = document.getElementById(canvasId);
    if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    if (canvasId === 'confettiCanvas') {
        const overlay = document.getElementById('doneOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.background = 'rgba(0,0,0,0.45)';
            overlay.style.pointerEvents = 'auto';
            const box = overlay.querySelector('.doneBox');
            if (box) box.style.display = 'block';
        }
    }
}


/* ==========================================================================
   17. SPLASH SCREEN & DAILY STREAK
   ========================================================================== */
function dismissSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15);

    playSound(523.25, 'triangle', 0.1, 0.03);
    setTimeout(() => playSound(659.25, 'triangle', 0.15, 0.03), 100);

    splash.style.opacity = '0';
    setTimeout(() => {
        splash.style.display = 'none';
        if (!localStorage.getItem('hasSeenStudioTutorial')) showTutorial();
    }, 400);
}

function updateDailyStreak() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const lastVisit = localStorage.getItem('ccLastVisitDate');
    let streak = parseInt(localStorage.getItem('ccCurrentStreak') || '0', 10);

    if (lastVisit === todayStr) {
        if (streak < 1) streak = 1;
    } else if (lastVisit === yesterdayStr) {
        streak += 1;
    } else {
        streak = 1;
    }

    localStorage.setItem('ccLastVisitDate', todayStr);
    localStorage.setItem('ccCurrentStreak', String(streak));

    const streakText = document.getElementById('splashStreakText');
    if (streakText) streakText.textContent = String(streak);
}


/* ==========================================================================
   18. INTERACTIVE WALKTHROUGH
   ========================================================================== */
const walkSteps = [
    { target: null, mode: 'spinner', title: "Welcome!", desc: "Let's take a quick interactive tour to show you how CC Spinner works." },
    { target: 'spinBtn', mode: 'spinner', title: "The Spinner", desc: "Tap the SPIN button below to randomly select memory work.", interactive: true },
    { target: 'flagBtn', mode: 'spinner', title: "Flag for Review", desc: "Tap the Flag button here (or in the Review tab) to add a lesson to your Mistake Bank. You can practice them later in the Focus games!" },
    { target: 'answerContainer', mode: 'spinner', title: "Songs & Extras", desc: "When a lesson has an accompanying song or map, an Audio or Info (i) button will appear right here." },
    { target: 'undoBtn', mode: 'spinner', title: "Undo Spin", desc: "Made a mistake or got interrupted? The Undo button reverses your last spin." },

    { target: 'nav-review', mode: 'spinner', title: "The Review Tab", desc: "Now, tap the Review tab at the bottom to browse your memory work sequentially.", interactive: true },
    { target: 'reviewSubjectLabel', mode: 'review', title: "Change Subject", desc: "Tap the Subject name here to open the quick-selector menu.", interactive: true },
    { target: 'pickerGrid', mode: 'review', title: "Quick Select", desc: "Tap any subject in this grid to jump straight to it.", interactive: true, tooltipPos: '15%', keepPickerOpen: true },
    { target: 'reviewWeekLabel', mode: 'review', title: "Change Week", desc: "You can also tap the Week number to jump to a specific week, or use the arrows to go one-by-one." },

    { target: 'nav-grid', mode: 'review', title: "The Lessons Tab", desc: "Next, tap the Lessons tab. This controls the entire app.", interactive: true },
    { target: 'gridContent', mode: 'grid', title: "The Master Grid", desc: "This tracks your progress. White, green (or black in dark mode) squares are active. Grey squares are blocked or finished.", tooltipPos: '80%' },
    { target: 'grid', mode: 'grid', title: "Block a Subject", desc: "Tap a Subject name at the very top to instantly block or allow that entire column.", tooltipPos: '80%' },
    { target: 'grid', mode: 'grid', title: "Block a Week", desc: "Tap a Week number on the left side to instantly block or allow that entire row.", tooltipPos: '80%' },
    { target: 'gridControlsRow', mode: 'grid', title: "Set Your Pace", desc: "Change your Cycle here, and adjust your Min and Max Weeks to match where you are in the school year." },
    { target: 'resetGridBtnTour', mode: 'grid', title: "Start Fresh", desc: "Once you clear the board for the week, you can start over. Tap 'Reset Grid' to see what happens!", interactive: true },
    { target: 'confirmResetBtnTour', mode: 'grid', title: "Confirm Reset", desc: "Tap 'Yes, Reset' to clear the board. Don't worry, we won't lose your custom settings or Mistake Bank!", interactive: true },

    { target: 'nav-challenge', mode: 'grid', title: "The Focus Tab", desc: "Ready for a challenge? Tap the Focus tab to explore the games.", interactive: true },
    { target: 'challengeContainer', mode: 'challenge', title: "Challenge Modes", desc: "Here you can review flagged mistakes, race the clock in Time Attack, sing Scripture songs, or take a Trivia Quiz.", tooltipPos: '85%' },

    { target: null, mode: 'spinner', title: "You're All Set!", desc: "You can replay this tutorial anytime from the Settings tab. Have fun mastering your memory work!" }
];

let currentWalkStep = 0;
let walkPulseTimeout = null;

function showTutorial() {
    currentWalkStep = 0;
    document.getElementById('walkthroughTooltip').style.display = 'block';
    document.getElementById('walkthroughMask').style.display = 'block';
    renderWalkStep();
}

function renderWalkStep() {
    const step = walkSteps[currentWalkStep];
    const maskEl = document.getElementById('walkthroughMask');

    clearTimeout(walkPulseTimeout);
    if (maskEl) maskEl.classList.remove('walkthrough-active-pulse');

    const counterEl = document.getElementById('walkCounter');
    if (counterEl) counterEl.textContent = `${currentWalkStep + 1}/${walkSteps.length}`;

    document.getElementById('walkTitle').textContent = step.title;
    document.getElementById('walkDesc').textContent = step.desc;

    const nextBtn = document.getElementById('walkNextBtn');
    if (step.interactive) {
        nextBtn.textContent = "Tap highlighted area";
        nextBtn.style.background = "#94a3b8";
        nextBtn.style.boxShadow = "none";
        nextBtn.style.pointerEvents = "none";
    } else {
        nextBtn.textContent = (currentWalkStep === walkSteps.length - 1) ? "Get Started!" : "Next";
        nextBtn.style.background = (currentWalkStep === walkSteps.length - 1) ? "#22c55e" : "var(--primary)";
        nextBtn.style.boxShadow = "0 4px 15px rgba(255,111,97,0.3)";
        nextBtn.style.pointerEvents = "auto";
    }

    if (!step.keepPickerOpen) closePicker();
    if (currentMode !== step.mode) switchMode(step.mode);

    if (window.currentWalkListener && window.currentWalkTarget) {
        window.currentWalkTarget.removeEventListener('click', window.currentWalkListener);
        window.currentWalkTarget = null;
        window.currentWalkListener = null;
    }

    document.getElementById('walkthroughTooltip').style.display = 'block';
    if (maskEl) maskEl.style.display = 'block';

    setTimeout(() => {
        const tooltip = document.getElementById('walkthroughTooltip');

        if (step.target) {
            const el = document.getElementById(step.target);
            if (el) {
                const rect = el.getBoundingClientRect();
                maskEl.style.top = (rect.top - 8) + 'px';
                maskEl.style.left = (rect.left - 8) + 'px';
                maskEl.style.width = (rect.width + 16) + 'px';
                maskEl.style.height = (rect.height + 16) + 'px';

                if (step.tooltipPos) {
                    tooltip.style.top = step.tooltipPos;
                    tooltip.style.transform = 'translate(-50%, -50%)';
                } else if (!step.interactive) {
                    if (rect.top > window.innerHeight / 2) {
                        tooltip.style.top = Math.max(20, rect.top - 20) + 'px';
                        tooltip.style.transform = 'translate(-50%, -100%)';
                    } else {
                        tooltip.style.top = Math.min(window.innerHeight - 20, rect.bottom + 20) + 'px';
                        tooltip.style.transform = 'translate(-50%, 0)';
                    }
                } else {
                    tooltip.style.top = (rect.bottom + 180 > window.innerHeight) ? '20%' : '75%';
                    tooltip.style.transform = 'translate(-50%, -50%)';
                }

                if (step.interactive) {
                    walkPulseTimeout = setTimeout(() => {
                        if (maskEl && maskEl.style.display !== 'none') {
                            maskEl.classList.add('walkthrough-active-pulse');
                        }
                    }, 4000);

                    window.currentWalkTarget = el;
                    window.currentWalkListener = () => {
                        clearTimeout(walkPulseTimeout);
                        if (maskEl) maskEl.classList.remove('walkthrough-active-pulse');
                        nextWalkStep();
                    };
                    el.addEventListener('click', window.currentWalkListener, { once: true });
                }
            }
        } else {
            maskEl.style.top = '50%';
            maskEl.style.left = '50%';
            maskEl.style.width = '0px';
            maskEl.style.height = '0px';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }, 300);
}

function nextWalkStep() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    if (currentWalkStep < walkSteps.length - 1) {
        currentWalkStep++;
        renderWalkStep();
    } else {
        skipWalkthrough();
    }
}

function skipWalkthrough() {
    clearTimeout(walkPulseTimeout);
    const maskEl = document.getElementById('walkthroughMask');
    if (maskEl) maskEl.classList.remove('walkthrough-active-pulse');

    if (window.currentWalkListener && window.currentWalkTarget) {
        window.currentWalkTarget.removeEventListener('click', window.currentWalkListener);
    }

    closePicker();
    document.getElementById('walkthroughTooltip').style.display = 'none';
    if (maskEl) maskEl.style.display = 'none';

    localStorage.setItem('hasSeenStudioTutorial', 'true');
    switchMode('spinner');
    playVictoryChime();
    startConfetti();
    setTimeout(stopConfetti, 2500);
}


/* ==========================================================================
   19. CONTACT FORM, INPUT BINDINGS & PWA
   ========================================================================== */
function openContactModal() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    document.getElementById('contactMessage').value = "";
    document.getElementById('contactModalOverlay').style.display = 'flex';
}

function closeContactModal() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    document.getElementById('contactModalOverlay').style.display = 'none';
}

function submitContactForm() {
    const reason = document.getElementById('contactReason').value;
    const message = document.getElementById('contactMessage').value;

    if (!message.trim()) {
        alert("Please enter a message before sending!");
        return;
    }

    const email = "luke.abram.gibson+ccspinner@gmail.com";
    const subject = encodeURIComponent(`CC Spinner App: ${reason}`);
    const appVersion = document.getElementById('app-version').innerText;
    const body = encodeURIComponent(`${message}\n\n---\nDiagnostic Info:\nReason: ${reason}\nApp Version: ${appVersion}\nActive Cycle: ${currentCycle}`);

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    closeContactModal();
}

function bindHoldButton(id, actionFn) {
    const el = document.getElementById(id);
    if (!el) return;

    let holdTimeout, holdInterval;
    const start = (e) => {
        e.preventDefault();
        actionFn();
        holdTimeout = setTimeout(() => holdInterval = setInterval(actionFn, 110), 350);
    };
    const stop = () => {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', stop);
}

bindHoldButton('increaseMaxWeek', increaseMaxWeek);
bindHoldButton('decreaseMaxWeek', decreaseMaxWeek);
bindHoldButton('increaseMinWeek', increaseMinWeek);
bindHoldButton('decreaseMinWeek', decreaseMinWeek);

// PWA Install Handling
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

function checkStandaloneMode() {
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
    const installBlock = document.getElementById('installSettingContainer');
    if (isStandalone && installBlock) installBlock.style.display = 'none';
}

function promptInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
            if (choiceResult.outcome === 'accepted') {
                document.getElementById('installSettingContainer').style.display = 'none';
            }
            deferredPrompt = null;
        });
    } else {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            alert("To install on iPhone/iPad:\n\n1. Tap the Share button at the bottom of Safari (the square with an up arrow).\n2. Scroll down and tap 'Add to Home Screen'.");
        } else {
            alert("To install this app, open your browser menu and select 'Add to Home Screen' or 'Install App'.");
        }
    }
}

window.addEventListener('appinstalled', () => {
    document.getElementById('installSettingContainer').style.display = 'none';
    deferredPrompt = null;
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            reg.update();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update();
            });
        });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            window.location.reload();
            refreshing = true;
        }
    });
}