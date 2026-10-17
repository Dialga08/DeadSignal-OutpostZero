# Dead Signal: Outpost Zero

A small, original browser-based military zombie survival prototype. It uses plain HTML, CSS, and JavaScript with no external libraries. Its included wasteland tiles are by CodeManu and licensed CC0.

## Play locally
Open \`index.html\` in a web browser. Your unlocks and tokens are saved in that browser's local storage.

The menu has separate Outpost, Gumball Garrison, and Armory tabs. The play area uses the Pixel Art Wasteland tiles for sand, stone streets, and building textures, with drawn rubble and abandoned cars.

Each wave spawns no more infected than its kill quota, with at most five active at once.

## Controls
- **WASD / arrow keys:** move during waves and between-wave breaks
- **Mouse:** aim; hold left mouse button to fire. Runs start in manual-fire mode. Firearms show magazine ammo and reload automatically after a timed pause.
- **R:** toggle auto-aim
- **E:** search a building, rescue a survivor, or enter a shelter
- **B:** open the upgrade shop during the between-wave break
- **Shift:** start the next wave early
- **Q:** throw a scavenged bomb
- **F:** call a scavenged airstrike

On phones, use the movement pad and FIRE / E buttons.

Assets in assets/pixel_art_wasteland/ come from CodeManu's Pixel Art Wasteland pack. The OpenGameArt page lists the pack as CC0: https://opengameart.org/content/pixel-art-wasteland. The original ZIP and source files are kept alongside the PNGs.

## Publish with GitHub Pages
1. Create a new GitHub repository for this game.
2. Upload \`index.html\`, \`style.css\`, \`game.js\`, this README, and the complete \`assets\` folder to the repository's root.
3. In the repository, open **Settings → Pages**.
4. Select **Deploy from a branch**, choose **main** and **/(root)**, then save.
5. Wait for GitHub Pages to finish publishing and open the site link shown on that page.

This prototype saves progress only in the current browser. Firebase cloud saves and online multiplayer can be added in a later development step.






