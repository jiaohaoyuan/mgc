// 这个文件是什么作用显示的是什么：这是MySQL数据库配置文件。显示/实现的是：配置并建立与MySQL数据库的连接池，提供执行SQL查询的方法。
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
