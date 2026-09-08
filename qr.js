const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config.js");
const { generateVietQR } = require("./vietqr.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("qr")
    .setDescription("Hiển thị thông tin chuyển khoản + mã VietQR động")
    .addIntegerOption((option) =>
      option
        .setName("sotien")
        .setDescription("Số tiền cần chuyển (VND) - Tùy chọn")
        .setRequired(false)
        .setMinValue(1000),
    )
    .addStringOption((option) =>
      option
        .setName("noidung")
        .setDescription("Nội dung chuyển khoản - Tùy chọn")
        .setRequired(false)
        .setMaxLength(50),
    ),

  async execute(interaction) {
    const amount = interaction.options?.getInteger("sotien") || null;
    const memo =
      interaction.options?.getString("noidung") ||
      config.BANK_INFO.defaultMemo;

    const qrImageUrl = generateVietQR({
      amount: amount,
      memo: memo,
    });

    const formattedAmount = amount
      ? `${Number(amount).toLocaleString("vi-VN")} VNĐ`
      : "Tuỳ chọn theo đơn hàng";

    const embed = new EmbedBuilder()
      .setTitle("<a:294064purplepaw:1515288184223825942> THÔNG TIN CHUYỂN KHOẢN")
      .setColor("#008cff")
      .setThumbnail(config.BANK_INFO.logoUrl)
      .setDescription(
        `
<a:39411brownbow:1515288160727339028> **Ngân Hàng**
\`\`\`
${config.BANK_INFO.bankName}
\`\`\`

<:3339shinystar2:1512142205094068367> **Số Tài Khoản**
\`\`\`
${config.BANK_INFO.accountNo}
\`\`\`

<:1661shinystar6:1512141829758386226> **Chủ Tài Khoản**
\`\`\`
${config.BANK_INFO.accountName}
\`\`\`

<:3629shinystar4:1512142399932076223> **Nội Dung Chuyển Khoản**
\`\`\`
${memo}
\`\`\`

<a:4563paymentnitro:1407393939522322645> **Số Tiền**
\`\`\`
${formattedAmount}
\`\`\`
`,
      )
      .setImage(qrImageUrl)
      .setFooter({
        text: " Quét mã VietQR trên app ngân hàng để tự động điền tiền & nội dung",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
