const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL connection established successfully.');

    const shouldSync = process.env.DB_SYNC !== 'false';
    const shouldAlter = process.env.DB_SYNC_ALTER === 'true';

    if (shouldSync) {
      // `alter: true` is convenient but slow at startup. Keep it opt-in.
      await sequelize.sync(shouldAlter ? { alter: true } : undefined);
      console.log(`✅ Database models synchronized${shouldAlter ? ' (alter mode)' : ''}.`);
    } else {
      console.log('ℹ️ Database model sync skipped (DB_SYNC=false).');
    }

    await reconcileLegacyUserTable();
    
    return sequelize;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
};

async function reconcileLegacyUserTable() {
  const queryInterface = sequelize.getQueryInterface();

  let columns;
  try {
    columns = await queryInterface.describeTable('Users');
  } catch {
    return;
  }

  const addIfMissing = async (columnName, definition) => {
    if (!columns[columnName]) {
      await queryInterface.addColumn('Users', columnName, definition);
      columns[columnName] = definition;
    }
  };

  await addIfMissing('password', { type: DataTypes.STRING, allowNull: true });
  await addIfMissing('avatar', { type: DataTypes.STRING, allowNull: true });
  await addIfMissing('role', { type: DataTypes.ENUM('admin', 'qa_lead', 'developer', 'viewer'), allowNull: true, defaultValue: 'viewer' });
  await addIfMissing('status', { type: DataTypes.ENUM('active', 'inactive'), allowNull: true, defaultValue: 'active' });
  await addIfMissing('provider', { type: DataTypes.ENUM('local', 'google', 'github'), allowNull: true, defaultValue: 'local' });
  await addIfMissing('providerId', { type: DataTypes.STRING, allowNull: true });
  await addIfMissing('sessionsCount', { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 });
  await addIfMissing('joinedAt', { type: DataTypes.DATE, allowNull: true });
  await addIfMissing('createdAt', { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
  await addIfMissing('updatedAt', { type: DataTypes.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });

  // Legacy schemas may still enforce password_hash as NOT NULL.
  // OAuth users do not have a local password, so this must be optional.
  if (columns.password_hash) {
    await queryInterface.changeColumn('Users', 'password_hash', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });

    await sequelize.query('UPDATE Users SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL');
  }

  await sequelize.query('UPDATE Users SET createdAt = NOW() WHERE createdAt IS NULL');
  await sequelize.query('UPDATE Users SET updatedAt = NOW() WHERE updatedAt IS NULL');
}

module.exports = { sequelize, connectDB };
