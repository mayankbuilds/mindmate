const express = require("express");
const router = express.Router();
const { postChatMessage } = require("../controllers/chatController");
const { optionalAuth } = require("../middleware/authMiddleware");

// Both /api/chat and /api/chat/message point to postChatMessage with optional authentication
router.post("/", optionalAuth, postChatMessage);
router.post("/message", optionalAuth, postChatMessage);

module.exports = router;