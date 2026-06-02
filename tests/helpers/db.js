const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let mongod;

async function connectTestDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function clearDb() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function closeTestDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { connectTestDb, clearDb, closeTestDb };
