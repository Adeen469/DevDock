const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const passport = require('passport');

// Register and Login
router.post('/register', authController.register);
router.post('/login', authController.login);

// OAuth routes
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback', authController.googleCallback);

router.get('/github', 
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get('/github/callback', authController.githubCallback);

// Get current user (protected)
router.get('/me', authMiddleware, authController.getCurrentUser);

module.exports = router;
