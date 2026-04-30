const Logger = require('./logger');
const MongoDBAdapter = require('../adapters/mongodb');
const MySQLAdapter = require('../adapters/mysql');

class DatabaseManager {
  constructor() {
    this.adapters = {};
    this.primaryDB = null;
  }

  async initialize(databases, models) {
    Logger.info('Initializing databases...');

    for (const dbConfig of databases) {
      if (dbConfig.type === 'mongodb') {
        this.adapters.mongodb = new MongoDBAdapter();
        await this.adapters.mongodb.connect(dbConfig.connection, models);
        this.primaryDB = this.adapters.mongodb;
        Logger.success('✓ MongoDB connected');
      } else if (dbConfig.type === 'mysql') {
        this.adapters.mysql = new MySQLAdapter();
        await this.adapters.mysql.connect(dbConfig.connection, models);
        if (!this.primaryDB) this.primaryDB = this.adapters.mysql;
        Logger.success('✓ MySQL connected');
      }
    }
  }

  async query(model, operation, data = null, options = {}) {
    if (!this.primaryDB) {
      throw new Error('No database configured');
    }

    return this.primaryDB.query(model, operation, data, options);
  }

  getAdapter(type) {
    return this.adapters[type] || this.primaryDB;
  }
}

module.exports = DatabaseManager;
