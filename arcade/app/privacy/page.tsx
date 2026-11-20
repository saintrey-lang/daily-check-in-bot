import type { Metadata } from "next";
import LegalShell from "../legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | GOLDEN CREATOR",
  description: "How the GOLDEN CREATOR Discord application and Golden Spatula Arcade handle information.",
};

export default function PrivacyPage() {
  return <LegalShell title="Privacy Policy">
    <p><strong>Saint Rey</strong> operates the GOLDEN CREATOR Discord application, the Golden Spatula Arcade Activity, the check-in worker, and the Creator bot. For privacy questions, email <a href="mailto:saintrey@whim.sg">saintrey@whim.sg</a>.</p>

    <section><h2>Data we handle</h2>
      <ul>
        <li><strong>Arcade entry:</strong> In the Discord Activity, we request your Discord basic profile with the <code>identify</code> permission. We store your Discord user ID, username, linked Golden Spatula Game ID, and link and last-seen times. We use a temporary signed cookie while you link your Game ID. Older Arcade entries require their previous PIN once to link; website entries still use a name, Game ID, and a salted hash of a four-digit PIN, along with account creation, sign-in, failed attempt, and lockout times. A signed play cookie contains your Game ID and name (and Discord ID for linked entries) and expires after 24 hours. We do not ask for your Discord password.</li>
        <li><strong>Arcade play:</strong> Your game and picture choice, crossword letters or puzzle moves, current points, saved session and revision, update and completion times, and final score, elapsed time, and move count. We briefly use an IP address in server memory to limit sign-in attempts; the hosting provider may also create normal request logs.</li>
        <li><strong>Discord check-ins:</strong> Discord user ID, username, display name, check-in code and date, streak and milestone, and relevant message and channel IDs. The bot reads messages in the configured check-in channel to recognize the daily code.</li>
        <li><strong>Starplayer submissions:</strong> Discord user ID, username and display name, task category, title and date, a link or uploaded file, submission time, and the submission message and channel references.</li>
        <li><strong>Creator program:</strong> Discord ID, creator name, campaign, rank, points, content counts, views, engagements, budget and approved-spend figures, and status. Creator content submissions include username, platform, content URL, notes, submission and review times, reviewer and review status, payout figure, and message references. The bot can show a creator&apos;s own status and submissions privately, publish leaderboards, send review result DMs, and refresh YouTube video metrics where enabled.</li>
        <li><strong>Server activity statistics:</strong> Discord user ID and display name, channel ID and name, daily message counts, voice participation time, and related role or roster information where configured. The statistics feature does not save general message text in its statistics table.</li>
        <li><strong>Puzzle pictures:</strong> Image attachments posted in the configured Discord puzzle channel are shown as choices in the Activity and displayed with puzzle score posts.</li>
      </ul>
    </section>

    <section><h2>How we use and share it</h2>
      <p>We use these records to authenticate Arcade entries, save and resume games, calculate points and scores, post results, run check-ins and Starplayer submissions, manage creator program submissions and reviews, prevent duplicate or abusive activity, and make server reports available to authorized operators.</p>
      <p>The bot posts Arcade results to the configured Discord channels. A completed result shows the Discord username for Activity players (or the entered name for website players), score, time, and for puzzles the selected image. A partial exit post also shows the Game ID and current points. Check-in, Starplayer, creator review, and leaderboard posts are visible to people with access to their Discord channels. Private command replies and DMs go to the relevant user. Discord channel permissions control who can see channel posts.</p>
    </section>

    <section><h2>Storage and service providers</h2>
      <p>Arcade player records, saved progress, check-ins, creator records and submissions, and statistics are stored in Google Sheets accessible to authorized operators and service accounts. The Arcade and Creator bot run on Vercel. The application uses Discord to read channel content, display Activity content, and send messages. A persistent worker host runs check-in and statistics features. Where YouTube metric refresh is enabled, the Creator bot sends video IDs to the YouTube Data API to obtain public video statistics. These providers process data to deliver the service under their own terms and privacy notices. We do not transmit your Arcade PIN to Discord score posts.</p>
    </section>

    <section><h2>Retention and your choices</h2>
      <p>The current implementation does not automatically delete Google Sheet records after a fixed period. Records remain until we remove them or establish a retention schedule. Discord posts and files may remain in their channels separately from Sheet records. The Arcade play cookie expires after 24 hours, the temporary Discord link cookie after 10 minutes, and short-lived sign-in rate-limit entries are held in server memory. Discord OAuth access tokens are used for sign-in and are not saved to the Sheet.</p>
      <p>Email <a href="mailto:saintrey@whim.sg">saintrey@whim.sg</a> to request access, correction, or deletion of records we control. We may need to verify that a request relates to your Game ID or Discord account before acting. Discord channel posts may need to be removed separately.</p>
    </section>

    <section><h2>Security and updates</h2>
      <p>The Arcade stores a salted hash of your PIN rather than the PIN text and signs its session cookies. Access to Google Sheets and service credentials is limited to authorized operators and services. No service can guarantee absolute security. We may update this policy as the application changes and will show the new effective date here.</p>
    </section>

    <section><h2>Contact</h2>
      <p>Contact <a href="mailto:saintrey@whim.sg">saintrey@whim.sg</a> about privacy or your data. If you use the app through Discord, Discord&apos;s own privacy policy also applies to Discord&apos;s handling of your account and channel data.</p>
    </section>
  </LegalShell>;
}
