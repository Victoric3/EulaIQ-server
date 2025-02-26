const { SendMailClient } = require("zeptomail");
const dotenv = require("dotenv");
const pug = require("pug");
dotenv.config({ path: "./config.env" });

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.firstname;
    this.url = url;
    
    // Initialize Zepto client
    this.client = new SendMailClient({
      url: "api.zeptomail.com/",
      token: process.env.ZEPTO_API_TOKEN
    });
  }

  async send(template, subject, preheader = "") {
    try {
      // Render Pug template
      const html = pug.renderFile(
        `${__dirname}/../../views/email/${template}.pug`,
        {
          firstName: this.firstName || "user",
          url: this.url,
          subject,
          preheaderText: preheader,
        }
      );

      // Configure email data for Zepto API
      const mailData = {
        "from": {
          "address": process.env.EMAIL_ACCOUNT,
          "name": process.env.SITE_NAME
        },
        "to": [
          {
            "email_address": {
              "address": this.to,
              "name": this.firstName || "user"
            }
          }
        ],
        "subject": subject,
        "htmlbody": html
      };

      // Send email using Zepto API
      await this.client.sendMail(mailData);
    } catch (error) {
      console.error("Email sending error:", error);
      throw error;
    }
  }

  async sendWelcome() {
    await this.send(
      "welcome",
      `Welcome to ${process.env.SITE_NAME}`,
      "Get started with your new journey at our platform!"
    );
  }

  async sendPasswordReset() {
    await this.send(
      "passwordReset",
      `${process.env.SITE_NAME}, Password reset email`,
      "You requested a password reset. Follow the link to set a new password."
    );
  }

  async sendConfirmEmail() {
    await this.send(
      "confirmEmail",
      `${process.env.SITE_NAME}, Confirm your email`,
      "Please confirm your email to activate your account."
    );
  }

  async sendUnUsualSignIn() {
    await this.send(
      "unUsualSignIn",
      `${process.env.SITE_NAME}, Unusual sign-in detected`,
      "We noticed a sign-in from an unrecognized device or location."
    );
  }

  async sendverificationtoken() {
    await this.send(
      "verify",
      `Verify Your ${process.env.SITE_NAME} Account`,
      "Complete your account setup by verifying your email address."
    );
  }
};
