import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

const PORT = 3000;

// Game State
type GameObject = {
  id: string;
  type: 'miniature' | 'prop';
  x: number;
  y: number;
  rotation: number;
  label: string;
  color: string;
  ownerId?: string;
  fiducialId?: number; // TUIO marker ID
};

type DiceRoll = {
  id: string;
  player: string;
  sides: number;
  result: number;
  timestamp: number;
};

let gameState = {
  objects: {} as Record<string, GameObject>,
  diceRolls: [] as DiceRoll[],
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state
  socket.emit('state:init', gameState);

  // Handle dice rolls
  socket.on('dice:roll', (data: { player: string, sides: number }) => {
    const roll: DiceRoll = {
      id: Math.random().toString(36).substring(7),
      player: data.player,
      sides: data.sides,
      result: Math.floor(Math.random() * data.sides) + 1,
      timestamp: Date.now(),
    };
    gameState.diceRolls.unshift(roll);
    if (gameState.diceRolls.length > 20) {
      gameState.diceRolls.pop();
    }
    io.emit('dice:rolled', roll);
  });

  // Handle object updates from clients (drag and drop)
  socket.on('object:update', (obj: GameObject) => {
    gameState.objects[obj.id] = obj;
    socket.broadcast.emit('object:updated', obj);
  });

  // Handle object creation
  socket.on('object:create', (obj: GameObject) => {
    if (!gameState.objects[obj.id]) {
      gameState.objects[obj.id] = obj;
      io.emit('object:updated', obj);
    }
  });

  // Handle object deletion
  socket.on('object:delete', (id: string) => {
    delete gameState.objects[id];
    io.emit('object:deleted', id);
  });

  // Handle TUIO bridge updates
  socket.on('tuio:update', (data: { id: number, x: number, y: number, angle: number }) => {
    // Find object linked to this fiducial marker
    const objId = Object.keys(gameState.objects).find(key => gameState.objects[key].fiducialId === data.id);
    
    if (objId) {
      const obj = gameState.objects[objId];
      obj.x = data.x;
      obj.y = data.y;
      obj.rotation = (data.angle * 180) / Math.PI; // TUIO angle is in radians
      io.emit('object:updated', obj);
    } else {
      // Create a temporary object for unregistered markers
      const newObjId = `tuio-${data.id}`;
      gameState.objects[newObjId] = {
        id: newObjId,
        type: 'miniature',
        x: data.x,
        y: data.y,
        rotation: (data.angle * 180) / Math.PI,
        label: `Marker ${data.id}`,
        color: '#ff0000',
        fiducialId: data.id,
      };
      io.emit('object:updated', gameState.objects[newObjId]);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
