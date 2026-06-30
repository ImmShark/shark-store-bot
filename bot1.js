const config = require("./config1.js");
console.log("ENV TOKEN =", process.env.DISCORD_TOKEN);
console.log("CONFIG TOKEN =", config.DISCORD_TOKEN);
const messages = require("./messages1.js");
const qr = require("./qr.js");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const fs = require("fs");

let guildSettings = {};
const SETTINGS_FILE = "./guild_settings.json";

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf8");
      guildSettings = JSON.parse(data);
      console.log("✅ Đã tải thành công cài đặt từ guild_settings.json");
    } else {
      console.log("ℹ️ Không tìm thấy file cài đặt, sẽ tạo file mới khi cần.");
    }
  } catch (error) {
    console.error("❌ Lỗi khi tải file cài đặt:", error);
  }
}

function saveSettings() {
  try {
    const data = JSON.stringify(guildSettings, null, 4);
    fs.writeFileSync(SETTINGS_FILE, data, "utf8");
    console.log("💾 Cài đặt đã được lưu vào file guild_settings.json");
  } catch (error) {
    console.error("❌ Lỗi khi lưu file cài đặt:", error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function checkAndRestoreLegitState() {
  console.log("🔎 Bắt đầu kiểm tra và phục hồi trạng thái legit...");
  for (const guildId in guildSettings) {
    const settings = guildSettings[guildId];
    if (settings && settings.legitChannelId) {
      try {
        const channel = await client.channels.fetch(settings.legitChannelId);
        if (!channel) continue;

        const messagesInChannel = await channel.messages.fetch({ limit: 2 });
        const lastMessage = messagesInChannel.first();

        if (!lastMessage || lastMessage.author.bot) {
          continue;
        }

        const matchedPrefix = messages.legitCheck.triggerPrefix.find((prefix) =>
          lastMessage.content.startsWith(prefix),
        );

        if (matchedPrefix) {
          const productName = lastMessage.content
            .substring(matchedPrefix.length)
            .trim();

          if (!productName) continue;

          const secondLastMessage = messagesInChannel.last();

          if (
            !secondLastMessage ||
            secondLastMessage.id !== settings.lastLegitEmbedId
          ) {
            console.log(
              `[PHỤC HỒI] Phát hiện tin nhắn legit chưa được xử lý trong kênh ${channel.name}. Đang xử lý lại...`,
            );
            await handleLegitMessage(lastMessage);
          }
        }
      } catch (error) {
        console.error(
          `❌ Lỗi khi phục hồi trạng thái cho server ID ${guildId}:`,
          error,
        );
      }
    }
  }
  console.log("👍 Hoàn tất kiểm tra trạng thái legit.");
}

client.once("ready", async () => {
  console.log(`✅ Bot đã đăng nhập với tên: ${client.user.tag}`);

  try {
    console.log("🔄 Đang đăng ký các lệnh slash...");
    const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

    const commands = [
      new SlashCommandBuilder()
        .setName("banggia")
        .setDescription("Hiển thị bảng giá dịch vụ của shop."),
      new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Gửi bảng tạo ticket"),
      new SlashCommandBuilder()
        .setName("qr")
        .setDescription("Hiển thị thông tin chuyển khoản + QR code"),
      new SlashCommandBuilder()
        .setName("setup-legit")
        .setDescription("[Admin] Thiết lập kênh để gửi tin nhắn legit.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Chọn kênh bạn muốn dùng để check legit.")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];

    await rest.put(
      Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
      { body: commands },
    );

    console.log("✅ Đã đăng ký thành công các lệnh slash.");
    await checkAndRestoreLegitState();
  } catch (error) {
    console.error(`❌ Lỗi khi đăng ký lệnh slash: ${error}`);
  }
});

async function sendPriceList(interactionOrMessage) {
  const mainData = messages.mainPriceList;
  const mainEmbed = new EmbedBuilder()
    .setTitle(mainData.title)
    .setDescription(mainData.description)
    .setColor(mainData.color)
    .setThumbnail(mainData.thumbnailUrl)
    .setImage(mainData.imageUrl)
    .setFooter({
      text: mainData.footer.text,
      iconURL: mainData.footer.iconURL,
    });

  const menuOptions = messages.priceCategories.map((category) => ({
    label: category.label,
    description: category.description,
    value: category.id,
    emoji: category.emoji,
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("price_list_select")
    .setPlaceholder(mainData.selectMenuPlaceholder)
    .addOptions(menuOptions);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  if (interactionOrMessage.isChatInputCommand?.()) {
    await interactionOrMessage.reply({
      embeds: [mainEmbed],
      components: [row],
    });
  } else {
    await interactionOrMessage.channel.send({
      embeds: [mainEmbed],
      components: [row],
    });
  }
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const OWNER_ID = "1013433356832219157";

    if (
      ["banggia", "ticket", "qr", "setup-letgit"].includes(commandName) &&
      interaction.user.id !== OWNER_ID
    ) {
      return interaction.reply({
        content: "❌ Bạn không có quyền sử dụng lệnh này.",
        ephemeral: true,
      });
    }

    if (commandName === "banggia") {
      await sendPriceList(interaction);
    }
    if (commandName === "qr") {
      const embed = new EmbedBuilder()
        .setTitle(
          "<a:294064purplepaw:1515288184223825942> THÔNG TIN CHUYỂN KHOẢN",
        )
        .setColor("#008cff")
        .setThumbnail(
          "https://media.discordapp.net/attachments/1160008472893603871/1512106856594669679/logo.gif?ex=6a238b80&is=6a223a00&hm=71cf0d3bb9c37b681ecba2fe634b865789bcef8195cd6206bc7568d934fcd0cd&=&width=623&height=533",
        )
        .setFooter({
          text: " VUI LÒNG GỬI BILL VÀO TICKET KHI ĐÃ CHUYỂN KHOẢN",
        })
        .setDescription(
          `
<a:39411brownbow:1515288160727339028> **Ngân Hàng**
\`\`\`
MB BANK
\`\`\`

<:3339shinystar2:1512142205094068367> **Số Tài Khoản**
\`\`\`
0328206839
\`\`\`

<:1661shinystar6:1512141829758386226> **Chủ Tài Khoản**
\`\`\`
LE HOANG VU
\`\`\`

<:3629shinystar4:1512142399932076223> **Nội Dung**
\`\`\`
SHARK STORE
\`\`\`
`,
        )
        .setImage(
          "https://media.discordapp.net/attachments/1161326028682170489/1512350783511855144/635002420_2099748023930273_8969084125919827184_n.jpg?ex=6a23c5ec&is=6a22746c&hm=53d4547240c6cbff44df18fdca6fb5c5dafd24a2de80745169a068166c05c768&=&format=webp&width=930&height=930",
        );

      await interaction.reply({ embeds: [embed] });
    }
    if (commandName === "ticket") {
      const embed = new EmbedBuilder()
        .setColor("#00bfff")
        .setTitle("Shark Store")
        .setDescription(
          `
  <a:kingscrown:1116681967505784862> **Nhấn Vào Nút Bên Dưới Để Tạo Ticket** <a:kingscrown:1116681967505784862>
<a:heartCopy:1110555799777972226> **Vui Lòng Không Spam Ticket** <a:heartCopy:1110555799777972226>
> <a:bongocat:1110555770346545173>Xem Giá Tại: 
> https://discord.com/channels/1013847341649887232/1165337754952020008

> <a:pin1999:1116682907675799573>Xem Điều Khoảng Mua Hàng Tại: 
> https://discord.com/channels/1013847341649887232/1242748972460806255
`,
        )
        .setImage(
          "https://media.discordapp.net/attachments/1160008472893603871/1512111182713065472/endd.png?ex=6a2589c7&is=6a243847&hm=8fd67fd99057cedc12ecf1c9b14527a40955f1b10a5e042b2558b11a472606aa&=&format=webp&quality=lossless&width=1860&height=283",
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("buy_ticket")
          .setLabel("Mua Hàng")
          .setEmoji("<:4439star9:1512142545419899070>")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId("support_ticket")
          .setLabel("Hỗ Trợ")
          .setEmoji("<:7899shinystar1:1512142913428258867>")
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
      });
    }
    if (commandName === "setup-legit") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return await interaction.reply({
          content: messages.setupLegit.noPermission,
          ephemeral: true,
        });
      }
      const channel = interaction.options.getChannel("channel");
      const guildId = interaction.guild.id;

      guildSettings[guildId] = {
        legitChannelId: channel.id,
        lastLegitEmbedId: null,
      };

      await interaction.reply({
        content: messages.setupLegit.success(channel),
        ephemeral: true,
      });

      try {
        const embedData = messages.legitCheck.embed;
        const sampleEmbed = new EmbedBuilder()
          .setTitle(embedData.title)
          .setDescription(
            embedData.description(
              messages.legitCheck.triggerPrefix[0] + " <Sản Phẩm Mẫu>",
            ),
          )
          .setColor(embedData.color)
          .setImage(embedData.gifUrl);

        const sentMessage = await channel.send({ embeds: [sampleEmbed] });
        guildSettings[guildId].lastLegitEmbedId = sentMessage.id;
        saveSettings();
      } catch (error) {
        console.error(
          `Không thể gửi embed mẫu vào kênh ${channel.name}: ${error}`,
        );
        await interaction.followUp({
          content: `⚠️ Đã setup kênh thành công nhưng tôi không có quyền gửi tin nhắn trong đó. Vui lòng kiểm tra lại quyền của Bot.`,
          ephemeral: true,
        });
      }
    }
  }
  if (interaction.isButton()) {
    if (
      interaction.customId === "buy_ticket" ||
      interaction.customId === "support_ticket"
    ) {
      const modal = new ModalBuilder()
        .setCustomId(interaction.customId)
        .setTitle("Shark Store");

      const productInput = new TextInputBuilder()
        .setCustomId("product")
        .setLabel("Sản phẩm")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const noteInput = new TextInputBuilder()
        .setCustomId("note")
        .setLabel("Ghi chú")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(productInput),
        new ActionRowBuilder().addComponents(noteInput),
      );

      await interaction.showModal(modal);
    }

    if (interaction.customId === "close_ticket") {
      await interaction.reply({
        content: "🔒 Ticket sẽ đóng sau 5 giây",
        ephemeral: true,
      });

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }
  if (interaction.isModalSubmit()) {
    if (
      interaction.customId !== "buy_ticket" &&
      interaction.customId !== "support_ticket"
    )
      return;

    const product = interaction.fields.getTextInputValue("product");

    const note = interaction.fields.getTextInputValue("note") || "Không có";

    const username = interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");

    const existingTicket = interaction.guild.channels.cache.find(
      (c) => c.name === `ticket-${username}`,
    );

    if (existingTicket) {
      return interaction.reply({
        content: `❌ Bạn đã có ticket: ${existingTicket}`,
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.create({
      name: `ticket-${username}`,
      type: ChannelType.GuildText,

      parent: "1013848320478818335",

      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
        {
          id: "1206284744145375292",
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Đóng Ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
    );

    const ticketCode = Math.floor(100000 + Math.random() * 900000);

    const ticketEmbed = new EmbedBuilder()
      .setColor("#00BFFF")
      .setTitle(
        "<a:39411brownbow:1515288160727339028> SHARK STORE <a:294064purplepaw:1515288184223825942>",
      )
      .setThumbnail(
        "https://media.discordapp.net/attachments/1160008472893603871/1512106856594669679/logo.gif?ex=6a2585c0&is=6a243440&hm=8077fea3bef378edd031f63176842badaabf53608b8950762a082b69c8600483&=&width=623&height=533",
      )
      .setDescription(
        `
╭───────────────╮

<a:7922_Letter_S:1515219656627982346> **Người Tạo Đơn** <a:7922_Letter_S:1515219656627982346>
${interaction.user}

<a:6869_Letter_H:1515219767944941769> **Mã Ticket** <a:6198_Letter_T:1515219789424099428>
\`${ticketCode}\`

<a:3469_Letter_A:1515219634255565002> **Loại Ticket**<a:3539_Letter_O:1515220112360341654>
${interaction.customId === "buy_ticket" ? "Mua Hàng" : "Hỗ Trợ"}

<a:6939_Letter_R:1515212884517326849> **Sản Phẩm**<a:6939_Letter_R:1515212884517326849>
${product}

<a:1216_Letter_K:1515219687779078266> **Ghi Chú**<a:8668_Letter_E:1515219810378711080>
${note}

╰───────────────╯
`,
      )
      .setTimestamp();

    await channel.send({
      content: `<@${interaction.user.id}> <@&1206284744145375292>`,
      embeds: [ticketEmbed],
      components: [closeRow],
    });
    await interaction.reply({
      content: `<:6336bunnycomet:1512142819140173976> Ticket đã được tạo: ${channel}`,
      ephemeral: true,
    });
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "price_list_select") {
      const selectedCategoryId = interaction.values[0];
      const category = messages.priceCategories.find(
        (cat) => cat.id === selectedCategoryId,
      );

      if (category) {
        const categoryEmbed = new EmbedBuilder()
          .setTitle(category.embed.title)
          .setColor(category.embed.color)
          .addFields(category.embed.fields);

        if (category.embed.imageUrl) {
          categoryEmbed.setImage(category.embed.imageUrl);
        }

        await interaction.reply({ embeds: [categoryEmbed], ephemeral: true });
      }
    }
  }
});

async function handleLegitMessage(message) {
  const settings = guildSettings[message.guild.id];
  if (!settings) return;

  try {
    if (settings.lastLegitEmbedId) {
      const oldMessage = await message.channel.messages
        .fetch(settings.lastLegitEmbedId)
        .catch(() => null);
      if (oldMessage) {
        await oldMessage.delete();
      }
    }

    for (const reaction of messages.legitCheck.reactions) {
      await message.react(reaction).catch(console.error);
    }

    const embedData = messages.legitCheck.embed;
    const embed = new EmbedBuilder()
      .setTitle(embedData.title)
      .setDescription(embedData.description(message.content))
      .setColor(embedData.color)
      .setImage(embedData.gifUrl)
      .setThumbnail(embedData.thumbnailUrl);

    const newEmbedMessage = await message.channel.send({ embeds: [embed] });

    settings.lastLegitEmbedId = newEmbedMessage.id;
    saveSettings();
  } catch (error) {
    console.error(`Lỗi khi xử lý tin nhắn legit: ${error}`);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const settings = guildSettings[message.guild.id];

  if (settings && message.channel.id === settings.legitChannelId) {
    const triggerPrefixes = messages.legitCheck.triggerPrefix;

    const matchedPrefix = triggerPrefixes.find((prefix) =>
      message.content.startsWith(prefix),
    );
    const lowerCaseContent = message.content.toLowerCase();

    const isCorrectFormat =
      matchedPrefix &&
      message.content.substring(matchedPrefix.length).trim().length > 0;
    const isAttempt =
      lowerCaseContent.includes("legit") || lowerCaseContent.includes("legi");

    if (isCorrectFormat) {
      await handleLegitMessage(message);
    } else if (isAttempt) {
      try {
        const reply = await message.reply(
          messages.legitCheck.wrongFormatReminder(),
        );
        setTimeout(() => {
          reply.delete().catch(console.error);
          message.delete().catch(console.error);
        }, 10000);
      } catch (error) {
        console.error(`Lỗi khi gửi tin nhắn nhắc nhở legit: ${error}`);
      }
    }
    return;
  }

  const prefix = ".";
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    if (commandName === "banggia") {
      await sendPriceList(message);
    }
  }
});

console.log("TOKEN:", process.env.DISCORD_TOKEN);
console.log("TOKEN EXISTS:", !!process.env.DISCORD_TOKEN);
console.log("TOKEN EXISTS:", !!config.DISCORD_TOKEN);
client.login(config.DISCORD_TOKEN);
