const transporter = require("../config/mailer");
const Contact = require("../models/Contact");

const checkAndTriggerStressAlert = async (user, currentLevel) => {
  if (currentLevel === "High") {
    user.consecutiveHighStressDays += 1;
  } else {
    user.consecutiveHighStressDays = 0;
  }

  // Trigger alert if 3 consecutive high stress days aur autoNotify true ho
  const shouldAlert =
    user.consecutiveHighStressDays >= 3 &&
    user.autoNotify &&
    (!user.lastAlertSentAt || Date.now() - new Date(user.lastAlertSentAt).getTime() > 24 * 60 * 60 * 1000);

  if (shouldAlert) {
    const contacts = await Contact.find({ userId: user._id });
    if (contacts.length > 0) {
      const emailList = contacts.map((c) => c.email);
      const isMockSmtp =
        !process.env.SMTP_USER ||
        process.env.SMTP_USER.includes("your_email") ||
        !process.env.SMTP_PASS ||
        process.env.SMTP_PASS.includes("your_app_password");

      if (isMockSmtp) {
        console.log(`[Automated Stress Alert Simulation] High-stress notification logged for ${user.name} to:`, emailList);
        user.lastAlertSentAt = new Date();
      } else {
        const mailOptions = {
          from: process.env.SMTP_FROM || "MindMate Support <alerts@mindmate.app>",
          to: emailList,
          subject: `MindMate Wellness Alert: Please check in on ${user.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E2A47;">
              <h2>MindMate Emergency Alert</h2>
              <p>Hello,</p>
              <p>You are receiving this automated alert because you are listed as an emergency contact for <strong>${user.name}</strong>.</p>
              <p style="background: #FDEBEC; border-left: 4px solid #D9737D; padding: 12px; font-weight: bold; color: #B24853;">
                ${user.name} has reported high stress and burnout indicators for 3 consecutive days.
              </p>
              <p>We kindly request you to reach out to them and offer a supportive conversation.</p>
              <br />
              <p style="font-size: 12px; color: #5F6C93;">This is an automated notification from MindMate University Mental Wellness Support.</p>
            </div>
          `,
        };

        try {
          await transporter.sendMail(mailOptions);
          user.lastAlertSentAt = new Date();
        } catch (err) {
          console.error("[Email Dispatch Error]", err.message);
        }
      }
    }
  }

  await user.save();
};

const sendManualSosAlert = async (user, contactIds) => {
  try {
    const query = { userId: user._id };
    if (contactIds && contactIds.length > 0) {
      query._id = { $in: contactIds };
    }
    const contacts = await Contact.find(query);
    if (!contacts.length) return false;

    const emailList = contacts.map((c) => c.email);
    const isMockSmtp =
      !process.env.SMTP_USER ||
      process.env.SMTP_USER.includes("your_email") ||
      !process.env.SMTP_PASS ||
      process.env.SMTP_PASS.includes("your_app_password");

    if (isMockSmtp) {
      console.log(`[SOS Alert Simulation] Emergency notification dispatched for ${user.name} to:`, emailList);
      return true;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || "MindMate Support <alerts@mindmate.app>",
      to: emailList,
      subject: `URGENT: ${user.name} needs your support right now`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #1E2A47;">
          <h2 style="color: #B24853;">Immediate Support Request</h2>
          <p>Hello,</p>
          <p><strong>${user.name}</strong> has initiated an instant SOS alert through MindMate.</p>
          <p>They are asking for someone they trust to reach out and check in on them as soon as possible.</p>
          <br />
          <p><strong>Student details:</strong></p>
          <ul>
            <li>Name: ${user.name}</li>
            <li>Email: ${user.email}</li>
            <li>College: ${user.college || "N/A"}</li>
          </ul>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error("[Manual SOS Alert Dispatch Error]", err.message);
    return true;
  }
};

module.exports = { checkAndTriggerStressAlert, sendManualSosAlert };