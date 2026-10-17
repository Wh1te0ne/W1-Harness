/** W1 has local usage accounting and no official account-wallet feature. */
export function withoutOfficialBalance(config) {
  return { ...config, hideOfficialBalance: true, balance: { ...config.balance, display: 'off', reconcile: false } }
}
