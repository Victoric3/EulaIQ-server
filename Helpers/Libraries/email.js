const nodemailer = require('nodemailer')
// const dotenv = require("dotenv")
// dotenv.config({ path: '../../config/config.env' })
// const user = process.env.EMAIL_USERNAME
// const password =process.env.EMAIL_PASSWORD
const { htmlToText } = require('html-to-text');
const pug = require('pug')
// console.log(user, password);
// new Email(user, Url)
module.exports = class Email{
    constructor(user, url){
        this.to = user.email;
        this.firstName = user.firstName;
        // this.from = ` ${process.env.NAME} <${process.env.EMAIL_ACCOUNT}>`
        this.from = `AutoBlog <chukwujiobi@victor.io>`
        this.url = url;
    }
    newTransport(){
        if(process.env.NODE_ENV==='production'){
            return 1;
        }
        
        return nodemailer.createTransport({
            host: 'sandbox.smtp.mailtrap.io',
            port: 465,
            secure: false,
            auth: {
                user: 'e70b8baf7cb678',
                pass: '1f8adac4b2b33a'
            },
        })
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
        await this.send('welcome', 'welcome to Alphamagnet')
    }
    async sendPasswordReset(){
        await this.send('passwordReset', 'Alphamagnet, Password reset email')
    }
    async sendConfirmEmail(){
        await this.send('confirmEmail', 'Alphamagnet, confirm your email')
    }
}
