const config = require("./config.js");

/**
 * Sinh link ảnh mã VietQR tự động điền số tiền và nội dung chuyển khoản
 * @param {Object} params
 * @param {string} [params.bankId] Mã ngân hàng (mặc định MB)
 * @param {string} [params.accountNo] Số tài khoản
 * @param {string} [params.accountName] Tên chủ tài khoản
 * @param {number|string} [params.amount] Số tiền cần thanh toán
 * @param {string} [params.memo] Nội dung chuyển khoản
 * @param {string} [params.template] Giao diện QR ('compact2', 'compact', 'qr_only', 'print')
 * @returns {string} URL ảnh VietQR
 */
function generateVietQR({
  bankId = config.BANK_INFO.bankId,
  accountNo = config.BANK_INFO.accountNo,
  accountName = config.BANK_INFO.accountName,
  amount = null,
  memo = config.BANK_INFO.defaultMemo,
  template = "compact2",
} = {}) {
  const queryParams = new URLSearchParams();

  if (accountName) {
    queryParams.append("accountName", accountName);
  }
  if (amount && Number(amount) > 0) {
    queryParams.append("amount", Math.round(Number(amount)));
  }
  if (memo) {
    queryParams.append("addInfo", memo);
  }

  const queryStr = queryParams.toString();
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png${queryStr ? `?${queryStr}` : ""}`;
}

module.exports = {
  generateVietQR,
};
