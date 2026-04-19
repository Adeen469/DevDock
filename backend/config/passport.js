const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || `${profile.id}@google.oauth.local`;
      const displayName = profile.displayName || email.split('@')[0] || 'Google User';

      let user = await User.findOne({ where: { providerId: profile.id, provider: 'google' } });
      if (!user) {
        // Reuse an existing account with the same email to avoid unique email conflicts.
        user = await User.findOne({ where: { email } });
      }
      
      if (!user) {
        user = await User.create({
          name: displayName,
          email,
          avatar: profile.photos[0]?.value,
          provider: 'google',
          providerId: profile.id,
          role: 'viewer'
        });
      } else {
        const updates = {};
        if (!user.providerId && user.provider !== 'google') {
          updates.providerId = profile.id;
        }
        if (!user.avatar && profile.photos?.[0]?.value) {
          updates.avatar = profile.photos[0].value;
        }
        if (!user.name && displayName) {
          updates.name = displayName;
        }
        if (Object.keys(updates).length > 0) {
          await user.update(updates);
        }
      }
      
      return done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, null);
    }
  }
));

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || `${profile.username || profile.id}@github.oauth.local`;
      const displayName = profile.username || profile.displayName || email.split('@')[0] || 'GitHub User';

      let user = await User.findOne({ where: { providerId: profile.id, provider: 'github' } });
      if (!user) {
        user = await User.findOne({ where: { email } });
      }
      
      if (!user) {
        user = await User.create({
          name: displayName,
          email,
          avatar: profile.photos[0]?.value,
          provider: 'github',
          providerId: profile.id,
          role: 'viewer'
        });
      } else {
        const updates = {};
        if (!user.providerId && user.provider !== 'github') {
          updates.providerId = profile.id;
        }
        if (!user.avatar && profile.photos?.[0]?.value) {
          updates.avatar = profile.photos[0].value;
        }
        if (!user.name && displayName) {
          updates.name = displayName;
        }
        if (Object.keys(updates).length > 0) {
          await user.update(updates);
        }
      }
      
      return done(null, user);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      return done(error, null);
    }
  }
));

module.exports = passport;
