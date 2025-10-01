import { ACTIVE, SOLID, TRAIL } from './grid.js';

const opposite = { left:"right", right:"left", up:"down", down:"up" };

export class Hero {
  constructor(grid, cell){
    this.grid = grid;
    this.CELL = cell;
    this.reset();
  }

  reset(){
    this.x = Math.floor(this.grid.w/2)*this.CELL;
    this.y = (this.grid.h-1)*this.CELL;
    this.dir = "left";
    this.nextDir = this.dir;

    this.carving = false;
    this.trailLen = 0;
    this.alive = true;

    this.stepCooldown = 0;
    this.stepTime = 28;
    this.radius = this.CELL*0.45;
  }

  setDirection(dir){ this.nextDir = dir; }
  gx(){ return Math.round(this.x / this.CELL); }
  gy(){ return Math.round(this.y / this.CELL); }

  tryStep(dir){
    const g=this.grid, C=this.CELL;
    const x=this.gx(), y=this.gy();
    let nx=x, ny=y;
    if(dir==="left") nx--;
    if(dir==="right") nx++;
    if(dir==="up") ny--;
    if(dir==="down") ny++;
    if(!g.inside(nx,ny)) return false;

    const current = g.get(x,y);
    const target = g.get(nx,ny);

    if(!this.carving){
      // Can only start carving from perimeter into active area
      if(target===ACTIVE){
        if(!g.isPerimeter(x,y)) return false;
        this.carving = true;
        this.trailLen = 0;
      }else if(target===SOLID){
        // Can only move on solid perimeter (not through frozen areas)
        if(current !== SOLID) return false;
        if(!g.isPerimeter(nx,ny)) return false;
      } else {
        // Cannot move to trail when not carving
        return false;
      }
    }

    if(this.carving && dir===opposite[this.dir]) return false;

    if(this.carving && target===TRAIL){
      return "bite";
    }

    this.x = nx*C; this.y = ny*C;

    const here = g.get(nx,ny);
    if(this.carving && here===ACTIVE){
      g.set(nx,ny,TRAIL);
      this.trailLen++;
    }

    if(this.carving && here===SOLID){
      this.carving=false;
      this.trailLen = 0;
      return "closed";
    }
    return true;
  }

  update(dt){
    if(!this.alive) return;
    this.stepCooldown -= dt;
    while(this.stepCooldown<=0){
      this.stepCooldown += this.stepTime;

      let wanted = this.nextDir || this.dir;
      if(this.carving && wanted===opposite[this.dir]) wanted=this.dir;

      if(wanted!==this.dir){
        const ok = this.tryStep(wanted);
        if(ok){
          this.dir=wanted;
          if(ok==="closed" || ok==="bite") return ok;
          return;
        }
      }
      const res = this.tryStep(this.dir);
      if(res==="closed" || res==="bite") return res;
    }
  }

  draw(ctx, colors){
    const C=this.CELL;
    ctx.save();
    ctx.translate(this.x+C/2, this.y+C/2);
    ctx.fillStyle = colors.hero;
    ctx.strokeStyle = colors.heroStroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0,0,this.radius,0,Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export class Enemy {
  constructor(x,y,speed, cell, isBoss=false){
    this.x=x; this.y=y; this.CELL=cell;
    const a = Math.random()*Math.PI*2;
    this.vx=Math.cos(a); this.vy=Math.sin(a);
    if(Math.abs(this.vx)<0.3) this.vx = Math.sign(this.vx||1)*0.42;
    if(Math.abs(this.vy)<0.3) this.vy = Math.sign(this.vy||1)*0.57;
    this.speed = speed;
    this.isBoss = isBoss;
    this.radius = Math.max(2.6, cell*(isBoss?0.6:0.28));
    this.chasing = null;
  }

  update(dt, grid, hero){
    const prevX = this.x, prevY = this.y;
    
    if(hero.carving && Math.random() < 0.001 && !this.chasing){
      this.chasing = performance.now() + 2000;
    }
    
    let targetVx = this.vx;
    let targetVy = this.vy;
    
    if(this.chasing && performance.now() < this.chasing){
      const hx = hero.x + this.CELL/2;
      const hy = hero.y + this.CELL/2;
      const ex = this.x + this.CELL/2;
      const ey = this.y + this.CELL/2;
      const dx = hx - ex;
      const dy = hy - ey;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if(dist > 0){
        targetVx = this.vx * 0.8 + (dx/dist) * 0.2;
        targetVy = this.vy * 0.8 + (dy/dist) * 0.2;
      }
    }else{
      this.chasing = null;
    }
    
    let nx = this.x + targetVx*this.speed*dt/1000;
    let ny = this.y + targetVy*this.speed*dt/1000;

    const typeAt = (px,py)=>{
      const gx = Math.floor(px / this.CELL);
      const gy = Math.floor(py / this.CELL);
      if(!grid.inside(gx,gy)) return SOLID;
      return grid.get(gx,gy);
    };

    if(typeAt(nx,this.y) === SOLID){
      this.vx *= -1;
      targetVx = this.vx;
      nx = this.x + this.vx*this.speed*dt/1000;
    }
    if(typeAt(this.x,ny) === SOLID){
      this.vy *= -1;
      targetVy = this.vy;
      ny = this.y + this.vy*this.speed*dt/1000;
    }
    if(typeAt(nx,ny) === SOLID){ nx = prevX; ny = prevY; }

    this.x=nx; this.y=ny;
    this.vx = targetVx;
    this.vy = targetVy;

    const egx = Math.floor(this.x / this.CELL);
    const egy = Math.floor(this.y / this.CELL);
    const hgx = Math.round(hero.x / this.CELL);
    const hgy = Math.round(hero.y / this.CELL);

    if(hero.carving && hero.trailLen >= 1 && grid.inside(egx,egy) && grid.isTrail(egx,egy)){
      if(!(egx===hgx && egy===hgy)){
        return "hitTrail";
      }
    }

    if(hero.carving){
      const dx = (this.x+this.CELL/2) - (hero.x+this.CELL/2);
      const dy = (this.y+this.CELL/2) - (hero.y+this.CELL/2);
      const dist2 = dx*dx + dy*dy;
      const r = this.radius + hero.radius*0.85;
      if(dist2 < r*r) return "hitHero";
    }
  }

  draw(ctx, colors){
    const C=this.CELL;
    ctx.save();
    ctx.translate(this.x+C/2, this.y+C/2);
    if(this.isBoss){
      ctx.shadowColor = '#7a2cff';
      ctx.shadowBlur = 14;
    }else{
      ctx.shadowColor = colors.enemyShadow;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = this.isBoss ? '#ffc266' : colors.enemy;
    ctx.beginPath();
    ctx.arc(0,0,this.radius,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}