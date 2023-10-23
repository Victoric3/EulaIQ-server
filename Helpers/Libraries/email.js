const nodemailer = require('nodemailer')
const dotenv = require("dotenv")
dotenv.config({ path: './config.env' });
const { htmlToText } = require('html-to-text');
const pug = require('pug')
const { google } = require('googleapis');



// new Email(user, Url)
module.exports = class Email{
    constructor(user, url){
        this.to = user.email;
        this.firstName = user.username;
        this.from = ` ${process.env.SITE_NAME} <${process.env.EMAIL_ACCOUNT}>`
        this.url = url;
    }
    newTransport(){
        if(process.env.NODE_ENV==='development'){
            return nodemailer.createTransport({
                host: 'sandbox.smtp.mailtrap.io',
                port: 465,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USERNAME_DEV,
                    pass: process.env.EMAIL_PASS_DEV
                },
            })
        }
        if(process.env.NODE_ENV==='production'){
        return nodemailer.createTransport({
          service: 'gmail',
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth:{
              user: process.env.EMAIL_ACCOUNT,
              pass: process.env.EMAIL_PASS,
            }
        
        });}
    }
    async send(template, subject){
        // render pug template
        const html = pug.renderFile(`${__dirname}/../../views/email/${template}.pug`, {
            firstName: this.firstName || "user",
            url: this.url,
            subject,
        })

        //define email options
        const mailOptions = {
            from: this.from,
            to: this.to,
            subject,
            html,
            text: htmlToText(html)

        }
        //create transport and send email
        await this.newTransport().sendMail(mailOptions)

    }
    async sendWelcome(){
        await this.send('welcome', `welcome to ${process.env.SITE_NAME}`)
    }
    async sendPasswordReset(){
        await this.send('passwordReset', `${process.env.SITE_NAME}, Password reset email`)
    }
    async sendConfirmEmail(){
        await this.send('confirmEmail', `${process.env.SITE_NAME}, confirm your email`)
    }
}
