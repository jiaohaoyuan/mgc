// 这个文件是什么作用显示的是什么：这是Redis缓存配置文件。显示/实现的是：配置并建立与Redis数据库的连接，用于存储缓存和会话数据。
const { createClient } = require('redis');
require('dotenv').config();

const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', (err) => console.error('Redis Client Error', err));
client.on('ready', () => console.log('Redis connected successfully'));

client.connect();

module.exports = client;
