require("dotenv").config({ quiet: true });
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
  AttachmentBuilder,
} = require("discord.js");

const config = require("./config.js");
const messages = require("./messages1.js");
const qrCommand = require("./qr.js");
const { generateVietQR } = require("./vietqr.js");
const branding = require("./branding.js");
const { commands } = require("./commands.js");

// Khởi tạo Client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Bắt buộc để bot nhận sự kiện thành viên mới (welcome).
    // Phải bật "SERVER MEMBERS INTENT" trong Discord Developer Portal, xem CAP-NHAT.md.
    GatewayIntentBits.GuildMembers,
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

// Ghi file cài đặt diễn ra nhiều lần trong một lượt chạy (ví dụ cập nhật
// lastActivityAt mỗi tin nhắn trong ticket), nên ghép các lần ghi lại thành
// một lần sau 15 giây để đỡ tốn I/O. Mọi thay đổi quan trọng vẫn dùng
// saveSettings() ghi ngay lập tức.
let saveScheduled = false;
function saveSettingsSoon() {
  if (saveScheduled) return;
  saveScheduled = true;
  const timer = setTimeout(() => {
    saveScheduled = false;
    saveSettings();
  }, 15 * 1000);
  timer.unref?.();
}

process.on("exit", () => {
  if (saveScheduled) saveSettings();
});

function getGuildTicketStore(guildId) {
  if (!guildSettings[guildId]) guildSettings[guildId] = {};
  if (!guildSettings[guildId].tickets) guildSettings[guildId].tickets = {};
  return guildSettings[guildId].tickets;
}

// Lưu nội dung ticket thành file .txt gửi vào kênh log (nếu đã setup).
async function sendTicketTranscript(channel, ticket, reason) {
  try {
    const guildId = channel.guild?.id;
    const logChannelId = guildSettings[guildId]?.transcriptChannelId;
    if (!logChannelId) return;

    const logChannel =
      client.channels.cache.get(logChannelId) ||
      (await client.channels.fetch(logChannelId).catch(() => null));
    if (!logChannel?.isTextBased()) return;

    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched) return;

    const lines = [...fetched.values()]
      .reverse()
      .map(
        (msg) =>
          `[${msg.createdAt.toLocaleString("vi-VN")}] ${msg.author.tag}: ${msg.content}` +
          (msg.attachments.size
            ? `\n    📎 ${[...msg.attachments.values()].map((a) => a.url).join(" | ")}`
            : ""),
      );

    const content = [
      `TICKET: #${ticket?.ticketCode || channel.name}`,
      `Loại: ${ticket?.type === "support" ? "Hỗ Trợ" : ticket?.type === "buy" ? "Mua Hàng" : "Không rõ"}`,
      `Khách hàng ID: ${ticket?.userId || "Không rõ"}`,
      `Tạo lúc: ${ticket?.createdAt ? new Date(ticket.createdAt).toLocaleString("vi-VN") : "Không rõ"}`,
      `Đóng vì: ${reason}`,
      `Số tin nhắn đã lưu: ${lines.length}`,
      "─".repeat(50),
      ...lines,
    ].join("\n");

    const fileName = `ticket-${ticket?.ticketCode || channel.id}.txt`;
    const file = new AttachmentBuilder(Buffer.from(content, "utf8"), {
      name: fileName,
    });

    const embed = new EmbedBuilder()
      .setColor("#ed4245")
      .setTitle("🎫 TICKET ĐÃ ĐÓNG — LƯU TRỮ LẠI")
      .setThumbnail(branding.logo)
      .addFields(
        { name: "Mã Ticket", value: `\`${ticket?.ticketCode || "N/A"}\``, inline: true },
        { name: "Loại", value: ticket?.type === "buy" ? "Mua Hàng" : "Hỗ Trợ", inline: true },
        { name: "Lý do đóng", value: reason.slice(0, 1024) || "N/A" },
      )
      .setTimestamp();

    await logChannel.send({
      embeds: [embed],
      files: [...branding.collectFiles("logo"), file],
    });
  } catch (error) {
    console.error("❌ Lỗi khi tạo transcript ticket:", error);
  }
}

async function closeTicket(channel, guildId, reason) {
  const ticket = guildSettings[guildId]?.tickets?.[channel.id];
  await sendTicketTranscript(channel, ticket, reason);
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

// Quản lý trạng thái chống xử lý trùng lặp (Idempotency & Debounce)
const processedLegitMessageIds = new Set();
const lastPriceListSent = new Map(); // key -> timestamp

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

      // Chống xử lý trùng lặp nếu tin nhắn này đã được đếm/trả lời
      if (
        settings.lastProcessedLegitMsgId === lastMessage.id ||
        processedLegitMessageIds.has(lastMessage.id)
      ) {
        continue;
      }

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
  const channelId =
    interactionOrMessage.channelId || interactionOrMessage.channel?.id;
  if (channelId) {
    const now = Date.now();
    const lastSent = lastPriceListSent.get(`banggia_${channelId}`) || 0;
    if (now - lastSent < 3000) {
      if (interactionOrMessage.isChatInputCommand?.()) {
        return await interactionOrMessage
          .reply({
            content: "⏳ Bảng giá vừa được gửi trong kênh này rồi nhé!",
            ephemeral: true,
          })
          .catch(() => {});
      }
      return;
    }
    lastPriceListSent.set(`banggia_${channelId}`, now);
  }

  const mainData = messages.mainPriceList;
  const mainEmbed = new EmbedBuilder()
    .setTitle(mainData.title)
    .setDescription(mainData.description)
    .setColor(mainData.color)
    .setThumbnail(branding.logo)
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

  const payload = {
    embeds: [mainEmbed],
    components: [row],
    files: branding.collectFiles("logo", "banner"),
  };

  if (interactionOrMessage.isChatInputCommand?.()) {
    await interactionOrMessage.reply(payload);
  } else {
    await interactionOrMessage.channel.send(payload);
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
  if (!message || !message.id) return;

  // 1. Chống xử lý trùng lặp theo ID tin nhắn (Debounce in-memory)
  if (processedLegitMessageIds.has(message.id)) {
    return;
  }
  processedLegitMessageIds.add(message.id);
  if (processedLegitMessageIds.size > 200) {
    const firstId = processedLegitMessageIds.values().next().value;
    processedLegitMessageIds.delete(firstId);
  }

  const guildId = message.guild.id;
  if (!guildSettings[guildId]) {
    guildSettings[guildId] = { legitChannelId: message.channel.id };
  }
  const settings = guildSettings[guildId];

  // Nếu tin nhắn này đã được xử lý lưu vào settings, bỏ qua
  if (settings.lastProcessedLegitMsgId === message.id) {
    return;
  }
  settings.lastProcessedLegitMsgId = message.id;

  try {
    // 2. Xóa embed legit cũ để kênh luôn sạch sẽ
    if (settings.lastLegitEmbedId) {
      const oldMessage = await message.channel.messages
        .fetch(settings.lastLegitEmbedId)
        .catch(() => null);
      if (oldMessage) {
        await oldMessage.delete().catch(() => {});
      }
    }

    // 3. Thả từng reaction emoji riêng rẽ
    for (const reaction of messages.legitCheck.reactions) {
      await message.react(reaction).catch(() => {});
    }

    // 4. Tăng bộ đếm đơn hàng legit
    settings.legitCount = (settings.legitCount || 0) + 1;

    // 5. Tạo embed cảm ơn với tên sản phẩm thực tế và số thứ tự đơn
    const embedData = messages.legitCheck.embed;
    const embed = new EmbedBuilder()
      .setTitle(embedData.title)
      .setDescription(
        embedData.description(message.content, settings.legitCount),
      )
      .setColor(embedData.color)
      .setImage(embedData.gifUrl)
      .setThumbnail(branding.logo)
      .setTimestamp();

    const newEmbedMessage = await message.channel.send({
      embeds: [embed],
      files: branding.collectFiles("logo", "legit"),
    });

    settings.lastLegitEmbedId = newEmbedMessage.id;
    saveSettings();
  } catch (error) {
    console.error("❌ Lỗi khi xử lý tin nhắn legit:", error);
  }
}

// ─── Welcome cư dân mới (thay thế bot welcome riêng) ───────────────────────

const DEFAULT_WELCOME_MESSAGE =
  "Chào mừng {user} đã đến với **{server}**! 🎉\n" +
  "Bạn chính thức là cư dân thứ **{memberCount}** của chúng mình.\n\n" +
  "> 🛒 Xem **Bảng Giá**: dùng lệnh `/banggia`\n" +
  "> 🎫 Mua hàng / cần hỗ trợ: tạo **Ticket** tại kênh Ticket-Mua-Hàng\n" +
  "> 💬 Đừng ngại chào hỏi mọi người để được giúp đỡ nhanh nhất nhé!";

function formatWelcomeMessage(template, member) {
  return String(template)
    .replaceAll("{user}", `${member.user}`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{memberCount}", String(member.guild.memberCount));
}

function buildWelcomePayload(member, welcome) {
  const embed = new EmbedBuilder()
    .setColor("#ff6fae")
    .setTitle("🎉 CƯ DÂN MỚI ĐÃ XUẤT HIỆN!")
    .setDescription(
      formatWelcomeMessage(welcome?.message || DEFAULT_WELCOME_MESSAGE, member),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: `${member.guild.name} • Cư dân thứ ${member.guild.memberCount}`,
      iconURL: branding.logo,
    })
    .setTimestamp();
  return {
    content: `${member.user}`,
    embeds: [embed],
    files: branding.collectFiles("logo"),
  };
}

// Khi bot sẵn sàng
client.once("ready", async () => {
  loadSettings();
  console.log(`🚀 Bot đã online thành công: ${client.user.tag}`);

  // Tự đồng bộ slash command cho MỌI server bot đang ở — từ giờ muốn đổi tên,
  // thêm hay bớt lệnh chỉ cần restart bot, không cần chạy "npm run deploy".
  for (const guild of client.guilds.cache.values()) {
    await client.application.commands
      .set(commands, guild.id)
      .then(() =>
        console.log(`✅ Đã đồng bộ ${commands.length} slash command cho server ${guild.name}`),
      )
      .catch((err) =>
        console.error(`❌ Đồng bộ slash command thất bại ở ${guild.name}:`, err),
      );
  }

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

      // Lệnh sửa giá trực tiếp (Admin / Owner) — thay cho set-price cũ.
      // Chọn nhóm → chọn sản phẩm → nhập giá, không cần nhớ mã hay số dòng.
      if (commandName === "setgia") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }
        return await interaction.reply(
          buildSetgiaCategoryMenu(interaction.user.id),
        );
      }

      if (commandName === "announce") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }
        const channel = interaction.options.getChannel("channel");
        const title = interaction.options.getString("title");
        const content = interaction.options.getString("content");
        const imageUrl = interaction.options.getString("image_url");
        const pingEveryone = interaction.options.getBoolean("ping_everyone") || false;
        const colors = {
          pink: "#ff6fae",
          blue: "#008cff",
          red: "#ed4245",
          yellow: "#f0b232",
          purple: "#9b59b6",
        };
        const color = colors[interaction.options.getString("color")] || colors.blue;
        if (!channel?.isTextBased()) {
          return await interaction.reply({ content: "❌ Kênh này không thể nhận thông báo.", ephemeral: true });
        }
        if (imageUrl) {
          try {
            const image = new URL(imageUrl);
            if (!/^https?:$/.test(image.protocol)) throw new Error("protocol");
          } catch {
            return await interaction.reply({ content: "❌ Link banner phải bắt đầu bằng http:// hoặc https://", ephemeral: true });
          }
        }
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(content)
          .setThumbnail(branding.logo)
          .setFooter({ text: `Shark Store • Thông báo bởi ${interaction.user.username}` })
          .setTimestamp();
        if (imageUrl) embed.setImage(imageUrl);
        await channel.send({
          content: pingEveryone ? "@everyone" : undefined,
          embeds: [embed],
          allowedMentions: { parse: pingEveryone ? ["everyone"] : [] },
        });
        return await interaction.reply({
          content: `✅ Đã gửi thông báo vào ${channel}${pingEveryone ? " và tag @everyone" : ""}.`,
          ephemeral: true,
        });
      }

      if (commandName === "announce-template") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }
        const channel = interaction.options.getChannel("channel");
        const template = interaction.options.getString("template");
        const pingEveryone = interaction.options.getBoolean("ping_everyone") || false;
        if (!channel?.isTextBased()) {
          return await interaction.reply({ content: "❌ Kênh này không thể nhận thông báo.", ephemeral: true });
        }
        const templates = {
          sale: {
            color: "#ff6fae",
            title: "🔥 FLASH SALE • SHARK STORE",
            description: "Ưu đãi đang diễn ra! Nhanh tay tạo ticket để được hỗ trợ và nhận giá tốt nhất nhé. 🦈",
          },
          maintenance: {
            color: "#f0b232",
            title: "🔧 THÔNG BÁO BẢO TRÌ",
            description: "Shark Store đang bảo trì trong thời gian ngắn để cải thiện trải nghiệm. Một số phản hồi có thể chậm hơn bình thường — cảm ơn bạn đã chờ đợi!",
          },
          restock: {
            color: "#00b894",
            title: "📦 RESTOCK • HÀNG ĐÃ VỀ",
            description: "Sản phẩm đã được bổ sung! Xem bảng giá hoặc tạo ticket ngay để được hỗ trợ nhanh nhất. 🦈",
          },
        };
        const data = templates[template];
        const embed = new EmbedBuilder()
          .setColor(data.color)
          .setTitle(data.title)
          .setDescription(data.description)
          .setThumbnail(branding.logo)
          .setFooter({ text: "Shark Store • Cảm ơn bạn đã ủng hộ" })
          .setTimestamp();
        await channel.send({
          content: pingEveryone ? "@everyone" : undefined,
          embeds: [embed],
          allowedMentions: { parse: pingEveryone ? ["everyone"] : [] },
        });
        return await interaction.reply({
          content: `✅ Đã gửi mẫu **${template}** vào ${channel}${pingEveryone ? " và tag @everyone" : ""}.`,
          ephemeral: true,
        });
      }

      // Lệnh cài đặt Welcome cư dân mới (Admin / Owner)
      if (commandName === "setup-welcome") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }

        const guildId = interaction.guild.id;
        if (!guildSettings[guildId]) guildSettings[guildId] = {};
        const settings = guildSettings[guildId];

        if (interaction.options.getBoolean("tat")) {
          delete settings.welcome;
          saveSettings();
          return await interaction.reply({
            content: "✅ Đã TẮT welcome cư dân mới. Bot sẽ không gửi tin chào mừng nữa.",
            ephemeral: true,
          });
        }

        const channel = interaction.options.getChannel("channel");
        const role = interaction.options.getRole("role");
        const customMsg = interaction.options.getString("loi_chao");

        if (channel && !channel.isTextBased()) {
          return await interaction.reply({ content: "❌ Kênh này không thể gửi welcome.", ephemeral: true });
        }

        if (!channel && !role && !customMsg) {
          return await interaction.reply({
            content: "⚠️ Bạn cần chọn ít nhất 1 mục: kênh chào mừng `channel` hoặc role tự cấp `role`.",
            ephemeral: true,
          });
        }

        if (role) {
          if (!settings.autoRoleIds) settings.autoRoleIds = [];
          if (!settings.autoRoleIds.includes(role.id)) settings.autoRoleIds.push(role.id);
          settings.autoRoleId = role.id;
        }

        if (!settings.welcome) settings.welcome = {};
        if (channel) settings.welcome.channelId = channel.id;
        if (customMsg) settings.welcome.message = customMsg;
        if (role) settings.welcome.roleId = role.id;
        saveSettings();

        // Gửi tin nhắn mẫu nếu có kênh
        if (channel) {
          try {
            await channel.send(buildWelcomePayload(interaction.member, settings.welcome));
          } catch (err) {
            console.error("Không thể gửi welcome mẫu:", err);
          }
        }

        return await interaction.reply({
          content:
            `✅ Đã cập nhật **Welcome & Auto-Role**!\n` +
            (channel ? `• Kênh chào mừng: ${channel}\n` : "• Kênh chào mừng: Chưa chọn (không gửi tin chào)\n") +
            (role ? `• Auto-role khi vào server: ${role}\n` : "") +
            (settings.welcome?.message ? `• Lời chào tùy chỉnh: đã lưu\n` : "• Dùng lời chào mặc định của bot\n") +
            `\n💡 Trong lời chào có thể dùng: \`{user}\` (tag), \`{username}\`, \`{server}\`, \`{memberCount}\`.`,
          ephemeral: true,
        });
      }

      // Lệnh cài đặt Auto-Role (Admin / Owner)
      if (commandName === "setup-autorole" || commandName === "autorole") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }

        const guildId = interaction.guild.id;
        if (!guildSettings[guildId]) guildSettings[guildId] = {};
        const settings = guildSettings[guildId];

        // 1. Tắt Auto-Role
        if (interaction.options.getBoolean?.("tat")) {
          delete settings.autoRoleIds;
          delete settings.autoRoleId;
          saveSettings();
          return await interaction.reply({
            content: "✅ Đã **TẮT** tính năng Auto-Role. Người mới tham gia server sẽ không được tự động cấp role nữa.",
            ephemeral: true,
          });
        }

        const mainRole = interaction.options.getRole?.("role");
        const subRole = interaction.options.getRole?.("role_phu");

        // 2. Nếu không truyền role -> Hiển thị trạng thái hiện tại
        if (!mainRole && !subRole) {
          const currentRoleIds = settings.autoRoleIds || (settings.autoRoleId ? [settings.autoRoleId] : []);
          if (currentRoleIds.length === 0) {
            return await interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setTitle("⚙️ Cài Đặt Auto-Role (Tự Động Cấp Role)")
                  .setColor("#00bfff")
                  .setDescription(
                    `Hiện tại server **chưa cài đặt** role tự động cho người mới tham gia!\n\n` +
                    `👉 **Cách cài đặt:**\n` +
                    `• Dùng lệnh \`/setup-autorole role:@TênRole\` để chọn role cần cấp.\n` +
                    `• Có thể thêm \`role_phu:@Role2\` nếu muốn cấp cùng lúc 2 role.\n\n` +
                    `⚠️ **Lưu ý quan trọng:**\n` +
                    `Vào **Cài đặt máy chủ > Vai trò** và kéo Role của Bot (Shark Store) lên **cao hơn** role bạn muốn cấp thì bot mới có quyền phát role nhé!`
                  )
                  .setThumbnail(branding.logo)
              ],
              ephemeral: true,
            });
          }

          const roleMentions = currentRoleIds
            .map((id) => interaction.guild.roles.cache.get(id))
            .filter(Boolean)
            .map((r) => `${r}`)
            .join(", ");

          return await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("⚙️ Trạng Thái Auto-Role Hiện Tại")
                .setColor("#00FF99")
                .setDescription(
                  `✅ **Auto-Role đang BẬT!**\n\n` +
                  `• Các role sẽ tự cấp cho người mới: ${roleMentions || "Không tìm thấy role trên server"}\n\n` +
                  `💡 Dùng \`/setup-autorole role:@RoleMới\` để đổi role, hoặc \`/setup-autorole tat:True\` để tắt.`
                )
                .setThumbnail(branding.logo)
            ],
            ephemeral: true,
          });
        }

        // 3. Cài đặt Role mới
        const newRoleIds = [];
        if (mainRole) newRoleIds.push(mainRole.id);
        if (subRole && subRole.id !== mainRole?.id) newRoleIds.push(subRole.id);

        settings.autoRoleIds = newRoleIds;
        settings.autoRoleId = mainRole.id;
        saveSettings();

        // Kiểm tra quyền và thứ tự role của bot
        const me = interaction.guild.members.me || (await interaction.guild.members.fetchMe().catch(() => null));
        const hasManageRoles = me?.permissions.has(PermissionFlagsBits.ManageRoles);
        let warningText = "";

        if (!hasManageRoles) {
          warningText += `\n\n⚠️ **Cảnh báo:** Bot hiện **thiếu quyền "Quản lý vai trò" (Manage Roles)**! Vui lòng vào Cài đặt máy chủ > Vai trò và cấp quyền cho bot.`;
        }

        const rolesExceeding = newRoleIds
          .map((id) => interaction.guild.roles.cache.get(id))
          .filter(Boolean)
          .filter((r) => me.roles.highest.comparePositionTo(r) <= 0);

        if (rolesExceeding.length > 0) {
          warningText += `\n\n⚠️ **Lưu ý quan trọng về thứ bậc vai trò:**\n` +
            `Role của Bot (**${me.roles.highest.name}**) đang nằm **thấp hơn hoặc ngang bằng** role ${rolesExceeding.map((r) => `\`${r.name}\``).join(", ")}!\n` +
            `👉 Hãy vào **Cài đặt máy chủ > Vai trò** và **kéo Role của Bot lên trên cùng** (hoặc trên role cần cấp) thì bot mới phát role được nhé!`;
        }

        const roleDisplay = newRoleIds.map((id) => `<@&${id}>`).join(" + ");
        return await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Thiết Lập Auto-Role Thành Công!")
              .setColor("#00FF99")
              .setDescription(
                `Kể từ bây giờ, bất kỳ ai vừa tham gia server sẽ được bot tự động cấp role: **${roleDisplay}**! 🎉` +
                warningText
              )
              .setThumbnail(branding.logo)
              .setTimestamp()
          ],
          ephemeral: true,
        });
      }

      // Lệnh cài đặt kênh lưu transcript ticket (Admin / Owner)
      if (commandName === "setup-log") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này.", ephemeral: true });
        }
        const channel = interaction.options.getChannel("channel");
        if (!channel?.isTextBased()) {
          return await interaction.reply({ content: "❌ Kênh này không thể nhận log.", ephemeral: true });
        }
        if (!guildSettings[interaction.guild.id]) guildSettings[interaction.guild.id] = {};
        guildSettings[interaction.guild.id].transcriptChannelId = channel.id;
        saveSettings();
        return await interaction.reply({
          content: `✅ Đã đặt ${channel} làm kênh lưu transcript. Mỗi ticket khi đóng/xoá sẽ được lưu lại thành file .txt tại đây.`,
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
          .setThumbnail(branding.logo)
          .setDescription(
            `
<a:kingscrown:1116681967505784862> Chào mừng bạn đã đến với **Shark Store**! 🦈

Để mở khóa các kênh **Bảng Giá**, **Mua Hàng / Ticket** và **Giao Lưu**, vui lòng nhấn vào nút bên dưới để xác minh tài khoản của bạn.

> ⚠️ *Việc xác minh giúp bảo vệ cộng đồng và ngăn chặn tài khoản spam/clone.*
`,
          )
          .setImage(
            branding.banner,
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
          files: branding.collectFiles("logo", "banner"),
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
            branding.banner,
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
          files: branding.collectFiles("banner"),
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

          const sentMessage = await channel.send({
            embeds: [sampleEmbed],
            files: branding.collectFiles("legit"),
          });
          guildSettings[guildId].lastLegitEmbedId = sentMessage.id;
          saveSettings();
        } catch (err) {
          console.error(`Không thể gửi tin nhắn mẫu vào ${channel.name}:`, err);
        }
      }

      // Lệnh thông báo bảng giá Tạo Bot Discord mới (Admin / Owner)
      if (commandName === "thongbao-banggia") {
        if (!isAdmin && !isOwner) {
          return await interaction.reply({
            content: "❌ Bạn không có quyền sử dụng lệnh này.",
            ephemeral: true,
          });
        }

        const targetChannel =
          interaction.options.getChannel("channel") ||
          interaction.guild.channels.cache.find(
            (c) => c.name.includes("thông-báo") || c.name.includes("thong-bao"),
          ) ||
          interaction.channel;

        const now = Date.now();
        const lastSent = lastPriceListSent.get(`thongbao_${targetChannel.id}`) || 0;
        if (now - lastSent < 5000) {
          return await interaction.reply({
            content: "⏳ Thông báo bảng giá vừa được gửi vào kênh này cách đây vài giây!",
            ephemeral: true,
          });
        }
        lastPriceListSent.set(`thongbao_${targetChannel.id}`, now);

        const pingRole = interaction.options.getRole("ping");

        const announceEmbed = new EmbedBuilder()
          .setTitle("🤖 CHÍNH THỨC RA MẮT: DỊCH VỤ TẠO & CHO THUÊ BOT DISCORD CHUYÊN NGHIỆP")
          .setColor("#00FF99")
          .setThumbnail(branding.logo)
          .setDescription(
            `
<a:kingscrown:1116681967505784862> **Chào mừng toàn thể quý khách hàng đến với Shark Store!**

Nhằm hỗ trợ các shop quản lý server, bán hàng tự động và xây dựng cộng đồng uy tín, **Shark Store** trân trọng ra mắt dịch vụ **LÀM & CHO THUÊ BOT DISCORD** chuẩn 5 sao với chi phí cực kỳ tối ưu!
`,
          )
          .addFields(
            {
              name: "════════ 👑 GÓI SETUP TRỌN GÓI (VĨNH VIỄN) ════════",
              value: "*(Mua 1 lần sở hữu bot hoàn chỉnh vĩnh viễn, kèm hỗ trợ tận tâm)*",
              inline: false,
            },
            {
              name: "🔰 GÓI STARTER — 200.000đ",
              value:
                "```• Cài bot trực tiếp vào server sẵn có của khách\n• Bảng giá tương tác + Ticket + VietQR cơ bản\n• Hỗ trợ setup hoàn thiện 1 lần```",
              inline: false,
            },
            {
              name: "⭐ GÓI STANDARD — 500.000đ  [KHUYÊN DÙNG]",
              value:
                "```• Bao gồm tất cả tính năng gói Starter\n• + Hệ thống Legit / Review tự động đếm đơn uy tín\n• + Log lưu trữ đơn hàng & ticket an toàn\n• + Tùy chỉnh màu sắc, logo & tên shop độc quyền\n• + Hỗ trợ kỹ thuật & bảo hành 30 ngày```",
              inline: false,
            },
            {
              name: "💎 GÓI PREMIUM — 1.000.000đ  [FULL OPTION]",
              value:
                "```• Bao gồm tất cả tính năng gói Standard\n• + Dashboard Web quản lý bot trực quan\n• + Thống kê doanh thu & báo cáo tự động\n• + Custom branding nhận diện thương hiệu 100%\n• + Hỗ trợ kỹ thuật & đồng hành 3 tháng```",
              inline: false,
            },
            {
              name: "════════ 🔄 GÓI THUÊ BOT THEO THÁNG ════════",
              value: "*(Giải pháp chạy 24/24 trên Cloud, không cần treo máy tính cá nhân)*",
              inline: false,
            },
            {
              name: "🔰 GÓI BASIC — 99.000đ / tháng",
              value:
                "```• Hoạt động trên 1 server\n• Bảng giá tương tác + Ticket + VietQR tự động```",
              inline: false,
            },
            {
              name: "⭐ GÓI PRO — 199.000đ / tháng",
              value:
                "```• Bao gồm tất cả tính năng Basic\n• + Legit tự động + Log đơn + Thống kê shop```",
              inline: false,
            },
            {
              name: "💎 GÓI VIP — 399.000đ / tháng",
              value:
                "```• Bao gồm tất cả tính năng Pro\n• + Dashboard Web quản trị\n• + Hỗ trợ kỹ thuật ưu tiên 24/7```",
              inline: false,
            },
          )
          .setImage(
            branding.banner,
          )
          .setFooter({
            text: "Shark Store • Tự động hóa - Uy tín - Bảo hành dài hạn",
            iconURL: branding.logo,
          })
          .setTimestamp();

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("buy_ticket")
            .setLabel("Đặt Làm Bot Ngay")
            .setEmoji("🤖")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("support_ticket")
            .setLabel("Tư Vấn Miễn Phí")
            .setEmoji("💬")
            .setStyle(ButtonStyle.Secondary),
        );

        const content = pingRole ? `${pingRole}` : null;

        await targetChannel.send({
          content: content,
          embeds: [announceEmbed],
          components: [actionRow],
          files: branding.collectFiles("logo", "banner"),
        });

        return await interaction.reply({
          content: `✅ Đã gửi bảng thông báo dịch vụ Tạo Bot Discord vào kênh ${targetChannel}!`,
          ephemeral: true,
        });
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
        const isOwner = interaction.user.id === config.OWNER_ID;
        const isStaff =
          interaction.member?.roles?.cache.has(config.STAFF_ROLE_ID) ||
          interaction.member?.permissions.has(PermissionFlagsBits.Administrator);
        const ticketRecord =
          guildSettings[interaction.guild.id]?.tickets?.[interaction.channel.id];
        const isOpener = ticketRecord && ticketRecord.userId === interaction.user.id;

        // Ticket cũ trước khi có ghi nhận sẽ không có bản ghi, giữ hành vi cũ.
        if (ticketRecord && !isOpener && !isStaff && !isOwner) {
          return await interaction.reply({
            content: "❌ Chỉ khách mở ticket hoặc nhân viên mới có thể đóng ticket!",
            ephemeral: true,
          });
        }

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
        .setThumbnail(branding.logo)
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
        files: branding.collectFiles("logo"),
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
            files: branding.collectFiles("banner"),
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
    saveSettingsSoon();
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
      if (processedLegitMessageIds.has(message.id)) return;
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

// Chào mừng cư dân mới + Tự động cấp role (Auto-Role)
client.on("guildMemberAdd", async (member) => {
  try {
    const guild = member.guild;
    const settings = guildSettings[guild.id] || {};
    const welcome = settings.welcome;

    // 1. Tự động cấp role cho người mới vào server (Auto-Role)
    const targetRoleIds = [];
    if (Array.isArray(settings.autoRoleIds) && settings.autoRoleIds.length > 0) {
      targetRoleIds.push(...settings.autoRoleIds);
    } else if (settings.autoRoleId) {
      targetRoleIds.push(settings.autoRoleId);
    } else if (welcome?.roleId) {
      targetRoleIds.push(welcome.roleId);
    }

    // Fallback thông minh: nếu chưa cài đặt bằng lệnh, tự tìm role "Khách Hàng" hoặc "Thành Viên" & "IN4"
    if (targetRoleIds.length === 0) {
      const defaultRole = guild.roles.cache.find(
        (r) =>
          r.name.toLowerCase() === "khách hàng" ||
          r.name.toLowerCase() === "khach hang" ||
          r.name.toLowerCase() === "thành viên" ||
          r.name.toLowerCase() === "thanh vien",
      );
      if (defaultRole) targetRoleIds.push(defaultRole.id);

      const in4Role = guild.roles.cache.find(
        (r) =>
          r.name.includes("𝐈𝐍𝟒") ||
          r.name.toLowerCase().includes("in4"),
      );
      if (in4Role && (!defaultRole || in4Role.id !== defaultRole.id)) {
        targetRoleIds.push(in4Role.id);
      }
    }

    if (targetRoleIds.length > 0) {
      try {
        const me =
          guild.members.me ||
          (await guild.members.fetchMe().catch(() => null));

        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          console.warn(
            `⚠️ [AUTO-ROLE] Bot thiếu quyền ManageRoles (Quản lý vai trò) trên server ${guild.name}`,
          );
        } else {
          const rolesToApply = [];
          for (const roleId of targetRoleIds) {
            const role =
              guild.roles.cache.get(roleId) ||
              (await guild.roles.fetch(roleId).catch(() => null));
            if (!role) continue;

            // Kiểm tra thứ bậc role (role cao nhất của Bot phải đứng trên role muốn cấp)
            if (me.roles.highest.comparePositionTo(role) <= 0) {
              console.warn(
                `⚠️ [AUTO-ROLE] Không thể cấp "${role.name}": Role cao nhất của Bot (${me.roles.highest.name}) thấp hơn hoặc ngang bằng "${role.name}". Cần kéo role Bot lên trên trong Server Settings > Roles!`,
              );
              continue;
            }
            rolesToApply.push(role);
          }

          if (rolesToApply.length > 0) {
            await member.roles.add(
              rolesToApply,
              "Auto-Role: Tự động cấp role cho người chơi/thành viên mới tham gia",
            );
            console.log(
              `✅ [AUTO-ROLE] Đã tự động cấp [${rolesToApply.map((r) => r.name).join(", ")}] cho người mới: ${member.user.tag}`,
            );
          }
        }
      } catch (err) {
        console.error(`❌ [AUTO-ROLE] Lỗi khi cấp role cho ${member.user.tag}:`, err);
      }
    }

    // 2. Không chào mừng bot (bot khác vào server)
    if (member.user.bot || !welcome?.channelId) return;

    const channel =
      guild.channels.cache.get(welcome.channelId) ||
      (await client.channels.fetch(welcome.channelId).catch(() => null));
    if (!channel?.isTextBased()) return;

    await channel.send(buildWelcomePayload(member, welcome));
  } catch (error) {
    console.error("❌ Lỗi khi chào mừng / auto-role thành viên mới:", error);
  }
});

// Web server mini để Render nhận diện port và kiểm tra sức khỏe (Health check)
const http = require("http");
const PORT = process.env.PORT || 10000;

// Lỗi nhỏ ở web server không được phép sập cả bot, nên bọc lại toàn bộ handler.
const server = http.createServer((req, res) => {
  try {
    handleWebRequest(req, res);
  } catch (error) {
    console.error("❌ Lỗi web server:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  }
});

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function handleWebRequest(req, res) {
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
}

// Không để lỗi bất kỳ đâu (promise, sự kiện Discord) làm bot ngủm im lặng.
client.on("error", (error) => console.error("❌ [DISCORD] Lỗi client:", error));
client.on("shardError", (error) =>
  console.error("❌ [DISCORD] Lỗi kết nối shard:", error),
);
process.on("unhandledRejection", (reason) =>
  console.error("❌ [UNHANDLED REJECTION]:", reason),
);
process.on("uncaughtException", (error) =>
  console.error("❌ [UNCAUGHT EXCEPTION]:", error),
);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server giữ kết nối đang chạy tại 0.0.0.0:${PORT}`);
});

// Khởi chạy bot Discord
client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error(
    "❌ Không thể đăng nhập bot. Vui lòng kiểm tra lại DISCORD_TOKEN:",
    err,
  );
  if (String(err?.message || "").toLowerCase().includes("disallowed intents")) {
    console.error(
      "👉 Bạn chưa bật privileged intent trên Discord Developer Portal:\n" +
        "   1. Vào https://discord.com/developers/applications → chọn app của bot\n" +
        "   2. Mục Bot → bật 'SERVER MEMBERS INTENT' (cần cho tính năng Welcome)\n" +
        "   3. Bấm Save Changes rồi chạy lại bot.",
    );
  }
});
