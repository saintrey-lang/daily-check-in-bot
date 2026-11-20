import type { Metadata } from "next";
import LegalShell from "../legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service | GOLDEN CREATOR",
  description: "Terms for the GOLDEN CREATOR Discord application and Golden Spatula Arcade.",
};

export default function TermsPage() {
  return <LegalShell title="Terms of Service">
    <p>These terms govern the GOLDEN CREATOR Discord application and Golden Spatula Arcade, operated by <strong>Saint Rey</strong> ("we", "us"). Contact us at <a href="mailto:saintrey@whim.sg">saintrey@whim.sg</a>.</p>

    <section><h2>1. The service</h2>
      <p>The application provides the Golden Spatula Arcade Activity (Crosswords and Picture Puzzle), community daily check-ins, Starplayer task submissions, creator content submissions and leaderboard/status commands, and related server activity reports. We may change, pause, or discontinue a feature. Discord&apos;s own terms and community rules also apply when you use the application through Discord.</p>
    </section>

    <section><h2>2. Your participation</h2>
      <p>You must meet Discord&apos;s minimum age requirement and follow the rules of the server where you use the application. Use your own Game ID and name in the Arcade. Keep your four-digit Arcade PIN private. Do not try to access another player&apos;s entry, manipulate a score, overload the service, or submit unlawful, harmful, or infringing material.</p>
    </section>

    <section><h2>3. Scores, check-ins, and rewards</h2>
      <p>Arcade scores and partial points are community game results. A score, check-in, Starplayer submission, or creator content submission does not by itself guarantee a prize, payment, or approval. Creator budgets, review statuses, payouts, and leaderboard figures are program records subject to the applicable creator program rules and operator review. Any separate event or reward program has its own published rules.</p>
      <p>Closing an Activity window may not reliably send a partial score. Use <strong>Exit &amp; Share</strong> when you want to post current points.</p>
    </section>

    <section><h2>4. Your content</h2>
      <p>If you submit a Starplayer link or file, a creator content link, or a picture in the puzzle channel, you confirm you have permission to share it for that use. You retain your rights to your content. You allow us to display and process it as needed to run the application, show submissions and puzzles in the Discord server, and keep community records. We may remove content or restrict misuse where needed to operate the service and follow Discord rules.</p>
    </section>

    <section><h2>5. Availability and responsibility</h2>
      <p>The application depends on Discord and hosting services and may be interrupted. Saved progress and automatic exit posts can fail if those services are unavailable or a device closes the window before a request finishes. To the extent permitted by applicable law, we provide the service without a promise of uninterrupted availability. Nothing here limits rights that cannot legally be limited.</p>
    </section>

    <section><h2>6. Privacy and changes</h2>
      <p>Our <a href="/privacy">Privacy Policy</a> explains how we handle data. We may update these terms and will post the updated version with its effective date. Continued use after the update takes effect means you accept the revised terms where applicable law permits.</p>
    </section>

    <section><h2>7. Contact</h2>
      <p>For questions, content concerns, or account and data requests, email <a href="mailto:saintrey@whim.sg">saintrey@whim.sg</a>.</p>
    </section>
  </LegalShell>;
}
