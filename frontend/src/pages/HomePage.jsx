import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  useEffect(() => {
    const content = document.querySelector('.content.shell-content');
    const child = content?.firstElementChild;
    if (!content || !child) return;

    if (content.dataset.scrollProbeInjected === 'true') return;
    content.dataset.scrollProbeInjected = 'true';

    // Add enough content to ensure overflow.
    for (let i = 0; i < 20; i += 1) {
      const p = document.createElement('p');
      p.textContent = `Extra content to force scrolling... Item ${i + 1}`;
      p.style.padding = '20px';
      p.style.border = '1px solid #ccc';
      p.style.margin = '10px 0';
      child.appendChild(p);
    }

    content.dataset.overflowing = String(content.scrollHeight > content.clientHeight);
  }, []);

  return (
    <div className="home-page-scroll" style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)'
    }}>
      {/* Navigation */}
      <nav style={{
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/favicon.png" alt="DevDock Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
          <div className="logo-text">Test<span>Forge</span></div>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link to="/login" className="btn btn-ghost">Login</Link>
          <Link to="/register" className="btn btn-primary">Get Started</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: '100px 40px',
        textAlign: 'center',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h1 style={{
          fontSize: '56px',
          fontWeight: '700',
          marginBottom: '24px',
          background: 'linear-gradient(135deg, var(--accent), var(--green))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          AI-Powered Automated Testing
        </h1>
        <p style={{
          fontSize: '20px',
          color: 'var(--text2)',
          marginBottom: '40px',
          maxWidth: '700px',
          margin: '0 auto 40px'
        }}>
          Transform your QA workflow with intelligent test generation, 
          automated execution, and comprehensive defect tracking.
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <Link to="/register" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '16px' }}>
            Start Testing Free
          </Link>
          <a href="#features" className="btn btn-ghost" style={{ padding: '14px 32px', fontSize: '16px' }}>
            Learn More
          </a>
        </div>

        {/* Stats */}
        <div className="grid-4" style={{
          marginTop: '80px',
          padding: '40px',
          background: 'var(--bg2)',
          borderRadius: '12px',
          border: '1px solid var(--border)'
        }}>
          <div>
            <div className="stat-value text-accent">8+</div>
            <div className="stat-label">AI Models</div>
          </div>
          <div>
            <div className="stat-value text-green">99.9%</div>
            <div className="stat-label">Uptime</div>
          </div>
          <div>
            <div className="stat-value text-yellow">24/7</div>
            <div className="stat-label">Monitoring</div>
          </div>
          <div>
            <div className="stat-value text-purple">1000+</div>
            <div className="stat-label">Tests/Day</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{
        padding: '80px 40px',
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '36px',
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: '16px'
          }}>
            Powerful Features for Modern Teams
          </h2>
          <p style={{
            fontSize: '16px',
            color: 'var(--text2)',
            textAlign: 'center',
            marginBottom: '60px'
          }}>
            Everything you need to automate your testing workflow
          </p>

          <div className="grid-3">
            <div className="card" style={{ padding: '24px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'rgba(0, 212, 255, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <svg style={{ width: '24px', height: '24px', color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>AI Test Generation</h3>
              <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
                Automatically generate comprehensive test plans and cases using 8+ advanced AI models with intelligent rotation.
              </p>
            </div>

            <div className="card" style={{ padding: '24px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'rgba(0, 229, 160, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <svg style={{ width: '24px', height: '24px', color: 'var(--green)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Defect Tracking</h3>
              <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
                AI-powered defect detection and automated assignment to team members with email notifications.
              </p>
            </div>

            <div className="card" style={{ padding: '24px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'rgba(155, 127, 232, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <svg style={{ width: '24px', height: '24px', color: 'var(--purple)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Team Collaboration</h3>
              <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
                Real-time chat, audit trails, and shared account access for seamless team collaboration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        padding: '80px 40px',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '36px',
          fontWeight: '700',
          marginBottom: '16px'
        }}>
          Ready to Transform Your Testing?
        </h2>
        <p style={{
          fontSize: '18px',
          color: 'var(--text2)',
          marginBottom: '32px'
        }}>
          Join teams using DevDock for automated testing excellence
        </p>
        <Link to="/register" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '16px' }}>
          Get Started Now
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '40px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text3)',
        fontSize: '13px'
      }}>
        <p>&copy; 2024 DevDock. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default HomePage;
