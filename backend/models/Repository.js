const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Repository = sequelize.define('Repository', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private'),
    allowNull: false,
    defaultValue: 'private'
  },
  languages: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  lastPushed: {
    type: DataTypes.DATE,
    allowNull: true
  },
  stars: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  githubUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ownerId: {
    type: DataTypes.STRING(36),
    allowNull: true
  },
  collaborators: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  }
}, {
  timestamps: true
});

module.exports = Repository;
