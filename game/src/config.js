/* COBALT HEAT — MARISOL
   Static tuning and story data. One city, one crew, one long night. */
(function () {
  'use strict';

  window.CH = window.CH || {};

  var COLORS = {
    ink: '#081418',
    deep: '#0b2026',
    panel: 'rgba(7, 23, 27, 0.82)',
    panelSoft: 'rgba(10, 32, 36, 0.62)',
    cream: '#faf0d8',
    sand: '#efd7aa',
    coral: '#ff6f5e',
    coralDeep: '#ce463d',
    teal: '#30d6c4',
    tealDeep: '#0c7774',
    gold: '#ffc95c',
    lime: '#b8e986',
    red: '#ff4e55',
    blue: '#5ec8ff',
    muted: '#9bb1ad',
    white: '#fff9ec'
  };

  var WORLD = {
    name: 'MARISOL',
    region: 'COBALT COAST',
    size: 980,
    half: 490,
    groundSize: 1260,
    roadsX: [-360, -270, -180, -90, 0, 90, 180, 270, 360],
    roadsZ: [-360, -270, -180, -90, 0, 90, 180, 270, 360],
    roadHalf: 10,
    sidewalk: 5.5,
    laneWidth: 5,
    blockInset: 15.5,
    beachStart: -402,
    beachEnd: -486,
    waterStart: -470,
    waterEnd: -1500,
    seaLevel: -0.24,
    cityGround: 0,
    sidewalkHeight: 0.22,
    eyeHeight: 1.72,
    playerRadius: 0.48,
    spawn: { x: -347, z: 116, yaw: Math.PI },
    fogNear: 90,
    fogFar: 690,
    maxTraffic: 26,
    maxPeds: 46,
    sunDistance: 240,
    shadowSize: 160,
    dayLength: 1200,
    startMinutes: 17 * 60 + 18
  };

  var PLAYER = {
    name: 'MATEO “TEO” VELA',
    shortName: 'TEO',
    money: 1240,
    health: 100,
    armor: 25,
    walkSpeed: 4.9,
    runSpeed: 9.1,
    aimSpeed: 2.5,
    swimSpeed: 3.4,
    jumpSpeed: 6.3,
    gravity: 20,
    turnSpeed: 12,
    interactRange: 3.4,
    enterRange: 3.8,
    maxWeapons: { fists: 0, pistol: 96, smg: 180, shotgun: 28 },
    startAmmo: { pistol: 12, smg: 0, shotgun: 0 },
    wantedDecay: 0.026,
    hiddenDecayDelay: 6,
    bustedSeconds: 4.5,
    respawnFee: 180,
    hospital: { x: 222, z: 254 }
  };

  var WEAPONS = {
    fists: {
      id: 'fists', slot: 1, name: 'FISTS', short: 'FST', kind: 'melee',
      damage: 24, rate: 2.7, range: 2.0, spread: 0, mag: 0, pellets: 1,
      recoil: 0.015, shake: 0.08, color: '#ffd9b0', desc: 'A last-resort conversation.'
    },
    pistol: {
      id: 'pistol', slot: 2, name: 'VESPER 9', short: 'PST', kind: 'pistol',
      damage: 34, rate: 4.4, range: 74, spread: 0.012, mag: 12, pellets: 1,
      recoil: 0.05, shake: 0.25, color: '#ffd36a', desc: 'Reliable nine-millimetre. Sounds like trouble.'
    },
    smg: {
      id: 'smg', slot: 3, name: 'SURF SMG', short: 'SMG', kind: 'smg',
      damage: 21, rate: 10.5, range: 62, spread: 0.026, mag: 30, pellets: 1,
      recoil: 0.03, shake: 0.18, color: '#ffb65c', price: 1400, starterReserve: 120, desc: 'Fast, loud, difficult to explain to a jury.'
    },
    shotgun: {
      id: 'shotgun', slot: 4, name: 'TIDEBREAKER', short: 'SHG', kind: 'shotgun',
      damage: 22, rate: 1.25, range: 34, spread: 0.075, mag: 6, pellets: 8,
      recoil: 0.11, shake: 0.55, color: '#ff9654', price: 2200, starterReserve: 28, desc: 'Eight arguments at once.'
    }
  };

  var VEHICLES = {
    avocet: {
      id: 'avocet', label: 'AVOCET GT', class: 'SPORTS', color: '#f05a4f', accent: '#f7e6c7',
      length: 4.35, width: 1.97, height: 1.13, wheelBase: 2.62, wheelRadius: 0.34,
      maxSpeed: 48, accel: 17.5, brake: 27, grip: 8.6, steer: 1.9, mass: 1140,
      value: 148000, seats: 2, prestige: 5
    },
    paloma: {
      id: 'paloma', label: 'PALOMA 4D', class: 'SEDAN',
      colors: ['#e8e1ce', '#9e3941', '#356172', '#b9a66f', '#343b40', '#6d7b60'],
      length: 4.72, width: 1.91, height: 1.43, wheelBase: 2.73, wheelRadius: 0.35,
      maxSpeed: 35, accel: 10.2, brake: 20, grip: 7.1, steer: 1.45, mass: 1510,
      value: 9800, seats: 4, prestige: 1
    },
    marea: {
      id: 'marea', label: 'MAREA VAN', class: 'VAN', color: '#d8cfb8',
      length: 5.25, width: 2.07, height: 2.16, wheelBase: 3.12, wheelRadius: 0.39,
      maxSpeed: 29, accel: 7.5, brake: 16, grip: 6.0, steer: 1.22, mass: 2140,
      value: 12600, seats: 3, prestige: 1
    },
    tucan: {
      id: 'tucan', label: 'TUCÁN TAXI', class: 'TAXI', color: '#f2c843', accent: '#152f34',
      length: 4.74, width: 1.94, height: 1.47, wheelBase: 2.76, wheelRadius: 0.35,
      maxSpeed: 36, accel: 10.8, brake: 21, grip: 7.4, steer: 1.48, mass: 1490,
      value: 11200, seats: 4, prestige: 2
    },
    corsair: {
      id: 'corsair', label: 'CORSAIR CRUISER', class: 'POLICE', color: '#f4f0df', accent: '#19394a',
      length: 4.88, width: 2.01, height: 1.54, wheelBase: 2.8, wheelRadius: 0.36,
      maxSpeed: 43, accel: 14.4, brake: 24, grip: 8.0, steer: 1.62, mass: 1690,
      value: 36000, seats: 4, prestige: 3, police: true
    },
    balandra: {
      id: 'balandra', label: 'BALANDRA ARMOR', class: 'ARMORED', color: '#7e897b',
      length: 6.0, width: 2.32, height: 2.72, wheelBase: 3.55, wheelRadius: 0.48,
      maxSpeed: 27, accel: 6.1, brake: 17, grip: 6.6, steer: 1.16, mass: 3800,
      value: 68000, seats: 2, prestige: 4
    },
    gull: {
      id: 'gull', label: 'GULL SCOOTER', class: 'SCOOTER', color: '#59c8bb',
      length: 1.85, width: 0.78, height: 1.03, wheelBase: 1.2, wheelRadius: 0.27,
      maxSpeed: 24, accel: 9.0, brake: 14, grip: 9.2, steer: 2.0, mass: 190,
      value: 4200, seats: 2, prestige: 1
    }
  };

  var ROAD_COLORS = ['#d9c9a9', '#b9534c', '#376a72', '#7d8a6e', '#d7c069', '#8d6f5b'];

  var DISTRICTS = [
    { id: 'playa', name: 'PLAYA CLARA', sub: 'BEACHFRONT', minX: -500, maxX: -292, minZ: -500, maxZ: 500, color: '#f5c96b' },
    { id: 'puerto', name: 'PUERTO LUME', sub: 'MARINA & PIER', minX: -500, maxX: -250, minZ: 226, maxZ: 500, color: '#ff7c64' },
    { id: 'coral', name: 'CALLE ROSA', sub: 'HOTEL STRIP', minX: -292, maxX: -80, minZ: -40, maxZ: 300, color: '#ff9e8e' },
    { id: 'centro', name: 'CENTRO SOL', sub: 'OLD MARKET', minX: -250, maxX: 90, minZ: -180, maxZ: 226, color: '#5ed7c5' },
    { id: 'alto', name: 'ALTO MAR', sub: 'FINANCE DISTRICT', minX: 90, maxX: 500, minZ: -500, maxZ: 90, color: '#67bff0' },
    { id: 'vista', name: 'VISTA HILLS', sub: 'THE HIGH ROAD', minX: 120, maxX: 500, minZ: 90, maxZ: 500, color: '#a9d77c' },
    { id: 'south', name: 'SOUTH TIDE', sub: 'WAREHOUSES', minX: -292, maxX: 90, minZ: -500, maxZ: -180, color: '#d9a66b' },
    { id: 'marina', name: 'MARINA NUEVA', sub: 'DOCKS', minX: -292, maxX: 90, minZ: 226, maxZ: 500, color: '#f0b48d' }
  ];

  var POINTS = {
    spawn: { x: -347, z: 116, label: 'PLAYA CLARA' },
    garage: { x: -260, z: 198, label: "ROSA'S GARAGE", district: 'coral' },
    hotelAzul: { x: -318, z: 72, label: 'HOTEL AZUL', district: 'coral' },
    plaza: { x: 38, z: 42, label: 'PLAZA SOL', district: 'centro' },
    market: { x: -132, z: 136, label: 'MERCADO VIEJO', district: 'centro' },
    pier: { x: -444, z: 305, label: 'MUELLE LUME', district: 'puerto' },
    marina: { x: -390, z: 405, label: 'MARINA NUEVA', district: 'puerto' },
    port: { x: -214, z: 362, label: 'PUERTO LUME DOCKS', district: 'puerto' },
    tower: { x: 274, z: -238, label: 'COBALT TOWER', district: 'alto' },
    police: { x: 154, z: 306, label: 'MARISOL P.D.', district: 'vista' },
    hospital: { x: 222, z: 254, label: 'CLARA VISTA HOSPITAL', district: 'vista' },
    armory: { x: 158, z: -34, label: 'ISLA SUPPLY', district: 'alto' },
    estate: { x: 316, z: 306, label: 'CASA MIRAMAR', district: 'vista' },
    radio: { x: 82, z: 186, label: 'RADIO SOL', district: 'centro' },
    stunt: { x: -358, z: -218, label: 'SOUTH TIDE RAMP', district: 'south' },
    docks: { x: 48, z: 356, label: 'NUEVA DOCKS', district: 'marina' }
  };

  var CONTACTS = {
    rosa: { name: 'ROSA VELA', role: 'YOUR AUNT. YOUR BOSS.', initials: 'RV', color: '#ff7a66' },
    juno: { name: 'JUNO PARK', role: 'THE CREW’S EYES', initials: 'JP', color: '#42d8cb' },
    dez: { name: 'DEZ RÍOS', role: 'MECHANIC & BAD INFLUENCE', initials: 'DR', color: '#f6c05f' },
    bishop: { name: 'MARCUS BISHOP', role: 'HARBOR AUTHORITY', initials: 'MB', color: '#b9b0f0' },
    hale: { name: 'CAPTAIN HALE', role: 'MARISOL P.D.', initials: 'CH', color: '#7cbcf3' }
  };

  var RADIO = [
    { name: 'SOL 98.3', tag: 'COASTAL HITS', color: '#ff7a66' },
    { name: 'NEON TIDE FM', tag: 'SYNTHWAVE', color: '#46d9c9' },
    { name: 'RADIO MUELLE', tag: 'DANCE / SALSA', color: '#ffc85e' },
    { name: 'THE QUIET WAVE', tag: 'LATE NIGHT', color: '#97a9ff' }
  ];

  var MISSION_ORDER = ['firstTide', 'shoreLeave', 'redline', 'longPier', 'heavyCargo', 'kingTide'];

  var MISSIONS = {
    firstTide: {
      id: 'firstTide', number: 1, title: 'FIRST TIDE', giver: 'rosa', area: 'PLAYA CLARA',
      reward: 1800, time: 240,
      tagline: 'A car, a sunrise, and a debt with your name on it.',
      brief: [
        'Rosa needs the Avocet that just landed at the marina. The keys are in it. The owner is not.',
        'Bring it to the garage before the harbor patrol finishes their coffee.'
      ],
      objectives: [
        { type: 'goto', x: -380, z: 340, radius: 8, label: 'REACH THE MARINA' },
        { type: 'vehicle', vehicle: 'avocet', label: 'STEAL THE AVOCET GT' },
        { type: 'drive', x: -260, z: 198, radius: 9, label: "DELIVER IT TO ROSA'S GARAGE" }
      ]
    },
    shoreLeave: {
      id: 'shoreLeave', number: 2, title: 'SHORE LEAVE', giver: 'juno', area: 'CALLE ROSA',
      reward: 2400, time: 210, requires: 'firstTide',
      tagline: 'Three doors. One ledger. No receipts.',
      brief: [
        'A collector named Sable is shaking down the hotel strip for Bishop. Juno found his route.',
        'Follow the money, take the ledger, then lose the police before they write your name down.'
      ],
      objectives: [
        { type: 'goto', x: -242, z: 84, radius: 9, label: 'MEET JUNO AT THE HOTEL' },
        { type: 'steal', vehicle: 'paloma', label: 'TAKE A RIDE FROM THE STRIP' },
        { type: 'goto', x: -322, z: 226, radius: 8, label: 'TAIL SABLE TO THE ALLEY' },
        { type: 'kill', count: 3, label: 'TAKE BACK THE LEDGER' },
        { type: 'evade', label: 'LOSE THE POLICE' }
      ]
    },
    redline: {
      id: 'redline', number: 3, title: 'REDLINE', giver: 'dez', area: 'CENTRO SOL',
      reward: 3200, time: 165, requires: 'shoreLeave',
      tagline: 'The fastest way out is through.',
      brief: [
        'Dez put your name on a midnight race through Centro. There is no prize money, only pride and a buyer.',
        'Hit three checkpoints, keep the Avocet in one piece, and do not let the P.D. close the bridge.'
      ],
      objectives: [
        { type: 'driveTo', x: 22, z: 210, radius: 10, label: 'CROSS THE START LINE' },
        { type: 'checkpoints', points: [[92, 92], [182, -90], [0, -270], [-180, 20]], time: 80, label: 'HIT THE CHECKPOINTS' },
        { type: 'drive', x: 274, z: 136, radius: 10, label: 'DELIVER TO DEZ' }
      ]
    },
    longPier: {
      id: 'longPier', number: 4, title: 'THE LONG PIER', giver: 'rosa', area: 'PUERTO LUME',
      reward: 4100, time: 260, requires: 'redline',
      tagline: 'Everyone at the docks owes somebody.',
      brief: [
        'Bishop’s people are moving a shipping manifest through the old pier. Rosa wants it before the cargo leaves.',
        'The Cormorant crew will not hand it over. Juno can keep the cameras blind for four minutes.'
      ],
      objectives: [
        { type: 'goto', x: -438, z: 306, radius: 8, label: 'REACH THE OLD PIER' },
        { type: 'kill', count: 5, label: 'CLEAR THE CORMORANT CREW' },
        { type: 'goto', x: -456, z: 362, radius: 7, label: 'GRAB THE MANIFEST' },
        { type: 'evade', label: 'ESCAPE THE MARINA' }
      ]
    },
    heavyCargo: {
      id: 'heavyCargo', number: 5, title: 'HEAVY CARGO', giver: 'dez', area: 'SOUTH TIDE',
      reward: 5600, time: 300, requires: 'longPier',
      tagline: 'Steal the truck. Keep the cargo. Skip the paperwork.',
      brief: [
        'A Balandra armoured truck is parked at the South Tide yard with something Juno needs inside.',
        'Take it to the docks. If the police follow, use the causeway and let the city do the rest.'
      ],
      objectives: [
        { type: 'goto', x: -126, z: -340, radius: 8, label: 'REACH THE SOUTH TIDE YARD' },
        { type: 'steal', vehicle: 'balandra', label: 'HIJACK THE ARMOURED TRUCK' },
        { type: 'drive', x: 48, z: 356, radius: 10, label: 'DELIVER TO THE NUEVA DOCKS' },
        { type: 'evade', label: 'LOSE YOUR TAIL' }
      ]
    },
    kingTide: {
      id: 'kingTide', number: 6, title: 'KING TIDE', giver: 'rosa', area: 'VISTA HILLS',
      reward: 9000, time: 360, requires: 'heavyCargo',
      tagline: 'The house always wins. Until it doesn’t.',
      brief: [
        'Bishop is hiding at Casa Miramar with the money he took from the whole coast. Rosa is done asking.',
        'Get through the gate, take the evidence, and put Bishop’s operation in the water. This is the last job.'
      ],
      objectives: [
        { type: 'goto', x: 288, z: 278, radius: 8, label: 'REACH CASA MIRAMAR' },
        { type: 'kill', count: 6, label: 'CLEAR THE ESTATE' },
        { type: 'goto', x: 334, z: 336, radius: 7, label: 'CORNER BISHOP' },
        { type: 'killBoss', label: 'FINISH BISHOP' },
        { type: 'evade', label: 'LEAVE MARISOL BEHIND' }
      ]
    }
  };

  var SIDE_JOBS = [
    { id: 'courier', title: 'COVE COURIER', x: 72, z: 158, reward: 650, time: 95 },
    { id: 'stunts', title: 'SUNSET STUNTS', x: -296, z: 12, reward: 900, time: 120 }
  ];

  var TIPS = [
    'CLICK THE STREET TO CATCH THE MOUSE. PRESS E TO TAKE A CAR.',
    'THE P.D. CANNOT SEE THROUGH WALLS. BREAK LINE OF SIGHT AND THE STARS COOL.',
    'MISSIONS PAY MORE WHEN YOU BEAT THE CLOCK.',
    'SPACE IS THE HANDBRAKE. USE IT BEFORE THE CORNER, NOT AFTER.',
    'JUNO LEAVES WORK AT THE YELLOW MARKER. ROSA PAYS CASH.',
    'COLLECT THE BLUE SHELLS ALONG THE COAST FOR A STASH REWARD.'
  ];

  window.CH.CONFIG = {
    version: '1.0.0',
    title: 'COBALT HEAT',
    subtitle: 'MARISOL NEVER COOLS',
    city: 'MARISOL',
    COLORS: COLORS,
    WORLD: WORLD,
    PLAYER: PLAYER,
    WEAPONS: WEAPONS,
    VEHICLES: VEHICLES,
    ROAD_COLORS: ROAD_COLORS,
    DISTRICTS: DISTRICTS,
    POINTS: POINTS,
    CONTACTS: CONTACTS,
    RADIO: RADIO,
    MISSION_ORDER: MISSION_ORDER,
    MISSIONS: MISSIONS,
    SIDE_JOBS: SIDE_JOBS,
    TIPS: TIPS,
    BUILDING_PALETTES: {
      playa: ['#f3dcb4', '#f7b9a0', '#a8d8cb', '#f4e8d4', '#d9a79a', '#d9c59c'],
      coral: ['#f2a48e', '#f7d9b0', '#93c6bf', '#e8c9c0', '#f0b76e', '#c97b6c'],
      centro: ['#efd59c', '#c56c55', '#7fa39a', '#e9b56d', '#9db58a', '#d7c7a7'],
      alto: ['#6fb8c6', '#a7d2d9', '#537f95', '#dce4d2', '#d9a77f', '#8bbec5', '#e7d0a2', '#c0cdbf'],
      vista: ['#f4e5c2', '#e7c895', '#cdd9b6', '#d5a68b', '#f1d7ad', '#a9c9b0'],
      south: ['#a6a18b', '#b66d55', '#778d82', '#d1b17d', '#8d7c69', '#c7c1ad'],
      marina: ['#ead7b6', '#9fc1b7', '#d89c7f', '#b3c9c0', '#e7be8f', '#8bb6b6']
    }
  };
}());

// Recording check: config module reviewed for the live capture.
