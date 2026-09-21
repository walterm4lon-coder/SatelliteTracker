const terminal = document.getElementById("loadingTerminal");
const status = document.getElementById("loadingStatus");
const loadingScreen = document.getElementById("loadingScreen");

const lines = [
    "[BOOT] INITIALIZING SATELLITE TRACKER",
    "[SYS] LOADING ORBITS",
    "[SYS] CONNECTING TLES",
    "[NET] CALLING ELON FRICKING MUSK FOR STARLINK",
    "[DATA] FETCHING STATION OBJECTS",
    "[DATA] FETCHING DA PLAAAAAAAANET",
    "[DATA] FETCHING GPS HOLY HELL THEIR PATHS ARE WEIRD",
    "[DATA] FETCHING STARLINK, BUT ELON SOMETIMES DOESNT ANSWER",
    "[CORE] LOADING SOMETHING",
    "[CORE] COMPUTING SOMETHING",
    "[CORE] INITIALIZING EARTH REFERENCE FRAME",
    "[GL] STARTING RENDERING",
    "[GL] COMPILING GLOBE SHADERS",
    "[GL] LOADING EARTH TEXTURE",
    "[GL] GENERATING ALL THESE DOPE STARS",
    "[GL] CONFIGURING CAMERA",
    "[SYS] LOOKING AT TTRIPPLE T FOR SUPPORT",
    "[SYS] I DUNNO WHAT I WANT IN THIS ONE",
    "[SYS] HONESTLY I DONT KNOW WHAT IM TYPING ANYMORE",
    "[CORE] SO YEAH UM COOL PROJECT",
    "[CORE] WHY THE HELL ARE YOU READING THIS?",
    "[TRACK] OKAY IF YOU READ THIS THAN ONLY YOU WILL KNOW THAT I LOOVE DOGS..",
    "[TRACK] ... MORE THAN CATS, CAN YOU IMAGINE",
    "[MEM] RUNNING SOMETHING AGAIN",
    "[SYS] DIAGNOSTING EVERYTHING, WAIT PLEASE"
];

let running = true;
let lineIndex = 0;

function addLine(text) {
    const line = document.createElement("div");
    line.className = "loadingLine";
    line.textContent = "> " + text;

    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function runLoader() {
    if (!running) return;

    if (lineIndex < lines.length) {
        addLine(lines[lineIndex]);
        lineIndex++;
    } else {
        lineIndex = 0;
    }

    setTimeout(runLoader, 80);
}

runLoader();

window.finishLoader = function () {
    if (!running) return;

    running = false;
    status.textContent = "SYSTEM READY";

    addLine("[SYS] INITIALIZATION COMPLETE");
    addLine("[SYS] STARTING TRACKING INTERFACE");

    setTimeout(() => {
        loadingScreen.classList.add("hidden");

        setTimeout(() => {
            loadingScreen.style.display = "none";
        }, 500);
    }, 600);
};