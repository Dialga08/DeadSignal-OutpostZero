(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const characterSprites = {bert: new Image()};
  characterSprites.bert.src = 'assets/characters/bert-chester.png?v=3';
  const weaponSprites = {knife:new Image(),pistol:new Image(),rifle:new Image()};
  weaponSprites.knife.src = 'assets/weapons/combat-knife.svg?v=1';
  weaponSprites.pistol.src = 'assets/weapons/m17-pistol.png?v=1';
  weaponSprites.rifle.src = 'assets/weapons/m4-rifle.png?v=1';
  const weaponSlotSprite = new Image();
  weaponSlotSprite.src = 'assets/gun-slot-machine.png?v=2';
  const characterSlotSprite = new Image();
  characterSlotSprite.src = 'assets/character-slot-machine.png?v=1';
  const slotRarityOrder = ['common','uncommon','rare','epic','legendary'];
  const slotRarityColors = {common:'#90969c',uncommon:'#39a95a',rare:'#3e83d4',epic:'#a450bd',legendary:'#e58a32'};
  const WEAPON_LOOT_ICON = {pistol:'pistol',rifle:'rifle',grenade:'grenadeLauncher',rpg:'rpg',minigun:'minigun'};
  const WEAPON_LOOT_LABEL = {pistol:'M17 pistol',rifle:'M4 rifle',grenade:'grenade launcher',rpg:'RPG',minigun:'minigun'};
  const LOOT_ICON_GLYPHS = {money:'$',armor:'ARM',grenade:'G',radio:'RAD',bandage:'MED',medicKit:'MED',pistol:'PST',rifle:'RIF',grenadeLauncher:'GL',rpg:'RPG',minigun:'MG'};
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
    { id:'rookie', name:'Bert Chester', sprite:'bert', rarity:'Common', weapon:'knife', hp:85, attack:1.01, speed:98, color:'#c8d5cb', size:14, desc:'A steady recruit. Starts with a combat knife.' }
  ];
  const rarityClass = (s) => s.toLowerCase();
  const defaultSave = { coins:0, rankXp:0, unlocked:['rookie'], selected:'rookie', unlockedWeapons:['operator'], selectedWeapon:'operator', operatorRank:1, rankBonus:{hp:0,attack:0,speed:0}, bestWave:0 };
  let save = loadSave();
  let state = 'menu', lastFrame = 0, toastTimer = 0, rescueTimer = 50, levelChoices = null;
  let player, zombies = [], bullets = [], pickups = [], buildings = [], cityBlocks = [], cityBuildings = [], trees = [], parkFeatures = [], survivor = null, effects = [];
  let keys = {}, pointer = {x:0,y:0,down:false}, touch = {}, wave = 1, quota = 10, kills = 0, totalKills = 0, credits = 0, prepLeft = 20;
  let autoAim = false, upgradeOpen = false, fireCooldown = 0, bombCount = 1, airstrikeCount = 0, spawnAccumulator = 0, eliteDefeatedThisWave = false;
  let runRewardsBanked = false;
  let worldTime = 0, level = 1, xp = 0, xpNext = 10, camera = {x:0,y:0}, drawBounds = null, waveSpawned = 0, insideBuilding = null;

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      const loaded = parsed && Array.isArray(parsed.unlocked) ? {...defaultSave, ...parsed} : {...defaultSave};
      // Bert Chester is the only playable character; remove older roster unlocks from saved games.
      loaded.unlocked = ['rookie'];
      loaded.selected = 'rookie';
      const rankBonus=loaded.rankBonus&&typeof loaded.rankBonus==='object'?loaded.rankBonus:{};
      loaded.rankBonus={hp:Math.max(0,Math.floor(Number(rankBonus.hp)||0)),attack:Math.max(0,Math.floor(Number(rankBonus.attack)||0)),speed:Math.max(0,Math.floor(Number(rankBonus.speed)||0))};
      loaded.operatorRank=Math.min(25,1+loaded.rankBonus.hp+loaded.rankBonus.attack+loaded.rankBonus.speed);
      loaded.rankXp=Math.max(0,Math.floor(Number(loaded.rankXp)||0));
      if (!Array.isArray(loaded.unlockedWeapons)) loaded.unlockedWeapons = ['operator'];
      if (!loaded.unlockedWeapons.includes('operator')) loaded.unlockedWeapons.unshift('operator');
      if (!loaded.unlockedWeapons.includes(loaded.selectedWeapon)) loaded.selectedWeapon = 'operator';
      if (parsed && parsed.coins === undefined) loaded.coins = Math.max(0, Number(parsed.tokens) || 0) * 5;
      delete loaded.tokens;
      loaded.coins = Math.max(0, Number(loaded.coins) || 0);
      return loaded;
    } catch (_) { return {...defaultSave}; }
  }
  function saveNow() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
    updateWallet();
  }
  function selectedChar() { return rosterData.find(c => c.id === save.selected) || rosterData[0]; }
  function updateWallet() {
    ['coinCount','coinCountArmory','coinCountBarracks'].forEach(id => { const node=$(id); if(node) node.textContent=save.coins; });
  }
  function operatorStats(c=selectedChar()) {
    return {hp:c.hp+save.rankBonus.hp*3,attack:c.attack+save.rankBonus.attack*0.02,speed:c.speed+save.rankBonus.speed};
  }
  function rankXpCost() { return 15+(save.operatorRank-1)*3; }
  function renderPermanentUpgrades() {
    const stats=operatorStats();
    const cost=rankXpCost();
    $('operatorRank').textContent=save.operatorRank+' / 25';
    $('rankXpCount').textContent=save.rankXp;
    $('rankXpProgress').textContent=save.operatorRank>=25?'MAX RANK REACHED':'Next rank: '+save.rankXp+' / '+cost+' XP';
    $('rankHp').textContent=stats.hp;
    $('rankAttack').textContent=stats.attack.toFixed(2)+'×';
    $('rankSpeed').textContent=stats.speed;
    $('rankHpBonus').textContent='+'+(save.rankBonus.hp*3)+' total';
    $('rankAttackBonus').textContent='+'+(save.rankBonus.attack*0.02).toFixed(2)+' total';
    $('rankSpeedBonus').textContent='+'+save.rankBonus.speed+' total';
    document.querySelectorAll('.rank-choice').forEach(button=>{
      button.disabled=save.operatorRank>=25||save.rankXp<cost;
      button.querySelector('strong').textContent=save.operatorRank>=25?'MAX RANK':cost+' XP';
    });
  }
  function purchaseRank(stat) {
    if(save.operatorRank>=25){$('rankUpMessage').textContent='Bert has reached the maximum rank.';return;}
    const cost=rankXpCost();
    if(save.rankXp<cost){$('rankUpMessage').textContent='You need '+cost+' XP for the next rank. Survive longer and eliminate more infected.';return;}
    if(!['hp','attack','speed'].includes(stat))return;
    save.rankXp-=cost;save.operatorRank++;save.rankBonus[stat]++;saveNow();
    renderPermanentUpgrades();renderRoster();
    const gain={hp:'+3 starting HP',attack:'+0.02 attack',speed:'+1 speed'}[stat];
    $('rankUpMessage').textContent='Rank '+save.operatorRank+' reached. Bert gains '+gain+'.';
  }
  function drawSlotMachine(canvas, rarity='common') {
    if(!canvas)return;
    canvas.dataset.rarity=rarity;
    const sprite=canvas.id==='characterSlotCanvas'?characterSlotSprite:weaponSlotSprite;
    if(!sprite.complete||!sprite.naturalWidth)return;
    const crop=document.createElement('canvas');crop.width=28;crop.height=31;
    const cropCtx=crop.getContext('2d',{willReadFrequently:true});
    cropCtx.imageSmoothingEnabled=false;
    cropCtx.drawImage(sprite,31,26,28,31,0,0,28,31);
    const image=cropCtx.getImageData(0,0,28,31),hex=slotRarityColors[rarity]||slotRarityColors.common;
    const color=[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
    // Tint only the three reel windows; preserve the machine's outlines and red 7s.
    for(let y=7;y<=13;y++)for(let x=5;x<=22;x++){
      const i=(y*28+x)*4,d=image.data;
      if(d[i]>210&&d[i+1]>210&&d[i+2]>210){d[i]=color[0];d[i+1]=color[1];d[i+2]=color[2];}
    }
    cropCtx.putImageData(image,0,0);
    const out=canvas.getContext('2d');out.imageSmoothingEnabled=false;out.clearRect(0,0,canvas.width,canvas.height);out.drawImage(crop,0,0,canvas.width,canvas.height);
  }
  function redrawSlotMachines() {
    drawSlotMachine($('weaponSlotCanvas'),$('weaponSlotCanvas').dataset.rarity||'common');
    drawSlotMachine($('characterSlotCanvas'),$('characterSlotCanvas').dataset.rarity||'common');
  }
  weaponSlotSprite.addEventListener('load',redrawSlotMachines);
  characterSlotSprite.addEventListener('load',redrawSlotMachines);
  function spinSlotColors(canvas,finalRarity) {
    let step=0;
    drawSlotMachine(canvas,slotRarityOrder[step]);
    const interval=window.setInterval(()=>{step=(step+1)%slotRarityOrder.length;drawSlotMachine(canvas,slotRarityOrder[step]);},125);
    window.setTimeout(()=>{window.clearInterval(interval);drawSlotMachine(canvas,finalRarity);},1000);
  }
  function showToast(message, iconName) {
    const el = $('toast');
    el.replaceChildren();
    const glyph=iconName&&LOOT_ICON_GLYPHS[iconName];
    el.classList.toggle('has-icon',Boolean(glyph));
    if(glyph) {
      const icon=document.createElement('span');icon.className='loot-glyph';icon.textContent=glyph;icon.setAttribute('aria-hidden','true');el.appendChild(icon);
    }
    const text=document.createElement('span');text.textContent=message;el.appendChild(text);
    el.hidden = false; toastTimer = 3;
  }
  function hideToast() { $('toast').hidden = true; }
  function drawMoneyIcon(ctx,cx,cy,size) {
    const w=size,h=size*.62,x=cx-w/2,y=cy-h/2;
    ctx.fillStyle='#22392b';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#b8d77b';ctx.lineWidth=Math.max(1,size/12);ctx.strokeRect(x+1,y+1,w-2,h-2);
    ctx.fillStyle='#b8d77b';ctx.font='bold '+Math.max(10,size*.55)+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('$',cx,cy);ctx.textBaseline='alphabetic';
  }
  function drawHuman(x,y,angle,frame,radius,color,invulnerable,weapon) {
    const a=((angle%(Math.PI*2))+(Math.PI*2))%(Math.PI*2);
    // Bert's sheet uses four directions (down, left, right, up), with four frames per row.
    const row=a<Math.PI/4||a>=Math.PI*7/4?2:a<Math.PI*3/4?0:a<Math.PI*5/4?1:a<Math.PI*7/4?3:2;
    const sprite=characterSprites.bert;
    const frameWidth=19,frameHeight=21,frameX=10+(frame%4)*frameWidth,frameY=4+row*frameHeight;
    if(sprite.complete&&sprite.naturalWidth>=86&&sprite.naturalHeight>=88) {
      const size=radius*3.25,height=size*frameHeight/frameWidth;
      ctx.globalAlpha=invulnerable?.58:1;
      ctx.drawImage(sprite,frameX,frameY,frameWidth,frameHeight,x-size/2,y-height/2,size,height);
      ctx.globalAlpha=1;
    } else {
      ctx.fillStyle=invulnerable?'#f6a29a':color;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    }
    if(weapon==='knife'&&weaponSprites.knife.complete&&weaponSprites.knife.naturalWidth) {
      // The supplied knife artwork points upward; rotate it to follow the aim direction.
      ctx.save();
      ctx.translate(x+Math.cos(angle)*radius*.58,y+Math.sin(angle)*radius*.58);
      ctx.rotate(angle+Math.PI/2);
      ctx.imageSmoothingEnabled=false;
      const knifeWidth=Math.max(8,radius*.72),knifeHeight=Math.max(20,radius*1.8);
      ctx.drawImage(weaponSprites.knife,-knifeWidth/2,-knifeHeight/2,knifeWidth,knifeHeight);
      ctx.restore();
    } else if(weapon==='pistol'&&weaponSprites.pistol.complete&&weaponSprites.pistol.naturalWidth) {
      ctx.save();
      ctx.translate(x+Math.cos(angle)*radius*.62,y+Math.sin(angle)*radius*.62);
      ctx.rotate(angle);
      ctx.imageSmoothingEnabled=false;
      const pistolSize=radius*2.6;
      ctx.drawImage(weaponSprites.pistol,-pistolSize/2,-pistolSize/2,pistolSize,pistolSize);
      ctx.restore();
    } else if(weapon==='rifle'&&weaponSprites.rifle.complete&&weaponSprites.rifle.naturalWidth) {
      ctx.save();
      ctx.translate(x+Math.cos(angle)*radius*.52,y+Math.sin(angle)*radius*.52);
      ctx.rotate(angle);
      ctx.imageSmoothingEnabled=false;
      const rifleWidth=radius*4.2,rifleHeight=rifleWidth*weaponSprites.rifle.naturalHeight/weaponSprites.rifle.naturalWidth;
      ctx.drawImage(weaponSprites.rifle,-rifleWidth/2,-rifleHeight/2,rifleWidth,rifleHeight);
      ctx.restore();
    } else if(weapon&&weapon!=='knife') {
      const length=weapon==='rpg'?radius*2.05:weapon==='minigun'?radius*1.8:radius*1.55;
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);
      ctx.fillStyle='#202923';ctx.fillRect(2,-radius*.28,length,radius*.38);
      ctx.fillStyle='#596157';ctx.fillRect(5,-radius*.2,length*.68,radius*.18);
      ctx.fillStyle='#151b18';ctx.fillRect(length+1,-radius*.2,Math.max(3,radius*.35),radius*.2);
      ctx.fillStyle='#343c35';ctx.fillRect(radius*.38,radius*.08,radius*.32,radius*.52);
      ctx.restore();
    }
  }
  function updatePlayerMotion(fromX,fromY,toX,toY,dt) {
    player.moving=Math.hypot(toX-fromX,toY-fromY)>.05;
    player.walkTime=player.moving?player.walkTime+dt:0;
  }
  function playerAnimationFrame() { return player?.moving?Math.floor(player.walkTime*8)%4:0; }

  function renderRoster() {
    const root = $('roster'); root.innerHTML = '';
    save.unlocked.forEach(id => {
      const c = rosterData.find(item => item.id === id); if (!c) return;
      const card = document.createElement('button');
      card.className = 'operator-card' + (save.selected === id ? ' selected' : '');
      const portrait = document.createElement('span');
      portrait.className = 'operator-avatar' + (c.sprite ? ' has-sprite' : '');
      portrait.style.setProperty('--operator-color', c.color);
      portrait.setAttribute('aria-hidden', 'true');
      if (c.sprite && characterSprites[c.sprite]) {
        const portraitCanvas = document.createElement('canvas');
        portraitCanvas.className = 'operator-portrait';
        portraitCanvas.width = 76;
        portraitCanvas.height = 84;
        const portraitCtx = portraitCanvas.getContext('2d');
        portraitCtx.imageSmoothingEnabled = false;
        const drawPortrait = () => {
          const sprite = characterSprites[c.sprite];
          if (!sprite.complete || !sprite.naturalWidth) return;
          // Show Bert's first (front-facing) frame from the supplied sprite sheet.
          portraitCtx.clearRect(0, 0, portraitCanvas.width, portraitCanvas.height);
          portraitCtx.drawImage(sprite, 10, 4, 19, 21, 4, 0, 68, 84);
        };
        if (characterSprites[c.sprite].complete) drawPortrait();
        else characterSprites[c.sprite].addEventListener('load', drawPortrait, {once:true});
        portrait.appendChild(portraitCanvas);
      } else {
        portrait.textContent = c.weapon === 'heli' ? '✦' : c.weapon === 'tank' ? '▰' : '●';
      }
      const info = document.createElement('span');
      info.className = 'operator-info';
      const name = document.createElement('b'); name.textContent = c.name;
      const type = document.createElement('small'); type.textContent = c.rarity + ' · ' + c.weapon.toUpperCase();
      const current=operatorStats(c);
      const stats = document.createElement('small'); stats.textContent = current.hp + ' HP · ' + current.attack.toFixed(2) + ' ATK · ' + current.speed + ' SPD';
      info.append(name, type, stats);
      const status = document.createElement('span');
      status.className = 'select-mark';
      status.textContent = save.selected === id ? 'DEPLOYED' : 'SELECT';
      card.append(portrait, info, status);
      card.addEventListener('click', () => { save.selected = id; saveNow(); renderRoster(); });
      root.appendChild(card);
    });
    $('rosterHint').textContent = 'Rank '+save.operatorRank+' · permanent stats';
    const collectionCount = $('collectionCount');
    const collectionFill = $('collectionFill');
    if (collectionCount) collectionCount.textContent = save.unlocked.length + ' / ' + rosterData.length;
    if (collectionFill) collectionFill.style.width = (save.unlocked.length / rosterData.length * 100) + '%';
  }

  const prizeTable = [['rookie',100]];
  const weaponPrizes = [['pistol',50],['rifle',27],['grenade',15],['rpg',7.8],['minigun',0.2]];
  const weaponName = {operator:'Operator\'s default',pistol:'M17',rifle:'M4 Rifle',grenade:'Grenade Launcher',rpg:'RPG',minigun:'Minigun'};
  function weaponLabel(weapon) { return weapon==='pistol'?'M17':weapon==='rifle'?'M4':weapon.toUpperCase(); }
  const weaponRarity = {pistol:'common',rifle:'uncommon',grenade:'rare',rpg:'epic',minigun:'legendary'};
  function rollPrize(table) {
    const roll = Math.random() * 100;
    let sum = 0, selected = table[0][0];
    for (const [id, chance] of table) { sum += chance; if (roll < sum) { selected = id; break; } }
    return selected;
  }
  function renderWeaponInventory() {
    const root=$('weaponInventory');
    if(!root)return;
    root.replaceChildren();
    const ids=['operator','pistol','rifle','grenade','rpg','minigun'];
    ids.forEach(id=>{
      const unlocked=save.unlockedWeapons.includes(id);
      const button=document.createElement('button');
      button.type='button';
      button.className='weapon-choice'+(save.selectedWeapon===id?' selected':'')+(!unlocked?' locked':'');
      button.disabled=!unlocked;
      button.innerHTML='<b>'+weaponName[id]+'</b><small>'+(unlocked?(save.selectedWeapon===id?'EQUIPPED':'UNLOCKED'):'LOCKED')+'</small>';
      if(unlocked)button.addEventListener('click',()=>{save.selectedWeapon=id;saveNow();renderWeaponInventory();});
      root.appendChild(button);
    });
    const found=save.unlockedWeapons.filter(id=>id!=='operator').length;
    $('weaponCollectionCount').textContent=found+' / '+weaponPrizes.length;
    $('weaponCollectionFill').style.width=(found/weaponPrizes.length*100)+'%';
    $('weaponLoadoutHint').textContent=save.selectedWeapon==='operator'?"Using each operator's default weapon.":'Next deployment: '+weaponName[save.selectedWeapon]+'.';
  }
  function spinWeaponMachine() {
    if (save.coins < 3) { $('weaponGachaResult').textContent='You need 3 coins. Collect money during a run to afford a spin.'; return; }
    save.coins-=3; saveNow();
    const button=$('weaponSpinButton'),machine=$('weaponSlotCanvas');
    button.disabled=true;
    $('weaponGachaResult').textContent='The machine is rattling...';
    const selected=rollPrize(weaponPrizes);
    spinSlotColors(machine,weaponRarity[selected]);
    window.setTimeout(() => {
      if (!save.unlockedWeapons.includes(selected)) {
        save.unlockedWeapons.push(selected);
        save.selectedWeapon=selected;
        $('weaponGachaResult').innerHTML='<b class="rare">NEW WEAPON: '+weaponName[selected]+'</b><br>Unlocked and equipped for your next deployment.';
      } else {
        save.coins+=1;
        $('weaponGachaResult').innerHTML='<b>'+weaponName[selected]+' duplicate</b><br>Converted into 1 coin.';
      }
      saveNow();renderWeaponInventory();button.disabled=false;
    }, 1000);
  }
  function spinCharacterMachine() {
    if(save.coins<5){$('characterGachaResult').textContent='You need 5 coins. Collect money during a run to afford a spin.';return;}
    save.coins-=5;saveNow();
    const button=$('characterSpinButton'),machine=$('characterSlotCanvas');
    button.disabled=true;
    $('characterGachaResult').textContent='The machine is rattling...';
    const selected=rollPrize(prizeTable);
    const c=rosterData.find(item=>item.id===selected);
    spinSlotColors(machine,rarityClass(c.rarity));
    window.setTimeout(()=>{
      if(!save.unlocked.includes(c.id)){
        save.unlocked.push(c.id);
        $('characterGachaResult').innerHTML='<b class="'+rarityClass(c.rarity)+'">'+c.rarity.toUpperCase()+' RECRUIT: '+c.name+'</b><br>'+c.desc;
      }else{
        const refund=c.rarity==='Legendary'?5:c.rarity==='Epic'?4:c.rarity==='Rare'?3:c.rarity==='Uncommon'?2:1;
        save.coins+=refund;
        $('characterGachaResult').innerHTML='<b>'+c.name+' duplicate</b><br>Converted into '+refund+' coin'+(refund===1?'':'s')+'.';
      }
      saveNow();renderRoster();button.disabled=false;
    },1000);
  }

  function setMenuView(view) {
    const main=view==='main', armory=view==='armory', barracks=view==='barracks', upgrades=view==='upgrades';
    document.querySelector('.briefing').hidden=!main;
    document.querySelector('.armory-panel').hidden=!armory;
    document.querySelector('.barracks-panel').hidden=!barracks;
    document.querySelector('.upgrades-menu-panel').hidden=!upgrades;
    document.querySelector('.roster-panel').hidden=!barracks;
    document.querySelector('.menu-grid').classList.toggle('single-view',main||armory||barracks||upgrades);
    document.querySelectorAll('[data-menu-tab]').forEach(button=>button.classList.toggle('active',button.dataset.menuTab===view));
    if(upgrades)renderPermanentUpgrades();
  }

  function beginGame() {
    $('menu').hidden = true; $('endScreen').hidden = true; $('gameScreen').hidden = false;
    $('pauseOverlay').hidden = true;
    state='playing'; wave=1; quota=10; kills=0; totalKills=0; credits=0; zombies=[]; bullets=[]; pickups=[]; effects=[]; survivor=null; eliteDefeatedThisWave=false;runRewardsBanked=false;
    worldTime=0; level=1; xp=0; xpNext=10; rescueTimer=45; autoAim=false; upgradeOpen=false; bombCount=1; airstrikeCount=0; insideBuilding=null;
    const c = selectedChar();
    const weapon=save.selectedWeapon==='operator'?c.weapon:save.selectedWeapon;
    const base=operatorStats(c);
    player = {x:WORLD.w/2,y:WORLD.h/2,r:c.size,hp:base.hp,maxHp:base.hp,attack:base.attack,speed:base.speed,armor:0,fireRate:1,baseStats:{hp:base.hp,attack:base.attack,speed:base.speed,fireRate:1},weapon,baseWeapon:weapon,color:c.color,sprite:c.sprite||null,invuln:0,ammo:magazineSize(weapon),reloadLeft:0,moving:false,walkTime:0};
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
    templates.forEach((t,i) => buildings.push({name:t[0],type:t[1],color:t[2],x:spots[i][0],y:spots[i][1],w:190,h:142,looted:false,lootClaimed:false,lootIcon:'money',supplies:['store','depot','clinic'].includes(t[1]),variant:i}));
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
        const bw=150+Math.floor(noise(col,row,4)*27),bh=155+Math.floor(noise(col,row,5)*31);
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
    if(b.supplies) {
      ctx.fillStyle=b.lootClaimed?'#777568':'#e2c66e';ctx.fillRect(x+w/2-17,y+h+2,34,4);
      ctx.fillStyle='#f1d987';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText(b.lootClaimed?'LOOTED':'ENTER · E',x+w/2,y+h+34);
    }
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
    if(insideBuilding) {
      const p=insideBuilding,binDist=Math.hypot(p.playerX-510,p.playerY-125),doorDist=Math.hypot(p.playerX-320,p.playerY-365);
      if(binDist<54)return {kind:'loot-bin',d:binDist};
      if(doorDist<48)return {kind:'exit',d:doorDist};
      return null;
    }
    let best=null, dist=Infinity;
    for (const b of buildings) {
      if(b.supplies) {
        const d=Math.hypot(player.x-(b.x+b.w/2),player.y-(b.y+b.h));
        if(d<dist&&d<58){best={kind:'building',item:b,d};dist=d;}
        continue;
      }
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
    if(insideBuilding) {
      if(near?.kind==='loot-bin') {
        const b=insideBuilding.building;
        if(b.lootClaimed){showToast('The money bin is empty.');return;}
        b.lootClaimed=true;b.looted=true;
        const found=70+Math.floor(Math.random()*61);credits+=found;
        showToast('Money recovered from the '+b.name.toLowerCase()+': +$'+found+'.',b.lootIcon);return;
      }
      if(near?.kind==='exit') {
        const b=insideBuilding.building;insideBuilding=null;
        player.x=b.x+b.w/2;player.y=b.y+b.h+player.r+6;
        showToast('Back outside.');return;
      }
      showToast('Move beside the money bin or the exit door.');return;
    }
    if(near?.kind==='building') {
      const b=near.item;
      if(b.supplies) {insideBuilding={building:b,playerX:320,playerY:329};showToast('Inside '+b.name.toLowerCase()+'. Find the money bin, then use the door to exit.');return;}
      if(b.looted){showToast(b.name+' has already been searched.');return;}
      b.looted=true;
      const roll=Math.random();
      if(roll<.24){const weapons=['pistol','rifle','grenade','rpg','minigun'];const found=weapons[Math.floor(Math.random()*weapons.length)];player.weapon=found;player.ammo=magazineSize(found);player.reloadLeft=0;showToast('Found a '+WEAPON_LOOT_LABEL[found]+' in the '+b.name.toLowerCase()+'!',WEAPON_LOOT_ICON[found]);}
      else if(roll<.47){player.armor+=25;showToast('Found armor plates. +25 armor.','armor');}
      else if(roll<.65){bombCount++;showToast('Found a grenade. Press Q to throw it.','grenade');}
      else if(roll<.77){airstrikeCount++;showToast('Found an airstrike radio beacon. Press F to call it.','radio');}
      else if(roll<.9){const medicalItem=Math.random()<.5?'bandage':'medicKit';player.hp=Math.min(player.maxHp,player.hp+35);showToast((medicalItem==='bandage'?'Found bandages':'Found a medical kit')+': +35 health.',medicalItem);}
      else {credits+=35;showToast('Found a money stash: +$35.','money');}
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
      state='playing';wave++;quota=10+(wave-1)*5;kills=0;waveSpawned=0;prepLeft=20;spawnAccumulator=0;eliteDefeatedThisWave=false;$('prepBanner').hidden=true;$('upgradePanel').hidden=true;showToast('Wave '+wave+': eliminate '+quota+' infected.'+(wave%5===0?' An elite is expected.':''));}
  }
  function clearWave() {
    state='prep'; prepLeft=20; zombies=[]; bullets=[]; save.bestWave=Math.max(save.bestWave,wave); saveNow();
    $('prepBanner').hidden=false; $('prepTitle').textContent='Wave '+wave+' complete'; $('prepTimer').textContent='Next wave in 20'; showToast(eliteDefeatedThisWave?'Elite defeated! Collect its bonus money.':'Wave cleared! Spend zombie cash on upgrades.');
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
  function refreshUpgradeAffordability() {
    $('upgradeCredits').textContent='$'+credits;
    document.querySelectorAll('#upgradeList .upgrade-option').forEach(button=>{
      button.disabled=credits<Number(button.dataset.cost);
    });
  }
  function renderUpgrades() {
    const root=$('upgradeList');root.innerHTML='';
    upgradeOptions.forEach((u)=>{
      const b=document.createElement('button');b.className='upgrade-option';b.dataset.cost=u.cost;b.innerHTML='<span><b>'+u.name+'</b><small>'+u.desc+'</small></span><strong>$'+u.cost+' <small>MONEY</small></strong>';
      b.disabled=credits<u.cost;b.addEventListener('click',()=>{if(credits<u.cost)return;credits-=u.cost;u.apply();renderUpgrades();showToast(u.name+' purchased.');});root.appendChild(b);
    });
    refreshUpgradeAffordability();
  }

  function spawnZombie() {
    const side=Math.floor(Math.random()*4), margin=45;
    const view=dimensions(), viewW=view.w/CAMERA_ZOOM, viewH=view.h/CAMERA_ZOOM;
    let x=side===0?camera.x-30:side===1?camera.x+viewW+30:camera.x+Math.random()*viewW;
    let y=side===2?camera.y-30:side===3?camera.y+viewH+30:camera.y+Math.random()*viewH;
    x=Math.max(margin,Math.min(WORLD.w-margin,x));y=Math.max(margin,Math.min(WORLD.h-margin,y));
    const boss=wave%5===0&&waveSpawned===quota-1;
    const brute=wave>2&&Math.random()<Math.min(.35,.08+wave*.02);
    const hp=boss?18+wave*3:brute?3+Math.floor(wave/3):1+Math.floor(wave/5);
    waveSpawned++;zombies.push({x,y,r:boss?24:brute?17:12,hp,maxHp:hp,speed:boss?22+Math.min(wave,16):brute?25+wave:34+Math.min(wave*1.5,28),damage:boss?18:brute?13:8,attackTimer:0,color:boss?'#bb5746':brute?'#91715e':'#87947b',boss,dead:false});
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
      if(player.reloadLeft===0) { player.ammo=magazineSize(player.weapon); showToast(weaponLabel(player.weapon)+' reloaded.'); }
    } else if(player.ammo<=0) {
      player.reloadLeft=reloadDuration(player.weapon);
      if(player.reloadLeft>0) showToast('Magazine empty - reloading '+weaponLabel(player.weapon)+'...');
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
    if(z.hp<=0){
      z.dead=true;kills++;totalKills++;
      pickups.push({x:z.x-5,y:z.y,r:7,value:5+Math.min(wave,10),kind:'money'});
      const amount=1+Math.floor(Math.random()*2);pickups.push({x:z.x+6,y:z.y,r:5,value:amount,kind:'xp'});
      if(z.boss){pickups.push({x:z.x,y:z.y-12,r:9,value:40+Math.min(wave,20),kind:'money'});eliteDefeatedThisWave=true;}
      if(kills>=quota&&state==='playing')clearWave();
    }
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
    const fromX=player.x,fromY=player.y;
    let mx=0,my=0;
    if(keys.KeyA||keys.ArrowLeft||touch.left)mx--;if(keys.KeyD||keys.ArrowRight||touch.right)mx++;
    if(keys.KeyW||keys.ArrowUp||touch.up)my--;if(keys.KeyS||keys.ArrowDown||touch.down)my++;
    const len=Math.hypot(mx,my)||1;
    moveCircle(player,mx/len*player.speed*dt,my/len*player.speed*dt);
    updatePlayerMotion(fromX,fromY,player.x,player.y,dt);
  }
  function update(dt) {
    worldTime+=dt;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)hideToast();}
    if(insideBuilding) {
      const fromX=insideBuilding.playerX,fromY=insideBuilding.playerY;
      let mx=0,my=0;
      if(keys.KeyA||keys.ArrowLeft||touch.left)mx--;if(keys.KeyD||keys.ArrowRight||touch.right)mx++;
      if(keys.KeyW||keys.ArrowUp||touch.up)my--;if(keys.KeyS||keys.ArrowDown||touch.down)my++;
      const len=Math.hypot(mx,my)||1,speed=player.speed*dt;
      insideBuilding.playerX=Math.max(48,Math.min(592,insideBuilding.playerX+mx/len*speed));
      insideBuilding.playerY=Math.max(58,Math.min(352,insideBuilding.playerY+my/len*speed));
      updatePlayerMotion(fromX,fromY,insideBuilding.playerX,insideBuilding.playerY,dt);
      updateHud();return;
    }
    fireCooldown=Math.max(0,fireCooldown-dt);if(player.invuln>0)player.invuln-=dt;updateReload(dt);
    if(state==='prep'){
      movePlayer(dt);
      prepLeft-=dt;$('prepTimer').textContent='Next wave in '+Math.max(0,Math.ceil(prepLeft));
      if(upgradeOpen)refreshUpgradeAffordability();
      if(prepLeft<=0)startWave();
    } else if(state==='playing') {
      let mx=0,my=0;
      if(keys.KeyA||keys.ArrowLeft||touch.left)mx--;if(keys.KeyD||keys.ArrowRight||touch.right)mx++;
      if(keys.KeyW||keys.ArrowUp||touch.up)my--;if(keys.KeyS||keys.ArrowDown||touch.down)my++;
      const fromX=player.x,fromY=player.y;
      const len=Math.hypot(mx,my)||1;moveCircle(player,mx/len*player.speed*dt,my/len*player.speed*dt);
      updatePlayerMotion(fromX,fromY,player.x,player.y,dt);
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
      if(survivor?.following){const follow=Math.min(1,dt*3);moveCircle(survivor,(player.x-25-survivor.x)*follow,(player.y+20-survivor.y)*follow,8);if(Math.hypot(player.x-survivor.shelter.x,player.y-survivor.shelter.y)<95){survivor=null;credits+=75;saveNow();showToast('Survivor safely escorted! +$75.','money');}}
      rescueTimer-=dt;if(rescueTimer<=0&&!survivor){spawnRescue();rescueTimer=65+Math.random()*35;}
      if(kills>=quota&&state==='playing')clearWave();
    }
    if(state==='playing'||state==='prep'){
      pickups.forEach(p=>{const d=Math.hypot(player.x-p.x,player.y-p.y);if(d<player.r+20){if(p.kind==='money')credits+=p.value;else{xp+=p.value;if(xp>=xpNext)levelUp();}p.collected=true;}});
      pickups=pickups.filter(p=>!p.collected);
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

  function bankRunMoney() {
    const banked=Math.max(0,Math.floor(credits));
    if(banked){save.coins+=banked;credits=0;saveNow();}
    return banked;
  }
  function bankRunXp() {
    if(runRewardsBanked)return {timeXp:0,killXp:0,total:0};
    runRewardsBanked=true;
    const timeXp=Math.floor(worldTime/60),killXp=Math.floor(totalKills/10),total=timeXp+killXp;
    save.rankXp+=total;saveNow();
    return {timeXp,killXp,total};
  }
  function endGame() {
    if(state==='gameover')return;state='gameover';$('pauseOverlay').hidden=true;save.bestWave=Math.max(save.bestWave,wave);
    const banked=bankRunMoney(),rankReward=bankRunXp();saveNow();
    const survived=Math.floor(worldTime),timeLabel=Math.floor(survived/60)+'m '+String(survived%60).padStart(2,'0')+'s';
    $('endTitle').textContent='SIGNAL LOST';$('endSummary').textContent='You survived '+timeLabel+', eliminated '+totalKills+' infected, and earned '+rankReward.total+' rank XP ('+rankReward.timeXp+' survival + '+rankReward.killXp+' kills). You reached wave '+wave+' and banked '+banked+' coins. Best wave: '+save.bestWave+'.';
    $('gameScreen').hidden=true;$('endScreen').hidden=false;
  }

  function updateHud() {
    if(!player)return;
    $('waveText').textContent=wave;$('killText').textContent=kills+' / '+quota;$('creditText').textContent='$'+credits;
    $('healthFill').style.width=Math.max(0,player.hp/player.maxHp*100)+'%';$('healthText').textContent=Math.max(0,Math.ceil(player.hp))+' / '+player.maxHp+(player.armor?' · '+Math.ceil(player.armor)+' armor':'');
    const base=player.baseStats, boosts=[];
    const percent=(value,initial)=>Math.round((value/initial-1)*100);
    if(player.attack>base.attack)boosts.push(['DMG','+'+percent(player.attack,base.attack)+'%']);
    if(player.fireRate>base.fireRate)boosts.push(['FIRE','+'+percent(player.fireRate,base.fireRate)+'%']);
    if(player.speed>base.speed)boosts.push(['SPEED','+'+percent(player.speed,base.speed)+'%']);
    if(player.maxHp>base.hp)boosts.push(['MAX HP','+'+(player.maxHp-base.hp)]);
    if(player.armor>0)boosts.push(['ARMOR','+'+Math.ceil(player.armor)]);
    const tracker=$('statTracker'),trackerContent=boosts.length?boosts.map(([name,value])=>'<span class="stat-boost"><b>'+name+'</b> '+value+'</span>').join(''):'<span class="stat-empty">NO STAT BOOSTS</span>';
    if(tracker.dataset.content!==trackerContent){tracker.innerHTML=trackerContent;tracker.dataset.content=trackerContent;}
    $('xpFill').style.width=Math.min(100,xp/xpNext*100)+'%';$('levelText').textContent='LV '+level;
    $('weaponHud').textContent=weaponLabel(player.weapon)+(player.weapon==='knife'?' · MELEE':player.reloadLeft>0?' · RELOADING '+player.reloadLeft.toFixed(1)+'s':' · '+player.ammo+'/'+magazineSize(player.weapon))+' · Q '+bombCount+' · F '+airstrikeCount;
    const near=nearestThing();
    $('interactHint').textContent=near?(near.kind==='survivor'?(near.item.rescued?'ESCORT TO SAFEHOUSE':'E · Rescue survivor'):near.kind==='loot-bin'?(insideBuilding.building.lootClaimed?'MONEY BIN EMPTY':'E · Loot money bin'):near.kind==='exit'?'E · Exit building':near.item.supplies?'E · Enter '+near.item.name:'E · Search '+near.item.name):insideBuilding?'Explore inside · E to interact':'E · Search nearby';
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
    if(insideBuilding){drawInterior(w,h);return;}
    drawBounds={left:camera.x-72,top:camera.y-72,right:camera.x+w/CAMERA_ZOOM+72,bottom:camera.y+h/CAMERA_ZOOM+72};
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#202c28';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.scale(CAMERA_ZOOM,CAMERA_ZOOM);ctx.translate(-camera.x,-camera.y);
    ctx.imageSmoothingEnabled=false;ctx.fillStyle='#536746';ctx.fillRect(0,0,WORLD.w,WORLD.h);
    cityBlocks.forEach(drawCityBlock);
    drawGroundFoliage();
    for(let rx=0;rx<WORLD.w;rx+=260) {
      if(rx+68<drawBounds.left||rx>drawBounds.right)continue;
      const top=Math.max(0,drawBounds.top),bottom=Math.min(WORLD.h,drawBounds.bottom),length=bottom-top;
      ctx.fillStyle='#484e48';ctx.fillRect(rx,top,62,length);
      ctx.fillStyle='#77766a';ctx.fillRect(rx-4,top,4,length);ctx.fillRect(rx+62,top,5,length);
      ctx.fillStyle='rgba(27,32,29,.34)';ctx.fillRect(rx+8,top,2,length);ctx.fillRect(rx+52,top,2,length);
      ctx.fillStyle='rgba(196,182,137,.72)';
      for(let yy=Math.floor(top/42)*42;yy<bottom;yy+=42)ctx.fillRect(rx+30,yy,2,18);
      for(let yy=Math.floor(top/260)*260+28;yy<bottom;yy+=260){ctx.fillStyle='#c1b58b';ctx.fillRect(rx+5,yy,7,3);ctx.fillRect(rx+50,yy,7,3);}
    }
    for(let ry=0;ry<WORLD.h;ry+=260) {
      if(ry+59<drawBounds.top||ry>drawBounds.bottom)continue;
      const left=Math.max(0,drawBounds.left),right=Math.min(WORLD.w,drawBounds.right),length=right-left;
      ctx.fillStyle='#484e48';ctx.fillRect(left,ry,length,54);
      ctx.fillStyle='#77766a';ctx.fillRect(left,ry-4,length,4);ctx.fillRect(left,ry+54,length,5);
      ctx.fillStyle='rgba(27,32,29,.34)';ctx.fillRect(left,ry+8,length,2);ctx.fillRect(left,ry+44,length,2);
      ctx.fillStyle='rgba(196,182,137,.72)';
      for(let xx=Math.floor(left/42)*42;xx<right;xx+=42)ctx.fillRect(xx,ry+26,18,2);
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
    pickups.forEach(p=>{if(p.kind==='money'){drawMoneyIcon(ctx,p.x,p.y,15);}else if(p.kind==='ticket'){ctx.fillStyle='#4a2a78';ctx.fillRect(p.x-8,p.y-6,16,12);ctx.fillStyle='#e3c5ff';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('T',p.x,p.y);ctx.textBaseline='alphabetic';}else{ctx.fillStyle='#e4ca68';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}});
    bullets.forEach(b=>{ctx.fillStyle=b.kind==='explosive'?'#f3a45e':'#f1e6a8';ctx.beginPath();ctx.arc(b.x,b.y,b.kind==='explosive'?5:3,0,Math.PI*2);ctx.fill();});
    zombies.forEach(z=>{
      if(z.boss){ctx.fillStyle='rgba(234,115,76,.2)';ctx.beginPath();ctx.arc(z.x,z.y,z.r+8,0,Math.PI*2);ctx.fill();}
      const angle=Math.atan2(player.y-z.y,player.x-z.x);
      ctx.save();ctx.translate(z.x,z.y);ctx.rotate(angle);
      ctx.fillStyle='rgba(12,18,14,.38)';ctx.beginPath();ctx.ellipse(1,z.r*.58,z.r*.95,z.r*.38,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=z.color;ctx.fillRect(-z.r*.76,-z.r*.38,z.r*1.52,z.r*1.15);
      ctx.fillStyle='#514b3c';ctx.fillRect(-z.r*.85,z.r*.4,z.r*.55,z.r*.62);ctx.fillRect(z.r*.3,z.r*.4,z.r*.55,z.r*.62);
      ctx.fillStyle=z.boss?'#c68068':'#99a783';ctx.fillRect(-z.r*.66,-z.r*1.02,z.r*1.32,z.r*.68);
      ctx.fillStyle='#25271f';ctx.fillRect(-z.r*.42,-z.r*.78,z.r*.22,z.r*.16);ctx.fillRect(z.r*.2,-z.r*.78,z.r*.22,z.r*.16);
      ctx.fillStyle='#b04e3e';ctx.fillRect(-z.r*.2,-z.r*.48,z.r*.42,z.r*.08);
      ctx.restore();
      if(z.boss){ctx.fillStyle='#ffd99a';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('ELITE',z.x,z.y-z.r-14);}
      if(z.hp<z.maxHp||z.boss){ctx.fillStyle='#321f1c';ctx.fillRect(z.x-z.r,z.y-z.r-7,z.r*2,3);ctx.fillStyle=z.boss?'#e8a34e':'#b44f43';ctx.fillRect(z.x-z.r,z.y-z.r-7,z.r*2*Math.max(0,z.hp/z.maxHp),3);}
    });
    effects.forEach(e=>{const a=Math.max(0,e.life/e.max);if(e.type==='blast'){ctx.globalAlpha=a*.55;ctx.fillStyle='#f4a555';ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-a*.45),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}else{ctx.strokeStyle='#f3e7bd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(e.x-e.dy*22,e.y+e.dx*22);ctx.lineTo(e.x+e.dy*22,e.y-e.dx*22);ctx.stroke();}});
    const target=aimTarget(),angle=Math.atan2(target.y-player.y,target.x-player.x);
    if(player.weapon==='heli'||player.weapon==='tank') {
      ctx.save();ctx.translate(player.x,player.y);ctx.rotate(angle);ctx.fillStyle=player.invuln>0?'#f6a29a':player.color;
      if(player.weapon==='heli'){ctx.fillRect(-player.r,-player.r/2,player.r*2,player.r);ctx.strokeStyle='#c1d2bd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-player.r*1.5,-player.r*1.4);ctx.lineTo(player.r*1.5,-player.r*1.4);ctx.stroke();}
      else {ctx.fillRect(-player.r,-player.r*.72,player.r*2,player.r*1.44);ctx.fillStyle='#c4b789';ctx.fillRect(0,-4,player.r*1.7,8);}
      ctx.restore();
    } else {
      drawHuman(player.x,player.y,angle,playerAnimationFrame(),player.r,player.color,player.invuln>0,player.weapon);
    }
    ctx.restore();
    if(state==='playing'&&pointer.x>0){ctx.strokeStyle='rgba(235,229,196,.65)';ctx.beginPath();ctx.arc(pointer.x,pointer.y,7,0,Math.PI*2);ctx.moveTo(pointer.x-11,pointer.y);ctx.lineTo(pointer.x+11,pointer.y);ctx.moveTo(pointer.x,pointer.y-11);ctx.lineTo(pointer.x,pointer.y+11);ctx.stroke();}
  }

  function drawInterior(w,h) {
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#18211e';ctx.fillRect(0,0,w,h);
    const scale=Math.min((w-32)/640,(h-94)/420),ox=(w-640*scale)/2,oy=(h-420*scale)/2;
    ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    ctx.fillStyle='#303b35';ctx.fillRect(0,0,640,420);
    ctx.fillStyle='#666553';ctx.fillRect(25,25,590,370);
    ctx.fillStyle='#555447';ctx.fillRect(38,38,564,344);
    // Floorboards, cracks, scattered debris, and heavy outer walls establish an indoor room.
    ctx.strokeStyle='rgba(196,181,133,.18)';ctx.lineWidth=2;
    for(let y=72;y<365;y+=42){ctx.beginPath();ctx.moveTo(42,y);ctx.lineTo(598,y);ctx.stroke();}
    ctx.fillStyle='#343a32';ctx.fillRect(25,25,590,18);ctx.fillRect(25,25,18,370);ctx.fillRect(597,25,18,370);ctx.fillRect(25,382,250,13);ctx.fillRect(365,382,250,13);
    ctx.fillStyle='#a18a5e';ctx.fillRect(275,378,90,17);ctx.fillStyle='#252b25';ctx.fillRect(292,349,56,34);ctx.fillStyle='#756247';ctx.fillRect(298,354,44,28);
    ctx.fillStyle='#e4d298';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('EXIT · E',320,411);
    ctx.fillStyle='#27312c';ctx.fillRect(452,83,118,96);ctx.fillStyle='#41483e';ctx.fillRect(460,91,102,80);ctx.fillStyle='#303831';ctx.fillRect(468,99,86,62);
    ctx.fillStyle=insideBuilding.building.lootClaimed?'#696b5c':'#a58d4f';ctx.fillRect(484,112,56,43);
    if(!insideBuilding.building.lootClaimed){drawMoneyIcon(ctx,512,134,32);}
    ctx.fillStyle='#252c27';ctx.fillRect(480,108,64,8);ctx.fillRect(480,155,64,7);ctx.fillRect(480,108,7,54);ctx.fillRect(537,108,7,54);
    ctx.fillStyle='#f1d887';ctx.font='bold 13px sans-serif';ctx.fillText(insideBuilding.building.lootClaimed?'EMPTY':'MONEY',512,76);
    ctx.fillStyle='#d2c7a6';ctx.font='12px sans-serif';ctx.fillText(insideBuilding.building.name,320,20);
    ctx.fillStyle='#343c34';ctx.fillRect(90,102,118,32);ctx.fillRect(88,235,94,40);ctx.fillRect(404,242,108,32);
    ctx.fillStyle='#747566';ctx.fillRect(96,107,106,20);ctx.fillRect(94,241,82,26);ctx.fillRect(410,247,96,18);
    for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#657065':'#92845f';ctx.fillRect(100+i*24,109,15,16);}
    const px=insideBuilding.playerX,py=insideBuilding.playerY;
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(px+2,py+5,14,7,0,0,Math.PI*2);ctx.fill();
    const aimX=(pointer.x-ox)/scale,aimY=(pointer.y-oy)/scale,angle=Math.atan2(aimY-py,aimX-px);
    drawHuman(px,py,angle,playerAnimationFrame(),player.r,player.color,player.invuln>0,player.weapon);
    ctx.restore();
    ctx.fillStyle='#e6e0ca';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('WASD · MOVE     E · LOOT BIN / EXIT',w/2,h-20);
  }

  let resumeState='playing';
  function pauseGame() {
    if(state!=='playing'&&state!=='prep')return;
    resumeState=state;state='paused';keys={};touch={};pointer.down=false;
    $('pauseOverlay').hidden=false;
  }
  function continueGame() {
    if(state!=='paused')return;
    state=resumeState;lastFrame=performance.now();$('pauseOverlay').hidden=true;
  }
  function leaveGame() {
    bankRunMoney();
    const rankReward=bankRunXp();
    $('rankUpMessage').textContent='Run complete: +'+rankReward.total+' rank XP ('+rankReward.timeXp+' survival + '+rankReward.killXp+' kills).';
    state='menu';keys={};touch={};pointer.down=false;upgradeOpen=false;
    $('pauseOverlay').hidden=true;$('upgradePanel').hidden=true;$('prepBanner').hidden=true;
    $('gameScreen').hidden=true;$('endScreen').hidden=true;$('menu').hidden=false;
    renderRoster();renderWeaponInventory();setMenuView('main');
  }

  function frame(now) {
    if(state==='menu'||state==='gameover')return;
    if(state==='paused'){lastFrame=now;requestAnimationFrame(frame);return;}
    const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;
    update(dt);draw();
    if(state!=='gameover')requestAnimationFrame(frame);
  }

  window.addEventListener('keydown',e=>{
    if(state==='paused'){if(e.code==='Escape')continueGame();return;}
    if(e.code==='Escape'&&(state==='playing'||state==='prep')){e.preventDefault();pauseGame();return;}
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
  $('weaponSpinButton').addEventListener('click',spinWeaponMachine);
  $('characterSpinButton').addEventListener('click',spinCharacterMachine);
  document.querySelectorAll('.rank-choice').forEach(button=>button.addEventListener('click',()=>purchaseRank(button.dataset.rankStat)));
  $('upgradeButton').addEventListener('click',toggleUpgrades);
  $('closeUpgrade').addEventListener('click',()=>{upgradeOpen=false;$('upgradePanel').hidden=true;});
  $('nextWaveButton').addEventListener('click',startWave);
  $('returnMenu').addEventListener('click',()=>{$('endScreen').hidden=true;$('menu').hidden=false;state='menu';renderRoster();renderWeaponInventory();setMenuView('main');});
  $('pauseButton').addEventListener('click',pauseGame);
  $('continueButton').addEventListener('click',continueGame);
  $('leaveButton').addEventListener('click',leaveGame);
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
  updateWallet();renderRoster();renderWeaponInventory();renderPermanentUpgrades();drawSlotMachine($('weaponSlotCanvas'),'common');drawSlotMachine($('characterSlotCanvas'),'common');setMenuView("main");
})();
