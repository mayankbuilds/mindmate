const dotenv = require("dotenv");
dotenv.config();

const app = require("./src/app");
const connectDB = require("./src/config/db");

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[MindMate Gateway] Server running on port ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.error("[Server Unhandled Rejection]", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("[Server Uncaught Exception]", err?.message || err);
});
