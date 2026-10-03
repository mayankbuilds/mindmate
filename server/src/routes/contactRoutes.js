const express = require("express");
const router = express.Router();
const { getContacts, addContact, deleteContact, triggerSos } = require("../controllers/contactController");
const { protect } = require("../middleware/authMiddleware");

router.route("/").get(protect, getContacts).post(protect, addContact);
router.delete("/:id", protect, deleteContact);
router.post("/alert", protect, triggerSos);

module.exports = router;