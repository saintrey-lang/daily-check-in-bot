export type MemeCaption = { top: string; bottom: string; mood: number; id: number };

// Original gameplay jokes. Every setup has its own related punchlines.
const topics: [string, string[]][] = [
  ['Me: I will play a flexible TFT comp today.', [
    'Also me: forcing the same carry for the eighth game.', 'The first item drop has already chosen my personality.',
    'One familiar unit in the shop and the plan is gone.', 'Flexible means moving my favorite carry one hex.',
    'I have a backup plan. It is the same comp with a different frontline.', 'My entire scouting report: surely nobody else plays this.',
    'The shop is offering options. I am declining all of them.', 'My comfort comp has become my whole identity.',
  ]],
  ['When I finally save enough gold in Golden Spatula:', [
    'The reroll button suddenly looks very clickable.', 'My economy lasts exactly one shopping trip.',
    'I have a savings account. The shop has the password.', 'The gold is for emergencies. This shop is an emergency.',
    'One refresh later: where did my future go?', 'My bank balance is now a board full of almost-upgrades.',
    'I invested everything in potential.', 'Financial stability was a nice three-second experience.',
  ]],
  ['My TFT carry is one copy away from an upgrade.', [
    'The shop would like to show me everyone else instead.', 'Every other player apparently has that exact copy.',
    'The bench is now a waiting room.', 'I can hear the last copy laughing from another board.',
    'My gold has left the chat.', 'Seven refreshes later: still emotionally one copy away.',
    'The next shop will hit. Source: my imagination.', 'My carry is doing a long-term guest appearance on the bench.',
  ]],
  ['Me scouting the Golden Spatula lobby:', [
    'Six players. One comp. No one wants to blink first.', 'Everyone independently discovered my genius plan.',
    'I call it a contested comp. The lobby calls it our comp.', 'We are not opponents. We are a group project.',
    'My pivot arrives three rounds after the panic.', 'Apparently the shop has a shared custody agreement.',
    'I wanted competition. I did not mean for every unit.', 'The real synergy is all of us refusing to pivot.',
  ]],
  ['My TFT board looks unbeatable.', [
    'Then combat begins.', 'The strongest unit is my confidence.', 'The damage chart has filed a complaint.',
    'The enemy carry did not get the memo.', 'It was a beautiful board. For the loading screen.',
    'I am winning the screenshot contest.', 'The theory was excellent. The practice was eighth.',
    'My frontline has chosen an early lunch break.',
  ]],
  ['I only need one good item component in Golden Spatula.', [
    'The game sends me a collection instead.', 'My carry now has an outfit, not a build.',
    'The item bench looks like a hardware store with no customers.', 'Every component fits the comp I am not playing.',
    'The loot is creative. My plan is not.', 'The game wants me to learn a new carry immediately.',
    'I have enough items to solve a different problem.', 'This is no longer itemization. It is interior design.',
  ]],
  ['Me: I can hold these TFT units for one more round.', [
    'My bench: we are at full capacity.', 'The shop has found the exact upgrade I have no room for.',
    'I have nine backup plans and zero empty seats.', 'A bench full of possibilities. A board full of concerns.',
    'My best unit is currently parked outside.', 'Selling one copy feels like ending a friendship.',
    'The shop is good. My storage management is not.', 'My bench is playing a completely different comp.',
  ]],
  ['Golden Spatula: choose your augment.', [
    'Me reading all three while the timer reads me.', 'I suddenly need a spreadsheet and three opinions.',
    'I pick the exciting one. My LP picks the exit.', 'The safe option and I are no longer on speaking terms.',
    'I have never been more confident about something I did not read.', 'My friends said take the sensible choice. Anyway...',
    'The description is long. My patience is not.', 'I select first, understand later.',
  ]],
  ['When I move my TFT carry to a safer corner:', [
    'The enemy has already moved their problem to that corner.', 'My carry has discovered a new way to be in danger.',
    'The safest square exists exclusively in my imagination.', 'The enemy scouting department works faster than mine.',
    'I changed one hex and unlocked a brand-new disaster.', 'My carry now loses with a different camera angle.',
    'This is not positioning. It is witness protection.', 'I have successfully repositioned my anxiety.',
  ]],
  ['My Golden Spatula frontline is stacked.', [
    'It has enough items to leave faster, apparently.', 'The enemy board treats it like a speed bump.',
    'All that preparation for a three-second meeting.', 'The tanks are tanking my expectations.',
    'My carry is now the emergency frontline.', 'The front line has become the gone line.',
    'The enemy damage chart looks like a horror poster.', 'The armor is real. So is the problem.',
  ]],
  ['I am definitely going to pivot my TFT comp.', [
    'After I buy one more copy of the old carry.', 'My new comp is being held hostage by my old bench.',
    'The transition has been extended for another round.', 'I have changed everything except the units.',
    'My pivot is currently a motivational speech.', 'I am strategically rotating back to the same plan.',
    'The new carry is waiting for me to stop being sentimental.', 'I pivoted my camera. That counts.',
  ]],
  ['One more Golden Spatula game before bed.', [
    'The sun is now scouting my room.', 'My sleep schedule has placed eighth.',
    'The next lobby will fix everything, including the clock.', 'The losing streak has unlocked overtime.',
    'I am not tired. My positioning is just sleepwalking.', 'The alarm is queued for the same lobby.',
    'My pillow has started sending surrender votes.', 'I have hit the three-star version of exhaustion.',
  ]],
  ['Me after winning one TFT game:', [
    'I have solved the game permanently.', 'All my decisions are now part of a masterclass.',
    'The next lobby is about to fact-check this confidence.', 'I should definitely force this exact board again.',
    'My friends receive a screenshot and a lecture.', 'I am accepting questions about my single victory.',
    'The shop carried me. I will accept all the credit.', 'The ego has upgraded faster than the carry.',
  ]],
  ['Golden Spatula gives me a perfect early board.', [
    'I spend the rest of the game protecting my confidence.', 'I immediately forget that other players can upgrade too.',
    'This is going to be an easy top finish. Famous last words.', 'The midgame has requested a serious conversation.',
    'I stop scouting at exactly the wrong time.', 'The lobby is saving gold. I am saving screenshots.',
    'The early lead came with no instruction manual.', 'My board peaked before my decision-making arrived.',
  ]],
  ['The TFT shop shows a unit I just sold.', [
    'It remembered our relationship after I moved on.', 'The shop is here for emotional damage.',
    'Now it wants to commit.', 'The timing is perfect for absolutely nobody.',
    'My bench has trust issues.', 'It was unavailable until I stopped needing it.',
    'The upgrade is being offered as a plot twist.', 'I am being haunted by my own transaction history.',
  ]],
  ['I am watching the last seconds of a Golden Spatula fight.', [
    'My carry and my heartbeat are both barely surviving.', 'I have become a full-time sports commentator.',
    'The unit has one job. I have seventeen emotions.', 'This tiny board now contains my entire personality.',
    'I am coaching a character that cannot hear me.', 'The last auto-attack has a dramatic soundtrack.',
    'My chair is taking more damage than the frontline.', 'I have never believed in one unit so loudly.',
  ]],
  ['TFT ranked: I will focus on steady improvement.', [
    'Me ten minutes later: who stole my carry?', 'My learning objective is now finding someone to blame.',
    'The lesson is patience. I have declined the lesson.', 'The reflection session is mostly shop complaints.',
    'I am analyzing everything except my last five choices.', 'My strongest trait is selective memory.',
    'The replay shows an entirely different version of my story.', 'Improvement starts after this very emotional queue.',
  ]],
  ['When the Golden Spatula lobby ignores my carry:', [
    'I am uncontested and still missing every copy.', 'The shop is personally contesting me.',
    'Nobody wants it. Apparently neither does the shop.', 'This was supposed to be the easy part.',
    'The only opponent in my comp is probability.', 'My scouting was correct. My luck was absent.',
    'The carry has gone on vacation without telling me.', 'I have exclusive rights to disappointment.',
  ]],
  ['My TFT carry has the perfect items.', [
    'It also has a perfect view of its own defeat.', 'Now I just need a frontline, a board, and a plan.',
    'The carry is ready. The rest of the team is a concept.', 'It has everything except personal space.',
    'The build is complete. The survival part is missing.', 'My damage dealer has become a premium spectator.',
    'The enemy focused my one good decision.', 'Best-in-slot items, worst-in-slot protection.',
  ]],
  ['I am saving gold for a big Golden Spatula upgrade.', [
    'The lobby has decided I should spend it on survival.', 'My health bar has a different investment strategy.',
    'The future board is amazing. The current board is in trouble.', 'The savings plan did not include combat.',
    'My economy is healthy. Nothing else is.', 'The gold is interest-bearing. The board is damage-bearing.',
    'I have enough gold to write a beautiful goodbye.', 'My plan matures after my health bar does.',
  ]],
  ['TFT scouting takes just a few seconds.', [
    'I will spend those seconds staring at my own carry instead.', 'Those seconds have been allocated to panic shopping.',
    'I scouted my bench. It was very informative.', 'The lobby exists. I prefer the mystery.',
    'The first scouting report arrives after the loss.', 'I am playing surprise-based strategy.',
    'I know every board except the one I am about to fight.', 'My favorite opponent is the one I did not inspect.',
  ]],
  ['Golden Spatula: all my upgrades finally hit.', [
    'Right after I needed them.', 'The shop celebrates my last health point.',
    'The comeback trailer has a very short runtime.', 'My board is now ready for the post-match screenshot.',
    'The game has excellent comedic timing.', 'I have peaked at the exact wrong moment.',
    'The units arrive like guests after the party ends.', 'It is a strong board with a weak expiration date.',
  ]],
  ['My TFT comp guide says this board is strong.', [
    'It forgot to mention the part where I play it.', 'The screenshot has more upgrades than my entire match.',
    'I have replicated the ambition perfectly.', 'My version is the budget adaptation.',
    'The guide assumes the shop cooperates.', 'I followed every step except the successful ones.',
    'The units are right. The timing is a fan-made remix.', 'The guide did not account for my confidence.',
  ]],
  ['I have a great backup carry in Golden Spatula.', [
    'It is currently a one-star motivational speaker.', 'The backup needs a backup.',
    'It is strong in theory and adorable in combat.', 'My item holder has decided the promotion is permanent.',
    'The plan has depth. The damage chart does not.', 'The emergency option is requesting emergency support.',
    'It has potential. The lobby has upgraded units.', 'My fallback strategy has fallen back again.',
  ]],
  ['When the TFT shop finally offers a huge upgrade:', [
    'I just spent the gold on a completely different problem.', 'The timing has been professionally inconvenient.',
    'My wallet would like to spectate this opportunity.', 'The upgrade costs exactly more than I have.',
    'My bench is full and my decisions are louder.', 'The shop is testing both my economy and my relationships.',
    'This is the price of buying everything with potential.', 'I am accepting donations from imaginary teammates.',
  ]],
  ['Golden Spatula with friends is very relaxing.', [
    'Until one of them buys my last carry copy.', 'We have stopped using each other\'s real names.',
    'Our friendship is now a contested unit pool.', 'The voice chat is a courtroom.',
    'There are no teams, only very detailed accusations.', 'The only shared synergy is mutual suspicion.',
    'They call it scouting. I call it betrayal.', 'We are bonding through carefully recorded grievances.',
  ]],
  ['My TFT board needs one small positioning adjustment.', [
    'I have redesigned the entire board with two seconds left.', 'The timer has become my strongest opponent.',
    'The carry is now somewhere it has never been before.', 'I fixed the original problem and invented three more.',
    'The frontline has a new artistic arrangement.', 'My last-second movement has entered the highlight reel.',
    'The board is different. The panic is identical.', 'The pieces moved faster than the plan.',
  ]],
  ['When I beat the strongest Golden Spatula board:', [
    'I immediately assume I cannot lose to anyone else.', 'My confidence has bought a one-way ticket upward.',
    'The next opponent is about to teach humility.', 'I stop adapting and start celebrating.',
    'One fight has become my entire resume.', 'My screenshot folder receives another historical document.',
    'The victory was close. The celebration is not.', 'I am now explaining the meta to people who did not ask.',
  ]],
  ['I am definitely done playing TFT for today.', [
    'The queue button: are you sure?', 'My hand has already started the next lobby.',
    'I meant done with this exact lobby.', 'The exit button has not been consulted.',
    'I need one good finish for emotional closure.', 'My last game has acquired three sequels.',
    'This statement expires when the results screen closes.', 'The game ended. The negotiation continues.',
  ]],
  ['Golden Spatula gives me a board full of synergy.', [
    'The missing synergy is winning combat.', 'The trait icons are having a better game than my carry.',
    'My team is coordinated in its departure.', 'The board is thematically excellent.',
    'Everything activates except the victory screen.', 'The combo is complete. The damage is a suggestion.',
    'My units agree on one thing: taking a break.', 'The synergy chart has no responsibility for this result.',
  ]],
];

export const CAPTION_COUNT = topics.reduce((sum, [, punches]) => sum + punches.length, 0);

export function pickMeme(day: string, slot: number): MemeCaption {
  const dayNumber = Math.floor(Date.parse(day + 'T00:00:00Z') / 86_400_000);
  const id = ((dayNumber * 100 + slot) % CAPTION_COUNT + CAPTION_COUNT) % CAPTION_COUNT;
  let remaining = id;
  for (const [top, punches] of topics) {
    if (remaining < punches.length) return { top, bottom: punches[remaining], mood: (dayNumber + slot) % 4, id };
    remaining -= punches.length;
  }
  throw new Error('Caption lookup failed');
}
