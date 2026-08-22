import * as satellite from "https://cdn.jsdelivr.net/npm/satellite.js/+esm";
const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";
async function fetchISS() {
    const response = await fetch(TLE_URL);
    const text = await response.text();

    const lines = text.trim().split("\n");
    const line1 = lines[1];
    const line2 = lines[2];

    return satellite.twoline2satrec(line1, line2);
}

function getPosition(satrec){
    const now = new Date();
    const positionAndVelocity = satellite.propagate(satrec, now);
    const gmst = satellite.gstime(now);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    const velocity = positionAndVelocity.velocity;
    const speedKmS = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);

    return {
        name: "ISS (ZARYA)",
        lat: satellite.degreesLat(positionGd.latitude),
        lng: satellite.degreesLong(positionGd.longitude),
        alt: positionGd.height,
        speed: speedKmS *3600
    };
}

function getOrbitPath(satrec) {
    const now = new Date();
    const points = [];

    for (let m = -45; m <= 45; m += 1) {
        const time = new Date (now.getTime() + m * 60000);
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
  const satrec = await fetchISS();

  const myGlobe = Globe()(document.getElementById("globeViz"))
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
    .backgroundColor("#000000")
    .width(window.innerWidth)
    .height(window.innerHeight)
    .pointColor(() => "red")
    .pointRadius(0.4)
    .pointAltitude(0.02)
    .onPointClick(point => {
        infoName.textContent = point.name;
        infoAlt.textContent = point.alt.toFixed(1);
        infoSpeed.textContent = point.speed.toFixed(0);
      infoPanel.classList.add("open");
    })
    .pathsData([getOrbitPath(satrec)])
    .pathColor(()=> "cyan")
    .pathStroke(0.5)
    .pathDashLength(0.01)
    .pathDashGap(0.004)
    .pathDashAnimateTime(20000);

  function updatePosition() {
    const pos = getPosition(satrec);
    myGlobe.pointsData([pos]);
  }

  updatePosition();
  setInterval(updatePosition, 2000);
}

main();

