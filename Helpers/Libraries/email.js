const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const { htmlToText } = require("html-to-text");
const pug = require("pug");

// new Email(user, Url)
module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.firstname;
    this.from = ` ${process.env.SITE_NAME} <${process.env.EMAIL_ACCOUNT}>`;
    this.url = url;
  }

  newTransport() {
    // if (process.env.NODE_ENV === "development") {
    //   return nodemailer.createTransport({
    //     host: "sandbox.smtp.mailtrap.io",
    //     port: 465,
    //     secure: false,
    //     auth: {
    //       user: process.env.EMAIL_USERNAME_DEV,
    //       pass: process.env.EMAIL_PASS_DEV,
    //     },
    //   });
    // }
    // if (process.env.NODE_ENV === "production") {
      return nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_ACCOUNT,
          pass: process.env.EMAIL_PASS,
        },
      });
    // }
  }
  async send(template, subject, preheader = "") {
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
  
    // Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html: html,
      text: htmlToText(html),
    };
  
    // Create transport and send email
    await this.newTransport().sendMail(mailOptions);
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
    try {
      await this.send(
        "unUsualSignIn",
        `${process.env.SITE_NAME}, Unusual sign-in detected`,
        "We noticed a sign-in from an unrecognized device or location."
      );
    } catch (error) {
      console.log(error);
    }
  }
  
  async sendverificationtoken() {
    await this.send(
      "verify",
      `Verify Your ${process.env.SITE_NAME} Account`,
      "Complete your account setup by verifying your email address."
    );
  }
};
