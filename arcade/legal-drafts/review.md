# Legal page publication checklist

These drafts are source-based preparation for the Discord application verification requirement. They are not public site pages yet.

Before publishing `/terms` and `/privacy` on the Arcade domain:

1. Replace `[LEGAL OPERATOR NAME]` with the person or entity legally operating the app, and `[SUPPORT EMAIL]` with a monitored address for account, content, and privacy requests.
2. Confirm the actual operator's jurisdiction and have the operator review the Terms of Service, including any required local-law terms.
3. Confirm the desired data-retention and deletion process. The current Google Sheets implementation has no automatic retention limit; do not promise one unless implemented.
4. Confirm the Creator bot's program practices against the draft. The current Vercel deployment source shows leaderboard, creator status, content submission and review commands, creator budgets and performance data, and optional YouTube metric refresh. Verify whether other private integrations or data processing are active before publication.
5. Confirm how community puzzle images and Starplayer uploads are approved and removed, and whether separate reward/event rules apply.
6. Remove the DRAFT notices, add public pages and footer links, deploy, verify both URLs work without Arcade sign-in, then enter them under Discord Developer Portal → General Information.
7. The team owner must retry Discord's identity verification in the Portal. The current Portal shows `Identity Verification Needs Action` and a `Verify Me` button. Only the owner should submit identity data and accept Discord's developer agreements.
