import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[resend] RESEND_API_KEY is not set — email sending will fail at runtime')
}

export const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder_missing_key')
