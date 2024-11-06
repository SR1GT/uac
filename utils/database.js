const mysql = require("mysql2/promise");
require("dotenv").config();

/**
  * 创建数据库连接
  * @returns {Promise<mysql.Connection>}
  */
const createConnection = async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DATABASE_HOST,
      user: process.env.DATABASE_USER,
      port: process.env.DATABASE_PORT,
      database: process.env.DATABASE_DB,
      password: process.env.DATABASE_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    return connection;
  } catch (err) {
    throw new Error(`数据库连接时错误：${err}`);
  }
};

module.exports = createConnection;
