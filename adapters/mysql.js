const mysql = require('mysql2/promise');
const Logger = require('../core/logger');

class MySQLAdapter {
  constructor() {
    this.pool = null;
    this.connection = null;
  }

  async connect(connectionString, models) {
    try {
      const config = this.parseConnectionString(connectionString);
      
      this.pool = await mysql.createPool(config);
      this.connection = await this.pool.getConnection();

      await this.createTables(models);
      Logger.debug('MySQL tables created/verified');
    } catch (error) {
      throw new Error(`MySQL connection failed: ${error.message}`);
    }
  }

  parseConnectionString(connStr) {
    const regex = /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(\w+)/;
    const match = connStr.match(regex);

    if (!match) {
      return {
        host: 'localhost',
        user: 'root',
        password: 'root',
        database: 'easy_db',
        port: 3306
      };
    }

    return {
      host: match[3],
      user: match[1],
      password: match[2],
      port: parseInt(match[4]),
      database: match[5]
    };
  }

  async createTables(models) {
    for (const model of models) {
      const columns = this.generateColumns(model.schema);
      const query = `
        CREATE TABLE IF NOT EXISTS ${model.name} (
          id INT PRIMARY KEY AUTO_INCREMENT,
          ${columns.join(',')},
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `;

      try {
        await this.connection.execute(query);
      } catch (error) {
        Logger.debug(`Table ${model.name} check: ${error.message}`);
      }
    }
  }

  generateColumns(schema) {
    const columns = [];

    for (const [key, typeObj] of Object.entries(schema)) {
      const type = typeObj.type || String;
      const sqlType = this.mapToSQLType(type);
      columns.push(`${key} ${sqlType}`);
    }

    return columns;
  }

  mapToSQLType(type) {
    const typeMap = {
      'string': 'VARCHAR(255)',
      'number': 'INT',
      'boolean': 'BOOLEAN',
      'date': 'DATETIME',
      'object': 'JSON',
      'array': 'JSON'
    };

    const typeName = type.name ? type.name.toLowerCase() : 'string';
    return typeMap[typeName] || 'VARCHAR(255)';
  }

  async query(modelName, operation, data = null, options = {}) {
    const conn = await this.pool.getConnection();

    try {
      switch (operation.toLowerCase()) {
        case 'findall':
          const [rows] = await conn.execute(`SELECT * FROM ${modelName}`);
          return rows;

        case 'findbyid':
          const [row] = await conn.execute(
            `SELECT * FROM ${modelName} WHERE id = ?`,
            [data]
          );
          return row[0] || null;

        case 'findone':
          const [oneRow] = await conn.execute(
            `SELECT * FROM ${modelName} LIMIT 1`
          );
          return oneRow[0] || null;

        case 'create':
          const fields = Object.keys(data).join(',');
          const values = Object.values(data);
          const placeholders = Object.keys(data).map(() => '?').join(',');
          
          const [result] = await conn.execute(
            `INSERT INTO ${modelName} (${fields}) VALUES (${placeholders})`,
            values
          );
          return { id: result.insertId, ...data };

        case 'updatebyid':
          const updateFields = Object.keys(data.updates)
            .map(key => `${key} = ?`)
            .join(',');
          const updateValues = [
            ...Object.values(data.updates),
            data.id
          ];
          
          await conn.execute(
            `UPDATE ${modelName} SET ${updateFields} WHERE id = ?`,
            updateValues
          );
          return { id: data.id, ...data.updates };

        case 'deletebyid':
          await conn.execute(
            `DELETE FROM ${modelName} WHERE id = ?`,
            [data]
          );
          return { success: true };

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } finally {
      conn.release();
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = MySQLAdapter;
