import qrcode from 'qrcode-generator';
export function pairingQr(value) { const qr = qrcode(0, 'M'); qr.addData(value); qr.make(); return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }); }
