/* ==========================================================================
   SCRIPTURE SONG DATABASE
   ========================================================================== */
const scriptureData = {
    1: {
        title: "Exodus 20: 1-17",
        desc: "The Ten Commandments",
        audio: "audio/c1/scripture/Exodus 20.m4a",
        lyrics: [
            { week: 1, time: 0.0, text: "And God spake all these words, saying," },
            // Add Cycle 1 timestamps here...
        ]
    },
    2: {
        title: "Genesis 1: 1-27",
        desc: "The Creation Story",
        audio: "audio/c2/scripture/Genesis 1 1-27.m4a",
        lyrics: [
            { week: 1, time: 3.0, text: "1 In the beginning God created the heaven and the earth." },
            { week: 1, time: 9.0, text: "2 And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters." },
            { week: 2, time: 19.0, text: "3 And God said, Let there be light: and there was light." },
            { week: 2, time: 23.0, text: "4 And God saw the light, that it was good: and God divided the light from the darkness." },
            { week: 3, time: 30.0, text: "5 And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day." },
            { week: 4, time: 40.0, text: "6 And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters." },
            { week: 5, time: 51.0, text: "7 And God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament: and it was so." },
            { week: 5, time: 65.0, text: "8 And God called the firmament Heaven. And the evening and the morning were the second day." },
            { week: 6, time: 74.0, text: "9 And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so." },
            { week: 7, time: 87.0, text: "10 And God called the dry land Earth; and the gathering together of the waters called he Seas: and God saw that it was good." },
            { week: 8, time: 102.0, text: "11 And God said, Let the earth bring forth grass, the herb yielding seed, and the fruit tree yielding fruit after his kind, whose seed is in itself, upon the earth: and it was so." },
            { week: 9, time: 114.0, text: "12 And the earth brought forth grass, and herb yielding seed after his kind, and the tree yielding fruit, whose seed was in itself, after his kind: and God saw that it was good." },
            { week: 10, time: 126.0, text: "13 And the evening and the morning were the third day." },
            { week: 10, time: 132.0, text: "14 And God said, Let there be lights in the firmament of the heaven to divide the day from the night; and let them be for signs, and for seasons, and for days, and years:" },
            { week: 11, time: 147.0, text: "15 And let them be for lights in the firmament of the heaven to give light upon the earth: and it was so." },
            { week: 13, time: 155.0, text: "16 And God made two great lights; the greater light to rule the day, and the lesser light to rule the night: he made the stars also." },
            { week: 13, time: 169.0, text: "17 And God set them in the firmament of the heaven to give light upon the earth," },
            { week: 14, time: 176.0, text: "18 And to rule over the day and over the night, and to divide the light from the darkness: and God saw that it was good." },
            { week: 15, time: 190.0, text: "19 And the evening and the morning were the fourth day." },
            { week: 15, time: 196.0, text: "20 And God said, Let the waters bring forth abundantly the moving creature that hath life, and fowl that may fly above the earth in the open firmament of heaven." },
            { week: 16, time: 213.0, text: "21 And God created great whales, and every living creature that moveth, which the waters brought forth abundantly, after their kind, and every winged fowl after his kind: and God saw that it was good." },
            { week: 17, time: 235.0, text: "22 And God blessed them, saying, Be fruitful, and multiply, and fill the waters in the seas, and let fowl multiply in the earth." },
            { week: 18, time: 249.0, text: "23 And the evening and the morning were the fifth day." },
            { week: 18, time: 254.0, text: "24 And God said, Let the earth bring forth the living creature after his kind, cattle, and creeping thing, and beast of the earth after his kind: and it was so." },
            { week: 19, time: 268.0, text: "25 And God made the beast of the earth after his kind, and cattle after their kind, and every thing that creepeth upon the earth after his kind: and God saw that it was good." },
            { week: 20, time: 285.0, text: "26 And God said, Let us make man in our image, after our likeness: and let them have dominion over the fish of the sea, and over the fowl of the air, and over the cattle, and over all the earth, and over every creeping thing that creepeth upon the earth." },
            { week: 21, time: 310.0, text: "27 So God created man in his own image, in the image of God created he him; male and female created he them." },
        ]
    },
    3: {
            title: "John 1: 1-7",
            desc: "In the beginning was the Word",
            audio: "audio/c3/scripture/John 1.m4a",
            lyrics: [
                { week: 1, time: 0.0, text: "In the beginning was the Word," },
                // Add Cycle 3 timestamps here...
            ]
        }
    };
/* ==========================================================================
   SCRIPTURE KARAOKE ENGINE
   ========================================================================== */
let scriptureAudio = new Audio();
let scriptureActiveLine = -1;

// Updates the Focus Menu button text
function updateScriptureButtonUI() {
    const titleEl = document.getElementById('scriptureBtnTitle');
    const descEl = document.getElementById('scriptureBtnDesc');
    if (titleEl && descEl && scriptureData[currentCycle]) {
        titleEl.textContent = scriptureData[currentCycle].title;
        descEl.textContent = scriptureData[currentCycle].desc;
    }
}

function openScriptureMenu() {
    document.getElementById('challengeContainer').classList.remove('active');
    document.getElementById('scriptureContainer').classList.add('active');
    activeChallengePage = 'scriptureContainer';
    
    // Load the correct audio file for the current cycle
    scriptureAudio.src = scriptureData[currentCycle].audio; 
    
    buildScriptureLyrics();
}

function exitScriptureMenu() {
    scriptureAudio.pause();
    document.getElementById('scriptureContainer').classList.remove('active');
    document.getElementById('challengeContainer').classList.add('active');
    activeChallengePage = 'challengeContainer';
}

function toggleScriptureAudio() {
    const playBtn = document.getElementById('scripturePlayBtn');
    if (scriptureAudio.paused) {
        scriptureAudio.play();
        playBtn.innerHTML = `⏸ Pause`;
    } else {
        scriptureAudio.pause();
        playBtn.innerHTML = `▶ Play`;
    }
}

function buildScriptureLyrics() {
    const container = document.getElementById('scriptureLyricsContainer');
    container.innerHTML = "";
    
    const currentLyrics = scriptureData[currentCycle].lyrics;
    
    currentLyrics.forEach((line, index) => {
        const div = document.createElement('div');
        div.className = 'lyric-line';
        div.id = `lyric-${index}`;
        div.textContent = line.text;
        
        div.onclick = () => {
            scriptureAudio.currentTime = line.time;
            if (scriptureAudio.paused) toggleScriptureAudio();
        };
        
        container.appendChild(div);
    });
    
    const spacer = document.createElement('div');
    spacer.style.height = "50vh";
    container.appendChild(spacer);
}

// THE KARAOKE TRACKER
scriptureAudio.addEventListener('timeupdate', () => {
    const currentTime = scriptureAudio.currentTime;
    const selectedWeek = parseInt(document.getElementById('scriptureWeekSelect').value);
    const currentLyrics = scriptureData[currentCycle].lyrics;
    
    // 1. Auto-Pause Logic
    const nextLine = currentLyrics.find(line => line.time > currentTime);
    if (nextLine && nextLine.week > selectedWeek && currentTime >= nextLine.time - 0.2) {
        scriptureAudio.pause();
        document.getElementById('scripturePlayBtn').innerHTML = `▶ Play`;
        scriptureAudio.currentTime = nextLine.time - 0.2; 
        return;
    }

    // 2. Find the active line
    let newActiveLine = -1;
    for (let i = currentLyrics.length - 1; i >= 0; i--) {
        if (currentTime >= currentLyrics[i].time) {
            newActiveLine = i;
            break;
        }
    }

    // 3. Animate and scroll
    if (newActiveLine !== scriptureActiveLine && newActiveLine !== -1) {
        if (scriptureActiveLine !== -1) {
            const oldEl = document.getElementById(`lyric-${scriptureActiveLine}`);
            if (oldEl) oldEl.classList.remove('active');
        }
        
        scriptureActiveLine = newActiveLine;
        const newEl = document.getElementById(`lyric-${scriptureActiveLine}`);
        
        if (newEl) {
            newEl.classList.add('active');
            newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
});

scriptureAudio.addEventListener('ended', () => {
    document.getElementById('scripturePlayBtn').innerHTML = `▶ Play`;
});