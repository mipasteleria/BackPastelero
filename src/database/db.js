const mongoose = require("mongoose");
const URI = `mongodb+srv://${process.env.USER_DB}:${process.env.PASSWORD_DB}@cluster0.fj4rg22.mongodb.net/pasteleros`;

const connect = new Promise(async (resolve, reject) => {
  let conn = await mongoose.connect(URI);
  if (conn) resolve("Success connection to DB");
  reject("Error connecting to DB");
});

module.exports = {
  connect,
};
