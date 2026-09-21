# SatelliteTracker
So this is a cool app that tracks satellites real time built on JS and Globe.jl
The project shows different satellites (not all of them, because otherwise there would be around 10 000 of them), and also can show you visible satellites based on the location you picked.

## Features
Interactive 3D earth
Real satellite posaition tracking
Differennt satellite types:
1. Space stations
2. Brightest ones
3. GPS
4. STARLINK that might not show lol
5. Weather
Speed and altitude of the satellite
Visible and All passes categories for satellites
Star background

## How It Works

The programm ghets the data from **CelesTrak** in TLE format.
The project uses `satellite.js` to propagate each satellites orbit and calculate its position at the current time.
The coordinates are then converted into latitude, longitude, and altitude and displayed on the 3D globe.
For pass predictions, it calculates satellite positions across the next 24 hours and checks whether each satellite rises above the selected observer's horizon.
For visible passes, the tracker additionally checks satellite elevation, whether the location is dark and whether the satellite is illuminated by the sun

## Credits
Thanks to BroCode for teaching me how to code on JS, here is a link to the tutorial i used:https://www.youtube.com/watch?v=lfmg-EJ8gm4

## AI declaration
Mainly i used it so it gave me the general idea of the code that i should have for my ideas, and then i changed it and shaped it so that it turned out the way it did now. Also it helped me with complex tasks, like visible satellites and all the complex stuff, and, of course, debugging.


