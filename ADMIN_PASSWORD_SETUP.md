# Password Reset Emails

User Management sends password reset links through Firebase Authentication. Users choose their own new password from the email; the app does not set or store it.

## Firebase Setup

- In Firebase Console, enable the Email/Password sign-in provider under Authentication.
- Add the deployed Vercel domain under Authentication settings > Authorized domains.
- Review or customize the password reset email under Authentication > Templates.

No Firebase Admin service account or password-reset API environment variables are required in Vercel.