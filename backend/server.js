const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();

const { connectDB } = require('./models');
const User = require('./models/User');
const passport = require('./config/passport');
const authRoutes = require('./routes/auth');
const repositoryRoutes = require('./routes/repositories');
const userRoutes = require('./routes/users');
const aiRoutes = require('./routes/ai');
const chatRoutes = require('./routes/chat');
const { validateEnv } = require('./config/validateEnv');

const app = express();
const server = http.createServer(app);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// Security middleware
app.use(helmet());

// CORS configuration - allow multiple frontend ports
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests from localhost:3000, localhost:5173, localhost:5174
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174'
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174'
    ],
    credentials: true
  }
});

const SELF_ROOM_PREFIX = 'self:';
const DM_ROOM_PREFIX = 'dm:';

function roomBelongsToUser(room, userId) {
  const value = String(room || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!value || !normalizedUserId) return false;

  if (value.startsWith(SELF_ROOM_PREFIX)) {
    return value.slice(SELF_ROOM_PREFIX.length).trim() === normalizedUserId;
  }

  if (value.startsWith(DM_ROOM_PREFIX)) {
    const participantIds = value
      .slice(DM_ROOM_PREFIX.length)
      .split(':')
      .map((entry) => entry.trim())
      .filter(Boolean);

    return participantIds.length === 2 && participantIds.includes(normalizedUserId) && participantIds[0] !== participantIds[1];
  }

  return false;
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Unauthorized'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || user.status !== 'active') {
      return next(new Error('Unauthorized'));
    }

    socket.user = user;
    return next();
  } catch (error) {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = String(socket.user?.id || '').trim();
  if (userId) {
    socket.join(`self:${userId}`);
  }

  socket.on('chat:join', (room) => {
    if (roomBelongsToUser(room, userId)) {
      socket.join(String(room).trim());
    }
  });

  socket.on('chat:leave', (room) => {
    if (roomBelongsToUser(room, userId)) {
      socket.leave(String(room).trim());
    }
  });
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Passport middleware
app.use(passport.initialize());

// Routes
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);
app.set('io', io);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'DevDock API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    validateEnv();

    console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   🚀 DevDock Backend Server                 ║
║   Port: ${PORT}                                ║
║   Environment: ${process.env.NODE_ENV || 'development'}                    ║
║                                               ║
║   ⏳ Initializing services...                 ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);

    await connectDB();
    
    server.listen(PORT, () => {
      console.log('✅ Backend ready: Database Connected, Passport Configured, AI Service Ready.');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
