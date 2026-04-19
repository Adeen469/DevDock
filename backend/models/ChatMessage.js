const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  room: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'general'
  },
  userId: {
    type: DataTypes.STRING(36),
    allowNull: true
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userAvatar: {
    type: DataTypes.STRING,
    allowNull: true
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  code: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  tableName: 'ChatMessages'
});

module.exports = ChatMessage;
