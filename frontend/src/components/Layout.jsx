import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAVBAR_HEIGHT = 64;
const SIDEBAR_MIN = 64;
const SIDEBAR_MAX = 260;
const SIDEBAR_DEFAULT = 68;
const SIDEBAR_OPEN = 180;

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [resizeArmed, setResizeArmed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const sidepanelRef = useRef(null);
  const profileRef = useRef(null);
  const resizeState = useRef({ active: false });

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: 'M2 2h5v5H2zm0 7h5v5H2zm7-7h5v5H9zm0 7h5v5H9z',
      href: 'http://localhost:3000/home',
      matches: ['/home', '/dashboard']
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: 'M14 9a1 1 0 01-1 1H5l-3 3V3a1 1 0 011-1h10a1 1 0 011 1z',
      href: 'http://localhost:3000/messages',
      matches: ['/messages', '/chat']
    },
    {
      id: 'live-editor',
      label: 'Live Editor',
      icon: 'M3 13h10M5 11l6-6 2 2-6 6H5z',
      href: 'http://localhost:5173',
      matches: ['/repositories', '/repositories/']
    },
    {
      id: 'qa-engineer',
      label: 'QA Engineer',
      icon: 'M12 2l-2 2h-4v2h2v12h6v-12h2v-2h-4l-2-2zM9 6v10h6V6H9z',
      href: 'http://localhost:6001',
      matches: []
    }
  ];

  const getPageTitle = () => {
    const titles = {
      '/dashboard': 'Home',
      '/home': 'Home',
      '/repositories': 'Live Editor',
      '/chat': 'Messages',
      '/messages': 'Messages',
      '/profile': 'Profile',
      '/settings': 'Settings'
    };
    return titles[location.pathname] || 'Home';
  };

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  useEffect(() => {
    const content = document.querySelector('.content.shell-content');
    if (!content) return undefined;

    const updateOverflow = () => {
      const isOverflowing = content.scrollHeight > content.clientHeight;
      content.setAttribute('data-overflowing', String(isOverflowing));
    };

    updateOverflow();

    const resizeObserver = new ResizeObserver(() => {
      updateOverflow();
    });

    resizeObserver.observe(content);
    if (content.firstElementChild) {
      resizeObserver.observe(content.firstElementChild);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [location.pathname]);

  useEffect(() => {
    const handleMove = (event) => {
      if (!resizeState.current.active) return;
      const nextWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, event.clientX));
      setSidebarWidth(nextWidth);
      setSidebarOpen(true);
    };

    const handleUp = () => {
      resizeState.current.active = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleSidebarEnter = () => {
    setSidebarOpen(true);
    setSidebarWidth((prev) => Math.max(prev, SIDEBAR_OPEN));
  };

  const handleSidebarLeave = () => {
    setSidebarOpen(false);
    setResizeArmed(false);
    setSidebarWidth(SIDEBAR_DEFAULT);
  };

  const armResize = () => {
    setResizeArmed(true);
    window.setTimeout(() => setResizeArmed(false), 4500);
  };

  const beginResize = (event) => {
    if (!resizeArmed) return;
    event.preventDefault();
    resizeState.current.active = true;
  };

  const goTo = (to) => {
    navigate(to);
    setProfileOpen(false);
  };

  return (
    <div className="app app-shell">
      <header className="devdock-navbar" style={{ height: `${NAVBAR_HEIGHT}px` }}>
        <div className="devdock-brand glass">
          <img src="/favicon.png" alt="DevDock logo" className="devdock-brand-logo" />
          <span>DevDock</span>
        </div>

        <div className="devdock-navbar-right" ref={profileRef}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/messages')}>
            AI Assistant
          </button>

          <button
            type="button"
            className="profile-trigger"
            onClick={() => setProfileOpen((prev) => !prev)}
            aria-expanded={profileOpen}
          >
            <span className="avatar">{user?.name?.charAt(0) || 'U'}</span>
            <span className="profile-trigger-name">{user?.name || 'User'}</span>
          </button>

          {profileOpen && (
            <div className="profile-dropdown">
              <button type="button" onClick={() => goTo('/profile')}>Profile</button>
              <button type="button" onClick={() => goTo('/settings')}>Settings</button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="app-body" style={{ paddingTop: `${NAVBAR_HEIGHT}px` }}>
        <aside
          ref={sidepanelRef}
          className={`sidebar shell-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'} ${resizeArmed ? 'resize-armed' : ''}`}
          style={{ width: `${sidebarWidth}px` }}
          onMouseEnter={handleSidebarEnter}
          onMouseLeave={handleSidebarLeave}
          onClick={(event) => {
            if (event.target.closest('.nav-item')) return;
            handleSidebarEnter();
          }}
          onDoubleClick={armResize}
        >
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${(item.matches || []).some((route) => location.pathname.startsWith(route)) ? 'active' : ''}`}
                title={item.label}
                onClick={(event) => {
                  event.stopPropagation();
                  window.location.href = item.href;
                }}
              >
                <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d={item.icon} />
                </svg>
                <span className="nav-text">{item.label}</span>
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="sidebar-resize-handle"
            title={resizeArmed ? 'Drag to resize' : 'Double-click sidebar, then drag to resize'}
            onMouseDown={beginResize}
          />
        </aside>

        <div className="main shell-main" style={{ marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)` }}>
          <div className="content shell-content">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Layout;
