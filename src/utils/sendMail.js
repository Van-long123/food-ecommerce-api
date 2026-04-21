import nodemailer from 'nodemailer'
import { env } from '~/config/environment'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASSWORD
  }
})

export const sendMail = async (to, subject, html) => {
  return transporter.sendMail({
    from: `"SmartFood" <${env.EMAIL_USER}>`,
    to,
    subject,
    html
  })
}
