const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const { Op } = require('sequelize');
const User = require('../models/User');

// Search users by name/email (protected)
router.get('/search', authMiddleware, authorize(), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, data: [] });
    }

    const users = await User.findAll({
      where: {
        [Op.and]: [
          { id: { [Op.ne]: req.user.id } },
          {
            [Op.or]: [
              { name: { [Op.like]: `%${q}%` } },
              { email: { [Op.like]: `%${q}%` } }
            ]
          }
        ]
      },
      attributes: ['id', 'name', 'email', 'status'],
      order: [['name', 'ASC']],
      limit: 15
    });

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all users (protected - authenticated users)
router.get('/', authMiddleware, authorize(), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user (protected)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    // Users can only update themselves
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, status } = req.body;
    await user.update({ name, status });
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete user (protected - authenticated users)
router.delete('/:id', authMiddleware, authorize(), async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await user.destroy();
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
