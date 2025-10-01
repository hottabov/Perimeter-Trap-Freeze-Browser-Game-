import { Grid, ACTIVE, SOLID, TRAIL } from './grid.js';
import { Hero, Enemy } from './actors.js';

export class Game{
  constructor({canvasId, fxCanvasId, ui}){
    this.ui = ui;
    this.cvs = document.getElementById(canvasId);
    this.ctx = this.cvs.getContext('2d', {alpha:false});
    this.fxCanvas = document.getElementById(fxCanvasId);
    this.fxCtx = this.fxCanvas.getContext('2d');

    this.DPR = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    this.VIEW = 768;
    this.CELL = 6;
    this.GW = Math.floor(this.VIEW/this.CELL);
    this.GH = Math.floor(this.VIEW/this.CELL);

    this.cvs.width=this.VIEW*this.DPR; this.cvs.height=this.VIEW*this.DPR;
    this.ctx.setTransform(this.DPR,0,0,this.DPR,0,0);
    this.fxCanvas.width=this.VIEW*this.DPR; this.fxCanvas.height=this.VIEW*this.DPR;
    this.fxCtx.setTransform(this.DPR,0,0,this.DPR,0,0);

    this.colors = {
      bg:'#000',
      wall:'#b027ff',
      trail:'#ff49fb',
      hero:'#87ff2a',
      heroStroke:'#ffad33',
      enemy:'#b8d8ff',
      enemyShadow:'#2c3a60',
      bonusGreen:'#3cff61',
      bonusOrange:'#ff9a3c',
      bonusRed:'#ff3c3c'
    };

    this.grid = new Grid(this.GW, this.GH);
    this.hero = new Hero(this.grid, this.CELL);
    this.enemies = [];
    this.particles = [];
    this.level = 1;
    this.running = false;
    this.overlayIntent = 'continue';

    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.levelCombo = 0;
    this.bossSlowdownActive = false;

    this.heroSpeedScale = 1.0;
    this.enemySpeedScale = 1.0;

    this.bonusItem = { visible:false, type:null, x:0, y:0, despawnAt:0 };
    this.nextBonusAt = performance.now() + this.randRange(5000, 15000);
    this.bonusActive = { type:null, until:0 };
    this.bgTint = null;
    this.lifeSpawnedThisLevel = false;

    this.onLevelStart = null;
    this.onLevelComplete = null;
    this.onEnemyDestroyed = null;
    this.onBonusStart = null;
    this.onBonusStop = null;
    this.onGameOver = null;

    this.pause('Perimeter – Trap & Freeze','Press any arrow/WASD to start');
    this.ui.bannerBtn.textContent = 'Start';
    this.ui.overlay.classList.remove('hide');
  }

  input(dir){ this.hero.setDirection(dir); }

  pause(title, sub){
    this.running=false;
    if (this.ui.overlay) this.ui.overlay.style.pointerEvents = 'auto';
    this.ui.bannerTitle.textContent = title;
    this.ui.bannerSub.textContent = sub;
    this.ui.banner.classList.remove('hide');
    this.overlayIntent = 'continue';
  }

  resume(){
    this.running=true;
    if (this.ui.overlay) this.ui.overlay.style.pointerEvents = 'none';
    this.ui.banner.classList.add('hide');
  }

  hardReset(){
    this.level=1;
    this.score=0;
    this.lives=3;
    this.combo=0;
    this.maxCombo=0;
    this.levelCombo=0;
    this.bossSlowdownActive=false;
    this.initLevel();
    this.pause('Perimeter – Trap & Freeze','Press any arrow/WASD to start');
    this.ui.bannerBtn.textContent = 'Start';
  }

  nextLevel(){
    this.level++;
    this.levelCombo = 0;
    this.bossSlowdownActive = false;
    
    if(this.level % 5 === 0){
      this.lives++;
    }
    
    this.initLevel();
  }

  initLevel(){
    this.grid.reset();
    this.hero.reset();
    this.enemies.length=0;
    this.particles.length=0;

    this.heroSpeedScale = 1.0;
    this.enemySpeedScale = this.bossSlowdownActive ? 0.5 : 1.0;
    this.clearBonusImmediate();
    this.lifeSpawnedThisLevel = false;

    const baseRegular = 2;
    const extraEveryTwo = Math.floor((this.level - 1) / 2);
    const enemiesCount = baseRegular + extraEveryTwo;
    const hasBoss = (this.level % 3 === 0);

    const speedMultiplier = this.level > 10 ? 1.3 : 1.0;
    const baseSpeed = (95 + this.level * 14) * speedMultiplier;
    const maxRegularSpeed = baseSpeed * 1.35;

    for(let i=0;i<enemiesCount;i++){
      const gx = 2 + Math.floor(Math.random()*(this.GW-4));
      const gy = 2 + Math.floor(Math.random()*(this.GH-4));
      const variance = 1 + (Math.random()*0.35);
      this.enemies.push(new Enemy(gx*this.CELL, gy*this.CELL, baseSpeed*variance, this.CELL, false));
    }

    if(hasBoss){
      const gx = Math.floor(this.GW/2);
      const gy = Math.floor(this.GH/2);
      const bossSpeed = maxRegularSpeed + 25;
      this.enemies.push(new Enemy(gx*this.CELL, gy*this.CELL, bossSpeed, this.CELL, true));
    }

    if(this.level > 15){
      this.hero.stepTime = 28 + Math.floor((this.level - 15) / 2);
    }

    this.scheduleNextBonus();
    this.updateUI();
    if(this.onLevelStart) this.onLevelStart(this.level);
  }

  start(){
    let last = performance.now();
    const tick = (t)=>{
      const dt = Math.min(48, t-last); last=t;

      this.updateBonusSpawns(t);
      this.updateBonusTimers(t);

      if(this.running){
        const hres = this.hero.update(dt * this.heroSpeedScale);
        if(hres === 'bite'){ this.fail('You crossed your own line!'); }
        if(this.running){
          for(const e of this.enemies){
            const res = e.update(dt * this.enemySpeedScale, this.grid, this.hero);
            if(res==='hitTrail' || res==='hitHero'){ this.fail('Caught by an enemy!'); break; }
          }
        }
        if(this.running && hres === 'closed'){ this.onClosed(); }

        if(this.running){
          this.updateParticles(dt);
          this.draw();
          this.updateUI();
        }
      } else {
        if(this.particles.length){ this.updateParticles(dt); }
        this.draw();
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  scheduleNextBonus(){
    const now = performance.now();
    this.nextBonusAt = now + this.randRange(5000, 15000);
  }
  
  spawnBonus(now){
    let type;
    if(!this.lifeSpawnedThisLevel && Math.random() < 0.25){
      type = 'red';
      this.lifeSpawnedThisLevel = true;
    }else{
      type = Math.random() < 0.5 ? 'green' : 'orange';
    }
    
    let bx=0, by=0, ok=false;
    
    for(let i=0;i<200;i++){
      const x = 2 + Math.floor(Math.random()*(this.GW-4));
      const y = 2 + Math.floor(Math.random()*(this.GH-4));
      if(this.grid.get(x,y) === ACTIVE){
        let tooClose = false;
        for(const e of this.enemies){
          const ex = Math.floor(e.x/this.CELL);
          const ey = Math.floor(e.y/this.CELL);
          const dist = Math.abs(ex-x) + Math.abs(ey-y);
          if(dist < 3){ tooClose = true; break; }
        }
        if(!tooClose){
          bx=x; by=y; ok=true; break;
        }
      }
    }
    
    if(!ok){ 
      this.scheduleNextBonus(); 
      return; 
    }
    
    const life = this.randRange(20000, 30000);
    this.bonusItem = { visible:true, type, x:bx, y:by, despawnAt: now + life };
  }
  
  updateBonusSpawns(now){
    if(this.bonusItem.visible && now >= this.bonusItem.despawnAt){
      this.bonusItem.visible = false;
      this.scheduleNextBonus();
    }
    if(!this.bonusItem.visible && !this.bonusActive.type && now >= this.nextBonusAt){
      this.spawnBonus(now);
    }
    if(this.bonusItem.visible){
      const hx = Math.round(this.hero.x/this.CELL);
      const hy = Math.round(this.hero.y/this.CELL);
      if(hx===this.bonusItem.x && hy===this.bonusItem.y){
        this.activateBonus(this.bonusItem.type, now);
      }
    }
  }
  
  updateBonusTimers(now){
    if(!this.bonusActive.type) return;
    if(now >= this.bonusActive.until){
      this.deactivateBonus();
    }
  }
  
  activateBonus(type, now){
    this.bonusItem.visible = false;
    this.scheduleNextBonus();
    
    if(type === 'red'){
      this.lives++;
      this.updateUI();
      return;
    }
    
    this.bonusActive.type = type;
    this.bonusActive.until = now + 5000;
    if(type==='green'){ this.heroSpeedScale = 1.5; this.bgTint='green'; }
    else { this.enemySpeedScale = 0.5; this.bgTint='orange'; }
    if(this.onBonusStart) this.onBonusStart(type);
  }
  
  deactivateBonus(){
    this.bonusActive.type = null;
    this.heroSpeedScale = 1.0;
    if(!this.bossSlowdownActive){
      this.enemySpeedScale = 1.0;
    }
    this.bgTint = null;
    if(this.onBonusStop) this.onBonusStop();
  }
  
  clearBonusImmediate(){
    this.bonusItem.visible=false;
    this.bonusActive.type=null;
    this.heroSpeedScale=1.0;
    if(!this.bossSlowdownActive){
      this.enemySpeedScale=1.0;
    }
    this.bgTint=null;
  }
  
  randRange(min,max){ return Math.floor(min + Math.random()*(max-min+1)); }

  onClosed(){
    const beforePct = this.grid.capturedPercent();
    this.grid.bakeTrailAsWalls();

    const comps = this.grid.components();
    if(comps.length>1){
      let smallest = comps[0];
      for(const c of comps) if(c.count<smallest.count) smallest=c;

      const frozenSet = new Set(smallest.cells);
      this.grid.freezeCells(smallest.cells);

      if(this.bonusItem.visible){
        const bid = this.grid.idx(this.bonusItem.x, this.bonusItem.y);
        if(frozenSet.has(bid)){
          this.activateBonus(this.bonusItem.type, performance.now());
        }
      }

      const survivors = [];
      let enemiesKilledThisTurn = 0;
      let bossKilled = false;
      
      for(const e of this.enemies){
        const gx=Math.floor(e.x/this.CELL), gy=Math.floor(e.y/this.CELL);
        const id=this.grid.idx(gx,gy);
        if(frozenSet.has(id)){
          enemiesKilledThisTurn++;
          if(e.isBoss) bossKilled = true;
          
          this.spawnEnemyExplosion(e.x+this.CELL/2, e.y+this.CELL/2, e.isBoss);
          
          this.levelCombo++;
          this.combo++;
          if(this.combo > this.maxCombo) this.maxCombo = this.combo;
          
          const multiplier = e.isBoss ? 10 : this.levelCombo;
          const baseScore = e.isBoss ? 5000 : 1000;
          this.score += baseScore * multiplier;
          
          if(this.onEnemyDestroyed) this.onEnemyDestroyed();
        }else{
          survivors.push(e);
        }
      }
      
      if(bossKilled){
        this.bossSlowdownActive = true;
        this.enemySpeedScale = 0.5;
      }
      
      this.enemies = survivors;

      const afterPct = this.grid.capturedPercent();
      const deltaPct = Math.max(0, afterPct - beforePct);
      if(deltaPct>0) this.score += deltaPct * 100;

      if(enemiesKilledThisTurn > 0){
        this.showComboText(enemiesKilledThisTurn, bossKilled);
      }

      if(this.enemies.length===0){
        this.draw();
        this.updateUI();
        requestAnimationFrame(()=> this.completeLevel());
      }
    }
  }

  showComboText(enemyCount, isBoss){
    const comboEl = document.createElement('div');
    comboEl.style.cssText = `
      position:fixed; top:20%; left:50%; transform:translate(-50%,-50%);
      font-size:48px; font-weight:900; color:#87ff2a;
      text-shadow: 0 0 20px #87ff2a, 0 0 40px #87ff2a;
      pointer-events:none; z-index:9999;
      animation: comboFloat 1s ease-out forwards;
    `;
    
    if(isBoss){
      comboEl.textContent = `10x BOSS COMBO!`;
      comboEl.style.color = '#ffc266';
      comboEl.style.textShadow = '0 0 20px #ffc266, 0 0 40px #ffc266';
    }else if(this.levelCombo === 1){
      comboEl.textContent = `COMBO!`;
    }else{
      comboEl.textContent = `${this.levelCombo}x COMBO!`;
    }
    
    document.body.appendChild(comboEl);
    
    setTimeout(()=> comboEl.remove(), 1000);
  }

  fail(message){
    this.lives--;
    this.levelCombo = 0;
    
    if(this.lives <= 0){
      this.combo = 0;
      this.pause('Game Over!', `${this.score.toLocaleString()} pts – Press Restart to try again`);
      this.ui.bannerBtn.textContent = 'Restart';
      this.overlayIntent = 'restart';
      if (this.onGameOver) this.onGameOver(this.score);
    }else{
      this.pause(message, `${this.lives} ${this.lives===1?'life':'lives'} remaining – Press Continue`);
      this.ui.bannerBtn.textContent = 'Continue';
      this.overlayIntent = 'continue';
      this.grid.reset();
      this.hero.reset();
      this.particles.length = 0;
      this.clearBonusImmediate();
      
      for(const e of this.enemies){
        const gx = 2 + Math.floor(Math.random()*(this.GW-4));
        const gy = 2 + Math.floor(Math.random()*(this.GH-4));
        e.x = gx * this.CELL;
        e.y = gy * this.CELL;
        const a = Math.random()*Math.PI*2;
        e.vx = Math.cos(a);
        e.vy = Math.sin(a);
      }
      
      this.updateUI();
    }
  }

  completeLevel(){
    this.levelCompleteFX();
    this.pause('Level cleared!','Press Continue for next level');
    this.ui.bannerBtn.textContent = 'Continue';
    this.overlayIntent = 'next';
    if(this.onLevelComplete) this.onLevelComplete();
  }

  spawnEnemyExplosion(x, y, big=false){
    const count = big ? 120 : 55;
    for(let i=0;i<count;i++){
      const a = Math.random()*Math.PI*2;
      const sp = (big? 140: 90) + Math.random()*80;
      this.particles.push({
        x, y,
        vx: Math.cos(a)*sp/1000,
        vy: Math.sin(a)*sp/1000,
        life: 600 + Math.random()*400,
        age: 0,
        r: big? 3.5: 2.4,
        color: big? '#ffd28c' : '#b8d8ff'
      });
    }
    this.particles.push({type:'ring', x,y, age:0, life:500, r: big? 10:6, color: big? '#ffcf66':'#a9c9ff'});
  }

  levelCompleteFX(){
    for(let i=0;i<220;i++){
      const x=Math.random()*this.VIEW, y=Math.random()*this.VIEW;
      const a=(Math.random()*Math.PI*2);
      const sp = 60+Math.random()*140;
      this.particles.push({
        x,y,vx:Math.cos(a)*sp/1000, vy:(-Math.random()*0.25)-0.05,
        life: 1600+Math.random()*1200, age:0, r:2+Math.random()*3,
        color: ['#ff49fb','#c033ff','#87ff2a','#b8d8ff','#ffd28c'][Math.floor(Math.random()*5)]
      });
    }
  }

  updateParticles(dt){
    const out=[];
    for(const p of this.particles){
      p.age+=dt;
      if(p.age>=p.life) continue;
      if(p.type==='ring'){ out.push(p); continue; }
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vy += 0.0006*dt;
      out.push(p);
    }
    this.particles = out;
  }

  drawParticles(ctx){
    for(const p of this.particles){
      const t = 1 - p.age/p.life;
      if(p.type==='ring'){
        ctx.save();
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3*t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + (1-t)*40, 0, Math.PI*2);
        ctx.stroke(); ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0,t);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawHeart(ctx, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.translate(x, y);
    ctx.beginPath();
    const topCurveHeight = size * 0.3;
    ctx.moveTo(0, topCurveHeight);
    ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight);
    ctx.bezierCurveTo(-size / 2, (topCurveHeight + size) / 2, 0, (topCurveHeight + size) / 1.3, 0, size);
    ctx.bezierCurveTo(0, (topCurveHeight + size) / 1.3, size / 2, (topCurveHeight + size) / 2, size / 2, topCurveHeight);
    ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight);
    ctx.fill();
    ctx.restore();
  }

  draw(){
    const ctx=this.ctx, V=this.VIEW, C=this.CELL;

    if(this.bgTint==='green'){
      this.drawTint(ctx, 'rgba(0,20,0,1)', 'rgba(0,60,0,0.65)');
    }else if(this.bgTint==='orange'){
      this.drawTint(ctx, 'rgba(20,8,0,1)', 'rgba(80,35,0,0.65)');
    }else{
      ctx.fillStyle=this.colors.bg; ctx.fillRect(0,0,V,V);
    }

    for(let y=0;y<this.GH;y++){
      for(let x=0;x<this.GW;x++){
        const s=this.grid.get(x,y);
        if(s===SOLID){ 
          ctx.fillStyle=this.colors.wall; 
          ctx.fillRect(x*C,y*C,C,C); 
        }
        else if(s===TRAIL){ 
          if(this.hero.carving){
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.colors.trail;
            ctx.fillStyle=this.colors.trail; 
            ctx.fillRect(x*C,y*C,C,C);
            ctx.restore();
          }else{
            ctx.fillStyle=this.colors.trail; 
            ctx.fillRect(x*C,y*C,C,C);
          }
        }
      }
    }

    if(this.bonusItem.visible){
      const bx = this.bonusItem.x*C + C/2;
      const by = this.bonusItem.y*C + C/2;
      const ms = performance.now();

      if(this.bonusItem.type === 'red'){
        const alpha = 0.7 + 0.3 * (0.5 + 0.5*Math.sin(ms*0.008));
        const pulse = 1.0 + 0.3 * (0.5 + 0.5*Math.sin(ms*0.015));
        const size = Math.max(12, C*1.8) * pulse;

        ctx.save();
        ctx.shadowBlur = 25 + 15 * (0.5 + 0.5*Math.sin(ms*0.015));
        ctx.shadowColor = this.colors.bonusRed;
        this.drawHeart(ctx, bx, by, size, this.colors.bonusRed, alpha);
        
        ctx.shadowBlur = 35 + 20 * (0.5 + 0.5*Math.sin(ms*0.012));
        ctx.shadowColor = '#ff6666';
        this.drawHeart(ctx, bx, by, size * 0.85, '#ff4444', alpha * 0.9);
        ctx.restore();
      } else {
        let color;
        if(this.bonusItem.type === 'green') color = this.colors.bonusGreen;
        else color = this.colors.bonusOrange;

        const alpha = 0.55 + 0.45 * (0.5 + 0.5*Math.sin(ms*0.012));
        const pulse = 0.85 + 0.25 * (0.5 + 0.5*Math.sin(ms*0.018));
        const r = Math.max(3, C*0.36) * pulse;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 12 + 6 * (0.5 + 0.5*Math.sin(ms*0.02));
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI*2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, r + 4, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for(const e of this.enemies) e.draw(ctx, this.colors);
    this.hero.draw(ctx, this.colors);

    const f=this.fxCtx;
    f.clearRect(0,0,this.VIEW,this.VIEW);
    this.drawParticles(f);
  }

  drawTint(ctx, darkColor, midColor){
    const V=this.VIEW;
    ctx.fillStyle = darkColor;
    ctx.fillRect(0,0,V,V);
    const rg = ctx.createRadialGradient(V/2, V/2, V*0.05, V/2, V/2, V*0.7);
    rg.addColorStop(0, midColor);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0,0,V,V);
  }

  updateUI(){
    this.ui.level.textContent = this.level;
    this.ui.enemies.textContent = this.enemies.length;
    this.ui.captured.textContent = `${this.grid.capturedPercent()}%`;
    
    if(this.ui.lives){
      let heartsHTML = '';
      for(let i=0; i<this.lives; i++){
        heartsHTML += '❤️';
      }
      this.ui.lives.innerHTML = heartsHTML || '💔';
    }
    
    if(this.ui.score) {
      let scoreText = `Score ${this.score.toLocaleString()}`;
      
      if(this.bonusActive.type){
        const remaining = Math.ceil((this.bonusActive.until - performance.now()) / 1000);
        const icon = this.bonusActive.type === 'green' ? '⚡' : '🢃';
        scoreText += ` ${icon}${remaining}s`;
      }
      
      if(this.levelCombo > 0){
        scoreText += ` • ${this.levelCombo}x`;
      }
      
      this.ui.score.textContent = scoreText;
    }
    this.ui.boss.textContent = (this.level % 3 === 0) ? 'YES' : '—';
  }
}