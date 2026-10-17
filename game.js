(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const tilePatterns = {};
  function loadPixelTile(name, url, sourceX=0, sourceY=0) {
    const image = new Image();
    image.onload = () => {
      const tile = document.createElement('canvas');
      tile.width=32;tile.height=32;
      const tileCtx=tile.getContext('2d');tileCtx.imageSmoothingEnabled=false;
      tileCtx.drawImage(image,sourceX,sourceY,16,16,0,0,32,32);
      tilePatterns[name]=ctx.createPattern(tile,'repeat');
    };
    image.src=url;
  }
  loadPixelTile('sand','assets/pixel_art_wasteland/Tilesets/sandFloor02.png');
  loadPixelTile('stone','assets/pixel_art_wasteland/Tilesets/stoneFloor01.png');
  loadPixelTile('rock','assets/pixel_art_wasteland/Tilesets/rockWall01.png');
  loadPixelTile('wood','assets/pixel_art_wasteland/Tilesets/woodWall01.png');
  // Twice the width and height gives four times the explorable area.
  const WORLD = { w: 4400, h: 3200 };
  const CITY_CELL = 260;
  const DISTRICT_LAYOUT = [
    ['residential','downtown','park','suburbs','industrial'],
    ['industrial','overgrown','park','downtown','residential'],
    ['residential','suburbs','civic','overgrown','industrial'],
    ['park','industrial','suburbs','residential','overgrown']
  ];
  const DISTRICT_STYLE = {
    residential:{ground:['#687052','#626b4d','#706e50'],building:.55,trees:1},
    downtown:{ground:['#625e50','#696251','#5d6255'],building:.72,trees:0},
    park:{ground:['#4c7048','#557849','#4b6945'],building:.025,trees:5},
    suburbs:{ground:['#718052','#65744d','#747952'],building:.28,trees:2},
    industrial:{ground:['#625f50','#71654d','#5b6254'],building:.42,trees:0},
    overgrown:{ground:['#4c6742','#536d43','#5a7043'],building:.18,trees:4},
    civic:{ground:['#687452','#6d754f','#5f6d4c'],building:.38,trees:1}
  };
  const CAMERA_ZOOM = 1.32;
  const SAVE_KEY = 'deadSignalSaveV1';
  const rosterData = [
    { id:'rookie', name:'Rookie', rarity:'Common', weapon:'knife', hp:85, attack:1.01, speed:98, color:'#c8d5cb', size:14, desc:'A steady recruit. Starts with a combat knife.' },
    { id:'sidearm', name:'Sidearm', rarity:'Uncommon', weapon:'pistol', hp:95, attack:1.05, speed:100, color:'#9db8c4', size:14, desc:'Quick shots and dependable handling.' },
    { id:'scout', name:'Scout', rarity:'Rare', weapon:'rifle', hp:105, attack:1.15, speed:112, color:'#9ab77e', size:15, desc:'Fast operator with an assault rifle.' },
    { id:'demolition', name:'Demolition', rarity:'Epic', weapon:'grenade', hp:125, attack:1.35, speed:94, color:'#d19b5a', size:16, desc:'Lobs explosive rounds into groups.' },
    { id:'rocketeer', name:'Rocketeer', rarity:'Epic', weapon:'rpg', hp:145, attack:1.7, speed:91, color:'#c28168', size:16, desc:'Heavy rockets with a wide blast.' },
    { id:'gunner', name:'Heavy Gunner', rarity:'Epic', weapon:'minigun', hp:165, attack:1.5, speed:88, color:'#88949a', size:17, desc:'A storm of bullets, limited mobility.' },
    { id:'heli', name:'Blackhawk', rarity:'Legendary', weapon:'heli', hp:260, attack:2.2, speed:132, color:'#73977e', size:23, desc:'Legendary helicopter. Fast, armored, and airborne.' },
    { id:'tank', name:'M1 Tank', rarity:'Legendary', weapon:'tank', hp:360, attack:2.8, speed:106, color:'#a08e60', size:25, desc:'Legendary armor with a heavy cannon.' }
  ];
  const rarityRank = { Common:1, Uncommon:2, Rare:3, Epic:4, Legendary:5 };
  const rarityClass = (s) => s.toLowerCase();
  const defaultSave = { tokens:3, unlocked:['rookie'], selected:'rookie', bestWave:0 };
  let save = loadSave();
  let state = 'menu', lastFrame = 0, toastTimer = 0, rescueTimer = 50, levelChoices = null;
  let player, zombies = [], bullets = [], pickups = [], buildings = [], cityBlocks = [], cityBuildings = [], trees = [], parkFeatures = [], survivor = null, effects = [];
  let keys = {}, pointer = {x:0,y:0,down:false}, touch = {}, wave = 1, quota = 10, kills = 0, credits = 0, prepLeft = 20;
  let autoAim = false, upgradeOpen = false, fireCooldown = 0, bombCount = 1, airstrikeCount = 0, spawnAccumulator = 0;
  let worldTime = 0, level = 1, xp = 0, xpNext = 10, camera = {x:0,y:0}, drawBounds = null, waveSpawned = 0;

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return parsed && Array.isArray(parsed.unlocked) ? {...defaultSave, ...parsed} : {...defaultSave};
    } catch (_) { return {...defaultSave}; }
  }
  function saveNow() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
    updateTokens();
  }
  function selectedChar() { return rosterData.find(c => c.id === save.selected) || rosterData[0]; }
  function updateTokens() { $('tokenCount').textContent = save.tokens; $('tokenCount2').textContent = save.tokens; }
  function showToast(message) {
    const el = $('toast'); el.textContent = message; el.hidden = false; toastTimer = 3;
  }
  function hideToast() { $('toast').hidden = true; }

  function renderRoster() {
    const root = $('roster'); root.innerHTML = '';
    save.unlocked.forEach(id => {
      const c = rosterData.find(item => item.id === id); if (!c) return;
      const card = document.createElement('button');
      card.className = 'operator-card' + (save.selected === id ? ' selected' : '');
      card.innerHTML = '<span class="operator-avatar" style="--operator-color:' + c.color + '">' + (c.weapon === 'heli' ? '✦' : c.weapon === 'tank' ? '▰' : '●') + '</span><span class="operator-info"><b>' + c.name + '</b><small>' + c.rarity + ' · ' + c.weapon.toUpperCase() + '</small><small>' + c.hp + ' HP · ' + c.attack.toFixed(2) + ' ATK · ' + c.speed + ' SPD</small></span><span class="select-mark">' + (save.selected === id ? 'DEPLOYED' : 'SELECT') + '</span>';
      card.addEventListener('click', () => { save.selected = id; saveNow(); renderRoster(); });
      root.appendChild(card);
    });
    $('rosterHint').textContent = save.unlocked.length + ' operator' + (save.unlocked.length === 1 ? '' : 's') + ' ready';
  }

  const prizeTable = [
    ['rookie',50], ['sidearm',27], ['scout',15], ['demolition',7], ['rocketeer',0.45], ['gunner',0.35], ['heli',0.1], ['tank',0.1]
  ];
  function spinGacha() {
    if (save.tokens < 1) { showGacha('No tokens left. Clear a wave or rescue someone to earn more.'); return; }
    save.tokens--; saveNow();
    $('spinButton').disabled = true;
    $('gumballs').classList.add('spinning');
    $('gachaResult').textContent = 'The machine is rattling...';
    const roll = Math.random() * 100;
    let sum = 0, selected = prizeTable[0][0];
    for (const [id, chance] of prizeTable) { sum += chance; if (roll < sum) { selected = id; break; } }
    window.setTimeout(() => {
      $('gumballs').classList.remove('spinning');
      const c = rosterData.find(item => item.id === selected);
      const already = save.unlocked.includes(c.id);
      if (!already) {
        save.unlocked.push(c.id);
        $('gachaResult').innerHTML = '<b class="' + rarityClass(c.rarity) + '">' + c.rarity.toUpperCase() + ' RECRUIT: ' + c.name + '</b><br>' + c.desc;
      } else {
        const refund = c.rarity === 'Legendary' ? 3 : c.rarity === 'Epic' ? 2 : 1;
        save.tokens += refund;
        $('gachaResult').innerHTML = '<b>' + c.name + ' duplicate</b><br>Converted into ' + refund + ' spin token' + (refund > 1 ? 's' : '') + '.';
      }
      saveNow(); renderRoster(); $('spinButton').disabled = false;
    }, 1000);
  }
  function showGacha(text) { $('gachaResult').textContent = text; }

  function setMenuView(view) {
    const main=view==='main', garrison=view==='garrison', armory=view==='armory';
    document.querySelector('.briefing').hidden=!main;
    document.querySelector('.gacha-panel').hidden=!garrison;
    document.querySelector('.roster-panel').hidden=!armory;
    document.querySelector('.menu-grid').classList.toggle('single-view',main||garrison);
    document.querySelectorAll('[data-menu-tab]').forEach(button=>button.classList.toggle('active',button.dataset.menuTab===view));
  }

  function beginGame() {
    $('menu').hidden = true; $('endScreen').hidden = true; $('gameScreen').hidden = false;
    state='playing'; wave=1; quota=10; kills=0; credits=0; zombies=[]; bullets=[]; pickups=[]; effects=[]; survivor=null;
    worldTime=0; level=1; xp=0; xpNext=10; rescueTimer=45; autoAim=false; upgradeOpen=false; bombCount=1; airstrikeCount=0;
    const c = selectedChar();
    player = {x:WORLD.w/2,y:WORLD.h/2,r:c.size,hp:c.hp,maxHp:c.hp,attack:c.attack,speed:c.speed,armor:0,fireRate:1,weapon:c.weapon,baseWeapon:c.weapon,color:c.color,invuln:0,ammo:magazineSize(c.weapon),reloadLeft:0};
    quota=10; waveSpawned=0; spawnAccumulator=0; buildMap(); resizeCanvas(); $('upgradePanel').hidden=true; $('prepBanner').hidden=true;
    $('charNameHud').textContent=c.name.toUpperCase(); $('aimHud').textContent='MANUAL AIM · R'; showToast('Manual fire: aim and hold the mouse button to shoot.');
    lastFrame=performance.now(); requestAnimationFrame(frame);
  }

  function buildMap() {
    buildings = []; cityBlocks = []; cityBuildings = []; trees = []; parkFeatures = [];
    const templates = [
      ['SAFEHOUSE','shelter','#66856e'],['RADIO STATION','radio','#6f8790'],['CORNER STORE','store','#b58d5e'],
      ['CLINIC','clinic','#b98784'],['MOTOR POOL','depot','#87877a'],['RUNDOWN HOUSE','house','#8b7770'],
      ['RUNDOWN HOUSE','house','#8b7770'],['SUPPLY SHED','store','#9f8b68']
    ];
    const cx=WORLD.w/2,cy=WORLD.h/2;
    const spots = [[cx-310,cy-280],[cx-980,cy-1120],[cx+930,cy-1120],[cx-1570,cy-120],[cx-75,cy+130],[cx+1120,cy+680],[cx-1580,cy+800],[cx-920,cy+1200]];
    templates.forEach((t,i) => buildings.push({name:t[0],type:t[1],color:t[2],x:spots[i][0],y:spots[i][1],w:142,h:104,looted:false,variant:i}));
    // Deterministic districts keep parks, dense blocks, and overgrown streets in consistent places.
    const cols=Math.ceil(WORLD.w/CITY_CELL),rows=Math.ceil(WORLD.h/CITY_CELL);
    const noise=(x,y,s=0)=>{const v=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453;return v-Math.floor(v);};
    const overlaps=(a,b,pad=20)=>a.x<b.x+b.w+pad&&a.x+a.w>b.x-pad&&a.y<b.y+b.h+pad&&a.y+a.h>b.y-pad;
    for(let col=0;col<cols;col++)for(let row=0;row<rows;row++) {
      const district=DISTRICT_LAYOUT[Math.min(3,Math.floor(row/4))][Math.min(4,Math.floor(col/4))];
      const style=DISTRICT_STYLE[district],x=col*CITY_CELL,y=row*CITY_CELL;
      const block={x,y,col,row,district,ground:style.ground[Math.floor(noise(col,row,1)*style.ground.length)],variation:noise(col,row,2)};
      cityBlocks.push(block);
      const pad={x:x+72,y:y+62,w:176,h:188};
      if(noise(col,row,3)<style.building) {
        const bw=128+Math.floor(noise(col,row,4)*49),bh=132+Math.floor(noise(col,row,5)*53);
        const ruin={name:'RUINED BLOCK',x:pad.x+Math.floor((pad.w-bw)*noise(col,row,6)),y:pad.y+Math.floor((pad.h-bh)*noise(col,row,7)),w:bw,h:bh,variant:Math.floor(noise(col,row,8)*12),district};
        const nearFacility=buildings.some(b=>overlaps(ruin,b,35));
        const nearStart=Math.hypot(ruin.x+ruin.w/2-cx,ruin.y+ruin.h/2-cy)<150;
        if(!nearFacility&&!nearStart)cityBuildings.push(ruin);
      }
      if(district==='park'&&noise(col,row,14)>.68) {
        const kind=noise(col,row,15)>.68?'fountain':'bench',size=kind==='fountain'?34:30;
        const feature={type:kind,x:x+130-size/2,y:y+130-size/2,w:size,h:kind==='fountain'?34:13};
        if(!buildings.some(b=>overlaps(feature,b,18))&&!cityBuildings.some(b=>overlaps(feature,b,12))&&Math.hypot(feature.x+feature.w/2-cx,feature.y+feature.h/2-cy)>75)parkFeatures.push(feature);
      }
      const treeCount=style.trees===0?(noise(col,row,9)<.18?1:0):Math.floor(noise(col,row,10)*style.trees)+ (district==='park'?2:0);
      for(let n=0;n<treeCount;n++) {
        const tx=pad.x+12+noise(col*7+n,row*5+n,11)*(pad.w-36),ty=pad.y+16+noise(col*3+n,row*9+n,12)*(pad.h-42);
        const tree={x:tx-9,y:ty-9,w:18,h:18,variant:Math.floor(noise(col+n,row-n,13)*4),district};
        if(buildings.some(b=>overlaps(tree,b,16))||cityBuildings.some(b=>overlaps(tree,b,12))||parkFeatures.some(f=>overlaps(tree,f,8))||Math.hypot(tx-cx,ty-cy)<85)continue;
        if(trees.some(t=>Math.hypot(t.x-tx,t.y-ty)<35))continue;
        trees.push(tree);
      }
    }
  }

  function resizeCanvas() {
    const dpr=Math.min(window.devicePixelRatio||1,2), rect=canvas.getBoundingClientRect();
    canvas.width=Math.max(1,Math.floor(rect.width*dpr)); canvas.height=Math.max(1,Math.floor(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize',resizeCanvas);
  function dimensions() { const r=canvas.getBoundingClientRect(); return {w:r.width,h:r.height}; }
  function screenPos(x,y) { return {x:x-camera.x,y:y-camera.y}; }
  function circleHitsBuilding(x,y,r,b) {
    const nearX=Math.max(b.x,Math.min(x,b.x+b.w)),nearY=Math.max(b.y,Math.min(y,b.y+b.h));
    return Math.hypot(x-nearX,y-nearY)<r;
  }
  function blockedByBuilding(x,y,r) { return buildings.some(b=>circleHitsBuilding(x,y,r,b))||cityBuildings.some(b=>circleHitsBuilding(x,y,r,b))||trees.some(t=>circleHitsBuilding(x,y,r,t))||parkFeatures.some(f=>circleHitsBuilding(x,y,r,f)); }
  function pushOutOfBuildings(entity,r=entity.r) {
    for(const b of [...cityBuildings,...buildings,...trees,...parkFeatures]) {
      if(!circleHitsBuilding(entity.x,entity.y,r,b))continue;
      const nearX=Math.max(b.x,Math.min(entity.x,b.x+b.w)),nearY=Math.max(b.y,Math.min(entity.y,b.y+b.h));
      let dx=entity.x-nearX,dy=entity.y-nearY,d=Math.hypot(dx,dy);
      if(d<.001) {
        const sides=[{d:entity.x-b.x,dx:-1,dy:0},{d:b.x+b.w-entity.x,dx:1,dy:0},{d:entity.y-b.y,dx:0,dy:-1},{d:b.y+b.h-entity.y,dx:0,dy:1}].sort((a,b)=>a.d-b.d);
        entity.x+=sides[0].dx*(sides[0].d+r+1);entity.y+=sides[0].dy*(sides[0].d+r+1);
      } else {
        const amount=r-d+.5;entity.x+=dx/d*amount;entity.y+=dy/d*amount;
      }
    }
  }
  function moveCircle(entity,dx,dy,r=entity.r) {
    pushOutOfBuildings(entity,r);
    const nextX=Math.max(r,Math.min(WORLD.w-r,entity.x+dx));
    if(!blockedByBuilding(nextX,entity.y,r))entity.x=nextX;
    const nextY=Math.max(r,Math.min(WORLD.h-r,entity.y+dy));
    if(!blockedByBuilding(entity.x,nextY,r))entity.y=nextY;
  }
  function drawBuilding(b) {
    const {x,y,w,h}=b, wall=b.looted?'#4b5048':b.color, roof=b.type==='house'?'#4a4540':b.type==='radio'?'#46535a':'#414a43';
    if(drawBounds&&(x+w<drawBounds.left-40||x>drawBounds.right+40||y+h<drawBounds.top-50||y>drawBounds.bottom+50))return;
    ctx.fillStyle='rgba(0,0,0,.34)';ctx.fillRect(x+11,y+13,w,h);
    ctx.fillStyle='#3c443d';ctx.fillRect(x-7,y-7,w+14,h+14);
    ctx.fillStyle='#222b26';ctx.fillRect(x,y,w,h);
    ctx.fillStyle=wall;ctx.fillRect(x+4,y+4,w-8,h-8);
    // A framed roof with seams, water stains and missing patches.
    ctx.fillStyle=roof;ctx.fillRect(x+9,y+8,w-18,h-27);
    ctx.strokeStyle='#737568';ctx.lineWidth=2;ctx.strokeRect(x+9,y+8,w-18,h-27);
    ctx.strokeStyle='rgba(183,177,151,.32)';ctx.lineWidth=1;
    for(let seam=0;seam<4;seam++){const yy=y+18+seam*14;ctx.beginPath();ctx.moveTo(x+13,yy);ctx.lineTo(x+w-14,yy);ctx.stroke();}
    ctx.fillStyle='#2b332e';ctx.fillRect(x+13,y+h-25,w-26,15);
    // Street-facing windows and a recessed entry make the building read as a place to explore.
    for(const wx of [x+18,x+w-49]) {
      ctx.fillStyle='#252d28';ctx.fillRect(wx,y+h-53,31,22);
      ctx.fillStyle=b.type==='clinic'?'#9fbac0':'#758c83';ctx.fillRect(wx+3,y+h-50,25,16);
      ctx.fillStyle='#d1c6a5';ctx.fillRect(wx+14,y+h-51,3,18);ctx.fillRect(wx+3,y+h-42,25,2);
      if(b.variant%3===1){ctx.strokeStyle='#d6cdb3';ctx.beginPath();ctx.moveTo(wx+5,y+h-48);ctx.lineTo(wx+12,y+h-43);ctx.lineTo(wx+8,y+h-36);ctx.stroke();}
    }
    const doorX=x+w/2-11;
    ctx.fillStyle='#222722';ctx.fillRect(doorX-3,y+h-37,28,38);
    ctx.fillStyle=b.type==='shelter'?'#8da978':'#594b3c';ctx.fillRect(doorX,y+h-34,22,34);
    ctx.fillStyle='#d9c27b';ctx.fillRect(doorX+16,y+h-18,3,3);
    ctx.fillStyle='#67695e';ctx.fillRect(doorX-7,y+h-2,36,5);
    // Distinctive damage and readable site-specific details.
    if(b.type==='store') {
      for(let stripe=0;stripe<6;stripe++){ctx.fillStyle=stripe%2?'#a66b51':'#d0b17b';ctx.fillRect(x+12+stripe*19,y+h-62,19,7);}
      ctx.fillStyle='#252b26';ctx.fillRect(x+w/2-30,y+15,60,13);ctx.fillStyle='#e4d6ad';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText('SUPPLIES',x+w/2,y+24);
    } else if(b.type==='clinic') {
      ctx.fillStyle='#e1d9c6';ctx.fillRect(x+w-34,y+14,18,18);ctx.fillStyle='#b55e54';ctx.fillRect(x+w-27,y+17,5,12);ctx.fillRect(x+w-31,y+21,13,4);
    } else if(b.type==='radio') {
      ctx.strokeStyle='#1c2421';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+w-28,y+18);ctx.lineTo(x+w-28,y-12);ctx.moveTo(x+w-41,y-5);ctx.lineTo(x+w-15,y-5);ctx.stroke();
      ctx.strokeStyle='#d9bd70';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+w-28,y-10,12,3.7,5.7);ctx.stroke();
    } else if(b.type==='depot') {
      ctx.fillStyle='#252c28';ctx.fillRect(x+13,y+23,w-26,27);ctx.fillStyle='#77796c';
      for(let slat=0;slat<5;slat++)ctx.fillRect(x+17,y+26+slat*5,w-34,2);
    } else if(b.type==='shelter') {
      ctx.fillStyle='#d6e1cb';ctx.fillRect(x+15,y+14,55,13);ctx.fillStyle='#4e7558';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText('SAFE ZONE',x+42,y+23);
    } else {
      ctx.fillStyle='#252b27';ctx.beginPath();ctx.moveTo(x+78,y+11);ctx.lineTo(x+99,y+9);ctx.lineTo(x+93,y+28);ctx.lineTo(x+80,y+32);ctx.closePath();ctx.fill();
      ctx.fillStyle='#9b6b4d';ctx.fillRect(x+83,y+16,5,4);ctx.fillRect(x+96,y+35,7,3);
    }
    // Loose bricks and broken concrete sit around the walls without blocking the walkways.
    ctx.fillStyle='#777466';ctx.fillRect(x-5,y+h+4,12,5);ctx.fillRect(x+w-7,y-4,9,5);
    ctx.fillStyle='#9b7257';ctx.fillRect(x+w+2,y+h-19,8,5);ctx.fillRect(x-8,y+28,6,4);
    ctx.fillStyle='#e2d7b7';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText(b.looted?'SEARCHED':b.name,x+w/2,y+h+22);
    if(b.type==='shelter'){ctx.strokeStyle='#9cbd89';ctx.lineWidth=3;ctx.strokeRect(x-5,y-5,w+10,h+10);}
  }
  function drawCityBuilding(b) {
    const {x,y,w,h,variant:v}=b;
    if(drawBounds&&(x+w<drawBounds.left-40||x>drawBounds.right+40||y+h<drawBounds.top-50||y>drawBounds.bottom+50))return;
    const walls=['#807568','#77796d','#8b7769','#6f7770'][v%4];
    const roofs=['#424a45','#4b4842','#464d51','#514941'][v%4];
    // Deep foundation, chipped concrete walls, and a roof broken into readable sections.
    ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(x+12,y+14,w,h);
    ctx.fillStyle='#373e39';ctx.fillRect(x-6,y-6,w+12,h+12);
    ctx.fillStyle='#252d29';ctx.fillRect(x,y,w,h);
    ctx.fillStyle=walls;ctx.fillRect(x+5,y+5,w-10,h-10);
    ctx.fillStyle=roofs;ctx.fillRect(x+11,y+10,w-22,h-57);
    ctx.strokeStyle='#9a8d73';ctx.lineWidth=3;ctx.strokeRect(x+10,y+9,w-20,h-55);
    ctx.strokeStyle='rgba(197,185,153,.35)';ctx.lineWidth=1;
    for(let seam=0;seam<5;seam++){const yy=y+23+seam*19;ctx.beginPath();ctx.moveTo(x+16,yy);ctx.lineTo(x+w-18,yy);ctx.stroke();}
    // Roof vents, collapsed patches, and exposed beams vary from block to block.
    ctx.fillStyle='#2b332f';ctx.fillRect(x+22,y+24,30,18);ctx.fillRect(x+w-52,y+33,27,14);
    ctx.fillStyle='#747367';ctx.fillRect(x+25,y+27,24,4);ctx.fillRect(x+25,y+34,24,4);
    ctx.fillStyle=v%2?'#292f2c':'#6c5545';ctx.beginPath();ctx.moveTo(x+w-73,y+13);ctx.lineTo(x+w-48,y+17);ctx.lineTo(x+w-61,y+43);ctx.lineTo(x+w-83,y+37);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#292e2b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+74,y+17);ctx.lineTo(x+83,y+44);ctx.lineTo(x+69,y+59);ctx.stroke();
    // Broken front windows and a boarded entry establish scale and make each face legible.
    const frontY=y+h-52;
    ctx.fillStyle='#323934';ctx.fillRect(x+8,frontY,w-16,43);
    for(let n=0;n<3;n++) {
      const wx=x+15+n*49;
      ctx.fillStyle='#242d29';ctx.fillRect(wx,frontY+5,34,26);
      ctx.fillStyle=v%3===0?'#516967':'#5d6962';ctx.fillRect(wx+3,frontY+8,28,20);
      ctx.strokeStyle='#b5aa8b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(wx+17,frontY+7);ctx.lineTo(wx+17,frontY+31);ctx.moveTo(wx+3,frontY+19);ctx.lineTo(wx+31,frontY+19);ctx.stroke();
      ctx.strokeStyle='#d1c4a4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(wx+5,frontY+10);ctx.lineTo(wx+14,frontY+17);ctx.lineTo(wx+9,frontY+26);ctx.stroke();
    }
    const doorX=x+w/2-11;
    ctx.fillStyle='#202722';ctx.fillRect(doorX,frontY+8,23,35);ctx.fillStyle='#59493a';ctx.fillRect(doorX+3,frontY+12,17,31);
    ctx.fillStyle='#bda976';ctx.fillRect(doorX+15,frontY+27,3,3);
    // Faded storefront sign, apartment number, and scattered masonry give each ruin a different story.
    ctx.fillStyle=v%2?'#473d34':'#363f3b';ctx.fillRect(x+22,y+h-68,w-44,9);
    ctx.fillStyle=v%2?'#d0aa72':'#c2c1a8';ctx.font='bold 7px sans-serif';ctx.textAlign='center';
    ctx.fillText(['NO ENTRY','BLOCK 04','SUPPLIES','EVACUATED'][v%4],x+w/2,y+h-61);
    ctx.fillStyle='#777466';ctx.fillRect(x-9,y+h+4,18,6);ctx.fillRect(x+w-6,y-5,12,5);ctx.fillRect(x+w+2,y+34,7,11);
    ctx.fillStyle='#9b7257';ctx.fillRect(x+8,y+h+7,9,5);ctx.fillRect(x+w-17,y+h+5,13,4);
    ctx.fillStyle='#d0c6a8';ctx.fillRect(x-4,y+24,5,3);ctx.fillRect(x+w-1,y+h-23,7,4);
  }
  function nearestThing() {
    let best=null, dist=Infinity;
    for (const b of buildings) {
      const nearX=Math.max(b.x,Math.min(player.x,b.x+b.w)),nearY=Math.max(b.y,Math.min(player.y,b.y+b.h));
      const d=Math.hypot(player.x-nearX,player.y-nearY);
      if (d<dist && d<62) {best={kind:'building',item:b,d};dist=d;}
    }
    if (survivor && !survivor.rescued) {
      const d=Math.hypot(player.x-survivor.x,player.y-survivor.y);
      if(d<dist&&d<70){best={kind:'survivor',item:survivor,d};dist=d;}
    }
    return best;
  }

  function interact() {
    if(state!=='playing') return;
    const near=nearestThing();
    if(near?.kind==='building') {
      const b=near.item;
      if(b.looted){showToast(b.name+' has already been searched.');return;}
      b.looted=true;
      const roll=Math.random();
      if(roll<.24){const weapons=['pistol','rifle','grenade','rpg','minigun'];const found=weapons[Math.floor(Math.random()*weapons.length)];player.weapon=found;player.ammo=magazineSize(found);player.reloadLeft=0;showToast('Found a ' + found.toUpperCase() + ' in the ' + b.name.toLowerCase() + '!');}
      else if(roll<.47){player.armor+=25;showToast('Armor plates found. +25 armor.');}
      else if(roll<.65){bombCount++;showToast('Found a bomb. Press Q to throw it.');}
      else if(roll<.77){airstrikeCount++;showToast('Radio codes found. Press F for an airstrike.');}
      else if(roll<.9){player.hp=Math.min(player.maxHp,player.hp+35);showToast('Medical supplies: +35 health.');}
      else {credits+=35;showToast('Supply cache: +35 supplies.');}
      return;
    }
    if(near?.kind==='survivor') {
      survivor.rescued=true; survivor.following=true;
      showToast('Survivor rescued! Escort them to the marked shelter.');
      return;
    }
    showToast('Nothing close enough to interact with.');
  }

  function startWave() {
    if(state==='prep'){
      state='playing';wave++;quota=10+(wave-1)*5;kills=0;waveSpawned=0;prepLeft=20;spawnAccumulator=0;$('prepBanner').hidden=true;$('upgradePanel').hidden=true;showToast('Wave '+wave+': eliminate '+quota+' infected.');}
  }
  function clearWave() {
    state='prep'; prepLeft=20; zombies=[]; bullets=[]; save.tokens++; save.bestWave=Math.max(save.bestWave,wave); saveNow();
    $('prepBanner').hidden=false; $('prepTitle').textContent='Wave '+wave+' complete'; $('prepTimer').textContent='Next wave in 20'; showToast('Wave cleared! +1 spin token and supplies.');
  }

  function toggleUpgrades() {
    if(state!=='prep') {showToast('The quartermaster is available between waves.');return;}
    upgradeOpen=!upgradeOpen; $('upgradePanel').hidden=!upgradeOpen; if(upgradeOpen) renderUpgrades();
  }
  const upgradeOptions=[
    {name:'Trauma kit',desc:'+30 maximum health and heal 30 HP',cost:55,apply:()=>{player.maxHp+=30;player.hp=Math.min(player.maxHp,player.hp+30);}},
    {name:'Weapon training',desc:'+20% damage',cost:65,apply:()=>{player.attack*=1.2;}},
    {name:'Quick reload',desc:'Fire 18% faster',cost:60,apply:()=>{player.fireRate*=1.18;}},
    {name:'Reinforced vest',desc:'+30 armor',cost:50,apply:()=>{player.armor+=30;}},
    {name:'Field rations',desc:'+1 bomb and heal 15 HP',cost:45,apply:()=>{bombCount++;player.hp=Math.min(player.maxHp,player.hp+15);}},
    {name:'Boot conditioning',desc:'+10% movement speed',cost:50,apply:()=>{player.speed*=1.1;}}
  ];
  function renderUpgrades() {
    $('upgradeCredits').textContent=credits; const root=$('upgradeList');root.innerHTML='';
    upgradeOptions.forEach((u)=>{
      const b=document.createElement('button');b.className='upgrade-option';b.innerHTML='<span><b>'+u.name+'</b><small>'+u.desc+'</small></span><strong>'+u.cost+' <small>SUPPLIES</small></strong>';
      b.disabled=credits<u.cost;b.addEventListener('click',()=>{if(credits<u.cost)return;credits-=u.cost;u.apply();renderUpgrades();showToast(u.name+' purchased.');});root.appendChild(b);
    });
  }

  function spawnZombie() {
    const side=Math.floor(Math.random()*4), margin=45;
    const view=dimensions(), viewW=view.w/CAMERA_ZOOM, viewH=view.h/CAMERA_ZOOM;
    let x=side===0?camera.x-30:side===1?camera.x+viewW+30:camera.x+Math.random()*viewW;
    let y=side===2?camera.y-30:side===3?camera.y+viewH+30:camera.y+Math.random()*viewH;
    x=Math.max(margin,Math.min(WORLD.w-margin,x));y=Math.max(margin,Math.min(WORLD.h-margin,y));
    const brute=wave>2&&Math.random()<Math.min(.35,.08+wave*.02);
    waveSpawned++;zombies.push({x,y,r:brute?17:12,hp:brute?3+Math.floor(wave/3):1+Math.floor(wave/5),maxHp:brute?3+Math.floor(wave/3):1+Math.floor(wave/5),speed:brute?25+wave:34+Math.min(wave*1.5,28),damage:brute?13:8,attackTimer:0,color:brute?'#91715e':'#87947b',dead:false});
  }
  function aimTarget() {
    const mouseWorld={x:pointer.x/CAMERA_ZOOM+camera.x,y:pointer.y/CAMERA_ZOOM+camera.y};
    if(!autoAim && (pointer.down||touch.fire)) return mouseWorld;
    let target=null, d=Infinity;
    zombies.forEach(z=>{const n=Math.hypot(player.x-z.x,player.y-z.y);if(n<d){d=n;target=z;}});
    return target||mouseWorld;
  }

  function magazineSize(weapon) {
    return ({pistol:12,rifle:30,grenade:6,rpg:4,minigun:100,heli:120,tank:8})[weapon] || Infinity;
  }
  function reloadDuration(weapon) {
    return ({pistol:1.25,rifle:1.8,grenade:2.3,rpg:2.8,minigun:4.2,heli:3.2,tank:3})[weapon] || 0;
  }
  function updateReload(dt) {
    if(!player || player.weapon==='knife') return;
    if(player.reloadLeft>0) {
      player.reloadLeft=Math.max(0,player.reloadLeft-dt);
      if(player.reloadLeft===0) { player.ammo=magazineSize(player.weapon); showToast(player.weapon.toUpperCase()+' reloaded.'); }
    } else if(player.ammo<=0) {
      player.reloadLeft=reloadDuration(player.weapon);
      if(player.reloadLeft>0) showToast('Magazine empty - reloading '+player.weapon.toUpperCase()+'...');
    }
  }
  function fireWeapon() {
    if(fireCooldown>0 || player.reloadLeft>0)return;
    const target=aimTarget(); let dx=target.x-player.x,dy=target.y-player.y,dist=Math.hypot(dx,dy)||1;dx/=dist;dy/=dist;
    const weapon=player.weapon;
    const cfg={
      knife:{rate:.55,damage:1.6,speed:0,range:55,count:1,radius:0},
      pistol:{rate:.65,damage:1.1,speed:520,range:430,count:1,radius:0},
      rifle:{rate:.42,damage:1,speed:620,range:520,count:1,radius:0},
      grenade:{rate:1.3,damage:2.8,speed:300,range:360,count:1,radius:74},
      rpg:{rate:1.7,damage:4.2,speed:340,range:420,count:1,radius:100},
      minigun:{rate:.15,damage:.65,speed:590,range:480,count:1,radius:0},
      heli:{rate:.25,damage:1.25,speed:620,range:520,count:2,radius:0},
      tank:{rate:1.15,damage:4.8,speed:330,range:500,count:1,radius:110}
    }[weapon]||{rate:.4,damage:1,speed:500,range:400,count:1,radius:0};
    if(weapon!=='knife' && player.ammo<cfg.count){player.ammo=0;updateReload(0);return;}
    fireCooldown=cfg.rate/player.fireRate;
    if(weapon==='knife'){
      zombies.forEach(z=>{const zx=z.x-player.x,zy=z.y-player.y,d=Math.hypot(zx,zy);if(d<cfg.range&&zx*dx+zy*dy>0)damageZombie(z,cfg.damage*player.attack);});
      effects.push({type:'slash',x:player.x+dx*26,y:player.y+dy*26,life:.15,max:.15,dx,dy});
      return;
    }
    player.ammo-=cfg.count;
    for(let i=0;i<cfg.count;i++){
      const spread=(i-(cfg.count-1)/2)*.12, vx=dx*Math.cos(spread)-dy*Math.sin(spread),vy=dx*Math.sin(spread)+dy*Math.cos(spread);
      bullets.push({x:player.x+vx*18,y:player.y+vy*18,vx:vx*cfg.speed,vy:vy*cfg.speed,damage:cfg.damage*player.attack,life:cfg.range/cfg.speed,radius:cfg.radius,kind:cfg.radius?'explosive':'bullet'});
    }
  }
  function damageZombie(z,damage) {
    if(z.dead)return; z.hp-=damage;
    if(z.hp<=0){z.dead=true;kills++;credits+=5+Math.min(wave,10);const amount=1+Math.floor(Math.random()*2);pickups.push({x:z.x,y:z.y,r:5,value:amount,kind:'xp'});if(kills>=quota&&state==='playing')clearWave();}
  }

  function useBomb() {
    if(state!=='playing'||bombCount<1)return;bombCount--;
    const target=aimTarget(), x=target.x,y=target.y;
    effects.push({type:'blast',x,y,life:.65,max:.65,r:120});
    zombies.forEach(z=>{if(Math.hypot(z.x-x,z.y-y)<125)damageZombie(z,5*player.attack);});
    showToast('Bomb away!');
  }
  function callAirstrike() {
    if(state!=='playing'||airstrikeCount<1)return;airstrikeCount--;
    const target=aimTarget(), x=target.x,y=target.y;effects.push({type:'blast',x,y,life:1.1,max:1.1,r:210});
    zombies.forEach(z=>{if(Math.hypot(z.x-x,z.y-y)<215)damageZombie(z,9*player.attack);});
    showToast('Airstrike inbound!');
  }

  function movePlayer(dt) {
    let mx=0,my=0;
    if(keys.KeyA||keys.ArrowLeft||touch.left)mx--;if(keys.KeyD||keys.ArrowRight||touch.right)mx++;
    if(keys.KeyW||keys.ArrowUp||touch.up)my--;if(keys.KeyS||keys.ArrowDown||touch.down)my++;
    const len=Math.hypot(mx,my)||1;
    moveCircle(player,mx/len*player.speed*dt,my/len*player.speed*dt);
  }
  function update(dt) {
    worldTime+=dt;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)hideToast();}
    fireCooldown=Math.max(0,fireCooldown-dt);if(player.invuln>0)player.invuln-=dt;updateReload(dt);
    if(state==='prep'){
      movePlayer(dt);
      prepLeft-=dt;$('prepTimer').textContent='Next wave in '+Math.max(0,Math.ceil(prepLeft));
      if(upgradeOpen)renderUpgrades();
      if(prepLeft<=0)startWave();
    } else if(state==='playing') {
      let mx=0,my=0;
      if(keys.KeyA||keys.ArrowLeft||touch.left)mx--;if(keys.KeyD||keys.ArrowRight||touch.right)mx++;
      if(keys.KeyW||keys.ArrowUp||touch.up)my--;if(keys.KeyS||keys.ArrowDown||touch.down)my++;
      const len=Math.hypot(mx,my)||1;moveCircle(player,mx/len*player.speed*dt,my/len*player.speed*dt);
      if((autoAim&&zombies.length>0)||pointer.down||touch.fire)fireWeapon();
      spawnAccumulator+=dt;
      const maxAlive=Math.min(5,quota-kills), interval=Math.max(.55,1.45-wave*.03);
      if(spawnAccumulator>interval&&zombies.filter(z=>!z.dead).length<maxAlive&&waveSpawned<quota){spawnAccumulator=0;spawnZombie();}
      zombies.forEach(z=>{
        if(z.dead)return;
        const dx=player.x-z.x,dy=player.y-z.y,d=Math.hypot(dx,dy)||1;
        if(d>player.r+z.r+2){moveCircle(z,dx/d*z.speed*dt,dy/d*z.speed*dt,z.r);}
        else if(z.attackTimer<=0){z.attackTimer=.8;let damage=z.damage;if(player.armor>0){const absorbed=Math.min(player.armor,damage);player.armor-=absorbed;damage-=absorbed;}player.hp-=damage;player.invuln=.25;if(player.hp<=0)endGame();}
        z.attackTimer=Math.max(0,z.attackTimer-dt);
      });
      bullets.forEach(b=>{
        b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
        if(b.life<=0)return;
        const hit=zombies.find(z=>!z.dead&&Math.hypot(z.x-b.x,z.y-b.y)<z.r+5);
        if(hit){if(b.radius){effects.push({type:'blast',x:b.x,y:b.y,life:.4,max:.4,r:b.radius});zombies.forEach(z=>{if(Math.hypot(z.x-b.x,z.y-b.y)<b.radius)damageZombie(z,b.damage);});}else damageZombie(hit,b.damage);b.life=0;}
      });
      bullets=bullets.filter(b=>b.life>0);zombies=zombies.filter(z=>!z.dead);
      pickups.forEach(p=>{const d=Math.hypot(player.x-p.x,player.y-p.y);if(d<player.r+20){xp+=p.value;if(xp>=xpNext)levelUp();p.collected=true;}});pickups=pickups.filter(p=>!p.collected);
      if(survivor?.following){const follow=Math.min(1,dt*3);moveCircle(survivor,(player.x-25-survivor.x)*follow,(player.y+20-survivor.y)*follow,8);if(Math.hypot(player.x-survivor.shelter.x,player.y-survivor.shelter.y)<95){survivor=null;credits+=75;save.tokens+=1;saveNow();showToast('Survivor safely escorted! +75 supplies and +1 spin token.');}}
      rescueTimer-=dt;if(rescueTimer<=0&&!survivor){spawnRescue();rescueTimer=65+Math.random()*35;}
      if(kills>=quota&&state==='playing')clearWave();
    }
    effects.forEach(e=>e.life-=dt);effects=effects.filter(e=>e.life>0);
    const dim=dimensions(),viewW=dim.w/CAMERA_ZOOM,viewH=dim.h/CAMERA_ZOOM;
    camera.x=Math.max(0,Math.min(WORLD.w-viewW,player.x-viewW/2));camera.y=Math.max(0,Math.min(WORLD.h-viewH,player.y-viewH/2));
    updateHud();
  }

  function spawnRescue() {
    const angle=Math.random()*Math.PI*2,d=220;
    const sx=Math.max(50,Math.min(WORLD.w-50,player.x+Math.cos(angle)*d)),sy=Math.max(50,Math.min(WORLD.h-50,player.y+Math.sin(angle)*d));
    const shelter=buildings.find(b=>b.type==='shelter');
    survivor={x:sx,y:sy,rescued:false,following:false,shelter:{x:shelter.x+shelter.w/2,y:shelter.y+shelter.h/2}};
    showToast('Distress call! Find the survivor and escort them to the safehouse.');
  }

  function levelUp() {
    xp-=xpNext;level++;xpNext=Math.floor(xpNext*1.45+4);
    const choices=[
      {name:'Combat drills',desc:'+15% attack damage',apply:()=>player.attack*=1.15},
      {name:'Adrenaline',desc:'+15% movement speed',apply:()=>player.speed*=1.15},
      {name:'First aid',desc:'+25 max health and heal 25',apply:()=>{player.maxHp+=25;player.hp=Math.min(player.maxHp,player.hp+25);}},
      {name:'Rapid fire',desc:'+15% fire rate',apply:()=>player.fireRate*=1.15}
    ].sort(()=>Math.random()-.5).slice(0,3);
    const box=document.createElement('div');box.className='levelup-overlay';box.id='levelupOverlay';
    box.innerHTML='<div class="levelup-card"><p class="eyebrow">FIELD EXPERIENCE</p><h2>LEVEL '+level+' · CHOOSE AN UPGRADE</h2><div class="levelup-choices"></div></div>';
    const list=box.querySelector('.levelup-choices');
    choices.forEach(c=>{const b=document.createElement('button');b.innerHTML='<b>'+c.name+'</b><small>'+c.desc+'</small>';b.onclick=()=>{c.apply();box.remove();showToast(c.name+' acquired.');};list.appendChild(b);});
    $('gameScreen').appendChild(box);
  }

  function endGame() {
    if(state==='gameover')return;state='gameover';save.bestWave=Math.max(save.bestWave,wave);saveNow();
    $('endTitle').textContent='SIGNAL LOST';$('endSummary').textContent='You reached wave '+wave+', cleared '+kills+' infected, and earned '+credits+' supplies. Best wave: '+save.bestWave+'.';
    $('gameScreen').hidden=true;$('endScreen').hidden=false;
  }

  function updateHud() {
    if(!player)return;
    $('waveText').textContent=wave;$('killText').textContent=kills+' / '+quota;$('creditText').textContent=credits;
    $('healthFill').style.width=Math.max(0,player.hp/player.maxHp*100)+'%';$('healthText').textContent=Math.max(0,Math.ceil(player.hp))+' / '+player.maxHp+(player.armor?' · '+Math.ceil(player.armor)+' armor':'');
    $('xpFill').style.width=Math.min(100,xp/xpNext*100)+'%';$('levelText').textContent='LV '+level;
    $('weaponHud').textContent=player.weapon.toUpperCase()+(player.weapon==='knife'?' · MELEE':player.reloadLeft>0?' · RELOADING '+player.reloadLeft.toFixed(1)+'s':' · '+player.ammo+'/'+magazineSize(player.weapon))+' · Q '+bombCount+' · F '+airstrikeCount;
    const near=nearestThing();$('interactHint').textContent=near?(near.kind==='survivor'?(near.item.rescued?'ESCORT TO SAFEHOUSE':'E · Rescue survivor'):'E · Search '+near.item.name):'E · Search nearby';
  }

  function drawGroundFoliage() {
    // Stable scattered scrub keeps every frame identical and leaves streets clear.
    for(let i=0;i<2080;i++) {
      const x=(i*173+47)%WORLD.w,y=(i*293+91)%WORLD.h;
      if(drawBounds&&(x<drawBounds.left-16||x>drawBounds.right+16||y<drawBounds.top-16||y>drawBounds.bottom+16))continue;
      const roadX=x%260,roadY=y%260;
      if(roadX<72||roadY<64)continue;
      const size=5+(i%5),shade=i%4;
      ctx.fillStyle='rgba(24,31,24,.2)';ctx.fillRect(x-2,y+3,size+7,3);
      ctx.fillStyle=shade===0?'#465b3d':shade===1?'#596b43':shade===2?'#68734a':'#7c7849';
      ctx.fillRect(x,y,size,3);ctx.fillRect(x+2,y-3,3,6);ctx.fillRect(x+size-2,y-5,3,8);ctx.fillRect(x+size+1,y-2,3,5);
      if(i%9===0) {
        ctx.fillStyle='#8c8a53';ctx.fillRect(x+size+5,y-1,3,3);
        ctx.fillStyle='#d0be78';ctx.fillRect(x+size+6,y-2,2,2);
      }
      if(i%7===0) {
        ctx.fillStyle='#41483b';ctx.fillRect(x-5,y-7,4,8);ctx.fillRect(x-2,y-11,5,8);ctx.fillRect(x+2,y-7,4,8);
        ctx.fillStyle='#66714a';ctx.fillRect(x-3,y-7,3,4);ctx.fillRect(x+1,y-10,3,4);
      }
    }
  }

  function drawCityBlock(b) {
    const x=b.x+68,y=b.y+58,w=188,h=198,v=b.variation;
    if(drawBounds&&(x+w<drawBounds.left||x>drawBounds.right||y+h<drawBounds.top||y>drawBounds.bottom))return;
    ctx.fillStyle=b.ground;ctx.fillRect(x,y,w,h);
    if(b.district==='park') {
      ctx.fillStyle='rgba(35,83,46,.32)';ctx.fillRect(x+12,y+15,w-24,h-30);
      ctx.fillStyle='#92866a';ctx.fillRect(x+5,y+h*.47,w-10,8);
      if(v>.42){ctx.fillStyle='#9a906f';ctx.fillRect(x+w*.48,y+5,8,h-10);}
      ctx.fillStyle='rgba(164,177,102,.38)';ctx.fillRect(x+18,y+25,23,11);ctx.fillRect(x+w-43,y+h-42,24,12);
    } else if(b.district==='industrial') {
      ctx.fillStyle='rgba(40,43,37,.27)';ctx.fillRect(x+12,y+13,w-24,h-25);
      ctx.fillStyle='rgba(133,85,53,.46)';ctx.fillRect(x+24,y+31,35,13);ctx.fillRect(x+w-51,y+h-49,28,18);
      ctx.strokeStyle='rgba(189,168,119,.35)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+17,y+h*.56);ctx.lineTo(x+w-18,y+h*.56);ctx.stroke();
    } else if(b.district==='downtown'||b.district==='civic') {
      ctx.fillStyle='rgba(154,144,115,.3)';ctx.fillRect(x+9,y+12,w-18,9);ctx.fillRect(x+13,y+h-24,w-26,7);
      ctx.fillStyle='rgba(42,48,43,.22)';ctx.fillRect(x+24,y+38,21,12);ctx.fillRect(x+w-48,y+h-65,29,14);
    } else {
      ctx.fillStyle=b.district==='overgrown'?'rgba(33,83,42,.32)':'rgba(45,68,40,.23)';
      ctx.fillRect(x+15,y+16,34,22);ctx.fillRect(x+w-52,y+31,33,17);ctx.fillRect(x+34,y+h-45,28,20);
      if(v>.5){ctx.fillStyle='rgba(145,132,94,.44)';ctx.fillRect(x+w*.48,y+8,18,h-16);}
    }
    // A few chipped paving stones and leaf mats stop the terrain colors from reading as flat tiles.
    const chipX=x+18+Math.floor(v*91),chipY=y+26+Math.floor(v*113);
    ctx.fillStyle='rgba(39,46,38,.32)';ctx.fillRect(chipX,chipY,13,5);ctx.fillRect(x+w-32,y+48,7,4);
    if(v>.68){ctx.fillStyle='rgba(188,163,106,.48)';ctx.fillRect(x+72,y+h-35,19,4);ctx.fillRect(x+101,y+h-39,11,5);}
  }

  function drawTree(tree) {
    const x=tree.x+9,y=tree.y+10,v=tree.variant;
    if(drawBounds&&(x<drawBounds.left-38||x>drawBounds.right+38||y<drawBounds.top-50||y>drawBounds.bottom+38))return;
    ctx.fillStyle='rgba(20,27,22,.35)';ctx.fillRect(x-17,y+8,36,8);
    ctx.fillStyle='#4f4432';ctx.fillRect(x-3,y-1,7,20);ctx.fillRect(x-9,y+7,7,4);
    if(v===0) {
      ctx.fillStyle='#314b34';ctx.fillRect(x-17,y-23,34,28);ctx.fillRect(x-12,y-31,24,14);
      ctx.fillStyle='#597548';ctx.fillRect(x-13,y-21,25,15);ctx.fillRect(x-6,y-29,13,12);ctx.fillRect(x+8,y-13,8,11);
      ctx.fillStyle='#849052';ctx.fillRect(x-7,y-23,7,5);ctx.fillRect(x+3,y-15,6,4);
    } else if(v===1) {
      ctx.fillStyle='#384b35';ctx.beginPath();ctx.moveTo(x,y-39);ctx.lineTo(x-20,y+2);ctx.lineTo(x+20,y+2);ctx.closePath();ctx.fill();
      ctx.fillStyle='#60744a';ctx.beginPath();ctx.moveTo(x,y-31);ctx.lineTo(x-14,y-1);ctx.lineTo(x+14,y-1);ctx.closePath();ctx.fill();
      ctx.fillStyle='#876d47';ctx.fillRect(x-2,y-1,5,18);
    } else if(v===2) {
      ctx.fillStyle='#344b36';ctx.fillRect(x-22,y-17,18,23);ctx.fillRect(x-9,y-29,22,27);ctx.fillRect(x+6,y-18,18,22);
      ctx.fillStyle='#637a4a';ctx.fillRect(x-17,y-15,13,15);ctx.fillRect(x-5,y-26,15,18);ctx.fillRect(x+10,y-15,11,13);
      ctx.fillStyle='#899257';ctx.fillRect(x-9,y-23,7,5);ctx.fillRect(x+5,y-14,6,5);
    } else {
      ctx.strokeStyle='#544735';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,y+16);ctx.lineTo(x,y-20);ctx.lineTo(x-12,y-31);ctx.moveTo(x,y-12);ctx.lineTo(x+13,y-27);ctx.moveTo(x-4,y-14);ctx.lineTo(x-17,y-17);ctx.stroke();
      ctx.fillStyle='#697348';ctx.fillRect(x-20,y-22,8,6);ctx.fillRect(x+11,y-31,9,7);ctx.fillRect(x-7,y-37,8,6);
    }
  }

  function drawParkFeature(feature) {
    const {x,y,w,h,type}=feature;
    if(drawBounds&&(x+w<drawBounds.left-20||x>drawBounds.right+20||y+h<drawBounds.top-20||y>drawBounds.bottom+20))return;
    ctx.fillStyle='rgba(20,27,22,.3)';ctx.fillRect(x+3,y+h-1,w+3,6);
    if(type==='fountain') {
      ctx.fillStyle='#7b7868';ctx.fillRect(x-3,y-3,w+6,h+6);
      ctx.fillStyle='#b4a987';ctx.fillRect(x+2,y+2,w-4,h-4);
      ctx.fillStyle='#456f72';ctx.fillRect(x+6,y+6,w-12,h-12);
      ctx.fillStyle='#92b2a0';ctx.fillRect(x+w/2-3,y+5,6,h-10);ctx.fillRect(x+5,y+h/2-3,w-10,6);
      ctx.fillStyle='#d2c69b';ctx.fillRect(x+w/2-2,y+h/2-2,4,4);
    } else {
      ctx.fillStyle='#393f38';ctx.fillRect(x+3,y+2,w-6,4);ctx.fillRect(x+2,y+8,w-4,4);
      ctx.fillStyle='#8d7958';ctx.fillRect(x+4,y+3,w-8,3);ctx.fillRect(x+3,y+9,w-6,3);
      ctx.fillStyle='#494538';ctx.fillRect(x+5,y+11,3,7);ctx.fillRect(x+w-8,y+11,3,7);
    }
  }

  function drawRoadWear() {
    // Cracks, patched asphalt, and worn crosswalk paint make the grid read as streets.
    for(let rx=0;rx<WORLD.w;rx+=260) {
      if(drawBounds&&(rx+62<drawBounds.left||rx>drawBounds.right))continue;
      for(let y=116;y<WORLD.h;y+=347) {
        if(drawBounds&&(y<drawBounds.top-30||y>drawBounds.bottom+30))continue;
        const x=rx+12+(Math.floor(y/347)%3)*13;
        ctx.strokeStyle='rgba(24,29,26,.55)';ctx.lineWidth=2;ctx.beginPath();
        ctx.moveTo(x,y);ctx.lineTo(x+7,y+7);ctx.lineTo(x+2,y+15);ctx.lineTo(x+11,y+23);ctx.stroke();
        ctx.strokeStyle='rgba(178,165,126,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+2,y+1);ctx.lineTo(x+8,y+8);ctx.stroke();
      }
      for(let y=156;y<WORLD.h;y+=520) {
        ctx.fillStyle='#353a35';ctx.fillRect(rx+9,y,17,7);ctx.fillStyle='#596057';ctx.fillRect(rx+11,y+1,12,3);
      }
    }
    for(let ry=0;ry<WORLD.h;ry+=260) {
      if(drawBounds&&(ry+54<drawBounds.top||ry>drawBounds.bottom))continue;
      for(let x=148;x<WORLD.w;x+=389) {
        if(drawBounds&&(x<drawBounds.left-30||x>drawBounds.right+30))continue;
        const y=ry+12+(Math.floor(x/389)%3)*11;
        ctx.strokeStyle='rgba(24,29,26,.5)';ctx.lineWidth=2;ctx.beginPath();
        ctx.moveTo(x,y);ctx.lineTo(x+8,y+6);ctx.lineTo(x+3,y+14);ctx.lineTo(x+14,y+22);ctx.stroke();
      }
    }
    // Small zebra marks and drain covers at the busiest intersections.
    for(let x=260;x<WORLD.w;x+=520) for(let y=260;y<WORLD.h;y+=520) {
      if(drawBounds&&(x<drawBounds.left-60||x>drawBounds.right+60||y<drawBounds.top-60||y>drawBounds.bottom+60))continue;
      ctx.fillStyle='rgba(195,185,146,.5)';
      for(let stripe=0;stripe<4;stripe++)ctx.fillRect(x-26+stripe*14,y+7,7,3);
      ctx.fillStyle='#343a35';ctx.fillRect(x+37,y+38,13,8);
      ctx.strokeStyle='#77796e';ctx.lineWidth=1;ctx.strokeRect(x+39,y+40,9,4);
    }
  }

  function draw() {
    if($('gameScreen').hidden||!player)return;
    const {w,h}=dimensions();
    drawBounds={left:camera.x-72,top:camera.y-72,right:camera.x+w/CAMERA_ZOOM+72,bottom:camera.y+h/CAMERA_ZOOM+72};
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#202c28';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.scale(CAMERA_ZOOM,CAMERA_ZOOM);ctx.translate(-camera.x,-camera.y);
    ctx.imageSmoothingEnabled=false;ctx.fillStyle='#536746';ctx.fillRect(0,0,WORLD.w,WORLD.h);
    if(tilePatterns.sand){ctx.globalAlpha=.08;ctx.fillStyle=tilePatterns.sand;ctx.fillRect(0,0,WORLD.w,WORLD.h);ctx.globalAlpha=1;}
    cityBlocks.forEach(drawCityBlock);
    drawGroundFoliage();
    for(let rx=0;rx<WORLD.w;rx+=260) {
      if(rx+68<drawBounds.left||rx>drawBounds.right)continue;
      const top=Math.max(0,drawBounds.top),bottom=Math.min(WORLD.h,drawBounds.bottom),length=bottom-top;
      ctx.fillStyle='#484e48';ctx.fillRect(rx,top,62,length);
      if(tilePatterns.stone){ctx.globalAlpha=.2;ctx.fillStyle=tilePatterns.stone;ctx.fillRect(rx,top,62,length);ctx.globalAlpha=1;}
      ctx.fillStyle='#77766a';ctx.fillRect(rx-4,top,4,length);ctx.fillRect(rx+62,top,5,length);
      ctx.fillStyle='rgba(27,32,29,.34)';ctx.fillRect(rx+8,top,2,length);ctx.fillRect(rx+52,top,2,length);
      ctx.setLineDash([18,24]);ctx.strokeStyle='rgba(196,182,137,.72)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rx+31,top);ctx.lineTo(rx+31,bottom);ctx.stroke();ctx.setLineDash([]);
      for(let yy=Math.floor(top/260)*260+28;yy<bottom;yy+=260){ctx.fillStyle='#c1b58b';ctx.fillRect(rx+5,yy,7,3);ctx.fillRect(rx+50,yy,7,3);}
    }
    for(let ry=0;ry<WORLD.h;ry+=260) {
      if(ry+59<drawBounds.top||ry>drawBounds.bottom)continue;
      const left=Math.max(0,drawBounds.left),right=Math.min(WORLD.w,drawBounds.right),length=right-left;
      ctx.fillStyle='#484e48';ctx.fillRect(left,ry,length,54);
      if(tilePatterns.stone){ctx.globalAlpha=.2;ctx.fillStyle=tilePatterns.stone;ctx.fillRect(left,ry,length,54);ctx.globalAlpha=1;}
      ctx.fillStyle='#77766a';ctx.fillRect(left,ry-4,length,4);ctx.fillRect(left,ry+54,length,5);
      ctx.fillStyle='rgba(27,32,29,.34)';ctx.fillRect(left,ry+8,length,2);ctx.fillRect(left,ry+44,length,2);
      ctx.setLineDash([18,24]);ctx.strokeStyle='rgba(196,182,137,.72)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,ry+27);ctx.lineTo(right,ry+27);ctx.stroke();ctx.setLineDash([]);
    }
    drawRoadWear();
    for(let i=0;i<380;i++) {
      const x=(i*197+83)%WORLD.w,y=(i*313+47)%WORLD.h;
      if(x<drawBounds.left-36||x>drawBounds.right+36||y<drawBounds.top-36||y>drawBounds.bottom+36)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate((i%7)*.31);
      ctx.fillStyle=i%3===0?'#353b36':i%3===1?'#827c68':'#4d5148';
      if(i%5===0){ctx.fillRect(-11,-5,24,10);ctx.fillStyle='#a5a18b';ctx.fillRect(-7,-7,8,3);}
      else {ctx.beginPath();ctx.moveTo(-6,2);ctx.lineTo(1,-7);ctx.lineTo(8,1);ctx.lineTo(4,6);ctx.closePath();ctx.fill();}
      ctx.restore();
      if(i%8===0){ctx.strokeStyle='#353a34';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+9,y-5);ctx.lineTo(x+21,y+5);ctx.lineTo(x+31,y+1);ctx.stroke();}
    }
    [[154,31,0],[523,291,.2],[1100,31,0],[1522,551,.2],[2050,1051,0],[780,811,.2],[2630,31,.1],[3150,291,-.2],[3910,551,.2],[2370,831,-.15],[3620,1091,.1],[2630,1351,.2],[4190,1611,-.2],[3150,1871,.15],[3910,2131,.1],[2370,2391,-.2],[3620,2651,.15],[154,2911,-.1],[1100,2651,.2],[1850,2911,-.2]].forEach(([x,y,a],i)=>{
      if(x<drawBounds.left-60||x>drawBounds.right+60||y<drawBounds.top-60||y>drawBounds.bottom+60)return;
      ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(1.65,1.65);
      // Larger, damaged silhouettes make the abandoned cars easy to spot at a glance.
      ctx.fillStyle='rgba(0,0,0,.34)';ctx.fillRect(-25,-10,52,23);
      ctx.fillStyle=i%2?'#343b36':'#292f2b';ctx.strokeStyle='#141a17';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-25,-8);ctx.lineTo(-17,-12);ctx.lineTo(13,-11);ctx.lineTo(25,-6);ctx.lineTo(23,8);ctx.lineTo(15,11);ctx.lineTo(-21,9);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle=i%2?'#626c62':'#59635a';ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(-5,-10);ctx.lineTo(7,-9);ctx.lineTo(11,-2);ctx.lineTo(-12,-2);ctx.closePath();ctx.fill();
      ctx.fillStyle='#202925';ctx.beginPath();ctx.moveTo(-10,1);ctx.lineTo(10,1);ctx.lineTo(15,8);ctx.lineTo(-14,7);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#b9b5a1';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-5,-9);ctx.lineTo(-1,-5);ctx.lineTo(-4,-2);ctx.moveTo(3,-8);ctx.lineTo(1,-5);ctx.lineTo(6,-3);ctx.stroke();
      ctx.fillStyle='#a45f3d';ctx.fillRect(-22,-5,5,4);ctx.fillRect(12,4,7,3);ctx.fillRect(-4,7,5,2);
      ctx.fillStyle='#d4bd72';ctx.fillRect(20,-5,3,3);ctx.fillRect(20,3,3,3);
      ctx.fillStyle='#111714';ctx.fillRect(-18,-13,9,5);ctx.fillRect(10,-13,9,5);ctx.fillRect(-18,9,9,5);ctx.fillRect(10,9,9,5);
      ctx.fillStyle='#858578';ctx.fillRect(-27,-8,4,4);ctx.fillRect(24,7,6,2);
      ctx.restore();
    });
    cityBuildings.forEach(drawCityBuilding);
    parkFeatures.forEach(drawParkFeature);
    trees.forEach(drawTree);
    buildings.forEach(drawBuilding);
    if(survivor){
      ctx.fillStyle=survivor.following?'#b6d59c':'#f1d083';ctx.beginPath();ctx.arc(survivor.x,survivor.y,9,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.fillText(survivor.following?'FOLLOWING':'SURVIVOR · E',survivor.x,survivor.y-16);
      if(survivor.following){ctx.strokeStyle='rgba(182,213,156,.45)';ctx.beginPath();ctx.moveTo(survivor.x,survivor.y);ctx.lineTo(survivor.shelter.x,survivor.shelter.y);ctx.stroke();}
    }
    pickups.forEach(p=>{ctx.fillStyle='#e4ca68';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});
    bullets.forEach(b=>{ctx.fillStyle=b.kind==='explosive'?'#f3a45e':'#f1e6a8';ctx.beginPath();ctx.arc(b.x,b.y,b.kind==='explosive'?5:3,0,Math.PI*2);ctx.fill();});
    zombies.forEach(z=>{ctx.fillStyle=z.color;ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#bdc5a3';ctx.fillRect(z.x-5,z.y-4,3,3);ctx.fillRect(z.x+3,z.y-4,3,3);if(z.hp<z.maxHp){ctx.fillStyle='#321f1c';ctx.fillRect(z.x-z.r,z.y-z.r-7,z.r*2,3);ctx.fillStyle='#b44f43';ctx.fillRect(z.x-z.r,z.y-z.r-7,z.r*2*Math.max(0,z.hp/z.maxHp),3);}});
    effects.forEach(e=>{const a=Math.max(0,e.life/e.max);if(e.type==='blast'){ctx.globalAlpha=a*.55;ctx.fillStyle='#f4a555';ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-a*.45),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}else{ctx.strokeStyle='#f3e7bd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(e.x-e.dy*22,e.y+e.dx*22);ctx.lineTo(e.x+e.dy*22,e.y-e.dx*22);ctx.stroke();}});
    const target=aimTarget(),angle=Math.atan2(target.y-player.y,target.x-player.x);
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(angle);
    ctx.fillStyle=player.invuln>0?'#f6a29a':player.color;
    if(player.weapon==='heli'){ctx.fillRect(-player.r,-player.r/2,player.r*2,player.r);ctx.strokeStyle='#c1d2bd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-player.r*1.5,-player.r*1.4);ctx.lineTo(player.r*1.5,-player.r*1.4);ctx.stroke();}
    else if(player.weapon==='tank'){ctx.fillRect(-player.r,-player.r*.72,player.r*2,player.r*1.44);ctx.fillStyle='#c4b789';ctx.fillRect(0,-4,player.r*1.7,8);}
    else {ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#18211d';ctx.fillRect(2,-3,player.r+10,6);}
    ctx.restore();
    ctx.restore();
    if(state==='playing'&&pointer.x>0){ctx.strokeStyle='rgba(235,229,196,.65)';ctx.beginPath();ctx.arc(pointer.x,pointer.y,7,0,Math.PI*2);ctx.moveTo(pointer.x-11,pointer.y);ctx.lineTo(pointer.x+11,pointer.y);ctx.moveTo(pointer.x,pointer.y-11);ctx.lineTo(pointer.x,pointer.y+11);ctx.stroke();}
  }

  function frame(now) {
    if(state==='menu'||state==='gameover')return;
    const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;
    update(dt);draw();
    if(state!=='gameover')requestAnimationFrame(frame);
  }

  window.addEventListener('keydown',e=>{
    keys[e.code]=true;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='KeyR'){autoAim=!autoAim;$('aimHud').textContent=autoAim?'AUTO-AIM ON · R':'MANUAL AIM · R';showToast(autoAim?'Auto-aim enabled.':'Manual aim: hold mouse or FIRE to shoot.');}
    if(e.code==='KeyE')interact();
    if(e.code==='KeyB')toggleUpgrades();
    if(e.code==='ShiftLeft'||e.code==='ShiftRight')startWave();
    if(e.code==='KeyQ')useBomb();
    if(e.code==='KeyF')callAirstrike();
  });
  window.addEventListener('keyup',e=>{keys[e.code]=false;});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;});
  canvas.addEventListener('pointerdown',e=>{if(e.button===0){pointer.down=true;canvas.setPointerCapture?.(e.pointerId);}});
  window.addEventListener('pointerup',()=>{pointer.down=false;});
  document.querySelectorAll('[data-menu-tab]').forEach(button=>button.addEventListener('click',()=>setMenuView(button.dataset.menuTab)));
  $('startButton').addEventListener('click',beginGame);
  $('spinButton').addEventListener('click',spinGacha);
  $('upgradeButton').addEventListener('click',toggleUpgrades);
  $('closeUpgrade').addEventListener('click',()=>{upgradeOpen=false;$('upgradePanel').hidden=true;});
  $('nextWaveButton').addEventListener('click',startWave);
  $('returnMenu').addEventListener('click',()=>{$('endScreen').hidden=true;$('menu').hidden=false;state='menu';renderRoster();setMenuView('main');});
  $('mobileShoot').addEventListener('pointerdown',e=>{e.preventDefault();touch.fire=true;});
  $('mobileShoot').addEventListener('pointerup',()=>touch.fire=false);
  $('mobileShoot').addEventListener('pointercancel',()=>touch.fire=false);
  $('mobileInteract').addEventListener('click',interact);
  document.querySelectorAll('[data-move]').forEach(b=>{
    const dir=b.dataset.move;
    const set=(v)=>{touch[dir]=v;};
    b.addEventListener('pointerdown',e=>{e.preventDefault();set(true);b.setPointerCapture?.(e.pointerId);});
    b.addEventListener('pointerup',()=>set(false));b.addEventListener('pointercancel',()=>set(false));b.addEventListener('lostpointercapture',()=>set(false));
  });
  window.addEventListener('blur',()=>{keys={};touch={};pointer.down=false;});
  updateTokens();renderRoster();setMenuView("main");
})();












