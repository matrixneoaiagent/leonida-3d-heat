/* COBALT HEAT — module manifest.
   A real, loadable map of the game's source so the architecture is legible in one place.
   Each file has one job; the runtime systems are attached to window.CH by their modules. */
var cobaltModuleConfig = 'config.js — Marisol layout, districts, vehicles, weapons, radio and mission story data';
var cobaltModuleUtil = 'util.js — seeded random, angle/collision math, merged meshes, procedural canvas textures';
var cobaltModuleManifest = 'manifest.js — this source/module map';
var cobaltModuleGame = 'game.js — renderer, main loop, title/play/pause/result flow, saving, collectibles and shot hook';
var cobaltModuleMissions = 'missions.js — six story missions, briefings, objectives, markers, dialogue, rewards and courier job';
var cobaltModulePolice = 'police.js — wanted stars, decay, cruiser pursuit, foot officers, roadblocks and BUSTED meter';
var cobaltModuleShots = 'shots.js — deterministic hero, city, chase and mission screenshot staging';
var cobaltModuleHud = 'hud.js — vitals, wanted, mission card, minimap, weapon panel, speedometer, menus and briefings';
var cobaltModuleInput = 'input.js — keyboard, pointer lock, drag-look, mouse buttons and one-shot actions';
var cobaltModuleAudio = 'audio.js — synthesized engine, siren, guns, impacts, horn, pickups and radio music';
var cobaltModuleEffects = 'effects.js — pooled muzzle flashes, tracers, sparks, dust, smoke and explosions';
var cobaltModuleCamera = 'camera.js — over-the-shoulder and chase camera, aim zoom, collision and fixed shots';
var cobaltModuleTraffic = 'traffic.js — lane traffic, sidewalk pedestrians, panic loops and parked cars';
var cobaltModuleCombat = 'combat.js — weapons, hitscan, melee, reloads, enemy AI and return fire';
var cobaltModulePeople = 'people.js — articulated characters for Teo, pedestrians, officers, guards and Bishop';
var cobaltModuleVehicles = 'vehicles.js — procedural cars, taxis, police cruisers, armoured truck and scooter';
var cobaltModulePlayer = 'player.js — on-foot movement, carjacking, driving, inventory, vitals and respawn';
var cobaltModuleWorld = 'world.js — city grid, buildings, beach, ocean, marina, pier, palms, lights and collision';
var cobaltModuleMain = 'main.js — boot, fatal-error screen, audio unlock and ?shot= entry';
var cobaltModuleStyles = 'styles.css — the HUD, title, pause, briefing, map, result and menu art direction';
var cobaltModuleIndex = 'index.html — the game canvas, HUD markup, menus and classic-script order';

var COBALT_ARCHITECTURE = [
  cobaltModuleIndex, cobaltModuleConfig, cobaltModuleUtil, cobaltModuleGame, cobaltModuleMissions,
  cobaltModulePolice, cobaltModuleShots, cobaltModuleHud, cobaltModuleInput, cobaltModuleAudio,
  cobaltModuleEffects, cobaltModuleCamera, cobaltModuleTraffic, cobaltModuleCombat, cobaltModulePeople,
  cobaltModuleVehicles, cobaltModulePlayer, cobaltModuleWorld, cobaltModuleMain, cobaltModuleStyles
];

window.CH = window.CH || {};
window.CH.MODULES = COBALT_ARCHITECTURE;

// Recording check: manifest reviewed for the live capture.
