const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Project = require('./models/Project');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

dotenv.config();

const app = express();

const DEFAULT_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);
const extraOrigin = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
extraOrigin.forEach(o => DEFAULT_ORIGINS.add(o));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || DEFAULT_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin not allowed -> ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const upload = multer({ storage });

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName   = process.env.MONGO_DB || undefined;

mongoose
  .connect(mongoUri, dbName ? { dbName } : {})
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('Mongo connect error:', err?.message || err);
    process.exit(1);
  });

app.get('/', (_req, res) => res.send('API OK (Mongo + Socket.IO)'));

app.get('/api/projects', async (_req, res) => {
  try {
    const list = await Project.find({}, { title: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean();
    res.json(list.map(p => ({ id: String(p._id), title: p.title })));
  } catch (err) {
    console.error('GET /api/projects:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title required' });

    const doc = await Project.create({
      title,
      sceneState: { camera: null, objects: [], annotations: [], chat: [] },
    });
    res.status(201).json({ id: String(doc._id), title: doc.title });
  } catch (err) {
    console.error('POST /api/projects:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const doc = await Project.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ id: String(doc._id), title: doc.title, sceneState: doc.sceneState || {} });
  } catch (err) {
    console.error('GET /api/projects/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/projects/:id/scene', async (req, res) => {
  try {
    const { sceneState } = req.body;
    if (!sceneState) return res.status(400).json({ error: 'sceneState required' });

    const doc = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: { sceneState } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ error: 'Not found' });

    console.log(
      '[SAVE]', new Date().toISOString(),
      'project', req.params.id,
      'objects:', sceneState.objects?.length || 0,
      'ann:', sceneState.annotations?.length || 0
    );

    res.json({ ok: true, sceneState: doc.sceneState });
  } catch (err) {
    console.error('PUT /api/projects/:id/scene:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const doc = await Project.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/projects/:id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${req.file.filename}`; 
  res.status(201).json({ url });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin || DEFAULT_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin not allowed -> ${origin}`));
    },
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.on('join', ({ projectId, user }) => {
    if (!projectId) return;
    socket.join(projectId);
    socket.to(projectId).emit('user-joined', { user });
  });

  socket.on('chat', async ({ projectId, message }) => {
    try {
      if (!projectId || !message) return;
      const payload = { id: Date.now().toString(), ...message };
      await Project.findByIdAndUpdate(
        projectId,
        {
          $setOnInsert: { sceneState: { camera: null, objects: [], annotations: [], chat: [] } },
          $push: { 'sceneState.chat': payload },
        },
        { upsert: false }
      );
      io.to(projectId).emit('chat', payload);
    } catch (err) {
      console.error('socket chat:', err);
    }
  });

  socket.on('camera', ({ projectId, camera, user }) => {
    if (!projectId) return;
    socket.to(projectId).emit('camera', { camera, user });
  });

  socket.on('annotation:add', async ({ projectId, annotation }) => {
    try {
      if (!projectId || !annotation) return;
      await Project.findByIdAndUpdate(
        projectId,
        {
          $setOnInsert: { sceneState: { camera: null, objects: [], annotations: [], chat: [] } },
          $push: { 'sceneState.annotations': annotation },
        },
        { upsert: false }
      );
      io.to(projectId).emit('annotation:add', annotation);
    } catch (err) {
      console.error('socket annotation:add:', err);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server + Socket.IO on', PORT));
