import {
  ActionRowBuilder, AttachmentBuilder, Client, Events, FileUploadBuilder, LabelBuilder,
  MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type Interaction, type ModalSubmitInteraction, type StringSelectMenuInteraction, type TextChannel,
} from "discord.js";
import {
  STARPLAYER_CATEGORIES, STARPLAYER_CHANNEL_ID, categoryFor, validateSubmission,
  type StarplayerCategory, type StarplayerSubmission,
} from "../lib/starplayer/core";
import { StarplayerSheetsStore } from "../lib/starplayer/sheets";

export const MENU_ID = "starplayer:category:v1";
const MODAL_PREFIX = "starplayer:submit:v1:";
const LINK_ID = "starplayer:link";
const FILE_ID = "starplayer:file";
const MENU_TEXT = "**STARPLAYER TASK SUBMISSION**\nChoose a task category below. Add a submission link, an attachment, or both. Each category counts as finished once you submit at least one task.";

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

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === MENU_ID) {
      void handleSelection(interaction).catch((error) => handleFailure(interaction, error));
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX)) {
      void handleSubmission(interaction).catch((error) => handleFailure(interaction, error));
    }
  });

  async function handleSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    if (interaction.guildId !== guildId || interaction.channelId !== STARPLAYER_CHANNEL_ID || !menuReady) {
      await interaction.reply({ content: "Starplayer submissions are unavailable right now.", flags: MessageFlags.Ephemeral });
      return;
    }
    const category = categoryFor(interaction.values[0]);
    if (!category) throw new Error("Invalid Starplayer task category.");
    await interaction.showModal(submissionModal(category.id));
  }

  async function handleSubmission(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.guildId !== guildId || interaction.channelId !== STARPLAYER_CHANNEL_ID || !menuReady) {
      await interaction.reply({ content: "Starplayer submissions are unavailable right now.", flags: MessageFlags.Ephemeral });
      return;
    }
    const category = categoryFor(interaction.customId.slice(MODAL_PREFIX.length));
    if (!category) throw new Error("Invalid Starplayer task category.");
    const file = interaction.fields.getUploadedFiles(FILE_ID)?.first();
    const link = validateSubmission(interaction.fields.getTextInputValue(LINK_ID), file?.name ?? "");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await submissionChannel();
    const message = await channel.send({
      embeds: [{
        color: 0xDFF760, title: `${category.label} · Starplayer submission`,
        description: `Submitted by <@${interaction.user.id}>`,
        fields: [
          ...(link ? [{ name: "Submission link", value: link }] : []),
          ...(file ? [{ name: "Attachment", value: file.name }] : []),
        ],
        footer: { text: `Submission ID: ${interaction.id}` },
      }],
      files: file ? [new AttachmentBuilder(file.url, { name: file.name })] : [],
      allowedMentions: { parse: [] },
    });
    const record: StarplayerSubmission = {
      id: interaction.id, submittedAt: interaction.createdAt.toISOString(),
      userId: interaction.user.id, username: interaction.user.username,
      displayName: interaction.member && "displayName" in interaction.member ? String(interaction.member.displayName) : interaction.user.globalName ?? interaction.user.username,
      category: category.id, link, attachmentName: file?.name ?? "",
      messageUrl: message.url, messageId: message.id,
      channelId: STARPLAYER_CHANNEL_ID, guildId,
    };
    try {
      await store.appendSubmission(record);
    } catch (error) {
      await message.delete().catch((deleteError) => console.error("Could not remove unrecorded Starplayer submission.", deleteError));
      throw error;
    }
    await interaction.editReply({ content: `${category.label} submitted. Your task is recorded: ${message.url}` });
  }
}

async function handleFailure(interaction: Interaction, error: unknown): Promise<void> {
  console.error("Could not process Starplayer submission.", error);
  if (!interaction.isRepliable()) return;
  const message = error instanceof Error && /submission link|https:\/\//i.test(error.message)
    ? error.message : "Could not record your submission. Please try again shortly.";
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message });
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  } catch (replyError) {
    console.error("Could not notify Starplayer about the submission error.", replyError);
  }
}
