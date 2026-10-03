const express = require("express");
const router = express.Router();
const { postChatMessage } = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");

router.post("/message", protect, postChatMessage);

module.exports = router;