export const ACTIVE = 0, SOLID = 1, TRAIL = 2;

export class Grid {
  constructor(w, h){
    this.w=w; this.h=h;
    this.cells = new Uint8Array(w*h);
    this.baselineSolid = 0;
    this.reset();
  }
  idx(x,y){ return y*this.w + x; }
  inside(x,y){ return x>=0 && y>=0 && x<this.w && y<this.h; }
  get(x,y){ return this.cells[this.idx(x,y)]; }
  set(x,y,v){ this.cells[this.idx(x,y)] = v; }

  reset(){
    this.cells.fill(ACTIVE);
    for(let x=0;x<this.w;x++){ this.set(x,0,SOLID); this.set(x,this.h-1,SOLID); }
    for(let y=0;y<this.h;y++){ this.set(0,y,SOLID); this.set(this.w-1,y,SOLID); }
    this.recomputeBaseline();
  }

  recomputeBaseline(){
    let solid=0;
    for(let i=0;i<this.cells.length;i++) if(this.cells[i]===SOLID) solid++;
    this.baselineSolid = solid;
  }

  isTrail(x,y){ return this.get(x,y)===TRAIL; }
  isActive(x,y){ return this.get(x,y)===ACTIVE; }
  isSolid(x,y){ return this.get(x,y)===SOLID; }

  isPerimeter(x,y){
    if(!this.isSolid(x,y)) return false;
    if(x>0 && this.isActive(x-1,y)) return true;
    if(x<this.w-1 && this.isActive(x+1,y)) return true;
    if(y>0 && this.isActive(x,y-1)) return true;
    if(y<this.h-1 && this.isActive(x,y+1)) return true;
    return false;
  }

  bakeTrailAsWalls(){
    for(let i=0;i<this.cells.length;i++){
      if(this.cells[i]===TRAIL) this.cells[i]=SOLID;
    }
  }

  components(){
    const W=this.w,H=this.h;
    const seen = new Uint8Array(W*H);
    const comps = [];
    const qx = new Int32Array(W*H);
    const qy = new Int32Array(W*H);

    const flood = (sx,sy)=>{
      let qb=0, qe=0, count=0;
      const indexes=[];
      seen[this.idx(sx,sy)]=1; qx[qe]=sx; qy[qe]=sy; qe++;
      const tryN=(x,y)=>{
        if(this.inside(x,y)){
          const id=this.idx(x,y);
          if(!seen[id] && this.cells[id]===ACTIVE){
            seen[id]=1; qx[qe]=x; qy[qe]=y; qe++;
          }
        }
      };
      while(qb<qe){
        const x=qx[qb], y=qy[qb]; qb++;
        indexes.push(this.idx(x,y)); count++;
        tryN(x-1,y); tryN(x+1,y); tryN(x,y-1); tryN(x,y+1);
      }
      return {count, cells:indexes};
    };

    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const id=this.idx(x,y);
        if(!seen[id] && this.cells[id]===ACTIVE){
          comps.push(flood(x,y));
        }
      }
    }
    return comps;
  }

  freezeCells(idxs){ for(const i of idxs) this.cells[i]=SOLID; }

  capturedPercent(){
    let solid=0;
    for(let i=0;i<this.cells.length;i++) if(this.cells[i]===SOLID) solid++;
    const totalPlayable = this.cells.length - this.baselineSolid;
    if(totalPlayable<=0) return 0;
    const frozen = Math.max(0, solid - this.baselineSolid);
    return Math.round(100 * frozen / totalPlayable);
  }
}