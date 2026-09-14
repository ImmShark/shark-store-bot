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
    } else if (fs.existsSync(config.DEFAULT_SETTINGS_FILE)) {
      const data = fs.readFileSync(config.DEFAULT_SETTINGS_FILE, "utf8");
      guildSettings = JSON.parse(data);
      saveSettings();
      console.log("✅ Đã khởi tạo cấu hình Volume từ file mặc định.");
    } else {
      console.log("ℹ️ Chưa có file cài đặt, sẽ tạo mới khi có lệnh setup.");
    }
  } catch (error) {
    console.error("❌ Lỗi khi đọc file cài đặt:", error);
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(require("path").dirname(config.SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(
      config.SETTINGS_FILE,
      JSON.stringify(guildSettings, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("❌ Lỗi khi ghi file cài đặt:", error);
  }
}

function getGuildTicketStore(guildId) {
  if (!guildSettings[guildId]) guildSettings[guildId] = {};
  if (!guildSettings[guildId].tickets) guildSettings[guildId].tickets = {};
  return guildSettings[guildId].tickets;
}

async function closeTicket(channel, guildId, reason) {
  await channel.delete(reason);
  if (guildSettings[guildId]?.tickets) {
    delete guildSettings[guildId].tickets[channel.id];
    saveSettings();
  }
}

async function closeInactiveTickets() {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const [guildId, settings] of Object.entries(guildSettings)) {
    for (const [channelId, ticket] of Object.entries(settings.tickets || {})) {
      if (ticket.lastActivityAt > cutoff) continue;
      const guild = client.guilds.cache.get(guildId);
      const channel = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
      if (!channel?.isTextBased()) {
        delete settings.tickets[channelId];
        saveSettings();
        continue;
      }
      try {
        await closeTicket(channel, guildId, "Tự động đóng sau 2 ngày không hoạt động");
      } catch (error) {
        console.error(`Không thể tự đóng ticket ${channelId}:`, error);
      }
    }
  }
}

// Bố cục theo yêu cầu của Shark Store. Chỉ đổi tên kênh text hiện có để
// giữ nguyên tin nhắn, quyền và cấu hình của từng kênh.
const TEXT_CHANNEL_RENAMES = [
  { names: ["luat-shop", "luat shop"], target: "📕・Luật-Shop" },
  { names: ["thong-bao", "thông-báo", "thong bao"], target: "📢・Thông-báo" },
  { names: ["bang-gia", "bảng-giá", "bang gia"], target: "🛒・Bảng-Giá" },
  {
    names: ["ticket-mua-hang", "ticket mua hang", "ticket-muahàng"],
    target: "🎫・Ticket-Mua-Hàng",
  },
  { names: ["legit"], target: "🌸・Legit" },
  { names: ["stock"], target: "📦・Stock" },
  { names: ["chat-chung", "chat chung"], target: "💬・CHAT-CHUNG" },
  { names: ["bot"], target: "🎧・BOT" },
];

const VOICE_CHANNELS = [
  { name: "📞・Phòng Chờ Hỗ Trợ", limit: 2 },
  { name: "🔴・Sảnh Chém Gió 1", limit: 0 },
  { name: "🔴・Sảnh Chém Gió 2", limit: 0 },
  { name: "🔒・Phòng Đôi 1", limit: 2 },
  { name: "🔒・Phòng Đôi 2", limit: 2 },
  { name: "👥・Phòng Nhóm", limit: 4 },
  { name: "🎵・Chill & Nghe Nhạc", limit: 0 },
  { name: "🛩️・Treo Máy AFK", limit: 0 },
];

const INTERNAL_CHANNEL_NAMES = [
  "thông-báo-nội-bộ",
  "thong-bao-noi-bo",
  "chat-crew",
  "mfk",
  "phòng-tuyển-dụng",
  "phong-tuyen-dung",
];

function normalizeChannelName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .replace(/[・_\s]+/g, "-")
    .toLowerCase();
}

function findTextChannelForRename(guild, candidates) {
  const normalizedCandidates = candidates.map(normalizeChannelName);
  return guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      normalizedCandidates.includes(normalizeChannelName(channel.name)),
  );
}

function getServerLayoutPlan(guild) {
  const renameActions = TEXT_CHANNEL_RENAMES.flatMap(({ names, target }) => {
    const channel = findTextChannelForRename(guild, names);
    return channel && channel.name !== target ? [{ channel, target }] : [];
  });
  const voiceActions = VOICE_CHANNELS.filter(
    ({ name }) =>
      !guild.channels.cache.some(
        (channel) => channel.type === ChannelType.GuildVoice && channel.name === name,
      ),
  );
  const deleteActions = guild.channels.cache.filter(
    (channel) =>
      INTERNAL_CHANNEL_NAMES.includes(normalizeChannelName(channel.name)) &&
      channel.type !== ChannelType.GuildCategory,
  );
  const workCategory = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory &&
      normalizeChannelName(channel.name) === "phong-lam-viec",
  );

  return { renameActions, voiceActions, deleteActions, workCategory };
}

function formatServerLayoutPlan(plan) {
  const lines = [];
  lines.push("**Đổi tên (giữ nguyên tin nhắn và quyền):**");
  lines.push(
    plan.renameActions.length
      ? plan.renameActions.map(({ channel, target }) => `• ${channel.name} → ${target}`).join("\n")
      : "• Không có",
  );
  lines.push("\n**Tạo voice channel:**");
  lines.push(
    plan.voiceActions.length
      ? plan.voiceActions.map(({ name, limit }) => `• ${name}${limit ? ` — giới hạn ${limit}` : ""}`).join("\n")
      : "• Không có",
  );
  lines.push("\n**Xóa vĩnh viễn:**");
  const deletions = plan.deleteActions.map((channel) => `• #${channel.name}`);
  if (plan.workCategory) deletions.push(`• Category ${plan.workCategory.name} (sau khi các kênh trên đã xóa)`);
  lines.push(deletions.length ? deletions.join("\n") : "• Không có");
  return lines.join("\n");
}

async function applyServerLayout(guild) {
  const plan = getServerLayoutPlan(guild);
  const completed = [];
  const problems = [];

  for (const { channel, target } of plan.renameActions) {
    try {
      await channel.setName(target, "Chuẩn hóa bố cục Shark Store");
      completed.push(`Đã đổi tên ${target}`);
    } catch (error) {
      problems.push(`Không thể đổi tên ${channel.name}: ${error.message}`);
    }
  }
  for (const { name, limit } of plan.voiceActions) {
    try {
      await guild.channels.create({ name, type: ChannelType.GuildVoice, userLimit: limit });
      completed.push(`Đã tạo ${name}`);
    } catch (error) {
      problems.push(`Không thể tạo ${name}: ${error.message}`);
    }
  }
  for (const channel of plan.deleteActions) {
    try {
      await channel.delete("Dọn khu vực nội bộ theo yêu cầu quản trị viên");
      completed.push(`Đã xóa #${channel.name}`);
    } catch (error) {
      problems.push(`Không thể xóa #${channel.name}: ${error.message}`);
    }
  }
  if (plan.workCategory) {
    const remainingChildren = guild.channels.cache.filter(
      (channel) => channel.parentId === plan.workCategory.id,
    );
    if (remainingChildren.size) {
      problems.push(`Chưa xóa category ${plan.workCategory.name} vì vẫn còn ${remainingChildren.size} kênh bên trong.`);
    } else {
      try {
        await plan.workCategory.delete("Dọn khu vực nội bộ theo yêu cầu quản trị viên");
        completed.push(`Đã xóa category ${plan.workCategory.name}`);
      } catch (error) {
        problems.push(`Không thể xóa category ${plan.workCategory.name}: ${error.message}`);
      }
    }
  }
  return { completed, problems };
}

// Kiểm tra và phục hồi trạng thái legit khi bot khởi động lại
async function checkAndRestoreLegitState() {
  for (const guildId in guildSettings) {
    const settings = guildSettings[guildId];
    if (!settings || !settings.legitChannelId) continue;

    try {
      const channel = await client.channels
        .fetch(settings.legitChannelId)
        .catch(() => null);
      if (!channel) continue;

      const messagesInChannel = await channel.messages
        .fetch({ limit: 2 })
        .catch(() => null);
      if (!messagesInChannel) continue;

      const lastMessage = messagesInChannel.first();
      if (!lastMessage || lastMessage.author.bot) continue;

      const matchedPrefix = messages.legitCheck.triggerPrefix.find((prefix) =>
        lastMessage.content.toLowerCase().startsWith(prefix.toLowerCase()),
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
            `[PHỤC HỒI] Xử lý lại tin nhắn legit chưa phản hồi trong kênh ${channel.name}`,
          );
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

function getPriceFields(guildId, category) {
  const overrides = guildSettings[guildId]?.priceOverrides?.[category.id] || {};
  return category.embed.fields.map((field, index) => {
    const price = overrides[index + 1];
    return price
      ? { ...field, value: `\`\`\`PRICE : ${price}\`\`\`` }
      : field;
  });
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
      .setDescription(
        embedData.description(message.content, settings.legitCount),
      )
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
  await closeInactiveTickets();
  setInterval(closeInactiveTickets, 60 * 60 * 1000).unref();
});

// Bộ lắng nghe tương tác (Interactions)
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. Xử lý Slash Commands
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;
      const isOwner = interaction.user.id === config.OWNER_ID;
      const isAdmin = interaction.member?.permissions.has(
        PermissionFlagsBits.Administrator,
      );

      // Lệnh xem bảng giá
      if (commandName === "banggia") {
        return await sendPriceList(interaction);
      }

      // Lệnh gửi mã VietQR
      if (commandName === "qr") {
        return await qrCommand.execute(interaction);
      }

      // Xem trước bố cục server. Các thao tác xóa chỉ xuất hiện sau khi admin
      // bấm nút xác nhận trong phản hồi riêng tư này.
      if (commandName === "setup-server") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này.",
            ephemeral: true,
          });
        }

        const plan = getServerLayoutPlan(interaction.guild);
        const confirmationRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_server_layout")
            .setLabel("Xác nhận áp dụng")
            .setEmoji("⚠️")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cancel_server_layout")
            .setLabel("Hủy")
            .setStyle(ButtonStyle.Secondary),
        );

        return await interaction.reply({
          content: `## Xem trước bố cục server\n${formatServerLayoutPlan(plan)}\n\n⚠️ Mục **Xóa vĩnh viễn** sẽ chỉ được thực hiện khi bạn bấm **Xác nhận áp dụng**.`,
          components: [confirmationRow],
          ephemeral: true,
        });
      }

      if (commandName === "set-revenue") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }
        if (!guildSettings[interaction.guild.id]) guildSettings[interaction.guild.id] = {};
        const amount = interaction.options.getInteger("amount");
        guildSettings[interaction.guild.id].revenue = amount;
        saveSettings();
        return await interaction.reply({
          content: `✅ Dashboard đã cập nhật tổng doanh thu: **${amount.toLocaleString("vi-VN")} VNĐ**.`,
          ephemeral: true,
        });
      }

      if (commandName === "set-price") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }
        const categoryId = interaction.options.getString("category");
        const item = interaction.options.getInteger("item");
        const price = interaction.options.getString("price");
        const category = messages.priceCategories.find((entry) => entry.id === categoryId);
        if (!category || !category.embed.fields[item - 1]) {
          const ids = messages.priceCategories.map((entry) => `\`${entry.id}\``).join(", ");
          return await interaction.reply({
            content: `❌ Category hoặc dòng giá không hợp lệ. Category có thể dùng: ${ids}`,
            ephemeral: true,
          });
        }
        if (!guildSettings[interaction.guild.id]) guildSettings[interaction.guild.id] = {};
        const settings = guildSettings[interaction.guild.id];
        if (!settings.priceOverrides) settings.priceOverrides = {};
        if (!settings.priceOverrides[categoryId]) settings.priceOverrides[categoryId] = {};
        settings.priceOverrides[categoryId][item] = price;
        saveSettings();
        return await interaction.reply({
          content: `✅ Đã đổi giá dòng **${item}** của **${category.label}** thành **${price}**.`,
          ephemeral: true,
        });
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

      // Lệnh thiết lập Cổng Xác Minh (Admin / Owner)
      if (commandName === "setup-verify") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này.",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });

        // 1. Tìm hoặc tạo role "Khách Hàng"
        let role = interaction.options.getRole("role");
        if (!role) {
          role = interaction.guild.roles.cache.find(
            (r) =>
              r.name.toLowerCase() === "khách hàng" ||
              r.name.toLowerCase() === "khach hang",
          );
        }

        if (!role) {
          try {
            role = await interaction.guild.roles.create({
              name: "Khách Hàng",
              color: "#00BFFF",
              reason: "Role tự động tạo bởi Shark Store Bot cho Cổng Xác Minh",
            });
          } catch (err) {
            console.error("Lỗi khi tạo role:", err);
            return await interaction.editReply({
              content:
                "❌ Không thể tạo role Khách Hàng. Vui lòng kiểm tra quyền của Bot.",
            });
          }
        }

        // Lưu role verify vào guild settings
        const guildId = interaction.guild.id;
        if (!guildSettings[guildId]) guildSettings[guildId] = {};
        guildSettings[guildId].verifyRoleId = role.id;
        saveSettings();

        // 2. Tìm hoặc tạo kênh text xác minh
        let verifyChannel = interaction.guild.channels.cache.find(
          (c) =>
            c.name.includes("xác-minh") ||
            c.name.includes("xac-minh") ||
            c.name.includes("verify"),
        );

        if (!verifyChannel) {
          try {
            verifyChannel = await interaction.guild.channels.create({
              name: "🔒・xác-minh",
              type: ChannelType.GuildText,
              permissionOverwrites: [
                {
                  id: interaction.guild.id, // @everyone
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ReadMessageHistory,
                  ],
                  deny: [
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AddReactions,
                  ],
                },
                {
                  id: role.id, // Đã có role Khách Hàng -> Ẩn kênh xác minh
                  deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                  id: client.user.id, // Bot
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.ManageChannels,
                  ],
                },
              ],
            });
          } catch (err) {
            console.error("Lỗi khi tạo kênh xác minh:", err);
            return await interaction.editReply({
              content:
                "❌ Không thể tạo kênh xác minh. Vui lòng kiểm tra quyền của Bot.",
            });
          }
        }

        // 3. Gửi Embed và Nút Bấm Verify vào kênh
        const verifyEmbed = new EmbedBuilder()
          .setColor("#00FF99")
          .setTitle("🛡️ CỔNG XÁC MINH THÀNH VIÊN • SHARK STORE")
          .setThumbnail(config.BANK_INFO.logoUrl)
          .setDescription(
            `
<a:kingscrown:1116681967505784862> Chào mừng bạn đã đến với **Shark Store**! 🦈

Để mở khóa các kênh **Bảng Giá**, **Mua Hàng / Ticket** và **Giao Lưu**, vui lòng nhấn vào nút bên dưới để xác minh tài khoản của bạn.

> ⚠️ *Việc xác minh giúp bảo vệ cộng đồng và ngăn chặn tài khoản spam/clone.*
`,
          )
          .setImage(
            "https://media.discordapp.net/attachments/1160008472893603871/1512111182713065472/endd.png?format=webp&quality=lossless&width=1860&height=283",
          )
          .setFooter({
            text: "Shark Store • Nhấn nút bên dưới để hoàn tất xác minh",
          });

        const verifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("verify_member_btn")
            .setLabel("Xác Minh Ngay")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        );

        await verifyChannel.send({
          embeds: [verifyEmbed],
          components: [verifyRow],
        });

        return await interaction.editReply({
          content: `✅ Đã thiết lập Cổng Xác Minh thành công!\n• Kênh xác minh: ${verifyChannel}\n• Role cấp sau khi xác minh: ${role}\n\n⚠️ **Lưu ý:** Bạn hãy vào **Cài đặt máy chủ > Vai trò** và kéo Role của Bot (Shark Store) lên **cao hơn** Role **${role.name}** để bot có quyền phát role nhé!`,
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
              embedData.description(
                "+1 legit Nitro Boost 1 Tháng (Mẫu)",
                guildSettings[guildId].legitCount || 1,
              ),
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

      if (customId === "cancel_server_layout") {
        return await interaction.update({
          content: "✅ Đã hủy. Server chưa bị thay đổi.",
          components: [],
        });
      }

      if (customId === "confirm_server_layout") {
        const isOwner = interaction.user.id === config.OWNER_ID;
        const isAdmin = interaction.member?.permissions.has(
          PermissionFlagsBits.Administrator,
        );
        if (!isAdmin && !isOwner) {
          return await interaction.reply({
            content: "❌ Bạn không có quyền áp dụng bố cục server.",
            ephemeral: true,
          });
        }

        await interaction.update({
          content: "⏳ Đang áp dụng bố cục server…",
          components: [],
        });
        const result = await applyServerLayout(interaction.guild);
        const completed = result.completed.length
          ? result.completed.map((item) => `✅ ${item}`).join("\n")
          : "ℹ️ Không có thay đổi nào cần áp dụng.";
        const problems = result.problems.length
          ? `\n\n**Cần xử lý:**\n${result.problems.map((item) => `⚠️ ${item}`).join("\n")}`
          : "";
        return await interaction.editReply({
          content: `## Hoàn tất thiết lập server\n${completed}${problems}`,
          components: [],
        });
      }

      // Nút mở Modal Mua Hàng / Hỗ Trợ
      if (customId === "buy_ticket" || customId === "support_ticket") {
        const isBuy = customId === "buy_ticket";
        const modal = new ModalBuilder()
          .setCustomId(customId)
          .setTitle(isBuy ? "🛒 Tạo Ticket Mua Hàng" : "💬 Tạo Ticket Hỗ Trợ");

        const productInput = new TextInputBuilder()
          .setCustomId("product")
          .setLabel(isBuy ? "Sản phẩm bạn muốn mua:" : "Vấn đề bạn cần hỗ trợ:")
          .setPlaceholder(
            isBuy
              ? "VD: Nitro Boost 1 Năm, Canva Pro..."
              : "Mô tả ngắn gọn vấn đề...",
          )
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
          content:
            "⚠️ **Bạn có chắc chắn muốn đóng ticket này không?** Sau khi đóng, kênh chat sẽ bị xóa vĩnh viễn.",
          components: [confirmRow],
          ephemeral: false,
        });
      }

      // Nút Xác Nhận Đóng Ticket
      if (customId === "confirm_close_ticket") {
        await interaction.reply({
          content: "🔒 Đang đóng ticket…",
        });
        await closeTicket(
          interaction.channel,
          interaction.guild.id,
          `Đóng thủ công bởi ${interaction.user.tag}`,
        );
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

      // Nút Xác Minh Thành Viên (Verify Member)
      if (customId === "verify_member_btn") {
        const guild = interaction.guild;
        const guildId = guild.id;
        const rolesToGive = [];

        // 1. Tìm Role Khách Hàng
        let role1 = guildSettings[guildId]?.verifyRoleId
          ? guild.roles.cache.get(guildSettings[guildId].verifyRoleId)
          : null;

        if (!role1) {
          role1 = guild.roles.cache.find(
            (r) =>
              r.name.toLowerCase() === "khách hàng" ||
              r.name.toLowerCase() === "khach hang",
          );
        }
        if (role1) rolesToGive.push(role1);

        // 2. Tìm Role IN4 (══✿══╡°˖✧ 𝐈𝐍𝟒 ✧˖°╞══✿══)
        const role2 = guild.roles.cache.find(
          (r) =>
            r.name === "══✿══╡°˖✧ 𝐈𝐍𝟒 ✧˖°╞══✿══" ||
            r.name.includes("𝐈𝐍𝟒") ||
            r.name.includes("IN4"),
        );
        if (role2) rolesToGive.push(role2);

        if (rolesToGive.length === 0) {
          return await interaction.reply({
            content: "⚠️ Không tìm thấy Role cần cấp. Vui lòng liên hệ Admin!",
            ephemeral: true,
          });
        }

        // Kiểm tra xem thành viên đã có đủ các role chưa
        const hasAllRoles = rolesToGive.every((r) =>
          interaction.member.roles.cache.has(r.id),
        );

        if (hasAllRoles) {
          return await interaction.reply({
            content:
              "ℹ️ Bạn đã xác minh tài khoản rồi! Không cần bấm lại nữa nhé.",
            ephemeral: true,
          });
        }

        try {
          await interaction.member.roles.add(rolesToGive);
          const roleNames = rolesToGive
            .map((r) => `**${r.name}**`)
            .join(" và ");
          const welcomeChannel =
            guild.systemChannel ||
            guild.channels.cache.find(
              (channel) =>
                channel.type === ChannelType.GuildText &&
                normalizeChannelName(channel.name) === "chat-chung",
            );
          await welcomeChannel
            ?.send(`🎉 Chào mừng ${interaction.user} đến với **Shark Store**! Xem **Bảng Giá** hoặc tạo **Ticket Mua Hàng** khi bạn cần hỗ trợ.`)
            .catch(() => {});
          return await interaction.reply({
            content: `🎉 **Xác minh thành công!**\nBạn đã nhận được role ${roleNames} và toàn bộ kênh của **Shark Store** đã được mở ra.\nChúc bạn có trải nghiệm mua sắm tuyệt vời! 🦈`,
            ephemeral: true,
          });
        } catch (err) {
          console.error("Lỗi khi cấp role xác minh:", err);
          return await interaction.reply({
            content:
              "❌ Bot không đủ quyền cấp role. Vui lòng báo Admin kéo Role của Bot (Shark Store) lên cao hơn các Role này!",
            ephemeral: true,
          });
        }
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
      getGuildTicketStore(interaction.guild.id)[ticketChannel.id] = {
        userId: interaction.user.id,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        ticketCode,
        type: isBuy ? "buy" : "support",
      };
      saveSettings();

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
        .setFooter({
          text: "Nhân viên Shark Store sẽ hỗ trợ bạn ngay trong giây lát!",
        })
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
            .addFields(getPriceFields(interaction.guild.id, category));

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
      await interaction
        .followUp({
          content: "⚠️ Đã xảy ra lỗi khi xử lý thao tác này.",
          ephemeral: true,
        })
        .catch(() => {});
    } else {
      await interaction
        .reply({
          content: "⚠️ Đã xảy ra lỗi khi xử lý thao tác này.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
});

// Lắng nghe sự kiện tin nhắn (Prefix & Kênh Legit)
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const ticket = guildSettings[message.guild.id]?.tickets?.[message.channel.id];
  if (ticket) {
    ticket.lastActivityAt = Date.now();
    saveSettings();
  }

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

// Web server mini để Render nhận diện port và kiểm tra sức khỏe (Health check)
const http = require("http");
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  if (requestUrl.pathname === "/dashboard") {
    const dashboardToken = process.env.DASHBOARD_TOKEN;
    if (!dashboardToken || requestUrl.searchParams.get("token") !== dashboardToken) {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Unauthorized");
    }
    const cards = [...client.guilds.cache.values()]
      .map((guild) => {
        const settings = guildSettings[guild.id] || {};
        const openTickets = Object.keys(settings.tickets || {}).length;
        const revenue = Number(settings.revenue || 0).toLocaleString("vi-VN");
        return `<section><h2>${escapeHtml(guild.name)}</h2><div class="grid"><p><b>${openTickets}</b><span>ticket đang mở</span></p><p><b>${settings.legitCount || 0}</b><span>đơn legit</span></p><p><b>${revenue} VNĐ</b><span>doanh thu thủ công</span></p></div></section>`;
      })
      .join("");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shark Store Dashboard</title><style>body{font:16px system-ui;background:#101322;color:#eff2ff;max-width:1000px;margin:40px auto;padding:0 20px}section{background:#1b2035;border-radius:14px;padding:20px;margin:16px 0}.grid{display:flex;gap:16px;flex-wrap:wrap}.grid p{background:#252c48;border-radius:10px;padding:16px;min-width:160px}.grid b{font-size:24px;display:block}.grid span{color:#b9c2df}</style></head><body><h1>🦈 Shark Store Dashboard</h1><p>Cập nhật trực tiếp từ bot.</p>${cards || "<p>Bot chưa kết nối server nào.</p>"}</body></html>`);
  }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("🦈 Shark Store Discord Bot is Running 24/7!");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server giữ kết nối đang chạy tại 0.0.0.0:${PORT}`);
});

// Khởi chạy bot Discord
client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error(
    "❌ Không thể đăng nhập bot. Vui lòng kiểm tra lại DISCORD_TOKEN:",
    err,
  );
});
