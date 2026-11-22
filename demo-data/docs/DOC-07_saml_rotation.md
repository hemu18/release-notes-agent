# Rotating your SAML certificate

Doc ID: DOC-07 · Source: Confluence · Last updated: 2026-11-19 · Audience: all customers

## Action required
Customers using SAML single sign-on must upload the new certificate **before 15 January 2027**. After that date, logins through SAML will fail until the new certificate is in place.

## Who must act
Your IT or identity team. They will need admin access to your identity provider (for example Okta or Azure AD).

## Steps
1. In the app, go to Admin > Security > SSO and download the new certificate.
2. In your identity provider, add the new certificate to the app's SAML settings.
3. Back in the app, click **Test login**.
4. When the test passes, click **Activate new certificate**.

## If something goes wrong
Admins can still sign in with a password-and-code login to fix the settings. Contact support if the test keeps failing.
