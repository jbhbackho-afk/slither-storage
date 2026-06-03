import audioManager from './audio.js';

// Configuration
const MAP_SIZE = 2500; // Circular arena radius
const BASE_SPEED = 2.5;
const BOOST_SPEED = 5.0;
const INITIAL_MASS = 10;
const BOT_COUNT = 18;
const MAX_FOOD = 350;
const MAX_ITEMS = 6;

// Color gradients for skins
const SKIN_COLORS = [
  { name: 'Cyan Blue', grad: ['#00f0ff', '#0072ff'], glow: 'rgba(0, 240, 255, 0.4)' },
  { name: 'Neon Pink', grad: ['#ff007f', '#7f00ff'], glow: 'rgba(255, 0, 127, 0.4)' },
  { name: 'Acid Green', grad: ['#39ff14', '#00a86b'], glow: 'rgba(57, 255, 20, 0.4)' },
  { name: 'Volt Yellow', grad: ['#fff01f', '#ff6c00'], glow: 'rgba(255, 240, 31, 0.4)' },
  { name: 'Cyberpunk', grad: ['#00f0ff', '#ff007f'], glow: 'rgba(0, 240, 255, 0.4)' },
  { name: 'Stardust', grad: ['#ffffff', '#8a9ba8'], glow: 'rgba(255, 255, 255, 0.3)' }
];

const BOT_NAMES = [
  'VoltViper', 'NeonByte', 'GlowWorm', 'CyberCrawl', 'PixelPython',
  'SynthSnake', 'AlphaWorm', 'OmegaGlow', 'HyperHex', 'ReptileRetro',
  'Sparks', 'ShadowSlither', 'BitCrawl', 'Megavolt', 'GigaGlow',
  'FluxWorm', 'Zenith', 'CryptoCobra', 'QuantumCoil', 'CircuitChaser'
];

class SlitherGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // UI Panels
    this.menuScreen = document.getElementById('menu-screen');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.startBtn = document.getElementById('start-btn');
    this.restartBtn = document.getElementById('restart-btn');
    this.nicknameInput = document.getElementById('nickname-input');
    
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    
    // Game entities
    this.player = null;
    this.snakes = [];
    this.food = [];
    this.items = [];
    
    // Game state
    this.gameState = 'menu'; // 'menu', 'playing', 'gameover'
    this.selectedSkin = 0;
    this.mouse = { x: 0, y: 0 };
    this.camera = { x: 0, y: 0, zoom: 1.0 };
    
    // Game timing
    this.lastTime = 0;
    this.startTime = 0;
    this.kills = 0;
    
    // Sound controller
    this.audio = audioManager;
    
    // Joystick
    this.joystick = {
      active: false,
      startX: 0,
      startY: 0,
      currX: 0,
      currY: 0,
      angle: 0
    };

    // Multiplayer State
    this.multiplayerMode = 'solo'; // 'solo', 'host', 'client'
    this.peer = null;
    this.connections = {}; // Host: client peer ID -> connection
    this.connToHost = null; // Client: connection to Host
    this.roomId = null;
    this.currentRoomCode = null;
    this.clientInputs = {}; // Host: client peer ID -> { angle, isBoosting }
    this.clientNames = {}; // Host: client peer ID -> name
    this.clientSkins = {}; // Host: client peer ID -> skinIndex
    
    this.setupEvents();
    this.resizeCanvas();
    this.initSkinSelector();

    // Check for room param in URL to auto-fill join code
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setTimeout(() => {
        this.switchLobbyTab('join');
        const roomInput = document.getElementById('room-input');
        if (roomInput) {
          roomInput.value = roomParam;
        }
      }, 100);
    }
    
    // Loop
    requestAnimationFrame((t) => this.loop(t));
  }
  
  setupEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    
    // Boost on Left Click
    window.addEventListener('mousedown', (e) => {
      if (this.gameState === 'playing' && e.button === 0) {
        this.setPlayerBoosting(true);
      }
    });
    
    window.addEventListener('mouseup', (e) => {
      if (this.gameState === 'playing' && e.button === 0) {
        this.setPlayerBoosting(false);
      }
    });
    
    // Start button
    this.startBtn.addEventListener('click', () => {
      this.audio.playClick();
      this.startGame();
    });
    
    // Restart button
    this.restartBtn.addEventListener('click', () => {
      this.audio.playClick();
      this.startGame();
    });

    // Multiplayer tabs
    const tabSolo = document.getElementById('tab-solo');
    const tabHost = document.getElementById('tab-host');
    const tabJoin = document.getElementById('tab-join');
    
    if (tabSolo) tabSolo.addEventListener('click', () => { this.audio.playClick(); this.switchLobbyTab('solo'); });
    if (tabHost) tabHost.addEventListener('click', () => { this.audio.playClick(); this.switchLobbyTab('host'); });
    if (tabJoin) tabJoin.addEventListener('click', () => { this.audio.playClick(); this.switchLobbyTab('join'); });
    
    // Copy Link button
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!this.roomId) return;
        this.audio.playClick();
        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
        navigator.clipboard.writeText(inviteLink).then(() => {
          copyBtn.innerText = 'Copied!';
          setTimeout(() => {
            copyBtn.innerText = 'Copy Link';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy link:', err);
        });
      });
    }
    
    // Touch Events for Mobile Controls
    const container = document.getElementById('game-container');
    
    container.addEventListener('touchstart', (e) => {
      if (this.gameState !== 'playing') return;
      const touch = e.touches[0];
      
      // Determine if touch is on boost button
      const boostBtn = document.getElementById('boost-button');
      const rect = boostBtn.getBoundingClientRect();
      const isBoostTouch = 
        touch.clientX >= rect.left && touch.clientX <= rect.right &&
        touch.clientY >= rect.top && touch.clientY <= rect.bottom;
        
      if (isBoostTouch) {
        this.setPlayerBoosting(true);
        boostBtn.classList.add('active');
      } else {
        // Setup Joystick
        document.getElementById('mobile-controls').style.display = 'flex';
        this.joystick.active = true;
        this.joystick.startX = touch.clientX;
        this.joystick.startY = touch.clientY;
        this.updateJoystickKnob(0, 0);
      }
    });
    
    container.addEventListener('touchmove', (e) => {
      if (this.gameState !== 'playing') return;
      
      const boostBtn = document.getElementById('boost-button');
      
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        
        // Update joystick
        if (this.joystick.active && touch.identifier === 0) {
          const dx = touch.clientX - this.joystick.startX;
          const dy = touch.clientY - this.joystick.startY;
          const dist = Math.hypot(dx, dy);
          const maxDist = 40;
          
          if (dist > 0) {
            const angle = Math.atan2(dy, dx);
            this.joystick.angle = angle;
            
            const limitX = Math.cos(angle) * Math.min(dist, maxDist);
            const limitY = Math.sin(angle) * Math.min(dist, maxDist);
            this.updateJoystickKnob(limitX, limitY);
            
            // Set mouse target coordinates relative to center screen based on joystick angle
            this.mouse.x = window.innerWidth / 2 + Math.cos(angle) * 200;
            this.mouse.y = window.innerHeight / 2 + Math.sin(angle) * 200;
          }
        }
      }
    });
    
    container.addEventListener('touchend', (e) => {
      const boostBtn = document.getElementById('boost-button');
      
      if (e.touches.length === 0) {
        this.setPlayerBoosting(false);
        boostBtn.classList.remove('active');
        this.joystick.active = false;
        this.updateJoystickKnob(0, 0);
      } else {
        // Check remaining touches
        let isBoostStillPressed = false;
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          const rect = boostBtn.getBoundingClientRect();
          if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
              touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            isBoostStillPressed = true;
          }
        }
        if (!isBoostStillPressed) {
          this.setPlayerBoosting(false);
          boostBtn.classList.remove('active');
        }
      }
    });
    
    // Detect mobile touch capability to show elements
    if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) {
      document.getElementById('mobile-controls').style.display = 'flex';
      document.getElementById('desktop-controls-info').style.display = 'none';
    }
  }
  
  updateJoystickKnob(dx, dy) {
    const knob = document.getElementById('joystick-knob');
    if (knob) {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
  
  setPlayerBoosting(isBoosting) {
    if (!this.player) return;
    
    const canBoost = isBoosting && this.player.mass > 12;
    
    if (this.multiplayerMode === 'client') {
      this.player.isBoosting = canBoost;
      if (this.connToHost && this.connToHost.open) {
        this.connToHost.send({
          type: 'input',
          angle: this.player.targetAngle,
          isBoosting: canBoost
        });
      }
    } else {
      if (isBoosting && this.player.mass > 12) {
        if (!this.player.isBoosting) {
          this.player.isBoosting = true;
          this.audio.startBoost();
        }
      } else {
        if (this.player.isBoosting) {
          this.player.isBoosting = false;
          this.audio.stopBoost();
        }
      }
    }
  }
  
  initSkinSelector() {
    const grid = document.getElementById('skins-grid');
    const options = grid.querySelectorAll('.skin-option');
    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this.selectedSkin = parseInt(opt.getAttribute('data-skin'));
        this.audio.playClick();
      });
    });
  }
  
  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  
  startGame() {
    const name = this.nicknameInput.value.trim() || 'Wormy';
    
    if (this.multiplayerMode === 'client') {
      if (!this.connToHost || !this.connToHost.open) {
        const roomInput = document.getElementById('room-input');
        const code = (roomInput && roomInput.value.trim()) ? roomInput.value.trim() : this.currentRoomCode;
        if (!code) {
          alert('Please enter a Room Code!');
          return;
        }
        this.currentRoomCode = code;
        this.connectToHost(code);
        return; // connectToHost will call startGame() once connected
      }
    }
    
    // Reset values
    this.kills = 0;
    this.startTime = Date.now();
    
    if (this.multiplayerMode === 'solo') {
      this.food = [];
      this.snakes = [];
      this.items = [];
      
      // Create Player
      this.player = this.createWorm(0, 0, name, false, this.selectedSkin);
      this.snakes.push(this.player);
      
      // Create AI Bots
      for (let i = 0; i < BOT_COUNT; i++) {
        this.spawnBot();
      }
      
      // Populate food
      for (let i = 0; i < MAX_FOOD; i++) {
        this.spawnFood();
      }
      
      // Populate items
      for (let i = 0; i < MAX_ITEMS; i++) {
        this.spawnItem();
      }
    } else if (this.multiplayerMode === 'host') {
      this.food = [];
      this.snakes = [];
      this.items = [];
      
      // Create Host Player
      this.player = this.createWorm(0, 0, name, false, this.selectedSkin);
      this.snakes.push(this.player);
      
      // Create AI Bots
      for (let i = 0; i < BOT_COUNT; i++) {
        this.spawnBot();
      }
      
      // Populate food
      for (let i = 0; i < MAX_FOOD; i++) {
        this.spawnFood();
      }
      
      // Populate items
      for (let i = 0; i < MAX_ITEMS; i++) {
        this.spawnItem();
      }
      
      // Spawn any clients that connected while in menu
      for (let peerId in this.connections) {
        const clientName = this.clientNames[peerId] || 'Guest';
        const clientSkin = this.clientSkins[peerId] || 0;
        this.spawnClientSnake(peerId, clientName, clientSkin);
      }
    } else if (this.multiplayerMode === 'client') {
      // Clients don't run any local setup; they wait for host states
      this.food = [];
      this.snakes = [];
      this.items = [];
      this.player = null;
    }
    
    // Hide menus
    this.menuScreen.classList.add('hidden');
    this.gameOverScreen.classList.remove('visible');
    
    this.gameState = 'playing';
  }
  
  createWorm(x, y, name, isBot = false, skinIndex = 0) {
    const mass = INITIAL_MASS;
    const skin = SKIN_COLORS[skinIndex];
    const angle = Math.random() * Math.PI * 2;
    
    const radius = 12 + Math.sqrt(mass) * 0.4;
    const spacing = radius * 0.55;
    
    const segments = [];
    for (let i = 0; i < 15; i++) {
      segments.push({
        x: x - Math.cos(angle) * i * spacing,
        y: y - Math.sin(angle) * i * spacing,
        radius: radius
      });
    }
    
    return {
      id: isBot ? Math.random().toString(36).substring(2, 9) : 'player',
      name: name,
      isBot: isBot,
      x: x,
      y: y,
      angle: angle,
      targetAngle: angle,
      segments: segments,
      mass: mass,
      radius: radius,
      spacing: spacing,
      isBoosting: false,
      boostCounter: 0,
      magnetTimer: 0,
      shieldTimer: 0,
      skinIndex: skinIndex,
      colorGrad: skin.grad,
      rgbStart: this.hexToRgb(skin.grad[0]),
      rgbEnd: this.hexToRgb(skin.grad[1]),
      glowColor: skin.glow,
      speed: BASE_SPEED,
      turnRate: isBot ? 0.08 : 0.12,
      lastDecisionTime: 0,
      targetFood: null
    };
  }
  
  spawnBot() {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (MAP_SIZE - 400);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const skinIndex = Math.floor(Math.random() * SKIN_COLORS.length);
    
    const bot = this.createWorm(x, y, name, true, skinIndex);
    // Give bots starting variance in mass
    bot.mass = 10 + Math.floor(Math.random() * 30);
    this.snakes.push(bot);
  }
  
  spawnFood(x, y, value = 1, isDebris = false) {
    // If no coordinates, spawn randomly within circular bounds
    if (x === undefined || y === undefined) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * (MAP_SIZE - 50);
      x = Math.cos(angle) * dist;
      y = Math.sin(angle) * dist;
    }
    
    this.food.push({
      x: x,
      y: y,
      value: value,
      radius: isDebris ? 5 + value * 0.8 : 3 + Math.random() * 2,
      isDebris: isDebris,
      glowIntensity: 0.5 + Math.random() * 0.5,
      pulseSpeed: 0.02 + Math.random() * 0.03,
      pulseVal: Math.random() * Math.PI,
      color: isDebris ? '#ff007f' : SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)].grad[0]
    });
  }
  
  spawnItem(x, y, type) {
    if (x === undefined || y === undefined) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * (MAP_SIZE - 200);
      x = Math.cos(angle) * dist;
      y = Math.sin(angle) * dist;
    }
    if (!type) {
      type = Math.random() < 0.55 ? 'magnet' : 'shield';
    }
    this.items.push({
      x: x,
      y: y,
      type: type,
      radius: 13,
      pulseVal: Math.random() * Math.PI,
      pulseSpeed: 0.04,
      rotation: Math.random() * Math.PI * 2
    });
  }
  
  // HUD Feed Alerts
  pushKillNotification(killerName, victimName, isPlayerKiller) {
    const feed = document.getElementById('kill-feed');
    const item = document.createElement('div');
    item.className = 'feed-item';
    
    if (isPlayerKiller) {
      item.style.borderLeftColor = 'var(--neon-green)';
    }
    
    item.innerHTML = `<span class="feed-killer">${killerName}</span>가 <span class="feed-victim">${victimName}</span>을 처치했습니다!`;
    feed.appendChild(item);
    
    // Auto cleanup of old items
    setTimeout(() => {
      item.remove();
    }, 4000);
  }
  
  // Game Loop
  loop(time) {
    if (this.lastTime === 0) this.lastTime = time;
    const dt = time - this.lastTime;
    this.lastTime = time;
    
    if (this.gameState === 'playing' || (this.multiplayerMode === 'host' && this.gameState === 'gameover')) {
      this.update(dt);
      this.draw();
    } else {
      // Menu background ambient simulation
      this.drawMenuBackground();
    }
    
    requestAnimationFrame((t) => this.loop(t));
  }
  
  update(dt) {
    // Calculate delta-time speed scale factor (60 FPS base)
    this.speedScale = Math.min(3.0, dt / 16.67);

    if (this.multiplayerMode === 'client') {
      this.updatePlayerAngle();
      
      // Clients update camera tracking based on host-sent coordinates
      if (this.player) {
        this.camera.x += (this.player.x - this.camera.x) * 0.15;
        this.camera.y += (this.player.y - this.camera.y) * 0.15;
        const targetZoom = Math.max(0.45, 1.0 - (this.player.mass - 10) * 0.0006);
        this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
      }
      
      this.updateHUD();
      return;
    }

    // Solo or Host updates powerup active timers
    for (let s of this.snakes) {
      if (s.magnetTimer > 0) s.magnetTimer = Math.max(0, s.magnetTimer - dt);
      if (s.shieldTimer > 0) s.shieldTimer = Math.max(0, s.shieldTimer - dt);
    }

    this.updatePlayerAngle();
    this.updateSnakes();
    this.updateFoodCollisions();
    this.updateWormCollisions();
    this.updateItemCollisions();
    
    // Maintain food counts
    while (this.food.filter(f => !f.isDebris).length < MAX_FOOD) {
      this.spawnFood();
    }
    
    // Maintain item counts
    while (this.items.length < MAX_ITEMS) {
      this.spawnItem();
    }
    
    // Maintain bots
    while (this.snakes.filter(s => s.isBot).length < BOT_COUNT) {
      this.spawnBot();
    }
    
    // Update Camera
    if (this.player) {
      // Linear interpolation camera follow
      this.camera.x += (this.player.x - this.camera.x) * 0.15;
      this.camera.y += (this.player.y - this.camera.y) * 0.15;
      
      // Zoom out slowly as player grows
      const targetZoom = Math.max(0.45, 1.0 - (this.player.mass - 10) * 0.0006);
      this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
    } else if (this.multiplayerMode === 'host' && this.snakes.length > 0) {
      // Spectator camera follows the largest snake
      const sorted = [...this.snakes].sort((a, b) => b.mass - a.mass);
      const followSnake = sorted[0];
      this.camera.x += (followSnake.x - this.camera.x) * 0.15;
      this.camera.y += (followSnake.y - this.camera.y) * 0.15;
      const targetZoom = Math.max(0.45, 1.0 - (followSnake.mass - 10) * 0.0006);
      this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
    }
    
    // Broadcast state to clients if Host
    if (this.multiplayerMode === 'host') {
      if (!this.broadcastFrameCount) this.broadcastFrameCount = 0;
      this.broadcastFrameCount++;
      if (this.broadcastFrameCount >= 3) {
        this.broadcastFrameCount = 0;
        this.broadcastState();
      }
    }
    
    // Update HTML overlay elements
    this.updateHUD();
  }
  
  updatePlayerAngle() {
    if (!this.player) return;
    
    // Calculate angle from screen center to mouse position
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const dx = this.mouse.x - centerX;
    const dy = this.mouse.y - centerY;
    
    // Only adjust angle if cursor is away from head center to prevent spinning
    if (Math.hypot(dx, dy) > 15) {
      this.player.targetAngle = Math.atan2(dy, dx);
    }
    
    // Send input to host if in client mode
    if (this.multiplayerMode === 'client' && this.connToHost && this.connToHost.open) {
      this.connToHost.send({
        type: 'input',
        angle: this.player.targetAngle,
        isBoosting: this.player.isBoosting
      });
    }
  }
  
  updateSnakes() {
    for (let s of this.snakes) {
      if (s.isBot) {
        this.runBotAI(s);
      } else if (s.id !== 'player') {
        const clientInput = this.clientInputs[s.id];
        if (clientInput) {
          s.targetAngle = clientInput.angle;
          s.isBoosting = clientInput.isBoosting;
        }
      }
      
      // Smooth angle interpolation scaled by delta time
      let angleDiff = s.targetAngle - s.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      s.angle += angleDiff * s.turnRate * this.speedScale;
      
      // Update speeds
      s.speed = s.isBoosting ? BOOST_SPEED : BASE_SPEED;
      
      // Handle booster mass shedding (scaled by delta time)
      if (s.isBoosting) {
        if (s.mass > 12) {
          s.boostCounter += this.speedScale;
          if (s.boostCounter >= 12) {
            s.boostCounter = 0;
            s.mass -= 0.6; // reduce length
            
            // Spawn nutrient behind the worm's tail segment
            const tail = s.segments[s.segments.length - 1];
            this.spawnFood(tail.x + (Math.random() - 0.5) * 20, tail.y + (Math.random() - 0.5) * 20, 1.2, false);
          }
        } else {
          s.isBoosting = false;
          if (s.id === 'player') {
            this.audio.stopBoost();
          }
        }
      }
      
      // Handle Magnet powerup pull mechanics (optimized with squared distances)
      if (s.magnetTimer > 0) {
        const pullRadius = 180 + Math.sqrt(s.mass) * 2.5;
        const pullRadiusSq = pullRadius * pullRadius;
        for (let f of this.food) {
          const dx = s.x - f.x;
          const dy = s.y - f.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < pullRadiusSq) {
            const dist = Math.sqrt(distSq);
            const pullSpeed = 5.5 * (1 - dist / pullRadius) + 2.0;
            const angle = Math.atan2(dy, dx);
            f.x += Math.cos(angle) * pullSpeed * this.speedScale;
            f.y += Math.sin(angle) * pullSpeed * this.speedScale;
          }
        }
      }
      
      // Update Head position
      s.x += Math.cos(s.angle) * s.speed * this.speedScale;
      s.y += Math.sin(s.angle) * s.speed * this.speedScale;
      
      // Update radius based on mass
      s.radius = 11 + Math.sqrt(s.mass) * 0.45;
      s.spacing = s.radius * 0.50;
      
      // Manage Segment Lengths matching Mass
      const targetSegments = 12 + Math.floor(s.mass * 0.65);
      
      // Shift head segment coordinates
      s.segments[0].x = s.x;
      s.segments[0].y = s.y;
      s.segments[0].radius = s.radius;
      
      // Follow Constraint physics (optimized hypot)
      for (let i = 1; i < s.segments.length; i++) {
        const seg = s.segments[i];
        const prev = s.segments[i - 1];
        
        const dx = prev.x - seg.x;
        const dy = prev.y - seg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > s.spacing) {
          const ratio = s.spacing / dist;
          seg.x = prev.x - dx * ratio;
          seg.y = prev.y - dy * ratio;
        }
        
        // Taper segment size down slightly near the tail
        const tailFactor = Math.max(0.4, 1.0 - (i / s.segments.length) * 0.4);
        seg.radius = s.radius * tailFactor;
      }
      
      // Grow segment array if needed
      if (s.segments.length < targetSegments) {
        const tail = s.segments[s.segments.length - 1];
        s.segments.push({ x: tail.x, y: tail.y, radius: tail.radius });
      } else if (s.segments.length > targetSegments) {
        s.segments.pop();
      }
    }
  }
  
  runBotAI(bot) {
    const now = Date.now();
    
    // Circular bounds check: steer bots back when nearing borders (squared check)
    const distToCenterSq = bot.x * bot.x + bot.y * bot.y;
    if (distToCenterSq > (MAP_SIZE - 250) * (MAP_SIZE - 250)) {
      bot.targetAngle = Math.atan2(-bot.y, -bot.x);
      bot.isBoosting = false;
      return;
    }
    
    // Core Steering: Evasion logic (avoiding crash heads into other bodies - optimized)
    let avoidX = 0;
    let avoidY = 0;
    let obstacleNear = false;
    
    for (let other of this.snakes) {
      const isSelf = other.id === bot.id;
      const startIndex = isSelf ? 5 : 0;
      
      for (let i = startIndex; i < other.segments.length; i++) {
        const seg = other.segments[i];
        const dx = bot.x - seg.x;
        const dy = bot.y - seg.y;
        const distSq = dx * dx + dy * dy;
        
        // Critical collision envelope
        const dangerLimit = 90 + seg.radius + bot.radius;
        const dangerLimitSq = dangerLimit * dangerLimit;
        if (distSq < dangerLimitSq) {
          const dist = Math.sqrt(distSq);
          // Weight avoidance strength: closer means stronger evasion
          const weight = (dangerLimit - dist) / dangerLimit;
          avoidX += dx * weight;
          avoidY += dy * weight;
          obstacleNear = true;
        }
      }
    }
    
    if (obstacleNear) {
      bot.targetAngle = Math.atan2(avoidY, avoidX);
      if (Math.random() < 0.05 && bot.mass > 15) {
        bot.isBoosting = true;
      }
      return;
    }
    
    // Normal Wandering / Food Gathering
    if (bot.isBoosting && Math.random() < 0.04) {
      bot.isBoosting = false;
    }
    
    // Periodically re-evaluate target food/path
    if (now - bot.lastDecisionTime > 400) {
      bot.lastDecisionTime = now;
      
      // Look for closest food (optimized with squared distances)
      let closestFood = null;
      let minDistSq = 280 * 280; // Sight range squared
      
      for (let f of this.food) {
        const dx = f.x - bot.x;
        const dy = f.y - bot.y;
        const dSq = dx * dx + dy * dy;
        
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closestFood = f;
        }
      }
      
      if (closestFood) {
        bot.targetAngle = Math.atan2(closestFood.y - bot.y, closestFood.x - bot.x);
        
        // Randomly boost towards food if large enough
        if (closestFood.isDebris && bot.mass > 20 && Math.random() < 0.2) {
          bot.isBoosting = true;
        }
      } else {
        // Random wander
        if (Math.random() < 0.3) {
          bot.targetAngle += (Math.random() - 0.5) * 1.5;
        }
      }
    }
  }
  
  updateFoodCollisions() {
    for (let s of this.snakes) {
      for (let i = this.food.length - 1; i >= 0; i--) {
        const f = this.food[i];
        const dx = s.x - f.x;
        const dy = s.y - f.y;
        const distSq = dx * dx + dy * dy;
        const limit = s.radius + f.radius;
        
        // Collision threshold: head overlaps food (squared check)
        if (distSq < limit * limit) {
          // Consume food
          s.mass += f.value * 0.15;
          this.food.splice(i, 1);
          
          if (s.id === 'player') {
            this.audio.playEat();
          }
        }
      }
    }
  }

  updateItemCollisions() {
    for (let s of this.snakes) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        const dx = s.x - item.x;
        const dy = s.y - item.y;
        const distSq = dx * dx + dy * dy;
        const limit = s.radius + item.radius;
        
        if (distSq < limit * limit) {
          // Activate item for snake
          if (item.type === 'magnet') {
            s.magnetTimer = 8000;
          } else if (item.type === 'shield') {
            s.shieldTimer = 8000;
          }
          
          this.items.splice(i, 1);
          
          if (s.id === 'player') {
            this.audio.playPowerUp();
          }
        }
      }
    }
  }
  
  updateWormCollisions() {
    const deadSnakes = new Set();
    
    for (let s1 of this.snakes) {
      // Map limits check (squared check)
      const distToCenterSq = s1.x * s1.x + s1.y * s1.y;
      if (distToCenterSq > MAP_SIZE * MAP_SIZE) {
        deadSnakes.add(s1);
        continue;
      }
      
      // If shield is active, bypass body crash checks
      if (s1.shieldTimer > 0) {
        continue;
      }
      
      // Body collision checks: check if head of s1 crashes into body of s2
      for (let s2 of this.snakes) {
        if (s1.id === s2.id) continue; // No self collision
        
        for (let i = 0; i < s2.segments.length; i++) {
          const seg = s2.segments[i];
          const dx = s1.x - seg.x;
          const dy = s1.y - seg.y;
          const distSq = dx * dx + dy * dy;
          const limit = (s1.radius * 0.85) + seg.radius;
          
          // Collision! Head radius + body segment radius (squared check)
          if (distSq < limit * limit) {
            deadSnakes.add(s1);
            
            // Register score metrics
            if (s2.id === 'player' && !deadSnakes.has(s2)) {
              this.kills++;
              this.pushKillNotification('Player', s1.name, true);
              if (this.multiplayerMode === 'host') {
                this.broadcastNotification('Player', s1.name, true);
              }
            } else if (s1.id === 'player') {
              this.pushKillNotification(s2.name, 'Player', false);
              if (this.multiplayerMode === 'host') {
                this.broadcastNotification(s2.name, 'Player', false);
              }
            } else {
              const s2IsClient = this.connections[s2.id] !== undefined;
              const s1IsClient = this.connections[s1.id] !== undefined;
              const killerName = s2IsClient ? (this.clientNames[s2.id] || s2.name) : s2.name;
              const victimName = s1IsClient ? (this.clientNames[s1.id] || s1.name) : s1.name;
              
              this.pushKillNotification(killerName, victimName, false);
              if (this.multiplayerMode === 'host') {
                this.broadcastNotification(killerName, victimName, false);
              }
            }
            break;
          }
        }
        if (deadSnakes.has(s1)) break;
      }
    }
    
    // Process deaths
    for (let dead of deadSnakes) {
      this.handleWormDeath(dead);
    }
  }
  
  handleWormDeath(worm) {
    // Remove snake
    this.snakes = this.snakes.filter(s => s.id !== worm.id);
    
    // Spawn debris nutrients along body
    const step = Math.max(1, Math.floor(worm.segments.length / 15));
    for (let i = 0; i < worm.segments.length; i += step) {
      const seg = worm.segments[i];
      // Distribute debris with slight noise/offset
      const ox = (Math.random() - 0.5) * 25;
      const oy = (Math.random() - 0.5) * 25;
      const foodValue = 1.0 + Math.sqrt(worm.mass) * 0.15;
      this.spawnFood(seg.x + ox, seg.y + oy, foodValue, true);
    }
    
    if (worm.id === 'player') {
      this.audio.playDeath();
      this.audio.stopBoost();
      this.gameState = 'gameover';
      
      // Set results values
      document.getElementById('res-mass').innerText = Math.floor(worm.mass);
      document.getElementById('res-kills').innerText = this.kills;
      
      const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
      document.getElementById('res-time').innerText = `${elapsedSec}s`;
      
      this.gameOverScreen.classList.add('visible');
    }
  }
  
  updateHUD() {
    if (!this.player) return;
    
    // 1. Stats
    document.getElementById('stat-mass').innerText = Math.floor(this.player.mass);
    document.getElementById('stat-kills').innerText = this.kills;
    
    // Rank calculation
    const sorted = [...this.snakes].sort((a, b) => b.mass - a.mass);
    const pId = (this.multiplayerMode === 'client' && this.peer) ? this.peer.id : 'player';
    const pRank = sorted.findIndex(s => s.id === pId) + 1;
    document.getElementById('stat-rank').innerText = `${pRank}/${this.snakes.length}`;
    
    // 2. Leaderboard (Top 10)
    const listEl = document.getElementById('leaderboard-list');
    listEl.innerHTML = '';
    
    document.getElementById('player-count').innerText = `${this.snakes.length} Arena`;
    
    const topTen = sorted.slice(0, 10);
    topTen.forEach((s, idx) => {
      const li = document.createElement('li');
      const isSelf = s.id === pId;
      li.className = `leaderboard-item ${isSelf ? 'player-rank' : ''}`;
      
      li.innerHTML = `
        <span class="leaderboard-rank">${idx + 1}</span>
        <span class="leaderboard-name">${s.name}</span>
        <span class="leaderboard-score">${Math.floor(s.mass)}</span>
      `;
      listEl.appendChild(li);
    });
    
    // 3. Powerups HUD (Dynamic timer overlays)
    const pContainer = document.getElementById('hud-powerups');
    if (pContainer) {
      pContainer.innerHTML = '';
      
      if (this.player.magnetTimer > 0) {
        const pct = (this.player.magnetTimer / 8000) * 100;
        const badge = document.createElement('div');
        badge.className = 'powerup-badge magnet';
        badge.innerHTML = `
          <span class="powerup-icon">🧲</span>
          <div class="powerup-details">
            <div class="powerup-name">자석 활성화</div>
            <div class="powerup-bar-bg">
              <div class="powerup-bar" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
        pContainer.appendChild(badge);
      }
      
      if (this.player.shieldTimer > 0) {
        const pct = (this.player.shieldTimer / 8000) * 100;
        const badge = document.createElement('div');
        badge.className = 'powerup-badge shield';
        badge.innerHTML = `
          <span class="powerup-icon">🛡️</span>
          <div class="powerup-details">
            <div class="powerup-name">보호막 활성화</div>
            <div class="powerup-bar-bg">
              <div class="powerup-bar" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
        pContainer.appendChild(badge);
      }
    }
    
    // 4. Draw Minimap
    this.drawMinimap();
  }
  
  drawMinimap() {
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    this.minimapCtx.clearRect(0, 0, w, h);
    
    // Draw boundary circle
    this.minimapCtx.beginPath();
    this.minimapCtx.arc(w / 2, h / 2, (w / 2) - 4, 0, Math.PI * 2);
    this.minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.minimapCtx.lineWidth = 1;
    this.minimapCtx.stroke();
    
    // Draw food dots
    // Draw only a small subset of food on minimap to keep performance high
    this.minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < this.food.length; i += 8) {
      const f = this.food[i];
      const mx = w / 2 + (f.x / MAP_SIZE) * (w / 2 - 4);
      const my = h / 2 + (f.y / MAP_SIZE) * (h / 2 - 4);
      this.minimapCtx.fillRect(mx, my, 1, 1);
    }
    
    // Draw snakes
    for (let s of this.snakes) {
      const pId = (this.multiplayerMode === 'client' && this.peer) ? this.peer.id : 'player';
      const isPlayer = s.id === pId;
      const mx = w / 2 + (s.x / MAP_SIZE) * (w / 2 - 4);
      const my = h / 2 + (s.y / MAP_SIZE) * (h / 2 - 4);
      
      this.minimapCtx.beginPath();
      this.minimapCtx.arc(mx, my, isPlayer ? 3 : 1.5, 0, Math.PI * 2);
      this.minimapCtx.fillStyle = isPlayer ? 'var(--neon-cyan)' : 'var(--neon-magenta)';
      this.minimapCtx.shadowColor = isPlayer ? 'var(--neon-cyan)' : 'var(--neon-magenta)';
      this.minimapCtx.shadowBlur = isPlayer ? 4 : 0;
      this.minimapCtx.fill();
      this.minimapCtx.shadowBlur = 0; // Reset
    }
  }
  
  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    ctx.save();
    
    // Camera Transform centering screen on player
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    
    // Draw Arena Grid
    this.drawGrid(ctx);
    
    // Draw Arena Boundary
    this.drawArenaBoundary(ctx);
    
    // Draw Food
    this.drawFood(ctx);
    
    // Draw Powerup Items
    this.drawItems(ctx);
    
    // Draw Worms
    this.drawWorms(ctx);
    
    ctx.restore();
  }
  
  drawGrid(ctx) {
    const gridSize = 160;
    const startX = Math.floor((this.camera.x - window.innerWidth / this.camera.zoom) / gridSize) * gridSize;
    const endX = Math.ceil((this.camera.x + window.innerWidth / this.camera.zoom) / gridSize) * gridSize;
    const startY = Math.floor((this.camera.y - window.innerHeight / this.camera.zoom) / gridSize) * gridSize;
    const endY = Math.ceil((this.camera.y + window.innerHeight / this.camera.zoom) / gridSize) * gridSize;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    
    // Grid Lines
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }
  
  drawArenaBoundary(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, MAP_SIZE, 0, Math.PI * 2);
    
    // Outer boundary glow effect
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
    ctx.lineWidth = 12;
    ctx.shadowColor = 'rgba(255, 0, 127, 0.8)';
    ctx.shadowBlur = 30;
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    ctx.stroke();
    
    ctx.shadowBlur = 0; // Reset glow
  }
  
  drawFood(ctx) {
    for (let f of this.food) {
      if (f.pulseVal === undefined) f.pulseVal = Math.random() * Math.PI;
      if (f.pulseSpeed === undefined) f.pulseSpeed = 0.02 + Math.random() * 0.03;
      if (f.glowIntensity === undefined) f.glowIntensity = 0.5 + Math.random() * 0.5;
      
      f.pulseVal += f.pulseSpeed;
      const currentRadius = f.radius + Math.sin(f.pulseVal) * 1.2;
      
      ctx.save();
      // Glow circle
      ctx.beginPath();
      ctx.arc(f.x, f.y, currentRadius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 0.12 * f.glowIntensity;
      ctx.fill();
      
      // Core circle
      ctx.beginPath();
      ctx.arc(f.x, f.y, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 1.0;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
    }
  }

  drawItems(ctx) {
    for (let item of this.items) {
      if (item.pulseVal === undefined) item.pulseVal = Math.random() * Math.PI;
      if (item.pulseSpeed === undefined) item.pulseSpeed = 0.04;
      if (item.rotation === undefined) item.rotation = Math.random() * Math.PI * 2;
      
      item.pulseVal += item.pulseSpeed;
      item.rotation += 0.025;
      const currentRadius = item.radius + Math.sin(item.pulseVal) * 1.8;
      
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      
      const color = item.type === 'magnet' ? 'var(--neon-purple)' : 'var(--neon-cyan)';
      
      // Outer glow circle
      ctx.beginPath();
      ctx.arc(0, 0, currentRadius * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.14;
      ctx.fill();
      
      // Inner card body
      ctx.beginPath();
      ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 1.0;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      // Symbol glyph
      ctx.font = '12px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.type === 'magnet' ? '🧲' : '🛡️', 0, 0.5);
      
      ctx.restore();
    }
  }
  
  drawWorms(ctx) {
    // Sort snakes by mass so that larger snakes render on top
    const sortedSnakes = [...this.snakes].sort((a, b) => a.mass - b.mass);
    
    for (let s of sortedSnakes) {
      ctx.save();
      
      // 1. Draw Tail Booster Aura if boosting
      if (s.isBoosting && s.segments.length > 0) {
        ctx.save();
        ctx.shadowColor = s.colorGrad[0];
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.35;
        
        ctx.beginPath();
        for (let i = s.segments.length - 1; i >= Math.max(0, s.segments.length - 6); i--) {
          const seg = s.segments[i];
          ctx.arc(seg.x, seg.y, seg.radius * 1.5, 0, Math.PI * 2);
        }
        ctx.fillStyle = s.colorGrad[0];
        ctx.fill();
        ctx.restore();
      }
      
      // 2. Draw Body segments (tail to neck, excluding head)
      // Optimized: Use solid colors pre-calculated from cached RGB components rather than costly gradients
      for (let i = s.segments.length - 1; i >= 1; i--) {
        const seg = s.segments[i];
        
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, seg.radius, 0, Math.PI * 2);
        
        const ratio = 1 - (i / s.segments.length);
        const r = Math.round(s.rgbStart.r + (s.rgbEnd.r - s.rgbStart.r) * ratio);
        const g = Math.round(s.rgbStart.g + (s.rgbEnd.g - s.rgbStart.g) * ratio);
        const b = Math.round(s.rgbStart.b + (s.rgbEnd.b - s.rgbStart.b) * ratio);
        
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        
        // Subtle outline to make overlapping segments readable
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      // 3. Draw Head (s.segments[0])
      const head = s.segments[0];
      ctx.beginPath();
      ctx.arc(head.x, head.y, head.radius * 1.05, 0, Math.PI * 2);
      
      // Draw radial gradient only on head (cheap, since it's only done 19 times per frame)
      const headGrad = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, head.radius);
      headGrad.addColorStop(0, s.colorGrad[0]);
      headGrad.addColorStop(1, `rgb(${Math.round(s.rgbEnd.r * 0.85)},${Math.round(s.rgbEnd.g * 0.85)},${Math.round(s.rgbEnd.b * 0.85)})`);
      
      ctx.fillStyle = headGrad;
      ctx.shadowColor = s.colorGrad[0];
      ctx.shadowBlur = s.isBoosting ? 22 : 12;
      ctx.fill();
      ctx.shadowBlur = 0; // Reset
      
      // Draw Head Eye details
      const eyeOffsetAngle = 0.35; // Angle relative to head center
      const eyeDist = head.radius * 0.45;
      const eyeRadius = head.radius * 0.24;
      const pupilRadius = eyeRadius * 0.5;
      
      // Left and Right Eye coordinates
      const eyeLAngle = s.angle - eyeOffsetAngle;
      const eyeRAngle = s.angle + eyeOffsetAngle;
      
      const eyeLx = head.x + Math.cos(eyeLAngle) * eyeDist;
      const eyeLy = head.y + Math.sin(eyeLAngle) * eyeDist;
      
      const eyeRx = head.x + Math.cos(eyeRAngle) * eyeDist;
      const eyeRy = head.y + Math.sin(eyeRAngle) * eyeDist;
      
      // Draw Whites of eyes
      ctx.beginPath();
      ctx.arc(eyeLx, eyeLy, eyeRadius, 0, Math.PI * 2);
      ctx.arc(eyeRx, eyeRy, eyeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      
      // Draw Pupils (pointing slightly towards angle direction)
      const pupilLx = eyeLx + Math.cos(s.angle) * (eyeRadius - pupilRadius);
      const pupilLy = eyeLy + Math.sin(s.angle) * (eyeRadius - pupilRadius);
      const pupilRx = eyeRx + Math.cos(s.angle) * (eyeRadius - pupilRadius);
      const pupilRy = eyeRy + Math.sin(s.angle) * (eyeRadius - pupilRadius);
      
      ctx.beginPath();
      ctx.arc(pupilLx, pupilLy, pupilRadius, 0, Math.PI * 2);
      ctx.arc(pupilRx, pupilRy, pupilRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#060913';
      ctx.fill();
      
      // Draw Shield Aura Bubble around head
      if (s.shieldTimer > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(head.x, head.y, head.radius * 1.75, 0, Math.PI * 2);
        
        const shieldGrad = ctx.createRadialGradient(head.x, head.y, head.radius * 0.9, head.x, head.y, head.radius * 1.75);
        shieldGrad.addColorStop(0, 'rgba(0, 240, 255, 0.0)');
        shieldGrad.addColorStop(0.7, 'rgba(0, 240, 255, 0.22)');
        shieldGrad.addColorStop(1.0, 'rgba(0, 240, 255, 0.65)');
        
        ctx.fillStyle = shieldGrad;
        ctx.shadowColor = 'var(--neon-cyan)';
        ctx.shadowBlur = 18;
        ctx.fill();
        
        // Ring
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.restore();
      }
      
      // Draw Magnet Field Waves around head
      if (s.magnetTimer > 0) {
        ctx.save();
        const now = Date.now();
        ctx.beginPath();
        ctx.arc(head.x, head.y, head.radius * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(189, 0, 255, 0.16)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 12]);
        ctx.lineDashOffset = -now * 0.08;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(head.x, head.y, head.radius * 1.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(189, 0, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -now * 0.05;
        ctx.stroke();
        ctx.restore();
      }
      
      // Draw Name above head
      ctx.font = `bold ${Math.max(10, 11 + head.radius * 0.15)}px Outfit`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillText(s.name, head.x, head.y - head.radius - 12);
      
      ctx.restore();
    }
  }
  
  // Ambient background draw for Menu Screen
  drawMenuBackground() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, w, h);
    
    // Draw moving neon abstract circles
    const now = Date.now();
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    
    // Abstract colored particles
    for (let i = 0; i < 4; i++) {
      const radius = 250 + Math.sin(now * 0.0003 + i) * 60;
      const cx = w / 2 + Math.cos(now * 0.0002 + i * 2) * (w / 3);
      const cy = h / 2 + Math.sin(now * 0.0002 + i * 3) * (h / 3);
      
      const colors = ['rgba(0, 240, 255, 0.04)', 'rgba(255, 0, 127, 0.04)', 'rgba(57, 255, 20, 0.03)', 'rgba(189, 0, 255, 0.03)'];
      
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = colors[i];
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Helper: Hex/Rgb color interpolation for smooth gradients
  interpolateColor(color1, color2, factor) {
    if (factor === 0) return color1;
    if (factor === 1) return color2;
    
    // Convert hex to rgb
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);
    
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    
    return `rgb(${r}, ${g}, ${b})`;
  }
  
  hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  // ==========================================
  // MULTIPLAYER NETWORKING LAYER (PEERJS WebRTC)
  // ==========================================
  
  switchLobbyTab(tab) {
    document.querySelectorAll('.lobby-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.lobby-sub-panel').forEach(el => el.classList.add('hidden'));
    
    const targetTab = document.getElementById(`tab-${tab}`);
    if (targetTab) targetTab.classList.add('active');
    
    const hostPanel = document.getElementById('host-panel');
    const joinPanel = document.getElementById('join-panel');
    const startBtn = document.getElementById('start-btn');
    
    if (tab === 'solo') {
      this.multiplayerMode = 'solo';
      if (startBtn) {
        startBtn.innerText = 'Enter Arena';
        startBtn.disabled = false;
      }
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
    } else if (tab === 'host') {
      this.multiplayerMode = 'host';
      if (startBtn) {
        startBtn.innerText = 'Host & Play';
        startBtn.disabled = true; // Disabled until peer ID is generated
      }
      if (hostPanel) hostPanel.classList.remove('hidden');
      
      if (!this.peer || this.peer.destroyed) {
        this.initHostPeer();
      } else if (this.roomId) {
        const display = document.getElementById('room-code-display');
        if (display) display.innerText = this.roomId;
        if (startBtn) startBtn.disabled = false;
      }
    } else if (tab === 'join') {
      this.multiplayerMode = 'client';
      if (startBtn) {
        startBtn.innerText = 'Join & Play';
        startBtn.disabled = false;
      }
      if (joinPanel) joinPanel.classList.remove('hidden');
      if (this.peer && !this.peer.destroyed) {
        this.peer.destroy();
        this.peer = null;
      }
    }
  }

  initHostPeer() {
    const display = document.getElementById('room-code-display');
    if (display) display.innerText = 'Generating...';
    
    const attemptConnection = () => {
      const shortId = Math.floor(1000 + Math.random() * 9000).toString();
      this.roomId = shortId;
      
      this.peer = new Peer('slither-' + shortId);
      
      this.peer.on('open', (id) => {
        if (display) display.innerText = shortId;
        const startBtn = document.getElementById('start-btn');
        if (startBtn) startBtn.disabled = false;
        this.updateConnectedPlayersList();
      });
      
      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });
      
      this.peer.on('error', (err) => {
        if (err.type === 'id-taken') {
          this.peer.destroy();
          attemptConnection();
        } else {
          if (display) display.innerText = 'Error!';
          console.error('PeerJS error:', err);
        }
      });
    };
    
    attemptConnection();
  }

  handleIncomingConnection(conn) {
    conn.on('open', () => {
      this.connections[conn.peer] = conn;
      this.clientInputs[conn.peer] = { angle: 0, isBoosting: false };
      this.updateConnectedPlayersList();
    });
    
    conn.on('data', (data) => {
      if (data.type === 'join') {
        this.clientNames[conn.peer] = data.name;
        this.clientSkins[conn.peer] = data.skin;
        
        if (this.gameState === 'playing') {
          this.spawnClientSnake(conn.peer, data.name, data.skin);
        }
        this.updateConnectedPlayersList();
      } else if (data.type === 'input') {
        if (this.clientInputs[conn.peer]) {
          this.clientInputs[conn.peer].angle = data.angle;
          this.clientInputs[conn.peer].isBoosting = data.isBoosting;
        }
      }
    });
    
    conn.on('close', () => {
      this.removeClientSnake(conn.peer);
      delete this.connections[conn.peer];
      delete this.clientInputs[conn.peer];
      delete this.clientNames[conn.peer];
      delete this.clientSkins[conn.peer];
      this.updateConnectedPlayersList();
    });
    
    conn.on('error', (err) => {
      console.error('Connection error for peer ' + conn.peer + ':', err);
    });
  }

  spawnClientSnake(peerId, name, skinIndex) {
    if (this.snakes.some(s => s.id === peerId)) return;
    
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (MAP_SIZE - 400);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    
    const snake = this.createWorm(x, y, name, false, skinIndex);
    snake.id = peerId;
    this.snakes.push(snake);
    
    this.audio.playPowerUp();
    this.broadcastSound('powerup');
  }

  removeClientSnake(peerId) {
    const victim = this.snakes.find(s => s.id === peerId);
    if (victim) {
      this.handleWormDeath(victim);
    }
  }

  broadcastState() {
    if (Object.keys(this.connections).length === 0) return;
    
    const serializedSnakes = this.snakes.map(s => ({
      id: s.id,
      name: s.name,
      x: s.x,
      y: s.y,
      angle: s.angle,
      segments: s.segments.map(seg => ({ x: seg.x, y: seg.y, radius: seg.radius })),
      mass: s.mass,
      radius: s.radius,
      spacing: s.spacing,
      isBoosting: s.isBoosting,
      magnetTimer: s.magnetTimer,
      shieldTimer: s.shieldTimer,
      skinIndex: s.skinIndex,
      colorGrad: s.colorGrad,
      rgbStart: s.rgbStart,
      rgbEnd: s.rgbEnd
    }));
    
    const serializedFood = this.food.map(f => ({
      x: f.x,
      y: f.y,
      value: f.value,
      radius: f.radius,
      isDebris: f.isDebris,
      color: f.color
    }));
    
    const serializedItems = this.items.map(item => ({
      x: item.x,
      y: item.y,
      type: item.type,
      radius: item.radius
    }));
    
    const statePayload = {
      type: 'state',
      snakes: serializedSnakes,
      food: serializedFood,
      items: serializedItems
    };
    
    for (let peerId in this.connections) {
      const conn = this.connections[peerId];
      if (conn.open) {
        conn.send(statePayload);
      }
    }
  }

  broadcastNotification(killerName, victimName, isPlayerKiller) {
    const payload = {
      type: 'notification',
      killerName: killerName,
      victimName: victimName,
      isPlayerKiller: isPlayerKiller
    };
    for (let peerId in this.connections) {
      const conn = this.connections[peerId];
      if (conn.open) {
        conn.send(payload);
      }
    }
  }

  broadcastSound(soundName) {
    const payload = {
      type: 'sound',
      name: soundName
    };
    for (let peerId in this.connections) {
      const conn = this.connections[peerId];
      if (conn.open) {
        conn.send(payload);
      }
    }
  }

  updateConnectedPlayersList() {
    const list = document.getElementById('connected-players-list');
    if (!list) return;
    
    list.innerHTML = '<li>You (Host)</li>';
    for (let peerId in this.connections) {
      const name = this.clientNames[peerId] || 'Guest';
      const li = document.createElement('li');
      li.innerText = `${name} (${peerId})`;
      list.appendChild(li);
    }
  }

  connectToHost(hostRoomCode) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      statusEl.className = 'connection-status';
      statusEl.innerText = `Connecting to Room ${hostRoomCode}...`;
    }
    
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.disabled = true;
    
    if (this.peer) {
      this.peer.destroy();
    }
    
    this.peer = new Peer();
    
    this.peer.on('open', (id) => {
      const conn = this.peer.connect('slither-' + hostRoomCode);
      this.connToHost = conn;
      this.setupClientConnection(conn);
    });
    
    this.peer.on('error', (err) => {
      if (statusEl) {
        statusEl.className = 'connection-status error';
        statusEl.innerText = `Connection error: ${err.type}`;
      }
      if (startBtn) startBtn.disabled = false;
    });
  }

  setupClientConnection(conn) {
    const statusEl = document.getElementById('connection-status');
    const startBtn = document.getElementById('start-btn');
    
    conn.on('open', () => {
      if (statusEl) {
        statusEl.className = 'connection-status success';
        statusEl.innerText = 'Connected! Joining game...';
      }
      if (startBtn) startBtn.disabled = false;
      
      const name = this.nicknameInput.value.trim() || 'Wormy';
      conn.send({
        type: 'join',
        name: name,
        skin: this.selectedSkin
      });
      
      this.startGame();
    });
    
    conn.on('data', (data) => {
      this.handleHostData(data);
    });
    
    conn.on('close', () => {
      if (statusEl) {
        statusEl.className = 'connection-status error';
        statusEl.innerText = 'Disconnected from host.';
      }
      this.endClientGame();
    });
    
    conn.on('error', (err) => {
      if (statusEl) {
        statusEl.className = 'connection-status error';
        statusEl.innerText = `Error: ${err.message}`;
      }
    });
  }

  handleHostData(data) {
    if (data.type === 'state') {
      const wasPlaying = this.gameState === 'playing';
      const oldMass = this.player ? this.player.mass : 0;
      
      this.snakes = data.snakes;
      this.food = data.food;
      this.items = data.items;
      
      const mySnake = this.snakes.find(s => s.id === this.peer.id);
      
      if (wasPlaying) {
        if (!mySnake) {
          this.audio.playDeath();
          this.gameState = 'gameover';
          
          document.getElementById('res-mass').innerText = Math.floor(oldMass);
          document.getElementById('res-kills').innerText = this.kills;
          
          const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
          document.getElementById('res-time').innerText = `${elapsedSec}s`;
          
          this.gameOverScreen.classList.add('visible');
          
          if (this.connToHost) {
            this.connToHost.close();
          }
        } else {
          // Play eat sound on positive mass diff
          if (mySnake.mass > oldMass + 0.05) {
            this.audio.playEat();
          }
          
          // Boost sound triggers
          if (this.player) {
            if (mySnake.isBoosting && !this.player.isBoosting) {
              this.audio.startBoost();
            } else if (!mySnake.isBoosting && this.player.isBoosting) {
              this.audio.stopBoost();
            }
            
            // Powerup sounds
            if (mySnake.shieldTimer > 0 && this.player.shieldTimer <= 0) {
              this.audio.playPowerUp();
            }
            if (mySnake.magnetTimer > 0 && this.player.magnetTimer <= 0) {
              this.audio.playPowerUp();
            }
          }
        }
      }
      
      this.player = mySnake;
      this.updateHUD();
      
    } else if (data.type === 'notification') {
      const name = this.nicknameInput.value.trim() || 'Wormy';
      const isLocalKiller = (data.killerName === name);
      this.pushKillNotification(data.killerName, data.victimName, isLocalKiller);
      if (isLocalKiller) {
        this.kills++;
      }
    } else if (data.type === 'sound') {
      if (data.name === 'shieldBreak') {
        this.audio.playShieldBreak();
      }
    }
  }

  endClientGame() {
    this.gameState = 'menu';
    this.menuScreen.classList.remove('hidden');
    this.gameOverScreen.classList.remove('visible');
    if (this.connToHost) {
      this.connToHost.close();
      this.connToHost = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}

// Instantiate game engine on load
window.addEventListener('DOMContentLoaded', () => {
  new SlitherGame();
});
