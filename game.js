const X = "X";
const O = "O";
const EMPTY = "";

const WIN_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],   // แก้แล้ว: เดิมพิมพ์เป็น [0, 4, 6]
    [2, 4, 6]
];

const FLY_MS = 700;   // เวลาที่แมลงวันใช้บินไปที่ช่อง

let board = Array(9).fill(EMPTY);
let memory = {};
let history = [];

let humanSymbol = X;
let aiSymbol = O;

let humanTurn = true;
let gameOver = false;
let thinking = false;
let flying = false;
let gameId = 0;       // ใช้ยกเลิก timer ของเกมเก่าเมื่อกดเล่นใหม่

let score = {
    human: 0,
    ai: 0,
    draw: 0
};

const game = document.getElementById("game");
const cells = document.querySelectorAll(".cell");
const statusText = document.getElementById("status");
const memoryText = document.getElementById("memory");

const humanScore = document.getElementById("humanScore");
const aiScore = document.getElementById("aiScore");
const drawScore = document.getElementById("drawScore");

const fly = document.getElementById("fly");
const flyStage = document.getElementById("flyStage");
const newGameButton = document.getElementById("newGame");
const soundBtn = document.getElementById("soundBtn");


/* =====================================================
   SOUND (Web Audio API - ไม่ต้องใช้ไฟล์เสียง)
   ===================================================== */

let soundOn = true;
let audioCtx = null;

try {
    soundOn = localStorage.getItem("ninjuay_sound") !== "off";
} catch (error) {
    soundOn = true;
}

function updateSoundButton() {
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
}

function getAudio() {
    if (!soundOn) {
        return null;
    }

    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;

        if (!AC) {
            return null;
        }

        audioCtx = new AC();
    }

    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }

    return audioCtx;
}

function tone(freq, duration, type = "sine", volume = 0.12, delay = 0) {
    const ctx = getAudio();

    if (!ctx) {
        return;
    }

    const start = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
}

// เสียงแมลงวันบิน: คลื่นฟันเลื่อย + สั่นเร็ว (tremolo) + โยกความถี่นิดหน่อย
function playBuzz(seconds = 0.8) {
    const ctx = getAudio();

    if (!ctx) {
        return;
    }

    const t = ctx.currentTime;
    const end = t + seconds;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.linearRampToValueAtTime(250, t + seconds * 0.5);
    osc.frequency.linearRampToValueAtTime(200, end);

    // โยกความถี่ ทำให้เสียงดูมีชีวิต
    const vibrato = ctx.createOscillator();
    const vibratoGain = ctx.createGain();
    vibrato.frequency.value = 9;
    vibratoGain.gain.value = 14;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.8;

    // tremolo = เสียงสั่นถี่ ๆ เหมือนปีกกระพือ
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.6;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "square";
    lfo.frequency.value = 62;
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain);
    lfoGain.connect(tremolo.gain);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.2, t + 0.06);
    envelope.gain.setValueAtTime(0.2, end - 0.12);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(filter);
    filter.connect(tremolo);
    tremolo.connect(envelope);
    envelope.connect(ctx.destination);

    [osc, vibrato, lfo].forEach(node => {
        node.start(t);
        node.stop(end + 0.05);
    });
}

function playSound(kind) {
    if (kind === "move") {
        tone(650, 0.06, "square", 0.07);
    } else if (kind === "land") {
        tone(300, 0.07, "triangle", 0.12);
        tone(450, 0.05, "triangle", 0.08, 0.04);
    } else if (kind === "win") {
        tone(700, 0.12, "triangle", 0.14, 0);
        tone(900, 0.14, "triangle", 0.14, 0.12);
        tone(1100, 0.22, "triangle", 0.14, 0.26);
    } else if (kind === "lose") {
        tone(500, 0.16, "sawtooth", 0.1, 0);
        tone(350, 0.26, "sawtooth", 0.1, 0.16);
    } else if (kind === "draw") {
        tone(550, 0.12, "triangle", 0.12, 0);
        tone(550, 0.12, "triangle", 0.12, 0.16);
    }
}

soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;

    try {
        localStorage.setItem("ninjuay_sound", soundOn ? "on" : "off");
    } catch (error) {
        // ไม่เป็นไร ถ้าเก็บค่าไม่ได้
    }

    updateSoundButton();

    if (soundOn) {
        playSound("move");
    }
});

updateSoundButton();


/* =====================================================
   FLY MOVEMENT
   ===================================================== */

function centerOf(element) {
    const g = game.getBoundingClientRect();
    const r = element.getBoundingClientRect();

    return {
        x: r.left - g.left + r.width / 2,
        y: r.top - g.top + r.height / 2
    };
}

function homePoint() {
    const p = centerOf(flyStage);

    return { x: p.x, y: p.y - 8 };
}

function flyTo(x, y, ms = FLY_MS) {
    fly.style.transitionDuration = `${ms}ms`;
    fly.style.left = `${x}px`;
    fly.style.top = `${y}px`;
}

function flyInstant(x, y) {
    fly.style.transition = "none";
    fly.style.left = `${x}px`;
    fly.style.top = `${y}px`;

    // บังคับให้เบราว์เซอร์คำนวณตำแหน่งก่อน แล้วค่อยเปิด transition กลับ
    void fly.offsetWidth;

    fly.style.transition = "";
}

function flyHome(ms = 800) {
    const p = homePoint();

    flyTo(p.x, p.y, ms);
}

function setFlyMode(mode) {
    fly.classList.remove("flying", "happy", "sad");

    if (mode) {
        fly.classList.add(mode);
    }
}

// แมลงวันบินเล่นในเวทีตอนว่าง ๆ
function wander() {
    if (flying || thinking || gameOver) {
        return;
    }

    const g = game.getBoundingClientRect();
    const s = flyStage.getBoundingClientRect();

    const left = s.left - g.left + 34;
    const right = s.right - g.left - 34;
    const top = s.top - g.top + 24;
    const bottom = s.bottom - g.top - 30;

    const x = left + Math.random() * (right - left);
    const y = top + Math.random() * (bottom - top);

    flyTo(x, y, 900);
}

setInterval(wander, 1800);

window.addEventListener("resize", () => {
    if (!flying) {
        const p = homePoint();

        flyInstant(p.x, p.y);
    }
});


/* =====================================================
   GAME LOGIC
   ===================================================== */

function stateKey(board) {
    return board.map(value => value || "-").join("");
}


function winner(board) {
    for (const [a, b, c] of WIN_LINES) {
        if (
            board[a] &&
            board[a] === board[b] &&
            board[a] === board[c]
        ) {
            return board[a];
        }
    }

    if (board.every(value => value !== EMPTY)) {
        return "DRAW";
    }

    return null;
}


function winningLine(board) {
    for (const line of WIN_LINES) {
        const [a, b, c] = line;

        if (
            board[a] &&
            board[a] === board[b] &&
            board[a] === board[c]
        ) {
            return line;
        }
    }

    return null;
}


function getMoveValue(board, move) {
    const values = memory[stateKey(board)];

    if (Array.isArray(values) && values.length === 9) {
        const value = Number(values[move]);

        return Number.isFinite(value) ? value : 0;
    }

    if (values && typeof values === "object") {
        const value = Number(values[String(move)]);

        return Number.isFinite(value) ? value : 0;
    }

    return 0;
}


function winningMove(board, player) {
    for (let move = 0; move < 9; move++) {
        if (board[move] !== EMPTY) {
            continue;
        }

        board[move] = player;

        const result = winner(board);

        board[move] = EMPTY;

        if (result === player) {
            return move;
        }
    }

    return null;
}


function aiMove(board, aiSymbol) {
    const available = [];

    for (let i = 0; i < 9; i++) {
        if (board[i] === EMPTY) {
            available.push(i);
        }
    }

    if (available.length === 0) {
        return null;
    }

    const winMove = winningMove(board, aiSymbol);

    if (winMove !== null) {
        return winMove;
    }

    const humanSymbol = aiSymbol === X ? O : X;

    const blockMove = winningMove(board, humanSymbol);

    if (blockMove !== null) {
        return blockMove;
    }

    const scored = available.map(move => ({
        move: move,
        value: getMoveValue(board, move)
    }));

    const bestValue = Math.max(
        ...scored.map(item => item.value)
    );

    const bestMoves = scored
        .filter(item =>
            Math.abs(item.value - bestValue) < 0.000001
        )
        .map(item => item.move);

    if (bestValue === 0) {
        const preferred = [4, 0, 2, 6, 8]
            .filter(move => available.includes(move));

        if (preferred.length > 0) {
            return preferred[
                Math.floor(Math.random() * preferred.length)
            ];
        }
    }

    return bestMoves[
        Math.floor(Math.random() * bestMoves.length)
    ];
}


function render() {
    cells.forEach((cell, index) => {
        const value = board[index];

        cell.textContent = value;

        cell.classList.remove("o");
        cell.classList.remove("win");

        if (value === O) {
            cell.classList.add("o");
        }
    });

    const line = winningLine(board);

    if (line) {
        line.forEach(index => {
            cells[index].classList.add("win");
        });
    }

    memoryText.textContent =
        `🧠 Ninjuay (Fly, แมลง) Memory: ${Object.keys(memory).length.toLocaleString()} states`;

    humanScore.textContent = score.human;
    aiScore.textContent = score.ai;
    drawScore.textContent = score.draw;
}


function popCell(index) {
    const cell = cells[index];

    cell.classList.remove("pop");
    void cell.offsetWidth;
    cell.classList.add("pop");
}


function saveLocalMemory() {
    try {
        localStorage.setItem(
            "ninjuay_memory",
            JSON.stringify(memory)
        );
    } catch (error) {
        console.log("Memory save failed:", error);
    }
}


function loadLocalMemory() {
    try {
        const saved = localStorage.getItem("ninjuay_memory");

        if (saved) {
            const data = JSON.parse(saved);

            if (data && typeof data === "object") {
                memory = data;
            }
        }
    } catch (error) {
        console.log("Memory load failed:", error);
    }
}


function learn(result) {
    let reward;

    if (result === aiSymbol) {
        reward = 1.0;
    } else if (result === "DRAW") {
        reward = 0.3;
    } else {
        reward = -1.0;
    }

    const total = history.length;

    history.forEach((item, index) => {
        const key = item.key;
        const move = item.move;

        if (
            !Array.isArray(memory[key]) ||
            memory[key].length !== 9
        ) {
            memory[key] = Array(9).fill(0);
        }

        const age = total - index;

        const credit =
            reward * Math.pow(0.8, Math.max(0, age - 1));

        memory[key][move] += credit;

        memory[key][move] = Math.max(
            -10,
            Math.min(10, memory[key][move])
        );
    });

    saveLocalMemory();
}


function setStatus(text) {
    statusText.textContent = text;
}


function humanClick(index) {
    if (gameOver) {
        return;
    }

    if (thinking) {
        return;
    }

    if (!humanTurn) {
        return;
    }

    if (board[index] !== EMPTY) {
        return;
    }

    board[index] = humanSymbol;

    playSound("move");
    render();
    popCell(index);

    const result = winner(board);

    if (result) {
        finish(result);
        return;
    }

    humanTurn = false;
    thinking = true;

    setStatus("🪰 Ninjuay (Fly, แมลง) กำลังคิด...");

    const id = gameId;

    setTimeout(() => {
        if (id === gameId) {
            aiTurn();
        }
    }, 450);
}


function aiTurn() {
    if (gameOver) {
        return;
    }

    const id = gameId;
    const key = stateKey(board);

    const move = aiMove(
        board,
        aiSymbol
    );

    if (move === null) {
        finish("DRAW");
        return;
    }

    history.push({
        key: key,
        move: move
    });

    const targetCell = cells[move];

    // ไฮไลต์ช่องที่แมลงวันเลือก แล้วบินไปที่ช่องนั้นเลย
    targetCell.classList.add("target");

    setStatus(
        `🪰 Ninjuay (Fly, แมลง) เลือกช่อง ${move + 1} แล้ว กำลังบินไป...`
    );

    flying = true;
    setFlyMode("flying");
    playBuzz(FLY_MS / 1000 + 0.1);

    const p = centerOf(targetCell);

    flyTo(p.x, p.y, FLY_MS);

    setTimeout(() => {
        if (id !== gameId || gameOver) {
            return;
        }

        // ถึงช่องแล้ว: วางตัว X/O
        targetCell.classList.remove("target");
        setFlyMode(null);

        board[move] = aiSymbol;

        playSound("land");
        render();
        popCell(move);

        const result = winner(board);

        if (result) {
            finish(result);
            return;
        }

        humanTurn = true;
        thinking = false;

        setStatus(
            `ตาคุณ (${humanSymbol})`
        );

        // อยู่บนช่องแป๊บหนึ่ง แล้วบินกลับบ้าน
        setTimeout(() => {
            if (id !== gameId || gameOver) {
                return;
            }

            flying = false;
            flyHome(800);
        }, 450);

    }, FLY_MS + 60);
}


function finish(result) {
    const id = gameId;

    gameOver = true;
    thinking = false;

    learn(result);

    if (result === humanSymbol) {
        score.human++;

        setStatus(
            "YOU WIN! 🪰💥"
        );

        playSound("win");

    } else if (result === aiSymbol) {
        score.ai++;

        setStatus(
            "NINJUAY (Fly, แมลง) WINS! 🪰🔥"
        );

        playSound("lose");

    } else {
        score.draw++;

        setStatus(
            "DRAW! 🪰"
        );

        playSound("draw");
    }

    render();

    // แมลงวันบินกลับบ้านแล้วทำท่าตามผล
    setTimeout(() => {
        if (id !== gameId) {
            return;
        }

        flying = false;
        flyHome(700);

        setTimeout(() => {
            if (id !== gameId) {
                return;
            }

            if (result === aiSymbol) {
                setFlyMode("happy");
            } else if (result === humanSymbol) {
                setFlyMode("sad");
            }
        }, 700);
    }, 450);
}


function newGame() {
    gameId++;

    const id = gameId;

    board = Array(9).fill(EMPTY);
    history = [];

    gameOver = false;
    thinking = false;
    flying = false;

    cells.forEach(cell => {
        cell.classList.remove("target");
        cell.classList.remove("pop");
    });

    setFlyMode(null);

    const home = homePoint();

    flyInstant(home.x, home.y);

    if (Math.random() < 0.5) {
        humanSymbol = X;
        aiSymbol = O;
        humanTurn = true;

        setStatus(
            "🎲 RNG: คุณเริ่มก่อน • คุณ = X • Ninjuay = O"
        );

    } else {
        humanSymbol = O;
        aiSymbol = X;
        humanTurn = false;
        thinking = true;

        setStatus(
            "🎲 RNG: Ninjuay เริ่มก่อน • คุณ = O • Ninjuay = X"
        );

        setTimeout(() => {
            if (id === gameId) {
                aiTurn();
            }
        }, 700);
    }

    render();
}


cells.forEach(cell => {
    cell.addEventListener("click", () => {
        const index = Number(cell.dataset.index);

        humanClick(index);
    });
});


newGameButton.addEventListener(
    "click",
    newGame
);


async function loadMemoryFile() {
    try {
        const response = await fetch("fly_memory.json");

        if (!response.ok) {
            throw new Error("Memory file not found");
        }

        const data = await response.json();

        if (data && typeof data === "object") {
            memory = data;
        }

    } catch (error) {
        console.log(
            "ไม่สามารถโหลด fly_memory.json ได้"
        );
    }

    loadLocalMemory();

    render();

    newGame();
}


loadMemoryFile();
