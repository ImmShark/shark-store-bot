const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("qr")
    .setDescription("Hiển thị thông tin chuyển khoản + QR code"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("📌 THÔNG TIN CHUYỂN KHOẢN")
      .setColor("#00ff99")
      .setThumbnail(
        "https://media.discordapp.net/attachments/1160008472893603871/1407258499460763648/standard_4.gif?ex=68a5731b&is=68a4219b&hm=32814d35ada3ba9279d4e240db250249f50e684f3cf9e88a0381d1e669478117&=&width=320&height=320"
      ) // logo nhỏ
      .setImage(
        "https://media.discordapp.net/attachments/1160008472893603871/1407424725499773029/IMG_8991.jpg?ex=68a60deb&is=68a4bc6b&hm=e2127158e8704c50765e3daf8257e87faed48bff420849912ee01400e3c9ee0d&=&format=webp&width=770&height=930"
      ) // QR code
      .addFields(
        { name: "🏦 Ngân Hàng:", value: "MB BANK", inline: true },
        { name: "💳 Số Tài Khoản:", value: "`27110466668888`", inline: true },
        { name: "👤 Chủ Tài Khoản:", value: "LE HOANG VU", inline: true },
        { name: "📝 Nội Dung:", value: "`SHARKSTORE`", inline: true }
      )
      .setFooter({ text: "Quét QR để thanh toán nhanh chóng" });

    await interaction.reply({ embeds: [embed] });
  },
};
