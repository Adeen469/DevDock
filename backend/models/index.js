const { sequelize, connectDB } = require('../config/database');
const User = require('./User');
const Repository = require('./Repository');
const AuditLog = require('./AuditLog');
const ChatMessage = require('./ChatMessage');

// Define associations
User.hasMany(Repository, { foreignKey: 'ownerId', as: 'repositories', constraints: false });
Repository.belongsTo(User, { foreignKey: 'ownerId', as: 'owner', constraints: false });

User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs', constraints: false });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });

User.hasMany(ChatMessage, { foreignKey: 'userId', as: 'messages', constraints: false });
ChatMessage.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });

module.exports = {
  sequelize,
  connectDB,
  User,
  Repository,
  AuditLog,
  ChatMessage
};
