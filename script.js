 import * as satellite from "https://cdn.jsdelivr.net/npm/satellite.js/+esm";
 
 const TLE_GROUPS = [
     { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=TLE", limit: null, color: "yellow"},
     { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=TLE", limit: 20, color: "blue" },
     { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=TLE", limit: 20, color: "red" },
     { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE", limit: 20, color: "green" },
     { url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=TLE", limit: 20, color: "orange" }
 ];
 
 function parseTLEBlock(text, color) {
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
             color: color
         });
     }
 
     return satellites;
 }
 
 async function fetchGroup(group) {
     const response = await fetch(group.url);
     const text = await response.text();
     const sats = parseTLEBlock(text, group.color);
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
 
 function getPosition(satEntry) {
     const now = new Date();
     const positionAndVelocity = satellite.propagate(satEntry.satrec, now);
     const gmst = satellite.gstime(now);
     const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
     const velocity = positionAndVelocity.velocity;
     const speedKmS = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
 
     return {
         name: satEntry.name,
         satrec: satEntry.satrec,
         color: satEntry.color,
         lat: satellite.degreesLat(positionGd.latitude),
         lng: satellite.degreesLong(positionGd.longitude),
         alt: positionGd.height,
         speed: speedKmS * 3600
     };
 }
 
 function getOrbitPath(satrec) {
     const now = new Date();
     const points = [];
 
     for (let m = -45; m <= 45; m += 1) {
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
 
 async function main() {
     const satellites = await fetchAllSatellites();
 
     const infoPanel = document.getElementById("infoPanel");
     const infoName = document.getElementById("infoName");
     const infoAlt = document.getElementById("infoAlt");
     const infoSpeed = document.getElementById("infoSpeed");
 
     const myGlobe = Globe()(document.getElementById("globeViz"))
         .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
         .backgroundColor("#000000")
         .width(window.innerWidth)
         .height(window.innerHeight)
         .pointColor(d => d.color)
         .pointRadius(0.25)
         .pointAltitude(0.02)
         .pathColor(() => "cyan")
         .pathStroke(0.5)
         .pathDashLength(0.01)
         .pathDashGap(0.004)
         .pathDashAnimateTime(20000)
         .onPointClick(point => {
             infoName.textContent = point.name;
             infoAlt.textContent = point.alt.toFixed(1);
             infoSpeed.textContent = point.speed.toFixed(0);
             infoPanel.classList.add("open");
 
             myGlobe.pathsData([getOrbitPath(point.satrec)]);
         });
 
     function updatePosition() {
         const positions = satellites.map(getPosition);
         myGlobe.pointsData(positions);
     }
 
     updatePosition();
     setInterval(updatePosition, 2000);
 }
 
 main();

