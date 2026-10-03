const Contact = require("../models/Contact");
const { sendManualSosAlert } = require("../services/alertService");

const getContacts = async (req, res) => {
  const contacts = await Contact.find({ userId: req.user._id });
  res.json(contacts);
};

const addContact = async (req, res) => {
  const { name, rel, email, phone } = req.body;
  const contact = await Contact.create({
    userId: req.user._id,
    name,
    rel,
    email,
    phone,
  });
  res.status(201).json(contact);
};

const deleteContact = async (req, res) => {
  const contact = await Contact.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!contact) return res.status(404).json({ message: "Contact not found" });
  res.json({ message: "Contact removed" });
};

const triggerSos = async (req, res) => {
  const { contactIds } = req.body;
  const success = await sendManualSosAlert(req.user, contactIds);
  if (success) {
    res.json({ message: "SOS Alert dispatched successfully" });
  } else {
    res.status(400).json({ message: "No contacts available to send alert" });
  }
};

module.exports = { getContacts, addContact, deleteContact, triggerSos };