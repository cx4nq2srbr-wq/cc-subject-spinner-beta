/* ==========================================================================
   1. GLOBAL STATE & CONSTANTS
   ========================================================================== */
let currentMode = 'home'; // 'home', 'spinner', or 'review'

function switchMode(mode) {
    // 1. Update State
    currentMode = mode;

    // 2. Toggle Visibility
    document.getElementById('homeScreen').classList.toggle('active', mode === 'home');
    document.getElementById('spinnerContainer').classList.toggle('active', mode === 'spinner');
    document.getElementById('reviewContainer').classList.toggle('active', mode === 'review');

    // 3. Setup Review if needed
    if (mode === 'review') {
        initReviewMode();
    }
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isSpinning = false;
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

let savedMaxWeek = localStorage.getItem(getPrefix() + 'ccMaxWeek');

  // Global User Settings
let userSettings = JSON.parse(localStorage.getItem('appSettings')) || {
    muted: false,
    waveform: 'square', // Options: 'square', 'sine', 'triangle'
    haptics: true,
    confetti: true
};

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
    
    // If it's a fresh cycle, initialize it
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
}

// --- Window Load & App Config ---
window.onload = function() {
  document.getElementById('cyclePicker').value = currentCycle;
  lessonData = cycleData[currentCycle];
  
  if (!navigator.vibrate) {
      const hapticsRow = document.getElementById('hapticsContainer');
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
};

function saveToDevice() {
  const prefix = getPrefix();
  localStorage.setItem(prefix + 'ccSpinnerProgress', JSON.stringify(gridState));
  localStorage.setItem(prefix + 'ccMaxWeek', String(getMaxWeek()));
  localStorage.setItem(prefix + 'ccAllowedWeeks', JSON.stringify(allowedWeeks));
  localStorage.setItem(prefix + 'ccBlockedWeeks', JSON.stringify(blockedWeeks));
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
  // Handle Reset State
  // If we've switched to the Done state, show celebration
  if (getSpinLabel().toLowerCase() === 'done') { finishLesson(); return; }

  // Handle Reset State
  if (getSpinLabel() === "Reset") { showResetConfirm(); return; }
  

  if (isSpinning) return;
  if (userSettings.haptics && navigator.vibrate) navigator.vibrate(15); 

  const maxWeekLimit = getMaxWeek();
  const availableSubjects = subjects.filter(s =>
    weeks.some(w => (w <= maxWeekLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w) && gridState[s][w])
  );

  if (availableSubjects.length === 0) {
    setSpinLabel('Reset');
    spinBtn.style.background = "#64748b";
    spinBtn.style.fontSize = "14px";
    return;
  }

  // Lock State
  isSpinning = true;
  spinBtn.disabled = true;
  toggleBtn.disabled = true;
  undoBtn.disabled = true;
  
  toggleBtn.textContent = '▼ Show Answer ▼';
  document.getElementById('answerContainer').classList.remove('open');
  ansDiv.textContent = "";
  promptDiv.textContent = "";

 // 1. Pick the winning subject and week
  const subject = availableSubjects[Math.floor(Math.random() * availableSubjects.length)];
  const availableWeeks = weeks.filter(w => ((w <= maxWeekLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w)) && gridState[subject][w]);
  const week = availableWeeks[Math.floor(Math.random() * availableWeeks.length)];

  // 2. DEFINE THE INDICES 
  const subIdx = subjects.indexOf(subject);
  const weekIdx = weeks.indexOf(week);

  // 3. Start Reel Animations
  spinReel("subjectReel", availableSubjects, subject, 2000);
  spinReel("weekReel", availableWeeks.map(w => "Week " + w), "Week " + week, 2800);

  // 4. Finalize Spin
  setTimeout(() => {
    try {
      playSound(988, 'triangle', 0.1, 0.03);
      setTimeout(() => playSound(1319, 'triangle', 0.2, 0.03), 100);
      if (userSettings.haptics && navigator.vibrate) navigator.vibrate([40, 30, 40]);
      
      const lesson = lessonData[subject][week];

      // Save memory for Undo
      previousSpun = lastSpun ? { ...lastSpun } : null; 

      lastSpun = {
        subject: subject, 
        week: week,
        sIdx: subIdx,   
        wIdx: weekIdx,   
        prompt: lesson.p,
        answer: lesson.a
      };

      // Display results
        promptDiv.textContent = lesson.p;
        ansDiv.innerHTML = lesson.a;
      
      // Update Grid State
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
      // If no lessons remain available, change spin button to a green "Done" button
      const remaining = subjects.some(s =>
        weeks.some(w => ((w <= maxWeekLimit || allowedWeeks.includes(w)) && !blockedWeeks.includes(w)) && gridState[s][w])
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
      // Re-enable everything
      isSpinning = false;
      spinBtn.disabled = false;
      toggleBtn.disabled = false;
      undoBtn.disabled = false; 
    }
  }, 2600);
}

function spinReel(reelId, items, finalValue, duration = 2400) {
  const reel = document.getElementById(reelId);
reel.innerHTML = "";

const sequence = [];
for (let i = 0; i < 20; i++) sequence.push(items[Math.floor(Math.random() * items.length)]);
sequence.push(finalValue);

// Build elements in memory first (faster)
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

function toggleReviewAnswer() {
    const container = document.getElementById('reviewAnswerContainer');
    const btn = document.getElementById('toggleReviewAnswer');
    const isOpen = container.classList.toggle('open');
    
    btn.textContent = isOpen ? '▲ Hide Answer ▲' : '▼ Show Answer ▼';
    
    if (isOpen && userSettings.haptics) {
        navigator.vibrate(15);
    }
}

function undoLastSpin() {
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
        // We must REBUILD the reels with the standard lists so the index matches the physical divs
        const subReel = document.getElementById('subjectReel');
        const weekReel = document.getElementById('weekReel');

        // Re-populate Subject Reel with standard list
        subReel.innerHTML = "";
        subjects.forEach(s => {
            const div = document.createElement("div");
            div.textContent = `${subjectIcons[s]} ${s}`;
            subReel.appendChild(div);
        });

        // Re-populate Week Reel with standard list
        weekReel.innerHTML = "";
        weeks.forEach(w => {
            const div = document.createElement("div");
            div.textContent = "Week " + w;
            weekReel.appendChild(div);
        });

        // Force a tiny reflow so the browser sees the new divs before animating
        void subReel.offsetHeight; 

        // Apply the "Rewind" animation
        subReel.style.transition = "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        weekReel.style.transition = "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

        // Move to the PREVIOUS indices
        subReel.style.transform = `translateY(-${previousSpun.sIdx * 80}px)`;
        weekReel.style.transform = `translateY(-${previousSpun.wIdx * 80}px)`;

        // Update Text to previous question
        document.getElementById('prompt').textContent = previousSpun.prompt;
        document.getElementById('answerContent').innerHTML = previousSpun.answer;
        
        // Step back the memory
        lastSpun = { ...previousSpun };
        previousSpun = null; 
    } else {
        // If there was no previous question, just reset to top
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
    saveToDevice();
    buildGrid();
}

/* ==========================================================================
   4. AUDIO & HAPTICS HELPERS
   ========================================================================== */

function playSound(freq, type, duration, vol) {
  if (userSettings.muted) return;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  // Use user-selected waveform style (Square, Sine, or Triangle)
  osc.type = userSettings.waveform || type; 
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  // Smooth volume ramping to prevent "popping" sounds
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
    
    // A longer, more complex 8-bit RPG fanfare with chords
    const notes = [
        // 1. Fast upward sweep (single notes)
        { freq: 261.63, delay: 0,   duration: 0.1 },  // C4
        { freq: 392.00, delay: 80,  duration: 0.1 },  // G4
        { freq: 523.25, delay: 160, duration: 0.1 },  // C5
        { freq: 659.25, delay: 240, duration: 0.1 },  // E5
        { freq: 784.00, delay: 320, duration: 0.2 },  // G5

        // 2. F-Major bounce (Chord - 3 notes play at exactly 500ms)
        { freq: 349.23, delay: 500, duration: 0.15 }, // F4
        { freq: 440.00, delay: 500, duration: 0.15 }, // A4
        { freq: 523.25, delay: 500, duration: 0.15 }, // C5

        // 3. G-Major bounce (Chord - 3 notes play at exactly 650ms)
        { freq: 392.00, delay: 650, duration: 0.15 }, // G4
        { freq: 493.88, delay: 650, duration: 0.15 }, // B4
        { freq: 587.33, delay: 650, duration: 0.15 }, // D5

        // 4. Big Triumphant C-Major Resolve (Full 5-note Chord at 850ms)
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
  
// Helpers to set/get the curved label on the spin button's SVG
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
  html += '</colgroup><tr><th></th>';
  subjects.forEach(s => { html += `<th class="subjectHeader" onclick="toggleSubject('${s}')"><span>${s}</span></th>`; });
  html += '</tr>';

  weeks.forEach(w => {
    const isAllowed = allowedWeeks.includes(w);
    const isBlocked = blockedWeeks.includes(w);
    const numClass = isBlocked ? 'blocked' : (isAllowed ? 'active' : '');
    html += `<tr><th class="week-header" data-week="${w}"><button class="weekNumber ${numClass}" data-week="${w}">${w}</button></th>`;
    subjects.forEach(s => {
      let cls = "";
      if (!gridState[s][w] || isBlocked || (w > maxWeek && !isAllowed)) cls = "completed";
      else if (isAllowed && w > maxWeek) cls = "override";
      html += `<td class="${cls}" onclick="toggleCell('${s}',${w})"></td>`;
    });
    html += '</tr>';
  });
  document.getElementById('grid').innerHTML = html + '</table>';
  bindWeekHeaderHandlers();
}

// --- Grid Interaction Helpers ---
function toggleCell(s,w){ gridState[s][w] = !gridState[s][w]; buildGrid(); }
function toggleSubject(s){ const anyOn = weeks.some(w => gridState[s][w]); weeks.forEach(w => gridState[s][w] = !anyOn); buildGrid(); }
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

function toggleGrid(){
  const overlay = document.getElementById("gridOverlay");
  overlay.style.display = (overlay.style.display === "flex") ? "none" : "flex";
  if (overlay.style.display === "flex") buildGrid();
}
/* ==========================================================================
   6. SETTINGS MENU
   ========================================================================== */

function toggleSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay.style.display === 'none') {
        // Load values into the inputs before showing
        document.getElementById('setMute').checked = userSettings.muted;
        document.getElementById('setHaptics').checked = userSettings.haptics;
        document.getElementById('setConfetti').checked = userSettings.confetti;
        document.getElementById('setWaveform').value = userSettings.waveform;
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

// Save settings when the user changes a toggle/dropdown
function updateSettings() {
    userSettings.muted = document.getElementById('setMute').checked;
    userSettings.haptics = document.getElementById('setHaptics').checked;
    userSettings.confetti = document.getElementById('setConfetti').checked;
    userSettings.waveform = document.getElementById('setWaveform').value;
    saveSettings();
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
let reviewSubjectIdx = 0;
let reviewWeekIdx = 0;

function adjustReviewSubject(delta) {
    reviewSubjectIdx = (reviewSubjectIdx + delta + subjects.length) % subjects.length;
    updateReviewDisplay();
    if (userSettings.haptics) navigator.vibrate(10);
}

function adjustReviewWeek(delta) {
    reviewWeekIdx = (reviewWeekIdx + delta + weeks.length) % weeks.length;
    updateReviewDisplay();
    if (userSettings.haptics) navigator.vibrate(10);
}

function updateReviewDisplay() {
    const subject = subjects[reviewSubjectIdx];
    const week = weeks[reviewWeekIdx];
    const lesson = lessonData[subject][week];

    // Update the Reels visually (without the spin animation)
    const subReel = document.getElementById('reviewSubjectReel');
    const weekReel = document.getElementById('reviewWeekReel');
    
    // We reuse your 80px offset logic so it looks "docked" correctly
    subReel.style.transform = `translateY(-${reviewSubjectIdx * 80}px)`;
    weekReel.style.transform = `translateY(-${reviewWeekIdx * 80}px)`;

    // Update the prompt and answer
    document.getElementById('reviewPrompt').textContent = lesson.p;
    document.getElementById('reviewAnswerContent').innerHTML = lesson.a;
    
}
function initReviewMode() {
    const subReel = document.getElementById('reviewSubjectReel');
    const weekReel = document.getElementById('reviewWeekReel');

    subReel.innerHTML = "";
    subjects.forEach(s => {
        const div = document.createElement("div");
        div.innerHTML = `<span>${subjectIcons[s]}</span> <span>${s}</span>`;
        subReel.appendChild(div);
    });

    weekReel.innerHTML = "";
    weeks.forEach(w => {
        const div = document.createElement("div");
        div.textContent = "Week " + w;
        weekReel.appendChild(div);
    });

    reviewSubjectIdx = 0;
    reviewWeekIdx = 0;
    updateReviewDisplay();
}
/* ==========================================================================
   9. Finish / Confetti Helpers
   ========================================================================== */
let confettiAnimationId = null;
let confettiParticles = null;
let confettiResizeHandler = null;
let isConfettiStopping = false; // New flag to control the "fall out"

function finishLesson() {
    if (userSettings.haptics && navigator.vibrate) navigator.vibrate([60,30,60]);
    playVictoryChime(); //
    showDoneOverlay();
}
function showDoneOverlay() {
    const overlay = document.getElementById('doneOverlay');
    if (!overlay) return;
    
    // 1. Force the styles back to normal BEFORE showing it
    // This prevents the bug where the box gets stuck invisible!
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.pointerEvents = 'auto';
    const box = overlay.querySelector('.doneBox');
    if (box) box.style.display = 'block';

    // 2. Show the overlay
    overlay.style.display = 'flex';
    
    // 3. Shoot confetti if enabled
    if (userSettings.confetti) {
        startConfetti();
    }
}
function hideDoneOverlay() {
    isConfettiStopping = true;
    const overlay = document.getElementById('doneOverlay');
    const box = overlay.querySelector('.doneBox');
    
    // Hide the popup box and remove the dark background 
    if (box) box.style.display = 'none';
    overlay.style.background = 'transparent';
    
    // Let taps pass straight through the invisible overlay to the buttons below!
    overlay.style.pointerEvents = 'none'; 

    // SAFETY CATCH: If confetti is turned OFF in settings, there are no 
    // falling pieces to trigger the cleanup, so we must clean it up instantly!
    if (!userSettings.confetti) {
        stopConfetti();
    }
}
function startConfetti() {
    const canvas = document.getElementById('confettiCanvas');
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

    function frame(now) {
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

            // If the particle falls off the bottom of the screen
            if (p.y > canvas.height + 20) {
                // Only loop it back to the top if we aren't stopping
                if (!isConfettiStopping) {
                    p.y = -10;
                    p.x = Math.random() * canvas.width;
                    p.vy = Math.random() * 3 + 2;
                }
            }
        }

        // If we are stopping AND all particles are off the screen, end the animation entirely
        if (isConfettiStopping && parts.every(p => p.y > canvas.height + 20)) {
            stopConfetti();
            return; 
        }

        confettiAnimationId = requestAnimationFrame(frame);
    }
    confettiAnimationId = requestAnimationFrame(frame);
}

function stopConfetti() {
    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
    confettiParticles = null;
    
    if (confettiResizeHandler) {
        window.removeEventListener('resize', confettiResizeHandler);
        confettiResizeHandler = null;
    }
    
    const canvas = document.getElementById('confettiCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Restore the overlay styles back to their defaults for the next time it's triggered
    const overlay = document.getElementById('doneOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.background = 'rgba(0,0,0,0.45)';
        overlay.style.pointerEvents = 'auto';
        const box = overlay.querySelector('.doneBox');
        if (box) box.style.display = 'block';
    }
}
/* ==========================================================================
   10. INPUT & SERVICE WORKER BINDINGS
   ========================================================================== */

function bindHoldButton(id, actionFn){
  const el = document.getElementById(id);
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
            if (confirm("New version available! Update now?")) window.location.reload();
          }
        });
      });
    });
  });
}
