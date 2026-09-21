import * as satellite from "https://cdn.jsdelivr.net/npm/satellite.js/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client/+esm";
import { geoContains } from "https://cdn.jsdelivr.net/npm/d3-geo/+esm";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.179.0/build/three.module.js";

const TLE_GROUPS = [
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=TLE", limit: null, visualCandidate: true },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=TLE", limit: 20, visualCandidate: true },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=TLE", limit: 20, visualCandidate: false },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE", limit: 20, visualCandidate: false },
    { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=TLE", limit: 20, visualCandidate: false }
];

const MIN_ELEVATION = 0;
const MIN_ELEVATION_VISIBLE = 10;
const SUN_ELEVATION_DARK_THRESHOLD = -6;

const EARTH_RADIUS_KM = 6371;
const AU_KM = 149597870;

const WINDOW_HOURS = 24;
const STEP_SECONDS = 30;

let landFeature = null;

function createStarsField() {
    if (typeof THREE === "undefined") {
        console.warn("THREE is not available — skipping star field");
        return null;
    }

    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        sizeAttenuation: false
    });

    const starsVertices = [];
    for (let i = 0; i < 2000; i++) {
        const x = (Math.random() - 0.5) * 3000;
        const y = (Math.random() - 0.5) * 3000;
        const z = (Math.random() - 0.5) * 3000;
        starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starsVertices), 3));
    return new THREE.Points(starsGeometry, starsMaterial);
}



async function loadLand() {
    const response = await fetch("https://unpkg.com/world-atlas@2/land-110m.json");
    const topology = await response.json();
    landFeature = feature(topology, topology.objects.land);
}

function isOnLand(lat, lng) {
    return geoContains(landFeature, [lng, lat]);
}

function parseTLEBlock(text, visualCandidate) {
    const lines = text.trim().split("\n");
    const satellites = [];

    for (let i = 0; i < lines.length; i += 3) {
        const name = lines[i].trim();
        const line1 = lines[i + 1];
        const line2 = lines[i + 2];
        if (!line1 || !line2) continue;

        satellites.push({
            name: name,
            satrec: satellite.twoline2satrec(line1, line2),
            visualCandidate: visualCandidate
        });
    }

    return satellites;
}

async function fetchGroup(group) {
    try {
        const response = await fetch(group.url);
        if (!response.ok) {
            console.warn(`Skipping ${group.url} — server responded with ${response.status}`);
            return [];
        }
        const text = await response.text();
        const sats = parseTLEBlock(text, group.visualCandidate);
        return group.limit ? sats.slice(0, group.limit) : sats;
    } catch (err) {
        console.warn(`Skipping ${group.url} — request failed:`, err);
        return [];
    }
}

async function fetchAllSatellites() {
    const groups = await Promise.all(
        TLE_GROUPS.map(group => fetchGroup(group))
    );

    return groups.flat();
}

function mod(x, m) {
    return ((x % m) + m) % m;
}

function sunEci(time) {
    const julianDate = time.getTime() / 86400000 + 2440587.5;
    const daysSinceJ2000 = julianDate - 2451545.0;

    const meanLongitude = mod(280.460 + 0.9856474 * daysSinceJ2000, 360);
    const meanAnomaly = satellite.degreesToRadians(mod(357.528 + 0.9856003 * daysSinceJ2000, 360));

    const eclipticLongitude = satellite.degreesToRadians(
        meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)
    );
    const obliquity = satellite.degreesToRadians(23.439 - 0.0000004 * daysSinceJ2000);

    return {
        x: AU_KM * Math.cos(eclipticLongitude),
        y: AU_KM * Math.cos(obliquity) * Math.sin(eclipticLongitude),
        z: AU_KM * Math.sin(obliquity) * Math.sin(eclipticLongitude)
    };
}

function isSatelliteIlluminated(satEci, sunEciPos) {
    const sunDist = Math.sqrt(sunEciPos.x ** 2 + sunEciPos.y ** 2 + sunEciPos.z ** 2);
    const sunUnit = {
        x: sunEciPos.x / sunDist,
        y: sunEciPos.y / sunDist,
        z: sunEciPos.z / sunDist
    };

    const along = satEci.x * sunUnit.x + satEci.y * sunUnit.y + satEci.z * sunUnit.z;

    const satDist = Math.sqrt(satEci.x ** 2 + satEci.y ** 2 + satEci.z ** 2);
    const perpendicularDist = Math.sqrt(Math.max(satDist ** 2 - along ** 2, 0));

    const inShadow = along < 0 && perpendicularDist < EARTH_RADIUS_KM;
    return !inShadow;
}

function updatePassTracker(currentPass, isActive, satEntry, time, elevationDeg, resultsArray, isFirstStep) {
    if (isActive) {
        if (!currentPass) {
            currentPass = {
                name: satEntry.name,
                satrec: satEntry.satrec,
                start: time,
                maxElevation: elevationDeg,
                alreadyUp: isFirstStep
            };
        } else if (elevationDeg > currentPass.maxElevation) {
            currentPass.maxElevation = elevationDeg;
        }
        currentPass.end = time;
        return currentPass;
    }

    if (currentPass) resultsArray.push(currentPass);
    return null;
}

function findPasses(satellites, observerGd) {
    const now = new Date();
    const totalSteps = (WINDOW_HOURS * 3600) / STEP_SECONDS;

    const allPasses = [];
    const visiblePasses = [];
    const currentAllPass = new Array(satellites.length).fill(null);
    const currentVisiblePass = new Array(satellites.length).fill(null);

    for (let i = 0; i <= totalSteps; i++) {
        const time = new Date(now.getTime() + i * STEP_SECONDS * 1000);
        const gmst = satellite.gstime(time);

        const sunPosEci = sunEci(time);
        const sunEcf = satellite.eciToEcf(sunPosEci, gmst);
        const sunLookAngles = satellite.ecfToLookAngles(observerGd, sunEcf);
        const sunElevationDeg = satellite.radiansToDegrees(sunLookAngles.elevation);
        const observerIsDark = sunElevationDeg < SUN_ELEVATION_DARK_THRESHOLD;

        for (let s = 0; s < satellites.length; s++) {
            const satEntry = satellites[s];
            const positionAndVelocity = satellite.propagate(satEntry.satrec, time);
            if (!positionAndVelocity.position) continue;

            const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
            const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
            const elevationDeg = satellite.radiansToDegrees(lookAngles.elevation);

            const aboveHorizon = elevationDeg >= MIN_ELEVATION;
            const trulyVisible =
                satEntry.visualCandidate &&
                elevationDeg >= MIN_ELEVATION_VISIBLE &&
                observerIsDark &&
                isSatelliteIlluminated(positionAndVelocity.position, sunPosEci);

            currentAllPass[s] = updatePassTracker(
                currentAllPass[s], aboveHorizon, satEntry, time, elevationDeg, allPasses, i === 0
            );
            currentVisiblePass[s] = updatePassTracker(
                currentVisiblePass[s], trulyVisible, satEntry, time, elevationDeg, visiblePasses, i === 0
            );
        }
    }

    for (let s = 0; s < satellites.length; s++) {
        if (currentAllPass[s]) allPasses.push(currentAllPass[s]);
        if (currentVisiblePass[s]) visiblePasses.push(currentVisiblePass[s]);
    }

    allPasses.sort((a, b) => a.start - b.start);
    visiblePasses.sort((a, b) => a.start - b.start);

    return { allPasses, visiblePasses };
}

function getOrbitPath(satrec) {
    const now = new Date();
    const points = [];

    const periodMinutes = (2 * Math.PI) / satrec.no;
    const steps = 90;

    for (let i = 0; i <= steps; i++) {
        const m = -periodMinutes / 2 + (i / steps) * periodMinutes;
        const time = new Date(now.getTime() + m * 60000);
        const positionAndVelocity = satellite.propagate(satrec, time);
        const gmst = satellite.gstime(time);
        const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

        points.push([
            satellite.degreesLat(positionGd.latitude),
            satellite.degreesLong(positionGd.longitude),
            positionGd.height / 6371
        ]);
    }
    return points;
}

function showSatelliteOnGlobe(satrec, myGlobe, observerMarker) {
    const now = new Date();
    const positionAndVelocity = satellite.propagate(satrec, now);
    if (!positionAndVelocity.position) return;

    const gmst = satellite.gstime(now);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    const satLat = satellite.degreesLat(positionGd.latitude);
    const satLng = satellite.degreesLong(positionGd.longitude);

    const satMarker = { lat: satLat, lng: satLng, color: "yellow" };
    myGlobe.pointsData(observerMarker ? [observerMarker, satMarker] : [satMarker]);
    myGlobe.pathsData([getOrbitPath(satrec)]);

    myGlobe.pointOfView({ lat: satLat, lng: satLng, altitude: 1.5 }, 1000);
}

function renderPassList(passes, passesList, emptyMessage, myGlobe, observerMarker) {
    passesList.innerHTML = "";

    if (passes.length === 0) {
        passesList.innerHTML = `<p>${emptyMessage}</p>`;
        return;
    }

    const overheadNow = passes.filter(p => p.alreadyUp);
    const upcoming = passes.filter(p => !p.alreadyUp);

    if (overheadNow.length > 0) {
        const summary = document.createElement("div");
        summary.className = "overheadSummary";
        summary.textContent = `${overheadNow.length} satellite(s) already overhead — click to view`;
        passesList.appendChild(summary);

        const overheadList = document.createElement("div");
        overheadList.style.display = "none";

        for (const pass of overheadNow) {
            const item = document.createElement("div");
            item.className = "passItem";
            item.innerHTML = `
                <strong>${pass.name}</strong><br>
                Max elevation: ${pass.maxElevation.toFixed(0)}°
            `;
            item.addEventListener("click", () => {
                showSatelliteOnGlobe(pass.satrec, myGlobe, observerMarker);
            });
            overheadList.appendChild(item);
        }

        passesList.appendChild(overheadList);

        summary.addEventListener("click", () => {
            const isHidden = overheadList.style.display === "none";
            overheadList.style.display = isHidden ? "block" : "none";
        });
    }

    if (upcoming.length === 0) {
        const message = document.createElement("p");
        message.textContent = "No upcoming passes in the next 24 hours.";
        passesList.appendChild(message);
        return;
    }

    for (const pass of upcoming) {
        const item = document.createElement("div");
        item.className = "passItem";
        item.innerHTML = `
            <strong>${pass.name}</strong><br>
            Start: ${pass.start.toLocaleTimeString()}<br>
            Max elevation: ${pass.maxElevation.toFixed(0)}°
        `;
        item.addEventListener("click", () => {
            showSatelliteOnGlobe(pass.satrec, myGlobe, observerMarker);
        });
        passesList.appendChild(item);
    }
}

async function main() {
    const [satellites] = await Promise.all([fetchAllSatellites(), loadLand()]);

    const instructionLabel = document.getElementById("instructionLabel");
    const passesPanel = document.getElementById("passesPanel");
    const passesList = document.getElementById("passesList");
    const visibleTab = document.getElementById("visibleTab");
    const allTab = document.getElementById("allTab");
    const satelliteDataAvailable = satellites.length > 0;

    if (!satelliteDataAvailable) {
        passesPanel.innerHTML = `
            <h2>SORRY, NO MORE</h2>
            <p>
                UVE REACHED THE REQUEST LIMIT.<br><br>
                PLEASE TRY AGAIN IN A COUPLE OF HOURS.
            </p>
        `;

        passesPanel.classList.add("open");
        instructionLabel.textContent = "SORRY, NO MORE";
    }
    let latestAllPasses = [];
    let latestVisiblePasses = [];
    let activeTab = "visible";
    let observerMarker = null;

    function refreshList() {
        if (activeTab === "visible") {
            renderPassList(latestVisiblePasses, passesList, "No visible passes in the next 24 hours.", myGlobe, observerMarker);
        } else {
            renderPassList(latestAllPasses, passesList, "No passes found in the next 24 hours.", myGlobe, observerMarker);
        }
    }

    visibleTab.addEventListener("click", () => {
        activeTab = "visible";
        visibleTab.classList.add("active");
        allTab.classList.remove("active");
        refreshList();
    });

    allTab.addEventListener("click", () => {
        activeTab = "all";
        allTab.classList.add("active");
        visibleTab.classList.remove("active");
        refreshList();
    });

    const myGlobe = Globe()(document.getElementById("globeViz"))
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
        .backgroundColor("#000000")
        .width(window.innerWidth)
        .height(window.innerHeight)
        .pointColor(d => d.color)
        .pointRadius(0.4)
        .pointAltitude(0.01)
        .pathColor(() => "cyan")
        .pathStroke(0.5)
        .pathDashLength(0.01)
        .pathDashGap(0.004)
        .pathDashAnimateTime(20000)
        .onGlobeReady(() => {
            window.finishLoader?.();
        })
        .onGlobeClick(({ lat, lng }) => {
                     if (!satelliteDataAvailable) {
             passesPanel.innerHTML = `
                 <h2>SORRY, NO MORE</h2>
                 <p>
                UVE REACHED THE REQUEST LIMIT.<br><br>
                PLEASE TRY AGAIN IN A COUPLE OF HOURS.
                 </p>
             `;

             passesPanel.classList.add("open");
             instructionLabel.textContent = "SATELLITE DATA UNAVAILABLE";
             return;
            }
            if (!isOnLand(lat, lng)) {
                instructionLabel.textContent = "Please click on land, not ocean";
                return;
            }


            observerMarker = { lat, lng, color: "cyan" };
            myGlobe.pointsData([observerMarker]);
            instructionLabel.textContent = `Calculating passes for ${lat.toFixed(2)}, ${lng.toFixed(2)}...`;

            const observerGd = {
                longitude: satellite.degreesToRadians(lng),
                latitude: satellite.degreesToRadians(lat),
                height: 0
            };
            
            setTimeout(() => {
                const { allPasses, visiblePasses } = findPasses(satellites, observerGd);
                latestAllPasses = allPasses;
                latestVisiblePasses = visiblePasses;
                refreshList();
                passesPanel.classList.add("open");
                instructionLabel.textContent = `Location: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
            }, 0);
        });
    const stars = createStarsField();
    if (stars) {
        myGlobe.scene().add(stars);
        myGlobe.camera().far = 5000;
        myGlobe.camera().updateProjectionMatrix();
    }
    window.finishLoader?.();
    
}

main();