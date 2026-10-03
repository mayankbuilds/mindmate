const axios = require("axios");

const FASTAPI_URL = process.env.FASTAPI_SERVICE_URL || "http://localhost:8000";

const computeStressWithAI = async (data) => {
  const response = await axios.post(`${FASTAPI_URL}/wellness/compute-stress`, data);
  return response.data;
};

const sendChatMessageToAI = async (messages, context) => {
  const response = await axios.post(`${FASTAPI_URL}/chat/message`, {
    messages,
    context,
  });
  return response.data;
};

module.exports = { computeStressWithAI, sendChatMessageToAI };