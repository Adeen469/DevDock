const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { ChatMessage, User } = require('../models');
const { Op } = require('sequelize');

const SELF_ROOM_PREFIX = 'self:';
const DM_ROOM_PREFIX = 'dm:';

function buildSelfRoomId(userId) {
  return `${SELF_ROOM_PREFIX}${String(userId || '').trim()}`;
}

function buildDirectRoomId(userIdA, userIdB) {
  const ids = [String(userIdA || '').trim(), String(userIdB || '').trim()].filter(Boolean).sort();
  if (ids.length !== 2 || ids[0] === ids[1]) {
    return null;
  }

  return `${DM_ROOM_PREFIX}${ids[0]}:${ids[1]}`;
}

function parsePrivateRoom(room) {
  const value = String(room || '').trim();
  if (!value) return null;

  if (value.startsWith(SELF_ROOM_PREFIX)) {
    const participantId = value.slice(SELF_ROOM_PREFIX.length).trim();
    if (!participantId) return null;
    return { kind: 'self', participantIds: [participantId] };
  }

  if (value.startsWith(DM_ROOM_PREFIX)) {
    const participantIds = value
      .slice(DM_ROOM_PREFIX.length)
      .split(':')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (participantIds.length !== 2 || participantIds[0] === participantIds[1]) {
      return null;
    }

    return { kind: 'dm', participantIds: participantIds.sort() };
  }

  return null;
}

function roomBelongsToUser(room, userId) {
  const parsed = parsePrivateRoom(room);
  const normalizedUserId = String(userId || '').trim();
  if (!parsed || !normalizedUserId) return false;
  return parsed.participantIds.includes(normalizedUserId);
}

function getRoomKind(room) {
  const parsed = parsePrivateRoom(room);
  return parsed?.kind || null;
}

function getOtherParticipantId(room, currentUserId) {
  const parsed = parsePrivateRoom(room);
  if (!parsed || parsed.kind !== 'dm') return null;
  return parsed.participantIds.find((participantId) => participantId !== String(currentUserId || '').trim()) || null;
}

function normalizeRequestedRoom(room, currentUserId) {
  const requestedRoom = String(room || '').trim();
  if (!requestedRoom) return null;

  const parsed = parsePrivateRoom(requestedRoom);
  if (parsed) {
    return roomBelongsToUser(requestedRoom, currentUserId) ? requestedRoom : null;
  }

  if (requestedRoom === 'self') {
    return buildSelfRoomId(currentUserId);
  }

  return null;
}

function getThreadTitle(thread, currentUserId, currentUser) {
  if (thread.kind === 'self') {
    return 'Saved Messages';
  }

  const otherUser = thread.participantId === String(currentUserId || '').trim() ? currentUser : thread.participant;
  return otherUser?.name || otherUser?.email || 'Conversation';
}

function getThreadSubtitle(thread, currentUserId, currentUser) {
  if (thread.kind === 'self') {
    return 'Notes to yourself';
  }

  const otherUser = thread.participantId === String(currentUserId || '').trim() ? currentUser : thread.participant;
  return otherUser?.email || otherUser?.name || 'Direct message';
}

function getThreadAvatar(thread, currentUserId, currentUser) {
  if (thread.kind === 'self') {
    return '📝';
  }

  const otherUser = thread.participantId === String(currentUserId || '').trim() ? currentUser : thread.participant;
  const initial = (otherUser?.name || otherUser?.email || 'U').charAt(0).toUpperCase();
  return initial;
}

function getThreadOnlineState(thread, currentUserId, currentUser) {
  if (thread.kind === 'self') return true;
  const otherUser = thread.participantId === String(currentUserId || '').trim() ? currentUser : thread.participant;
  return String(otherUser?.status || '').toLowerCase() === 'active';
}

router.get('/threads', authMiddleware, async (req, res) => {
  try {
    const currentUserId = String(req.user.id || '').trim();
    const currentUser = await User.findByPk(currentUserId, {
      attributes: ['id', 'name', 'email', 'status']
    });

    const messages = await ChatMessage.findAll({
      where: {
        [Op.or]: [
          { room: { [Op.like]: `${SELF_ROOM_PREFIX}%` } },
          { room: { [Op.like]: `${DM_ROOM_PREFIX}%` } }
        ]
      },
      order: [['timestamp', 'DESC']],
      limit: 5000
    });

    const threadMap = new Map();
    const participantIds = new Set([currentUserId]);

    for (const message of messages) {
      const parsed = parsePrivateRoom(message.room);
      if (!parsed || !roomBelongsToUser(message.room, currentUserId)) {
        continue;
      }

      if (!threadMap.has(message.room)) {
        threadMap.set(message.room, {
          room: message.room,
          kind: parsed.kind,
          participantIds: parsed.participantIds,
          latestMessage: message.toJSON(),
          messageCount: 0,
          unreadCount: 0
        });
      }

      const thread = threadMap.get(message.room);
      thread.messageCount += 1;

      if (String(message.userId || '') !== currentUserId) {
        thread.unreadCount += 1;
      }

      if (parsed.kind === 'dm') {
        const otherUserId = getOtherParticipantId(message.room, currentUserId);
        if (otherUserId) {
          participantIds.add(otherUserId);
        }
      }
    }

    if (!threadMap.has(buildSelfRoomId(currentUserId))) {
      threadMap.set(buildSelfRoomId(currentUserId), {
        room: buildSelfRoomId(currentUserId),
        kind: 'self',
        participantIds: [currentUserId],
        latestMessage: null,
        messageCount: 0,
        unreadCount: 0
      });
    }

    const participantUserIds = Array.from(participantIds).filter((id) => id !== currentUserId);
    const participants = participantUserIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: participantUserIds } },
          attributes: ['id', 'name', 'email', 'status']
        })
      : [];

    const participantMap = new Map(participants.map((participant) => [String(participant.id), participant]));

    const threads = Array.from(threadMap.values())
      .map((thread) => {
        const otherParticipantId = getOtherParticipantId(thread.room, currentUserId);
        const participant = otherParticipantId ? participantMap.get(otherParticipantId) : currentUser;
        const latestMessage = thread.latestMessage;

        return {
          room: thread.room,
          kind: thread.kind,
          title: getThreadTitle({ ...thread, participantId: otherParticipantId, participant }, currentUserId, currentUser),
          description: getThreadSubtitle({ ...thread, participantId: otherParticipantId, participant }, currentUserId, currentUser),
          avatar: getThreadAvatar({ ...thread, participantId: otherParticipantId, participant }, currentUserId, currentUser),
          online: getThreadOnlineState({ ...thread, participantId: otherParticipantId, participant }, currentUserId, currentUser),
          unreadCount: thread.unreadCount,
          messageCount: thread.messageCount,
          lastMessage: latestMessage?.text || '',
          lastTimestamp: latestMessage?.timestamp || null,
          participantId: otherParticipantId || currentUserId,
          participantName: participant?.name || null,
          participantEmail: participant?.email || null
        };
      })
      .sort((a, b) => {
        const tsA = new Date(a.lastTimestamp || 0).getTime();
        const tsB = new Date(b.lastTimestamp || 0).getTime();
        return tsB - tsA;
      });

    res.json({
      success: true,
      data: threads
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/messages', authMiddleware, async (req, res) => {
  try {
    const room = normalizeRequestedRoom(req.query.room, req.user.id);

    if (!room) {
      return res.status(400).json({ success: false, message: 'Invalid or inaccessible room' });
    }

    const messages = await ChatMessage.findAll({
      where: { room },
      order: [['timestamp', 'ASC']],
      limit: 300
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/messages', authMiddleware, async (req, res) => {
  try {
    const targetUserId = String(req.body.targetUserId || '').trim();
    const room = normalizeRequestedRoom(req.body.room, req.user.id)
      || (targetUserId ? buildDirectRoomId(req.user.id, targetUserId) : null)
      || buildSelfRoomId(req.user.id);

    if (!room) {
      return res.status(400).json({ success: false, message: 'Invalid room' });
    }

    const text = String(req.body.text || '').trim();

    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    if (!roomBelongsToUser(room, req.user.id)) {
      return res.status(403).json({ success: false, message: 'You cannot post to this conversation' });
    }

    const created = await ChatMessage.create({
      room,
      userId: req.user.id,
      userName: req.user.name,
      userAvatar: req.user.name?.charAt(0)?.toUpperCase() || 'U',
      text,
      timestamp: new Date()
    });

    const io = req.app.get('io');
    if (io) {
      io.to(room).emit('chat:message:new', created.toJSON());
    }

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.buildSelfRoomId = buildSelfRoomId;
router.buildDirectRoomId = buildDirectRoomId;
router.parsePrivateRoom = parsePrivateRoom;
router.roomBelongsToUser = roomBelongsToUser;
router.normalizeRequestedRoom = normalizeRequestedRoom;

module.exports = router;