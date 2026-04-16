/* ==========================================================================
   1. GLOBAL STATE & CONSTANTS
   ========================================================================== */
let currentMode = 'spinner'; 

function switchMode(mode) {
    stopVoiceover();
    const challengeIds = ['challengeContainer', 'taMenuContainer', 'taGameContainer', 'mistakeGameContainer'];

    // THE FIX: Double-tap logic to return to the Focus menu
    if (mode === 'challenge' && currentMode === 'challenge') {
        challengeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
        document.getElementById('challengeContainer').classList.add('active');
        activeChallengePage = 'challengeContainer';
        
        // Ensure pause triggers if we back out of the game
        if (typeof pauseTimeAttack === "function") pauseTimeAttack(); 
        return; 
    }

    // Toggle actual main pages
    document.getElementById('spinnerContainer').classList.toggle('active', mode === 'spinner');
    document.getElementById('reviewContainer').classList.toggle('active', mode === 'review');
    document.getElementById('gridContainer').classList.toggle('active', mode === 'grid');
    document.getElementById('settingsContainer').classList.toggle('active', mode === 'settings');

    if (mode === 'challenge') {
        // THE FIX: Force clear all challenge pages first so they don't overlap!
        challengeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
        
        // Reactivate the specific challenge page they left off on
        const target = document.getElementById(activeChallengePage || 'challengeContainer');
        if (target) target.classList.add('active');
        
        if (typeof resumeTimeAttack === "function") resumeTimeAttack(); // Automatically unpause!
        
        if (pendingTAFinish) {
            endTimeAttack(false);
            pendingTAFinish = false;
        }
    } else {
        // Save which challenge page is currently open, then hide it
        challengeIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.classList.contains('active')) {
                activeChallengePage = id; // Remember for later
                el.classList.remove('active');
            }
        });
        if (typeof pauseTimeAttack === "function") pauseTimeAttack(); // Automatically pause!
    }

    currentMode = mode;
    
    // Handle nav bar highlighting
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById('nav-' + mode);
    if (activeNav) activeNav.classList.add('active');

    // Run setup if needed
    if (mode === 'review') initReviewMode();
    if (mode === 'grid') buildGrid();
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isSpinning = false;
let activeChallengePage = 'challengeContainer'; // Remembers if they were in a menu or a game
let pendingTAFinish = false; // Flags if the timer hit 0 on another tab
let lastSpun = null; // The one we just spun (the "mistake")
let previousSpun = null;  // The one BEFORE that (the "rewind destination")

const subjects = ["Bible", "English", "Geography", "History", "Latin", "Math", "Science", "Timeline"];
const subjectIcons = {
  "Bible": "📜", "English": "📖", "Geography": "🌍", "History": "⚔️",
  "Latin": "🏛️", "Math": "🔢", "Science": "🧪", "Timeline": "⏳"
};
const weeks = Array.from({length: 24}, (_, i) => i + 1);

// Cached DOM elements (avoids repeated lookups)
const spinBtn = document.getElementById("spinBtn");
const toggleBtn = document.getElementById("toggleAnswer");
const undoBtn = document.getElementById("undoBtn");
const promptDiv = document.getElementById("prompt");
const ansDiv = document.getElementById("answerContent");

const latinTwinGroups = [
  [1, 2, 13, 14], // Present Tense
  [3, 4, 15, 16], // Imperfect Tense
  [5, 6, 17, 18], // Future Tense
  [7, 8, 19, 20], // Perfect Tense
  [9, 10, 21, 22], // Pluperfect Tense
  [11, 12, 23, 24] // Future Perfect Tense
];

/* ==========================================================================
   2. INITIALIZATION & DATA LOADING
   ========================================================================== */

/* --- Persistence for the active cycle --- */
// MUST be defined before we try to load cycle-specific data
let currentCycle = localStorage.getItem('ccActiveCycle') ? parseInt(localStorage.getItem('ccActiveCycle')) : 2;

// Cycle-specific prefix for storage
const getPrefix = () => `cycle${currentCycle}_`;

/* --- Persistence Helpers --- */
// We load the data based on the prefix of the current cycle
let gridState = localStorage.getItem(getPrefix() + 'ccSpinnerProgress') ? 
                JSON.parse(localStorage.getItem(getPrefix() + 'ccSpinnerProgress')) : {};

let allowedWeeks = localStorage.getItem(getPrefix() + 'ccAllowedWeeks') ? 
                JSON.parse(localStorage.getItem(getPrefix() + 'ccAllowedWeeks')) : [];

let blockedWeeks = localStorage.getItem(getPrefix() + 'ccBlockedWeeks') ? 
                JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedWeeks')) : [];

let blockedSubjects = localStorage.getItem(getPrefix() + 'ccBlockedSubjects') ? 
                JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedSubjects')) : [];

let mistakesBank = localStorage.getItem(getPrefix() + 'ccMistakesBank') ? 
                JSON.parse(localStorage.getItem(getPrefix() + 'ccMistakesBank')) : [];

let savedMaxWeek = localStorage.getItem(getPrefix() + 'ccMaxWeek');

// Global User Settings
let userSettings = Object.assign({
    muted: false,
    haptics: true,
    turbo: false,
    autoReveal: false,
    darkMode: false
}, JSON.parse(localStorage.getItem('appSettings')) || {});

function anyLessonsRemaining() {
  const maxWeek = getMaxWeek();
  return subjects.some(s =>
    weeks.some(w => ((w <= maxWeek || allowedWeeks.includes(w)) && !blockedWeeks.includes(w) && gridState[s][w]))
  );
}

function saveSettings() {
    localStorage.setItem('appSettings', JSON.stringify(userSettings));
}

// Initialize lessonData pointer (Loaded from data.js)
let lessonData = cycleData[currentCycle];

// Initialize gridState if empty for this cycle
if (Object.keys(gridState).length === 0) {
  subjects.forEach(s => {
    gridState[s] = {};
    weeks.forEach(w => gridState[s][w] = true);
  });
}

function changeCycle(cycleNum) {
    currentCycle = parseInt(cycleNum);
    localStorage.setItem('ccActiveCycle', currentCycle);
    
    // Update data pointer
    lessonData = cycleData[currentCycle];
    
    // Reload cycle-specific progress
    gridState = localStorage.getItem(getPrefix() + 'ccSpinnerProgress') ? 
                   JSON.parse(localStorage.getItem(getPrefix() + 'ccSpinnerProgress')) : {};
    
    allowedWeeks = localStorage.getItem(getPrefix() + 'ccAllowedWeeks') ? 
                   JSON.parse(localStorage.getItem(getPrefix() + 'ccAllowedWeeks')) : [];
                   
    blockedWeeks = localStorage.getItem(getPrefix() + 'ccBlockedWeeks') ? 
                   JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedWeeks')) : [];
    
    blockedSubjects = localStorage.getItem(getPrefix() + 'ccBlockedSubjects') ? 
                   JSON.parse(localStorage.getItem(getPrefix() + 'ccBlockedSubjects')) : [];               
    
    mistakesBank = localStorage.getItem(getPrefix() + 'ccMistakesBank') ? 
                   JSON.parse(localStorage.getItem(getPrefix() + 'ccMistakesBank')) : [];

    if (Object.keys(gridState).length === 0) {
        subjects.forEach(s => {
            gridState[s] = {};
            weeks.forEach(w => gridState[s][w] = true);
        });
    }

    // Update UI
    const cycleMax = localStorage.getItem(getPrefix() + 'ccMaxWeek');
    setMaxWeek(cycleMax ? parseInt(cycleMax) : 24);
    buildGrid();
    if (currentMode === 'review') {
        updateReviewDisplay();
    }
    updateFlagUI();
}

// --- Window Load & App Config ---
window.onload = function() {
  document.getElementById('cyclePicker').value = currentCycle;
  lessonData = cycleData[currentCycle];
  
  updateSettingsIcons();

  if (!navigator.vibrate) {
      const hapticsRow = document.getElementById('row-haptics');
      if (hapticsRow) hapticsRow.style.display = 'none';
  }

  const prefix = getPrefix();
  const savedMax = localStorage.getItem(prefix + 'ccMaxWeek');
  if (savedMax) setMaxWeek(parseInt(savedMax, 10));
  else setMaxWeek(24);

  document.getElementById('toggleAnswer').disabled = true;
  buildGrid();
  
  // Initial Vibration Feedback
  if (userSettings.haptics && navigator.vibrate) navigator.vibrate(40);

  // Sync Version Tag
  fetch('manifest.json') 
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(m => { if(document.getElementById('app-version')) document.getElementById('app-version').innerText = m.version; })
    .catch(() => { if(document.getElementById('app-version')) document.getElementById('app-version').innerText = "not available"; });
    updateFlagUI();
};

function saveToDevice() {
  const prefix = getPrefix();
  localStorage.setItem(prefix + 'ccSpinnerProgress', JSON.stringify(gridState));
  localStorage.setItem(prefix + 'ccMaxWeek', String(getMaxWeek()));
  localStorage.setItem(prefix + 'ccAllowedWeeks', JSON.stringify(allowedWeeks));
  localStorage.setItem(prefix + 'ccBlockedWeeks', JSON.stringify(blockedWeeks));
  localStorage.setItem(prefix + 'ccBlockedSubjects', JSON.stringify(blockedSubjects));
  localStorage.setItem(prefix + 'ccMistakesBank', JSON.stringify(mistakesBank));
}

function updateVh() { 
  document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px'); 
}
window.addEventListener('resize', updateVh);
updateVh();

/* ==========================================================================
   3. CORE APP LOGIC (Spinning & Toggling)
   ========================================================================== */

function spinBoth() {
    stopVoiceover();
  if (getSpinLabel().toLowerCase() === 'done') { finishLesson(); return; }

  if (isSpinning) return;
  if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15); 

  const maxWeekLimit = getMaxWeek();
  const availableSubjects = subjects.filter(s =>
    !blockedSubjects.includes(s) && weeks.some(w => (w <= maxWeekLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w) && gridState[s][w])
  );

  if (availableSubjects.length === 0) {
        setSpinLabel('Done');
        const sBtn = document.getElementById('spinBtn');
        if(sBtn) {
            sBtn.style.background = '#22c55e';
            sBtn.style.fontSize = '14px';
        }
        finishLesson(); // Pop the confetti and show the Reset box!
        return;
    }

  // Lock State
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
  const availableWeeks = weeks.filter(w => ((w <= maxWeekLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w)) && gridState[subject][w]);
  const week = availableWeeks[Math.floor(Math.random() * availableWeeks.length)];

  const subIdx = subjects.indexOf(subject);
  const weekIdx = weeks.indexOf(week);

  // Apply Turbo Math
  const spinDuration = userSettings.turbo ? 500 : 2000;
  const weekDuration = userSettings.turbo ? 700 : 2800;
  const finalTimeout = userSettings.turbo ? 750 : 2600;

  spinReel("subjectReel", availableSubjects, subject, spinDuration);
  spinReel("weekReel", availableWeeks.map(w => "Week " + w), "Week " + week, weekDuration);

  // Finalize Spin
  setTimeout(() => {
    try {
      playSound(988, 'triangle', 0.1, 0.03);
      setTimeout(() => playSound(1319, 'triangle', 0.2, 0.03), 100);
      if (userSettings.haptics && navigator.vibrate) navigator.vibrate([40, 30, 40]);
      
      const lesson = lessonData[subject][week];

      previousSpun = lastSpun ? { ...lastSpun } : null; 

      lastSpun = {
        subject: subject, 
        week: week,
        sIdx: subIdx,   
        wIdx: weekIdx,   
        prompt: lesson.p,
        answer: lesson.a
      };

      promptDiv.textContent = lesson.p;
      ansDiv.innerHTML = lesson.a;
      
      prepVoiceover(subject, week, 'audioBtnMain');

      // Handle Auto-Reveal
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
        !blockedSubjects.includes(s) && weeks.some(w => ((w <= maxWeekLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w)) && gridState[s][w])
      );
      if (!remaining) {
        setSpinLabel('Done');
        spinBtn.style.background = '#22c55e';
        spinBtn.style.fontSize = '14px';
      }
      
    } catch (e) {
      console.error("Spin Error:", e);
      document.getElementById('prompt').textContent = "Spinning error. Please try again!";
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
  for (let i = 0; i < 20; i++) sequence.push(items[Math.floor(Math.random() * items.length)]);
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
  const btn = document.getElementById('toggleAnswer');
  container.classList.toggle('open');
  btn.textContent = container.classList.contains('open') ? '▲ Hide Answer ▲' : '▼ Show Answer ▼';
}

function undoLastSpin() {
    stopVoiceover();
    if (!lastSpun) return;

    // 1. Put the "mistake" back on the grid
    gridState[lastSpun.subject][lastSpun.week] = true;
    if (lastSpun.subject === "Latin" && currentCycle === 2) {
        const group = latinTwinGroups.find(g => g.includes(lastSpun.week));
        if (group) {
            group.forEach(twinWeek => {
                gridState["Latin"][twinWeek] = true;
            });
        }
    }
    
    // 2. Rewind the UI
    if (previousSpun) {
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
        
        prepVoiceover(previousSpun.subject, previousSpun.week, 'audioBtnMain');

        subReel.style.transition = "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        weekReel.style.transition = "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

        subReel.style.transform = `translateY(-${previousSpun.sIdx * 80}px)`;
        weekReel.style.transform = `translateY(-${previousSpun.wIdx * 80}px)`;

        document.getElementById('prompt').textContent = previousSpun.prompt;
        document.getElementById('answerContent').innerHTML = previousSpun.answer;
        
        lastSpun = { ...previousSpun };
        previousSpun = null; 
    } else {
        document.getElementById('subjectReel').style.transform = `translateY(0)`;
        document.getElementById('weekReel').style.transform = `translateY(0)`;
        document.getElementById('prompt').textContent = "Spin to start!";
        document.getElementById('answerContent').textContent = "";
        lastSpun = null;
    }

    // 3. Reset UI state
    document.getElementById('answerContainer').classList.remove('open');
    document.getElementById('undoBtn').disabled = true;
    
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate(40);
    updateFlagUI();
    saveToDevice();
    buildGrid();
}

// NEW: Flagging Logic
function toggleMistake() {
    if (!lastSpun) return;
    
    // Check if the current lesson is already in the bank
    const idx = mistakesBank.findIndex(m => m.subject === lastSpun.subject && m.week === lastSpun.week);
    
    if (idx !== -1) {
        mistakesBank.splice(idx, 1); // Remove it
    } else {
        mistakesBank.push({ subject: lastSpun.subject, week: lastSpun.week }); // Add it
        if (userSettings.haptics && navigator.vibrate) navigator.vibrate([20, 50, 20]); // Double buzz!
    }
    
    saveToDevice();
    updateFlagUI();
}

// NEW: Flagging from Review Mode
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
    // 1. Sync Main Spinner Flag
    const flagBtn = document.getElementById('flagBtn');
    if (flagBtn) {
        if (!lastSpun) {
            flagBtn.disabled = true;
            flagBtn.classList.remove('flagged');
        } else {
            flagBtn.disabled = false;
            const isFlagged = mistakesBank.some(m => m.subject === lastSpun.subject && m.week === lastSpun.week);
            flagBtn.classList.toggle('flagged', isFlagged);
        }
    }

    // 2. Sync Review Mode Flag
    const reviewFlagBtn = document.getElementById('reviewFlagBtn');
    if (reviewFlagBtn) {
        const subject = subjects[reviewSubjectIdx];
        const week = weeks[reviewWeekIdx];
        const isFlagged = mistakesBank.some(m => m.subject === subject && m.week === week);
        reviewFlagBtn.classList.toggle('flagged', isFlagged);
    }

    // 3. Sync Notification Badges
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
        
        // Satisfying "pop" animation when the number goes up!
        if (count > parseInt(oldText || 0)) {
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
   4. AUDIO & HAPTICS HELPERS
   ========================================================================== */

function playSound(freq, type, duration, vol) {
  if (userSettings.muted) return;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
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
        { freq: 261.63, delay: 0,   duration: 0.1 },  // C4
        { freq: 392.00, delay: 80,  duration: 0.1 },  // G4
        { freq: 523.25, delay: 160, duration: 0.1 },  // C5
        { freq: 659.25, delay: 240, duration: 0.1 },  // E5
        { freq: 784.00, delay: 320, duration: 0.2 },  // G5

        { freq: 349.23, delay: 500, duration: 0.15 }, // F4
        { freq: 440.00, delay: 500, duration: 0.15 }, // A4
        { freq: 523.25, delay: 500, duration: 0.15 }, // C5

        { freq: 392.00, delay: 650, duration: 0.15 }, // G4
        { freq: 493.88, delay: 650, duration: 0.15 }, // B4
        { freq: 587.33, delay: 650, duration: 0.15 }, // D5

        { freq: 261.63, delay: 850, duration: 0.8 },  // C4 (Bass)
        { freq: 392.00, delay: 850, duration: 0.8 },  // G4
        { freq: 523.25, delay: 850, duration: 0.8 },  // C5
        { freq: 659.25, delay: 850, duration: 0.8 },  // E5
        { freq: 784.00, delay: 850, duration: 0.8 }   // G5 (Melody peak)
    ];
    
    notes.forEach(note => {
        setTimeout(() => {
            playSound(note.freq, 'triangle', note.duration, 0.04);
        }, note.delay);
    });
}
  
function setSpinLabel(label) {
  const spinBtn = document.getElementById('spinBtn');
  if (!spinBtn) return;
  const tp = spinBtn.querySelector('textPath');
  if (tp) tp.textContent = String(label).toUpperCase();
  else spinBtn.textContent = String(label).toUpperCase();
}

function getSpinLabel() {
  const spinBtn = document.getElementById('spinBtn');
  if (!spinBtn) return '';
  const tp = spinBtn.querySelector('textPath');
  if (tp) return (tp.textContent || '').trim();
  return (spinBtn.textContent || '').trim();
}

/* ==========================================================================
   5. GRID & LESSON MANAGEMENT
   ========================================================================== */

function buildGrid(){
  saveToDevice();
  const maxWeek = getMaxWeek();
  const container = document.getElementById('gridContent');
  const containerWidth = container ? container.clientWidth : window.innerWidth;
  const availableForSubjects = Math.max(120, containerWidth - 48 - 12);
  const subjectWidth = Math.max(32, Math.floor(availableForSubjects / subjects.length));

  let html = `<table><colgroup><col style="width:48px">`;
  subjects.forEach(() => { html += `<col style="width:${subjectWidth}px">`; });
  
  html += '</colgroup><thead><tr><th class="top-header empty-header"></th>';
  
  subjects.forEach(s => { 
    // THE FIX: Check the new blockedSubjects memory bank!
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
      
      // THE FIX: If the subject is in the blocked bank, turn the cell grey!
      if (isBlocked || blockedSubjects.includes(s) || !gridState[s][w] || (w > maxWeek && !isAllowed)) {
          cls = "completed";
      } else if (isAllowed && w > maxWeek) {
          cls = "override";
      }
      
      html += `<td class="${cls}" onclick="toggleCell('${s}',${w})"></td>`;
    });
    html += '</tr>';
  });
  document.getElementById('grid').innerHTML = html + '</tbody></table>';
  bindWeekHeaderHandlers();
}

function toggleCell(s,w){ gridState[s][w] = !gridState[s][w]; buildGrid(); }

// THE FIX: Add or remove from the memory bank instead of deleting gridState progress!
function toggleSubject(s){ 
    const idx = blockedSubjects.indexOf(s);
    if (idx !== -1) blockedSubjects.splice(idx, 1);
    else blockedSubjects.push(s);
    saveToDevice();
    buildGrid(); 
}

function toggleWeek(w){ const anyOn = subjects.some(s => gridState[s][w]); subjects.forEach(s => gridState[s][w] = !anyOn); buildGrid(); }

function toggleAllowWeek(e, w) {
  const maxWeek = getMaxWeek();
  const blockedIdx = blockedWeeks.indexOf(w);
  if (blockedIdx !== -1) blockedWeeks.splice(blockedIdx, 1);
  else {
    const allowedIdx = allowedWeeks.indexOf(w);
    if (allowedIdx !== -1) allowedWeeks.splice(allowedIdx, 1);
    else (w > maxWeek) ? allowedWeeks.push(w) : blockedWeeks.push(w);
  }
  saveToDevice(); buildGrid();
}

function bindWeekHeaderHandlers(){
  document.querySelectorAll('#grid th.week-header').forEach(th => th.addEventListener('click', ()=> toggleWeek(Number(th.getAttribute('data-week')))));
  document.querySelectorAll('#grid .weekNumber').forEach(btn => btn.addEventListener('click', function(e){ e.stopPropagation(); toggleAllowWeek(e, Number(this.getAttribute('data-week'))); }));
}

/* ==========================================================================
   6. QUICK SETTINGS TOGGLES
   ========================================================================== */

function updateSettingsIcons() {
    // THE FIX: Use strict booleans (!!) so the sliders never "blindly flip"
    document.getElementById('switch-sound').classList.toggle('on', !userSettings.muted);
    document.getElementById('switch-haptics').classList.toggle('on', !!userSettings.haptics);
    document.getElementById('switch-turbo').classList.toggle('on', !!userSettings.turbo);
    document.getElementById('switch-reveal').classList.toggle('on', !!userSettings.autoReveal);
    document.getElementById('switch-dark').classList.toggle('on', !!userSettings.darkMode);

    if(!navigator.vibrate) {
        const hapticsRow = document.getElementById('row-haptics');
        if(hapticsRow) hapticsRow.style.display = 'none';
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
    if(userSettings.haptics && navigator.vibrate) navigator.vibrate(15); 
}

/* ==========================================================================
   7. WEEK SELECTION & RESET DIALOGS
   ========================================================================== */

function getMaxWeek() {
  const el = document.getElementById("maxWeekDisplay");
  return Math.max(1, Math.min(24, parseInt(el.textContent, 10) || 24));
}
function setMaxWeek(n) {
  document.getElementById("maxWeekDisplay").textContent = String(Math.max(1, Math.min(24, Number(n) || 1)));
}
function increaseWeek() { setMaxWeek(getMaxWeek() + 1); buildGrid(); }
function decreaseWeek() { setMaxWeek(getMaxWeek() - 1); buildGrid(); }

function showResetConfirm() { document.getElementById('resetConfirmOverlay').style.display = 'flex'; }
function hideResetConfirm() { document.getElementById('resetConfirmOverlay').style.display = 'none'; }

function resetGrid() { showResetConfirm(); }

function resetGridConfirmed() {
  isSpinning = false;
  hideResetConfirm();
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
  
  document.getElementById('prompt').textContent = "Cycle " + currentCycle;
  document.getElementById('answerContent').textContent = ""; 
  document.getElementById('answerContainer').classList.remove('open');
  document.getElementById('toggleAnswer').disabled = true;
}

/* ==========================================================================
   8. Review Mode Logic
   ========================================================================== */
let reviewSubjectIdx = localStorage.getItem('reviewSubjectIdx') ? parseInt(localStorage.getItem('reviewSubjectIdx')) : 0;
let reviewWeekIdx = localStorage.getItem('reviewWeekIdx') ? parseInt(localStorage.getItem('reviewWeekIdx')) : 0;

function initReviewMode() {
    updateReviewDisplay();
}

// Direction is 1 (Next) or -1 (Prev)
function changeReviewSubject(dir) {
    // Math logic to perfectly loop around the array if they go past the ends
    reviewSubjectIdx = (reviewSubjectIdx + dir + subjects.length) % subjects.length;
    if(userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    updateReviewDisplay();
}

function changeReviewWeek(dir) {
    reviewWeekIdx = (reviewWeekIdx + dir + weeks.length) % weeks.length;
    if(userSettings.haptics && navigator.vibrate) navigator.vibrate(10);
    updateReviewDisplay();
}

function updateReviewDisplay() {
    stopVoiceover();
    const subject = subjects[reviewSubjectIdx];
    const week = weeks[reviewWeekIdx];
    const lesson = lessonData[subject][week];

    // Update Text Labels
    document.getElementById('reviewSubjectLabel').innerHTML = `${subjectIcons[subject]} ${subject}`;
    document.getElementById('reviewWeekLabel').textContent = `Week ${week}`;

    // Update Card Content
    document.getElementById('reviewPrompt').textContent = lesson.p;
    document.getElementById('reviewAnswerContent').innerHTML = lesson.a;

    prepVoiceover(subject, week, 'audioBtnReview');
    updateFlagUI(); // Ensure flag color updates when scrolling!
}

// --- Quick Picker Modal Logic ---
let currentPickerType = '';

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
    } else {
        title.textContent = 'Select Week';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(60px, 1fr))';
        weeks.forEach((w, i) => {
            const btn = document.createElement('button');
            // THE FIX: Same clean class logic here!
            btn.className = `picker-btn ${i === reviewWeekIdx ? 'selected' : ''}`;
            btn.textContent = w;
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
    } else {
        reviewWeekIdx = idx;
    }
    updateReviewDisplay();
    // THE FIX: Safely check for vibration support so iOS doesn't crash before closing the menu
    if(userSettings.haptics && navigator.vibrate) navigator.vibrate(20);
    closePicker();
}

/* ==========================================================================
   9. Finish / Confetti Helpers
   ========================================================================== */
let confettiAnimationId = null;
let confettiParticles = null;
let confettiResizeHandler = null;
let isConfettiStopping = false; 

function finishLesson() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60,30,60]);
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

    const w = canvas.width, h = canvas.height;
    const colors = ['#ef4444','#f97316','#f59e0b','#22c55e','#06b6d4','#6366f1','#ec4899'];
    const parts = [];

    for (let i = 0; i < 140; i++) {
        parts.push({
            x: Math.random() * w,
            y: Math.random() * -h,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 3 + 2,
            r: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * 360,
            vr: (Math.random() - 0.5) * 10
        });
    }
    confettiParticles = parts;

    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let p of parts) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.02; // Gravity
            p.rot += p.vr;
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r * 0.6);
            ctx.restore();

            if (p.y > canvas.height + 20) {
                if (!isConfettiStopping) {
                    p.y = -10;
                    p.x = Math.random() * canvas.width;
                    p.vy = Math.random() * 3 + 2;
                }
            }
        }

        if (isConfettiStopping && parts.every(p => p.y > canvas.height + 20)) {
            stopConfetti();
            return; 
        }

        confettiAnimationId = requestAnimationFrame(frame);
    }
    confettiAnimationId = requestAnimationFrame(frame);
}

function stopConfetti(canvasId = 'confettiCanvas') {
    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
    confettiParticles = null;
    
    if (confettiResizeHandler) {
        window.removeEventListener('resize', confettiResizeHandler);
        confettiResizeHandler = null;
    }
    
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Only hide the Main Grid doneOverlay if we are running the main game confetti
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
   10. INPUT & SERVICE WORKER BINDINGS
   ========================================================================== */

function bindHoldButton(id, actionFn){
  const el = document.getElementById(id);
  if(!el) return;
  let holdTimeout, holdInterval;
  const start = (e) => { e.preventDefault(); actionFn(); holdTimeout = setTimeout(()=> holdInterval = setInterval(actionFn, 110), 350); };
  const stop = () => { clearTimeout(holdTimeout); clearInterval(holdInterval); };
  el.addEventListener('mousedown', start); el.addEventListener('mouseup', stop); el.addEventListener('mouseleave', stop);
  el.addEventListener('touchstart', start, {passive:false}); el.addEventListener('touchend', stop);
}
bindHoldButton('increaseWeek', increaseWeek);
bindHoldButton('decreaseWeek', decreaseWeek);

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      reg.update(); 
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            alert("New version available! Click OK to update."); 
            window.location.reload();
          }
        });
      });
    });
  });
}

/* ==========================================================================
   11. CHALLENGE MODES (Review Mistakes)
   ========================================================================== */
let mistakeQueue = [];
let currentMistake = null;
let isMistakeSpinning = false;

function startMistakeReview() {
    if (mistakesBank.length === 0) {
        alert("Great job! Your mistakes bank is currently empty.");
        return;
    }

    // Hide challenge menu, show game
    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('mistakeGameContainer').classList.add('active');

    // Shuffle the mistakes into a fresh deck for this session
    mistakeQueue = [...mistakesBank].sort(() => Math.random() - 0.5);
    
    spinNextMistake();
}

function exitMistakeReview() {
    stopVoiceover(); 
    document.getElementById('mistakeGameContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer'; // THE FIX
}

function spinNextMistake() {
    try {
        stopVoiceover(); 
        
        // 1. Check if the deck is empty
        if (!mistakeQueue || mistakeQueue.length === 0) {
            finishMistakeReview();
            return;
        }

        // 2. Pull the next card
        currentMistake = mistakeQueue.shift(); 
        
        // 3. Auto-Heal: If the phone's memory saved a blank mistake, skip it!
        if (!currentMistake || !currentMistake.subject || !currentMistake.week) {
            console.warn("Skipped corrupted mistake data:", currentMistake);
            spinNextMistake(); 
            return;
        }

        // 4. Update the text labels safely
        const remainingEl = document.getElementById('mistakesRemaining');
        if (remainingEl) remainingEl.textContent = `Remaining: ${mistakeQueue.length + 1}`;
        
        const labelEl = document.getElementById('mistakeSubjectLabel');
        if (labelEl) labelEl.textContent = `${subjectIcons[currentMistake.subject]} ${currentMistake.subject} - Week ${currentMistake.week}`;
        
        // 5. Fetch the actual lesson text
        const lesson = lessonData[currentMistake.subject][currentMistake.week];
        if (!lesson) throw new Error("Lesson data not found for this week.");
        
        document.getElementById('mistakePrompt').textContent = lesson.p;
        document.getElementById('mistakeAnswerContent').innerHTML = lesson.a;

        // 6. Reset UI states
        document.getElementById('mistakeAnswerContainer').classList.remove('open');
        document.getElementById('toggleMistakeAnswer').textContent = '▼ Show Answer ▼';

        if (userSettings.autoReveal) {
            toggleMistakeAnswerBtn();
        }

        // 7. Light up the buttons
        const needsWorkBtn = document.getElementById('mistakeNeedsWorkBtn');
        const correctBtn = document.getElementById('mistakeCorrectBtn');
        
        if (needsWorkBtn) { needsWorkBtn.disabled = false; needsWorkBtn.style.opacity = '1'; }
        if (correctBtn) { correctBtn.disabled = false; correctBtn.style.opacity = '1'; }

        // 8. Prep Audio
        prepVoiceover(currentMistake.subject, currentMistake.week, 'audioBtnMistake');
        
    } catch (error) {
        console.error("Mistake Review Crash:", error);
        alert("Oops! A corrupted lesson got stuck in the deck. We've cleared the error, please try again.");
        // Purge the corrupt memory bank and reset
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
    if (isMistakeSpinning) return;
    
    if (isCorrect) {
        // Remove it permanently from the phone's memory
        const idx = mistakesBank.findIndex(m => m.subject === currentMistake.subject && m.week === currentMistake.week);
        if (idx !== -1) mistakesBank.splice(idx, 1);
        saveToDevice();
    } else {
        // Shove it to the back of the queue so they have to get it right before winning!
        mistakeQueue.push(currentMistake);
    }
    
    spinNextMistake();
    updateFlagUI();
}

function finishMistakeReview() {
    playVictoryChime();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60,30,60]);    
    document.getElementById('mistakeResultsOverlay').style.display = 'flex';
    startConfetti('mistakeConfettiCanvas');
}

function closeMistakeResults() {
    stopConfetti('mistakeConfettiCanvas');
    document.getElementById('mistakeResultsOverlay').style.display = 'none';
    exitMistakeReview();
}

/* ==========================================================================
   12. CHALLENGE MODES (Time Attack)
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
        for(let i=1; i<=60; i++) {
            const div = document.createElement("div");
            div.textContent = i;
            reel.appendChild(div);
        }
        // Snap the wheel to 3 minutes by default
        setTimeout(() => { document.getElementById('taMinuteScroll').scrollTo({ top: 160, behavior: 'auto' }); }, 50); 
    }
}

function exitTimeAttackMenu() {
    document.getElementById('taMenuContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer'; // THE FIX
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

    taAvailable = [];
    const maxLimit = getMaxWeek();
    subjects.forEach(s => {
        if (blockedSubjects.includes(s)) return;
        weeks.forEach(w => {
            if ((w <= maxLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w) && gridState[s][w]) {
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
        
        if (currentMode === 'challenge') {
            endTimeAttack(false); // False = Time ran out naturally
        } else {
            pendingTAFinish = true; 
        }
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
        endTimeAttack(true); // True = They cleared the board early!
        return;
    }

    const randIdx = Math.floor(Math.random() * taAvailable.length);
    taCurrent = taAvailable[randIdx];
    const lesson = lessonData[taCurrent.subject][taCurrent.week];

    document.getElementById('taSubjectLabel').textContent = `${subjectIcons[taCurrent.subject]} ${taCurrent.subject} - Week ${taCurrent.week}`;
    document.getElementById('taPrompt').textContent = lesson.p;
    document.getElementById('taAnswerContent').innerHTML = lesson.a;

    const container = document.getElementById('taAnswerContainer');
    container.classList.remove('open');
    document.getElementById('toggleTAAnswer').textContent = '▼ Show Answer ▼';
    
    prepVoiceover(taCurrent.subject, taCurrent.week, 'audioBtnTA');
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
        
        // Mark it complete on the grid!
        gridState[taCurrent.subject][taCurrent.week] = false;
        
        // Handle Latin twin weeks for cycle 2
        if (taCurrent.subject === "Latin" && currentCycle === 2) {
            const group = latinTwinGroups.find(g => g.includes(taCurrent.week));
            if (group) {
                group.forEach(twinWeek => {
                    gridState["Latin"][twinWeek] = false;
                    // Remove twin weeks from the active deck
                    taAvailable = taAvailable.filter(item => !(item.subject === "Latin" && group.includes(item.week)));
                });
            }
        }
        
        saveToDevice();
        buildGrid(); // Update the visual grid silently in the background
        
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
    taTimeLeft = 0;         
    isTAPaused = false;

    playVictoryChime();
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60,30,60]);
    
    const total = taScoreRight + taScoreWrong;
    const accuracy = total > 0 ? Math.round((taScoreRight / total) * 100) : 0;
    
    const titleEl = document.getElementById('taResultsTitle');
    const subtitleEl = document.getElementById('taResultsSubtitle');
    
    // Handle the early Victory display
    if (clearedBoard) {
        const elapsed = taTotalStartingTime - taTimeLeft;
        const m = Math.floor(elapsed / 60);
        const s = (elapsed % 60).toString().padStart(2, '0');
        titleEl.textContent = "Board Cleared!";
        subtitleEl.textContent = `You finished the lesson in only ${m}:${s}!`;
        subtitleEl.style.display = 'block';

        // NEW: Automatically reset the grid in the background!
        subjects.forEach(s => {
            weeks.forEach(w => gridState[s][w] = true);
        });
        saveToDevice();
        buildGrid();
        
        // Ensure the main spinner button resets to "SPIN" (not "DONE")
        const mainSpinBtn = document.getElementById('spinBtn');
        if (mainSpinBtn) {
            mainSpinBtn.style.background = "var(--primary)"; 
            mainSpinBtn.disabled = false;
            setSpinLabel('SPIN');
            mainSpinBtn.style.fontSize = '';
        }

    } else {
        titleEl.textContent = "Time's Up!";
        subtitleEl.style.display = 'none';
    }
    
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
    activeChallengePage = 'challengeContainer'; // THE FIX
}

/* ==========================================================================
   13. VOICEOVER AUDIO ENGINE
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
    
    // Reset state
    btn.style.display = 'none';
    setAudioIcon(btnId, false);
    
    // Construct the file name (e.g., "Math" -> "math", "Timeline" -> "timeline")
    const cleanSubject = subject.toLowerCase().replace(/[^a-z0-9]/g, '');
    const url = `audio/c${currentCycle}-${cleanSubject}-w${week}.m4a`;

    // "Ping" the server to see if the file exists without downloading it
    fetch(url, { method: 'HEAD' })
        .then(res => {
            if (res.ok) {
                btn.dataset.url = url;
                btn.style.display = 'flex'; // It exists! Show the button.
                setAudioIcon(btnId, false);
            }
        })
        .catch(e => { /* File missing, keep button hidden */ });
}

function toggleVoiceover(e, btnId) {
    if (e) e.stopPropagation(); // Prevents the Answer card from toggling open/closed!
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    const targetUrl = btn.dataset.url;
    
    // If clicking the currently playing button, pause it
    if (activeVoiceBtn === btnId && !voiceAudio.paused) {
        voiceAudio.pause();
        setAudioIcon(btnId, false);
        return;
    }
    
    // If playing a new file, load it
    if (currentVoiceUrl !== targetUrl) {
        voiceAudio.src = targetUrl;
        currentVoiceUrl = targetUrl;
    }
    
    // Reset old button icon if switching to a new card
    if (activeVoiceBtn && activeVoiceBtn !== btnId) {
        setAudioIcon(activeVoiceBtn, false);
    }
    
    voiceAudio.play().catch(err => console.error("Audio play failed:", err));
    activeVoiceBtn = btnId;
    setAudioIcon(btnId, true);
}

function setAudioIcon(btnId, isPlaying) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isPlaying) {
        // Add the playing class (turns the circle red) and show Pause Icon
        btn.classList.add('playing');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
        // Remove the playing class and show Play Icon
        btn.classList.remove('playing');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
}

function stopVoiceover() {
    if (!voiceAudio.paused) {
        voiceAudio.pause();
        if (activeVoiceBtn) setAudioIcon(activeVoiceBtn, false);
    }
}