require("dotenv").config();
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const config = require("./config.js");
const messages = require("./messages1.js");
const qrCommand = require("./qr.js");
const { generateVietQR } = require("./vietqr.js");

// Khởi tạo Client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Quản lý cấu hình server
let guildSettings = {};

function loadSettings() {
  try {
    if (fs.existsSync(config.SETTINGS_FILE)) {
      const data = fs.readFileSync(config.SETTINGS_FILE, "utf8");
      guildSettings = JSON.parse(data);
      console.log("✅ Đã tải cấu hình từ", config.SETTINGS_FILE);
    } else {
      console.log("ℹ️ Chưa có file cài đặt, sẽ tạo mới khi có lệnh setup.");
    }
  } catch (error) {
    console.error("❌ Lỗi khi đọc file cài đặt:", error);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(
      config.SETTINGS_FILE,
      JSON.stringify(guildSettings, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("❌ Lỗi khi ghi file cài đặt:", error);
  }
}

// Kiểm tra và phục hồi trạng thái legit khi bot khởi động lại
async function checkAndRestoreLegitState() {
  for (const guildId in guildSettings) {
    const settings = guildSettings[guildId];
    if (!settings || !settings.legitChannelId) continue;

    try {
      const channel = await client.channels.fetch(settings.legitChannelId).catch(() => null);
      if (!channel) continue;

      const messagesInChannel = await channel.messages.fetch({ limit: 2 }).catch(() => null);
      if (!messagesInChannel) continue;

      const lastMessage = messagesInChannel.first();
      if (!lastMessage || lastMessage.author.bot) continue;

      const matchedPrefix = messages.legitCheck.triggerPrefix.find((prefix) =>
        lastMessage.content.toLowerCase().startsWith(prefix.toLowerCase()),
      );

      if (matchedPrefix) {
        const productName = lastMessage.content.substring(matchedPrefix.length).trim();
        if (!productName) continue;

        const secondLastMessage = messagesInChannel.last();
        if (!secondLastMessage || secondLastMessage.id !== settings.lastLegitEmbedId) {
          console.log(`[PHỤC HỒI] Xử lý lại tin nhắn legit chưa phản hồi trong kênh ${channel.name}`);
          await handleLegitMessage(lastMessage);
        }
      }
    } catch (error) {
      console.error(`❌ Lỗi khi phục hồi legit cho server ${guildId}:`, error);
    }
  }
}

// Hàm gửi Bảng Giá chung
async function sendPriceList(interactionOrMessage) {
  const mainData = messages.mainPriceList;
  const mainEmbed = new EmbedBuilder()
    .setTitle(mainData.title)
    .setDescription(mainData.description)
    .setColor(mainData.color)
    .setThumbnail(mainData.thumbnailUrl || config.BANK_INFO.logoUrl)
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

// Xử lý tin nhắn legit
async function handleLegitMessage(message) {
  const guildId = message.guild.id;
  if (!guildSettings[guildId]) {
    guildSettings[guildId] = { legitChannelId: message.channel.id };
  }
  const settings = guildSettings[guildId];

  try {
    // 1. Xóa embed legit cũ để kênh luôn sạch sẽ
    if (settings.lastLegitEmbedId) {
      const oldMessage = await message.channel.messages
        .fetch(settings.lastLegitEmbedId)
        .catch(() => null);
      if (oldMessage) {
        await oldMessage.delete().catch(() => {});
      }
    }

    // 2. Thả từng reaction emoji riêng rẽ
    for (const reaction of messages.legitCheck.reactions) {
      await message.react(reaction).catch(() => {});
    }

    // 3. Tăng bộ đếm đơn hàng legit
    settings.legitCount = (settings.legitCount || 0) + 1;

    // 4. Tạo embed cảm ơn với tên sản phẩm thực tế và số thứ tự đơn
    const embedData = messages.legitCheck.embed;
    const embed = new EmbedBuilder()
      .setTitle(embedData.title)
      .setDescription(embedData.description(message.content, settings.legitCount))
      .setColor(embedData.color)
      .setImage(embedData.gifUrl)
      .setThumbnail(config.BANK_INFO.logoUrl)
      .setTimestamp();

    const newEmbedMessage = await message.channel.send({ embeds: [embed] });

    settings.lastLegitEmbedId = newEmbedMessage.id;
    saveSettings();
  } catch (error) {
    console.error("❌ Lỗi khi xử lý tin nhắn legit:", error);
  }
}

// Khi bot sẵn sàng
client.once("ready", async () => {
  loadSettings();
  console.log(`🚀 Bot đã online thành công: ${client.user.tag}`);
  await checkAndRestoreLegitState();
});

// Bộ lắng nghe tương tác (Interactions)
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. Xử lý Slash Commands
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;
      const isOwner = interaction.user.id === config.OWNER_ID;
      const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator);

      // Lệnh xem bảng giá
      if (commandName === "banggia") {
        return await sendPriceList(interaction);
      }

      // Lệnh gửi mã VietQR
      if (commandName === "qr") {
        return await qrCommand.execute(interaction);
      }

      // Lệnh xem thống kê legit
      if (commandName === "legit-stats") {
        const count = guildSettings[interaction.guild.id]?.legitCount || 0;
        return await interaction.reply({
          content: `📊 **Thống Kê Shark Store:** Hiện tại shop đã hoàn thành **${count}** đơn hàng legit uy tín! 🎉`,
          ephemeral: true,
        });
      }

      // Lệnh cài đặt số lượng đơn hàng legit (Admin / Owner)
      if (commandName === "set-legit-count") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này.",
            ephemeral: true,
          });
        }

        const count = interaction.options.getInteger("soluong");
        const guildId = interaction.guild.id;
        if (!guildSettings[guildId]) {
          guildSettings[guildId] = {};
        }
        guildSettings[guildId].legitCount = count;
        saveSettings();

        return await interaction.reply({
          content: `✅ Đã thiết lập số đơn legit hiện tại thành **${count}**. Đơn legit kế tiếp sẽ tự động tăng lên **#${count + 1}**! 🎉`,
          ephemeral: true,
        });
      }

      // Lệnh tạo bảng Ticket (Admin / Owner)
      if (commandName === "ticket") {
        if (!isOwner && !isAdmin) {
          return await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này.",
            ephemeral: true,
          });
        }

        const embed = new EmbedBuilder()
          .setColor("#00bfff")
          .setTitle("Shark Store - Trung Tâm Hỗ Trợ & Mua Hàng")
          .setDescription(
            `
<a:kingscrown:1116681967505784862> **Nhấn vào nút bên dưới để tạo Ticket** <a:kingscrown:1116681967505784862>
<a:heartCopy:1110555799777972226> **Vui lòng không spam ticket để được hỗ trợ nhanh nhất** <a:heartCopy:1110555799777972226>

> <a:bongocat:1110555770346545173> **Xem Bảng Giá:** Dùng lệnh \`/banggia\` hoặc gõ \`.banggia\`
> <a:pin1999:1116682907675799573> **Điều khoản mua hàng:** Cam kết uy tín, hỗ trợ bảo hành trọn đời đơn hàng.
`,
          )
          .setImage(
            "https://media.discordapp.net/attachments/1160008472893603871/1512111182713065472/endd.png?format=webp&quality=lossless&width=1860&height=283",
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("buy_ticket")
            .setLabel("Mua Hàng")
            .setEmoji("<:4439star9:1512142545419899070>")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("support_ticket")
            .setLabel("Hỗ Trợ")
            .setEmoji("<:7899shinystar1:1512142913428258867>")
            .setStyle(ButtonStyle.Primary),
        );

        return await interaction.reply({
          embeds: [embed],
          components: [row],
        });
      }

      // Lệnh cài đặt kênh legit (Admin)
      if (commandName === "setup-legit") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({
            content: messages.setupLegit.noPermission,
            ephemeral: true,
          });
        }

        const channel = interaction.options.getChannel("channel");
        const guildId = interaction.guild.id;

        if (!guildSettings[guildId]) {
          guildSettings[guildId] = {};
        }
        guildSettings[guildId].legitChannelId = channel.id;
        guildSettings[guildId].lastLegitEmbedId = null;

        await interaction.reply({
          content: messages.setupLegit.success(channel),
          ephemeral: true,
        });

        try {
          const embedData = messages.legitCheck.embed;
          const sampleEmbed = new EmbedBuilder()
            .setTitle(embedData.title)
            .setDescription(
              embedData.description("+1 legit Nitro Boost 1 Tháng (Mẫu)", guildSettings[guildId].legitCount || 1),
            )
            .setColor(embedData.color)
            .setImage(embedData.gifUrl);

          const sentMessage = await channel.send({ embeds: [sampleEmbed] });
          guildSettings[guildId].lastLegitEmbedId = sentMessage.id;
          saveSettings();
        } catch (err) {
          console.error(`Không thể gửi tin nhắn mẫu vào ${channel.name}:`, err);
        }
      }
    }

    // 2. Xử lý Nút Bấm (Button)
    if (interaction.isButton()) {
      const { customId } = interaction;

      // Nút mở Modal Mua Hàng / Hỗ Trợ
      if (customId === "buy_ticket" || customId === "support_ticket") {
        const isBuy = customId === "buy_ticket";
        const modal = new ModalBuilder()
          .setCustomId(customId)
          .setTitle(isBuy ? "🛒 Tạo Ticket Mua Hàng" : "💬 Tạo Ticket Hỗ Trợ");

        const productInput = new TextInputBuilder()
          .setCustomId("product")
          .setLabel(isBuy ? "Sản phẩm bạn muốn mua:" : "Vấn đề bạn cần hỗ trợ:")
          .setPlaceholder(isBuy ? "VD: Nitro Boost 1 Năm, Canva Pro..." : "Mô tả ngắn gọn vấn đề...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const noteInput = new TextInputBuilder()
          .setCustomId("note")
          .setLabel("Ghi chú bổ sung (tuỳ chọn):")
          .setPlaceholder("VD: Thời gian online, yêu cầu thêm...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(productInput),
          new ActionRowBuilder().addComponents(noteInput),
        );

        return await interaction.showModal(modal);
      }

      // Nút Yêu Cầu Đóng Ticket -> Hiện xác nhận an toàn
      if (customId === "close_ticket") {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_close_ticket")
            .setLabel("Xác Nhận Đóng")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cancel_close_ticket")
            .setLabel("Hủy Bỏ")
            .setStyle(ButtonStyle.Secondary),
        );

        return await interaction.reply({
          content: "⚠️ **Bạn có chắc chắn muốn đóng ticket này không?** Sau khi đóng, kênh chat sẽ bị xóa vĩnh viễn.",
          components: [confirmRow],
          ephemeral: false,
        });
      }

      // Nút Xác Nhận Đóng Ticket
      if (customId === "confirm_close_ticket") {
        await interaction.reply({
          content: "🔒 **Ticket sẽ được đóng và xoá sau 3 giây...**",
        });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 3000);
        return;
      }

      // Nút Hủy Bỏ Đóng Ticket
      if (customId === "cancel_close_ticket") {
        await interaction.message.delete().catch(() => {});
        return await interaction.reply({
          content: "✅ Đã hủy thao tác đóng ticket.",
          ephemeral: true,
        });
      }

      // Nút Nhân Viên Nhận Hỗ Trợ Ticket (Claim Ticket)
      if (customId === "claim_ticket") {
        const isStaff =
          interaction.member.roles.cache.has(config.STAFF_ROLE_ID) ||
          interaction.user.id === config.OWNER_ID ||
          interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff) {
          return await interaction.reply({
            content: "❌ Chỉ nhân viên hỗ trợ mới có thể nhận ticket!",
            ephemeral: true,
          });
        }

        const claimedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ticket_claimed")
            .setLabel(`Phụ trách bởi: ${interaction.user.username}`)
            .setEmoji("👨‍💻")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Đóng Ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),
        );

        await interaction.update({ components: [claimedRow] });
        return await interaction.followUp({
          content: `🎯 **${interaction.user}** đã nhận phụ trách xử lý ticket này!`,
        });
      }
    }

    // 3. Xử lý Form Modal Submit (Tạo kênh Ticket mới)
    if (interaction.isModalSubmit()) {
      if (
        interaction.customId !== "buy_ticket" &&
        interaction.customId !== "support_ticket"
      ) {
        return;
      }

      const product = interaction.fields.getTextInputValue("product");
      const note = interaction.fields.getTextInputValue("note") || "Không có";
      const isBuy = interaction.customId === "buy_ticket";

      const username = interaction.user.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-");

      // Kiểm tra xem người dùng đã mở ticket chưa
      const existingTicket = interaction.guild.channels.cache.find(
        (c) => c.name === `ticket-${username}`,
      );

      if (existingTicket) {
        return await interaction.reply({
          content: `❌ Bạn đang có ticket đang mở: ${existingTicket}. Vui lòng xử lý xong ticket cũ trước nhé!`,
          ephemeral: true,
        });
      }

      // Tạo channel ticket trong category
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${username}`,
        type: ChannelType.GuildText,
        parent: config.TICKET_CATEGORY_ID,
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
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: config.STAFF_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      const ticketCode = Math.floor(100000 + Math.random() * 900000);
      const ticketMemo = `SHARK ${ticketCode}`;

      // Hàng nút tương tác trong ticket
      const ticketActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Nhận Hỗ Trợ")
          .setEmoji("✋")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Đóng Ticket")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger),
      );

      // Embed thông tin Ticket
      const ticketEmbed = new EmbedBuilder()
        .setColor(isBuy ? "#00FF99" : "#00BFFF")
        .setTitle(
          `<a:39411brownbow:1515288160727339028> SHARK STORE - ${isBuy ? "ĐƠN MUA HÀNG" : "YÊU CẦU HỖ TRỢ"}`,
        )
        .setThumbnail(config.BANK_INFO.logoUrl)
        .setDescription(
          `
╭───────────────╮
<a:7922_Letter_S:1515219656627982346> **Khách Hàng:** ${interaction.user}
<a:6869_Letter_H:1515219767944941769> **Mã Ticket:** \`${ticketCode}\`
<a:3469_Letter_A:1515219634255565002> **Loại:** \`${isBuy ? "Mua Hàng" : "Hỗ Trợ"}\`
<a:6939_Letter_R:1515212884517326849> **Nội Dung:** ${product}
<a:1216_Letter_K:1515219687779078266> **Ghi Chú:** ${note}
╰───────────────╯
`,
        )
        .setFooter({ text: "Nhân viên Shark Store sẽ hỗ trợ bạn ngay trong giây lát!" })
        .setTimestamp();

      const embedsToSend = [ticketEmbed];

      // Nếu là đơn mua hàng -> Tự động sinh VietQR kèm mã Ticket
      if (isBuy) {
        const qrUrl = generateVietQR({ memo: ticketMemo });
        const qrEmbed = new EmbedBuilder()
          .setTitle("💳 THANH TOÁN CHUYỂN KHOẢN")
          .setColor("#008cff")
          .setDescription(
            `
> **Ngân Hàng:** \`${config.BANK_INFO.bankName}\`
> **Số Tài Khoản:** \`${config.BANK_INFO.accountNo}\`
> **Chủ Tài Khoản:** \`${config.BANK_INFO.accountName}\`
> **Nội Dung Chuyển Khoản:** \`${ticketMemo}\`

*Vui lòng quét mã VietQR bên dưới hoặc gửi ảnh bill vào ticket sau khi chuyển khoản thành công!*
`,
          )
          .setImage(qrUrl);

        embedsToSend.push(qrEmbed);
      }

      await ticketChannel.send({
        content: `${interaction.user} | <@&${config.STAFF_ROLE_ID}>`,
        embeds: embedsToSend,
        components: [ticketActionRow],
      });

      return await interaction.reply({
        content: `<:6336bunnycomet:1512142819140173976> Ticket của bạn đã được tạo tại: ${ticketChannel}`,
        ephemeral: true,
      });
    }

    // 4. Xử lý Menu Chọn Bảng Giá
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

          return await interaction.reply({
            embeds: [categoryEmbed],
            ephemeral: true,
          });
        }
      }
    }
  } catch (error) {
    console.error("❌ Lỗi trong interactionCreate:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "⚠️ Đã xảy ra lỗi khi xử lý thao tác này.",
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "⚠️ Đã xảy ra lỗi khi xử lý thao tác này.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

// Lắng nghe sự kiện tin nhắn (Prefix & Kênh Legit)
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const settings = guildSettings[message.guild.id];

  // 1. Kiểm tra tin nhắn trong kênh Legit
  if (settings && message.channel.id === settings.legitChannelId) {
    const triggerPrefixes = messages.legitCheck.triggerPrefix;
    const lowerContent = message.content.toLowerCase().trim();

    const matchedPrefix = triggerPrefixes.find((prefix) =>
      lowerContent.startsWith(prefix.toLowerCase()),
    );

    const isCorrectFormat =
      matchedPrefix &&
      message.content.substring(matchedPrefix.length).trim().length > 0;

    const isAttempt =
      lowerContent.includes("legit") || lowerContent.includes("legi");

    if (isCorrectFormat) {
      await handleLegitMessage(message);
    } else if (isAttempt) {
      try {
        const reply = await message.reply(
          messages.legitCheck.wrongFormatReminder(),
        );
        setTimeout(() => {
          reply.delete().catch(() => {});
          message.delete().catch(() => {});
        }, 10000);
      } catch (err) {
        console.error("❌ Lỗi khi gửi lời nhắc sai cú pháp legit:", err);
      }
    }
    return;
  }

  // 2. Lệnh tiền tố (Prefix: .)
  const prefix = ".";
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (commandName === "banggia") {
      await sendPriceList(message);
    }
  }
});

// Khởi chạy bot
client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error("❌ Không thể đăng nhập bot. Vui lòng kiểm tra lại DISCORD_TOKEN:", err);
});

// Web server mini để Render nhận diện port và giữ bot sống 24/24
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("🦈 Shark Store Discord Bot is Running 24/7!");
}).listen(PORT, () => {
  console.log(`🌐 Web server giữ kết nối đang chạy trên port ${PORT}`);
});

