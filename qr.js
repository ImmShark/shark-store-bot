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
        "https://media.discordapp.net/attachments/1160008472893603871/1512106856594669679/logo.gif?ex=6a238b80&is=6a223a00&hm=71cf0d3bb9c37b681ecba2fe634b865789bcef8195cd6206bc7568d934fcd0cd&=&width=623&height=533",
      ) // logo nhỏ
      .setImage(
        "https://media.discordapp.net/attachments/1161326028682170489/1512350783511855144/635002420_2099748023930273_8969084125919827184_n.jpg?ex=6a23c5ec&is=6a22746c&hm=53d4547240c6cbff44df18fdca6fb5c5dafd24a2de80745169a068166c05c768&=&format=webp&width=930&height=930",
      ) // QR code
      .addFields(
        {
          name: "<:3339shinystar2:1512142205094068367> Ngân Hàng:",
          value: "```MB BANK```",
          inline: true,
        },
        {
          name: "<:1661shinystar6:1512141829758386226> Số Tài Khoản:",
          value: "```0328206839```",
          inline: true,
        },
        {
          name: "<:3629shinystar4:1512142399932076223> Chủ Tài Khoản:",
          value: "```LE HOANG VU```",
          inline: true,
        },
        {
          name: "<:8819shinystar3:1512142936287088791> Nội Dung:",
          value: "```SHARKSTORE```",
          inline: true,
        },
      )
      .setFooter({
        text: "***VUI LÒNG GỬI BILL VÀO TICKET KHI ĐÃ CHUYỂN KHOẢN***",
      });
    await interaction.reply({ embeds: [embed] });
  },
};
