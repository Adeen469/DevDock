import { useState } from "react";
import { NavLink } from "react-router-dom";

export default function Sidebar({ onDBSetup }) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/upload", label: "Upload Project", icon: "📁" },
    { path: "/runs", label: "Test History", icon: "📋" },
    { path: "/reports", label: "Reports", icon: "📄" },
    { path: "/settings", label: "Settings", icon: "⚙" },
    { path: "/help", label: "Help", icon: "❓" }
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <h2>QA Engineer</h2>
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {!collapsed && <span className="nav-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="db-btn" onClick={onDBSetup}>
          {collapsed ? "DB" : "🔧 DB Setup"}
        </button>
      </div>
    </aside>
  );
}
