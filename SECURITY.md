# ThirdWatch security policy

## Reporting a vulnerability

Do not open a public issue containing credentials, financial records, exploit details, or personal data. Until the repository owner publishes a dedicated private reporting address, contact the owner through an established private channel and request a secure disclosure path.

## Supported versions

No public support or security-update policy has been established. Before a public release, the owner must document supported versions, response targets, and a private reporting contact.

## Deployment boundary

ThirdWatch is localhost-only by default. It does not include user authentication, authorization, or TLS termination. Do not expose it directly to the public internet. External deployments require a hardened HTTPS reverse proxy, authenticated access, network restrictions, and an environment-specific security review.

Never commit `.env`, API keys, passwords, tokens, private keys, or real financial datasets. Rotate any credential that may have been exposed.
