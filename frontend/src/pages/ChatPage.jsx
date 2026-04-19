import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../apiClient';
import API_BASE_URL from '../config';

const SEARCH_DEBOUNCE_MS = 400;

function buildSelfRoomId(userId) {
  return `self:${String(userId || '').trim()}`;
}

function buildDirectRoomId(userIdA, userIdB) {
  const ids = [String(userIdA || '').trim(), String(userIdB || '').trim()].filter(Boolean).sort();
  if (ids.length !== 2 || ids[0] === ids[1]) {
    return null;
  }

  return `dm:${ids[0]}:${ids[1]}`;
}

function isDirectRoom(room) {
  return String(room || '').startsWith('dm:');
}

function isSelfRoom(room) {
  return String(room || '').startsWith('self:');
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRoomTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';

  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function createThreadFromUser(person, currentUserId) {
  const room = buildDirectRoomId(currentUserId, person.id);
  if (!room) return null;

  return {
    room,
    kind: 'dm',
    title: person.name || person.email || 'Conversation',
    description: person.email || 'Direct message',
    avatar: (person.name || person.email || 'U').charAt(0).toUpperCase(),
    online: String(person.status || '').toLowerCase() === 'active',
    unreadCount: 0,
    messageCount: 0,
    lastMessage: '',
    lastTimestamp: null,
    participantId: person.id,
    participantName: person.name || null,
    participantEmail: person.email || null,
    participantStatus: person.status || 'inactive'
  };
}

function createThreadFromMessage(message, currentUserId) {
  const room = String(message?.room || '').trim();
  if (!room) return null;

  if (isSelfRoom(room)) {
    return {
      room,
      kind: 'self',
      title: 'Saved Messages',
      description: 'Notes to yourself',
      avatar: '📝',
      online: true,
      unreadCount: 0,
      messageCount: 0,
      lastMessage: String(message?.text || ''),
      lastTimestamp: message?.timestamp || null,
      participantId: currentUserId,
      participantName: null,
      participantEmail: null,
      participantStatus: 'active'
    };
  }

  if (isDirectRoom(room)) {
    const senderName = String(message?.userName || message?.userEmail || 'Conversation').trim();
    return {
      room,
      kind: 'dm',
      title: senderName || 'Conversation',
      description: String(message?.userEmail || 'Direct message'),
      avatar: (senderName || 'U').charAt(0).toUpperCase(),
      online: true,
      unreadCount: 0,
      messageCount: 0,
      lastMessage: String(message?.text || ''),
      lastTimestamp: message?.timestamp || null,
      participantId: String(message?.userId || '').trim() || currentUserId,
      participantName: message?.userName || null,
      participantEmail: message?.userEmail || null,
      participantStatus: 'active'
    };
  }

  return null;
}

const ChatPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { randomUserId } = useParams();

  const [threads, setThreads] = useState([]);
  const [activeRoom, setActiveRoom] = useState('');
  const [messages, setMessages] = useState([]);
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchPending, setSearchPending] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState('');
  const attachmentInputRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const socketRef = useRef(null);
  const activeRoomRef = useRef('');
  const threadsRef = useRef([]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.room === activeRoom) || null,
    [threads, activeRoom]
  );

  const totalUnread = useMemo(
    () => threads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0),
    [threads]
  );

  const showUserSearch = debouncedSearch.trim().length > 0;

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
      setSearchPending(false);
    }, SEARCH_DEBOUNCE_MS);

    setSearchPending(true);
    return () => window.clearTimeout(timerId);
  }, [searchInput]);

  useEffect(() => {
    const q = debouncedSearch.trim();

    if (!q) {
      setUserSearchResults([]);
      setUserSearchLoading(false);
      return;
    }

    let cancelled = false;

    const fetchUsers = async () => {
      try {
        setUserSearchLoading(true);
        const response = await apiClient.get('/users/search', { params: { q } });
        if (!cancelled) {
          setUserSearchResults(response.data?.data || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to search users:', error);
          setUserSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setUserSearchLoading(false);
        }
      }
    };

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    const fetchThreads = async () => {
      try {
        setLoadingThreads(true);
        const response = await apiClient.get('/chat/threads');
        const nextThreads = Array.isArray(response.data?.data) ? response.data.data : [];
        setThreads(nextThreads);

        const routeRoom = resolveRoomFromRoute(randomUserId, user?.id);
        if (routeRoom) {
          setActiveRoom(routeRoom);
          return;
        }

        const defaultThread = nextThreads.find((thread) => thread.kind === 'self') || nextThreads[0];
        if (defaultThread) {
          setActiveRoom(defaultThread.room);
        }
      } catch (error) {
        console.error('Failed to load chat threads:', error);
        setThreads([]);
        if (user?.id) {
          setActiveRoom(buildSelfRoomId(user.id));
        }
      } finally {
        setLoadingThreads(false);
      }
    };

    fetchThreads();
  }, [randomUserId, user?.id]);

  useEffect(() => {
    const routeRoom = resolveRoomFromRoute(randomUserId, user?.id);
    if (routeRoom) {
      setActiveRoom(routeRoom);
    }
  }, [randomUserId, user?.id]);

  useEffect(() => {
    if (!activeRoom) return;

    setThreads((prev) => prev.map((thread) => (
      thread.room === activeRoom ? { ...thread, unreadCount: 0 } : thread
    )));

    if (messagesByRoom[activeRoom]) {
      setMessages(messagesByRoom[activeRoom]);
      setLoadingMessages(false);
      return;
    }

    fetchMessages(activeRoom);
  }, [activeRoom]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user?.id) return undefined;

    const socketUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket']
    });

    socketRef.current = socket;

    const handleIncomingMessage = (incomingMessage) => {
      if (!incomingMessage?.room || !incomingMessage?.id) return;

      const normalizedRoom = String(incomingMessage.room || '').trim();
      const normalizedId = String(incomingMessage.id || '').trim();
      const currentUserId = String(user.id || '').trim();
      const belongsToUser = normalizedRoom === buildSelfRoomId(currentUserId)
        || normalizedRoom === buildDirectRoomId(currentUserId, incomingMessage.userId)
        || normalizedRoom === activeRoomRef.current
        || isSelfRoom(normalizedRoom)
        || isDirectRoom(normalizedRoom);

      if (!belongsToUser) return;

      setMessagesByRoom((prev) => {
        const roomMessages = Array.isArray(prev[normalizedRoom]) ? prev[normalizedRoom] : [];
        if (roomMessages.some((entry) => String(entry.id) === normalizedId)) {
          return prev;
        }

        const nextRoomMessages = [...roomMessages, incomingMessage];
        if (normalizedRoom === activeRoomRef.current) {
          setMessages(nextRoomMessages);
        }

        return { ...prev, [normalizedRoom]: nextRoomMessages };
      });

      setThreads((prev) => {
        const existingThread = prev.find((thread) => thread.room === normalizedRoom) || null;
        const nextThread = existingThread || createThreadFromMessage(incomingMessage, currentUserId);
        if (!nextThread) {
          return prev;
        }

        const updatedThread = {
          ...nextThread,
          lastMessage: String(incomingMessage.text || nextThread.lastMessage || ''),
          lastTimestamp: incomingMessage.timestamp || nextThread.lastTimestamp,
          unreadCount: normalizedRoom === activeRoomRef.current
            ? 0
            : Number(existingThread?.unreadCount || nextThread.unreadCount || 0) + 1
        };

        if (existingThread) {
          return prev.map((thread) => thread.room === normalizedRoom ? updatedThread : thread);
        }

        return [updatedThread, ...prev];
      });
    };

    socket.on('chat:message:new', handleIncomingMessage);
    socket.on('connect', () => {
      threadsRef.current.forEach((thread) => {
        if (thread?.room) {
          socket.emit('chat:join', thread.room);
        }
      });

      if (activeRoomRef.current) {
        socket.emit('chat:join', activeRoomRef.current);
      }
    });

    return () => {
      socket.off('chat:message:new', handleIncomingMessage);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [user?.id]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    threads.forEach((thread) => {
      if (thread?.room) {
        socket.emit('chat:join', thread.room);
      }
    });
  }, [threads]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    if (activeRoom) {
      socket.emit('chat:join', activeRoom);
    }
  }, [activeRoom]);

  useEffect(() => {
    if (messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
    }
  }, [messages, activeRoom]);

  const resolveRoomFromRoute = (routeValue, currentUserId) => {
    const value = String(routeValue || '').trim();
    if (!value || !currentUserId) return '';
    if (isSelfRoom(value) || isDirectRoom(value)) return value;
    if (value === currentUserId) return buildSelfRoomId(currentUserId);
    return buildDirectRoomId(currentUserId, value) || '';
  };

  const fetchMessages = async (room) => {
    if (!room) return;

    try {
      setLoadingMessages(true);
      const response = await apiClient.get('/chat/messages', { params: { room } });
      const roomMessages = Array.isArray(response.data?.data) ? response.data.data : [];
      setMessages(roomMessages);
      setMessagesByRoom((prev) => ({ ...prev, [room]: roomMessages }));

      const latest = roomMessages[roomMessages.length - 1];
      if (latest) {
        setThreads((prev) => prev.map((thread) => (
          thread.room === room
            ? { ...thread, lastMessage: latest.text || '', lastTimestamp: latest.timestamp || thread.lastTimestamp }
            : thread
        )));
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
      setMessages([]);
      setMessagesByRoom((prev) => ({ ...prev, [room]: [] }));
    } finally {
      setLoadingMessages(false);
    }
  };

  const openThread = (thread) => {
    if (!thread?.room) return;
    setActiveRoom(thread.room);
    setSearchInput('');
    setDebouncedSearch('');
    setUserSearchResults([]);
  };

  const openDirectConversation = (person) => {
    if (!person?.id || !user?.id) return;

    const nextThread = createThreadFromUser(person, user.id);
    if (!nextThread) return;

    setThreads((prev) => {
      const exists = prev.some((thread) => thread.room === nextThread.room);
      if (exists) {
        return prev.map((thread) => thread.room === nextThread.room ? { ...thread, ...nextThread } : thread);
      }

      return [nextThread, ...prev];
    });

    setActiveRoom(nextThread.room);
    setSearchInput('');
    setDebouncedSearch('');
    setUserSearchResults([]);
  };

  const updateThreadPreview = (room, text, timestamp) => {
    setThreads((prev) => {
      const existingThread = prev.find((thread) => thread.room === room) || null;
      if (!existingThread) {
        const placeholder = createThreadFromMessage({ room, text, timestamp, userName: 'Conversation' }, user?.id);
        if (!placeholder) return prev;
        return [
          { ...placeholder, lastMessage: String(text || '').trim() || placeholder.lastMessage, lastTimestamp: timestamp || placeholder.lastTimestamp },
          ...prev
        ];
      }

      return prev.map((thread) => (
        thread.room === room
          ? { ...thread, lastMessage: String(text || '').trim() || thread.lastMessage, lastTimestamp: timestamp || thread.lastTimestamp }
          : thread
      ));
    });
  };

  const appendMessageToRoom = (room, nextMessage) => {
    const normalizedRoom = String(room || '').trim();
    const normalizedMessageId = String(nextMessage?.id || '').trim();

    setMessagesByRoom((prev) => {
      const roomMessages = Array.isArray(prev[normalizedRoom]) ? prev[normalizedRoom] : [];
      if (normalizedMessageId && roomMessages.some((entry) => String(entry.id) === normalizedMessageId)) {
        return prev;
      }

      const nextRoomMessages = [...roomMessages, nextMessage];
      if (normalizedRoom === activeRoomRef.current) {
        setMessages(nextRoomMessages);
      }
      return { ...prev, [normalizedRoom]: nextRoomMessages };
    });

    updateThreadPreview(normalizedRoom, nextMessage.text, nextMessage.timestamp);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending || !activeRoom) return;

    const roomAtSend = activeRoom;
    const optimisticMessage = {
      id: `local-${Date.now()}`,
      room: roomAtSend,
      userId: user?.id,
      userName: user?.name || 'You',
      userAvatar: user?.name?.charAt(0)?.toUpperCase() || 'Y',
      text: trimmed,
      timestamp: new Date().toISOString(),
      _local: true
    };

    const activeIsSelf = isSelfRoom(roomAtSend);
    const activePeer = threads.find((thread) => thread.room === roomAtSend) || null;

    try {
      setSending(true);
      appendMessageToRoom(roomAtSend, optimisticMessage);
      setMessage('');
      setPendingAttachment('');

      const response = await apiClient.post('/chat/messages', {
        room: roomAtSend,
        text: trimmed,
        targetUserId: activeIsSelf ? '' : (activePeer?.participantId || '')
      });

      if (response.data?.success && response.data?.data) {
        const confirmedMessage = response.data.data;
        setMessagesByRoom((prev) => {
          const roomMessages = [...(prev[roomAtSend] || [])];
          const index = roomMessages.findIndex((entry) => entry.id === optimisticMessage.id);
          if (index >= 0) {
            roomMessages[index] = confirmedMessage;
          } else if (!roomMessages.some((entry) => String(entry.id) === String(confirmedMessage.id))) {
            roomMessages.push(confirmedMessage);
          }

          if (roomAtSend === activeRoomRef.current) {
            setMessages(roomMessages);
          }

          return { ...prev, [roomAtSend]: roomMessages };
        });
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      alert(error.response?.data?.message || 'Unable to send message.');

      setMessagesByRoom((prev) => {
        const roomMessages = (prev[roomAtSend] || []).filter((entry) => entry.id !== optimisticMessage.id);
        if (roomAtSend === activeRoomRef.current) {
          setMessages(roomMessages);
        }
        return { ...prev, [roomAtSend]: roomMessages };
      });
    } finally {
      setSending(false);
    }
  };

  const filteredThreads = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return threads;

    return threads.filter((thread) => {
      const haystack = [
        thread.title,
        thread.description,
        thread.lastMessage,
        thread.participantName,
        thread.participantEmail
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [threads, debouncedSearch]);

  const sidebarTitle = useMemo(() => {
    return showUserSearch ? 'Search Users' : 'Chats';
  }, [showUserSearch]);

  const threadMeta = activeThread || {
    room: activeRoom,
    kind: activeRoom.startsWith('self:') ? 'self' : 'dm',
    title: activeRoom.startsWith('self:') ? 'Saved Messages' : 'Conversation',
    description: activeRoom.startsWith('self:') ? 'Notes to yourself' : 'Direct message',
    avatar: activeRoom.startsWith('self:') ? '📝' : 'U',
    online: true,
    unreadCount: 0,
    participantId: ''
  };

  return (
    <div className="page-enter chat-dm-page">
      <div className="chat-dm-shell">
        <aside className="chat-dm-sidebar card">
          <div className="chat-dm-sidebar-header">
            <div>
              <h2>{sidebarTitle}</h2>
            </div>
            <div className="chat-dm-sidebar-count chat-dm-sidebar-unread">{totalUnread}</div>
          </div>

          <div className="chat-dm-search-wrap">
            <div className="chat-dm-search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by name or email"
              />
              {searchInput && (
                <button type="button" aria-label="Clear search" onClick={() => setSearchInput('')}>
                  ✕
                </button>
              )}
            </div>
            <div className={`chat-dm-search-progress ${searchPending ? 'is-active' : ''}`} />
          </div>

          <div className="chat-dm-thread-list">
            {showUserSearch && userSearchLoading && (
              <div className="chat-dm-no-results">
                <div className="chat-dm-no-results-icon">⌛</div>
                <h3>Searching users...</h3>
                <p>Finding matching people by name or email.</p>
              </div>
            )}

            {showUserSearch && !userSearchLoading && userSearchResults.map((person) => (
              <button
                key={person.id}
                type="button"
                className="chat-dm-thread-item"
                onClick={() => openDirectConversation(person)}
                title={person.email || person.name}
              >
                <div className="chat-dm-thread-avatar-wrap">
                  <div className="chat-dm-thread-avatar" style={{ background: 'linear-gradient(135deg, #f09433 0%, #bc1888 100%)' }}>
                    <span>{(person.name || person.email || 'U').charAt(0).toUpperCase()}</span>
                  </div>
                  <span className={`chat-dm-status-dot ${person.status === 'active' ? 'is-online' : 'is-offline'}`} />
                </div>

                <div className="chat-dm-thread-copy">
                  <div className="chat-dm-thread-topline">
                    <span className="chat-dm-thread-name">{person.name || 'Unknown User'}</span>
                  </div>
                  <div className="chat-dm-thread-bottomline">
                    <p className="chat-dm-thread-preview">{person.email || 'No email available'}</p>
                  </div>
                </div>
              </button>
            ))}

            {showUserSearch && !userSearchLoading && userSearchResults.length === 0 && (
              <div className="chat-dm-no-results">
                <div className="chat-dm-no-results-icon">👤</div>
                <h3>No users found</h3>
                <p>Try searching with another username or email.</p>
              </div>
            )}

            {!showUserSearch && loadingThreads && (
              <div className="chat-dm-no-results">
                <div className="chat-dm-no-results-icon loading-spinner" />
                <h3>Loading chats...</h3>
                <p>Fetching your saved and started conversations.</p>
              </div>
            )}

            {!showUserSearch && !loadingThreads && filteredThreads.map((thread) => {
              const isActive = activeRoom === thread.room;
              const preview = thread.lastMessage || thread.description || 'Start the conversation.';

              return (
                <button
                  key={thread.room}
                  type="button"
                  onClick={() => openThread(thread)}
                  className={`chat-dm-thread-item ${isActive ? 'is-active' : ''}`}
                  title={thread.title}
                >
                  <div className="chat-dm-thread-avatar-wrap">
                    <div className="chat-dm-thread-avatar" style={{ background: 'linear-gradient(135deg, #f09433 0%, #bc1888 100%)' }}>
                      <span>{thread.avatar}</span>
                    </div>
                    <span className={`chat-dm-status-dot ${thread.online ? 'is-online' : 'is-offline'}`} />
                  </div>

                  <div className="chat-dm-thread-copy">
                    <div className="chat-dm-thread-topline">
                      <span className="chat-dm-thread-name">{thread.title}</span>
                      <span className="chat-dm-thread-time">{formatRoomTime(thread.lastTimestamp)}</span>
                    </div>
                    <div className="chat-dm-thread-bottomline">
                      <p className="chat-dm-thread-preview" title={preview}>{preview}</p>
                      {thread.unreadCount > 0 && <span className="chat-dm-thread-badge">{thread.unreadCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })}

            {!showUserSearch && !loadingThreads && filteredThreads.length === 0 && (
              <div className="chat-dm-no-results">
                <div className="chat-dm-no-results-icon">💬</div>
                <h3>No chats yet</h3>
                <p>Search a user to start a private conversation.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="chat-dm-main card">
          <header className="chat-dm-header">
            <div className="chat-dm-header-left">
              <div className="chat-dm-header-avatar" style={{ background: 'linear-gradient(135deg, #f09433 0%, #bc1888 100%)' }}>
                <span>{threadMeta.avatar}</span>
              </div>
              <div>
                <div className="chat-dm-header-title-row">
                  <h2>{threadMeta.title}</h2>
                  {threadMeta.online && <span className="chat-dm-status-inline">Active now</span>}
                </div>
                <p>{threadMeta.description}</p>
              </div>
            </div>

            <button type="button" className="chat-dm-info-btn" aria-label="Room info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
          </header>

          <div className="chat-dm-messages" ref={messagesScrollRef} style={{ overflow: 'auto' }}>
            {loadingMessages && (
              <div className="chat-dm-empty-state">
                <div className="chat-dm-empty-icon loading-spinner" />
                <p>Loading messages...</p>
              </div>
            )}

            {!loadingMessages && messages.length === 0 && (
              <div className="chat-dm-empty-state">
                <div className="chat-dm-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  </svg>
                </div>
                <h3>Send a message to start</h3>
                <p>Your private chat will appear here.</p>
              </div>
            )}

            {!loadingMessages && messages.map((msg) => {
              const isSent = String(msg.userId || '') === String(user?.id || '');
              return (
                <div key={msg.id} className={`chat-dm-message-row ${isSent ? 'sent' : 'received'}`}>
                  {!isSent && (
                    <div className="chat-dm-message-avatar" style={{ background: 'linear-gradient(135deg, #f09433 0%, #bc1888 100%)' }}>
                      {(msg.userAvatar || msg.userName || 'U').charAt(0)}
                    </div>
                  )}

                  <div className="chat-dm-message-stack">
                    <div className={`chat-dm-bubble ${isSent ? 'sent' : 'received'}`}>
                      <span>{msg.text}</span>
                    </div>
                    <div className={`chat-dm-meta ${isSent ? 'sent' : 'received'}`}>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>

                  {isSent && (
                    <div className="chat-dm-message-avatar is-self">
                      {(user?.name || msg.userName || 'U').charAt(0)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={sendMessage} className="chat-dm-composer">
            <button
              type="button"
              className="chat-dm-icon-btn"
              aria-label="Add emoji"
              title="Add emoji"
              onClick={() => setMessage((prev) => `${prev} 😊`)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8.5 14a5 5 0 0 0 7 0" />
                <path d="M9 10h.01" />
                <path d="M15 10h.01" />
              </svg>
            </button>

            <button
              type="button"
              className="chat-dm-icon-btn"
              aria-label="Upload image"
              title="Upload image"
              onClick={() => attachmentInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <path d="m7 15 3-3 3 3 4-4 2 2" />
                <circle cx="9" cy="8" r="1.25" />
              </svg>
            </button>

            <input
              ref={attachmentInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => setPendingAttachment(event.target.files?.[0]?.name || '')}
            />

            <div className="chat-dm-composer-field">
              {pendingAttachment && <span className="chat-dm-attachment-pill">{pendingAttachment}</span>}
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message..."
                className="chat-dm-input"
              />
            </div>

            <button type="submit" className="chat-dm-send-btn" disabled={sending}>
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default ChatPage;
