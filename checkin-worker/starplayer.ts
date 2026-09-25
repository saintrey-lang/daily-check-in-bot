import {
  ActionRowBuilder, Client, Events, FileUploadBuilder, LabelBuilder,
  ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, type TextChannel,
} from "discord.js";
import {
  STARPLAYER_CATEGORIES, STARPLAYER_CHANNEL_ID, categoryFor, todayInManila, type StarplayerCategory,
} from "../lib/starplayer/core";
import { StarplayerSheetsStore } from "../lib/starplayer/sheets";

export const MENU_ID = "starplayer:category:v1";
const MODAL_PREFIX = "starplayer:submit:v1:";
const LINK_ID = "starplayer:link";
const FILE_ID = "starplayer:file";
const DATE_ID = "starplayer:task-date";
const MENU_TEXT = "**STARPLAYER TASK SUBMISSION**\nChoose a task category below. Enter the date you did the task (you can choose a previous date), then add a submission link, an attachment, or both. Each category counts as finished once you submit at least one task.";

export function submissionMenu() {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder("Choose your task category")
      .addOptions(STARPLAYER_CATEGORIES.map((category) => ({ label: category.label, value: category.id }))),
  );
}

export function submissionModal(category: StarplayerCategory) {
  const label = categoryFor(category)!.label;
  return new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${category}`)
    .setTitle(`${label} submission`)
    .addLabelComponents(
      new LabelBuilder().setLabel("Task Date (YYYY-MM-DD)").setTextInputComponent(
        new TextInputBuilder().setCustomId(DATE_ID).setStyle(TextInputStyle.Short)
          .setValue(todayInManila()).setPlaceholder("YYYY-MM-DD").setMinLength(10).setMaxLength(10).setRequired(true),
      ),
      new LabelBuilder().setLabel("Submission Link (optional)").setTextInputComponent(
        new TextInputBuilder().setCustomId(LINK_ID).setStyle(TextInputStyle.Short)
          .setPlaceholder("https://...").setMaxLength(1000).setRequired(false),
      ),
      new LabelBuilder().setLabel("Submission Attachment (optional)").setFileUploadComponent(
        new FileUploadBuilder().setCustomId(FILE_ID).setMinValues(0).setMaxValues(1).setRequired(false),
      ),
    );
}

export function attachStarplayer(client: Client, guildId: string): void {
  const store = new StarplayerSheetsStore();
  let menuReady = false;
  let settingUp = false;

  async function submissionChannel(): Promise<TextChannel> {
    const channel = await client.channels.fetch(STARPLAYER_CHANNEL_ID);
    if (!channel?.isTextBased() || !("guildId" in channel) || channel.guildId !== guildId || !("send" in channel)) {
      throw new Error("Starplayer submission channel must be a text channel in the configured Discord server.");
    }
    return channel as TextChannel;
  }

  async function ensureMenu(): Promise<void> {
    if (!client.isReady() || menuReady || settingUp) return;
    settingUp = true;
    try {
      await store.setup();
      const channel = await submissionChannel();
      const savedId = await store.readMenuMessageId();
      const previous = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
      if (previous?.author.id === client.user?.id) {
        await previous.edit({ content: MENU_TEXT, components: [submissionMenu()] });
      } else {
        const message = await channel.send({ content: MENU_TEXT, components: [submissionMenu()], allowedMentions: { parse: [] } });
        try {
          await store.saveMenuMessageId(message.id);
        } catch (error) {
          await message.delete().catch((deleteError) => console.error("Could not remove an unsaved Starplayer menu.", deleteError));
          throw error;
        }
        await message.pin().catch((error) => console.warn("Could not pin Starplayer submission menu.", error));
      }
      menuReady = true;
      console.info(`Starplayer submission menu ready in channel ${STARPLAYER_CHANNEL_ID}`);
    } catch (error) {
      console.error("Could not set up Starplayer submissions; retrying shortly.", error);
    } finally {
      settingUp = false;
    }
  }

  client.once(Events.ClientReady, () => {
    void ensureMenu();
    setInterval(() => void ensureMenu(), 60_000);
  });

}
