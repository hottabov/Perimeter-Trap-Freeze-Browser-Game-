export class AudioManager{
  constructor({playlist, sfx}){
    this.playlist = playlist.slice();
    this.sfxMap = sfx;
    this.music = null;
    this.levelStarted = false;
    this.completed = false;
    this.startIndex = Math.floor(Math.random()*this.playlist.length);
    this.currentIndex = this.startIndex;
    this.sfxVolume = 0.8;
  }

  startForLevel(level, advance){
    this.completed = false;
    if(advance) this.currentIndex = (this.currentIndex+1)%this.playlist.length;
    
    if(!this.music){
      this.music = new Audio();
      this.music.volume = 0.55;
    }
    
    this.music.pause();
    this.music.src = this.playlist[this.currentIndex];
    this.music.currentTime = 0;
    
    this.music.onerror = ()=> {
      console.warn('Audio failed to load, continuing without music');
      this.music = null;
    };
    
    this.music.onended = ()=>{
      if(!this.completed && this.music){ 
        this.music.currentTime = 0; 
        this.music.play().catch(()=>{}); 
      }
    };
    
    this.music.loop = false;
    this.music.play().catch((err)=>{
      console.warn('Audio playback blocked:', err);
    });
  }
  
  resumeCurrent(){ 
    if(this.music) this.music.play().catch(()=>{}); 
  }
  
  stopAll(){ 
    if(this.music){ 
      this.music.pause(); 
      this.music=null; 
    } 
  }
  
  markLevelComplete(){ 
    this.completed = true; 
    if(this.music) this.music.pause(); 
  }

  sfx(name){
    const src = this.sfxMap[name];
    if(!src){ this.beep(220, 0.08); return; }
    const a = new Audio(src);
    a.volume = this.sfxVolume;
    a.play().catch(()=>{ this.beep(330,0.06); });
  }

  beep(freq=440, dur=0.07){
    try{
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type='square'; o.frequency.value=freq;
      g.gain.setValueAtTime(0.001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5, ac.currentTime+0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+dur);
      o.start(); o.stop(ac.currentTime+dur);
    }catch(e){}
  }
}