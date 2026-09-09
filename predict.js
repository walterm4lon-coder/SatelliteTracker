import * as satellite from "https://cdn.jsdelivr.net/npm/satellite.js/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client/+esm";
import { geoContains } from "https://cdn.jsdelivr.net/npm/d3-geo/+esm";

const TLE_GROUPS = [
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=TLE", limit: null },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=TLE", limit: 20 },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=TLE", limit: 20 },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE", limit: 20 },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=TLE", limit: 20 }
];


// since i want to see them above the horizon
const MIN_ELEVATION = 40;
const WINDOW_HOURS = 24;
// how often satellites position
const STEP_SECONDS = 30;
let landFeature = null;

async function loadLand() {
    const response = await fetch("https://unpkg.com/world-atlas@2/land-110m.json");
    const topology = await response.json();
    landFeature = feature(topology, topology.objects.land);
}

function isOnLand(lat, lng) {
    return geoContains(landFeature, [lng, lat]);
}

function parseTLEBlock(text) {
    const lines = text.trim().split("\n");
    const satellites = [];

    for (let i = 0; i < lines.length; i += 3) {
        const name = lines[i].trim();
        const line1 = lines[i + 1];
        const line2 = lines[i + 2];
        if (!line1 || !line2) continue;

        satellites.push({
            name: name,
            satrec: satellite.twoline2satrec(line1, line2)
        });
    }

    return satellites;
}

async function fetchGroup(group) {
    const response = await fetch(group.url);
    const text = await response.text();
    const sats = parseTLEBlock(text);
    return group.limit ? sats.slice(0, group.limit) : sats;
}

async function fetchAllSatellites() {
    let all = [];
    for (const group of TLE_GROUPS) {
        const sats = await fetchGroup(group);
        all = all.concat(sats);
    }
    return all;
}

function findPasses(satellites, observerGd) {
    const passes = [];
    const now = new Date();
    const totalSteps = (WINDOW_HOURS * 3600) / STEP_SECONDS;

    for (const satEntry of satellites) {
        let currentPass = null;

        for (let i = 0; i <= totalSteps; i++) {
            const time = new Date(now.getTime() + i * STEP_SECONDS * 1000);
            const positionAndVelocity = satellite.propagate(satEntry.satrec, time);
            if (!positionAndVelocity.position) continue;

            const gmst = satellite.gstime(time);
            const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
            const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
            const elevationDeg = satellite.radiansToDegrees(lookAngles.elevation);

            if (elevationDeg >= MIN_ELEVATION) {
                if (!currentPass) {
                    currentPass = {
                        name: satEntry.name,
                        start: time,
                        maxElevation: elevationDeg
                    };
                } else if (elevationDeg > currentPass.maxElevation) {
                    currentPass.maxElevation = elevationDeg;
                }
                currentPass.end = time;
            } else if (currentPass) {
                passes.push(currentPass);
                currentPass = null;
            }
        }

        if (currentPass) passes.push(currentPass);
    }

    passes.sort((a, b) => a.start - b.start);
    return passes;
}

function renderPasses(passes, passesList, passesPanel) {
    passesList.innerHTML = "";

    if (passes.length === 0) {
        passesList.innerHTML = "<p>No passes found in the next 24 hours.</p>";
    } else {
        for (const pass of passes) {
            const item = document.createElement("div");
            item.className = "passItem";
            item.innerHTML = `
                <strong>${pass.name}</strong><br>
                Start: ${pass.start.toLocaleTimeString()}<br>
                Max elevation: ${pass.maxElevation.toFixed(0)}°
            `;
            passesList.appendChild(item);
        }
    }

    passesPanel.classList.add("open");
}

async function main() {
    const instructionLabel = document.getElementById("instructionLabel");
    const passesPanel = document.getElementById("passesPanel");
    const passesList = document.getElementById("passesList");

    const myGlobe = Globe()(document.getElementById("globeViz"))
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
        .backgroundColor("#000000")
        .width(window.innerWidth)
        .height(window.innerHeight)
        .pointColor(() => "cyan")
        .pointRadius(0.4)
        .pointAltitude(0.01);

    let satellites = [];
    try {
        [satellites] = await Promise.all([fetchAllSatellites(), loadLand()]);
        instructionLabel.textContent = "Select your location";
    } catch (err) {
        console.error("Failed to load data:", err);
        instructionLabel.textContent = "Failed to load data — check console (F12)";
        return;
    }

    myGlobe.onGlobeClick(({ lat, lng }) => {
        if (!isOnLand(lat, lng)) {
            instructionLabel.textContent = "Please click on land, not ocean";
            return;
        }

        myGlobe.pointsData([{ lat, lng }]);

        instructionLabel.textContent = `Calculating passes for ${lat.toFixed(2)}, ${lng.toFixed(2)}...`;

        const observerGd = {
            longitude: satellite.degreesToRadians(lng),
            latitude: satellite.degreesToRadians(lat),
            height: 0
        };

        setTimeout(() => {
            const passes = findPasses(satellites, observerGd);
            renderPasses(passes, passesList, passesPanel);
            instructionLabel.textContent = `Location: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
        }, 0);
    });
}

main();